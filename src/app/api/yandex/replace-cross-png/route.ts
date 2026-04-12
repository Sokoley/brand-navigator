import { NextResponse } from 'next/server';
import { replaceCrossTxtWithPngFromPngFolder } from '@/lib/replace-cross-png';

/** Долгая операция с Яндекс.Диском; без этого прокси/Vercel часто отдают 502 по таймауту. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST: подтянуть .png из disk:/Brand/PNG в …/Кросс коды/ (замена .txt и обновление уже существующих .png).
 * Тело JSON (опционально): `{ "offset": 0 }` — смещение по списку папок «Кросс коды»; за один запрос обрабатывается партия (по умолчанию 10 папок).
 */
export async function POST(request: Request) {
  try {
    let offset = 0;
    try {
      const body = await request.json();
      if (typeof body?.offset === 'number' && Number.isFinite(body.offset) && body.offset >= 0) {
        offset = Math.floor(body.offset);
      }
    } catch {
      /* пустое тело — offset 0 */
    }

    const r = await replaceCrossTxtWithPngFromPngFolder({ offset });
    const part = `${r.offset + 1}–${r.nextOffset} из ${r.totalCrossFolders} папок «Кросс коды»`;
    return NextResponse.json({
      success: r.errors.length === 0,
      ...r,
      message: `Партия: ${part}. txt→png: ${r.replaced}, обновлено png: ${r.pngUpdated}, без PNG в Brand/PNG (txt): ${r.skippedNoPng}, ошибок: ${r.errors.length}${r.hasMore ? ' — есть ещё партии.' : ''}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
