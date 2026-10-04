import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../src/frontend/src', import.meta.url));
const violations = [];
const names = new Set(['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource', 'sendBeacon', 'WebTransport']);
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { scan(file); continue; }
    if (!/\.[jt]sx?$/.test(file) || /\.test\./.test(file) || file.endsWith(path.join('backend', 'real.ts'))) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expr = node.expression;
        const name = ts.isIdentifier(expr) ? expr.text : ts.isPropertyAccessExpression(expr) ? expr.name.text : ts.isElementAccessExpression(expr) && ts.isStringLiteral(expr.argumentExpression) ? expr.argumentExpression.text : '';
        if (names.has(name)) violations.push(`${file}: direct ${name} bypasses the provider`);
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (/axios|backend\/real/.test(spec)) violations.push(`${file}: direct transport import ${spec}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan(root);
if (violations.length) { console.error(violations.join('\n')); process.exit(1); }
console.log('Frontend network boundary: passed. Native transports exist only in the real provider.');
