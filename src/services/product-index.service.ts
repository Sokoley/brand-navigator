import { getPool, ensureSchema, executeWithRetry } from '@/lib/db';
import { getAllFilesRecursive, getResource } from '@/lib/yandex-disk';
import { parseProductFilePath } from '@/lib/product-paths';
import { addProductName, addSKU } from '@/lib/properties-manager';
import { Product, YandexDiskItem, FileInfo } from '@/lib/types';

const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_ROOT = 'Товары';

interface ProductRow {
  id: number;
  name: string;
  product_group: string;
  main_photo_path: string | null;
  updated_at: Date;
}

interface ProductFileRow {
  id: number;
  product_id: number;
  path: string;
  file_type: string;
  sku: string | null;
  size: number | null;
  preview_url: string | null;
  file_url: string | null;
  created_at: Date;
}

function fileRowToFileInfo(row: ProductFileRow): FileInfo {
  return {
    name: row.path.split('/').pop() || '',
    preview: row.preview_url || '',
    file: row.file_url || '',
    size: row.size || 0,
    created: row.created_at ? new Date(row.created_at).toISOString() : '',
    sku: row.sku || undefined,
  };
}

function fileRowToYandexItem(row: ProductFileRow): YandexDiskItem {
  const name = row.path.split('/').pop() || '';
  return {
    name,
    type: 'file',
    path: row.path,
    preview: row.preview_url || undefined,
    file: row.file_url || undefined,
    size: row.size ?? undefined,
    created: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    custom_properties: row.sku ? { SKU: row.sku } : undefined,
  };
}

function mapFileTypeToCategory(fileType: string): keyof Pick<Product, 'photos' | 'videos' | 'documents' | 'png_files' | 'label_files'> {
  const t = (fileType || '').trim();
  if (t === 'Фото' || t === 'Главное фото') return 'photos';
  if (t === 'Видео') return 'videos';
  if (t === 'Документы' || t === 'Документ') return 'documents';
  if (t === 'Кросс коды' || t === 'PNG') return 'png_files';
  if (t === 'Этикетки') return 'label_files';
  return 'photos';
}

export async function getProducts(contentFilter: string = 'Товар'): Promise<Record<string, Product>> {
  if (!getPool()) return {};

  await ensureSchema();

  const [productRows] = await executeWithRetry(
    'SELECT id, name, product_group, main_photo_path, updated_at FROM products ORDER BY name, product_group'
  );
  const rows = (Array.isArray(productRows) ? productRows : []) as ProductRow[];

  const [fileRows] = await executeWithRetry(
    'SELECT id, product_id, path, file_type, sku, size, preview_url, file_url, created_at FROM product_files'
  );
  const files = (Array.isArray(fileRows) ? fileRows : []) as ProductFileRow[];
  const filesByProductId = new Map<number, ProductFileRow[]>();
  for (const f of files) {
    const list = filesByProductId.get(f.product_id) || [];
    list.push(f);
    filesByProductId.set(f.product_id, list);
  }

  const result: Record<string, Product> = {};
  const byName = new Map<string, ProductRow[]>();
  for (const p of rows) {
    const list = byName.get(p.name) || [];
    list.push(p);
    byName.set(p.name, list);
  }
  for (const [name, productRows] of byName) {
    const allFiles: ProductFileRow[] = [];
    let group = '';
    let mainPhotoPath = '';
    for (const p of productRows) {
      allFiles.push(...(filesByProductId.get(p.id) || []));
      if (!group) group = p.product_group;
      if (p.main_photo_path) mainPhotoPath = p.main_photo_path;
    }
    const skus = [...new Set(allFiles.map((f) => f.sku).filter(Boolean))] as string[];
    addProductName(name);
    skus.forEach(addSKU);

    let main_photo: FileInfo | '' = '';
    const photos: FileInfo[] = [];
    const videos: FileInfo[] = [];
    const documents: FileInfo[] = [];
    const png_files: FileInfo[] = [];
    const label_files: FileInfo[] = [];

    for (const f of allFiles) {
      const info = fileRowToFileInfo(f);
      const category = mapFileTypeToCategory(f.file_type);
      if (f.path === mainPhotoPath) {
        main_photo = info;
      } else if (category === 'photos' || category === 'png_files' || category === 'label_files') {
        if (category === 'photos') photos.push(info);
        else if (category === 'png_files') png_files.push(info);
        else label_files.push(info);
      } else if (category === 'videos') videos.push(info);
      else if (category === 'documents') documents.push(info);
    }
    const mainPhotoFile = allFiles.find((f) => f.path === mainPhotoPath);
    if (!main_photo && mainPhotoFile) main_photo = fileRowToFileInfo(mainPhotoFile);
    if (!main_photo && photos.length) main_photo = photos[0];
    if (typeof main_photo === 'object' && main_photo && !main_photo.preview) {
      const withPreview = png_files.find((p) => p.preview) || photos.find((p) => p.preview);
      if (withPreview) main_photo = withPreview;
    }

    result[name] = {
      name,
      group,
      skus,
      main_photo,
      photos,
      videos,
      documents,
      png_files,
      label_files,
      file_count: allFiles.length,
    };
  }
  return result;
}

export async function getProductFiles(productName: string, group?: string): Promise<YandexDiskItem[]> {
  if (!getPool()) return [];

  await ensureSchema();

  let productId: number;
  if (group !== undefined && group !== null && group !== '') {
    const [rows] = await executeWithRetry(
      'SELECT id FROM products WHERE name = ? AND product_group = ? LIMIT 1',
      [productName, group]
    );
    const arr = (Array.isArray(rows) ? rows : []) as { id: number }[];
    const r = arr[0];
    if (!r) return [];
    productId = r.id;
  } else {
    const [rows] = await executeWithRetry(
      'SELECT id FROM products WHERE name = ? LIMIT 1',
      [productName]
    );
    const arr = (Array.isArray(rows) ? rows : []) as { id: number }[];
    const r = arr[0];
    if (!r) return [];
    productId = r.id;
  }

  const [fileRows] = await executeWithRetry(
    'SELECT id, product_id, path, file_type, sku, size, preview_url, file_url, created_at FROM product_files WHERE product_id = ? ORDER BY created_at',
    [productId]
  );
  const list = (Array.isArray(fileRows) ? fileRows : []) as ProductFileRow[];
  return list.map(fileRowToYandexItem);
}

/** Возвращает группу товара по названию (первое совпадение в индексе). Для подстановки на странице товара при отсутствии group в URL. */
export async function getProductGroupByName(productName: string): Promise<string | null> {
  if (!getPool()) return null;
  await ensureSchema();
  const [rows] = await executeWithRetry(
    'SELECT product_group FROM products WHERE name = ? LIMIT 1',
    [productName]
  );
  const arr = (Array.isArray(rows) ? rows : []) as { product_group: string }[];
  const r = arr[0];
  return r?.product_group ?? null;
}

/** Список групп (папок в Товары на Диске). Из БД: уникальные product_group. */
export async function getProductGroupNames(): Promise<string[]> {
  if (!getPool()) return [];
  await ensureSchema();
  const [rows] = await executeWithRetry(
    'SELECT DISTINCT product_group FROM products WHERE product_group != "" ORDER BY product_group'
  );
  const arr = (Array.isArray(rows) ? rows : []) as { product_group: string }[];
  return arr.map((r) => r.product_group);
}

export async function afterUpload(
  diskPath: string,
  productName: string,
  productGroup: string,
  fileType: string,
  sku: string | null,
  fileInfo: { name: string; preview: string; file: string; size: number; created: string }
): Promise<void> {
  if (!getPool()) return;

  const [existing] = await executeWithRetry(
    'SELECT id FROM products WHERE name = ? AND product_group = ? LIMIT 1',
    [productName, productGroup]
  );
  const existingRows = (Array.isArray(existing) ? existing : []) as { id: number }[];
  let productId: number;
  if (existingRows.length > 0) {
    productId = existingRows[0].id;
  } else {
    const [ins] = await executeWithRetry('INSERT INTO products (name, product_group) VALUES (?, ?)', [
      productName,
      productGroup,
    ]);
    const header = ins as { insertId?: number };
    productId = header.insertId ?? 0;
    if (!productId) {
      const [r] = await executeWithRetry(
        'SELECT id FROM products WHERE name = ? AND product_group = ? LIMIT 1',
        [productName, productGroup]
      );
      const arr = (Array.isArray(r) ? r : []) as { id: number }[];
      productId = arr[0]?.id;
    }
  }
  if (!productId) return;

  await executeWithRetry(
    `INSERT INTO product_files (product_id, path, file_type, sku, size, preview_url, file_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_type = VALUES(file_type), sku = VALUES(sku), size = VALUES(size),
       preview_url = VALUES(preview_url), file_url = VALUES(file_url)`,
    [
      productId,
      diskPath,
      fileType || 'Фото',
      sku,
      fileInfo.size,
      fileInfo.preview || null,
      fileInfo.file || null,
    ]
  );
}

export async function afterDeleteFile(path: string): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry('DELETE FROM product_files WHERE path = ?', [path]);
}

export async function afterDeleteProduct(productName: string): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry('DELETE FROM products WHERE name = ?', [productName]);
}

export async function setMainPhoto(productName: string, filePath: string): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry(
    'UPDATE products p INNER JOIN product_files f ON f.product_id = p.id SET p.main_photo_path = f.path WHERE f.path = ? AND p.name = ?',
    [filePath, productName]
  );
}

function isProductFile(item: YandexDiskItem, contentFilter: string): boolean {
  if (item.type !== 'file') return false;
  const fromPath = parseProductFilePath(item.path);
  const contentType = item.custom_properties?.['Тип контента'] || '';
  if (contentFilter === 'Товар' && !fromPath.productName && contentType !== 'Товар' && contentType !== '') return false;
  const productName = fromPath.productName || item.custom_properties?.['Название товара'] || '';
  return Boolean(productName);
}

export async function fullReindex(contentFilter: string = 'Товар'): Promise<{ products: number; files: number }> {
  if (!getPool()) throw new Error('DATABASE_URL is not set');

  const t0 = Date.now();
  const log = (msg: string) => console.log(`[reindex] ${msg} (+${Date.now() - t0} ms от старта)`);

  log(`старт, фильтр контента: ${contentFilter}`);

  await executeWithRetry('SET FOREIGN_KEY_CHECKS = 0');
  await executeWithRetry('TRUNCATE TABLE product_files');
  await executeWithRetry('TRUNCATE TABLE products');
  await executeWithRetry('SET FOREIGN_KEY_CHECKS = 1');
  log('таблицы products / product_files очищены');

  const walkProgress = { dirsVisited: 0, lastLogAt: Date.now(), logIntervalMs: 8000 };
  log('запрос полного дерева файлов к API Яндекс.Диска…');
  const tYandex = Date.now();
  const items = await getAllFilesRecursive(BRAND_BASE, 'XXXL', walkProgress);
  log(`Яндекс.Диск: получено ${items.length} файлов за ${Date.now() - tYandex} ms`);

  const productFiles = items.filter((it) => isProductFile(it, contentFilter));
  log(`после фильтра товаров: ${productFiles.length} файлов (всего на диске было ${items.length})`);

  const productKeys = new Map<string, number>();
  const mainPhotoByProductId = new Map<number, string>();
  let filesInserted = 0;

  const tDb = Date.now();
  const totalPf = productFiles.length;
  for (let i = 0; i < productFiles.length; i++) {
    const file = productFiles[i];
    const props = file.custom_properties || {};
    const fromPath = parseProductFilePath(file.path);
    const productName = fromPath.productName || props['Название товара'] || '';
    const productGroup = (fromPath.productGroup || props['Группа товаров'] || '').trim();
    const fileType = fromPath.fileTypeFolder || props['Тип файла'] || 'Фото';
    const sku = props['SKU'] || null;

    if (!productName) continue;

    const key = `${productName}\0${productGroup}`;
    let productId = productKeys.get(key);
    if (productId == null) {
      const [ins] = await executeWithRetry('INSERT INTO products (name, product_group) VALUES (?, ?)', [
        productName,
        productGroup,
      ]);
      productId = (ins as { insertId: number }).insertId;
      productKeys.set(key, productId);
    }

    await executeWithRetry(
      `INSERT INTO product_files (product_id, path, file_type, sku, size, preview_url, file_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_type = VALUES(file_type), sku = VALUES(sku), size = VALUES(size),
         preview_url = VALUES(preview_url), file_url = VALUES(file_url)`,
      [
        productId,
        file.path,
        fileType,
        sku,
        file.size ?? null,
        file.preview || null,
        file.file || null,
      ]
    );
    filesInserted++;
    if (props['Главное фото'] === 'true') {
      mainPhotoByProductId.set(productId, file.path);
    }

    const n = i + 1;
    if (n === 1 || n === totalPf || (n % 500 === 0 && n < totalPf)) {
      log(`БД: записано файлов ${n}/${totalPf}…`);
    }
  }

  log(`БД: вставка файлов завершена за ${Date.now() - tDb} ms`);

  log('проставление главных фото…');
  for (const [productId, mainPath] of mainPhotoByProductId) {
    await executeWithRetry('UPDATE products SET main_photo_path = ? WHERE id = ?', [mainPath, productId]);
  }
  for (const [, productId] of productKeys) {
    if (mainPhotoByProductId.has(productId)) continue;
    const [rows] = await executeWithRetry(
      'SELECT path FROM product_files WHERE product_id = ? ORDER BY id LIMIT 1',
      [productId]
    );
    const paths = (Array.isArray(rows) ? rows : []) as { path: string }[];
    const fallbackPath = paths[0]?.path;
    if (fallbackPath) {
      await executeWithRetry('UPDATE products SET main_photo_path = ? WHERE id = ?', [fallbackPath, productId]);
    }
  }

  log(
    `готово: ${productKeys.size} товаров, ${filesInserted} файлов в БД, просмотрено каталогов на Диске: ${walkProgress.dirsVisited}, всего ${Date.now() - t0} ms`,
  );

  return { products: productKeys.size, files: filesInserted };
}

function buildProductsFromFiles(items: YandexDiskItem[], contentFilter: string): Record<string, Product> {
  const products: Record<string, Product> = {};
  for (const file of items) {
    if (file.type !== 'file') continue;
    const props = file.custom_properties || {};
    const fromPath = parseProductFilePath(file.path);
    const productName = fromPath.productName || props['Название товара'] || '';
    const sku = props['SKU'] || '';
    const productGroup = (fromPath.productGroup || props['Группа товаров'] || '').trim();
    const fileType = fromPath.fileTypeFolder || props['Тип файла'] || '';
    const contentType = props['Тип контента'] || '';
    if (!productName) continue;
    if (contentFilter === 'Товар' && !fromPath.productName && contentType !== 'Товар' && contentType !== '') continue;

    addProductName(productName);
    if (sku) addSKU(sku);

    if (!products[productName]) {
      products[productName] = {
        name: productName,
        group: productGroup,
        skus: [],
        main_photo: '',
        photos: [],
        videos: [],
        documents: [],
        png_files: [],
        label_files: [],
        file_count: 0,
      };
    }
    if (sku && !products[productName].skus.includes(sku)) products[productName].skus!.push(sku);
    products[productName].file_count = (products[productName].file_count || 0) + 1;

    const fileInfo: FileInfo = {
      name: file.name,
      preview: file.preview || '',
      file: file.file || '',
      size: file.size || 0,
      created: file.created || '',
    };
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isVideo = ['mp4', 'avi', 'mov', 'mkv', 'wmv'].includes(ext);
    const isDocument = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);

    if (props['Главное фото'] === 'true') products[productName].main_photo = fileInfo;
    if (fileType === 'Главное фото') products[productName].main_photo = fileInfo;
    else if (fileType === 'Фото') products[productName].photos!.push(fileInfo);
    else if (fileType === 'Видео') products[productName].videos!.push(fileInfo);
    else if (fileType === 'Документ' || fileType === 'Документы') products[productName].documents!.push(fileInfo);
    else if (fileType === 'PNG' || fileType === 'Кросс коды') products[productName].png_files!.push(fileInfo);
    else if (fileType === 'Этикетки') products[productName].label_files!.push(fileInfo);
    else {
      if (isImage) {
        if (!products[productName].main_photo && ext !== 'png') products[productName].main_photo = fileInfo;
        else products[productName].photos!.push(fileInfo);
      } else if (isVideo) products[productName].videos!.push(fileInfo);
      else if (isDocument) products[productName].documents!.push(fileInfo);
    }
  }
  for (const p of Object.values(products)) {
    const m = p.main_photo;
    if (!m || typeof m === 'string') continue;
    if (m.preview) continue;
    const png = p.png_files?.find((f) => f.preview);
    const photo = p.photos?.find((f) => f.preview);
    if (png) p.main_photo = png;
    else if (photo) p.main_photo = photo;
  }
  return products;
}

export async function getProductsFromYandex(contentFilter: string = 'Товар'): Promise<Record<string, Product>> {
  const items = await getAllFilesRecursive(BRAND_BASE);
  return buildProductsFromFiles(items, contentFilter);
}
