import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/energy-flow-tree-card";
import { flowSettings } from "../src/config";
import { flowDuration } from "../src/flow";
import { layoutCard } from "../src/layout";
import { buildTree } from "../src/model";
import type { CardConfig } from "../src/types";
import { CONFIG, EXAMPLE, fakeHass } from "./fixtures";
import { mdiArrowDown, mdiArrowLeft, mdiArrowRight, mdiArrowUp, mdiBattery50, mdiBatteryCharging90 } from "@mdi/js";

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
// jsdom no trae PointerEvent: un MouseEvent con el mismo tipo llega igual a los manejadores.
const ptr = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
const tap = (el: Element) => { ptr(el, "pointerdown"); ptr(el, "pointerup"); };
function hold(el: Element) { ptr(el, "pointerdown"); vi.advanceTimersByTime(600); ptr(el, "pointerup"); }
afterEach(() => vi.useRealTimers());
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
    expect(text($('[data-ball="grid"] .in'))).toBe("0 W");
    expect(text($('[data-ball="grid"] .out'))).toBe("54 W");
    // las flechas son los iconos de MDI de power-flow-card-plus, no caracteres
    expect(text($('[data-ball="grid"]'))).not.toMatch(/[→←↑↓]/);
    expect($('[data-ball="grid"] [data-arrow="in"] path')!.getAttribute("d")).toBe(mdiArrowRight);
    expect($('[data-ball="grid"] [data-arrow="out"] path')!.getAttribute("d")).toBe(mdiArrowLeft);
    // entrada y salida de la red, cada una con su color de energía de HA
    expect($('[data-ball="grid"] .in')!.getAttribute("style")).toContain("--energy-grid-consumption-color");
    expect($('[data-ball="grid"] .out')!.getAttribute("style")).toContain("--energy-grid-return-color");
    // exporta más de lo que importa: el círculo va en el color de la salida
    expect($('[data-ball="grid"] circle')!.getAttribute("style")).toContain("--energy-grid-return-color");
    expect(text($('[data-ball="battery"]'))).toContain("95 %");
    expect(text($('[data-ball="battery"]'))).toContain("1,1 kW");
    expect(text($('[data-ball="solar"]'))).toContain("3,2 kW");
    expect(text($('[data-ball="solar"]'))).toContain("19,4 °C");
    expect(text($('[data-ball="home"]'))).toContain("1,9 kW");
    expect(text($('[data-ball="eco"]'))).toContain("0 W");
  });

  it("bajas emisiones enseña los vatios limpios que entran de la red y su línea va a esa velocidad", async () => {
    const { $ } = await mount(CONFIG, { ...EXAMPLE, "sensor.grid_importacion": "1000", "sensor.victron_mqtt_system_0_system_dc_pv_power": "0" });
    expect(text($('[data-ball="eco"]'))).toContain("820 W");
    expect($('[data-line="gridNonFossil"] circle')!.firstElementChild!.getAttribute("dur")).toBe(`${flowDuration(820, S).toFixed(2)}s`);
  });

  it("cada bolita lleva su icono de antes y su nombre fuera", async () => {
    const { $ } = await mount();
    for (const id of ["grid", "eco", "battery", "solar", "home"]) expect($(`[data-ball="${id}"] .icon path`)).not.toBeNull();
    expect(text($('[data-ball="grid"] .name'))).toBe("Red");
    expect(text($('[data-ball="solar"] .name'))).toBe("Solar");
    expect(text($('[data-ball="battery"] .name'))).toBe("Batería");
    expect($('[data-ball="eco"] .name')).toBeNull();   // el usuario no quiere título en bajas emisiones
    const { $: $2 } = await mount({ ...CONFIG, grid: { ...CONFIG.grid, name: "Grid" } });
    expect(text($2('[data-ball="grid"] .name'))).toBe("Grid");
  });

  it("la batería va en rosa al cargar y en verde azulado al descargar, también su porcentaje y su valor", async () => {
    const { $ } = await mount();   // cargando 1,1 kW
    for (const sel of ['[data-ball="battery"] circle', '[data-ball="battery"] .soc', '[data-ball="battery"] .flow-val'])
      expect($(sel)!.getAttribute("style")).toContain("--energy-battery-in-color");
    const { $: $2 } = await mount(CONFIG, { ...EXAMPLE, "sensor.bateria_carga": "0", "sensor.bateria_descarga": "800" });
    for (const sel of ['[data-ball="battery"] circle', '[data-ball="battery"] .soc', '[data-ball="battery"] .flow-val'])
      expect($2(sel)!.getAttribute("style")).toContain("--energy-battery-out-color");
  });

  it("batería: el porcentaje encima del icono, icono por niveles de carga y flecha según cargue o descargue", async () => {
    const { $ } = await mount();   // 95 % y cargando
    const soc = $('[data-ball="battery"] .soc')!, icon = $('[data-ball="battery"] .icon')!;
    expect(text(soc)).toBe("95 %");
    expect(Number(soc.getAttribute("y"))).toBeLessThan(Number(icon.getAttribute("y")));
    expect(icon.querySelector("path")!.getAttribute("d")).toBe(mdiBatteryCharging90);
    expect($('[data-ball="battery"] [data-arrow] path')!.getAttribute("d")).toBe(mdiArrowDown);
    const { $: $2 } = await mount(CONFIG, { ...EXAMPLE, "sensor.bateria_carga": "0", "sensor.bateria_descarga": "800",
      "sensor.victron_mqtt_system_0_system_dc_battery_soc": ["54", "%"] });
    expect($2('[data-ball="battery"] .icon path')!.getAttribute("d")).toBe(mdiBattery50);
    expect($2('[data-ball="battery"] [data-arrow] path')!.getAttribute("d")).toBe(mdiArrowUp);
  });

  it("la temperatura va dentro de la bolita, no pegada al borde", async () => {
    const { $ } = await mount();
    const y = Number($('[data-ball="solar"] text.sec')!.getAttribute("y"));
    expect(y).toBeGreaterThanOrEqual(176 - 20);
    expect(y).toBeLessThanOrEqual(176 - 10);
  });

  it("las bolitas no crecen con la tarjeta: el dibujo toma el ancho real y centra el bloque de arriba", async () => {
    const { card, $ } = await mount();
    (card as unknown as { _width: number })._width = 800;
    await card.updateComplete;
    expect($("svg.flow")!.getAttribute("viewBox")!.split(" ")[2]).toBe("800");
    expect($('[data-ball="home"] circle')!.getAttribute("cx")).toBe("400");
  });

  it("el anillo de la casa se reparte por origen: solar, batería, red limpia y red fósil", async () => {
    const { $ } = await mount(CONFIG, { ...EXAMPLE, "sensor.victron_mqtt_system_0_system_dc_pv_power": "1000", "sensor.bateria_carga": "0",
      "sensor.bateria_descarga": "500", "sensor.grid_importacion": "500", "sensor.grid_exportacion": "0" });
    const seg = (k: string) => Number($(`[data-ball="home"] [data-seg="${k}"]`)!.getAttribute("stroke-dasharray")!.split(" ")[0]);
    const C = 2 * Math.PI * 40;
    expect(seg("solar")).toBeCloseTo(C * 1000 / 2000, 1);
    expect(seg("battery")).toBeCloseTo(C * 500 / 2000, 1);
    expect(seg("nonfossil")).toBeCloseTo(C * 410 / 2000, 1);
    expect(seg("fossil")).toBeCloseTo(C * 90 / 2000, 1);
  });

  it("título con lo producido hoy y pronóstico al pie", async () => {
    const { $ } = await mount();
    expect(text($(".title"))).toBe("Solar");
    expect(text($(".produced"))).toBe("Producido hoy 18,4 kWh");
    expect(text($(".forecast"))).toBe("Producción estimada hoy 42,0 kWh Mañana 20,5 kWh");
  });

  it("show_forecast: false oculta el pronóstico", async () => {
    const { $ } = await mount({ ...CONFIG, show_forecast: false });
    expect($(".forecast")).toBeNull();
  });

  it("tocar no abre nada; mantener pulsado abre el detalle (bolitas y barras); Otros no tiene detalle", async () => {
    const { $, events } = await mount();
    vi.useFakeTimers();
    tap($('[data-ball="solar"]')!);
    tap($('[data-bar="0.0"]')!);
    expect(events).toEqual([]);
    hold($('[data-bar="0.0"]')!);
    hold($('[data-bar="others"]')!);
    hold($('[data-ball="solar"]')!);
    expect(events).toEqual([{ entityId: "sensor.calentador_agua_power" }, { entityId: "sensor.victron_mqtt_system_0_system_dc_pv_power" }]);
  });

  it("mantener la red abre el sensor con signo (importa + / exporta −) si lo hay; la batería, el suyo", async () => {
    const { $, events } = await mount({ ...CONFIG, grid: { ...CONFIG.grid, power: "sensor.victron_mqtt_system_0_system_grid_power_l1" },
      battery: { ...CONFIG.battery, power: "sensor.victron_mqtt_system_0_system_dc_battery_power" } });
    vi.useFakeTimers();
    hold($('[data-ball="grid"]')!);
    hold($('[data-ball="battery"]')!);
    expect(events).toEqual([{ entityId: "sensor.victron_mqtt_system_0_system_grid_power_l1" }, { entityId: "sensor.victron_mqtt_system_0_system_dc_battery_power" }]);
  });

  it("tocar la casa oculta y vuelve a enseñar el Sankey", async () => {
    const { card, $, $$ } = await mount();
    expect($$("[data-band]").length).toBeGreaterThan(0);
    tap($('[data-ball="home"]')!);
    await card.updateComplete;
    expect($$("[data-band]")).toHaveLength(0);
    expect($$("[data-bar]")).toHaveLength(0);
    expect(Number($("svg.flow")!.getAttribute("viewBox")!.split(" ")[3])).toBeLessThan(320);
    tap($('[data-ball="home"]')!);
    await card.updateComplete;
    expect($$("[data-band]").length).toBeGreaterThan(0);
  });

  it("clickable_entities: false no abre detalles", async () => {
    const { $, events } = await mount({ ...CONFIG, clickable_entities: false });
    vi.useFakeTimers();
    hold($('[data-bar="0.0"]')!);
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
