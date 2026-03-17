import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import {
  createFolder,
  getUploadUrl,
  uploadToHref,
} from '@/lib/yandex-disk';
import {
  PRODUCTS_ROOT,
  buildProductFolderPath,
  getFileTypeFolderNames,
} from '@/lib/product-paths';

const BRAND_BASE = 'disk:/Brand';

/** Санитизация имени файла (без path-символов). */
function sanitizeFileName(s: string): string {
  return (s || '')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'file';
}

/** Создать папку и все родительские сегменты. */
async function ensureFolderPath(base: string, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    const ok = await createFolder(`${base}/${acc}`);
    if (!ok) throw new Error(`Не удалось создать папку: ${acc}`);
  }
}

interface XlsxRow {
  Группа?: string;
  Названия?: string;
  Название?: string;
  Артикул?: string;
  Объём?: string;
}

/**
 * POST: Единоразовое создание на Яндекс.Диске структуры из xlsx.
 * Body: multipart/form-data, поле "file" — xlsx с колонками: Группа, Названия, Артикул, Объём.
 * Создаёт: Товары / {Группа} / {Название товара} / [Кросс коды, Фото, Видео, Этикетки, Документ]
 * и в Кросс коды — пустые .txt файлы по артикулам (имя = Артикул.txt).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Загрузите xlsx-файл (поле file)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'array' });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'В файле нет строк' }, { status: 400 });
    }

    // (group, productName) -> list of { articul, volume }
    const productMap = new Map<string, Array<{ articul: string; volume: string }>>();
    const key = (g: string, n: string) => `${g}\0${n}`;

    for (const row of rows) {
      const group = (row.Группа ?? '').toString().trim();
      const name = (row.Названия ?? row.Название ?? '').toString().trim();
      const articul = (row.Артикул ?? '').toString().trim();
      const volume = (row.Объём ?? '').toString().trim();
      if (!group || !name) continue;

      const k = key(group, name);
      if (!productMap.has(k)) productMap.set(k, []);
      if (articul) {
        productMap.get(k)!.push({ articul, volume });
      }
    }

    const created: string[] = [];
    const errors: string[] = [];

    // Корень Товары
    const productsRootPath = `${BRAND_BASE}/${PRODUCTS_ROOT}`;
    await ensureFolderPath(BRAND_BASE, PRODUCTS_ROOT);
    created.push(PRODUCTS_ROOT);

    const typeFolders = getFileTypeFolderNames();
    const crossCodesFolder = 'Кросс коды';

    for (const [pair, articuls] of productMap) {
      const [group, productName] = pair.split('\0');
      const productFolderPath = buildProductFolderPath(productName, group);
      const productFullPath = `${BRAND_BASE}/${productFolderPath}`;

      try {
        await ensureFolderPath(BRAND_BASE, productFolderPath);
        created.push(productFolderPath);

        for (const typeName of typeFolders) {
          const typePath = `${productFullPath}/${typeName}`;
          const ok = await createFolder(typePath);
          if (ok) created.push(`${productFolderPath}/${typeName}`);
        }

        const crossPath = `${productFullPath}/${crossCodesFolder}`;
        for (const { articul, volume } of articuls) {
          const safeName = sanitizeFileName(articul);
          const fileName = safeName ? `${safeName}.txt` : 'articul.txt';
          const filePath = `${crossPath}/${fileName}`;
          const content = volume ? `Объём: ${volume}\n` : '';
          const href = await getUploadUrl(filePath, true);
          if (href) {
            const status = await uploadToHref(href, Buffer.from(content, 'utf-8'));
            if (status === 201 || status === 200) created.push(filePath);
            else errors.push(`${filePath}: HTTP ${status}`);
          } else {
            errors.push(`Нет URL загрузки: ${filePath}`);
          }
        }
      } catch (e) {
        errors.push(`${productFolderPath}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      created: created.length,
      createdPaths: created.slice(0, 100),
      errors: errors.length ? errors : undefined,
      message:
        errors.length === 0
          ? `Создано: ${created.length} элементов`
          : `Создано: ${created.length}, ошибок: ${errors.length}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
