import {
  copyFileOnDisk,
  deleteResource,
  downloadFileBuffer,
  getAllFilesRecursive,
  getUploadUrl,
  uploadToHref,
} from '@/lib/yandex-disk';

const PNG_ROOT = 'disk:/Brand/PNG';
const PRODUCTS_ROOT = 'disk:/Brand/Товары';
const CROSS_SEGMENT = '/Кросс коды/';

export interface ReplaceCrossPngResult {
  replaced: number;
  skippedNoPng: number;
  errors: string[];
}

/**
 * Для каждого .txt в …/Кросс коды/ товаров: если в Brand/PNG есть одноимённый .png (имя = кросс-код),
 * копирует png в папку Кросс коды и удаляет txt.
 */
export async function replaceCrossTxtWithPngFromPngFolder(): Promise<ReplaceCrossPngResult> {
  const result: ReplaceCrossPngResult = {
    replaced: 0,
    skippedNoPng: 0,
    errors: [],
  };

  const pngItems = await getAllFilesRecursive(PNG_ROOT);
  const pngByStemLower = new Map<string, string>();
  for (const it of pngItems) {
    if (it.type !== 'file') continue;
    const m = it.name.match(/^(.+)\.(png)$/i);
    if (!m) continue;
    pngByStemLower.set(m[1].toLowerCase(), it.path);
  }

  if (pngByStemLower.size === 0) {
    result.errors.push(`Нет .png в ${PNG_ROOT} или папка недоступна`);
    return result;
  }

  const allUnderProducts = await getAllFilesRecursive(PRODUCTS_ROOT);
  const txtInCross = allUnderProducts.filter(
    (f) =>
      f.type === 'file' &&
      f.name.toLowerCase().endsWith('.txt') &&
      f.path.includes(CROSS_SEGMENT),
  );

  for (const f of txtInCross) {
    const stem = f.name.replace(/\.txt$/i, '');
    const pngSource = pngByStemLower.get(stem.toLowerCase());
    if (!pngSource) {
      result.skippedNoPng++;
      continue;
    }

    const dir = f.path.slice(0, f.path.lastIndexOf('/'));
    const destPngPath = `${dir}/${stem}.png`;

    let ok = await copyFileOnDisk(pngSource, destPngPath, true);
    if (!ok) {
      const buf = await downloadFileBuffer(pngSource);
      if (buf) {
        const href = await getUploadUrl(destPngPath, true);
        if (href) {
          const st = await uploadToHref(href, buf);
          ok = st === 201 || st === 200;
        }
      }
    }

    if (!ok) {
      result.errors.push(`Не удалось записать PNG: ${destPngPath} (из ${pngSource})`);
      continue;
    }

    const { code } = await deleteResource(f.path);
    // 204 — обычный успех; 404 — файла уже нет (идемпотентно, после копирования/гонки)
    if (code !== 200 && code !== 204 && code !== 404) {
      result.errors.push(`PNG записан, но не удалён txt ${f.path}: HTTP ${code}`);
      continue;
    }
    result.replaced++;
  }

  return result;
}
