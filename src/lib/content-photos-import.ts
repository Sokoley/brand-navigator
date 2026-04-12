/**
 * Импорт изображений из Brand/1. Фото → Brand/Товары/…/Фото.
 *
 * Сопоставление только по тексту: эвристики по имени файла, SKU из базы, транслиту, Левенштейн.
 */

import {
  getAllFilesRecursive,
  getFiles,
  copyFileOnDisk,
  createFolder,
  getResource,
} from '@/lib/yandex-disk';
import { buildProductFolderPath } from '@/lib/product-paths';
import { transliterate, levenshteinDistance } from '@/lib/search';
import { afterUpload } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

/** Источник фото для разбора и копирования в карточки товаров */
export const CONTENT_PHOTOS_SOURCE = 'disk:/Brand/1. Фото';
const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_DISK = 'disk:/Brand/Товары';

export interface ContentPhotoCatalogEntry {
  group: string;
  productName: string;
  skus: string[];
}

export interface ContentPhotoImportResult {
  copied: number;
  skipped: number;
  dryRun: boolean;
  /** Всегда 0 (поле сохранено для совместимости со старыми клиентами API). */
  visionCalls: number;
  unmatched: Array<{ file: string; reason: string }>;
  ambiguous: Array<{ file: string; candidates: string[] }>;
  errors: string[];
  details: Array<{ from: string; to: string; product: string; score: number; source: 'text' }>;
}

async function ensureFolderPath(base: string, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    await createFolder(`${base}/${acc}`);
  }
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name);
}

/** Список товаров с диска: Товары/{группа}/{название} */
export async function listProductsFromDisk(): Promise<ContentPhotoCatalogEntry[]> {
  const groups = await getFiles(PRODUCTS_DISK);
  const out: ContentPhotoCatalogEntry[] = [];
  for (const g of groups) {
    if (g.type !== 'dir') continue;
    const products = await getFiles(g.path);
    for (const p of products) {
      if (p.type !== 'dir') continue;
      out.push({ group: g.name, productName: p.name, skus: [] });
    }
  }
  return out;
}

async function mergeSkusFromDb(entries: ContentPhotoCatalogEntry[]): Promise<ContentPhotoCatalogEntry[]> {
  try {
    const { getProducts } = await import('@/services/product-index.service');
    const fromDb = await getProducts('Товар');
    const skuByKey = new Map<string, string[]>();
    for (const p of Object.values(fromDb)) {
      const key = `${p.group}\0${p.name}`;
      skuByKey.set(key, p.skus || []);
    }
    return entries.map((e) => {
      const skus = skuByKey.get(`${e.group}\0${e.productName}`);
      return skus?.length ? { ...e, skus } : e;
    });
  } catch {
    return entries;
  }
}

function normalizeStem(name: string): string {
  return name
    .replace(/\.[^.]+$/i, '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '');
}

/**
 * Оценка 0–100: чем выше, тем вероятнее что файл относится к товару.
 * Не использует содержимое изображения.
 */
export function scoreFileToProduct(stem: string, product: ContentPhotoCatalogEntry): number {
  const f = normalizeStem(stem);
  const pName = normalizeStem(product.productName);
  if (!f || !pName) return 0;

  const fTrans = alnum(transliterate(stem));
  const pTrans = alnum(transliterate(product.productName));

  if (pName.length >= 4 && f.includes(pName)) return 100;
  if (f.length >= 5 && pName.includes(f)) return 98;

  for (const sku of product.skus) {
    const s = sku.trim().toLowerCase();
    if (s.length >= 3 && f.includes(s)) return 95;
    if (s.length >= 4 && fTrans.includes(alnum(s))) return 93;
  }

  if (pTrans.length >= 6 && fTrans.includes(pTrans)) return 90;
  if (pTrans.length >= 8 && fTrans.includes(pTrans.slice(0, Math.min(16, pTrans.length)))) return 85;

  const ft = f.split(' ').filter((t) => t.length > 2);
  const pt = pName.split(' ').filter((t) => t.length > 2);
  let hits = 0;
  for (const t of pt) {
    if (ft.some((x) => x.includes(t) || t.includes(x))) hits++;
  }
  if (hits >= 2) return 78;
  if (hits === 1 && pt.length <= 4) return 70;

  const n = Math.min(f.length, pName.length, 24);
  if (n >= 4) {
    const d = levenshteinDistance(f.slice(0, n), pName.slice(0, n));
    if (d <= 2 && n <= 18) return 72;
    if (d <= 3 && n <= 12) return 65;
  }

  const n2 = Math.min(fTrans.length, pTrans.length, 20);
  if (n2 >= 6) {
    const d2 = levenshteinDistance(fTrans.slice(0, n2), pTrans.slice(0, n2));
    if (d2 <= 2) return 68;
  }

  return 0;
}

/** Все товары с баллом, по убыванию. */
export function rankAllProductsByScore(
  stem: string,
  catalog: ContentPhotoCatalogEntry[],
): Array<{ product: ContentPhotoCatalogEntry; score: number }> {
  return catalog
    .map((product) => ({ product, score: scoreFileToProduct(stem, product) }))
    .sort((a, b) => b.score - a.score);
}

function makeImportLogger(verbose: boolean): (msg: string) => void {
  if (!verbose) return () => {};
  return (msg: string) => {
    console.error(`[import ${new Date().toISOString()}] ${msg}`);
  };
}

async function uniqueDestName(fotoDir: string, baseName: string): Promise<string> {
  const existing = await getFiles(fotoDir);
  const names = new Set(existing.filter((i) => i.type === 'file').map((i) => i.name));
  if (!names.has(baseName)) return baseName;
  const dot = baseName.lastIndexOf('.');
  const base = dot === -1 ? baseName : baseName.slice(0, dot);
  const ext = dot === -1 ? '' : baseName.slice(dot);
  let n = 1;
  let candidate = `${base}_${n}${ext}`;
  while (names.has(candidate)) {
    n++;
    candidate = `${base}_${n}${ext}`;
  }
  return candidate;
}

export async function importContentPhotosToProducts(options?: {
  dryRun?: boolean;
  minScore?: number;
  limit?: number;
  /** @deprecated игнорируется (совместимость с телом API) */
  useVision?: boolean;
  /** @deprecated игнорируется */
  visionCandidateLimit?: number;
  /** Подробный лог в stderr (console.error с временем) */
  verbose?: boolean;
}): Promise<ContentPhotoImportResult> {
  const dryRun = Boolean(options?.dryRun);
  const minScore = options?.minScore ?? 72;
  const limit = options?.limit;
  const log = makeImportLogger(Boolean(options?.verbose));

  const result: ContentPhotoImportResult = {
    copied: 0,
    skipped: 0,
    dryRun,
    visionCalls: 0,
    unmatched: [],
    ambiguous: [],
    errors: [],
    details: [],
  };

  log(
    `Старт: источник=${CONTENT_PHOTOS_SOURCE}, minScore=${minScore}, limit=${limit ?? 'нет'}, dryRun=${dryRun} (только текстовое сопоставление)`,
  );

  log('Загрузка каталога товаров с disk:/Brand/Товары…');
  let catalog = await listProductsFromDisk();
  if (isDbConfigured()) {
    catalog = await mergeSkusFromDb(catalog);
  }
  log(`Каталог: ${catalog.length} товаров (папки группа/название).`);

  if (catalog.length === 0) {
    result.errors.push('Не найдено ни одной папки товара в disk:/Brand/Товары');
    return result;
  }

  log(`Рекурсивный обход источника (может занять время): ${CONTENT_PHOTOS_SOURCE}…`);
  const t0 = Date.now();
  const allItems = await getAllFilesRecursive(CONTENT_PHOTOS_SOURCE);
  const images = allItems.filter((it) => it.type === 'file' && isImageFile(it.name));
  log(
    `Обход источника за ${((Date.now() - t0) / 1000).toFixed(1)} с: всего узлов ${allItems.length}, изображений ${images.length}.`,
  );

  if (images.length === 0) {
    result.errors.push(`Нет изображений (.png/.jpg/.jpeg/.webp) в ${CONTENT_PHOTOS_SOURCE}`);
    return result;
  }

  const totalPlan = limit != null ? Math.min(limit, images.length) : images.length;
  log(`Обработка файлов: в очереди ${totalPlan} из ${images.length}${limit != null ? ` (limit=${limit})` : ''}.`);

  let processed = 0;
  let idx = 0;
  for (const item of images) {
    if (limit != null && processed >= limit) break;
    idx++;
    const stem = item.name.replace(/\.[^.]+$/i, '');
    const rankedAll = rankAllProductsByScore(stem, catalog);
    const top = rankedAll[0];
    const second = rankedAll[1];

    log(
      `[${idx}/${totalPlan}] файл=${item.name} stem="${stem}" | топ1: ${top ? `${top.product.productName} (${top.score})` : '—'} | топ2: ${second ? `${second.product.productName} (${second.score})` : '—'}`,
    );

    const textClear =
      Boolean(top) &&
      top!.score >= minScore &&
      !(second && top!.score - second.score < 5 && second.score >= minScore);

    const resolved: { product: ContentPhotoCatalogEntry; score: number } | null =
      textClear && top ? { product: top.product, score: top.score } : null;

    if (resolved) {
      log(`  → решение: текст, товар="${resolved.product.productName}", балл=${resolved.score}`);
    }

    if (!resolved) {
      if (
        !textClear &&
        top &&
        second &&
        top.score - second.score < 5 &&
        second.score >= minScore
      ) {
        log(`  → пропуск: спорный текст (два близких балла)`);
        result.ambiguous.push({
          file: item.path,
          candidates: [top.product.productName, second.product.productName],
        });
      } else {
        log(`  → пропуск: не сопоставлено`);
        result.unmatched.push({
          file: item.path,
          reason: `нет уверенного совпадения ≥ ${minScore} по имени/SKU (лучший балл: ${top?.score ?? 0})`,
        });
      }
      result.skipped++;
      processed++;
      continue;
    }

    const best = resolved.product;
    const score = resolved.score;
    const rel = buildProductFolderPath(best.productName, best.group);
    const fotoDir = `${BRAND_BASE}/${rel}/Фото`;

    result.details.push({
      from: item.path,
      to: `${fotoDir}/${item.name}`,
      product: `${best.group} / ${best.productName}`,
      score,
      source: 'text',
    });

    if (dryRun) {
      log(`  → dry-run: копирование не выполняется, условно OK → ${fotoDir}/${item.name}`);
      result.copied++;
      processed++;
      continue;
    }

    try {
      log(`  → копирование: ${item.path} → …`);
      await ensureFolderPath(BRAND_BASE, `${rel}/Фото`);
      const destName = await uniqueDestName(fotoDir, item.name);
      const destPath = `${fotoDir}/${destName}`;
      result.details[result.details.length - 1] = {
        from: item.path,
        to: destPath,
        product: `${best.group} / ${best.productName}`,
        score,
        source: 'text',
      };

      const ok = await copyFileOnDisk(item.path, destPath, true);
      if (!ok) {
        log(`  → ОШИБКА копирования на Диске`);
        result.errors.push(`Копирование не удалось: ${item.path} → ${destPath}`);
        result.skipped++;
        processed++;
        continue;
      }
      result.copied++;
      processed++;
      log(`  → OK: ${destPath}`);

      if (isDbConfigured()) {
        const meta = await getResource(destPath);
        if (meta?.file) {
          await afterUpload(
            destPath,
            best.productName,
            best.group,
            'Фото',
            null,
            {
              name: destName,
              preview: meta.preview || '',
              file: meta.file || '',
              size: meta.size ?? 0,
              created: meta.created || '',
            },
          );
        }
      }
    } catch (e) {
      result.errors.push(`${item.path}: ${(e as Error).message}`);
      result.skipped++;
      processed++;
    }
  }

  log(
    `Готово: copied=${result.copied}, skipped=${result.skipped}, unmatched=${result.unmatched.length}, ambiguous=${result.ambiguous.length}, errors=${result.errors.length}`,
  );

  return result;
}
