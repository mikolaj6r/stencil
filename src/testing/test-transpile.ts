import { compileSync } from '@compiler';
import { Diagnostic, CompileOptions } from '@stencil/core/internal';
import { loadTypeScriptDiagnostic, normalizePath, isString } from '@utils';
import { STENCIL_INTERNAL_TESTING_ID } from '../compiler_next/bundle/entry-alias-ids';
import ts from 'typescript';


export function transpile(input: string, opts: CompileOptions = {}) {
  opts = {
    ...opts,
    componentExport: null,
    componentMetadata: 'compilerstatic',
    coreImportPath: isString(opts.coreImportPath) ? opts.coreImportPath : STENCIL_INTERNAL_TESTING_ID,
    currentDirectory: opts.currentDirectory || process.cwd(),
    module: 'cjs', // always use commonjs since we're in a node environment
    proxy: null,
    sourceMap: 'inline',
    style: null,
    target: 'es2015', // default to es2015
  };

  try {
    const v = process.version.replace('v', '').split('.');
    if (parseInt(v[0], 10) >= 10) {
      // let's go with ES2017 for node 10 and above
      opts.target = 'es2017';
    }
  } catch (e) {}

  return compileSync(input, opts);
}

export function getCompilerOptions(rootDir: string) {
  if (typeof rootDir !== 'string') {
    return null;
  }

  rootDir = normalizePath(rootDir);

  const tsconfigFilePath = ts.findConfigFile(rootDir, ts.sys.fileExists);
  if (!tsconfigFilePath) {
    return null;
  }

  const tsconfigResults = ts.readConfigFile(tsconfigFilePath, ts.sys.readFile);

  if (tsconfigResults.error) {
    throw new Error(formatDiagnostic(loadTypeScriptDiagnostic(tsconfigResults.error)));
  }

  const parseResult = ts.parseJsonConfigFileContent(tsconfigResults.config, ts.sys, rootDir, undefined, tsconfigFilePath);

  return parseResult.options;
}


export function formatDiagnostic(diagnostic: Diagnostic) {
  let m = '';

  if (diagnostic.relFilePath) {
    m += diagnostic.relFilePath;
    if (typeof diagnostic.lineNumber === 'number') {
      m += ':' + diagnostic.lineNumber + 1;
      if (typeof diagnostic.columnNumber === 'number') {
        m += ':' + diagnostic.columnNumber;
      }
    }
    m += '\n';
  }

  m += diagnostic.messageText;

  return m;
}
