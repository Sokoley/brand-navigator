import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import {
  tryStartReindexJob,
  finishReindexJob,
  failReindexJob,
  getReindexJob,
} from '@/lib/reindex-job-db';
import { fullReindex } from '@/services/product-index.service';

/**
 * POST: запуск полной переиндексации (фон — 202). Состояние хранится в таблице reindex_meta (общее для воркеров).
 * GET: статус для опроса.
 * Admin only (middleware).
 */

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'DATABASE_URL не задан. Добавьте в .env (см. .env.example) и перезапустите сервер.' },
      { status: 503 },
    );
  }

  try {
    await ensureSchema();
  } catch (error) {
    console.error('Reindex ensureSchema:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка схемы БД' },
      { status: 500 },
    );
  }

  let start: 'started' | 'already_running';
  try {
    start = await tryStartReindexJob();
  } catch (error) {
    console.error('Reindex tryStart:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка БД' },
      { status: 500 },
    );
  }

  if (start === 'already_running') {
    return NextResponse.json(
      { error: 'Переиндексация уже выполняется. Дождитесь завершения или обновите страницу.' },
      { status: 409 },
    );
  }

  const { searchParams } = new URL(request.url);
  const contentFilter = searchParams.get('content') || 'Товар';

  fullReindex(contentFilter)
    .then((result) => finishReindexJob(result.products, result.files))
    .catch((error) => {
      console.error('Reindex error:', error);
      return failReindexJob(error instanceof Error ? error.message : 'Reindex failed');
    });

  return NextResponse.json(
    {
      accepted: true,
      message: 'Переиндексация запущена. Ожидайте завершения…',
    },
    { status: 202 },
  );
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'DATABASE_URL не задан.', status: 'unavailable' },
      { status: 503 },
    );
  }

  try {
    await ensureSchema();
    const row = await getReindexJob();
    if (!row) {
      return NextResponse.json({ status: 'idle' });
    }

    switch (row.status) {
      case 'idle':
        return NextResponse.json({ status: 'idle' });
      case 'running':
        return NextResponse.json({
          status: 'running',
          startedAt: row.started_at ? row.started_at.getTime() : null,
        });
      case 'done': {
        const products = row.products ?? 0;
        const files = row.files ?? 0;
        return NextResponse.json({
          status: 'done',
          success: true,
          message: `Reindex complete. Products: ${products}, files: ${files}`,
          products,
          files,
        });
      }
      case 'error':
        return NextResponse.json({
          status: 'error',
          error: row.error_message || 'Ошибка переиндексации',
        });
      default:
        return NextResponse.json({ status: 'idle' });
    }
  } catch (error) {
    console.error('[reindex GET]', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Ошибка чтения статуса из БД',
      },
      { status: 500 },
    );
  }
}
