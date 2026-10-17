import { LitElement, html, nothing } from "lit";
import { handleAction, type HomeAssistant } from "custom-card-helpers";
import { flowSettings, validateConfig } from "./config";
import { layoutCard } from "./layout";
import { buildTree, readKwh, topFlows, topValues, type Hass } from "./model";
import { kwh, renderSvg } from "./render";
import { styles } from "./styles";
import type { CardConfig } from "./types";
import "./editor";

export const CARD_TAG = "energy-flow-tree-card";
export const CARD_VERSION = "0.1.0";

function secondary(hass: Hass, entity?: string): string | null {
  const s = entity ? hass.states[entity] : undefined;
  if (!s) return null;
  const n = Number(s.state);
  if (!Number.isFinite(n) || s.state === "") return null;
  const unit = String(s.attributes.unit_of_measurement ?? "");
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

export class EnergyFlowTreeCard extends LitElement {
  static styles = styles;
  static properties = { hass: { attribute: false }, _config: { state: true } };

  hass?: HomeAssistant;
  private _config?: CardConfig;

  static getConfigElement(): HTMLElement { return document.createElement(`${CARD_TAG}-editor`); }
  static getStubConfig(): Partial<CardConfig> {
    return { grid: { import: "", export: "" }, battery: { discharge: "", charge: "", soc: "" }, solar: { entity: "" }, home: { entity: "" }, tree: [] };
  }

  setConfig(config: CardConfig): void { this._config = validateConfig(config); }
  getCardSize(): number { return 10; }
  getGridOptions(): { columns: number; min_columns: number } { return { columns: 12, min_columns: 6 }; }

  private _open = (entity?: string) => (e: Event) => {
    e.stopPropagation();
    if (!entity || this._config?.clickable_entities === false) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true }));
  };

  private _background(): void {
    if (this.hass && this._config?.tap_action) handleAction(this, this.hass, this._config as never, "tap");
  }

  protected render() {
    const c = this._config;
    if (!c || !this.hass) return nothing;
    const hass = this.hass as unknown as Hass;
    const tree = buildTree(c, hass);
    const top = topValues(c, hass);
    const layout = layoutCard(tree);
    const produced = c.produced_today ? readKwh(hass, c.produced_today) : null;
    const showForecast = c.show_forecast !== false && c.forecast;
    return html`<ha-card @click=${() => this._background()}>
      <div class="head"><span class="title">${c.title ?? "Solar"}</span>
        ${c.produced_today ? html`<span class="produced">Producido hoy ${kwh(produced)}</span>` : nothing}</div>
      ${renderSvg(layout, tree, top, topFlows(top), flowSettings(c), {
        solarSecondary: secondary(hass, c.solar.secondary),
        homeSecondary: secondary(hass, c.home.secondary),
        entities: { grid: c.grid.import, battery: c.battery.soc, solar: c.solar.entity, home: c.home.entity, eco: c.eco?.fossil },
      }, this._open)}
      ${showForecast ? html`<div class="forecast">
        <div>Pronóstico hoy <b>${kwh(readKwh(hass, c.forecast!.today))}</b></div>
        <div>Mañana <b>${kwh(readKwh(hass, c.forecast!.tomorrow))}</b></div></div>` : nothing}
    </ha-card>`;
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, EnergyFlowTreeCard);

const w = window as unknown as { customCards?: unknown[] };
w.customCards = w.customCards || [];
w.customCards.push({ type: CARD_TAG, name: "Energy Flow Tree Card", description: "Flujo solar con bolitas y un Sankey de consumos anidados", preview: false });
console.info(`%c ${CARD_TAG} %c ${CARD_VERSION} `, "background:#ff9800;color:#000", "background:#333;color:#fff");
