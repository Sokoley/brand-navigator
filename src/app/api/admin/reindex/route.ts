import { NextResponse } from 'next/server';
import { runSchema } from '@/lib/db';
import { fullReindex } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

/**
 * POST: запуск полной переиндексации с Яндекс.Диска в MariaDB (в фоне — ответ 202, без долгого HTTP).
 * GET: статус последней операции (для опроса после POST).
 * Admin only (middleware).
 */

type ReindexState =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'done'; result: { products: number; files: number }; finishedAt: number }
  | { phase: 'error'; message: string; finishedAt: number };

let reindexState: ReindexState = { phase: 'idle' };

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'DATABASE_URL не задан. Добавьте в .env (см. .env.example) и перезапустите сервер.' },
      { status: 503 },
    );
  }

  if (reindexState.phase === 'running') {
    return NextResponse.json(
      { error: 'Переиндексация уже выполняется. Дождитесь завершения или обновите страницу.' },
      { status: 409 },
    );
  }

  try {
    await runSchema();
  } catch (error) {
    console.error('Reindex runSchema:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка схемы БД' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const contentFilter = searchParams.get('content') || 'Товар';

  reindexState = { phase: 'running', startedAt: Date.now() };

  fullReindex(contentFilter)
    .then((result) => {
      reindexState = {
        phase: 'done',
        result: { products: result.products, files: result.files },
        finishedAt: Date.now(),
      };
    })
    .catch((error) => {
      console.error('Reindex error:', error);
      reindexState = {
        phase: 'error',
        message: error instanceof Error ? error.message : 'Reindex failed',
        finishedAt: Date.now(),
      };
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
      { error: 'DATABASE_URL не задан.' },
      { status: 503 },
    );
  }

  switch (reindexState.phase) {
    case 'idle':
      return NextResponse.json({ status: 'idle' });
    case 'running':
      return NextResponse.json({
        status: 'running',
        startedAt: reindexState.startedAt,
      });
    case 'done': {
      const { products, files } = reindexState.result;
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
        error: reindexState.message,
      });
    default:
      return NextResponse.json({ status: 'idle' });
  }
}
