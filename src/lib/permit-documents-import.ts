/**
 * Импорт разрешительной документации (ДС / отказные письма) по Excel
 * «Разрешительная документация.xlsx»: все листы, сопоставление с папками товаров на Диске
 * по столбцу «Марочный ассортимент», файл — по имени из гиперссылки в столбце ДС/отказное письмо.
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
import { findExactProductFolder, splitMarochka } from '@/lib/passport-documents-import';
import { afterUpload } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const BRAND_BASE = 'disk:/Brand';
const DOC_EXT = /\.(pdf|docx?)$/i;

export interface PermitDocumentsImportResult {
  uploaded: number;
  skipped: number;
  dryRun: boolean;
  rowsWithoutLocalFile: Array<{ sheet: string; row: number; hint: string }>;
  unmatchedLines: Array<{ line: string; bestScore: number; row: number; sheet: string }>;
  ambiguous: Array<{ line: string; candidates: string[]; row: number; sheet: string }>;
  errors: string[];
  details: Array<{ localPath: string; diskPath: string; product: string; sheet: string }>;
}

function norm(s: string): string {
  return String(s)
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Excel/xlsx иногда отдаёт UTF-8 как последовательность байтов в Latin-1 (кракозябры вида Ð Ñ).
 * Восстанавливает читаемую строку для имён файлов и подписей.
 */
export function fixUtf8Mojibake(s: string): string {
  if (!s || s.length < 2) return s;
  if (!/[ÐÑÂ]/.test(s)) return s;
  try {
    const t = Buffer.from(s, 'latin1').toString('utf8');
    if (!t.includes('\uFFFD') && /[а-яёА-ЯЁ]{2,}/.test(t)) return t;
  } catch {
    /* ignore */
  }
  return s;
}

function normHeaderCell(s: unknown): string {
  return norm(String(s ?? '')).toLowerCase();
}

/** Столбец «Марочный ассортимент» (без привязки к полному заголовку из ПБ). */
function isMarochkaColumn(header: string): boolean {
  const h = normHeaderCell(header);
  return h.includes('марочный') && h.includes('ассортимент');
}

/** «Декларация о соответствии (ДС) / Отказное письмо» и варианты. */
function isDsLinkColumn(header: string): boolean {
  const h = normHeaderCell(header);
  if (h.includes('отказное') && h.includes('письм')) return true;
  if (h.includes('декларация') && (h.includes('соответств') || h.includes('(дс)'))) return true;
  if (h.includes('дс') && h.includes('отказ')) return true;
  return false;
}

/**
 * Имена файлов из гиперссылки и/или текста ячейки (в т.ч. несколько *.pdf через запятую).
 */
export function extractPdfFileNamesFromDsCell(url: string | undefined, cellText: string): string[] {
  const u0 = fixUtf8Mojibake((url ?? '').trim());
  const text0 = fixUtf8Mojibake(norm(cellText));

  if (u0) {
    try {
      const pathPart = u0.split(/[?#]/)[0];
      const segments = pathPart.split(/[/\\]/).filter(Boolean);
      const lastRaw = segments.pop() || '';
      const last = fixUtf8Mojibake(decodeURIComponent(lastRaw.replace(/\+/g, ' ')));
      if (last && /\.(pdf|docx?)$/i.test(last)) return [last.trim()];
    } catch {
      /* fall through */
    }
  }

  const names: string[] = [];
  for (const m of text0.matchAll(/[^,;\r\n]+?\.(pdf|docx?)\b/gi)) {
    const name = fixUtf8Mojibake(m[0].trim());
    if (name && /\.(pdf|docx?)$/i.test(name)) names.push(name);
  }
  const uniq = [...new Set(names)];
  if (uniq.length > 0) return uniq;

  const one = text0.match(/([^"'<>]+\.(pdf|docx?))/i);
  if (one) return [fixUtf8Mojibake(one[1].trim())];
  return [];
}

/** Совместимость: одно имя или пусто. */
export function fileNameFromHyperlink(url: string | undefined, cellText: string): string {
  return extractPdfFileNamesFromDsCell(url, cellText)[0] ?? '';
}

function targetFromHyperlinkFormula(f: string | undefined): string | undefined {
  if (!f || !/HYPERLINK/i.test(f)) return undefined;
  const m =
    f.match(/HYPERLINK\s*\(\s*"([^"]+)"/i) ||
    f.match(/HYPERLINK\s*\(\s*'([^']+)'/i) ||
    f.match(/HYPERLINK\s*\(\s*([^,;)]+)/i);
  const raw = m?.[1]?.trim();
  return raw?.replace(/^["']|["']$/g, '');
}

function getCellLinkAndText(sheet: XLSX.WorkSheet, row0: number, col0: number): { target?: string; text: string } {
  const addr = XLSX.utils.encode_cell({ r: row0, c: col0 });
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  if (!cell) return { text: '' };
  const text =
    typeof cell.w === 'string'
      ? cell.w
      : cell.v !== undefined && cell.v !== null
        ? String(cell.v)
        : '';
  const l = cell.l as { Target?: string } | undefined;
  let target = l?.Target?.trim();
  if (!target) {
    const fromF = targetFromHyperlinkFormula(typeof cell.f === 'string' ? cell.f : undefined);
    if (fromF) target = fromF;
  }
  return { target: target ? fixUtf8Mojibake(target) : undefined, text: fixUtf8Mojibake(text) };
}

function isSectionHeaderRowMar(mar: string): boolean {
  if (!mar) return false;
  if (/• • •|АЭРОЗОЛИ|МАСЛА|СМАЗКИ/i.test(mar)) return true;
  return false;
}

function walkDocumentFiles(dir: string, acc: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDocumentFiles(p, acc);
    else if (DOC_EXT.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Индекс basename (lower) → полный путь; при дубликатах — первый при обходе. */
function buildBasenameIndex(root: string): Map<string, string> {
  const files = walkDocumentFiles(root);
  const map = new Map<string, string>();
  for (const f of files) {
    const b = path.basename(f).toLowerCase();
    if (!map.has(b)) map.set(b, f);
  }
  return map;
}

function findLocalByBasename(index: Map<string, string>, baseName: string): string | null {
  const bn = path.basename(norm(baseName)).trim();
  if (!bn) return null;
  const variants = [
    bn.toLowerCase(),
    bn.normalize('NFC').toLowerCase(),
    bn.normalize('NFD').toLowerCase(),
  ];
  for (const key of variants) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  const decoded = norm(baseName);
  if (decoded !== bn) {
    const k2 = path.basename(decoded).toLowerCase();
    const hit = index.get(k2) ?? index.get(k2.normalize('NFC'));
    if (hit) return hit;
  }
  return null;
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

type HeaderInfo = { headerRow0: number; marCol: number; dsCol: number };

function detectHeader(sheet: XLSX.WorkSheet): HeaderInfo | null {
  if (!sheet['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxScanRow = Math.min(range.e.r, 30);
  for (let r = range.s.r; r <= maxScanRow; r++) {
    let marCol = -1;
    let dsCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const raw = cell?.w ?? (cell?.v != null ? String(cell.v) : '');
      const h = String(raw).trim();
      if (!h) continue;
      if (isMarochkaColumn(h)) marCol = c;
      if (isDsLinkColumn(h)) dsCol = c;
    }
    if (marCol >= 0 && dsCol >= 0) return { headerRow0: r, marCol, dsCol };
  }
  return null;
}

const COL_NPP = /^№\s*п\/?п|^n\s*п\/?п/i;

function isDataRowNpp(nppCell: unknown): boolean {
  if (nppCell === '' || nppCell === undefined || nppCell === null) return false;
  if (typeof nppCell === 'number' && Number.isFinite(nppCell)) return true;
  if (typeof nppCell === 'string') {
    const t = nppCell.trim();
    if (COL_NPP.test(t)) return false;
    if (/^\d+$/.test(t)) return true;
  }
  return false;
}

export async function importPermitDocumentsFromRegistry(options?: {
  registryXlsxPath: string;
  /** Папка с PDF/DOC: по умолчанию каталог, где лежит xlsx. Файлы ищутся рекурсивно по basename. */
  documentsRootDir?: string;
  dryRun?: boolean;
  minScore?: number;
  verbose?: boolean;
}): Promise<PermitDocumentsImportResult> {
  const dryRun = Boolean(options?.dryRun);
  const minScore = options?.minScore ?? 70;
  const registryPath = options?.registryXlsxPath;
  const verbose = Boolean(options?.verbose);
  const documentsRoot =
    options?.documentsRootDir ?? (registryPath ? path.dirname(registryPath) : undefined);

  const log = (msg: string) => {
    if (verbose) console.error(`[permit-docs ${new Date().toISOString()}] ${msg}`);
  };

  const result: PermitDocumentsImportResult = {
    uploaded: 0,
    skipped: 0,
    dryRun,
    rowsWithoutLocalFile: [],
    unmatchedLines: [],
    ambiguous: [],
    errors: [],
    details: [],
  };

  if (!registryPath || !fs.existsSync(registryPath)) {
    result.errors.push(`Файл реестра не найден: ${registryPath}`);
    return result;
  }
  if (!documentsRoot || !fs.existsSync(documentsRoot)) {
    result.errors.push(`Папка с документами не найдена: ${documentsRoot}`);
    return result;
  }

  const basenameIndex = buildBasenameIndex(documentsRoot);
  log(`Локальных документов по basename: ${basenameIndex.size} (корень ${documentsRoot})`);

  let catalog: ContentPhotoCatalogEntry[] = await listProductsFromDisk();
  if (isDbConfigured()) {
    catalog = await mergeSkusFromDb(catalog);
  }
  if (catalog.length === 0) {
    result.errors.push('Нет папок товаров в disk:/Brand/Товары');
    return result;
  }
  log(`Товаров в каталоге Диска: ${catalog.length}`);

  const wb = XLSX.readFile(registryPath, { cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const header = detectHeader(sheet);
    if (!header) {
      result.errors.push(`Лист «${sheetName}»: не найдены столбцы «Марочный ассортимент» и ДС/отказное письмо`);
      continue;
    }

    const { headerRow0, marCol, dsCol } = header;
    let nppCol = -1;
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow0, c });
      const cell = sheet[addr];
      const raw = cell?.w ?? (cell?.v != null ? String(cell.v) : '');
      const h = String(raw).trim();
      if (COL_NPP.test(h) || /^№$/i.test(h)) {
        nppCol = c;
        break;
      }
    }

    for (let r = headerRow0 + 1; r <= range.e.r; r++) {
      const marAddr = XLSX.utils.encode_cell({ r, c: marCol });
      const marCell = sheet[marAddr];
      const mar = fixUtf8Mojibake(String(marCell?.w ?? marCell?.v ?? '').trim());

      const { target: linkTarget, text: dsText } = getCellLinkAndText(sheet, r, dsCol);
      const pdfNames = extractPdfFileNamesFromDsCell(linkTarget, dsText);

      if (isSectionHeaderRowMar(mar)) continue;

      if (nppCol >= 0) {
        const nppAddr = XLSX.utils.encode_cell({ r, c: nppCol });
        const nppCell = sheet[nppAddr];
        const nppVal = nppCell?.v;
        if (!isDataRowNpp(nppVal)) continue;
      }

      if (!mar && pdfNames.length === 0) continue;
      if (!mar) {
        result.skipped++;
        continue;
      }

      const rowNum = r + 1;
      if (pdfNames.length === 0) {
        result.rowsWithoutLocalFile.push({
          sheet: sheetName,
          row: rowNum,
          hint: fixUtf8Mojibake(linkTarget || dsText || '(пусто)'),
        });
        result.skipped++;
        continue;
      }

      const lines = splitMarochka(mar);
      if (lines.length === 0) {
        result.errors.push(`Лист «${sheetName}», строка ${rowNum}: пустой марочный ассортимент`);
        result.skipped++;
        continue;
      }

      for (const fileHint of pdfNames) {
        const localPath = findLocalByBasename(basenameIndex, fileHint);
        if (!localPath) {
          result.rowsWithoutLocalFile.push({ sheet: sheetName, row: rowNum, hint: fileHint });
          result.skipped++;
          log(`Строка ${sheetName}!${rowNum}: нет файла «${fileHint}» в ${documentsRoot}`);
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
                sheet: sheetName,
                candidates: [top.product.productName, second.product.productName],
              });
            } else {
              result.unmatchedLines.push({
                line,
                row: rowNum,
                sheet: sheetName,
                bestScore: top?.score ?? 0,
              });
            }
            result.skipped += 1;
            continue;
          }

          const best = top!.product;
          const rel = buildProductFolderPath(best.productName, best.group);
          const docsDir = `${BRAND_BASE}/${rel}/Документы`;
          const baseName = path.basename(localPath);

          result.details.push({
            localPath,
            diskPath: `${docsDir}/${baseName}`,
            product: `${best.group} / ${best.productName}`,
            sheet: sheetName,
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

            const buf = fs.readFileSync(localPath);
            const href = await getUploadUrl(destPath, true);
            if (!href) {
              result.errors.push(`Нет upload URL: ${destPath}`);
              result.skipped++;
              continue;
            }
            const code = await uploadToHref(href, buf);
            if (code !== 201 && code !== 200) {
              result.errors.push(`Загрузка ${localPath}: HTTP ${code}`);
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
            result.errors.push(`${localPath}: ${(e as Error).message}`);
            result.skipped++;
          }
        }
      }
    }
  }

  return result;
}
