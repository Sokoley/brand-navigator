import { NextResponse } from 'next/server';
import { deleteResource, getFiles, getAllFilesRecursive } from '@/lib/yandex-disk';
import { PRODUCTS_ROOT } from '@/lib/product-paths';
import { afterDeleteFile, afterDeleteProduct } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const BRAND_BASE = 'disk:/Brand';

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  const productName = searchParams.get('product');

  if (productName) {
    const deletedFiles: string[] = [];
    const errors: string[] = [];
    const productDirs: { path: string; name: string }[] = [];

    const topLevel = await getFiles(BRAND_BASE);
    const productsFolder = topLevel.find((item) => item.type === 'dir' && item.name === PRODUCTS_ROOT);

    if (productsFolder) {
      const groups = await getFiles(productsFolder.path);
      for (const groupDir of groups) {
        if (groupDir.type !== 'dir') continue;
        const productFolders = await getFiles(groupDir.path);
        for (const item of productFolders) {
          if (item.type === 'dir' && decodeURIComponent(item.name) === productName) {
            productDirs.push({ path: item.path, name: item.name });
          }
        }
      }
    }

    const legacyDirs = topLevel.filter((item) => item.type === 'dir' && item.name === productName);
    const seen = new Set(productDirs.map((d) => d.path));
    for (const d of legacyDirs) {
      if (!seen.has(d.path)) {
        seen.add(d.path);
        productDirs.push({ path: d.path, name: d.name });
      }
    }

    if (productDirs.length > 0) {
      for (const dir of productDirs) {
        const result = await deleteResource(dir.path);
        if (result.code === 204 || result.code === 202) {
          deletedFiles.push(dir.name);
        } else {
          errors.push(`Error deleting folder ${dir.name}`);
        }
      }
    } else {
      const items = await getAllFilesRecursive();
      for (const file of items) {
        if (file.type !== 'file') continue;
        const fileProductName = file.custom_properties?.['Название товара'] || '';
        if (fileProductName === productName) {
          const result = await deleteResource(file.path);
          if (result.code === 204 || result.code === 202) {
            deletedFiles.push(file.name);
          } else {
            errors.push(`Error deleting ${file.name}`);
          }
        }
      }
    }

    if (isDbConfigured()) {
      try {
        await afterDeleteProduct(productName);
      } catch {
        // index update best-effort
      }
    }

    return NextResponse.json({
      deleted: deletedFiles,
      errors,
      message:
        errors.length === 0
          ? `Product "${productName}" deleted. Removed: ${deletedFiles.length}`
          : `Partial deletion. Removed: ${deletedFiles.length}. Errors: ${errors.join(', ')}`,
    });
  }

  if (filePath) {
    const result = await deleteResource(filePath);
    if (result.code === 204 || result.code === 202) {
      if (isDbConfigured()) {
        try {
          await afterDeleteFile(filePath);
        } catch {
          // index update best-effort
        }
      }
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Provide path or product parameter' }, { status: 400 });
}
