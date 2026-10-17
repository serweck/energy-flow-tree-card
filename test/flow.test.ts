import { describe, expect, it } from "vitest";
import { flowSettings } from "../src/config";
import { flowDuration, lineState } from "../src/flow";
import { CONFIG } from "./fixtures";

const S = flowSettings(CONFIG);

describe("flowDuration", () => {
  it("6 s con la potencia mínima y 0,75 s a 11 kW o más", () => {
    expect(flowDuration(0.01, S)).toBeCloseTo(6);
    expect(flowDuration(11000, S)).toBeCloseTo(0.75);
    expect(flowDuration(20000, S)).toBe(0.75);
    expect(flowDuration(5500.005, S)).toBeCloseTo(3.375, 2);
  });

  it("nunca sale de [min_flow_rate, max_flow_rate]", () => {
    expect(flowDuration(0, S)).toBe(6);
    expect(flowDuration(-50, S)).toBe(6);
  });
});

describe("lineState", () => {
  it("por debajo de 10 W: casi transparente (83 %) y sin puntos", () =>
    expect(lineState(9, S)).toEqual({ active: false, opacity: 0.17, dots: false }));

  it("justo en el umbral sigue sin flujo", () => expect(lineState(10, S).active).toBe(false));

  it("null cuenta como sin flujo", () => expect(lineState(null, S).active).toBe(false));

  it("activa: opaca y con puntos", () => expect(lineState(500, S)).toEqual({ active: true, opacity: 1, dots: true }));

  it("modo hide oculta las líneas sin flujo", () =>
    expect(lineState(0, { ...S, display_zero_lines: { mode: "hide" } })).toEqual({ active: false, opacity: 0, dots: false }));

  it("disable_dots quita los puntos pero deja la línea", () =>
    expect(lineState(500, { ...S, disable_dots: true })).toEqual({ active: true, opacity: 1, dots: false }));
});
