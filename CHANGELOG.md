# Changelog

## 0.4.0 · 2026-10-17

- Batería: el porcentaje encima del icono, e icono por niveles de 10 % (con rayo mientras carga).
- Flechas dentro de las bolitas con los iconos de MDI (como power-flow-card-plus) en vez de caracteres.

## 0.3.0 · 2026-10-17

- Las bolitas miden siempre 80 px, como power-flow-card-plus: en pantallas anchas ya no crecen y el espacio lo aprovecha el Sankey.
- Batería: círculo, porcentaje y valor en el color de entrada (cargando) o de salida (descargando).
- La temperatura va más abajo, dentro de la bolita.
- Bajas emisiones sin título.

## 0.2.0 · 2026-10-17

- Bolitas como power-flow-card-plus: 80 px, iconos de MDI (torre eléctrica, casa, panel solar, batería según la carga y hoja) y nombre fuera del círculo (`name` en red, batería, solar y eco).
- Red: entrada y salida con sus colores de energía de HA (`--energy-grid-consumption-color` y `--energy-grid-return-color`).
- Bajas emisiones: enseña los vatios limpios que entran de la red (entrada × (100 − % fósil)) con su línea animada hacia la red.
- Anillo de la casa repartido por origen: solar, batería, red limpia y red fósil.
- El pronóstico se llama «Producción estimada».
- Los textos de barras vecinas del Sankey ya no se pisan; añadir la tarjeta o un consumo desde el editor ya no da error.

## 0.1.0 · 2026-10-17

- Primera versión: bolitas de red, eco, batería, solar y casa con líneas animadas como power-flow-card-plus.
- Sankey vertical de consumos anidados desde la casa, con Otros y restos calculados y brillo según la potencia.
- Pronóstico de hoy y mañana (opcional) y lo producido hoy en el título.
- Editor visual con el árbol de consumos.
