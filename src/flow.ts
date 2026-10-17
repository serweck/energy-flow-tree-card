import type { FlowSettings } from "./types";

/** Segundos que tarda un punto en recorrer su línea: el «modelo nuevo» de power-flow-card-plus. */
export function flowDuration(watts: number, s: FlowSettings): number {
  const { min_flow_rate: minRate, max_flow_rate: maxRate, min_expected_power: minP, max_expected_power: maxP } = s;
  if (watts > maxP) return minRate;
  const rate = ((watts - minP) * (minRate - maxRate)) / (maxP - minP) + maxRate;
  return Math.min(maxRate, Math.max(minRate, rate));
}

/** Si una línea lleva energía, con qué opacidad se dibuja y si corren puntos por ella. */
export function lineState(watts: number | null, s: FlowSettings): { active: boolean; opacity: number; dots: boolean } {
  const active = (watts ?? 0) > s.watt_threshold;
  if (active) return { active, opacity: 1, dots: !s.disable_dots };
  const z = s.display_zero_lines;
  const opacity = z.mode === "hide" ? 0 : Math.round((1 - (z.transparency ?? 83) / 100) * 100) / 100;
  return { active, opacity, dots: false };
}
