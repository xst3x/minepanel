const ts = require('typescript');
const babelJest = require('babel-jest').default.createTransformer();
module.exports = {
  process(source, filename, options) {
    const { outputText } = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, inlineSourceMap: true },
    });
    // Preserve Jest's mock hoisting after TypeScript syntax has been removed.
    return babelJest.process(outputText, filename, options);
  },
};
