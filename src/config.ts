import type { CardConfig, FlowSettings, NodeConfig } from "./types";

/** Valores de las líneas por defecto: los que usa hoy la power-flow-card-plus de la pestaña Solar. */
export const FLOW_DEFAULTS: FlowSettings = {
  min_flow_rate: 0.75,
  max_flow_rate: 6,
  min_expected_power: 0.01,
  max_expected_power: 11000,
  watt_threshold: 10,
  display_zero_lines: { mode: "transparency", transparency: 83 },
  disable_dots: false,
};

function validateNodes(nodes: unknown, path: string): void {
  if (!Array.isArray(nodes)) throw new Error(`${path}: tiene que ser una lista`);
  nodes.forEach((n: Partial<NodeConfig> | undefined, i) => {
    const here = `${path}[${i}]`;
    // vacía vale (consumo recién añadido en el editor, se ignora al dibujar); lo que no vale es que falte
    if (typeof n?.entity !== "string") throw new Error(`${here}.entity es obligatorio`);
    if (n.children !== undefined) validateNodes(n.children, `${here}.children`);
  });
}

export function validateConfig(config: Partial<CardConfig> | undefined): CardConfig {
  const c = config ?? {};
  // Las entidades pueden venir vacías (las rellena el editor): la tarjeta lo dice con un aviso, sin error.
  const str = (v: unknown) => typeof v === "string";
  if (!str(c.grid?.import) || !str(c.grid?.export)) throw new Error("grid.import y grid.export son obligatorios");
  if (!str(c.battery?.discharge) || !str(c.battery?.charge) || !str(c.battery?.soc))
    throw new Error("battery.discharge, battery.charge y battery.soc son obligatorios");
  if (!str(c.solar?.entity)) throw new Error("solar.entity es obligatorio");
  if (!str(c.home?.entity)) throw new Error("home.entity es obligatorio");
  validateNodes(c.tree, "tree");
  return c as CardConfig;
}

/** Si ya están todas las entidades que hacen falta para dibujar. */
export function isComplete(c: CardConfig): boolean {
  return [c.grid.import, c.grid.export, c.battery.discharge, c.battery.charge, c.battery.soc, c.solar.entity, c.home.entity].every(Boolean);
}

export function flowSettings(c: CardConfig): FlowSettings {
  return {
    min_flow_rate: c.min_flow_rate ?? FLOW_DEFAULTS.min_flow_rate,
    max_flow_rate: c.max_flow_rate ?? FLOW_DEFAULTS.max_flow_rate,
    min_expected_power: c.min_expected_power ?? FLOW_DEFAULTS.min_expected_power,
    max_expected_power: c.max_expected_power ?? FLOW_DEFAULTS.max_expected_power,
    watt_threshold: c.watt_threshold ?? FLOW_DEFAULTS.watt_threshold,
    display_zero_lines: { ...FLOW_DEFAULTS.display_zero_lines, ...c.display_zero_lines },
    disable_dots: c.disable_dots ?? FLOW_DEFAULTS.disable_dots,
  };
}
