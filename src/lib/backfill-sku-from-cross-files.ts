import { getPool, ensureSchema, executeWithRetry } from '@/lib/db';
import { addSKU } from '@/lib/properties-manager';

const CROSS_MARKER = '/Кросс коды/';
/** Плейсхолдер из seed, не артикул */
const PLACEHOLDER_STEMS = new Set(['articul', 'file']);

export interface BackfillSkuResult {
  updated: number;
  skipped: number;
  errors: string[];
}

function stemFromPath(path: string): string | null {
  const last = path.split('/').pop() || '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* оставить как есть */
  }
  const stem = name.replace(/\.[^./\\]+$/i, '').trim();
  if (!stem) return null;
  if (PLACEHOLDER_STEMS.has(stem.toLowerCase())) return null;
  return stem;
}

/**
 * Одноразово: для строк в product_files с путём …/Кросс коды/… заполнить sku
 * из имени файла (без расширения), если sku ещё пустой.
 */
export async function backfillSkuFromCrossFilenames(): Promise<BackfillSkuResult> {
  const pool = getPool();
  if (!pool) {
    throw new Error('DATABASE_URL не задан');
  }
  await ensureSchema();

  const result: BackfillSkuResult = { updated: 0, skipped: 0, errors: [] };

  const [rows] = await executeWithRetry(
    `SELECT id, path, sku FROM product_files WHERE path LIKE ?`,
    [`%${CROSS_MARKER}%`]
  );
  const list = (Array.isArray(rows) ? rows : []) as { id: number; path: string; sku: string | null }[];

  const addedSkus = new Set<string>();

  for (const row of list) {
    const stem = stemFromPath(row.path);
    if (!stem) {
      result.skipped++;
      continue;
    }
    const current = (row.sku || '').trim();
    if (current) {
      result.skipped++;
      continue;
    }

    try {
      await executeWithRetry('UPDATE product_files SET sku = ? WHERE id = ?', [stem, row.id]);
      result.updated++;
      if (!addedSkus.has(stem)) {
        addSKU(stem);
        addedSkus.add(stem);
      }
    } catch (e) {
      result.errors.push(`${row.path}: ${(e as Error).message}`);
    }
  }

  return result;
}
