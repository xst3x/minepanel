/**
 * Script to convert CommonJS require/module.exports to TypeScript module syntax.
 * Run with: npx tsx fix-commonjs.ts  OR  npx ts-node fix-commonjs.ts
 * 
 * Converts:
 *   const x = require('y')      ->  import x = require('y')
 *   module.exports = ...         ->  export = ...
 *   module.exports = { ... }     ->  export = { ... }
 * 
 * And adds `export {};` to files that have no import/export statements.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const srcDir = path.resolve(__dirname, 'src');

// Patterns for require statements
const requirePatterns = [
    // const { a, b } = require('x')
    { pattern: /const\s+\{([^}]*)\}\s*=\s*require\((['"`])([^'"`]+)\2\)/g, template: 'import { $1 } from \'$3\'' },
    // const a = require('x')
    { pattern: /const\s+(\w+)\s*=\s*require\((['"`])([^'"`]+)\2\)/g, template: 'import $1 = require(\'$3\')' },
    // let a = require('x')
    { pattern: /let\s+(\w+)\s*=\s*require\((['"`])([^'"`]+)\2\)/g, template: 'import $1 = require(\'$3\')' },
    // var a = require('x')
    { pattern: /var\s+(\w+)\s*=\s*require\((['"`])([^'"`]+)\2\)/g, template: 'import $1 = require(\'$3\')' },
];

function convertFile(filePath: string): boolean {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Skip if file already has import or export statements
    // (checking for lines that start with import or export)
    const lines = content.split('\n');
    const hasImportExport = lines.some(line => 
        /^\s*import\s/.test(line) || 
        /^\s*export\s/.test(line) ||
        /^\s*import\s+type\s/.test(line)
    );

    if (hasImportExport) {
        return false;
    }

    // Check if file uses require or module.exports
    if (!content.includes('require(') && !content.includes('module.exports')) {
        return false;
    }

    // Convert require() calls to import syntax
    // Process line by line for better accuracy
    const resultLines: string[] = [];
    
    for (const line of lines) {
        let processed = false;
        
        // Check for destructured require: const { a, b } = require('x')
        const destructuredMatch = line.match(/^\s*const\s+\{([^}]*)\}\s*=\s*require\((['"`])([^'"`]+)\2\)\s*;?\s*$/);
        if (destructuredMatch) {
            resultLines.push(`import {${destructuredMatch[1]} } from '${destructuredMatch[3]}';`);
            processed = true;
            continue;
        }

        // Check for simple require: const x = require('y')
        const simpleMatch = line.match(/^\s*(const|let|var)\s+(\w+)\s*=\s*require\((['"`])([^'"`]+)\3\)\s*;?\s*$/);
        if (simpleMatch && !simpleMatch[2].startsWith('.')) {  // skip relative requires
            resultLines.push(`import ${simpleMatch[2]} = require('${simpleMatch[4]}');`);
            processed = true;
            continue;
        }

        // If not a require statement, keep the line as-is
        if (!processed) {
            resultLines.push(line);
        }
    }

    let result = resultLines.join('\n');

    // Convert module.exports = ... to export = ...
    // module.exports = function ... or module.exports = { ... }
    result = result.replace(/module\.exports\s*=\s*/, 'export = ');

    // Remove redundant 'export {}' if file now has exports
    if (result !== original) {
        // Add export {} as a safety measure if no exports exist yet
        if (!result.includes('export ')) {
            result += '\n\nexport {};\n';
        }
    }

    if (result !== original) {
        fs.writeFileSync(filePath, result, 'utf8');
        return true;
    }
    
    return false;
}

function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'frontend' && entry.name !== 'demo') {
            results.push(...findTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'fix-commonjs.ts') {
            results.push(fullPath);
        }
    }
    
    return results;
}

const files = findTsFiles(srcDir);
console.log(`Found ${files.length} .ts files to process.`);

let converted = 0;
let errors = 0;

for (const file of files) {
    try {
        if (convertFile(file)) {
            console.log(`  Converted: ${path.relative(__dirname, file)}`);
            converted++;
        }
    } catch (err) {
        console.error(`  ERROR: ${path.relative(__dirname, file)}: ${err.message}`);
        errors++;
    }
}

console.log(`\nDone. Converted ${converted} files. ${errors} errors.`);
