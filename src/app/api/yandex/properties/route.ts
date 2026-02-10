import { NextResponse } from 'next/server';
import { setCustomProperties } from '@/lib/yandex-disk';

export async function PATCH(request: Request) {
  const body = await request.json();
  const { path, properties } = body;

  if (!path || !properties) {
    return NextResponse.json({ error: 'Missing path or properties' }, { status: 400 });
  }

  const success = await setCustomProperties(path, properties);
  if (success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Failed to set properties' }, { status: 500 });
}
