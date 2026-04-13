/**
 * Загрузка разрешительной документации (ДС / отказные письма) в «Документы» товаров на Яндекс.Диске
 * по файлу «Разрешительная документация.xlsx» (все листы; сопоставление по «Марочный ассортимент»,
 * локальный файл — по имени из гиперссылки в столбце ДС / отказное письмо).
 *
 *   npx tsx scripts/import-permit-documents.ts
 *   npx tsx scripts/import-permit-documents.ts --dry-run
 *   npx tsx scripts/import-permit-documents.ts --registry="/path/Разрешительная документация.xlsx" --docs-root="/path"
 *   npx tsx scripts/import-permit-documents.ts --min-score=72 --verbose
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFiles() {
  for (const name of ['.env.local', '.env', '.env.example']) {
    try {
      const text = fs.readFileSync(path.join(root, name), 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* нет файла */
    }
  }
}

loadEnvFiles();

const DEFAULT_REGISTRY =
  process.env.PERMIT_REGISTRY_PATH ||
  path.join(root, 'Сертификация продукции', 'Разрешительная документация.xlsx');
const DEFAULT_DOCS_ROOT = process.env.PERMIT_DOCUMENTS_ROOT || path.dirname(DEFAULT_REGISTRY);

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = argv.includes('--dry-run');
  let verbose = argv.includes('--verbose') || argv.includes('-v');
  let minScore: number | undefined;
  let registry = DEFAULT_REGISTRY;
  let docsRoot = DEFAULT_DOCS_ROOT;
  for (const a of argv) {
    if (a.startsWith('--min-score=')) {
      const n = Number(a.slice('--min-score='.length));
      if (Number.isFinite(n)) minScore = n;
    }
    if (a.startsWith('--registry=')) registry = a.slice('--registry='.length);
    if (a.startsWith('--docs-root=')) docsRoot = a.slice('--docs-root='.length);
  }
  return { dryRun, verbose, minScore, registry, docsRoot };
}

(async () => {
  const { importPermitDocumentsFromRegistry } = await import('../src/lib/permit-documents-import');
  const opts = parseArgs();
  console.error(
    'Импорт разрешительной документации (→ Документы)…',
    opts.dryRun ? '(dry-run)' : '',
    opts.verbose ? '(verbose)' : '',
  );
  console.error('Excel:', opts.registry);
  console.error('Корень локальных файлов:', opts.docsRoot);

  const r = await importPermitDocumentsFromRegistry({
    registryXlsxPath: opts.registry,
    documentsRootDir: opts.docsRoot,
    dryRun: opts.dryRun,
    minScore: opts.minScore,
    verbose: opts.verbose,
  });
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) {
    console.error('Ошибки:', r.errors.slice(0, 40));
  }
  if (r.rowsWithoutLocalFile.length) {
    console.error('Строки без локального файла (первые 20):', r.rowsWithoutLocalFile.slice(0, 20));
  }
  if (r.unmatchedLines.length) {
    console.error('Марочный без товара на Диске (первые 15):', r.unmatchedLines.slice(0, 15));
  }
  process.exit(r.errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
