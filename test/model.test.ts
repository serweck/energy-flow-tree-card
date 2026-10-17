import { describe, expect, it } from "vitest";
import { buildTree, readKwh, readWatts, topFlows, topValues } from "../src/model";
import type { CardConfig } from "../src/types";
import { CONFIG, EXAMPLE, fakeHass } from "./fixtures";

const last = <T>(a: T[]): T => a[a.length - 1];

describe("buildTree", () => {
  it("Otros = casa − nivel 1, y resto = padre − hijos, sin bajar de 0", () => {
    const t = buildTree(CONFIG, fakeHass(EXAMPLE));
    expect(t).toMatchObject({ kind: "home", watts: 1900 });
    expect(last(t.children)).toMatchObject({ kind: "others", id: "others", watts: 339 });
    expect(last(t.children[0].children)).toMatchObject({ kind: "remainder", id: "0.remainder", watts: 0 });
    expect(t.children.map((n) => n.name)).toEqual(["Subcuadro", "Aerotermia", "Cocina", "Despacho", "Domótica", "Otros"]);
    expect(t.children[0].children[0]).toMatchObject({ id: "0.0", name: "ACS", entity: "sensor.calentador_agua_power", watts: 600, color: "#64b5f6" });
  });

  it("hijos que suman más que el padre: resto 0", () => {
    const t = buildTree(CONFIG, fakeHass({ ...EXAMPLE, "sensor.subcuadro_potencia": "100" }));
    expect(last(t.children[0].children).watts).toBe(0);
  });

  it("un nodo sin hijos no lleva resto", () => {
    expect(buildTree(CONFIG, fakeHass(EXAMPLE)).children[1].children).toEqual([]);
  });

  it("Otros nunca baja de 0", () => {
    const t = buildTree(CONFIG, fakeHass({ ...EXAMPLE, "sensor.victron_mqtt_system_0_system_consumption_power_l1": "1000" }));
    expect(last(t.children).watts).toBe(0);
  });

  it("sensor unavailable, no numérico o inexistente → null, y cuenta como 0", () => {
    const states = { ...EXAMPLE, "sensor.calentador_agua_power": "unavailable", "sensor.jacuzzi_power": "abc" };
    delete (states as Record<string, unknown>)["sensor.socket_garaje_aerotermia_bomba_power"];
    const t = buildTree(CONFIG, fakeHass(states));
    const sub = t.children[0];
    expect(sub.children[0].watts).toBeNull();
    expect(sub.children[1].watts).toBeNull();
    expect(sub.children[2].watts).toBeNull();
    expect(last(sub.children).watts).toBe(820 - 150);
  });

  it("sin nombre usa el friendly_name y, si no hay, la entidad", () => {
    const c: CardConfig = { ...CONFIG, tree: [{ entity: "sensor.socket_despacho_power" }, { entity: "sensor.no_existe" }] };
    const hass = fakeHass(EXAMPLE);
    hass.states["sensor.socket_despacho_power"].attributes.friendly_name = "Enchufe despacho";
    const t = buildTree(c, hass);
    expect(t.children[0].name).toBe("Enchufe despacho");
    expect(t.children[1].name).toBe("sensor.no_existe");
  });

  it("anida sin límite: el nieto lleva su ruta y su padre su resto", () => {
    const c: CardConfig = { ...CONFIG, tree: [{ entity: "sensor.subcuadro_potencia", children: [{ entity: "sensor.calentador_agua_power", children: [{ entity: "sensor.jacuzzi_power" }] }] }] };
    const t = buildTree(c, fakeHass(EXAMPLE));
    expect(t.children[0].children[0].children[0]).toMatchObject({ id: "0.0.0", watts: 34 });
    expect(last(t.children[0].children[0].children)).toMatchObject({ id: "0.0.remainder", watts: 566 });
  });
});

describe("consumos sin entidad", () => {
  it("un consumo con entidad vacía (recién añadido en el editor) se ignora", () => {
    const c: CardConfig = { ...CONFIG, tree: [...CONFIG.tree, { entity: "" }], };
    c.tree[0] = { ...c.tree[0], children: [...c.tree[0].children!, { entity: "" }] };
    const t = buildTree(c, fakeHass(EXAMPLE));
    expect(t.children.map((n) => n.name)).toEqual(["Subcuadro", "Aerotermia", "Cocina", "Despacho", "Domótica", "Otros"]);
    expect(t.children[0].children).toHaveLength(6);
  });
});

describe("unidades", () => {
  it("convierte kW a W y Wh a kWh", () => {
    expect(readWatts(fakeHass({ "sensor.x": ["1.2", "kW"] }), "sensor.x")).toBe(1200);
    expect(readWatts(fakeHass({ "sensor.x": ["500", "W"] }), "sensor.x")).toBe(500);
    expect(readKwh(fakeHass({ "sensor.y": ["893", "Wh"] }), "sensor.y")).toBeCloseTo(0.893);
    expect(readKwh(fakeHass({ "sensor.y": ["42.04", "kWh"] }), "sensor.y")).toBeCloseTo(42.04);
  });

  it("sin entidad o inexistente → null", () => {
    expect(readWatts(fakeHass({}), undefined)).toBeNull();
    expect(readKwh(fakeHass({}), "sensor.nada")).toBeNull();
  });
});

describe("topValues", () => {
  it("lee el bloque de arriba", () =>
    expect(topValues(CONFIG, fakeHass(EXAMPLE))).toEqual({ solar: 3200, gridIn: 0, gridOut: 54, charge: 1100, discharge: 0, soc: 95, lowCarbon: 82 }));

  it("potencias negativas de red y batería → 0, y null → 0", () => {
    const v = topValues(CONFIG, fakeHass({ ...EXAMPLE, "sensor.grid_exportacion": "-54", "sensor.bateria_carga": "unavailable" }));
    expect(v.gridOut).toBe(0);
    expect(v.charge).toBe(0);
  });

  it("sin eco ni SoC → null", () => {
    const v = topValues({ ...CONFIG, eco: undefined }, fakeHass({ ...EXAMPLE, "sensor.victron_mqtt_system_0_system_dc_battery_soc": "unknown" }));
    expect(v.lowCarbon).toBeNull();
    expect(v.soc).toBeNull();
  });
});

describe("topFlows", () => {
  it("reparte la solar entre red, batería y casa", () =>
    expect(topFlows({ solar: 3200, gridIn: 0, gridOut: 54, charge: 1100, discharge: 0, soc: 95, lowCarbon: 82 })).toEqual({
      solarToGrid: 54, solarToBattery: 1100, solarToHome: 2046, gridToBattery: 0, batteryToGrid: 0, gridToHome: 0, batteryToHome: 0, gridNonFossil: 0,
    }));

  it("de noche: batería y red alimentan la casa", () =>
    expect(topFlows({ solar: 0, gridIn: 200, gridOut: 0, charge: 0, discharge: 800, soc: 60, lowCarbon: null })).toEqual({
      solarToGrid: 0, solarToBattery: 0, solarToHome: 0, gridToBattery: 0, batteryToGrid: 0, gridToHome: 200, batteryToHome: 800, gridNonFossil: 0,
    }));

  it("bajas emisiones: la parte limpia de lo que entra de la red (100 − % fósil), como power-flow-card-plus", () =>
    expect(topFlows({ solar: 0, gridIn: 1000, gridOut: 0, charge: 0, discharge: 0, soc: 60, lowCarbon: 82 }).gridNonFossil).toBe(820));

  it("la red carga la batería si no llega la solar", () =>
    expect(topFlows({ solar: 300, gridIn: 1000, gridOut: 0, charge: 900, discharge: 0, soc: 20, lowCarbon: null })).toMatchObject({
      solarToBattery: 300, gridToBattery: 600, gridToHome: 400, solarToHome: 0,
    }));
});
