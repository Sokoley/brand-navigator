/**
 * Запуск замены .txt на .png из Brand/PNG (обходит HTTP-авторизацию).
 * Использование: npx tsx scripts/run-replace-cross-png.ts
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
console.error('Загрузка модуля и обход Диска…');

(async () => {
  const { replaceCrossTxtWithPngFromPngFolder } = await import('../src/lib/replace-cross-png');
  let offset = 0;
  let hasMore = true;
  const totals = { replaced: 0, pngUpdated: 0, skippedNoPng: 0 };
  const allErrors: string[] = [];
  while (hasMore) {
    const r = await replaceCrossTxtWithPngFromPngFolder({ offset });
    totals.replaced += r.replaced;
    totals.pngUpdated += r.pngUpdated;
    totals.skippedNoPng += r.skippedNoPng;
    allErrors.push(...r.errors);
    console.error(
      `Партия offset=${r.offset}: папок ${r.processedInBatch}, txt→png ${r.replaced}, png ${r.pngUpdated}, пропусков ${r.skippedNoPng}`,
    );
    hasMore = r.hasMore;
    offset = r.nextOffset;
  }
  const out = { ...totals, errors: allErrors, success: allErrors.length === 0 };
  console.log(JSON.stringify(out, null, 2));
  if (allErrors.length) {
    console.error('Ошибки:', allErrors.slice(0, 30));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
