import type { CardConfig } from "../src/types";

/** La configuración del diseño (tabla de entidades y árbol inicial). */
export const CONFIG: CardConfig = {
  type: "custom:energy-flow-tree-card",
  title: "Solar",
  grid: { import: "sensor.grid_importacion", export: "sensor.grid_exportacion" },
  battery: { discharge: "sensor.bateria_descarga", charge: "sensor.bateria_carga", soc: "sensor.victron_mqtt_system_0_system_dc_battery_soc" },
  solar: { entity: "sensor.victron_mqtt_system_0_system_dc_pv_power", secondary: "sensor.temperatura_exterior_termometros" },
  home: { entity: "sensor.victron_mqtt_system_0_system_consumption_power_l1", secondary: "sensor.temperatura_termostato" },
  eco: { fossil: "sensor.electricity_maps_porcentaje_de_combustibles_fosiles_de_la_red" },
  produced_today: "sensor.pv_power_energia_energy_daily",
  forecast: { today: "sensor.solcast_pv_forecast_pronostico_hoy", tomorrow: "sensor.solcast_pv_forecast_pronostico_manana" },
  tree: [
    {
      entity: "sensor.subcuadro_potencia", name: "Subcuadro", color: "#a1887f",
      children: [
        { entity: "sensor.calentador_agua_power", name: "ACS", color: "#64b5f6" },
        { entity: "sensor.jacuzzi_power", name: "Jacuzzi", color: "#f06292" },
        { entity: "sensor.socket_garaje_aerotermia_bomba_power", name: "Bomba", color: "#ffd54f" },
        { entity: "sensor.socket_garaje_calentador_agua_2_power", name: "ACS 2", color: "#4fc3f7" },
        { entity: "sensor.metter_circuito_piscina_power", name: "Piscina", color: "#4dd0e1" },
      ],
    },
    { entity: "sensor.power_metter_01_power_a", name: "Aerotermia", color: "#e57373" },
    { entity: "sensor.power_metter_01_power_b", name: "Cocina", color: "#ffb74d" },
    { entity: "sensor.socket_despacho_power", name: "Despacho", color: "#9575cd" },
    { entity: "sensor.socket_salon_domotica_power", name: "Domótica", color: "#81c784" },
  ],
};

export type FakeHass = { states: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }> };

/** hass con estados simulados: "820" (W por defecto) o ["1.2", "kW"]. */
export function fakeHass(states: Record<string, string | [string, string]>): FakeHass {
  const out: FakeHass["states"] = {};
  for (const [id, v] of Object.entries(states)) {
    const [state, unit] = Array.isArray(v) ? v : [v, "W"];
    out[id] = { entity_id: id, state, attributes: { unit_of_measurement: unit, friendly_name: id } };
  }
  return { states: out };
}

/** Los vatios del ejemplo del diseño: casa 1,9 kW, solar 3,2 kW, batería cargando 1,1 kW. */
export const EXAMPLE: Record<string, string | [string, string]> = {
  "sensor.victron_mqtt_system_0_system_consumption_power_l1": "1900",
  "sensor.victron_mqtt_system_0_system_dc_pv_power": "3200",
  "sensor.grid_importacion": "0",
  "sensor.grid_exportacion": "54",
  "sensor.bateria_carga": "1100",
  "sensor.bateria_descarga": "0",
  "sensor.victron_mqtt_system_0_system_dc_battery_soc": ["95", "%"],
  "sensor.electricity_maps_porcentaje_de_combustibles_fosiles_de_la_red": ["18", "%"],
  "sensor.temperatura_exterior_termometros": ["19.4", "°C"],
  "sensor.temperatura_termostato": ["24.2", "°C"],
  "sensor.pv_power_energia_energy_daily": ["18.4", "kWh"],
  "sensor.grid_importacion_energia_energy_daily": ["0.12", "kWh"],
  "sensor.grid_exportacion_energia_energy_daily": ["18.17", "kWh"],
  "sensor.consumo_electricidad_energia_energy_daily": ["14.34", "kWh"],
  "sensor.solcast_pv_forecast_pronostico_hoy": ["42.04", "kWh"],
  "sensor.solcast_pv_forecast_pronostico_manana": ["20.52", "kWh"],
  "sensor.subcuadro_potencia": "820",
  "sensor.calentador_agua_power": "600",
  "sensor.metter_circuito_piscina_power": "150",
  "sensor.socket_garaje_aerotermia_bomba_power": "36",
  "sensor.jacuzzi_power": "34",
  "sensor.socket_garaje_calentador_agua_2_power": "0",
  "sensor.power_metter_01_power_a": "300",
  "sensor.power_metter_01_power_b": "0",
  "sensor.socket_despacho_power": "330",
  "sensor.socket_salon_domotica_power": "111",
};
