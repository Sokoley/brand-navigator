/**
 * Helpers for product folder structure on disk:
 * Brand/Товары/{Группа товаров}/{Название товара}/{тип файла}/{fileName}
 * Example: Brand/Товары/Масла Моторные/Моторное масло 5w-40/Фото/photo.jpg
 */

export const PRODUCTS_ROOT = 'Товары';
export const NO_GROUP = 'Без группы';

const FILE_TYPE_FOLDERS = ['Кросс коды', 'Фото', 'Видео', 'Этикетки', 'Документы'] as const;
export type FileTypeFolderName = (typeof FILE_TYPE_FOLDERS)[number];

/** Порядок вкладок в карточке товара (как папки на Яндексе: Фото, Видео, Документы, Кросс коды, Этикетки). */
export const PRODUCT_TAB_FOLDERS = ['Фото', 'Видео', 'Документы', 'Кросс коды', 'Этикетки'] as const;

const FILE_TYPE_TO_FOLDER: Record<string, FileTypeFolderName> = {
  'Фото': 'Фото',
  'Главное фото': 'Фото',
  'Видео': 'Видео',
  'Документ': 'Документы',
  'Документы': 'Документы',
  'Кросс коды': 'Кросс коды',
  'PNG': 'Кросс коды',
  'Этикетки': 'Этикетки',
};

/** Sanitize string for use in folder name (no path separators or invalid chars). */
function sanitizeFolderPart(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Без названия';
}

/** Sanitized folder name for a product group (for Товары/Group). */
export function getGroupFolderName(group: string): string {
  return sanitizeFolderPart(group || '') || NO_GROUP;
}

/** Sanitized folder name for a product (for path matching). */
export function getProductFolderName(productName: string): string {
  return sanitizeFolderPart(productName || '') || 'Без названия';
}

/**
 * Build product folder path relative to Brand: "Товары/{Группа}/{Товар}".
 * Used for disk path: Brand/{this}/{fileTypeFolder}/{fileName}
 */
export function buildProductFolderPath(productName: string, productGroup?: string): string {
  const group = sanitizeFolderPart(productGroup || '') || NO_GROUP;
  const product = sanitizeFolderPart(productName) || 'Без названия';
  return `${PRODUCTS_ROOT}/${group}/${product}`;
}

/**
 * @deprecated Use buildProductFolderPath(productName, productGroup) for new structure.
 * Build product folder name only (legacy single-level).
 */
export function buildProductFolderName(productName: string, _skus?: string[]): string {
  return sanitizeFolderPart(productName) || 'Без названия';
}

/**
 * Map "Тип файла" property to folder name for disk.
 */
export function getFileTypeFolder(fileType: string): FileTypeFolderName {
  const normalized = (fileType || '').trim();
  return FILE_TYPE_TO_FOLDER[normalized] || 'Фото';
}

export function getFileTypeFolderNames(): readonly string[] {
  return FILE_TYPE_FOLDERS;
}

/**
 * Определяет вкладку карточки товара по пути файла и опционально по свойству «Тип файла».
 * Используется для фильтрации: файл показывается во вкладке с тем же именем, что и папка на Диске.
 */
export function getFileTabFolder(diskPath: string, typeFromProps?: string): FileTypeFolderName {
  const { fileTypeFolder } = parseProductFilePath(diskPath);
  const type = fileTypeFolder || typeFromProps || '';
  return getFileTypeFolder(type);
}

/**
 * Parse file path in product folder structure.
 * New: Brand/Товары/Group/Product/TypeFolder/file.ext (7+ segments)
 * Legacy: Brand/ProductName/TypeFolder/file.ext (5 segments)
 */
export function parseProductFilePath(diskPath: string): { productName: string | null; fileTypeFolder: string | null } {
  if (!diskPath || !diskPath.startsWith('disk:/Brand/')) return { productName: null, fileTypeFolder: null };
  const segments = diskPath.split('/').filter(Boolean);
  const toFileType = (name: string): string | null => {
    if (FILE_TYPE_FOLDERS.includes(name as FileTypeFolderName)) return name;
    if (name === 'Документ') return 'Документы'; // legacy
    if (name === 'PNG') return 'Кросс коды'; // legacy папка
    return null;
  };
  // New: disk:, Brand, Товары, group, product, type, file => 7 segments
  if (segments.length >= 7 && segments[2] === PRODUCTS_ROOT) {
    const productName = decodeURIComponent(segments[4]);
    const fileTypeFolder = toFileType(segments[5]);
    return { productName, fileTypeFolder };
  }
  // Legacy: disk:, Brand, productName, fileTypeFolder, fileName => 5 segments
  if (segments.length >= 5) {
    const productName = decodeURIComponent(segments[2]);
    const fileTypeFolder = toFileType(segments[3]);
    return { productName, fileTypeFolder };
  }
  return { productName: null, fileTypeFolder: null };
}
