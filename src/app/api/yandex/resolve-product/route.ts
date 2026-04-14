import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { resolveProductBySlug } from '@/services/product-index.service';

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 });
  }
  const slug = request.nextUrl.searchParams.get('slug')?.trim();
  const group = request.nextUrl.searchParams.get('group')?.trim() ?? '';
  if (!slug) {
    return NextResponse.json({ error: 'Укажите slug' }, { status: 400 });
  }
  try {
    const resolved = await resolveProductBySlug(slug, group || undefined);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            'Товар не найден. Если slug совпадает в разных группах, добавьте параметр group в URL.',
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ name: resolved.name, group: resolved.product_group });
  } catch (e) {
    console.error('[resolve-product]', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
