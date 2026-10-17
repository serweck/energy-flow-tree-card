import type { CardConfig, NodeConfig } from "./types";

export type Hass = { states: Record<string, { state: string; attributes: Record<string, unknown> } | undefined> };

function numeric(hass: Hass, entity?: string): { value: number; unit: string } | null {
  const s = entity ? hass.states[entity] : undefined;
  if (!s) return null;
  const value = Number(s.state);
  if (s.state === "" || !Number.isFinite(value)) return null;
  return { value, unit: String(s.attributes.unit_of_measurement ?? "") };
}

/** Potencia en W (los sensores en kW se pasan a W). null si no hay un número. */
export function readWatts(hass: Hass, entity?: string): number | null {
  const n = numeric(hass, entity);
  if (!n) return null;
  return n.unit === "kW" ? n.value * 1000 : n.unit === "MW" ? n.value * 1e6 : n.value;
}

/** Energía en kWh (los sensores en Wh se pasan a kWh). null si no hay un número. */
export function readKwh(hass: Hass, entity?: string): number | null {
  const n = numeric(hass, entity);
  if (!n) return null;
  return n.unit === "Wh" ? n.value / 1000 : n.unit === "MWh" ? n.value * 1000 : n.value;
}

export interface TreeValue {
  id: string;
  name: string;
  entity?: string;
  icon?: string;
  color?: string;
  watts: number | null;
  kind: "home" | "load" | "others" | "remainder";
  children: TreeValue[];
}

const sum = (nodes: TreeValue[]) => nodes.reduce((acc, n) => acc + (n.watts ?? 0), 0);

function nodeValue(hass: Hass, n: NodeConfig, id: string): TreeValue {
  const friendly = hass.states[n.entity]?.attributes.friendly_name;
  const value: TreeValue = {
    id,
    name: n.name || (typeof friendly === "string" && friendly) || n.entity,
    entity: n.entity,
    icon: n.icon,
    color: n.color,
    watts: readWatts(hass, n.entity),
    kind: "load",
    children: (n.children ?? []).map((c, i) => nodeValue(hass, c, `${id}.${i}`)),
  };
  if (value.children.length) {
    value.children.push({
      id: `${id}.remainder`, name: "resto", kind: "remainder", children: [],
      watts: Math.max(0, (value.watts ?? 0) - sum(value.children)),
    });
  }
  return value;
}

/** El árbol con sus vatios: raíz = casa; Otros al final del nivel 1 y un resto en cada padre con hijos. */
export function buildTree(c: CardConfig, hass: Hass): TreeValue {
  const children = c.tree.map((n, i) => nodeValue(hass, n, String(i)));
  const watts = readWatts(hass, c.home.entity);
  children.push({ id: "others", name: "Otros", kind: "others", children: [], watts: Math.max(0, (watts ?? 0) - sum(children)) });
  return { id: "home", name: "Casa", entity: c.home.entity, kind: "home", watts, children };
}

export interface TopValues {
  solar: number;
  gridIn: number;
  gridOut: number;
  charge: number;
  discharge: number;
  soc: number | null;
  lowCarbon: number | null;
}

export function topValues(c: CardConfig, hass: Hass): TopValues {
  const w = (e: string) => Math.max(0, readWatts(hass, e) ?? 0);
  const fossil = c.eco ? numeric(hass, c.eco.fossil) : null;
  return {
    solar: w(c.solar.entity),
    gridIn: w(c.grid.import),
    gridOut: w(c.grid.export),
    charge: w(c.battery.charge),
    discharge: w(c.battery.discharge),
    soc: numeric(hass, c.battery.soc)?.value ?? null,
    lowCarbon: fossil ? 100 - fossil.value : null,
  };
}

export interface TopFlows {
  solarToHome: number;
  solarToBattery: number;
  solarToGrid: number;
  gridToHome: number;
  gridToBattery: number;
  batteryToHome: number;
  batteryToGrid: number;
}

/** Reparto de la energía entre solar, red, batería y casa (la solar va primero a la red, luego a la batería y el resto a casa). */
export function topFlows(v: TopValues): TopFlows {
  const solarToGrid = Math.min(v.gridOut, v.solar);
  const solarToBattery = Math.min(v.charge, v.solar - solarToGrid);
  const solarToHome = Math.max(0, v.solar - solarToGrid - solarToBattery);
  const gridToBattery = Math.max(0, v.charge - solarToBattery);
  const batteryToGrid = Math.max(0, v.gridOut - solarToGrid);
  const gridToHome = Math.max(0, v.gridIn - gridToBattery);
  const batteryToHome = Math.max(0, v.discharge - batteryToGrid);
  return { solarToHome, solarToBattery, solarToGrid, gridToHome, gridToBattery, batteryToHome, batteryToGrid };
}
