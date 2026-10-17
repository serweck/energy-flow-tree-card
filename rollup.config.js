import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/energy-flow-tree-card.ts",
  output: {
    file: "dist/energy-flow-tree-card.js",
    format: "es",
    inlineDynamicImports: true,
    sourcemap: false,
  },
  plugins: [
    resolve(),
    json(),
    typescript({ tsconfig: "./tsconfig.json" }),
    terser({ format: { comments: false } }),
  ],
};
