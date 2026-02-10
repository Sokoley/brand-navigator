import { NextResponse } from 'next/server';
import { deleteResource, getFiles } from '@/lib/yandex-disk';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'products_cache.json');

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  const productName = searchParams.get('product');

  if (productName) {
    // Delete all files for a product
    const items = await getFiles();
    const deletedFiles: string[] = [];
    const errors: string[] = [];

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

    // Invalidate cache
    try { fs.unlinkSync(CACHE_FILE); } catch {}

    return NextResponse.json({
      deleted: deletedFiles,
      errors,
      message: errors.length === 0
        ? `Product "${productName}" deleted. Files removed: ${deletedFiles.length}`
        : `Partial deletion. Removed: ${deletedFiles.length}. Errors: ${errors.join(', ')}`,
    });
  }

  if (filePath) {
    const result = await deleteResource(filePath);
    if (result.code === 204 || result.code === 202) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Provide path or product parameter' }, { status: 400 });
}
