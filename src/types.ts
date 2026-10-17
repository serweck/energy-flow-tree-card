/** Un consumo del árbol: su entidad de potencia y, opcionalmente, sus propios consumos hijos. */
export interface NodeConfig {
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
  children?: NodeConfig[];
}

export interface CardConfig {
  type: string;
  title?: string;
  grid: { import: string; export: string };
  battery: { discharge: string; charge: string; soc: string };
  solar: { entity: string; secondary?: string };
  home: { entity: string; secondary?: string };
  /** Porcentaje de combustibles fósiles de la red; la tarjeta enseña 100 − este valor. */
  eco?: { fossil: string };
  produced_today?: string;
  forecast?: { today: string; tomorrow: string };
  /** Por defecto true. */
  show_forecast?: boolean;
  tree: NodeConfig[];
  tap_action?: { action: string; navigation_path?: string; [key: string]: unknown };
  clickable_entities?: boolean;
  min_flow_rate?: number;
  max_flow_rate?: number;
  min_expected_power?: number;
  max_expected_power?: number;
  watt_threshold?: number;
  display_zero_lines?: { mode: "transparency" | "hide"; transparency?: number };
  disable_dots?: boolean;
}

export type FlowSettings = Required<
  Pick<
    CardConfig,
    | "min_flow_rate"
    | "max_flow_rate"
    | "min_expected_power"
    | "max_expected_power"
    | "watt_threshold"
    | "display_zero_lines"
    | "disable_dots"
  >
>;
