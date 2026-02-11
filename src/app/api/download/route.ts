import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'file';

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const token = process.env.YANDEX_DISK_TOKEN;
    const response = await fetch(url, {
      headers: token ? { 'Authorization': 'OAuth ' + token } : {},
    });

    if (!response.ok) {
      return new NextResponse('Failed to fetch file', { status: response.status });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return new NextResponse('Download failed', { status: 500 });
  }
}
