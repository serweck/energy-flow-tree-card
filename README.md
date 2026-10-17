# Energy Flow Tree Card

Tarjeta Lovelace para Home Assistant que junta dos formas de ver la energía de casa:

- **Arriba, las bolitas** al estilo de power-flow-card-plus: red (entrada y salida, cada una con su color), bajas emisiones (los vatios limpios que entran de la red), batería, solar y casa, con el anillo de la casa repartido por origen. Las líneas son continuas, con puntos que corren más rápido cuanta más potencia llevan y que se quedan casi transparentes cuando no hay flujo.
- **Debajo de la casa, un Sankey vertical** que reparte el consumo en todos los niveles que quieras: cada consumo puede tener sus propios consumos dentro (un subcuadro, un magnetotérmico de luces…). El grosor de cada corriente es su potencia, con un brillo que corre por dentro.
- **Otros** = consumo de la casa − suma del primer nivel. Cada consumo con hijos tiene su **resto** = consumo − suma de sus hijos. Ninguno de los dos baja de 0.
- **Pronóstico** de hoy y de mañana al pie (opcional) y lo producido hoy en el título.
- Mantener pulsada una bolita, una barra o su nombre abre el detalle de su entidad; tocar la casa oculta o enseña el Sankey.
- `grid.power` / `battery.power` (opcionales): sensor con signo que se abre al mantener la red o la batería.

## Instalación (HACS)

1. HACS → menú ⋮ → *Repositorios personalizados* → `https://github.com/serweck/energy-flow-tree-card`, tipo *Dashboard*.
2. Instala **Energy Flow Tree Card** y recarga el navegador.

## Configuración

```yaml
type: custom:energy-flow-tree-card
title: Solar
grid: { import: sensor.red_entrada, export: sensor.red_salida, name: Red }   # name opcional, también en battery, solar y eco
battery: { discharge: sensor.bateria_descarga, charge: sensor.bateria_carga, soc: sensor.bateria_soc }
solar: { entity: sensor.solar_potencia, secondary: sensor.temperatura_exterior }
home: { entity: sensor.casa_consumo, secondary: sensor.temperatura_interior }
eco: { fossil: sensor.red_porcentaje_fosiles }     # opcional
produced_today: sensor.solar_energia_hoy            # opcional (kWh)
forecast: { today: sensor.pronostico_hoy, tomorrow: sensor.pronostico_manana }   # opcional (kWh)
show_forecast: true                                  # opcional
sankey_open: false                                   # opcional: el Sankey sale cerrado y se abre tocando la casa
today: { import: sensor.red_entrada_hoy, export: sensor.red_salida_hoy, produced: sensor.solar_hoy, consumed: sensor.casa_hoy }   # opcional (kWh)
tree:
  - entity: sensor.subcuadro_potencia
    name: Subcuadro
    color: "#a1887f"
    children:
      - { entity: sensor.termo_potencia, name: ACS }
      - { entity: sensor.piscina_potencia, name: Piscina }
  - { entity: sensor.cocina_potencia, name: Cocina }
  - { entity: sensor.despacho_potencia, name: Despacho }
```

Las potencias pueden estar en W o kW, y las energías en kWh o Wh. Un sensor que no esté disponible se enseña como «—» y cuenta como 0.

### Opciones de las líneas (por defecto, las de power-flow-card-plus)

| Opción | Por defecto | Qué hace |
|---|---|---|
| `min_flow_rate` / `max_flow_rate` | `0.75` / `6` | Segundos por recorrido con mucha / poca potencia |
| `min_expected_power` / `max_expected_power` | `0.01` / `11000` | Potencias (W) entre las que se reparte la velocidad |
| `watt_threshold` | `10` | Por debajo, la línea se considera sin flujo |
| `display_zero_lines` | `{mode: transparency, transparency: 83}` | Sin flujo: casi transparente (o `mode: hide`) |
| `disable_dots` | `false` | Quita los puntos |
| `clickable_entities` | `true` | Tocar abre el detalle de la entidad |
| `tap_action` | — | Acción al tocar el fondo de la tarjeta |

El árbol también se edita desde el editor visual de HA: añadir consumos dentro de otros, subir, bajar, quitar, nombre y color.

## Desarrollo

`npm install`, `npm test`, `npm run build` y `npm run preview` (abre `preview.html` con datos simulados).
