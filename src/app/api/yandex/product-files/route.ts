import { NextRequest, NextResponse } from 'next/server';
import { getFiles } from '@/lib/yandex-disk';
import {
  PRODUCTS_ROOT,
  buildProductFolderPath,
  getProductFolderName,
  getFileTypeFolderNames,
} from '@/lib/product-paths';
import { getProductFiles } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';
import { YandexDiskItem } from '@/lib/types';

const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_FULL = `${BRAND_BASE}/${PRODUCTS_ROOT}`;

async function findProductInGroups(
  groupDirs: YandexDiskItem[],
  targetFolderName: string,
): Promise<YandexDiskItem | null> {
  const groupLists = await Promise.all(groupDirs.map((g) => getFiles(g.path, 500)));
  for (const children of groupLists) {
    const productDir = children.find(
      (c) => c.type === 'dir' && getProductFolderName(c.name) === targetFolderName,
    );
    if (productDir) return productDir;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productName = searchParams.get('name')?.trim();
  const group = searchParams.get('group')?.trim() ?? undefined;

  if (!productName) {
    return NextResponse.json({ error: 'Укажите name (название товара)' }, { status: 400 });
  }

  if (isDbConfigured()) {
    const files = await getProductFiles(productName, group);
    return NextResponse.json(files);
  }

  let productBasePath: string;
  if (group) {
    const relativePath = buildProductFolderPath(productName, group);
    productBasePath = `${BRAND_BASE}/${relativePath}`;
  } else {
    const groupItems = await getFiles(PRODUCTS_FULL, 500);
    const groupDirs = groupItems.filter((i) => i.type === 'dir');
    const targetFolderName = getProductFolderName(productName);
    const productDir = await findProductInGroups(groupDirs, targetFolderName);
    if (!productDir) return NextResponse.json([]);
    productBasePath = productDir.path;
  }

  const typeFolders = getFileTypeFolderNames();
  const results = await Promise.all(
    typeFolders.map((typeName) => getFiles(`${productBasePath}/${typeName}`, 1000)),
  );
  const files: YandexDiskItem[] = [];
  for (const items of results) {
    for (const item of items) {
      if (item.type === 'file') files.push(item);
    }
  }
  return NextResponse.json(files);
}
