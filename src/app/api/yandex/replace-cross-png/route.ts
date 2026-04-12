import { NextResponse } from 'next/server';
import { replaceCrossTxtWithPngFromPngFolder } from '@/lib/replace-cross-png';

/** Долгая операция с Яндекс.Диском; без этого прокси/Vercel часто отдают 502 по таймауту. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST: подтянуть .png из disk:/Brand/PNG в …/Кросс коды/ (замена .txt и обновление уже существующих .png).
 */
export async function POST() {
  try {
    const r = await replaceCrossTxtWithPngFromPngFolder();
    return NextResponse.json({
      success: r.errors.length === 0,
      ...r,
      message: `txt→png: ${r.replaced}, обновлено png: ${r.pngUpdated}, без исходника в Brand/PNG (txt): ${r.skippedNoPng}, ошибок: ${r.errors.length}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
