import {
  copyFileOnDisk,
  deleteResource,
  downloadFileBuffer,
  getAllFilesRecursive,
  getFilesOnlyUnderNamedFolders,
  getUploadUrl,
  uploadToHref,
} from '@/lib/yandex-disk';

const PNG_ROOT = 'disk:/Brand/PNG';
const PRODUCTS_ROOT = 'disk:/Brand/Товары';
/** Имя папки на Диске (как в пути …/Кросс коды/…) */
const CROSS_FOLDER_NAME = 'Кросс коды';

export interface ReplaceCrossPngResult {
  /** .txt заменены на .png и удалены */
  replaced: number;
  /** существующие .png в Кросс коды перезаписаны из Brand/PNG */
  pngUpdated: number;
  skippedNoPng: number;
  errors: string[];
}

async function copyPngToDest(pngSource: string, destPngPath: string): Promise<boolean> {
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
  return ok;
}

/**
 * 1) Для каждого .txt в …/Кросс коды/: одноимённый .png из Brand/PNG → копия, txt удалить.
 * 2) Для каждого .png в …/Кросс коды/: если в Brand/PNG есть файл с тем же именем — перезаписать (обновить).
 */
export async function replaceCrossTxtWithPngFromPngFolder(): Promise<ReplaceCrossPngResult> {
  const result: ReplaceCrossPngResult = {
    replaced: 0,
    pngUpdated: 0,
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

  const crossFiles = await getFilesOnlyUnderNamedFolders(PRODUCTS_ROOT, CROSS_FOLDER_NAME);
  const txtInCross = crossFiles.filter((f) => f.name.toLowerCase().endsWith('.txt'));

  for (const f of txtInCross) {
    const stem = f.name.replace(/\.txt$/i, '');
    const pngSource = pngByStemLower.get(stem.toLowerCase());
    if (!pngSource) {
      result.skippedNoPng++;
      continue;
    }

    const dir = f.path.slice(0, f.path.lastIndexOf('/'));
    const destPngPath = `${dir}/${stem}.png`;

    const ok = await copyPngToDest(pngSource, destPngPath);

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

  const pngInCross = crossFiles.filter((f) => f.name.toLowerCase().endsWith('.png'));

  for (const f of pngInCross) {
    const stem = f.name.replace(/\.png$/i, '');
    const pngSource = pngByStemLower.get(stem.toLowerCase());
    if (!pngSource) continue;
    if (pngSource === f.path) continue;

    const ok = await copyPngToDest(pngSource, f.path);
    if (!ok) {
      result.errors.push(`Не удалось обновить PNG: ${f.path} (из ${pngSource})`);
      continue;
    }
    result.pngUpdated++;
  }

  return result;
}
