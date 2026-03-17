import { NextResponse } from 'next/server';
import { createFolder } from '@/lib/yandex-disk';
import { buildProductFolderPath, getFileTypeFolderNames } from '@/lib/product-paths';

const BRAND_BASE = 'disk:/Brand';

/** Create folder and all parent segments. */
async function ensureFolderPath(base: string, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    const ok = await createFolder(`${base}/${acc}`);
    if (!ok) throw new Error(`Failed to create: ${acc}`);
  }
}

/**
 * POST: Create all folders for a product: Товары/{Группа}/{Товар} + Фото, Видео, Документ, Кросс коды, Этикетки.
 * Body: { productName: string, productGroup: string } — группа обязательна.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const productName = typeof body?.productName === 'string' ? body.productName.trim() : '';
  const productGroup = typeof body?.productGroup === 'string' ? body.productGroup.trim() : '';

  if (!productName) {
    return NextResponse.json({ error: 'Укажите название товара' }, { status: 400 });
  }
  if (!productGroup) {
    return NextResponse.json({ error: 'Укажите группу товара' }, { status: 400 });
  }

  const productFolderPath = buildProductFolderPath(productName, productGroup);
  const productFullPath = `${BRAND_BASE}/${productFolderPath}`;

  try {
    await ensureFolderPath(BRAND_BASE, productFolderPath);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const typeFolders = getFileTypeFolderNames();
  for (const typeName of typeFolders) {
    const typePath = `${productFullPath}/${typeName}`;
    const typeOk = await createFolder(typePath);
    if (!typeOk) {
      return NextResponse.json(
        { error: `Failed to create folder: ${typeName}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    path: productFullPath,
    folders: [productFolderPath, ...typeFolders],
  });
}
