import { svg, nothing, type TemplateResult } from "lit";
import {
  mdiArrowDown, mdiArrowLeft, mdiArrowRight, mdiArrowUp, mdiBattery, mdiBattery10, mdiBattery20, mdiBattery30, mdiBattery40, mdiBattery50,
  mdiBattery60, mdiBattery70, mdiBattery80, mdiBattery90, mdiBatteryCharging10, mdiBatteryCharging20, mdiBatteryCharging30, mdiBatteryCharging40,
  mdiBatteryCharging50, mdiBatteryCharging60, mdiBatteryCharging70, mdiBatteryCharging80, mdiBatteryCharging90, mdiBatteryCharging100,
  mdiBatteryChargingOutline, mdiBatteryOutline, mdiHome, mdiLeaf, mdiSolarPower, mdiTransmissionTower,
} from "@mdi/js";
import { flowDuration, lineState } from "./flow";
import type { Layout, TopLine } from "./layout";
import type { TopFlows, TopValues, TreeValue } from "./model";
import type { FlowSettings } from "./types";

export const COLORS = { home: "#5c9ded", others: "#9e9e9e" };
/** Los colores de energía de HA (los que usa power-flow-card-plus), con sus valores por defecto. */
export const ENERGY = {
  gridIn: "var(--energy-grid-consumption-color, #488fc2)",
  gridOut: "var(--energy-grid-return-color, #8353d1)",
  solar: "var(--energy-solar-color, #ff9800)",
  batteryIn: "var(--energy-battery-in-color, #f06292)",
  batteryOut: "var(--energy-battery-out-color, #4db6ac)",
  nonFossil: "var(--energy-non-fossil-color, #0f9d58)",
};
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
  names: { grid: string; battery: string; solar: string; eco: string };
}

/** Manejadores de pulsación: tocar hace onTap (si hay) y mantener abre el detalle de la entidad. */
export interface Press { down: (e: Event) => void; up: (e: Event) => void; cancel: () => void; stop: (e: Event) => void }
export type Click = (entity?: string, onTap?: () => void) => Press;

/** Texto dentro de una bolita: arriba del icono (top) o debajo, con flecha opcional. */
interface Line { t: string; cls?: string; style?: string; top?: boolean; arrow?: string; arrowId?: string }

const LINE_COLOR: Record<keyof TopFlows, string> = {
  solarToHome: ENERGY.solar, solarToBattery: ENERGY.batteryIn, solarToGrid: ENERGY.gridOut,
  gridToHome: ENERGY.gridIn, gridToBattery: ENERGY.batteryIn, batteryToHome: ENERGY.batteryOut, batteryToGrid: ENERGY.gridOut,
  gridNonFossil: ENERGY.nonFossil,
};
const R = 40;
const CIRC = 2 * Math.PI * R;

const BATTERY = [mdiBatteryOutline, mdiBattery10, mdiBattery20, mdiBattery30, mdiBattery40, mdiBattery50, mdiBattery60, mdiBattery70, mdiBattery80, mdiBattery90, mdiBattery];
const BATTERY_CHARGING = [mdiBatteryChargingOutline, mdiBatteryCharging10, mdiBatteryCharging20, mdiBatteryCharging30, mdiBatteryCharging40,
  mdiBatteryCharging50, mdiBatteryCharging60, mdiBatteryCharging70, mdiBatteryCharging80, mdiBatteryCharging90, mdiBatteryCharging100];

/** Icono de batería por niveles de 10 % (con rayo si está cargando). */
function batteryIcon(soc: number | null, charging: boolean): string {
  const level = soc === null ? 0 : Math.max(0, Math.min(10, Math.floor(soc / 10)));
  return (charging ? BATTERY_CHARGING : BATTERY)[level];
}

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

export function renderSvg(l: Layout, tree: TreeValue, top: TopValues, flows: TopFlows, s: FlowSettings, x: Extras, click: Click,
  showSankey = true, onHomeTap?: () => void): TemplateResult {
  const color = colorsOf(tree);
  const byId = nodes(tree);
  const b = l.balls;

  const topLine = (key: keyof TopFlows, d: string) => {
    const w = flows[key], st = lineState(w, s), col = LINE_COLOR[key];
    return svg`<g data-line=${key}>
      <path d=${d} fill="none" style=${`stroke: ${col}`} stroke-width="2" opacity=${st.opacity}></path>
      ${st.dots ? svg`<circle r="2.6" style=${`fill: ${col}`}><animateMotion dur=${`${flowDuration(w, s).toFixed(2)}s`} repeatCount="indefinite" path=${d}></animateMotion></circle>` : nothing}
    </g>`;
  };

  /** Una línea de valor: texto centrado o, con flecha, el icono MDI de la flecha delante (como power-flow-card-plus). */
  const valueLine = (x: Line, cx: number, y: number) => {
    if (!x.arrow) return svg`<text x=${cx} y=${y} text-anchor="middle" class=${`val ${x.cls ?? ""}`} style=${x.style ?? ""}>${x.t}</text>`;
    const tw = x.t.length * 6.4, total = 13 + tw, x0 = cx - total / 2;
    return svg`<svg data-arrow=${x.arrowId ?? "flow"} x=${x0} y=${y - 10} width="12" height="12" viewBox="0 0 24 24"><path d=${x.arrow} style=${x.style ?? ""}></path></svg>
      <text x=${x0 + 13} y=${y} text-anchor="start" class=${`val ${x.cls ?? ""}`} style=${x.style ?? ""}>${x.t}</text>`;
  };

  /** Bolita de 80 px: icono arriba y textos debajo (o un dato secundario encima del icono), con su nombre fuera. */
  const ball = (id: keyof Layout["balls"], ring: string | TemplateResult, icon: string, iconColor: string,
    lines: Line[], entity: string | undefined, name?: string, nameBelow = false, onTap?: () => void) => {
    const p = b[id];
    const h = click(entity, onTap);
    const top = lines.filter((x) => x.top), rest = lines.filter((x) => !x.top);
    // con dato secundario (temperatura): texto arriba dentro de la bolita, icono y valor debajo; sin él, el icono sube
    const iconY = top.length ? p.cy - 11 : p.cy - 22 - (rest.length > 1 ? 4 : 0);
    const iconSize = top.length ? 20 : 22;
    return svg`<g data-ball=${id} class="hit" @pointerdown=${h.down} @pointerup=${h.up} @pointercancel=${h.cancel} @click=${h.stop}>
      ${typeof ring === "string"
        ? svg`<circle cx=${p.cx} cy=${p.cy} r=${p.r} style=${`fill: var(--card-background-color, #1c1c1c); stroke: ${ring}`} stroke-width="2"></circle>`
        : ring}
      ${top.map((x) => svg`<text x=${p.cx} y=${p.cy - 15} text-anchor="middle" class=${x.cls ?? "sec"} style=${x.style ?? ""}>${x.t}</text>`)}
      <svg class="icon" x=${p.cx - iconSize / 2} y=${iconY} width=${iconSize} height=${iconSize} viewBox="0 0 24 24"><path d=${icon} style=${`fill: ${iconColor}`}></path></svg>
      ${rest.map((x, i) => valueLine(x, p.cx, iconY + iconSize + 14 + i * 13))}
      ${name ? svg`<text class="name" x=${p.cx} y=${nameBelow ? p.cy + p.r + 15 : p.cy - p.r - 7} text-anchor="middle">${name}</text>` : nothing}
    </g>`;
  };

  // Anillo de la casa: tramos por origen de la energía (solar, batería, red limpia y red fósil), como power-flow-card-plus.
  const nonFossilHome = top.lowCarbon === null ? 0 : (flows.gridToHome * Math.max(0, Math.min(100, top.lowCarbon))) / 100;
  const sources: [string, number, string][] = [
    ["solar", flows.solarToHome, ENERGY.solar], ["battery", flows.batteryToHome, ENERGY.batteryOut],
    ["nonfossil", nonFossilHome, ENERGY.nonFossil], ["fossil", flows.gridToHome - nonFossilHome, ENERGY.gridIn],
  ];
  const total = sources.reduce((acc, [, w]) => acc + w, 0);
  let offset = 0;
  const h = b.home;
  const homeRing = svg`<circle cx=${h.cx} cy=${h.cy} r=${R} style="fill: var(--card-background-color, #1c1c1c); stroke: var(--divider-color, #444)" stroke-width="2"></circle>
    ${total > 0 ? sources.map(([key, w, col]) => {
      const len = (CIRC * w) / total;
      const seg = svg`<circle data-seg=${key} cx=${h.cx} cy=${h.cy} r=${R} fill="none" style=${`stroke: ${col}`} stroke-width="2.6"
        stroke-dasharray=${`${len.toFixed(2)} ${(CIRC - len).toFixed(2)}`} stroke-dashoffset=${(-offset).toFixed(2)}
        transform=${`rotate(-90 ${h.cx} ${h.cy})`}></circle>`;
      offset += len;
      return seg;
    }) : nothing}`;

  const charging = top.charge > 0, discharging = top.discharge > 0;
  const batt = charging ? power(top.charge) : discharging ? power(top.discharge) : power(0);
  const battArrow = charging ? mdiArrowDown : discharging ? mdiArrowUp : undefined;
  const battColor = charging ? ENERGY.batteryIn : ENERGY.batteryOut;
  const gridColor = top.gridOut > top.gridIn ? ENERGY.gridOut : ENERGY.gridIn;
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
    const h = click(n.entity);
    return svg`<rect data-bar=${bar.id} class=${`hit ${dim}`} x=${cx - w / 2} y=${bar.y} width=${w} height=${bar.h} rx="2" fill=${c}
        opacity=${bar.zero ? 0.3 : 1} @pointerdown=${h.down} @pointerup=${h.up} @pointercancel=${h.cancel} @click=${h.stop}></rect>
      <text data-label=${bar.id} class=${`hit lbl ${dim}`} x=${cx} y=${bar.y + bar.h + 14} text-anchor="middle"
        @pointerdown=${h.down} @pointerup=${h.up} @pointercancel=${h.cancel} @click=${h.stop}>
        <tspan x=${cx}>${n.name}</tspan><tspan x=${cx} dy="12" class="val"> ${value}</tspan></text>`;
  });

  const home = l.bars[0];
  // Sankey oculto (se toca la casa): solo el bloque de arriba
  const height = showSankey ? l.forecastY : b.home.cy + b.home.r + 14;
  return svg`<svg class="flow" viewBox=${`0 0 ${l.width} ${height}`} preserveAspectRatio="xMidYMin meet">
    <defs>${gradients}</defs>
    ${(Object.keys(l.topLines) as TopLine[]).map((k) => topLine(k, l.topLines[k]))}
    ${top.lowCarbon !== null ? topLine("gridNonFossil", l.ecoLine) : nothing}
    ${showSankey ? svg`<path d=${`M${b.home.cx},${b.home.cy + b.home.r} L${b.home.cx},${home.y}`} stroke=${COLORS.home} stroke-width="2" fill="none"></path>
    ${l.links.map((d) => svg`<path d=${d} stroke="var(--divider-color, #555)" stroke-width="1.5" fill="none"></path>`)}
    ${bands}
    <rect x=${home.x} y=${home.y} width=${home.w} height=${home.h} rx="3" fill=${COLORS.home}></rect>
    ${bars}` : nothing}
    ${ball("grid", gridColor, mdiTransmissionTower, gridColor, [
      { t: power(top.gridIn), cls: "in", style: `fill: ${ENERGY.gridIn}`, arrow: mdiArrowRight, arrowId: "in" },
      { t: power(top.gridOut), cls: "out", style: `fill: ${ENERGY.gridOut}`, arrow: mdiArrowLeft, arrowId: "out" }], x.entities.grid, x.names.grid)}
    ${top.lowCarbon !== null ? ball("eco", ENERGY.nonFossil, mdiLeaf, ENERGY.nonFossil, [{ t: power(flows.gridNonFossil) }], x.entities.eco) : nothing}
    ${ball("battery", battColor, batteryIcon(top.soc, charging), battColor, [
      { t: top.soc !== null ? `${Math.round(top.soc)} %` : "—", cls: "val soc", style: `fill: ${battColor}`, top: true },
      { t: batt, cls: "flow-val", style: `fill: ${battColor}`, arrow: battArrow }], x.entities.battery, x.names.battery, true)}
    ${ball("solar", ENERGY.solar, mdiSolarPower, ENERGY.solar, [...(x.solarSecondary ? [{ t: x.solarSecondary, top: true }] : []), { t: power(top.solar) }],
      x.entities.solar, x.names.solar, true)}
    ${ball("home", homeRing, mdiHome, "var(--primary-text-color)", [...(x.homeSecondary ? [{ t: x.homeSecondary, top: true }] : []), { t: power(tree.watts) }],
      x.entities.home, undefined, false, onHomeTap)}
  </svg>`;
}
