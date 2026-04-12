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
  const r = await replaceCrossTxtWithPngFromPngFolder();
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) {
    console.error('Ошибки:', r.errors.slice(0, 30));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
