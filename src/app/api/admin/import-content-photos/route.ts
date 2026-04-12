import { NextResponse } from 'next/server';
import { importContentPhotosToProducts } from '@/lib/content-photos-import';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST: скопировать изображения из Brand/1. Фото в папки Фото товаров.
 * Сопоставление только по имени файла и SKU (поля useVision / visionCandidateLimit в теле игнорируются).
 */
export async function POST(request: Request) {
  try {
    let dryRun = false;
    let minScore = 72;
    let limit: number | undefined;
    let useVision: boolean | undefined;
    let visionCandidateLimit: number | undefined;
    let verbose = false;
    try {
      const body = await request.json();
      if (typeof body?.dryRun === 'boolean') dryRun = body.dryRun;
      if (typeof body?.minScore === 'number' && Number.isFinite(body.minScore)) {
        minScore = Math.max(50, Math.min(100, Math.floor(body.minScore)));
      }
      if (typeof body?.limit === 'number' && body.limit > 0) limit = Math.floor(body.limit);
      if (typeof body?.useVision === 'boolean') useVision = body.useVision;
      if (typeof body?.visionCandidateLimit === 'number' && body.visionCandidateLimit > 0) {
        visionCandidateLimit = Math.floor(body.visionCandidateLimit);
      }
      if (typeof body?.verbose === 'boolean') verbose = body.verbose;
    } catch {
      /* пустое тело */
    }

    const r = await importContentPhotosToProducts({
      dryRun,
      minScore,
      limit,
      useVision,
      visionCandidateLimit,
      verbose,
    });
    const msg = dryRun
      ? `[dry-run] было бы скопировано: ${r.copied}, не сопоставлено: ${r.unmatched.length}, спорных: ${r.ambiguous.length}`
      : `Скопировано: ${r.copied}, пропущено: ${r.skipped}, не сопоставлено: ${r.unmatched.length}, спорных: ${r.ambiguous.length}, ошибок: ${r.errors.length}`;

    return NextResponse.json({
      success: r.errors.length === 0,
      message: msg,
      ...r,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
