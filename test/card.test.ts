import { describe, expect, it } from "vitest";
import "../src/energy-flow-tree-card";
import { flowSettings } from "../src/config";
import { flowDuration } from "../src/flow";
import { layoutCard } from "../src/layout";
import { buildTree } from "../src/model";
import type { CardConfig } from "../src/types";
import { CONFIG, EXAMPLE, fakeHass } from "./fixtures";

type El = HTMLElement & { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<boolean> };

async function mount(config: CardConfig = CONFIG, states = EXAMPLE) {
  const card = document.createElement("energy-flow-tree-card") as El;
  card.setConfig(config);
  card.hass = fakeHass(states);
  const events: unknown[] = [];
  card.addEventListener("hass-more-info", (e) => events.push((e as CustomEvent).detail));
  document.body.appendChild(card);
  await card.updateComplete;
  const root = card.shadowRoot!;
  const $ = (s: string) => root.querySelector(s) as SVGElement | HTMLElement | null;
  const $$ = (s: string) => Array.from(root.querySelectorAll(s)) as (SVGElement | HTMLElement)[];
  return { card, $, $$, events };
}
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, " ").trim();
const S = flowSettings(CONFIG);

describe("tarjeta", () => {
  it("dibuja cinco bolitas, una barra por nodo y una banda por hijo", async () => {
    const { $$ } = await mount();
    const l = layoutCard(buildTree(CONFIG, fakeHass(EXAMPLE)));
    expect($$("[data-ball]")).toHaveLength(5);
    expect($$("[data-bar]")).toHaveLength(l.bars.filter((b) => !b.split).length - 1);   // sin la de la casa
    expect($$("[data-band]")).toHaveLength(l.bands.length);
  });

  it("enseña los vatios: Otros 339 W y el resto del Subcuadro 0", async () => {
    const { $ } = await mount();
    expect(text($('[data-label="others"]'))).toBe("Otros 339 W");
    expect(text($('[data-label="0.remainder"]'))).toBe("resto 0");
    expect(text($('[data-label="0.0"]'))).toBe("ACS 600");
    expect(text($('[data-label="0"]'))).toBe("Subcuadro 820 W");
  });

  it("las bandas sin consumo no tienen brillo y se ven casi transparentes", async () => {
    const { $ } = await mount();
    const cocina = $('[data-band="2"]')!;
    expect(cocina.querySelector(".glow")).toBeNull();
    expect(cocina.getAttribute("opacity")).toBe("0.17");
    expect($('[data-band="0.0"] .glow')).not.toBeNull();
  });

  it("el brillo del ACS y el punto solar→casa van a la velocidad de su potencia", async () => {
    const { $ } = await mount();
    const glow = $('[data-band="0.0"] .glow')!;
    expect(glow.getAttribute("style")).toContain(`animation-duration: ${flowDuration(600, S).toFixed(2)}s`);
    // jsdom no encuentra «animateMotion» por selector (mayúsculas en SVG): se llega por su punto.
    const dot = $('[data-line="solarToHome"] circle')!.firstElementChild!;
    expect(dot.localName).toBe("animateMotion");
    expect(dot.getAttribute("dur")).toBe(`${flowDuration(2046, S).toFixed(2)}s`);
    expect($('[data-line="gridToHome"] circle')).toBeNull();
    expect($('[data-line="gridToHome"] path')!.getAttribute("opacity")).toBe("0.17");
  });

  it("las bolitas enseñan red, batería, solar, casa y eco", async () => {
    const { $ } = await mount();
    expect(text($('[data-ball="grid"]'))).toContain("→ 0 W");
    expect(text($('[data-ball="grid"]'))).toContain("← 54 W");
    expect(text($('[data-ball="battery"]'))).toContain("95 %");
    expect(text($('[data-ball="battery"]'))).toContain("1,1 kW");
    expect(text($('[data-ball="solar"]'))).toContain("3,2 kW");
    expect(text($('[data-ball="solar"]'))).toContain("19,4 °C");
    expect(text($('[data-ball="home"]'))).toContain("1,9 kW");
    expect(text($('[data-ball="eco"]'))).toContain("82 %");
  });

  it("título con lo producido hoy y pronóstico al pie", async () => {
    const { $ } = await mount();
    expect(text($(".title"))).toBe("Solar");
    expect(text($(".produced"))).toBe("Producido hoy 18,4 kWh");
    expect(text($(".forecast"))).toBe("Pronóstico hoy 42,0 kWh Mañana 20,5 kWh");
  });

  it("show_forecast: false oculta el pronóstico", async () => {
    const { $ } = await mount({ ...CONFIG, show_forecast: false });
    expect($(".forecast")).toBeNull();
  });

  it("clic en la barra del ACS abre su detalle; Otros no hace nada", async () => {
    const { $, events } = await mount();
    $('[data-bar="0.0"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    $('[data-bar="others"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    $('[data-ball="solar"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(events).toEqual([{ entityId: "sensor.calentador_agua_power" }, { entityId: "sensor.victron_mqtt_system_0_system_dc_pv_power" }]);
  });

  it("clickable_entities: false no abre detalles", async () => {
    const { $, events } = await mount({ ...CONFIG, clickable_entities: false });
    $('[data-bar="0.0"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(events).toEqual([]);
  });

  it("con un sensor unavailable enseña «—» y no lanza", async () => {
    const { $ } = await mount(CONFIG, { ...EXAMPLE, "sensor.calentador_agua_power": "unavailable" });
    expect(text($('[data-label="0.0"]'))).toBe("ACS —");
  });

  it("con la configuración inicial del selector de tarjetas enseña un aviso en vez de un error", async () => {
    const card = document.createElement("energy-flow-tree-card") as El;
    const stub = (customElements.get("energy-flow-tree-card") as unknown as { getStubConfig(): CardConfig }).getStubConfig();
    expect(() => card.setConfig({ type: "custom:energy-flow-tree-card", ...stub })).not.toThrow();
    card.hass = fakeHass(EXAMPLE);
    document.body.appendChild(card);
    await card.updateComplete;
    expect(text(card.shadowRoot!.querySelector(".hint"))).toBe("Elige en el editor las entidades de red, batería, solar y casa.");
    expect(card.shadowRoot!.querySelector("svg")).toBeNull();
  });

  it("setConfig con árbol mal formado lanza el error de validateConfig", () => {
    const card = document.createElement("energy-flow-tree-card") as El;
    expect(() => card.setConfig({ ...CONFIG, tree: [{ name: "x" }] })).toThrow("tree[0].entity es obligatorio");
  });
});
