import { svg, nothing, type TemplateResult } from "lit";
import { flowDuration, lineState } from "./flow";
import type { Layout } from "./layout";
import type { TopFlows, TopValues, TreeValue } from "./model";
import type { FlowSettings } from "./types";

export const COLORS = { grid: "#a280db", gridOut: "#c7a2ff", eco: "#0f9d58", battery: "#4db6ac", solar: "#ff9800", home: "#5c9ded", others: "#9e9e9e" };
/** Colores por defecto para los consumos que no fijan el suyo. */
const PALETTE = ["#a1887f", "#e57373", "#ffb74d", "#9575cd", "#81c784", "#64b5f6", "#f06292", "#4dd0e1", "#ffd54f", "#aed581"];

const num = (n: number, d = 1) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
/** «339 W» o «1,9 kW»; «—» sin dato. */
export const power = (w: number | null) => (w === null ? "—" : Math.abs(w) >= 1000 ? `${num(w / 1000)} kW` : `${Math.round(w)} W`);
/** Vatios sin unidad para los hijos (no caben). */
const bare = (w: number | null) => (w === null ? "—" : String(Math.round(w)));
export const kwh = (v: number | null) => (v === null ? "—" : `${num(v)} kWh`);

export interface Extras {
  solarSecondary: string | null;
  homeSecondary: string | null;
  entities: { grid: string; battery: string; solar: string; home: string; eco?: string };
}

export type Click = (entity?: string) => (e: Event) => void;

const LINE_COLOR: Record<keyof TopFlows, string> = {
  solarToHome: COLORS.solar, solarToBattery: COLORS.solar, solarToGrid: COLORS.solar,
  gridToHome: COLORS.grid, gridToBattery: COLORS.grid, batteryToHome: COLORS.battery, batteryToGrid: COLORS.battery,
};

function colorsOf(tree: TreeValue): Map<string, string> {
  const out = new Map<string, string>([["home", COLORS.home]]);
  let i = 0;
  const walk = (n: TreeValue) => n.children.forEach((c) => {
    out.set(c.id, c.kind === "others" || c.kind === "remainder" ? COLORS.others : c.color || PALETTE[i++ % PALETTE.length]);
    walk(c);
  });
  walk(tree);
  return out;
}

function nodes(tree: TreeValue): Map<string, TreeValue> {
  const out = new Map<string, TreeValue>();
  const walk = (n: TreeValue) => { out.set(n.id, n); n.children.forEach(walk); };
  walk(tree);
  return out;
}

export function renderSvg(l: Layout, tree: TreeValue, top: TopValues, flows: TopFlows, s: FlowSettings, x: Extras, click: Click): TemplateResult {
  const color = colorsOf(tree);
  const byId = nodes(tree);
  const b = l.balls;

  const topLine = (key: keyof TopFlows) => {
    const w = flows[key], st = lineState(w, s), d = l.topLines[key];
    return svg`<g data-line=${key}>
      <path d=${d} fill="none" stroke=${LINE_COLOR[key]} stroke-width="2" opacity=${st.opacity}></path>
      ${st.dots ? svg`<circle r="2.4" fill=${LINE_COLOR[key]}><animateMotion dur=${`${flowDuration(w, s).toFixed(2)}s`} repeatCount="indefinite" path=${d}></animateMotion></circle>` : nothing}
    </g>`;
  };

  const ball = (id: keyof Layout["balls"], stroke: string, lines: (string | TemplateResult)[], entity?: string) => {
    const p = b[id];
    const step = 12, y0 = p.cy - ((lines.length - 1) * step) / 2 + 4;
    return svg`<g data-ball=${id} class="hit" @click=${click(entity)}>
      <circle cx=${p.cx} cy=${p.cy} r=${p.r} fill="var(--card-background-color, #1c1c1c)" stroke=${stroke} stroke-width="2.2"></circle>
      ${lines.map((t, i) => svg`<text x=${p.cx} y=${y0 + i * step} text-anchor="middle" class=${i === 0 ? "sec" : "val"}>${t}</text>`)}
    </g>`;
  };

  const batt = top.charge > 0 ? `↓ ${power(top.charge)}` : top.discharge > 0 ? `↑ ${power(top.discharge)}` : power(0);
  const gradients = l.bands.map((band) => svg`<linearGradient id=${`g-${band.id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color=${color.get(band.parent)}></stop><stop offset="1" stop-color=${color.get(band.id)}></stop></linearGradient>`);

  const bands = l.bands.map((band) => {
    const st = lineState(band.watts, s);
    return svg`<g data-band=${band.id} opacity=${st.active ? 1 : st.opacity}>
      ${band.zero
        ? svg`<path d=${band.center} fill="none" stroke=${color.get(band.id)} stroke-width="1"></path>`
        : svg`<path d=${band.d} fill=${`url(#g-${band.id})`} opacity="0.55"></path>
             ${st.active ? svg`<path class="glow" d=${band.center} style=${`animation-duration: ${flowDuration(band.watts ?? 0, s).toFixed(2)}s`}></path>` : nothing}`}
    </g>`;
  });

  const bars = l.bars.filter((bar) => bar.depth > 0).map((bar) => {
    const c = color.get(bar.id);
    const w = Math.max(bar.w, 4);
    if (bar.split) return svg`<rect x=${bar.x} y=${bar.y} width=${w} height=${bar.h} rx="2.5" fill=${c}></rect>`;
    const n = byId.get(bar.id) as TreeValue;
    const cx = bar.x + bar.w / 2;
    const value = bar.depth === 1 ? power(n.watts) : bare(n.watts);
    const dim = bar.zero ? "dim" : "";
    return svg`<rect data-bar=${bar.id} class=${`hit ${dim}`} x=${cx - w / 2} y=${bar.y} width=${w} height=${bar.h} rx="2" fill=${c}
        opacity=${bar.zero ? 0.3 : 1} @click=${click(n.entity)}></rect>
      <text data-label=${bar.id} class=${`hit lbl ${dim}`} x=${cx} y=${bar.y + bar.h + 14} text-anchor="middle" @click=${click(n.entity)}>
        <tspan x=${cx}>${n.name}</tspan><tspan x=${cx} dy="12" class="val"> ${value}</tspan></text>`;
  });

  const home = l.bars[0];
  return svg`<svg class="flow" viewBox=${`0 0 ${l.width} ${l.forecastY}`} preserveAspectRatio="xMidYMin meet">
    <defs>${gradients}</defs>
    ${(Object.keys(l.topLines) as (keyof TopFlows)[]).map(topLine)}
    <path d=${`M${b.home.cx},${b.home.cy + b.home.r} L${b.home.cx},${home.y}`} stroke=${COLORS.home} stroke-width="2" fill="none"></path>
    ${l.links.map((d) => svg`<path d=${d} stroke="var(--divider-color, #555)" stroke-width="1.5" fill="none"></path>`)}
    ${bands}
    <rect x=${home.x} y=${home.y} width=${home.w} height=${home.h} rx="3" fill=${COLORS.home}></rect>
    ${bars}
    ${ball("grid", COLORS.grid, ["⚡", svg`<tspan fill=${COLORS.grid}>→ ${power(top.gridIn)}</tspan>`, svg`<tspan fill=${COLORS.gridOut}>← ${power(top.gridOut)}</tspan>`], x.entities.grid)}
    ${top.lowCarbon !== null ? ball("eco", COLORS.eco, ["🍃", `${Math.round(top.lowCarbon)} %`], x.entities.eco) : nothing}
    ${ball("battery", COLORS.battery, [`🔋 ${top.soc !== null ? `${Math.round(top.soc)} %` : "—"}`, batt], x.entities.battery)}
    ${ball("solar", COLORS.solar, [...(x.solarSecondary ? [x.solarSecondary] : []), "☀", power(top.solar)], x.entities.solar)}
    ${ball("home", COLORS.home, [...(x.homeSecondary ? [x.homeSecondary] : []), "🏠", power(tree.watts)], x.entities.home)}
  </svg>`;
}
