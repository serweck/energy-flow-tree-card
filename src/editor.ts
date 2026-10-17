import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import type { HomeAssistant } from "custom-card-helpers";
import type { CardConfig, NodeConfig } from "./types";

export const EDITOR_TAG = "energy-flow-tree-card-editor";
type Path = number[];

/** Copia del árbol con la lista en `path` cambiada por `fn` (path vacío = el nivel 1). */
function withList(tree: NodeConfig[], path: Path, fn: (list: NodeConfig[]) => NodeConfig[]): NodeConfig[] {
  if (!path.length) return fn([...tree]);
  const [i, ...rest] = path;
  return tree.map((n, k) => (k === i ? { ...n, children: withList(n.children ?? [], rest, fn) } : n));
}

export function addChild(tree: NodeConfig[], path: Path): NodeConfig[] {
  return withList(tree, path, (list) => [...list, { entity: "" }]);
}

export function removeNode(tree: NodeConfig[], path: Path): NodeConfig[] {
  const i = path[path.length - 1];
  return withList(tree, path.slice(0, -1), (list) => list.filter((_, k) => k !== i));
}

export function moveNode(tree: NodeConfig[], path: Path, delta: -1 | 1): NodeConfig[] {
  const i = path[path.length - 1], j = i + delta;
  return withList(tree, path.slice(0, -1), (list) => {
    if (j < 0 || j >= list.length) return list;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
}

export function updateNode(tree: NodeConfig[], path: Path, patch: Partial<NodeConfig>): NodeConfig[] {
  const i = path[path.length - 1];
  return withList(tree, path.slice(0, -1), (list) => list.map((n, k) => (k === i ? { ...n, ...patch } : n)));
}

const ENTITY = { entity: { domain: "sensor" } };
/** Campos de arriba para ha-form, con nombres planos (grid_import…) que se pasan a la configuración anidada. */
const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "grid_import", selector: ENTITY }, { name: "grid_export", selector: ENTITY }, { name: "grid_power", selector: ENTITY },
  { name: "battery_discharge", selector: ENTITY }, { name: "battery_charge", selector: ENTITY }, { name: "battery_soc", selector: ENTITY }, { name: "battery_power", selector: ENTITY },
  { name: "solar_entity", selector: ENTITY }, { name: "solar_secondary", selector: ENTITY },
  { name: "home_entity", selector: ENTITY }, { name: "home_secondary", selector: ENTITY },
  { name: "eco_fossil", selector: ENTITY }, { name: "produced_today", selector: ENTITY },
  { name: "forecast_today", selector: ENTITY }, { name: "forecast_tomorrow", selector: ENTITY },
  { name: "show_forecast", selector: { boolean: {} } },
  { name: "sankey_open", selector: { boolean: {} } },
  { name: "today_import", selector: ENTITY }, { name: "today_export", selector: ENTITY },
  { name: "today_produced", selector: ENTITY }, { name: "today_consumed", selector: ENTITY },
  { name: "tap_action", selector: { ui_action: {} } },
];
const LABELS: Record<string, string> = {
  title: "Título", grid_import: "Red · entrada", grid_export: "Red · salida", grid_power: "Red · potencia con signo (al mantener)", battery_power: "Batería · potencia con signo (al mantener)", battery_discharge: "Batería · descarga",
  battery_charge: "Batería · carga", battery_soc: "Batería · SoC", solar_entity: "Solar · potencia", solar_secondary: "Solar · dato secundario",
  home_entity: "Casa · consumo", home_secondary: "Casa · dato secundario", eco_fossil: "Eco · % fósiles de la red",
  produced_today: "Producido hoy (kWh)", forecast_today: "Pronóstico hoy", forecast_tomorrow: "Pronóstico mañana",
  show_forecast: "Enseñar el pronóstico", sankey_open: "Sankey abierto al cargar",
  today_import: "Hoy · importado (kWh)", today_export: "Hoy · exportado (kWh)", today_produced: "Hoy · producido (kWh)", today_consumed: "Hoy · consumido (kWh)", tap_action: "Al tocar el fondo",
};

function toForm(c: CardConfig): Record<string, unknown> {
  return {
    title: c.title, grid_import: c.grid?.import, grid_export: c.grid?.export, grid_power: c.grid?.power, battery_power: c.battery?.power,
    battery_discharge: c.battery?.discharge, battery_charge: c.battery?.charge, battery_soc: c.battery?.soc,
    solar_entity: c.solar?.entity, solar_secondary: c.solar?.secondary, home_entity: c.home?.entity, home_secondary: c.home?.secondary,
    eco_fossil: c.eco?.fossil, produced_today: c.produced_today, forecast_today: c.forecast?.today, forecast_tomorrow: c.forecast?.tomorrow,
    show_forecast: c.show_forecast !== false, tap_action: c.tap_action, sankey_open: c.sankey_open === true,
    today_import: c.today?.import, today_export: c.today?.export, today_produced: c.today?.produced, today_consumed: c.today?.consumed,
  };
}

function fromForm(c: CardConfig, v: Record<string, unknown>): CardConfig {
  const s = (k: string) => (v[k] ? String(v[k]) : undefined);
  const out: CardConfig = {
    ...c, title: s("title"),
    grid: { ...c.grid, import: s("grid_import") ?? "", export: s("grid_export") ?? "", power: s("grid_power") },
    battery: { ...c.battery, discharge: s("battery_discharge") ?? "", charge: s("battery_charge") ?? "", soc: s("battery_soc") ?? "", power: s("battery_power") },
    solar: { entity: s("solar_entity") ?? "", secondary: s("solar_secondary") },
    home: { entity: s("home_entity") ?? "", secondary: s("home_secondary") },
    eco: s("eco_fossil") ? { fossil: s("eco_fossil") as string } : undefined,
    produced_today: s("produced_today"),
    forecast: s("forecast_today") && s("forecast_tomorrow") ? { today: s("forecast_today") as string, tomorrow: s("forecast_tomorrow") as string } : undefined,
    show_forecast: v.show_forecast === false ? false : undefined,
    sankey_open: v.sankey_open === true ? true : undefined,
    today: ["today_import", "today_export", "today_produced", "today_consumed"].some((k) => v[k])
      ? { import: s("today_import"), export: s("today_export"), produced: s("today_produced"), consumed: s("today_consumed") } : undefined,
    tap_action: v.tap_action as CardConfig["tap_action"],
  };
  // fuera las claves vacías, para que el YAML quede limpio
  return JSON.parse(JSON.stringify(out));
}

/** Editor visual: entidades de arriba con ha-form y el árbol de consumos como lista anidada. */
export class EnergyFlowTreeCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, _config: { state: true } };
  static styles = css`
    .tree { display: grid; gap: 6px; margin-top: 14px; }
    .tree h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
    .node { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px;
            background: var(--secondary-background-color, #262626); }
    .node ha-entity-picker, .node input[name="entity"] { flex: 1 1 180px; min-width: 0; }
    .node input[name="name"] { flex: 0 1 120px; min-width: 0; }
    .node input { font: inherit; font-size: 13px; color: var(--primary-text-color); background: var(--card-background-color, #1c1c1c);
                  border: 1px solid var(--divider-color, #444); border-radius: 8px; padding: 6px 8px; }
    .node input[type="color"] { width: 34px; padding: 2px; height: 30px; }
    button { font: inherit; font-size: 13px; color: var(--primary-text-color); background: var(--card-background-color, #1c1c1c);
             border: 1px solid var(--divider-color, #444); border-radius: 8px; padding: 5px 8px; cursor: pointer; }
    button.add { justify-self: start; }
  `;

  hass?: HomeAssistant;
  private _config?: CardConfig;

  setConfig(config: CardConfig): void { this._config = config; }

  private _set(config: CardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  private _tree(fn: (tree: NodeConfig[]) => NodeConfig[]): void {
    if (this._config) this._set({ ...this._config, tree: fn(this._config.tree ?? []) });
  }

  private _node(n: NodeConfig, path: Path): TemplateResult {
    const p = path.join(".");
    const picker = customElements.get("ha-entity-picker")
      ? html`<ha-entity-picker .hass=${this.hass} .value=${n.entity} .includeDomains=${["sensor"]} allow-custom-entity
          @value-changed=${(e: CustomEvent) => this._tree((t) => updateNode(t, path, { entity: e.detail.value ?? "" }))}></ha-entity-picker>`
      : html`<input name="entity" .value=${n.entity} placeholder="sensor.…"
          @change=${(e: Event) => this._tree((t) => updateNode(t, path, { entity: (e.target as HTMLInputElement).value }))} />`;
    return html`<div class="node" data-path=${p} style=${`margin-left: ${(path.length - 1) * 18}px`}>
        ${picker}
        <input name="name" .value=${n.name ?? ""} placeholder="Nombre"
          @change=${(e: Event) => this._tree((t) => updateNode(t, path, { name: (e.target as HTMLInputElement).value || undefined }))} />
        <input name="color" type="color" .value=${n.color ?? "#9e9e9e"}
          @change=${(e: Event) => this._tree((t) => updateNode(t, path, { color: (e.target as HTMLInputElement).value }))} />
        <button data-act="up" title="Subir" @click=${() => this._tree((t) => moveNode(t, path, -1))}>↑</button>
        <button data-act="down" title="Bajar" @click=${() => this._tree((t) => moveNode(t, path, 1))}>↓</button>
        <button data-act="child" title="Añadir consumo dentro" @click=${() => this._tree((t) => addChild(t, path))}>＋ dentro</button>
        <button data-act="remove" title="Quitar" @click=${() => this._tree((t) => removeNode(t, path))}>✕</button>
      </div>
      ${(n.children ?? []).map((c, i) => this._node(c, [...path, i]))}`;
  }

  protected render() {
    const c = this._config;
    if (!c) return nothing;
    return html`
      <ha-form .hass=${this.hass} .data=${toForm(c)} .schema=${SCHEMA} .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
        @value-changed=${(e: CustomEvent) => this._set(fromForm(c, e.detail.value))}></ha-form>
      <div class="tree">
        <h3>Consumos (de la casa hacia abajo)</h3>
        ${(c.tree ?? []).map((n, i) => this._node(n, [i]))}
        <button class="add" data-act="add" @click=${() => this._tree((t) => addChild(t, []))}>＋ Añadir consumo</button>
      </div>`;
  }
}

if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, EnergyFlowTreeCardEditor);
