import { NextResponse } from 'next/server';
import { getFiles } from '@/lib/yandex-disk';
import { PRODUCTS_ROOT } from '@/lib/product-paths';
import { getProductGroupNames } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_FULL = `${BRAND_BASE}/${PRODUCTS_ROOT}`;

async function getGroupsFromDisk(): Promise<string[]> {
  try {
    const items = await getFiles(PRODUCTS_FULL, 500);
    return items
      .filter((i) => i.type === 'dir')
      .map((i) => decodeURIComponent(i.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * GET: Список групп товаров — папок внутри «Товары» на Яндекс.Диске.
 * Группа = папка, в которой лежит папка с товаром. Нужен для выбора группы при загрузке файлов.
 */
export async function GET() {
  if (isDbConfigured()) {
    const fromDb = await getProductGroupNames();
    if (fromDb.length > 0) return NextResponse.json({ groups: fromDb });
  }
  const groups = await getGroupsFromDisk();
  return NextResponse.json({ groups });
}
