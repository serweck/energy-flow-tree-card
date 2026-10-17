import { LitElement, html, nothing } from "lit";
import { handleAction, type HomeAssistant } from "custom-card-helpers";
import { flowSettings, isComplete, validateConfig } from "./config";
import { layoutCard } from "./layout";
import { buildTree, readKwh, topFlows, topValues, type Hass } from "./model";
import { kwh, renderSvg } from "./render";
import { styles } from "./styles";
import type { CardConfig } from "./types";
import "./editor";

export const CARD_TAG = "energy-flow-tree-card";
export const CARD_VERSION = "0.5.1";
/** Mantener pulsado más de esto abre el detalle de la entidad en vez de tocar. */
const HOLD_MS = 500;

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
  static properties = { hass: { attribute: false }, _config: { state: true }, _width: { state: true }, _sankey: { state: true } };

  hass?: HomeAssistant;
  private _config?: CardConfig;
  /** Ancho real del dibujo en px: las bolitas miden siempre 80 px y lo que sobra se lo queda el Sankey (por debajo de 400, se escala). */
  private _width = 400;
  /** Se enseña el Sankey (tocar la casa lo oculta o lo enseña). */
  private _sankey = true;
  private _hold?: ReturnType<typeof setTimeout>;
  private _resize?: ResizeObserver;
  private _observed?: Element;

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === "undefined") return;
    this._resize = new ResizeObserver(([e]) => {
      const w = Math.max(400, Math.round(e.contentRect.width));
      if (Math.abs(w - this._width) > 4) this._width = w;
    });
  }

  /** La caja del dibujo aparece cuando hay datos: se observa en cuanto existe (y si se vuelve a crear). */
  protected updated(): void {
    const box = this.shadowRoot?.querySelector(".box") ?? undefined;
    if (box && box !== this._observed) {
      if (this._observed) this._resize?.unobserve(this._observed);
      this._resize?.observe(box);
      this._observed = box;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
  }

  static getConfigElement(): HTMLElement { return document.createElement(`${CARD_TAG}-editor`); }
  static getStubConfig(): Partial<CardConfig> {
    return { grid: { import: "", export: "" }, battery: { discharge: "", charge: "", soc: "" }, solar: { entity: "" }, home: { entity: "" }, tree: [] };
  }

  setConfig(config: CardConfig): void { this._config = validateConfig(config); }
  getCardSize(): number { return 10; }
  getGridOptions(): { columns: number; min_columns: number } { return { columns: 12, min_columns: 6 }; }

  private _moreInfo(entity?: string): void {
    if (!entity || this._config?.clickable_entities === false) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true }));
  }

  /** Tocar hace onTap; mantener pulsado HOLD_MS abre el detalle de la entidad. */
  private _press = (entity?: string, onTap?: () => void) => ({
    down: (e: Event) => {
      e.stopPropagation();
      clearTimeout(this._hold);
      this._hold = setTimeout(() => { this._hold = undefined; this._moreInfo(entity); }, HOLD_MS);
    },
    up: (e: Event) => {
      e.stopPropagation();
      if (this._hold === undefined) return;   // ya fue una pulsación larga
      clearTimeout(this._hold);
      this._hold = undefined;
      onTap?.();
    },
    cancel: () => { clearTimeout(this._hold); this._hold = undefined; },
    // sin el menú del navegador al mantener pulsado en el móvil
    stop: (e: Event) => { e.stopPropagation(); if (e.type === "contextmenu") e.preventDefault(); },
  });

  private _background(): void {
    if (this.hass && this._config?.tap_action) handleAction(this, this.hass, this._config as never, "tap");
  }

  protected render() {
    const c = this._config;
    if (!c || !this.hass) return nothing;
    if (!isComplete(c)) return html`<ha-card><div class="hint">Elige en el editor las entidades de red, batería, solar y casa.</div></ha-card>`;
    const hass = this.hass as unknown as Hass;
    const tree = buildTree(c, hass);
    const top = topValues(c, hass);
    const layout = layoutCard(tree, this._width);
    const produced = c.produced_today ? readKwh(hass, c.produced_today) : null;
    const showForecast = c.show_forecast !== false && c.forecast;
    return html`<ha-card @click=${() => this._background()}>
      <div class="head"><span class="title">${c.title ?? "Solar"}</span>
        ${c.produced_today ? html`<span class="produced">Producido hoy ${kwh(produced)}</span>` : nothing}</div>
      <div class="box">${renderSvg(layout, tree, top, topFlows(top), flowSettings(c), {
        solarSecondary: secondary(hass, c.solar.secondary),
        homeSecondary: secondary(hass, c.home.secondary),
        entities: { grid: c.grid.power || c.grid.import, battery: c.battery.power || c.battery.soc, solar: c.solar.entity, home: c.home.entity, eco: c.eco?.fossil },
        names: { grid: c.grid.name ?? "Red", battery: c.battery.name ?? "Batería", solar: c.solar.name ?? "Solar", eco: c.eco?.name ?? "Bajas emisiones" },
      }, this._press, this._sankey, () => { this._sankey = !this._sankey; })}</div>
      ${showForecast ? html`<div class="forecast">
        <div>Producción estimada hoy <b>${kwh(readKwh(hass, c.forecast!.today))}</b></div>
        <div>Mañana <b>${kwh(readKwh(hass, c.forecast!.tomorrow))}</b></div></div>` : nothing}
    </ha-card>`;
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, EnergyFlowTreeCard);

const w = window as unknown as { customCards?: unknown[] };
w.customCards = w.customCards || [];
w.customCards.push({ type: CARD_TAG, name: "Energy Flow Tree Card", description: "Flujo solar con bolitas y un Sankey de consumos anidados", preview: false });
console.info(`%c ${CARD_TAG} %c ${CARD_VERSION} `, "background:#ff9800;color:#000", "background:#333;color:#fff");
