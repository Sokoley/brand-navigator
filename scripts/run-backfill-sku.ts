/**
 * Одноразовое заполнение SKU из имён файлов в Кросс коды (нужен DATABASE_URL в .env).
 * npx tsx scripts/run-backfill-sku.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFiles() {
  for (const name of ['.env.local', '.env']) {
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
console.error('Заполнение SKU из путей Кросс коды…');

(async () => {
  const { backfillSkuFromCrossFilenames } = await import('../src/lib/backfill-sku-from-cross-files');
  const r = await backfillSkuFromCrossFilenames();
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
