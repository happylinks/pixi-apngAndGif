module.exports = {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "cjs"
  },
  external: ["omggif", "pako", "pixi.js"]
};
