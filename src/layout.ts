import type { TopFlows, TreeValue } from "./model";

export interface Ball { id: "grid" | "eco" | "battery" | "solar" | "home"; cx: number; cy: number; r: number }
/** depth 0 = barra de la casa. split: barra de reparto bajo un padre, de la que salen las corrientes de sus hijos. */
export interface Bar { id: string; x: number; y: number; w: number; h: number; depth: number; zero: boolean; split?: boolean }
/** d: área cerrada de la corriente; center: curva por su centro, para el brillo. */
export interface Band { id: string; parent: string; d: string; center: string; watts: number | null; zero: boolean }
export type TopLine = Exclude<keyof TopFlows, "gridNonFossil">;

export interface Layout {
  width: number;
  height: number;
  balls: Record<Ball["id"], Ball>;
  topLines: Record<TopLine, string>;
  /** Línea de bajas emisiones a la red. */
  ecoLine: string;
  bars: Bar[];
  bands: Band[];
  links: string[];
  forecastY: number;
}

const BASE = 400;
const MARGIN = 30;
/** Separación mínima entre centros de barras vecinas, para que no se pisen sus textos. */
const MIN_GAP = 52;
const MAX_GAP = 90;
const HOME_FRAC = 0.6;
const HOME_BAR = { y: 310, h: 6 };
const ROW_DROP = 96;
const BAR_H = 8;
const TEXT_H = 36;
const LINK = 18;
const SPLIT_H = 5;
const MIN_BAND = 2;

const f = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(2);

function bandPath(sx0: number, sx1: number, y0: number, tx0: number, tx1: number, y1: number): string {
  const m = (y0 + y1) / 2;
  return `M${f(sx0)},${f(y0)} C${f(sx0)},${f(m)} ${f(tx0)},${f(m)} ${f(tx0)},${f(y1)} L${f(tx1)},${f(y1)} ` +
    `C${f(tx1)},${f(m)} ${f(sx1)},${f(m)} ${f(sx1)},${f(y0)} Z`;
}

function centerPath(sx0: number, sx1: number, y0: number, tx0: number, tx1: number, y1: number): string {
  const a = (sx0 + sx1) / 2, b = (tx0 + tx1) / 2, m = (y0 + y1) / 2;
  return `M${f(a)},${f(y0)} C${f(a)},${f(m)} ${f(b)},${f(m)} ${f(b)},${f(y1)}`;
}

/** Bolitas de 80 px (r 40) como power-flow-card-plus: red arriba con bajas emisiones a su derecha, batería y solar abajo y la casa en medio. */
function topBlock(dx: number): { balls: Layout["balls"]; topLines: Layout["topLines"]; ecoLine: string } {
  const b = (id: Ball["id"], cx: number, cy: number, r: number): Ball => ({ id, cx: cx + dx, cy, r });
  const p = (s: string) => s.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(Number(x) + dx)} ${y}`);
  return {
    balls: { grid: b("grid", 200, 64, 40), eco: b("eco", 330, 64, 40), battery: b("battery", 70, 176, 40), solar: b("solar", 330, 176, 40), home: b("home", 200, 250, 40) },
    topLines: {
      solarToHome: p("M 290 176 L 240 176 Q 200 176 200 210"),
      solarToBattery: p("M 296 155 Q 200 120 104 155"),
      solarToGrid: p("M 312 140 C 300 112 270 84 238 76"),
      gridToHome: p("M 200 104 L 200 210"),
      gridToBattery: p("M 162 76 C 130 84 100 112 88 140"),
      batteryToHome: p("M 110 176 L 160 176 Q 200 176 200 210"),
      batteryToGrid: p("M 88 140 C 100 112 130 84 162 76"),
    },
    ecoLine: p("M 290 64 L 240 64"),
  };
}

interface Item { node: TreeValue; parent: string }

/** Filas del Sankey: la fila d tiene los hijos de los padres de la fila d − 1, seguidos y en el orden del árbol. */
function rows(tree: TreeValue): Item[][] {
  const out: Item[][] = [];
  let parents = [tree];
  while (parents.length) {
    const row = parents.flatMap((p) => p.children.map((node) => ({ node, parent: p.id })));
    if (!row.length) break;
    out.push(row);
    parents = row.map((i) => i.node).filter((n) => n.children.length);
  }
  return out;
}

/** Ancho aproximado del texto bajo una barra (nombre o valor, el más largo) con letra de 9,5 px. */
const CHAR_W = 5.3;
const labelW = (name: string) => Math.max(name.length, 7) * CHAR_W;

/** Una barra de la fila a efectos de colocación: ancho de su corriente y de su texto. */
interface Slot { w: number; l: number }

/** Separación que necesitan dos barras vecinas: textos sin pisarse y bordes separados. */
const need = (a: Slot, b: Slot) => Math.max(MIN_GAP, (a.w + b.w) / 2 + 6, (a.l + b.l) / 2 + 4);

/** Margen de un extremo de la fila: el general o lo que haga falta para que ni la barra ni su texto se salgan. */
const pad = (a: Slot) => Math.max(MARGIN, a.w / 2 + 4, a.l / 2 + 2);

/** Centros de una fila: cada par separado lo que necesita, más un extra repartido (hasta 38 px), con el grupo centrado entre los márgenes. */
function centers(slots: Slot[], width: number): number[] {
  const n = slots.length;
  if (n === 1) return [width / 2];
  const left = pad(slots[0]), right = pad(slots[n - 1]);
  const gaps = slots.slice(1).map((sl, i) => need(slots[i], sl));
  const slack = width - left - right - gaps.reduce((a, g) => a + g, 0);
  const extra = Math.max(0, Math.min(slack / (n - 1), MAX_GAP - MIN_GAP));
  const out = [0];
  gaps.forEach((g) => out.push(out[out.length - 1] + g + extra));
  const shift = left + (width - left - right) / 2 - out[n - 1] / 2;
  return out.map((x) => x + shift);
}

/** Anchos de las corrientes de un padre: proporcionales, con 2 px de mínimo; si no caben, encogen las que pasan del mínimo. */
function fit(widths: number[], room: number): number[] {
  const total = widths.reduce((a, w) => a + w, 0);
  if (total <= room || total === 0) return widths;
  const fixed = widths.filter((w) => w > 0 && w <= MIN_BAND).reduce((a, w) => a + w, 0);
  const big = total - fixed;
  if (room <= fixed || big === 0) return widths.map((w) => (w * room) / total);
  return widths.map((w) => (w > MIN_BAND ? (w * (room - fixed)) / big : w));
}

export function layoutCard(tree: TreeValue, width = BASE): Layout {
  const all = rows(tree);
  const homeW = BASE * HOME_FRAC;
  const px = tree.watts && tree.watts > 0 ? homeW / tree.watts : 0;

  // 1.ª pasada: anchos de cada corriente (no dependen de la posición).
  const widthOf = new Map<string, number>([["home", homeW]]);
  const rowWidths = all.map((row) => {
    const ws = row.map((i) => (i.node.watts && i.node.watts > 0 ? Math.max(MIN_BAND, i.node.watts * px) : 0));
    const byParent = new Map<string, number[]>();
    row.forEach((i, k) => byParent.set(i.parent, [...(byParent.get(i.parent) ?? []), k]));
    for (const [parent, ks] of byParent) {
      const fitted = fit(ks.map((k) => ws[k]), widthOf.get(parent) as number);
      ks.forEach((k, j) => (ws[k] = fitted[j]));
    }
    row.forEach((i, k) => widthOf.set(i.node.id, ws[k]));
    return ws;
  });

  // Ancho del dibujo: el que pida la fila más apretada.
  const rowSlots = all.map((row, r) => row.map((i, k): Slot => ({ w: rowWidths[r][k], l: labelW(i.node.name) })));
  const span = (sl: Slot[]) => sl.slice(1).reduce((a, x, i) => a + need(sl[i], x), 0);
  const W = Math.max(width, ...rowSlots.map((sl) => pad(sl[0]) + pad(sl[sl.length - 1]) + span(sl)));
  const dx = (W - BASE) / 2;
  const { balls, topLines, ecoLine } = topBlock(dx);

  const homeBar: Bar = { id: "home", x: W / 2 - homeW / 2, y: HOME_BAR.y, w: homeW, h: HOME_BAR.h, depth: 0, zero: !(tree.watts && tree.watts > 0) };
  const bars: Bar[] = [homeBar];
  const bands: Band[] = [];
  const links: string[] = [];
  /** Barra de la que salen las corrientes de cada padre. */
  const origins = new Map<string, Bar>([["home", homeBar]]);

  let originY = HOME_BAR.y + HOME_BAR.h;
  let destY = originY;
  all.forEach((row, r) => {
    destY = originY + ROW_DROP;
    const widths = rowWidths[r];
    const xs = centers(rowSlots[r], W);
    const byParent = new Map<string, number[]>();
    row.forEach((i, k) => byParent.set(i.parent, [...(byParent.get(i.parent) ?? []), k]));
    for (const [parent, ks] of byParent) {
      const origin = origins.get(parent) as Bar;
      let cursor = origin.x;
      for (const k of ks) {
        const { node } = row[k];
        const w = widths[k];
        const tx0 = xs[k] - w / 2;
        const zero = !(node.watts && node.watts > 0);
        bars.push({ id: node.id, x: tx0, y: destY, w, h: BAR_H, depth: r + 1, zero });
        bands.push({
          id: node.id, parent, watts: node.watts, zero,
          d: bandPath(cursor, cursor + w, originY, tx0, tx0 + w, destY),
          center: centerPath(cursor, cursor + w, originY, tx0, tx0 + w, destY),
        });
        cursor += w;
      }
    }
    // los padres de esta fila bajan, por debajo de su texto, a su barra de reparto
    const splitY = destY + BAR_H + TEXT_H + LINK;
    row.forEach((i, k) => {
      if (!i.node.children.length) return;
      const dest = bars.find((b) => b.id === i.node.id && !b.split) as Bar;
      const split: Bar = { ...dest, y: splitY, h: SPLIT_H, split: true };
      bars.push(split);
      origins.set(i.node.id, split);
      links.push(`M${f(xs[k])},${f(destY + BAR_H + TEXT_H)} L${f(xs[k])},${f(splitY)}`);
    });
    originY = splitY + SPLIT_H;
  });

  const forecastY = destY + BAR_H + TEXT_H + 10;
  return { width: W, height: forecastY + 60, balls, topLines, ecoLine, bars, bands, links, forecastY };
}
