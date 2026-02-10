import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getFiles } from '@/lib/yandex-disk';
import { addProductName, addSKU } from '@/lib/properties-manager';
import { Product, YandexDiskItem } from '@/lib/types';

const CACHE_FILE = path.join(process.cwd(), 'products_cache.json');
const CACHE_TIME = 300_000; // 5 minutes in ms

function buildProductsFromFiles(items: YandexDiskItem[], contentFilter?: string): Record<string, Product> {
  const products: Record<string, Product> = {};

  for (const file of items) {
    if (file.type !== 'file') continue;

    const props = file.custom_properties || {};
    const productName = props['Название товара'] || '';
    const sku = props['SKU'] || '';
    const productGroup = props['Группа товаров'] || '';
    const fileType = props['Тип файла'] || '';
    const contentType = props['Тип контента'] || '';

    if (!productName) continue;

    // Filter by content type if specified
    if (contentFilter === 'Товар' && contentType !== 'Товар' && contentType !== '') continue;

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
        file_count: 0,
      };
    }

    if (sku && !products[productName].skus.includes(sku)) {
      products[productName].skus.push(sku);
    }

    products[productName].file_count = (products[productName].file_count || 0) + 1;

    const fileInfo = {
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

    if (fileType === 'Главное фото') {
      products[productName].main_photo = fileInfo;
    } else if (fileType === 'Фото') {
      products[productName].photos.push(fileInfo);
    } else if (fileType === 'Видео') {
      products[productName].videos.push(fileInfo);
    } else if (fileType === 'Документ') {
      products[productName].documents.push(fileInfo);
    } else if (fileType === 'PNG') {
      products[productName].png_files.push(fileInfo);
    } else {
      if (isImage) {
        if (!products[productName].main_photo && ext !== 'png') {
          products[productName].main_photo = fileInfo;
        } else {
          products[productName].photos.push(fileInfo);
        }
      } else if (isVideo) {
        products[productName].videos.push(fileInfo);
      } else if (isDocument) {
        products[productName].documents.push(fileInfo);
      }
    }
  }

  return products;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh') === '1';
  const contentFilter = searchParams.get('content') || 'Товар';

  // Check cache
  if (!refresh) {
    try {
      const stat = fs.statSync(CACHE_FILE);
      if (Date.now() - stat.mtimeMs < CACHE_TIME) {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        return NextResponse.json(cached);
      }
    } catch {
      // cache miss
    }
  }

  const items = await getFiles();
  const products = buildProductsFromFiles(items, contentFilter);

  // Save cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(products, null, 0));

  return NextResponse.json(products);
}
