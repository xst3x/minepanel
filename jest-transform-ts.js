// Minimal Jest transformer for TypeScript files using the locally installed
// `typescript` package (no extra Babel presets needed).
//
// Only applied to files matched in jest.config.js (the minecraftLog parser
// and its test). Everything else keeps the default babel-jest transform.
const ts = require('typescript');

module.exports = {
  process(src, filename) {
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    return { code: outputText };
  },
};
