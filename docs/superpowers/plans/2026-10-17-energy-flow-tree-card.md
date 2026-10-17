# energy-flow-tree-card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarjeta Lovelace con las bolitas de power-flow-card-plus arriba y un Sankey vertical de consumos anidados que sale de la casa, puesta en el Resumen y en una pestaña Solar del Serweck V2 rehecha.

**Architecture:** Funciones puras y probadas para leer valores (`model.ts`), velocidad y estado de las líneas (`flow.ts`) y geometría (`layout.ts`). Un render SVG (`render.ts`) y el elemento Lit (`energy-flow-tree-card.ts`) las juntan, y el editor (`editor.ts`) edita el YAML. Los paneles se cambian en el repo Paneles (pestaña Solar) y desde Chrome (Resumen), con el procedimiento habitual.

**Tech Stack:** Lit 3 + TypeScript (ES2020), rollup + terser, vitest + jsdom, custom-card-helpers; Python + pytest y PyYAML en Paneles.

**Spec:** `D:/0-Proyectos/0-Obsidian/Obsidian-ClaudeCode/02-Projects/2026-10-17-energy-flow-tree-card-diseno.md`

## Global Constraints

- Repo nuevo `D:/0-Proyectos/Domotica/Homeassistant/Componentes Visuales/energy-flow-tree-card`. Misma estructura, scripts y dependencias que `floorplan-lights-card` (`package.json`, `rollup.config.js`, `tsconfig.json` con target ES2020, `vitest.config.ts`, `hacs.json`), y `dist/energy-flow-tree-card.js` incluido en el repo.
- Etiqueta `energy-flow-tree-card`; tipo `custom:energy-flow-tree-card`; versión inicial `0.1.0`.
- Textos de la tarjeta y mensajes de error en español.
- Las líneas imitan a power-flow-card-plus. Valores por defecto: `min_flow_rate: 0.75`, `max_flow_rate: 6`, `min_expected_power: 0.01`, `max_expected_power: 11000`, `watt_threshold: 10`, `display_zero_lines: {mode: transparency, transparency: 83}`, `disable_dots: false`, `clickable_entities: true`.
- Otros y restos nunca por debajo de 0. El Sankey es la variante A del boceto `solar-sankey.html`: corrientes que acaban en barras con el nombre y los vatios.
- Commits en el repo de la tarjeta: `git -c user.name=serweck -c user.email=serweck@gmail.com commit`, con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push solo con `GH_TOKEN=$(gh auth token -u serweck)` y URL con token, con `timeout 60`.
- Paneles: copia de seguridad del Resumen antes de editarlo. El despliegue del V2 sigue `tools/deploy.md` y se para si hay ediciones hechas desde la interfaz.
- El V2 solo lo ven `serweck` y `Alexis`. El encabezado «Solar» del Resumen lleva esa misma restricción por usuarios.

## Review Focus

1. Un sensor `unavailable`, `unknown` o no numérico: el nodo enseña «—», cuenta como 0 en las sumas y la tarjeta no falla. → test en Task 2.
2. Un sensor en kW o en kWh (en la previsión): los vatios se convierten (kW × 1000) y la energía se muestra en kWh. → test en Task 2.
3. Una entidad que no existe en `hass.states` (por ejemplo, renombrada): igual que en el punto 1, nunca una excepción. → test en Task 2.
4. Una fila del Sankey con más hijos de los que caben en 400 px, o la casa a 0 W: los textos no se pisan, las bandas siguen cuadrando y no aparece ningún NaN. → test en Task 4.
5. Potencias negativas en sensores de red o batería (algunos sensores llevan signo): se usa `max(0, x)` en cada lado. → test en Task 2.

---

### Task 1: Repo, tipos y validación de la configuración

**Files:**
- Create: `package.json`, `rollup.config.js`, `tsconfig.json`, `vitest.config.ts`, `hacs.json` (`{"name": "Energy Flow Tree Card", "render_readme": true, "filename": "energy-flow-tree-card.js"}`), `.gitignore` (`node_modules/`), `LICENSE` (MIT, Serweck)
- Create: `src/types.ts`, `src/config.ts`
- Test: `test/config.test.ts`, `test/fixtures.ts`

**Interfaces:**
- Produces (`src/types.ts`):

```ts
export interface NodeConfig { entity: string; name?: string; icon?: string; color?: string; children?: NodeConfig[] }
export interface CardConfig {
  type: string; title?: string;
  grid: { import: string; export: string };
  battery: { discharge: string; charge: string; soc: string };
  solar: { entity: string; secondary?: string };
  home: { entity: string; secondary?: string };
  eco?: { fossil: string };
  produced_today?: string;
  forecast?: { today: string; tomorrow: string };
  show_forecast?: boolean;            // por defecto true
  tree: NodeConfig[];
  tap_action?: { action: string; navigation_path?: string };
  clickable_entities?: boolean;
  min_flow_rate?: number; max_flow_rate?: number;
  min_expected_power?: number; max_expected_power?: number;
  watt_threshold?: number;
  display_zero_lines?: { mode: "transparency" | "hide"; transparency?: number };
  disable_dots?: boolean;
}
export type FlowSettings = Required<Pick<CardConfig, "min_flow_rate" | "max_flow_rate" | "min_expected_power" | "max_expected_power" | "watt_threshold" | "display_zero_lines" | "disable_dots">>;
```

- Produces (`src/config.ts`): `validateConfig(c: Partial<CardConfig> | undefined): CardConfig` (lanza `Error`), `flowSettings(c: CardConfig): FlowSettings` (completa los valores por defecto de Global Constraints).
- Produces (`test/fixtures.ts`): `CONFIG`, la configuración real del diseño (tabla de entidades y árbol inicial con Subcuadro, Aerotermia, Cocina, Despacho y Domótica), y `fakeHass(states: Record<string, string | [string, string]>)`, que devuelve un `hass` con `states[e] = {state, attributes: {unit_of_measurement}}`.

- [ ] **Step 1: Write the failing tests**

```ts
it("acepta la configuración del diseño", () => expect(validateConfig(CONFIG)).toBe(CONFIG));
it.each([
  [{ ...CONFIG, grid: undefined }, "grid.import y grid.export son obligatorios"],
  [{ ...CONFIG, home: { entity: "" } }, "home.entity es obligatorio"],
  [{ ...CONFIG, tree: "x" }, "tree: tiene que ser una lista"],
  [{ ...CONFIG, tree: [{ name: "Sin entidad" }] }, "tree[0].entity es obligatorio"],
  [{ ...CONFIG, tree: [{ entity: "sensor.a", children: [{}] }] }, "tree[0].children[0].entity es obligatorio"],
])("rechaza configuraciones incompletas", (c, msg) => expect(() => validateConfig(c as never)).toThrow(msg));
it("valores por defecto de las líneas", () => expect(flowSettings(CONFIG)).toEqual({
  min_flow_rate: 0.75, max_flow_rate: 6, min_expected_power: 0.01, max_expected_power: 11000,
  watt_threshold: 10, display_zero_lines: { mode: "transparency", transparency: 83 }, disable_dots: false }));
```

`battery` y `solar` se validan igual que `grid` y `home`.

- [ ] **Step 2:** `npm install` y luego `npx vitest run test/config.test.ts`. Expected: FAIL (no existe `src/config.ts`).
- [ ] **Step 3:** Implementar `validateConfig` y `flowSettings` en `src/config.ts`. La validación del árbol es recursiva, con la ruta del nodo (`tree[i].children[j]`) en el mensaje.
- [ ] **Step 4:** `npx vitest run test/config.test.ts`. Expected: PASS.
- [ ] **Step 5:** `git init`, y commit «chore: estructura del repo, tipos y validación de la configuración».

### Task 2: Modelo, valores del árbol y flujos de arriba

**Files:**
- Create: `src/model.ts`
- Test: `test/model.test.ts`

**Interfaces:**
- Consumes: `CardConfig`, `NodeConfig` (Task 1).
- Produces:

```ts
type Hass = { states: Record<string, { state: string; attributes: Record<string, unknown> }> };
export function readWatts(hass: Hass, entity?: string): number | null;   // W; kW×1000; no numérico o inexistente → null
export function readKwh(hass: Hass, entity?: string): number | null;     // kWh; Wh/1000
export interface TreeValue { id: string; name: string; entity?: string; icon?: string; color?: string;
  watts: number | null; kind: "home" | "load" | "others" | "remainder"; children: TreeValue[] }
export function buildTree(c: CardConfig, hass: Hass): TreeValue;          // raíz = casa
export interface TopValues { solar: number; gridIn: number; gridOut: number; charge: number; discharge: number; soc: number | null; lowCarbon: number | null }
export function topValues(c: CardConfig, hass: Hass): TopValues;          // max(0,x); null → 0; lowCarbon = 100 − % fósil
export interface TopFlows { solarToHome: number; solarToBattery: number; solarToGrid: number; gridToHome: number; gridToBattery: number; batteryToHome: number; batteryToGrid: number }
export function topFlows(v: TopValues): TopFlows;
```

`id` es la ruta en el árbol (`"0"`, `"0.3"`, `"others"`, `"0.remainder"`). El nombre por defecto es el `friendly_name`, y si no hay, la entidad.

Reparto de `topFlows`, en este orden:
- `solarToGrid = min(gridOut, solar)`
- `solarToBattery = min(charge, solar − solarToGrid)`
- `solarToHome = max(0, solar − solarToGrid − solarToBattery)`
- `gridToBattery = max(0, charge − solarToBattery)`
- `batteryToGrid = max(0, gridOut − solarToGrid)`
- `gridToHome = max(0, gridIn − gridToBattery)`
- `batteryToHome = max(0, discharge − batteryToGrid)`

- [ ] **Step 1: Write the failing tests**

```ts
it("Otros = casa − nivel 1, y resto = padre − hijos, sin bajar de 0", () => {
  const t = buildTree(CONFIG, fakeHass({ ...HOME_1900, "sensor.subcuadro_potencia": "820", "sensor.calentador_agua_power": "600",
    "sensor.metter_circuito_piscina_power": "150", "sensor.socket_garaje_aerotermia_bomba_power": "36", "sensor.jacuzzi_power": "34",
    "sensor.socket_garaje_calentador_agua_2_power": "0", "sensor.power_metter_01_power_a": "300", "sensor.power_metter_01_power_b": "0",
    "sensor.socket_despacho_power": "330", "sensor.socket_salon_domotica_power": "111" }));
  expect(t.children.at(-1)).toMatchObject({ kind: "others", watts: 339 });
  expect(t.children[0].children.at(-1)).toMatchObject({ kind: "remainder", watts: 0 });
});
it("hijos que suman más que el padre: resto 0", ...);            // subcuadro 100, ACS 600 → remainder.watts === 0
it("un nodo sin hijos no lleva resto", ...);                      // Aerotermia.children === []
it("sensor unavailable, no numérico o inexistente → null, cuenta 0", ...);   // ACS "unavailable" → watts null; resto = 820 − 186
it("convierte kW a W y Wh a kWh", () => {
  expect(readWatts(fakeHass({ "sensor.x": ["1.2", "kW"] }), "sensor.x")).toBe(1200);
  expect(readKwh(fakeHass({ "sensor.y": ["893", "Wh"] }), "sensor.y")).toBeCloseTo(0.893);
});
it("potencias negativas de red y batería → 0", ...);              // grid_exportacion "-54" → gridOut 0
it("eco: 100 − % fósil", ...);                                     // fósil "18" → lowCarbon 82
it("reparto de flujos", () => expect(topFlows({ solar: 3200, gridIn: 0, gridOut: 54, charge: 1100, discharge: 0, soc: 95, lowCarbon: 82 }))
  .toEqual({ solarToGrid: 54, solarToBattery: 1100, solarToHome: 2046, gridToBattery: 0, batteryToGrid: 0, gridToHome: 0, batteryToHome: 0 }));
```

- [ ] **Step 2:** `npx vitest run test/model.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar `src/model.ts` con las firmas de arriba.
- [ ] **Step 4:** `npx vitest run test/model.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit «feat: modelo de valores, Otros, restos y flujos de arriba».

### Task 3: Velocidad y estado de las líneas

**Files:**
- Create: `src/flow.ts`
- Test: `test/flow.test.ts`

**Interfaces:**
- Consumes: `FlowSettings` (Task 1).
- Produces:
  - `flowDuration(watts: number, s: FlowSettings): number`: segundos por recorrido, con el modelo nuevo de power-flow-card-plus. Por encima de `max_expected_power` devuelve `min_flow_rate`; si no, `(w − minP) × (minRate − maxRate) / (maxP − minP) + maxRate`, acotado a `[minRate, maxRate]`.
  - `lineState(watts: number | null, s: FlowSettings): { active: boolean; opacity: number; dots: boolean }`. Activa si `watts > watt_threshold`. Inactiva: `opacity = 1 − transparency/100` en modo transparency y 0 en modo hide. Los puntos solo salen si está activa y `!disable_dots`.

- [ ] **Step 1: Write the failing tests**

```ts
const S = flowSettings(CONFIG);
it("6 s con potencia mínima y 0,75 s a 11 kW o más", () => {
  expect(flowDuration(0.01, S)).toBeCloseTo(6); expect(flowDuration(11000, S)).toBeCloseTo(0.75);
  expect(flowDuration(20000, S)).toBe(0.75); expect(flowDuration(5500.005, S)).toBeCloseTo(3.375, 2);
});
it("por debajo de 10 W: casi transparente (83 %) y sin puntos", () =>
  expect(lineState(9, S)).toEqual({ active: false, opacity: 0.17, dots: false }));
it("null cuenta como sin flujo", () => expect(lineState(null, S).active).toBe(false));
it("activa: opaca y con puntos", () => expect(lineState(500, S)).toEqual({ active: true, opacity: 1, dots: true }));
it("modo hide y disable_dots", ...);
```

- [ ] **Step 2:** `npx vitest run test/flow.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar `src/flow.ts`.
- [ ] **Step 4:** `npx vitest run test/flow.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit «feat: velocidad de los puntos y estado de las líneas como power-flow-card-plus».

### Task 4: Geometría de las bolitas y del Sankey

**Files:**
- Create: `src/layout.ts`
- Test: `test/layout.test.ts`

**Interfaces:**
- Consumes: `TreeValue`, `TopFlows` (Task 2).
- Produces:

```ts
export interface Ball { id: "grid" | "eco" | "battery" | "solar" | "home"; cx: number; cy: number; r: number }
export interface Bar { id: string; x: number; y: number; w: number; depth: number; zero: boolean }    // depth 0 = barra de la casa
export interface Band { id: string; parent: string; d: string; center: string; watts: number | null; zero: boolean }  // d: área cerrada; center: curva para el brillo
export interface Layout { width: number; height: number; balls: Record<Ball["id"], Ball>;
  topLines: Record<keyof TopFlows, string>; bars: Bar[]; bands: Band[]; links: string[]; forecastY: number }
export function layoutCard(tree: TreeValue, width?: number /* 400 */): Layout;
```

Valores fijos (los del boceto `solar-sankey.html`):
- bolitas: red (200, 36) r28, eco (290, 30) r20, batería (72, 112) r28, solar (328, 112) r28 y casa (200, 178) r32;
- barra de la casa en y = 216, de alto 6, con un ancho del 60 % de `width` y centrada;
- separación entre filas: 96 px desde la barra de origen hasta las barras de destino; las barras de destino miden 8 de alto, y debajo van 2 líneas de texto (unos 36 px);
- escala: `px/W = ancho de la casa / vatios de la casa`. Una banda con consumo nunca baja de 2 px. Si la suma de los hijos supera el ancho del padre, se reescala esa fila;
- corriente con forma de cúbica vertical: `M sx0,y0 C sx0,m tx0,m tx0,y1 L tx1,y1 C tx1,m sx1,m sx1,y0 Z`, con `m` a mitad de altura;
- los orígenes de las bandas se apilan sin huecos sobre la barra del padre, en el orden del árbol;
- un padre con hijos baja con una línea corta (`links`) desde su barra de destino hasta su barra de origen de la fila siguiente, que tiene su mismo ancho.

Colocación: cada fila reparte los destinos a lo ancho, con los hijos de cada padre seguidos y en el orden del árbol. Los centros de los destinos han de estar ordenados como sus orígenes, para que las corrientes no se crucen. Los textos de dos barras vecinas no se pueden pisar: hacen falta al menos 52 px entre centros. Si no caben, se amplía `width` del SVG, que se escala para caber en la tarjeta.

- [ ] **Step 1: Write the failing tests** (sobre `buildTree(CONFIG, …)` con los vatios del ejemplo de la Task 2 y sobre un árbol con dos padres con hijos y un nieto)

```ts
it("las bandas de un padre se apilan sin huecos y suman su barra", ...);    // orígenes contiguos; Σ anchos ≈ barra del padre (±0,5 px)
it("cada banda acaba exactamente en su barra", ...);                        // extremos inferiores de d = x y x + w de la barra de destino
it("las corrientes de una fila no se cruzan", ...);                         // orden de los orígenes = orden de los destinos
it("consumo 0 → zero: true y banda de ancho 0", ...);                       // Cocina y ACS 2
it("una banda con 1 W tiene 2 px de ancho mínimo", ...);
it("los centros de barras vecinas están a 52 px o más", ...);              // también con 8 hijos en una fila
it("las bolitas están en las posiciones del diseño", () => expect(layoutCard(tree).balls.grid).toMatchObject({ cx: 200, cy: 36, r: 28 }));
it("con la casa a 0 W no divide por cero", ...);                            // todas las bandas zero, sin NaN en d
```

- [ ] **Step 2:** `npx vitest run test/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar `src/layout.ts`.
- [ ] **Step 4:** `npx vitest run test/layout.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit «feat: geometría de las bolitas y del Sankey de consumos».

### Task 5: Render SVG y tarjeta

**Files:**
- Create: `src/render.ts`, `src/styles.ts`, `src/energy-flow-tree-card.ts`
- Test: `test/card.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `renderSvg(layout: Layout, tree: TreeValue, top: TopValues, flows: TopFlows, s: FlowSettings): TemplateResult`.
  - El elemento `energy-flow-tree-card`, con `setConfig(c)` (llama a `validateConfig`), `set hass`, `getCardSize()`, `getGridOptions()` (`{columns: 12, min_columns: 6}`), `static getStubConfig()` y `getConfigElement()`. Exporta `CARD_TAG` y `CARD_VERSION = "0.1.0"`, y se registra en `window.customCards`.

Dibujo:
- **Bolitas:** las líneas de `topLines` son `<path>` continuos. Los puntos son `<circle r="2.4"><animateMotion dur="${flowDuration}s" repeatCount="indefinite" path=…/></circle>`, en el sentido del flujo, y solo si `lineState.dots`. La opacidad de cada línea sale de `lineState`.
- **Contenido de las bolitas:** la red enseña «→ entrada» y «← salida»; la batería, «SoC %» y la potencia con flecha; la solar y la casa, su dato secundario arriba; eco, «% bajas emisiones».
- **Sankey:**
  - cada banda es un `<path d>` con un degradado del color del padre al del hijo y opacidad 0,55;
  - el brillo es un `<path d=center>` con trazo blanco al 35 %, `stroke-dasharray="2 10"` y una animación CSS de `stroke-dashoffset` de `flowDuration(watts)` segundos. Sin brillo si `lineState.active` es falso;
  - una banda `zero` se dibuja como línea fina de opacidad `lineState.opacity`;
  - las barras van opacas, con el color del nodo, y apagadas (0,3) si `zero`. Otros va en gris;
  - el texto va debajo de cada barra: el nombre y los vatios, con unidad en el nivel 1, sin ella en los demás, y «—» si es `null`.
- Título «Solar» y, a la derecha, «Producido hoy X kWh».
- Pronóstico al pie (hoy y mañana, en kWh), solo si `show_forecast !== false` y hay `forecast`.

Interacción:
- Clic en una bolita, en una barra o en su texto con entidad → evento `hass-more-info` `{entityId}`, si `clickable_entities !== false`.
- Clic en el fondo → `handleAction` de custom-card-helpers con `tap_action`, si existe.

- [ ] **Step 1: Write the failing tests** (jsdom; el elemento con `CONFIG` y `fakeHass` del ejemplo de la Task 2)

```ts
it("dibuja cinco bolitas, una barra por nodo y una banda por hijo", ...);   // [data-id] cuenta = layout
it("Otros enseña 339 W y el resto del Subcuadro, 0", ...);
it("las bandas sin consumo no tienen brillo y su línea tiene opacidad 0.17", ...);
it("el brillo del ACS dura flowDuration(600) y el punto solar→casa, flowDuration(2046)", ...);
it("clic en la barra del ACS dispara hass-more-info con sensor.calentador_agua_power", ...);
it("show_forecast: false oculta el pronóstico", ...);
it("con un sensor unavailable enseña «—» y no lanza", ...);
it("setConfig con árbol mal formado lanza el error de validateConfig", ...);
```

- [ ] **Step 2:** `npx vitest run test/card.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar `src/render.ts`, `src/styles.ts` (colores de las variables del tema de HA, modo día y noche como `floorplan-lights-card`) y `src/energy-flow-tree-card.ts`.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: todo en verde.
- [ ] **Step 5:** Commit «feat: tarjeta energy-flow-tree-card con bolitas y Sankey animados».

### Task 6: Editor visual

**Files:**
- Create: `src/editor.ts` (elemento `energy-flow-tree-card-editor`; la tarjeta lo devuelve en `getConfigElement()`)
- Test: `test/editor.test.ts`

**Interfaces:**
- Consumes: `CardConfig`, `NodeConfig`.
- Produces:
  - funciones puras en `src/editor.ts`, exportadas para los tests: `addChild(tree: NodeConfig[], path: number[]): NodeConfig[]`, `removeNode(tree, path)`, `moveNode(tree, path, delta: -1 | 1)` y `updateNode(tree, path, patch: Partial<NodeConfig>)`. Son inmutables: devuelven un árbol nuevo.
  - En la interfaz: un `ha-form` para las entidades de arriba, `title`, `show_forecast` y `tap_action`, y una lista anidada para el árbol. Cada nodo tiene `ha-entity-picker` (dominio `sensor`), nombre, color, icono y los botones añadir hijo, subir, bajar y quitar. Cada cambio dispara `config-changed`.

- [ ] **Step 1: Write the failing tests**

```ts
it("addChild añade un hijo vacío al Subcuadro", () => expect(addChild(CONFIG.tree, [0])[0].children!.at(-1)).toEqual({ entity: "" }));
it("removeNode quita a Cocina", ...);  it("moveNode sube Despacho", ...);  it("updateNode renombra sin tocar el original", ...);
it("el editor dispara config-changed al quitar un nodo", ...);
```

- [ ] **Step 2:** `npx vitest run test/editor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar `src/editor.ts`.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit «feat: editor visual con el árbol de consumos».

### Task 7: Publicar e instalar en HA

**Files:**
- Create: `README.md` (qué es, instalación por HACS, configuración en YAML con el ejemplo del diseño, opciones de las líneas), `CHANGELOG.md`, `preview.html` (como en `floorplan-lights-card`, con estados simulados)
- Modify: `dist/energy-flow-tree-card.js` (build)

- [ ] **Step 1:** `npm run build`. Abrir `preview.html` con `npm run preview` y comprobarlo a 400 px y en escritorio: puntos moviéndose en las líneas de las bolitas, bandas del Sankey que cuadran con sus barras y brillo moviéndose.
- [ ] **Step 2:** Commit «docs: README y build 0.1.0».
- [ ] **Step 3:** Crear el repo público `serweck/energy-flow-tree-card` con `GH_TOKEN=$(gh auth token -u serweck) gh repo create serweck/energy-flow-tree-card --public`. Hacer push con la URL con token y `timeout 60`, y después `gh release create v0.1.0 dist/energy-flow-tree-card.js`.
- [ ] **Step 4:** En HA, desde Chrome: `hacs/repositories/add` (categoría `plugin`) y `hacs/repository/download`. Comprobar que el recurso `/hacsfiles/energy-flow-tree-card/energy-flow-tree-card.js` está en los recursos de Lovelace.

### Task 8: Pestaña Solar del V2

**Files (repo Paneles):**
- Modify: `serweck-v2/views/solar.yaml` (se reescribe; quitar la cabecera «Copia de…»)
- Modify: `tests/test_views.py` (`test_solar_is_exact_copy_of_resumen` pasa a los tests de abajo; el fixture se queda como referencia)
- Modify: `tests/test_build.py` (si `max_columns` pasa a 3, quitar `solar` de la excepción)

**Interfaces:**
- Consumes: `custom:energy-flow-tree-card` con la configuración de `test/fixtures.ts` `CONFIG`, más `show_forecast: false`.

- [ ] **Step 1: Write the failing tests**

```python
def test_solar_sections_in_design_order():
    heads = [s["cards"][0].get("heading") for s in _view("solar")["sections"][1:]]
    assert heads == ["Pronóstico", "Ahora", "MPPT", "Batería y MultiPlus", "Diaria", "Semanal", "Mensual", "Anual", "Total",
                     "Tarifas", "Consumos Diarios Casa", "Jacuzzi", "Calentador Agua", "Aerotermia", "Cocina", "Piscina"]

def test_solar_flow_card_first_without_forecast():
    card = _view("solar")["sections"][0]["cards"][0]
    assert card["type"] == "custom:energy-flow-tree-card" and card["show_forecast"] is False
    assert [n["entity"] for n in card["tree"]] == ["sensor.subcuadro_potencia", "sensor.power_metter_01_power_a",
        "sensor.power_metter_01_power_b", "sensor.socket_despacho_power", "sensor.socket_salon_domotica_power"]
    assert "power-flow-card-plus" not in json.dumps(_view("solar")) and "sankey-chart" not in json.dumps(_view("solar"))

def test_solar_keeps_old_entities_and_controls():
    old = iter_entity_ids(_fixture("resumen-solar-view.json")) - {"sensor.electricity_maps_porcentaje_de_combustibles_fosiles_de_la_red"}
    assert old <= iter_entity_ids(_view("solar"))

def test_solar_adds_forecast_mppt_and_multiplus_data():
    ids = iter_entity_ids(_view("solar"))
    assert {"sensor.solcast_pv_forecast_pronostico_del_tiempo_restante_para_hoy", "sensor.solcast_pv_forecast_pronosticar_esta_hora",
            "sensor.solcast_pv_forecast_pronostico_de_la_proxima_hora",
            "sensor.victron_remote_monitoring_produccion_estimada_de_energia_hoy", "sensor.victron_remote_monitoring_consumo_estimado_de_energia_manana",
            "sensor.victron_mqtt_system_0_system_state", "sensor.victron_mqtt_battery_278_battery_time_to_go",
            "sensor.victron_mqtt_vebus_276_vebus_inverter_state", "sensor.victron_mqtt_solarcharger_0_solarcharger_yield_today",
            "sensor.victron_mqtt_solarcharger_279_solarcharger_max_power_today"} <= ids

def test_solar_multiplus_alarms_only_when_triggered():
    # alarmas grid_lost, overload, low_battery y high_temperature: tiles con visibility state_not "no_alarm"
```

La entidad eco se queda dentro de la tarjeta (`eco.fossil`), así que `iter_entity_ids` la encuentra. Si no la encuentra, porque `iter_entity_ids` no la reconoce bajo esa clave, se ajusta el conjunto `old`.

- [ ] **Step 2:** `python -m pytest tests -q`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Reescribir `solar.yaml` en el orden del diseño (sección 1 a ancho completo, `column_span` igual al `max_columns` de la vista). Las secciones de energía por periodo, tarifas y consumos se mueven sin cambios.
- [ ] **Step 4:** `python -m pytest tests -q` y `python tools/build.py`. Expected: todo en verde y sin entidades que falten.
- [ ] **Step 5:** Desplegar según `tools/deploy.md` (pasos 2, 5 y 6) y revisar en pantalla `/dashboard-serweck-v2/solar`, en escritorio y a 412 px (iframe). Commit en Paneles «feat: pestaña Solar rehecha con energy-flow-tree-card, pronóstico y datos del Victron».

### Task 9: Sección Solar en el Resumen

**Files (repo Paneles):**
- Create: `backups/resumen-<fecha>-antes-solar-card.json` (con el receptor `tools/receive.py` de NodeRed-MiniPc, puerto 8768)

- [ ] **Step 1:** Copia de seguridad del Resumen con el receptor.
- [ ] **Step 2:** Desde Chrome (`lovelace/config` y luego `lovelace/config/save`, `url_path: 'lovelace'`), insertar en la vista `home`, en el índice 1 (detrás del bloque de la alarma y el clima, antes de Aerotermia), esta sección: `{type: grid, cards: [heading, card]}`.
  - `heading`: `{type: heading, heading: "Solar", icon: "mdi:solar-power", tap_action: {action: navigate, navigation_path: "/dashboard-serweck-v2/solar"}, visibility: <la misma visibility por usuarios que el encabezado «Luces»>}`.
  - `card`: la configuración `CONFIG`, con `show_forecast: true` y sin `tap_action`.

  Antes de guardar, comprobar que existen todas las entidades.
- [ ] **Step 3:** Revisar en pantalla `/lovelace/home`, en escritorio y a 412 px. El encabezado lleva a `/dashboard-serweck-v2/solar` y, al tocar un círculo, se abre su detalle.
- [ ] **Step 4:** Commit en Paneles de la copia de seguridad: «chore: copia del Resumen antes de añadir la tarjeta Solar».
