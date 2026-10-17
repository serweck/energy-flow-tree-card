import { describe, expect, it } from "vitest";
import { addChild, moveNode, removeNode, updateNode } from "../src/editor";
import "../src/editor";
import type { CardConfig } from "../src/types";
import { CONFIG, EXAMPLE, fakeHass } from "./fixtures";

const names = (tree: CardConfig["tree"]) => tree.map((n) => n.name);

describe("funciones del árbol", () => {
  it("addChild añade un hijo vacío al Subcuadro", () =>
    expect(addChild(CONFIG.tree, [0])[0].children!.slice(-1)[0]).toEqual({ entity: "" }));

  it("addChild con ruta vacía añade un consumo de nivel 1", () =>
    expect(addChild(CONFIG.tree, []).slice(-1)[0]).toEqual({ entity: "" }));

  it("addChild crea la lista de hijos si no la había", () =>
    expect(addChild(CONFIG.tree, [1])[1].children).toEqual([{ entity: "" }]));

  it("removeNode quita a Cocina", () =>
    expect(names(removeNode(CONFIG.tree, [2]))).toEqual(["Subcuadro", "Aerotermia", "Despacho", "Domótica"]));

  it("removeNode quita un hijo anidado", () =>
    expect(removeNode(CONFIG.tree, [0, 1])[0].children!.map((n) => n.name)).toEqual(["ACS", "Bomba", "ACS 2", "Piscina"]));

  it("moveNode sube Despacho y no pasa del principio", () => {
    expect(names(moveNode(CONFIG.tree, [3], -1))).toEqual(["Subcuadro", "Aerotermia", "Despacho", "Cocina", "Domótica"]);
    expect(moveNode(CONFIG.tree, [0], -1)).toEqual(CONFIG.tree);
  });

  it("updateNode renombra sin tocar el original", () => {
    const t = updateNode(CONFIG.tree, [0, 0], { name: "Calentador" });
    expect(t[0].children![0].name).toBe("Calentador");
    expect(CONFIG.tree[0].children![0].name).toBe("ACS");
  });
});

describe("editor", () => {
  async function mount() {
    const ed = document.createElement("energy-flow-tree-card-editor") as HTMLElement & { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<boolean> };
    ed.setConfig(CONFIG);
    ed.hass = fakeHass(EXAMPLE);
    const events: CardConfig[] = [];
    ed.addEventListener("config-changed", (e) => events.push((e as CustomEvent).detail.config));
    document.body.appendChild(ed);
    await ed.updateComplete;
    return { root: ed.shadowRoot!, events };
  }

  it("enseña cada consumo del árbol con su nivel", async () => {
    const { root } = await mount();
    const rows = Array.from(root.querySelectorAll("[data-path]"));
    expect(rows.map((r) => r.getAttribute("data-path"))).toEqual(["0", "0.0", "0.1", "0.2", "0.3", "0.4", "1", "2", "3", "4"]);
  });

  it("dispara config-changed al quitar un nodo", async () => {
    const { root, events } = await mount();
    (root.querySelector('[data-path="2"] [data-act="remove"]') as HTMLElement).click();
    expect(names(events[0].tree)).toEqual(["Subcuadro", "Aerotermia", "Despacho", "Domótica"]);
  });

  it("dispara config-changed al añadir un hijo y al cambiar el nombre", async () => {
    const { root, events } = await mount();
    (root.querySelector('[data-path="1"] [data-act="child"]') as HTMLElement).click();
    expect(events[0].tree[1].children).toEqual([{ entity: "" }]);
    const input = root.querySelector('[data-path="0.0"] input[name="name"]') as HTMLInputElement;
    input.value = "Termo";
    input.dispatchEvent(new Event("change"));
    expect(events[1].tree[0].children![0].name).toBe("Termo");
  });
});
