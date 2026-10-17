import { describe, expect, it } from "vitest";
import { layoutCard, type Band, type Bar, type Layout } from "../src/layout";
import { buildTree, type TreeValue } from "../src/model";
import type { CardConfig } from "../src/types";
import { CONFIG, EXAMPLE, fakeHass } from "./fixtures";

const tree = buildTree(CONFIG, fakeHass(EXAMPLE));
const L = layoutCard(tree);

/** Números de un path «M x,y C … L x,y C … Z» en orden. */
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
/** Extremos de una banda: origen izquierdo, destino izquierdo, destino derecho, origen derecho. */
function ends(b: Band) {
  const n = nums(b.d);
  // M sx0,y0 C sx0,m tx0,m tx0,y1 L tx1,y1 C tx1,m sx1,m sx1,y0 Z
  return { sx0: n[0], y0: n[1], tx0: n[6], y1: n[7], tx1: n[8], sx1: n[14] };
}
const bar = (l: Layout, id: string) => l.bars.find((b) => b.id === id && !b.split) as Bar;
const split = (l: Layout, id: string) => l.bars.find((b) => b.id === id && b.split) as Bar;
const bandsOf = (l: Layout, parent: string) => l.bands.filter((b) => b.parent === parent);

function nested(): TreeValue {
  const c: CardConfig = {
    ...CONFIG,
    tree: [
      { entity: "sensor.subcuadro_potencia", children: [{ entity: "sensor.calentador_agua_power", children: [{ entity: "sensor.jacuzzi_power" }] }, { entity: "sensor.metter_circuito_piscina_power" }] },
      { entity: "sensor.socket_despacho_power", children: [{ entity: "sensor.socket_salon_domotica_power" }] },
      { entity: "sensor.power_metter_01_power_a" },
    ],
  };
  return buildTree(c, fakeHass(EXAMPLE));
}

describe("layoutCard", () => {
  it("las bolitas están en las posiciones del diseño", () => {
    // Bolitas de 80 px como power-flow-card-plus: red arriba con bajas emisiones a su derecha, batería y solar abajo, casa en medio.
    expect(L.balls.grid).toMatchObject({ cx: 200, cy: 64, r: 40 });
    expect(L.balls.eco).toMatchObject({ cx: 330, cy: 64, r: 40 });
    expect(L.balls.battery).toMatchObject({ cx: 70, cy: 176, r: 40 });
    expect(L.balls.solar).toMatchObject({ cx: 330, cy: 176, r: 40 });
    expect(L.balls.home).toMatchObject({ cx: 200, cy: 250, r: 40 });
    expect(L.ecoLine).toBe("M 290.00 64 L 240.00 64");
    expect(Object.keys(L.topLines).sort()).toEqual(["batteryToGrid", "batteryToHome", "gridToBattery", "gridToHome", "solarToBattery", "solarToGrid", "solarToHome"]);
  });

  it("la barra de la casa: 60 % del ancho, centrada, bajo la bolita de la casa", () =>
    expect(bar(L, "home")).toMatchObject({ x: 80, y: 310, w: 240, depth: 0 }));

  it("una banda por hijo y una barra por nodo", () => {
    const ids: string[] = [];
    const walk = (n: TreeValue) => n.children.forEach((c) => { ids.push(c.id); walk(c); });
    walk(tree);
    expect(L.bands.map((b) => b.id).sort()).toEqual([...ids].sort());
    expect(L.bars.filter((b) => !b.split).map((b) => b.id).sort()).toEqual(["home", ...ids].sort());
  });

  it("las bandas de un padre se apilan sin huecos y suman su barra", () => {
    for (const [parent, origin] of [["home", bar(L, "home")], ["0", split(L, "0")]] as const) {
      const e = bandsOf(L, parent).map(ends);
      expect(e[0].sx0).toBeCloseTo(origin.x, 1);
      for (let i = 1; i < e.length; i++) expect(e[i].sx0).toBeCloseTo(e[i - 1].sx1, 1);
      expect(e[e.length - 1].sx1).toBeCloseTo(origin.x + origin.w, 0);
    }
  });

  it("cada banda acaba exactamente en su barra", () => {
    for (const b of L.bands) {
      const e = ends(b), t = bar(L, b.id);
      expect(e.tx0).toBeCloseTo(t.x, 1);
      expect(e.tx1).toBeCloseTo(t.x + t.w, 1);
      expect(e.y1).toBeCloseTo(t.y, 1);
    }
  });

  it("las corrientes de una fila no se cruzan", () => {
    for (const parent of ["home", "0"]) {
      const e = bandsOf(L, parent).map(ends);
      for (let i = 1; i < e.length; i++) expect(e[i].tx0).toBeGreaterThanOrEqual(e[i - 1].tx1);
    }
  });

  it("consumo 0 → zero: true y banda de ancho 0", () => {
    for (const id of ["2", "0.3"]) {   // Cocina y ACS 2
      const b = L.bands.find((x) => x.id === id) as Band;
      expect(b.zero).toBe(true);
      const e = ends(b);
      expect(e.sx1 - e.sx0).toBeCloseTo(0, 5);
    }
  });

  it("una banda con 1 W tiene 2 px de ancho mínimo", () => {
    const t = buildTree(CONFIG, fakeHass({ ...EXAMPLE, "sensor.socket_salon_domotica_power": "1" }));
    const e = ends(layoutCard(t).bands.find((b) => b.id === "4") as Band);
    expect(e.sx1 - e.sx0).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it("si los hijos suman más que el padre, la fila se reescala al ancho del padre", () => {
    const t = buildTree(CONFIG, fakeHass({ ...EXAMPLE, "sensor.subcuadro_potencia": "100" }));
    const l = layoutCard(t);
    const e = bandsOf(l, "0").map(ends);
    expect(e[e.length - 1].sx1 - e[0].sx0).toBeCloseTo(split(l, "0").w, 0);
  });

  it("los centros de barras vecinas están a 52 px o más, también con 8 hijos", () => {
    const many: CardConfig = { ...CONFIG, tree: [{ entity: "sensor.subcuadro_potencia", children: Array.from({ length: 8 }, () => ({ entity: "sensor.jacuzzi_power" })) }] };
    for (const l of [L, layoutCard(buildTree(many, fakeHass(EXAMPLE)))]) {
      const rows = new Map<number, number[]>();
      l.bars.filter((b) => !b.split && b.depth > 0).forEach((b) => rows.set(b.y, [...(rows.get(b.y) ?? []), b.x + b.w / 2]));
      for (const cs of rows.values()) {
        const s = [...cs].sort((a, b) => a - b);
        for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(52 - 1e-9);
        expect(s[0]).toBeGreaterThanOrEqual(0);
        expect(s[s.length - 1]).toBeLessThanOrEqual(l.width);
      }
    }
  });

  it("los nombres largos de barras vecinas no se pisan", () => {
    const c: CardConfig = { ...CONFIG, tree: ["Lavavajillas", "Frigorífico cocina", "Termo eléctrico", "Placa de inducción", "Horno"].map((name, i) => ({ entity: `sensor.x${i}`, name })) };
    const l = layoutCard(buildTree(c, fakeHass({ ...EXAMPLE, ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`sensor.x${i}`, "50"])) })));
    const row = l.bars.filter((b) => b.depth === 1).sort((a, b) => a.x - b.x);
    const names = ["Lavavajillas", "Frigorífico cocina", "Termo eléctrico", "Placa de inducción", "Horno", "Otros"];
    // ~5,3 px por carácter a 9,5 px de letra: la mitad de cada texto más la del vecino, con 4 px de aire.
    for (let i = 1; i < row.length; i++) {
      const gap = row[i].x + row[i].w / 2 - (row[i - 1].x + row[i - 1].w / 2);
      expect(gap).toBeGreaterThanOrEqual((names[i - 1].length + names[i].length) * 5.3 / 2 + 4 - 1e-9);
    }
  });

  it("si una fila no cabe, el SVG se ensancha y las bolitas se centran", () => {
    const many: CardConfig = { ...CONFIG, tree: Array.from({ length: 9 }, () => ({ entity: "sensor.jacuzzi_power" })) };
    const l = layoutCard(buildTree(many, fakeHass(EXAMPLE)));
    expect(l.width).toBeGreaterThan(400);
    expect(l.balls.home.cx).toBeCloseTo(l.width / 2, 5);
    expect(l.balls.eco.cx).toBeCloseTo(l.width / 2 + 130, 5);
  });

  it("anidado: cada profundidad es una fila, los hijos de cada padre seguidos y en orden", () => {
    const l = layoutCard(nested());
    const ys = (ids: string[]) => ids.map((id) => bar(l, id).y);
    expect(new Set(ys(["0", "1", "2", "others"])).size).toBe(1);
    expect(new Set(ys(["0.0", "0.1", "0.remainder", "1.0", "1.remainder"])).size).toBe(1);
    expect(bar(l, "0.0.0").y).toBeGreaterThan(bar(l, "0.0").y);
    const xs = ["0.0", "0.1", "0.remainder", "1.0", "1.remainder"].map((id) => bar(l, id).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(l.links.length).toBe(3);  // Subcuadro, ACS y Despacho bajan a su fila
  });

  it("ninguna barra se sale del dibujo, aunque sea muy ancha", () => {
    const big = buildTree(CONFIG, fakeHass({ ...EXAMPLE, "sensor.subcuadro_potencia": "1700", "sensor.calentador_agua_power": "1500" }));
    for (const l of [L, layoutCard(big)])
      for (const b of l.bars) {
        expect(b.x).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(b.x + b.w).toBeLessThanOrEqual(l.width - 4 + 1e-9);
      }
  });

  it("con la casa a 0 W no divide por cero", () => {
    const zeros = Object.fromEntries(Object.entries(EXAMPLE).map(([k, v]) => [k, Array.isArray(v) ? v : "0"])) as typeof EXAMPLE;
    const l = layoutCard(buildTree(CONFIG, fakeHass(zeros)));
    expect(l.bands.every((b) => b.zero)).toBe(true);
    expect(JSON.stringify(l)).not.toContain("NaN");
  });

  it("el pronóstico va debajo de la última fila", () => {
    const lowest = Math.max(...L.bars.map((b) => b.y));
    expect(L.forecastY).toBeGreaterThan(lowest + 8 + 30);
    expect(L.height).toBeGreaterThan(L.forecastY);
  });
});
