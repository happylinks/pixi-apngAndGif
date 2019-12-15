import resolve from "@rollup/plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";

export default {
  input: "docs/index.js",
  output: {
    file: "docs-dist/bundle.js",
    format: "iife"
  },
  plugins: [
    resolve({}),
    commonjs({
      include: "node_modules/**"
    })
  ]
};
