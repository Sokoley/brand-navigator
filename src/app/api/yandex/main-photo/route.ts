import { NextResponse } from 'next/server';
import { getAllFilesRecursive, setCustomProperties } from '@/lib/yandex-disk';
import { parseProductFilePath } from '@/lib/product-paths';
import { getProductFiles, setMainPhoto } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

/**
 * PATCH: Set exactly one file as main photo for a product.
 * Body: { productName: string, filePath: string }
 * Clears "Главное фото" from all other files of the product, then sets it on the given file.
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { productName, filePath } = body;

  if (!productName || !filePath) {
    return NextResponse.json({ error: 'Missing productName or filePath' }, { status: 400 });
  }

  let productFiles: { path: string; name: string; custom_properties?: Record<string, string> }[];
  if (isDbConfigured()) {
    const fromDb = await getProductFiles(productName);
    productFiles = fromDb.map((f) => ({ path: f.path, name: f.name, custom_properties: f.custom_properties }));
  } else {
    const allFiles = await getAllFilesRecursive();
    productFiles = allFiles.filter((f) => {
      if (f.type !== 'file') return false;
      const fromPath = parseProductFilePath(f.path);
      const nameFromProps = f.custom_properties?.['Название товара'] || '';
      return fromPath.productName === productName || nameFromProps === productName;
    });
  }

  const targetFile = productFiles.find((f) => f.path === filePath);
  if (!targetFile) {
    return NextResponse.json({ error: 'File not found in this product' }, { status: 404 });
  }

  const errors: string[] = [];

  for (const f of productFiles) {
    const props = f.custom_properties || {};
    if (!Object.prototype.hasOwnProperty.call(props, 'Главное фото')) continue;
    const newProps = { ...props };
    delete newProps['Главное фото'];
    const ok = await setCustomProperties(f.path, newProps);
    if (!ok) errors.push(f.name);
  }

  const newProps = { ...targetFile.custom_properties, 'Главное фото': 'true' };
  const setOk = await setCustomProperties(filePath, newProps);
  if (!setOk) {
    return NextResponse.json({ error: 'Failed to set main photo' }, { status: 500 });
  }

  if (isDbConfigured()) {
    try {
      await setMainPhoto(productName, filePath);
    } catch {
      // index update best-effort
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({
      success: true,
      warning: `Главное фото установлено, но не удалось снять с: ${errors.join(', ')}`,
    });
  }

  return NextResponse.json({ success: true });
}
