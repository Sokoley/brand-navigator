import { NextResponse } from 'next/server';

type OzonProductRow = {
  sku: string;
  name: string;
  images: string[];
  primaryImage: string | null;
};

function mapOzonItems(data: { items?: unknown[] }): OzonProductRow[] {
  return (
    (data.items as any[])?.map((item) => ({
      sku: item.offer_id,
      name: item.name,
      images: [...(item.primary_image || []), ...(item.images || [])],
      primaryImage: item.primary_image?.[0] || null,
    })) || []
  );
}

/** Сохраняет порядок, убирает дубликаты URL (в т.ч. между кабинетами). */
function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function mergeProductLists(lists: OzonProductRow[][]): OzonProductRow[] {
  const bySku = new Map<string, OzonProductRow>();
  for (const list of lists) {
    for (const p of list) {
      const cur = bySku.get(p.sku);
      if (!cur) {
        bySku.set(p.sku, {
          sku: p.sku,
          name: p.name,
          images: dedupeImageUrls(p.images),
          primaryImage: p.primaryImage,
        });
      } else {
        cur.images = dedupeImageUrls([...cur.images, ...p.images]);
        if (!cur.name && p.name) cur.name = p.name;
        if (!cur.primaryImage && p.primaryImage) cur.primaryImage = p.primaryImage;
      }
    }
  }
  return Array.from(bySku.values());
}

async function fetchOzonProductsForAccount(
  skus: string[],
  clientId: string,
  apiKey: string
): Promise<{ ok: true; products: OzonProductRow[] } | { ok: false; status: number; body: string }> {
  const response = await fetch('https://api-seller.ozon.ru/v3/product/info/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': clientId,
      'Api-Key': apiKey,
    },
    body: JSON.stringify({ offer_id: skus }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, status: response.status, body };
  }

  const data = await response.json();
  return { ok: true, products: mapOzonItems(data) };
}

export async function POST(request: Request) {
  try {
    const { skus } = await request.json();

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
    }

    const accounts: { clientId: string; apiKey: string }[] = [];

    const mainKey = process.env.OZON_API_KEY;
    const mainId = process.env.OZON_CLIENT_ID;
    if (mainKey && mainId) {
      accounts.push({ clientId: mainId, apiKey: mainKey });
    }

    const pmKey = process.env.OZON_API_KEY_PM;
    const pmId = process.env.OZON_CLIENT_ID_PM;
    if (pmKey && pmId) {
      accounts.push({ clientId: pmId, apiKey: pmKey });
    }

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'OZON API credentials not configured', products: [] },
        { status: 503 }
      );
    }

    const results = await Promise.all(
      accounts.map((a) => fetchOzonProductsForAccount(skus, a.clientId, a.apiKey))
    );

    const okLists: OzonProductRow[][] = [];
    for (const r of results) {
      if (r.ok) {
        okLists.push(r.products);
      } else {
        console.error('OZON API error:', r.status, r.body);
      }
    }

    if (okLists.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch from OZON API' }, { status: 502 });
    }

    const products = mergeProductLists(okLists);
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching OZON products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
