/**
 * Запуск замены .txt на .png из Brand/PNG (обходит HTTP-авторизацию).
 *
 * Использование:
 *   npx tsx scripts/run-replace-cross-png.ts
 *   npx tsx scripts/run-replace-cross-png.ts 80          — продолжить с 80-й папки «Кросс коды» (индекс в отсортированном списке)
 *   npx tsx scripts/run-replace-cross-png.ts --offset=80
 *   npm run replace:cross-png -- 80
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

function parseInitialOffset(): number {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offset' && argv[i + 1] !== undefined) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    if (a.startsWith('--offset=')) {
      const n = Number(a.slice('--offset='.length));
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
  }
  const positional = argv.find((x) => /^\d+$/.test(x));
  if (positional !== undefined) return Number(positional);
  return 0;
}

const initialOffset = parseInitialOffset();
console.error('Загрузка модуля и обход Диска…');
if (initialOffset > 0) {
  console.error(`Старт с offset=${initialOffset} (продолжение после обрыва или выборочный прогон).`);
}

(async () => {
  const { replaceCrossTxtWithPngFromPngFolder } = await import('../src/lib/replace-cross-png');
  let offset = initialOffset;
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
