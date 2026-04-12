/**
 * Загрузка PDF паспортов безопасности в папки «Документы» товаров на Яндекс.Диске
 * по реестру Реестр ПБ.xlsx (сопоставление PDF по номеру ТУ, товара — по «Марочному ассортименту»).
 *
 *   npx tsx scripts/import-passport-documents.ts
 *   npx tsx scripts/import-passport-documents.ts --dry-run
 *   npx tsx scripts/import-passport-documents.ts --registry="/path/Реестр ПБ.xlsx" --pdf-root="/path"
 *   npx tsx scripts/import-passport-documents.ts --min-score=72 --verbose
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
  process.env.PASSPORT_REGISTRY_PATH ||
  '/Users/sokoley/Downloads/Папкие/ПАСПОРТА БЕЗОПАСНОСТИ ПО ГОСТ отсортированные/Реестр ПБ.xlsx';
const DEFAULT_PDF_ROOT =
  process.env.PASSPORT_PDF_ROOT ||
  '/Users/sokoley/Downloads/Папкие/ПАСПОРТА БЕЗОПАСНОСТИ ПО ГОСТ отсортированные';

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = argv.includes('--dry-run');
  let verbose = argv.includes('--verbose') || argv.includes('-v');
  let minScore: number | undefined;
  let registry = DEFAULT_REGISTRY;
  let pdfRoot = DEFAULT_PDF_ROOT;
  for (const a of argv) {
    if (a.startsWith('--min-score=')) {
      const n = Number(a.slice('--min-score='.length));
      if (Number.isFinite(n)) minScore = n;
    }
    if (a.startsWith('--registry=')) registry = a.slice('--registry='.length);
    if (a.startsWith('--pdf-root=')) pdfRoot = a.slice('--pdf-root='.length);
  }
  return { dryRun, verbose, minScore, registry, pdfRoot };
}

(async () => {
  const { importPassportDocumentsFromRegistry } = await import('../src/lib/passport-documents-import');
  const opts = parseArgs();
  console.error(
    'Импорт паспортов (PDF → Документы)…',
    opts.dryRun ? '(dry-run)' : '',
    opts.verbose ? '(verbose)' : '',
  );
  console.error('Реестр:', opts.registry);
  console.error('Корень PDF:', opts.pdfRoot);

  const r = await importPassportDocumentsFromRegistry({
    registryXlsxPath: opts.registry,
    pdfRootDir: opts.pdfRoot,
    dryRun: opts.dryRun,
    minScore: opts.minScore,
    verbose: opts.verbose,
  });
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) {
    console.error('Ошибки:', r.errors.slice(0, 30));
  }
  if (r.registryRowsWithoutPdf.length) {
    console.error('Строки без PDF по ТУ (первые 15):', r.registryRowsWithoutPdf.slice(0, 15));
  }
  if (r.unmatchedLines.length) {
    console.error('Строки марочного без товара (первые 15):', r.unmatchedLines.slice(0, 15));
  }
  process.exit(r.errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
