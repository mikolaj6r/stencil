import * as d from '../../declarations';
import { DEFAULT_STYLE_MODE, catchError, createJsVarName, normalizePath, hasError, isString } from '@utils';
import { getScopeId } from '../style/scope-css';
import { optimizeCss } from '../../compiler_next/optimize/optimize-css';
import { scopeCss } from '../../utils/shadow-css';
import { serializeImportPath } from '../transformers/stencil-import-path';
import { stripCssComments } from './style-utils';
import MagicString from 'magic-string';
import path from 'path';


export const transformCssToEsm = async (input: d.TransformCssToEsmInput) => {
  const results = transformCssToEsmModule(input);

  const optimizeResults = await optimizeCss({
    autoprefixer: input.autoprefixer,
    input: results.styleText,
    filePath: input.file,
    minify: true,
    sourceMap: input.sourceMap,
  });

  results.diagnostics.push(...optimizeResults.diagnostics);
  if (hasError(optimizeResults.diagnostics)) {
    return results;
  }
  results.styleText = optimizeResults.output;

  return generateTransformCssToEsm(input, results);
};

export const transformCssToEsmSync = (input: d.TransformCssToEsmInput) => {
  const results = transformCssToEsmModule(input);
  return generateTransformCssToEsm(input, results);
};

const transformCssToEsmModule = (input: d.TransformCssToEsmInput) => {
  const results: d.TransformCssToEsmOutput = {
    styleText: input.input,
    output: '',
    map: null,
    diagnostics: [],
    imports: [],
    defaultVarName: createCssVarName(input.file, input.mode),
  };

  try {
    const varNames = new Set([results.defaultVarName]);

    if (isString(input.tag)) {
      if (input.encapsulation === 'scoped' || (input.encapsulation === 'shadow' && input.commentOriginalSelector)) {
        const scopeId = getScopeId(input.tag, input.mode);
        results.styleText = scopeCss(results.styleText, scopeId, input.commentOriginalSelector);
      }
    }

    const cssImports = getCssImports(varNames, results.styleText, input.file, input.mode);
    cssImports.forEach(cssImport => {
      // remove the original css @imports
      results.styleText = results.styleText.replace(cssImport.srcImportText, '');

      const importPath = serializeImportPath({
        importeePath: cssImport.filePath,
        importerPath: input.file,
        tag: input.tag,
        encapsulation: input.encapsulation,
        mode: input.mode,
      });

      // str.append(`import ${cssImport.varName} from '${importPath}';\n`);
      results.imports.push({
        varName: cssImport.varName,
        importPath
      });
    });

  } catch (e) {
    catchError(results.diagnostics, e);
  }

  return results;
};


const generateTransformCssToEsm = (input: d.TransformCssToEsmInput, results: d.TransformCssToEsmOutput) => {
  const s = new MagicString('');

  if (input.module === 'cjs') {
    // CommonJS
    results.imports.forEach(cssImport => {
      s.append(`const ${cssImport.varName} = require('${cssImport.importPath}');\n`);
    });

    s.append(`const ${results.defaultVarName} = `);

    results.imports.forEach(cssImport => {
      s.append(`${cssImport.varName} + `);
    });

    s.append(`${JSON.stringify(results.styleText)};\n`);
    s.append(`module.exports = ${results.defaultVarName};`);

  } else {
    // ESM
    results.imports.forEach(cssImport => {
      s.append(`import ${cssImport.varName} from '${cssImport.importPath}';\n`);
    });

    s.append(`const ${results.defaultVarName} = `);

    results.imports.forEach(cssImport => {
      s.append(`${cssImport.varName} + `);
    });

    s.append(`${JSON.stringify(results.styleText)};\n`);
    s.append(`export default ${results.defaultVarName};`);
  }

  results.output = s.toString();
  return results;
};


const getCssImports = (varNames: Set<string>, cssText: string, filePath: string, modeName: string) => {
  const cssImports: d.CssToEsmImportData[] = [];

  if (!cssText.includes('@import')) {
    // no @import at all, so don't bother
    return cssImports;
  }

  cssText = stripCssComments(cssText);

  const dir = path.dirname(filePath);

  let r: RegExpExecArray;
  while (r = CSS_IMPORT_RE.exec(cssText)) {
    const cssImportData: d.CssToEsmImportData = {
      srcImportText: r[0],
      url: r[4].replace(/[\"\'\)]/g, ''),
      filePath: null,
      varName: null
    };

    if (!isLocalCssImport(cssImportData.srcImportText)) {
      // do nothing for @import url(http://external.css)
      continue;

    } else if (isCssNodeModule(cssImportData.url)) {
      // do not resolve this path cuz it starts with node resolve id ~
      continue;

    } else if (path.isAbsolute(cssImportData.url)) {
      // absolute path already
      cssImportData.filePath = normalizePath(cssImportData.url);

    } else {
      // relative path
      cssImportData.filePath = normalizePath(path.resolve(dir, cssImportData.url));
    }

    cssImportData.varName = createCssVarName(cssImportData.filePath, modeName);

    if (varNames.has(cssImportData.varName)) {
      cssImportData.varName += (varNames.size);
    }
    varNames.add(cssImportData.varName);

    cssImports.push(cssImportData);
  }

  return cssImports;
};

const CSS_IMPORT_RE = /(@import)\s+(url\()?\s?(.*?)\s?\)?([^;]*);?/gi;

const isCssNodeModule = (url: string) => {
  return url.startsWith('~');
};

const isLocalCssImport = (srcImport: string) => {
  srcImport = srcImport.toLowerCase();

  if (srcImport.includes('url(')) {
    srcImport = srcImport.replace(/\"/g, '');
    srcImport = srcImport.replace(/\'/g, '');
    srcImport = srcImport.replace(/\s/g, '');
    if (srcImport.includes('url(http') || srcImport.includes('url(//')) {
      return false;
    }
  }

  return true;
};

const createCssVarName = (filePath: string, modeName: string) => {
  let varName = path.basename(filePath);
  if (modeName && modeName !== DEFAULT_STYLE_MODE && !varName.includes(modeName)) {
    varName = modeName + '-' + varName;
  }
  return createJsVarName(varName);
};
