import { css } from "lit";

export const styles = css`
  :host {
    --ef-chip: var(--secondary-background-color, #262626);
    --ef-mut: var(--secondary-text-color, #9b9b9b);
    --ef-warm: #ffcc66;
    display: block;
  }
  ha-card { overflow: hidden; padding: 12px 12px 14px; box-sizing: border-box; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 4px 6px; }
  .title { font-weight: 600; font-size: 15px; }
  .produced { font-size: 12.5px; color: var(--ef-mut); }
  svg.flow { display: block; width: 100%; height: auto; color: var(--primary-text-color); user-select: none; -webkit-user-select: none; }
  svg text { font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); font-size: 10px; fill: currentColor; }
  svg text.sec { fill: var(--ef-mut); font-size: 9px; }
  svg text.val, svg tspan.val { font-weight: 700; }
  svg text.lbl { font-size: 9.5px; }
  svg .dim { opacity: 0.45; }
  svg .hit { cursor: pointer; }
  /* El brillo que corre por dentro de cada corriente del Sankey (su duración la pone el render según la potencia). */
  svg .glow { fill: none; stroke: #fff; stroke-opacity: 0.35; stroke-width: 1.2; stroke-dasharray: 2 10; animation: ef-run 2s linear infinite; }
  @keyframes ef-run { to { stroke-dashoffset: -24; } }
  .hint { color: var(--ef-mut); font-size: 13px; padding: 8px 4px; }
  .forecast { display: flex; gap: 8px; margin-top: 8px; }
  .forecast div { flex: 1; background: var(--ef-chip); border-radius: 10px; padding: 7px 10px; font-size: 12px; color: var(--ef-mut); }
  .forecast b { display: block; color: var(--ef-warm); font-size: 15px; margin-top: 2px; }
`;
