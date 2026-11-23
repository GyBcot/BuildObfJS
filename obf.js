#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const LZString = require('lz-string');
const JsConfuser = require('js-confuser');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const INPUT_DIR  = 'input';
const OUTPUT_DIR = 'output';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const minifyCode = (code) => {
  const tmpIn  = path.join(OUTPUT_DIR, '_tmp_in.js');
  const tmpOut = path.join(OUTPUT_DIR, '_tmp_out.js');
  try {
    fs.writeFileSync(tmpIn, code, 'utf8');
    execSync(`npx terser "${tmpIn}" --compress passes=5 --mangle --output "${tmpOut}"`, { stdio: 'pipe' });
    const minified = fs.readFileSync(tmpOut, 'utf8');
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);
    return minified;
  } catch {
    if (fs.existsSync(tmpIn))  fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    return code;
  }
};

const obfuscateWithJsConfuser = async (code) => {
  const result = await JsConfuser.obfuscate(code, {
    compact: true,
    minify: true,
    renameVariables: true,
    renameGlobals: false,
    renameLabels: true,
    identifierGenerator: 'mangled',
    hexadecimalNumbers: true,
    stringConcealing: true,
    stringEncoding: true,
    stringSplitting: 0.3,
    opaquePredicates: 0.5,
    astScrambler: true,
    controlFlowFlattening: 0.3,
    deadCode: 0,
    objectExtraction: true,
    duplicateLiteralsRemoval: true,
    movedDeclarations: true,
    variableMasking: false,
    dispatcher: false,
    flatten: false,
    target: 'browser',
  });
  return typeof result === 'string' ? result : result.code;
};

const obfuscateWithJsObfuscator = (code) => {
  const originalLog  = console.log;
  const originalWarn = console.warn;
  console.log  = () => {};
  console.warn = () => {};
  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    simplify: true,
    sourceMap: false,
    ignoreImports: true,
    seed: Math.floor(Date.now() * Math.random()),
    identifierNamesGenerator: 'mangled',
    renameProperties: true,
    renamePropertiesMode: 'unsafe',
    transformObjectKeys: true,
    numbersToExpressions: true,
    stringArray: true,
    stringArrayThreshold: 0.1,
    stringArrayEncoding: ['rc4'],
    stringArrayCallsTransform: false,
    rotateStringArray: true,
    shuffleStringArray: true,
    deadCodeInjection: false,
    controlFlowFlattening: false,
    splitStrings: false,
    selfDefending: true,
    target: 'browser',
  });
  console.log  = originalLog;
  console.warn = originalWarn;
  return result.getObfuscatedCode();
};

const wrapWithLZ = async (code) => {
  const lzSrc = fs.readFileSync(require.resolve('lz-string'), 'utf8');
  const c = LZString.compressToUTF16(code);
  const wrapper = `(function(){${lzSrc};var c=${JSON.stringify(c)};var d=LZString.decompressFromUTF16(c);eval(d);})();`;
  return obfuscateWithJsObfuscator(wrapper);
};

const obfuscateFile = async (filePath, outputPath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const hasShebang = raw.startsWith('#!');
  let code = raw.replace(/\0/g, '').replace(/^#!.*\n/, '');

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  code = minifyCode(code);
  const pass1 = await obfuscateWithJsConfuser(code);
  const pass2 = obfuscateWithJsObfuscator(pass1);
  const pass3 = minifyCode(pass2);
  const final = await wrapWithLZ(pass3);

  const shebang = hasShebang ? '#!/usr/bin/env node\n' : '';
  fs.writeFileSync(outputPath, shebang + final, 'utf8');
  console.log(`Done: ${outputPath}`);
};

(async () => {
  const files = fs.readdirSync(INPUT_DIR).filter(f => path.extname(f) === '.js');
  for (const file of files) {
    await obfuscateFile(path.join(INPUT_DIR, file), path.join(OUTPUT_DIR, file));
  }
})();
