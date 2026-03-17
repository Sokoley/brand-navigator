import { NextResponse } from 'next/server';
import { getProducts, getProductsFromYandex } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contentFilter = searchParams.get('content') || 'Товар';

  const products = isDbConfigured()
    ? await getProducts(contentFilter)
    : await getProductsFromYandex(contentFilter);
  return NextResponse.json(products);
}
