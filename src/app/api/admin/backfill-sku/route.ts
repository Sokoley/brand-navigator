import { NextResponse } from 'next/server';
import { backfillSkuFromCrossFilenames } from '@/lib/backfill-sku-from-cross-files';

/**
 * POST: заполнить product_files.sku из имён файлов в путях …/Кросс коды/… (где sku пустой).
 */
export async function POST() {
  try {
    const r = await backfillSkuFromCrossFilenames();
    return NextResponse.json({
      success: r.errors.length === 0,
      ...r,
      message: `Обновлено записей: ${r.updated}, пропущено: ${r.skipped}, ошибок: ${r.errors.length}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
