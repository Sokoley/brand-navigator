import {
  copyFileOnDisk,
  deleteResource,
  downloadFileBuffer,
  getAllFilesRecursive,
  getFiles,
  getUploadUrl,
  listFolderPathsByNameRecursive,
  uploadToHref,
} from '@/lib/yandex-disk';
import type { YandexDiskItem } from '@/lib/types';

const PNG_ROOT = 'disk:/Brand/PNG';
const PRODUCTS_ROOT = 'disk:/Brand/Товары';
/** Имя папки на Диске (как в пути …/Кросс коды/…) */
const CROSS_FOLDER_NAME = 'Кросс коды';

/** Сколько папок «Кросс коды» (условно — товаров) за один HTTP-запрос / проход. */
export const REPLACE_CROSS_PNG_DEFAULT_BATCH = 10;

export interface ReplaceCrossPngResult {
  /** .txt заменены на .png и удалены */
  replaced: number;
  /** существующие .png в Кросс коды перезаписаны из Brand/PNG */
  pngUpdated: number;
  skippedNoPng: number;
  errors: string[];
}

export interface ReplaceCrossPngOptions {
  /** Индекс первой папки «Кросс коды» в отсортированном списке */
  offset?: number;
  /** Число папок за проход (по умолчанию {@link REPLACE_CROSS_PNG_DEFAULT_BATCH}) */
  batchSize?: number;
}

export type ReplaceCrossPngBatchResult = ReplaceCrossPngResult & {
  offset: number;
  batchSize: number;
  totalCrossFolders: number;
  /** Сколько папок «Кросс коды» обработано в этой партии */
  processedInBatch: number;
  hasMore: boolean;
  nextOffset: number;
};

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
 *
 * По умолчанию за один вызов обрабатывается не больше {@link REPLACE_CROSS_PNG_DEFAULT_BATCH} папок «Кросс коды»;
 * следующие — через повторный вызов с `offset: nextOffset`.
 */
export async function replaceCrossTxtWithPngFromPngFolder(
  options?: ReplaceCrossPngOptions,
): Promise<ReplaceCrossPngBatchResult> {
  const offset = Math.max(0, Math.floor(options?.offset ?? 0));
  const batchSize = Math.min(100, Math.max(1, Math.floor(options?.batchSize ?? REPLACE_CROSS_PNG_DEFAULT_BATCH)));

  const result: ReplaceCrossPngBatchResult = {
    replaced: 0,
    pngUpdated: 0,
    skippedNoPng: 0,
    errors: [],
    offset,
    batchSize,
    totalCrossFolders: 0,
    processedInBatch: 0,
    hasMore: false,
    nextOffset: offset,
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

  let crossFolderPaths = await listFolderPathsByNameRecursive(PRODUCTS_ROOT, CROSS_FOLDER_NAME);
  crossFolderPaths.sort((a, b) => a.localeCompare(b));
  result.totalCrossFolders = crossFolderPaths.length;

  const batchPaths = crossFolderPaths.slice(offset, offset + batchSize);
  result.processedInBatch = batchPaths.length;
  result.nextOffset = offset + batchPaths.length;
  result.hasMore = result.nextOffset < result.totalCrossFolders;

  const crossFiles: YandexDiskItem[] = [];
  for (const crossPath of batchPaths) {
    const inner = await getFiles(crossPath, 1000);
    for (const f of inner) {
      if (f.type === 'file') crossFiles.push(f);
    }
  }

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
