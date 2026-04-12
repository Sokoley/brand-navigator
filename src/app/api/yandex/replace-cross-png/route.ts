import { NextResponse } from 'next/server';
import { replaceCrossTxtWithPngFromPngFolder } from '@/lib/replace-cross-png';

/**
 * POST: в папках …/Кросс коды/ под Товарами заменить плейсхолдеры .txt на .png из disk:/Brand/PNG
 * (имя файла без расширения = кросс-код / артикул).
 */
export async function POST() {
  try {
    const r = await replaceCrossTxtWithPngFromPngFolder();
    return NextResponse.json({
      success: r.errors.length === 0,
      ...r,
      message: `Заменено: ${r.replaced}, без PNG в Brand/PNG: ${r.skippedNoPng}, ошибок: ${r.errors.length}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
