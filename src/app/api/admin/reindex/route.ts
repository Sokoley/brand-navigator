import { NextResponse } from 'next/server';
import { runSchema } from '@/lib/db';
import { fullReindex } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

/**
 * POST: Full reindex from Yandex Disk into MariaDB.
 * Creates tables if missing, then truncates and repopulates from disk.
 * Admin only (middleware).
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'DATABASE_URL не задан. Добавьте в .env (см. .env.example) и перезапустите сервер.' },
      { status: 503 }
    );
  }

  try {
    await runSchema();
    const { searchParams } = new URL(request.url);
    const contentFilter = searchParams.get('content') || 'Товар';
    const result = await fullReindex(contentFilter);
    return NextResponse.json({
      success: true,
      message: `Reindex complete. Products: ${result.products}, files: ${result.files}`,
      products: result.products,
      files: result.files,
    });
  } catch (error) {
    console.error('Reindex error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reindex failed' },
      { status: 500 }
    );
  }
}
