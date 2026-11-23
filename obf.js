#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RED    = '\x1b[0;31m';
const GREEN  = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const CYAN   = '\x1b[36m';
const NC     = '\x1b[0m';

process.stdout.write('\x1Bc');

const requiredModules = ['javascript-obfuscator', 'js-confuser', 'terser', 'lz-string'];

for (const mod of requiredModules) {
  try {
    require.resolve(mod);
  } catch (e) {
    console.log(`${YELLOW}Installing ${mod}...${NC}`);
    execSync(`npm install ${mod}`, { stdio: 'inherit' });
  }
}

const JsConfuser = require('js-confuser');
const JavaScriptObfuscator = require('javascript-obfuscator');
const LZString = require('lz-string');

const minifyCode = (code) => {
  const tmpIn  = path.join('obfuscated', '_tmp_in.js');
  const tmpOut = path.join('obfuscated', '_tmp_out.js');
  try {
    fs.writeFileSync(tmpIn, code, 'utf8');
    execSync(`terser "${tmpIn}" --compress passes=5 --mangle --output "${tmpOut}"`, { stdio: 'pipe' });
    const minified = fs.readFileSync(tmpOut, 'utf8');
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);
    return minified;
  } catch (e) {
    if (fs.existsSync(tmpIn))  fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    return code;
  }
};

const obfuscateWithEnc1 = async (code) => {
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
    stringSplitting: 0.2,
    opaquePredicates: 0.3,
    astScrambler: true,
    controlFlowFlattening: 0.2,
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

const obfuscateWithEnc2 = (code) => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
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
  console.log = originalLog;
  console.warn = originalWarn;
  return result.getObfuscatedCode();
};

const wrapWithLZ = async (code) => {
  const lzSrc = fs.readFileSync(require.resolve('lz-string'), 'utf8');
  const c = LZString.compressToUTF16(code);
  const wrapper = `(function(){${lzSrc};var c=${JSON.stringify(c)};var d=LZString.decompressFromUTF16(c);eval(d);})();`;
  return obfuscateWithEnc2(wrapper);
};

const obfuscateFile = async (filePath, outputPath) => {
  let code = fs.readFileSync(filePath, 'utf-8').replace(/\0/g, '').replace(/^#!.*\n/, '');
  console.log(`${YELLOW}Processing File: ${filePath}${NC}`);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  code = minifyCode(code);
  console.log(`${CYAN}Pre-minify done (terser)${NC}`);

  const pass1 = await obfuscateWithEnc1(code);
  console.log(`${CYAN}Pass 1 done (js-confuser)${NC}`);

  const pass2 = obfuscateWithEnc2(pass1);
  console.log(`${CYAN}Pass 2 done (javascript-obfuscator)${NC}`);

  const pass3 = minifyCode(pass2);
  console.log(`${CYAN}Post-minify done (terser)${NC}`);

  const finalCode = await wrapWithLZ(pass3);
  console.log(`${CYAN}LZ UTF16 wrap done${NC}`);

  fs.writeFileSync(outputPath, finalCode, 'utf8');
  console.log(`${GREEN}Obfuscated result saved in: ${outputPath}${NC}`);
};

const processDirectory = async (dirPath, outputDirPath) => {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      const newOutputDir = path.join(outputDirPath, file);
      await processDirectory(filePath, newOutputDir);
    } else if (path.extname(file) === '.js') {
      const outputPath = path.join(outputDirPath, file);
      await obfuscateFile(filePath, outputPath);
    }
  }
};

(async () => {
  if (!fs.existsSync('obfuscated')) {
    fs.mkdirSync('obfuscated', { recursive: true });
  }

  if (process.argv.length < 3) {
    console.log(`${YELLOW}Usage: node obf.js <filename or foldername>${NC}`);
    process.exit(0);
  }

  const inputPath = process.argv[2];

  if (!fs.existsSync(inputPath)) {
    console.log(`${RED}File or folder '${inputPath}' not found!${NC}`);
    process.exit(0);
  }

  const stats = fs.statSync(inputPath);
  if (stats.isFile()) {
    if (path.extname(inputPath) !== '.js') {
      console.log(`${RED}Please provide a JavaScript file (.js)${NC}`);
      process.exit(1);
    }

    const outputDir = 'obfuscated';
    const outputFile = path.join(outputDir, path.basename(inputPath));
    await obfuscateFile(inputPath, outputFile);
  } else if (stats.isDirectory()) {
    const folderName = path.basename(inputPath);
    const outputDir = path.join('obfuscated', folderName);
    await processDirectory(inputPath, outputDir);
    console.log(`${GREEN}All JavaScript files obfuscated in folder: obfuscated/${folderName}${NC}`);
  } else {
    console.log(`${RED}Invalid input! Please provide a file or folder.${NC}`);
    process.exit(0);
  }
})();
