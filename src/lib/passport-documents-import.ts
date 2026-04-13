/**
 * Импорт паспортов безопасности (PDF) из локальной папки в
 * disk:/Brand/Товары/{группа}/{товар}/Документы по реестру Реестр ПБ.xlsx.
 *
 * - Товар на Диске ↔ значение из «Марочный ассортимент…» (точное/вложенное совпадение или нечёткий балл).
 * - Файл: один PDF на строку реестра — имя файла должно соответствовать «Номер ТУ» (если столбец есть),
 *   иначе извлекаем номер ТУ из «Номер НТД» и ищем PDF по вхождению в basename.
 */

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import {
  createFolder,
  getFiles,
  getResource,
  getUploadUrl,
  uploadToHref,
} from '@/lib/yandex-disk';
import { buildProductFolderPath } from '@/lib/product-paths';
import {
  listProductsFromDisk,
  mergeSkusFromDb,
  rankAllProductsByScore,
  type ContentPhotoCatalogEntry,
} from '@/lib/content-photos-import';
import { afterUpload } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const BRAND_BASE = 'disk:/Brand';

export interface PassportDocumentsImportResult {
  uploaded: number;
  skipped: number;
  dryRun: boolean;
  /** Строки реестра: не найден PDF по «Номер ТУ» / имени */
  registryRowsWithoutPdf: Array<{ row: number; tuHint: string }>;
  /** Значение «марочный ассортимент» без подходящего товара на Диске */
  unmatchedLines: Array<{ line: string; bestScore: number; row: number }>;
  ambiguous: Array<{ line: string; candidates: string[]; row: number }>;
  errors: string[];
  details: Array<{ localPath: string; diskPath: string; product: string }>;
}

function norm(s: string): string {
  return String(s)
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Короткий ключ ТУ из поля «Номер НТД»: первые два сегмента номера (как в именах PDF). */
export function shortTU(ntdRaw: string): string {
  let s = norm(ntdRaw);
  const tuIdx = s.search(/ТУ|TУ/i);
  if (tuIdx >= 0) s = s.slice(tuIdx).replace(/^ТУ\s*|^TУ\s*/i, '').trim();
  else s = s.replace(/^ty\s+/i, '').trim();
  const m = s.match(/^([0-9.]+-[0-9.]+)/);
  return m ? m[1] : '';
}

function tuMatchVariants(short: string): string[] {
  const v = new Set<string>([short]);
  if (short.includes('20.59.41')) v.add(short.replace(/20\.59\.41/g, '20.59-41'));
  if (short.includes('20.59-41')) v.add(short.replace(/20\.59-41/g, '20.59.41'));
  return [...v];
}

/** Все подстроки для поиска в имени PDF по полю «Номер ТУ» или «Номер НТД». */
function tuSearchKeys(tuColumn: string, ntdColumn: string): string[] {
  const primary = norm(String(tuColumn || '').trim());
  const ntd = norm(String(ntdColumn || '').trim());
  const keys = new Set<string>();
  if (primary) {
    keys.add(primary);
    keys.add(primary.replace(/^ТУ\s+/i, '').trim());
  }
  const fromNtd = shortTU(ntd);
  if (fromNtd) {
    keys.add(fromNtd);
    for (const v of tuMatchVariants(fromNtd)) keys.add(v);
  }
  return [...keys].filter((k) => k.length >= 3);
}

/**
 * Один PDF на строку: basename должен содержать ключ из «Номер ТУ» (или ТУ из НТД).
 * Несколько совпадений — предпочтение «Титул и текст», иначе более короткое имя (обычно «Титул»).
 */
export function findPdfForTuKeys(keys: string[], pdfs: string[]): string | null {
  if (keys.length === 0) return null;
  const lowerKeys = keys.map((k) => norm(k).toLowerCase());
  const matches = pdfs.filter((p) => {
    const bn = norm(path.basename(p)).toLowerCase();
    return lowerKeys.some((k) => k && bn.includes(k));
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const full = matches.filter((m) => /титул\s+и\s+текст/i.test(path.basename(m)));
  if (full.length === 1) return full[0];
  if (full.length > 1) {
    return full.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ru'))[0];
  }
  return matches.sort((a, b) => path.basename(a).length - path.basename(b).length)[0];
}

function normalizeNameForCompare(s: string): string {
  return norm(s)
    .replace(/[«»"]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Только точное совпадение (после нормализации) с именем папки товара на Диске. */
export function findExactProductFolder(line: string, catalog: ContentPhotoCatalogEntry[]): ContentPhotoCatalogEntry | null {
  const nl = normalizeNameForCompare(line);
  if (nl.length < 2) return null;
  for (const e of catalog) {
    if (normalizeNameForCompare(e.productName) === nl) return e;
  }
  return null;
}

/** Значение столбца «Номер ТУ», если он есть в файле. */
function getColumnНомерТУ(row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  for (const k of keys) {
    const kn = k.replace(/\s+/g, ' ').trim();
    if (/^номер\s+ту$/i.test(kn) && !/нтд/i.test(kn)) {
      return String(row[k] ?? '').trim();
    }
  }
  return '';
}

function walkPdfFiles(dir: string, acc: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPdfFiles(p, acc);
    else if (/\.pdf$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Разбор «Марочный ассортимент» на отдельные названия (как на Диске). */
export function splitMarochka(mar: string): string[] {
  const raw = String(mar).replace(/\r/g, '\n');
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 2);
  return [...new Set(parts)];
}

function isSectionHeaderRow(npp: unknown, mar: string): boolean {
  if (typeof npp === 'string' && /•|АЭРОЗОЛИ|МАСЛА|СМАЗКИ|ОСТАЛЬНОЕ/i.test(npp)) return true;
  if (mar && /• • •/.test(String(mar))) return true;
  return false;
}

function isDataRow(npp: unknown): boolean {
  if (npp === '' || npp === undefined || npp === null) return false;
  if (typeof npp === 'number' && Number.isFinite(npp)) return true;
  if (typeof npp === 'string' && /^\d+$/.test(npp.trim())) return true;
  return false;
}

async function ensureFolderPathDisk(base: string, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    await createFolder(`${base}/${acc}`);
  }
}

async function uniqueDestName(docsDir: string, baseName: string): Promise<string> {
  const existing = await getFiles(docsDir);
  const names = new Set(existing.filter((i) => i.type === 'file').map((i) => i.name));
  if (!names.has(baseName)) return baseName;
  const dot = baseName.lastIndexOf('.');
  const base = dot === -1 ? baseName : baseName.slice(0, dot);
  const ext = dot === -1 ? '' : baseName.slice(dot);
  let n = 1;
  let candidate = `${base}_${n}${ext}`;
  while (names.has(candidate)) {
    n++;
    candidate = `${base}_${n}${ext}`;
  }
  return candidate;
}

export async function importPassportDocumentsFromRegistry(options?: {
  registryXlsxPath: string;
  pdfRootDir: string;
  dryRun?: boolean;
  minScore?: number;
  verbose?: boolean;
}): Promise<PassportDocumentsImportResult> {
  const dryRun = Boolean(options?.dryRun);
  /** По умолчанию 70: для названий из реестра часто совпадение ровно на этом пороге. */
  const minScore = options?.minScore ?? 70;
  const registryPath = options?.registryXlsxPath;
  const pdfRoot = options?.pdfRootDir;
  const verbose = Boolean(options?.verbose);

  const log = (msg: string) => {
    if (verbose) console.error(`[passport-docs ${new Date().toISOString()}] ${msg}`);
  };

  const result: PassportDocumentsImportResult = {
    uploaded: 0,
    skipped: 0,
    dryRun,
    registryRowsWithoutPdf: [],
    unmatchedLines: [],
    ambiguous: [],
    errors: [],
    details: [],
  };

  if (!registryPath || !fs.existsSync(registryPath)) {
    result.errors.push(`Файл реестра не найден: ${registryPath}`);
    return result;
  }
  if (!pdfRoot || !fs.existsSync(pdfRoot)) {
    result.errors.push(`Папка с PDF не найдена: ${pdfRoot}`);
    return result;
  }

  const pdfs = walkPdfFiles(pdfRoot);
  log(`Найдено PDF: ${pdfs.length} в ${pdfRoot}`);

  let catalog: ContentPhotoCatalogEntry[] = await listProductsFromDisk();
  if (isDbConfigured()) {
    catalog = await mergeSkusFromDb(catalog);
  }
  if (catalog.length === 0) {
    result.errors.push('Нет папок товаров в disk:/Brand/Товары');
    return result;
  }
  log(`Товаров в каталоге Диска: ${catalog.length}`);

  const wb = XLSX.readFile(registryPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const colNpp = '№ п/п';
  const colMar = 'Марочный ассортимент в паспорте безопасности';
  const colNtd = 'Номер НТД';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const npp = row[colNpp];
    const mar = String(row[colMar] ?? '');
    const ntd = String(row[colNtd] ?? '');
    const tuCol = getColumnНомерТУ(row);

    if (isSectionHeaderRow(npp, mar)) continue;
    if (!isDataRow(npp)) continue;

    const rowNum = i + 2;
    const tuKeys = tuSearchKeys(tuCol, ntd);
    const localPdf = findPdfForTuKeys(tuKeys, pdfs);
    if (!localPdf) {
      result.registryRowsWithoutPdf.push({
        row: rowNum,
        tuHint: tuCol || tuKeys.join(' · ') || ntd.slice(0, 80),
      });
      log(`Строка ${rowNum}: нет PDF по ключам ТУ: ${tuKeys.join(', ')}`);
      continue;
    }

    const lines = splitMarochka(mar);
    if (lines.length === 0) {
      result.errors.push(`Строка ${rowNum}: пустой марочный ассортимент`);
      result.skipped++;
      continue;
    }

    for (const line of lines) {
      const exact = findExactProductFolder(line, catalog);
      let top: { product: ContentPhotoCatalogEntry; score: number } | undefined;
      let second: { product: ContentPhotoCatalogEntry; score: number } | undefined;

      if (exact) {
        top = { product: exact, score: 100 };
        second = undefined;
      } else {
        const ranked = rankAllProductsByScore(line, catalog);
        top = ranked[0];
        second = ranked[1];
      }

      const clear =
        Boolean(top) &&
        top!.score >= minScore &&
        !(second && top!.score - second.score < 5 && second.score >= minScore);

      if (!clear) {
        if (second && top && top.score - second.score < 5 && second.score >= minScore) {
          result.ambiguous.push({
            line,
            row: rowNum,
            candidates: [top.product.productName, second.product.productName],
          });
        } else {
          result.unmatchedLines.push({
            line,
            row: rowNum,
            bestScore: top?.score ?? 0,
          });
        }
        result.skipped += 1;
        continue;
      }

      const best = top!.product;
      const rel = buildProductFolderPath(best.productName, best.group);
      const docsDir = `${BRAND_BASE}/${rel}/Документы`;
      const baseName = path.basename(localPdf);

      result.details.push({
        localPath: localPdf,
        diskPath: `${docsDir}/${baseName}`,
        product: `${best.group} / ${best.productName}`,
      });

      if (dryRun) {
        result.uploaded++;
        continue;
      }

      try {
        await ensureFolderPathDisk(BRAND_BASE, `${rel}/Документы`);
        const destName = await uniqueDestName(docsDir, baseName);
        const destPath = `${docsDir}/${destName}`;
        result.details[result.details.length - 1].diskPath = destPath;

        const buf = fs.readFileSync(localPdf);
        const href = await getUploadUrl(destPath, true);
        if (!href) {
          result.errors.push(`Нет upload URL: ${destPath}`);
          result.skipped++;
          continue;
        }
        const code = await uploadToHref(href, buf);
        if (code !== 201 && code !== 200) {
          result.errors.push(`Загрузка ${localPdf}: HTTP ${code}`);
          result.skipped++;
          continue;
        }

        result.uploaded++;
        log(`OK ${destPath}`);

        if (isDbConfigured()) {
          const meta = await getResource(destPath);
          if (meta?.file) {
            await afterUpload(
              destPath,
              best.productName,
              best.group,
              'Документы',
              null,
              {
                name: destName,
                preview: meta.preview || '',
                file: meta.file || '',
                size: meta.size ?? buf.length,
                created: meta.created || '',
              },
            );
          }
        }
      } catch (e) {
        result.errors.push(`${localPdf}: ${(e as Error).message}`);
        result.skipped++;
      }
    }
  }

  return result;
}
