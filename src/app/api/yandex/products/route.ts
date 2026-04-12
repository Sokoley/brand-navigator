import { NextResponse } from 'next/server';
import { getProducts, getProductsFromYandex } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contentFilter = searchParams.get('content') || 'Товар';

  try {
    if (isDbConfigured()) {
      try {
        const products = await getProducts(contentFilter);
        return NextResponse.json(products);
      } catch (dbErr) {
        console.error('[api/yandex/products] ошибка БД, fallback на обход Яндекс.Диска', dbErr);
      }
    }
    const products = await getProductsFromYandex(contentFilter);
    return NextResponse.json(products);
  } catch (err) {
    console.error('[api/yandex/products]', err);
    return NextResponse.json({});
  }
}
