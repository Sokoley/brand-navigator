/**
 * Импорт фото из Brand/1. Фото в папки Фото товаров (сопоставление по имени файла и SKU, без внешних API).
 *
 *   npx tsx scripts/import-content-photos.ts
 *   npx tsx scripts/import-content-photos.ts --dry-run
 *   npx tsx scripts/import-content-photos.ts --min-score=75
 *   npx tsx scripts/import-content-photos.ts --limit=5
 *   npx tsx scripts/import-content-photos.ts --verbose
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

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = argv.includes('--dry-run');
  let verbose = argv.includes('--verbose') || argv.includes('-v');
  let minScore: number | undefined;
  let limit: number | undefined;
  for (const a of argv) {
    if (a.startsWith('--min-score=')) {
      const n = Number(a.slice('--min-score='.length));
      if (Number.isFinite(n)) minScore = n;
    }
    if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    }
  }
  return { dryRun, minScore, limit, verbose };
}

(async () => {
  const { importContentPhotosToProducts } = await import('../src/lib/content-photos-import');
  const opts = parseArgs();
  console.error('Импорт из Brand/1. Фото…', opts.dryRun ? '(dry-run)' : '', opts.verbose ? '(verbose)' : '');
  const r = await importContentPhotosToProducts({
    dryRun: opts.dryRun,
    minScore: opts.minScore,
    limit: opts.limit,
    verbose: opts.verbose,
  });
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) {
    console.error('Ошибки:', r.errors.slice(0, 20));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
