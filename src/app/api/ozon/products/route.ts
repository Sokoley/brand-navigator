import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { skus } = await request.json();

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
    }

    const ozonApiKey = process.env.OZON_API_KEY;
    const ozonClientId = process.env.OZON_CLIENT_ID;

    if (!ozonApiKey || !ozonClientId) {
      return NextResponse.json(
        { error: 'OZON API credentials not configured', products: [] },
        { status: 503 }
      );
    }

    // Call OZON API
    const response = await fetch('https://api-seller.ozon.ru/v3/product/info/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': ozonClientId,
        'Api-Key': ozonApiKey,
      },
      body: JSON.stringify({
        offer_id: skus,
      }),
    });

    if (!response.ok) {
      console.error('OZON API error:', response.status, await response.text());
      return NextResponse.json(
        { error: 'Failed to fetch from OZON API' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract images from response
    const productsWithImages = data.items?.map((item: any) => ({
      sku: item.offer_id,
      name: item.name,
      images: [...(item.primary_image || []), ...(item.images || [])],
      primaryImage: item.primary_image?.[0] || null,
    })) || [];

    return NextResponse.json({ products: productsWithImages });
  } catch (error) {
    console.error('Error fetching OZON products:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
