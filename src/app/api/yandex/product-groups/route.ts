import { NextResponse } from 'next/server';
import { getFiles } from '@/lib/yandex-disk';
import { PRODUCTS_ROOT } from '@/lib/product-paths';

const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_FULL = `${BRAND_BASE}/${PRODUCTS_ROOT}`;

/**
 * GET: Список групп товаров — по названиям папок в Brand/Товары/ на Яндекс.Диске.
 * Путь на Диске: Brand/Товары/{Группа товара}/{Товар}/Фото|Видео|...
 */
export async function GET() {
  try {
    const items = await getFiles(PRODUCTS_FULL, 500);
    const groups = items
      .filter((i) => i.type === 'dir')
      .map((i) => decodeURIComponent(i.name))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ groups: [] });
  }
}
