import { NextResponse } from 'next/server';
import { getFiles, getUploadUrl, uploadToHref, setCustomProperties } from '@/lib/yandex-disk';

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  // Get existing file names for conflict detection
  const existingItems = await getFiles();
  const existingNames = existingItems.filter(i => i.type === 'file').map(i => i.name);

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

    let fileName = file.name;
    if (action === 'rename' && existingNames.includes(fileName)) {
      const base = fileName.substring(0, fileName.lastIndexOf('.'));
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      let counter = 1;
      while (existingNames.includes(fileName)) {
        fileName = `${base}_${counter}${ext}`;
        counter++;
      }
    }

    // Collect properties for this file
    const properties: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      const match = key.match(new RegExp(`^prop_${i}_(.+)$`));
      if (match && typeof value === 'string') {
        properties[match[1]] = value;
      }
    }

    // Add content type
    const contentType = (formData.get('contentType') as string) || 'Макет';
    properties['Тип контента'] = contentType;

    const diskPath = `disk:/Brand/${fileName}`;
    const uploadUrl = await getUploadUrl(diskPath);

    if (!uploadUrl) {
      results.push({ type: 'error', name: file.name, message: 'Failed to get upload URL' });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadStatus = await uploadToHref(uploadUrl, buffer);

    if (uploadStatus === 201 || uploadStatus === 202) {
      let propsSet = false;
      if (Object.keys(properties).length > 0) {
        // Retry setting properties — Yandex may need time to commit the file
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
          propsSet = await setCustomProperties(diskPath, properties);
          if (propsSet) break;
        }
      }

      results.push({
        type: propsSet || Object.keys(properties).length === 0 ? 'success' : 'error',
        name: fileName,
        original: file.name,
        action,
        properties,
        properties_set: propsSet,
        message: !propsSet && Object.keys(properties).length > 0 ? 'File uploaded but properties were not set' : undefined,
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
