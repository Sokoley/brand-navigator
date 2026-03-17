import { NextResponse } from 'next/server';
import { getFiles, getUploadUrl, uploadToHref, setCustomProperties, createFolder, getResource } from '@/lib/yandex-disk';
import { buildProductFolderPath, getFileTypeFolder } from '@/lib/product-paths';
import { afterUpload } from '@/services/product-index.service';
import { isDbConfigured } from '@/lib/db';

const BRAND_BASE = 'disk:/Brand';

/** Create folder and all parent segments (e.g. Товары, Товары/Group, Товары/Group/Product). */
async function ensureFolderPath(base: string, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    await createFolder(`${base}/${acc}`);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const contentType = (formData.get('contentType') as string) || 'Макет';
  const useProductFolders = contentType === 'Товар';

  let productFolderPath: string | null = null;
  if (useProductFolders) {
    const explicitFolder = formData.get('productFolderPath') as string | null;
    if (explicitFolder?.trim()) {
      productFolderPath = explicitFolder.trim();
    } else {
      const productName = (formData.get('productName') as string) || (formData.get('prop_0_Название товара') as string) || '';
      const productGroup = (formData.get('productGroup') as string) || '';
      if (!productGroup.trim()) {
        return NextResponse.json({ error: 'Укажите группу товара для загрузки файлов', results: [] }, { status: 400 });
      }
      if (productName) {
        productFolderPath = buildProductFolderPath(productName, productGroup);
      }
    }
  }

  const results: Array<{
    type: string;
    name: string;
    original?: string;
    action?: string;
    properties?: Record<string, string>;
    properties_set?: boolean;
    message?: string;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const action = (formData.get(`actions_${i}`) as string) || 'rename';

    // Collect properties for this file
    const properties: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      const match = key.match(new RegExp(`^prop_${i}_(.+)$`));
      if (match && typeof value === 'string') {
        properties[match[1]] = value;
      }
    }
    properties['Тип контента'] = contentType;

    let diskPath: string;
    let existingNames: string[] = [];
    let fileName = file.name;

    if (useProductFolders && productFolderPath) {
      const fileType = properties['Тип файла'] || '';
      const fileTypeFolder = getFileTypeFolder(fileType);
      await ensureFolderPath(BRAND_BASE, productFolderPath);
      const typeFolderPath = `${BRAND_BASE}/${productFolderPath}/${fileTypeFolder}`;
      await createFolder(typeFolderPath);

      const existingItems = await getFiles(typeFolderPath);
      existingNames = existingItems.filter((it) => it.type === 'file').map((it) => it.name);
      if (action === 'rename' && existingNames.includes(fileName)) {
        const base = fileName.substring(0, fileName.lastIndexOf('.'));
        const ext = fileName.substring(fileName.lastIndexOf('.'));
        let counter = 1;
        while (existingNames.includes(fileName)) {
          fileName = `${base}_${counter}${ext}`;
          counter++;
        }
      }
      diskPath = `${typeFolderPath}/${fileName}`;
    } else {
      const flatItems = await getFiles(BRAND_BASE);
      existingNames = flatItems.filter((it) => it.type === 'file').map((it) => it.name);
      if (action === 'rename' && existingNames.includes(fileName)) {
        const base = fileName.substring(0, fileName.lastIndexOf('.'));
        const ext = fileName.substring(fileName.lastIndexOf('.'));
        let counter = 1;
        while (existingNames.includes(fileName)) {
          fileName = `${base}_${counter}${ext}`;
          counter++;
        }
      }
      diskPath = `${BRAND_BASE}/${fileName}`;
    }

    const uploadUrl = await getUploadUrl(diskPath);

    if (!uploadUrl) {
      results.push({ type: 'error', name: file.name, message: 'Failed to get upload URL' });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadStatus = await uploadToHref(uploadUrl, buffer);

    if (uploadStatus === 201 || uploadStatus === 202) {
      // For product folders we only set SKU; product name and file type are derived from path
      const propertiesToSet =
        useProductFolders && productFolderPath
          ? (properties['SKU'] ? { SKU: properties['SKU'] } : {})
          : properties;

      let propsSet = false;
      if (Object.keys(propertiesToSet).length > 0) {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
          propsSet = await setCustomProperties(diskPath, propertiesToSet);
          if (propsSet) break;
        }
      }

      if (useProductFolders && productFolderPath && isDbConfigured()) {
        const productName = (formData.get('productName') as string) || (formData.get('prop_0_Название товара') as string) || '';
        const productGroup = (formData.get('productGroup') as string) || '';
        const fileType = properties['Тип файла'] || 'Фото';
        try {
          const res = await getResource(diskPath);
          if (res) {
            await afterUpload(
              diskPath,
              productName,
              productGroup,
              fileType,
              { ...propertiesToSet, ...properties },
              {
                name: fileName,
                preview: res.preview || '',
                file: res.file || '',
                size: res.size || 0,
                created: res.created || '',
              }
            );
          }
        } catch {
          // index update best-effort
        }
      }
      results.push({
        type: propsSet || Object.keys(propertiesToSet).length === 0 ? 'success' : 'error',
        name: fileName,
        original: file.name,
        action,
        properties: propertiesToSet,
        properties_set: propsSet,
        message: !propsSet && Object.keys(propertiesToSet).length > 0 ? 'File uploaded but properties were not set' : undefined,
      });
      existingNames.push(fileName);
    } else {
      results.push({
        type: 'error',
        name: file.name,
        message: `Upload failed with status ${uploadStatus}`,
      });
    }
  }

  const successCount = results.filter(r => r.type === 'success').length;
  const errorCount = results.length - successCount;

  return NextResponse.json({
    message: `Upload complete. Success: ${successCount}, errors: ${errorCount}`,
    results,
  });
}
