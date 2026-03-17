import { NextResponse } from 'next/server';
import { createFolder } from '@/lib/yandex-disk';
import { loadProperties } from '@/lib/properties-manager';
import { PRODUCTS_ROOT, getGroupFolderName } from '@/lib/product-paths';

const BRAND_BASE = 'disk:/Brand';

/**
 * POST: Create Товары folder and all product group folders on Yandex Disk.
 * Groups are taken from properties (Группа товаров). Idempotent: 409 = already exists.
 */
export async function POST() {
  const properties = loadProperties();
  const groups = (properties['Группа товаров'] as string[]) || [];
  if (groups.length === 0) {
    return NextResponse.json({ success: true, message: 'No groups in properties', created: [] });
  }

  const created: string[] = [];
  const errors: string[] = [];

  const productsRootPath = `${BRAND_BASE}/${PRODUCTS_ROOT}`;
  const rootOk = await createFolder(productsRootPath);
  if (rootOk) created.push(PRODUCTS_ROOT);

  const seen = new Set<string>();
  for (const group of groups) {
    const folderName = getGroupFolderName(group);
    if (!folderName || seen.has(folderName)) continue;
    seen.add(folderName);
    const groupPath = `${productsRootPath}/${folderName}`;
    const ok = await createFolder(groupPath);
    if (ok) created.push(`${PRODUCTS_ROOT}/${folderName}`);
    else errors.push(folderName);
  }

  if (errors.length > 0) {
    return NextResponse.json({
      success: true,
      created,
      warning: `Не удалось создать папки: ${errors.join(', ')}`,
    });
  }

  return NextResponse.json({
    success: true,
    created,
    message: `Создано папок: ${created.length}`,
  });
}
