import { NextResponse } from 'next/server';
import { isAllowedYandexUrl } from '@/lib/allowed-yandex-urls';
import { getResource } from '@/lib/yandex-disk';

/** Разрешённые пути для скачивания по `path` (защита от произвольных disk:/). */
function isAllowedDiskPath(p: string): boolean {
  return typeof p === 'string' && p.startsWith('disk:/Brand/');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const diskPath = searchParams.get('path')?.trim() ?? '';
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'file';

  if (diskPath) {
    if (!isAllowedDiskPath(diskPath)) {
      return new NextResponse('Invalid path', { status: 400 });
    }
    if (!process.env.YANDEX_DISK_TOKEN) {
      return new NextResponse('YANDEX_DISK_TOKEN is not configured', { status: 503 });
    }
    try {
      const meta = await getResource(diskPath);
      if (!meta?.file) {
        return new NextResponse('File not found', { status: 404 });
      }
      const token = process.env.YANDEX_DISK_TOKEN;
      const response = await fetch(meta.file, {
        headers: { Authorization: 'OAuth ' + token },
      });
      if (!response.ok) {
        console.error('[download] fetch by path failed', response.status, diskPath.slice(0, 80));
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
      console.error('[download] path error:', error);
      return new NextResponse('Download failed', { status: 500 });
    }
  }

  if (!url) {
    return new NextResponse('Missing url or path parameter', { status: 400 });
  }
  if (!isAllowedYandexUrl(url)) {
    return new NextResponse('Invalid url', { status: 400 });
  }

  try {
    const token = process.env.YANDEX_DISK_TOKEN;
    const response = await fetch(url, {
      headers: token ? { Authorization: 'OAuth ' + token } : {},
    });

    if (!response.ok) {
      console.error('[download] fetch by url failed', response.status);
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
