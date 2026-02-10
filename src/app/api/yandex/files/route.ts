import { NextResponse } from 'next/server';
import { getFiles } from '@/lib/yandex-disk';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const namesOnly = searchParams.get('names') === '1';
  const contentType = searchParams.get('content') || '';

  const items = await getFiles();

  if (namesOnly) {
    const names = items
      .filter(item => item.type === 'file')
      .map(item => item.name);
    return NextResponse.json(names);
  }

  let files = items.filter(item => item.type === 'file');

  if (contentType) {
    files = files.filter(f => {
      const ct = f.custom_properties?.['Тип контента'] || '';
      return ct === contentType || ct === '';
    });
  }

  return NextResponse.json(files);
}
