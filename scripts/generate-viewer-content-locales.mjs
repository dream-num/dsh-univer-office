import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/viewer-support/render-preset");
const OUTPUT_DIR = resolve(ROOT, "locales/generated");
const CHECK = process.argv.includes("--check");

const LOCALES = [
  "en-US",
  "fr-FR",
  "zh-CN",
  "ru-RU",
  "zh-TW",
  "zh-HK",
  "vi-VN",
  "ja-JP",
  "ko-KR",
  "es-ES",
  "ca-ES",
  "sk-SK",
  "pt-BR",
  "de-DE",
  "it-IT",
  "id-ID",
  "pl-PL"
];

const PACKAGES = [
  "@univerjs/design",
  "@univerjs/sheets",
  "@univerjs/sheets-ui",
  "@univerjs/sheets-formula",
  "@univerjs/sheets-formula-ui",
  "@univerjs/ui",
  "@univerjs/docs-ui",
  "@univerjs/data-validation",
  "@univerjs/docs-drawing-ui",
  "@univerjs/docs-hyper-link-ui",
  "@univerjs/docs-thread-comment-ui",
  "@univerjs/drawing-ui",
  "@univerjs-pro/embed-ui",
  "@univerjs-pro/sheets-history-ui",
  "@univerjs-pro/bases",
  "@univerjs-pro/bases-ui",
  "@univerjs-pro/bases-exchange-client",
  "@univerjs-pro/shape-editor-ui",
  "@univerjs-pro/ink-ui",
  "@univerjs-pro/boards-ui",
  "@univerjs-pro/boards-chart-ui",
  "@univerjs-pro/boards-mind-ui",
  "@univerjs-pro/boards-table-ui",
  "@univerjs-pro/boards-print",
  "@univerjs-pro/docs-callout-ui",
  "@univerjs-pro/docs-chart-ui",
  "@univerjs-pro/docs-column-ui",
  "@univerjs-pro/docs-exchange-client",
  "@univerjs-pro/docs-code-ui",
  "@univerjs-pro/docs-list-ui",
  "@univerjs-pro/docs-quote-ui",
  "@univerjs-pro/docs-shape-ui",
  "@univerjs-pro/docs-table-ui",
  "@univerjs-pro/docs-latex-ui",
  "@univerjs-pro/docs-print",
  "@univerjs-pro/sheets-chart",
  "@univerjs-pro/sheets-chart-ui",
  "@univerjs/sheets-conditional-formatting",
  "@univerjs/sheets-conditional-formatting-ui",
  "@univerjs/sheets-crosshair-highlight",
  "@univerjs/sheets-data-validation",
  "@univerjs/sheets-data-validation-ui",
  "@univerjs/sheets-drawing-ui",
  "@univerjs/sheets-filter",
  "@univerjs/sheets-filter-ui",
  "@univerjs/sheets-hyper-link",
  "@univerjs/sheets-hyper-link-ui",
  "@univerjs/sheets-note-ui",
  "@univerjs/sheets-numfmt-ui",
  "@univerjs-pro/sheets-outline-ui",
  "@univerjs-pro/sheets-pivot",
  "@univerjs-pro/sheets-pivot-ui",
  "@univerjs-pro/sheets-exchange-client",
  "@univerjs-pro/sheets-print",
  "@univerjs-pro/sheets-shape-ui",
  "@univerjs/sheets-sort-ui",
  "@univerjs-pro/sheets-sparkline-ui",
  "@univerjs/sheets-table",
  "@univerjs/sheets-table-ui",
  "@univerjs/sheets-thread-comment-ui",
  "@univerjs/thread-comment-ui",
  "@univerjs-pro/slides",
  "@univerjs-pro/slides-ui",
  "@univerjs-pro/slides-chart-ui",
  "@univerjs-pro/slides-table-ui",
  "@univerjs-pro/slides-exchange-client",
  "@univerjs-pro/slides-print",
  "@univerjs-pro/chart-ui",
  "@univerjs-pro/engine-chart"
];

function localeModule(locale) {
  const imports = PACKAGES.map(
    (packageName, index) => `import locale${index} from "${packageName}/locale/${locale}";`
  ).join("\n");
  const entries = PACKAGES.map((_, index) => `  locale${index}`).join(",\n");
  const named = locale === "en-US" ? "\nexport const CONTENT_EN_US = locale;" : "";
  return `${imports}\nimport { mergeLocalePacks } from "../merge.js";\n\nconst locale = mergeLocalePacks([\n${entries}\n]);${named}\n\nexport default locale;\n`;
}

function loaderModule() {
  const localeUnion = LOCALES.map((locale) => `  "${locale}"`).join(",\n");
  const loaders = LOCALES.map(
    (locale) =>
      `  "${locale}": () => import("./${locale}.js").then(({ default: locale }) => locale)`
  ).join(",\n");
  return `import type { ILanguagePack } from "@univerjs/core";\n\nexport const CONTENT_LOCALES = [\n${localeUnion}\n] as const;\n\nexport type ContentLocale = (typeof CONTENT_LOCALES)[number];\n\nconst loaders: Record<ContentLocale, () => Promise<ILanguagePack>> = {\n${loaders}\n};\n\nconst cache = new Map<ContentLocale, Promise<ILanguagePack>>();\n\nexport function loadContentLocale(locale: ContentLocale): Promise<ILanguagePack> {\n  const cached = cache.get(locale);\n  if (cached !== undefined) {\n    return cached;\n  }\n  const pending = loaders[locale]().catch((error: unknown) => {\n    cache.delete(locale);\n    throw error;\n  });\n  cache.set(locale, pending);\n  return pending;\n}\n`;
}

function emit(relativePath, content) {
  const outputPath = resolve(OUTPUT_DIR, relativePath);
  if (CHECK) {
    let current = "";
    try {
      current = readFileSync(outputPath, "utf8");
    } catch {
      // Report the same freshness error as changed generated content.
    }
    if (current !== content) {
      throw new Error(`Generated locale file is stale: ${outputPath}`);
    }
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

for (const locale of LOCALES) {
  emit(`${locale}.ts`, localeModule(locale));
}
emit("load.ts", loaderModule());

console.log(`${CHECK ? "Verified" : "Generated"} ${LOCALES.length} content locale modules.`);
