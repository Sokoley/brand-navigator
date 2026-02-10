import { NextResponse } from 'next/server';
import { fetchPreview } from '@/lib/yandex-disk';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#999">Error</text></svg>',
      { status: 400, headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }

  const result = await fetchPreview(url);

  if (result) {
    return new NextResponse(result.data as unknown as BodyInit, {
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  return new NextResponse(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#999">Preview unavailable</text></svg>',
    { headers: { 'Content-Type': 'image/svg+xml' } }
  );
}
