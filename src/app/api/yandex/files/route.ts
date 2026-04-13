import { NextResponse } from 'next/server';
import { getAllFilesRecursive } from '@/lib/yandex-disk';
import { PRODUCTS_ROOT } from '@/lib/product-paths';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const namesOnly = searchParams.get('names') === '1';
    const contentType = searchParams.get('content') || '';

    // Не обходить дерево каталога товаров — странице «Все макеты» оно не нужно и сильно замедляет API.
    const items = await getAllFilesRecursive('disk:/Brand', 'XXXL', undefined, {
      skipDirNames: [PRODUCTS_ROOT],
    });

    if (namesOnly) {
      const names = items
        .filter(item => item.type === 'file')
        .map(item => item.name);
      return NextResponse.json(names);
    }

    let files = items.filter(item => item.type === 'file');

    if (contentType) {
      files = files.filter(f => {
        const ct = f.custom_properties?.['Тип контента'] || '';
        return ct === contentType || ct === '';
      });
    }

    return NextResponse.json(files);
  } catch (e) {
    console.error('[api/yandex/files]', e);
    const message = e instanceof Error ? e.message : 'Ошибка загрузки списка с Яндекс.Диска';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
