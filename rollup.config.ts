import typescript from "@rollup/plugin-typescript";
import pkg from "./package.json" assert { type: "json" };
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default [
  {
    input: "./src/script.ts",
    plugins: [json(), typescript(), commonjs()],
    output: [{ file: pkg.bin["openapi-simplifier"], extension: "cjs", format: "cjs", banner: "#!/usr/bin/env node" }],
  },
];
