import { describe, expect, it } from "vitest";
import { flowSettings, validateConfig } from "../src/config";
import { CONFIG } from "./fixtures";

describe("validateConfig", () => {
  it("acepta la configuración del diseño", () => expect(validateConfig(CONFIG)).toBe(CONFIG));

  it.each([
    [{ ...CONFIG, grid: undefined }, "grid.import y grid.export son obligatorios"],
    [{ ...CONFIG, battery: { discharge: "sensor.a", charge: "", soc: "sensor.b" } }, "battery.discharge, battery.charge y battery.soc son obligatorios"],
    [{ ...CONFIG, solar: {} }, "solar.entity es obligatorio"],
    [{ ...CONFIG, home: { entity: "" } }, "home.entity es obligatorio"],
    [{ ...CONFIG, tree: "x" }, "tree: tiene que ser una lista"],
    [{ ...CONFIG, tree: [{ name: "Sin entidad" }] }, "tree[0].entity es obligatorio"],
    [{ ...CONFIG, tree: [{ entity: "sensor.a", children: [{}] }] }, "tree[0].children[0].entity es obligatorio"],
    [{ ...CONFIG, tree: [{ entity: "sensor.a", children: "x" }] }, "tree[0].children: tiene que ser una lista"],
  ])("rechaza configuraciones incompletas (%#)", (c, msg) => expect(() => validateConfig(c as never)).toThrow(msg));

  it("rechaza que no haya configuración", () => expect(() => validateConfig(undefined)).toThrow("grid.import y grid.export son obligatorios"));
});

describe("flowSettings", () => {
  it("valores por defecto de las líneas, como power-flow-card-plus", () =>
    expect(flowSettings(CONFIG)).toEqual({
      min_flow_rate: 0.75, max_flow_rate: 6, min_expected_power: 0.01, max_expected_power: 11000,
      watt_threshold: 10, display_zero_lines: { mode: "transparency", transparency: 83 }, disable_dots: false,
    }));

  it("respeta lo que ponga la configuración", () =>
    expect(flowSettings({ ...CONFIG, watt_threshold: 25, display_zero_lines: { mode: "hide" } })).toMatchObject({
      watt_threshold: 25, display_zero_lines: { mode: "hide", transparency: 83 },
    }));
});
