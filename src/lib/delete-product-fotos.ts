/**
 * Удаление всех файлов в папках «Фото» у товаров: disk:/Brand/Товары/…/…/Фото/*
 * Папки «Фото» не удаляются — только содержимое (файлы).
 */

import { deleteResource, listFolderPathsByNameRecursive, listAllFilesInFolder } from '@/lib/yandex-disk';
import { afterDeleteFile } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const PRODUCTS_ROOT = 'disk:/Brand/Товары';
const FOTO_FOLDER_NAME = 'Фото';

export interface DeleteProductFotosResult {
  dryRun: boolean;
  /** Число удалённых файлов (при dryRun — сколько было бы удалено) */
  deleted: number;
  fotoFolders: number;
  errors: string[];
  /** Первые N путей для отчёта */
  samplePaths: string[];
}

export async function deleteAllFilesInProductFotoFolders(options?: {
  dryRun?: boolean;
  /** Максимум файлов для dry-run вывода sample */
  sampleLimit?: number;
}): Promise<DeleteProductFotosResult> {
  const dryRun = Boolean(options?.dryRun);
  const sampleLimit = options?.sampleLimit ?? 50;

  const result: DeleteProductFotosResult = {
    dryRun,
    deleted: 0,
    fotoFolders: 0,
    errors: [],
    samplePaths: [],
  };

  const fotoDirs = await listFolderPathsByNameRecursive(PRODUCTS_ROOT, FOTO_FOLDER_NAME);
  result.fotoFolders = fotoDirs.length;

  for (const dir of fotoDirs) {
    const files = await listAllFilesInFolder(dir);
    for (const f of files) {
      if (dryRun) {
        result.deleted++;
        if (result.samplePaths.length < sampleLimit) result.samplePaths.push(f.path);
        continue;
      }
      const { code } = await deleteResource(f.path);
      if (code === 200 || code === 204) {
        result.deleted++;
        if (result.samplePaths.length < sampleLimit) result.samplePaths.push(f.path);
        if (isDbConfigured()) {
          try {
            await afterDeleteFile(f.path);
          } catch (e) {
            result.errors.push(`БД ${f.path}: ${(e as Error).message}`);
          }
        }
      } else {
        result.errors.push(`Не удалено ${f.path}: HTTP ${code}`);
      }
    }
  }

  return result;
}
