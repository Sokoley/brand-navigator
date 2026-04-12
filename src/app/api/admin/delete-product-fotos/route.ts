import { NextResponse } from 'next/server';
import { deleteAllFilesInProductFotoFolders } from '@/lib/delete-product-fotos';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST: удалить все файлы в папках Товары/…/Фото/ на Яндекс.Диске.
 * Body: { "dryRun": true } — только подсчёт и пример путей; { "execute": true } — реальное удаление.
 */
export async function POST(request: Request) {
  try {
    let dryRun = true;
    try {
      const body = await request.json();
      if (body?.execute === true) dryRun = false;
      else if (typeof body?.dryRun === 'boolean') dryRun = body.dryRun;
    } catch {
      /* пустое тело — безопасный dry-run */
    }

    const r = await deleteAllFilesInProductFotoFolders({ dryRun });
    const msg = r.dryRun
      ? `[dry-run] папок «Фото»: ${r.fotoFolders}, файлов к удалению: ${r.deleted}`
      : `Удалено файлов: ${r.deleted}, папок «Фото»: ${r.fotoFolders}`;

    return NextResponse.json({
      success: r.errors.length === 0,
      message: msg,
      ...r,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
