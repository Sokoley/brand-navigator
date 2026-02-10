import { YandexDiskResponse, YandexDiskItem } from './types';

const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/resources';

function getToken(): string {
  const token = process.env.YANDEX_DISK_TOKEN;
  if (!token) throw new Error('YANDEX_DISK_TOKEN not set');
  return token;
}

function headers(contentType?: string): HeadersInit {
  const h: HeadersInit = {
    'Authorization': 'OAuth ' + getToken(),
    'Accept': 'application/json',
  };
  if (contentType) {
    h['Content-Type'] = contentType;
  }
  return h;
}

export async function yandexRequest(
  url: string,
  method: string = 'GET',
  body?: string | null,
  contentType?: string
): Promise<{ code: number; data: string }> {
  const opts: RequestInit = {
    method,
    headers: headers(contentType),
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = body;
  }

  const response = await fetch(url, opts);
  const data = await response.text();
  return { code: response.status, data };
}

export async function getFiles(path: string = 'disk:/Brand', limit: number = 1000, previewSize: string = 'XXXL'): Promise<YandexDiskItem[]> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}&limit=${limit}&preview_size=${previewSize}`;
  const result = await yandexRequest(url);

  if (result.code === 200) {
    const data: YandexDiskResponse = JSON.parse(result.data);
    return data._embedded?.items || [];
  }
  return [];
}

export async function deleteResource(path: string): Promise<{ code: number }> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}`;
  const result = await yandexRequest(url, 'DELETE');
  return { code: result.code };
}

export async function setCustomProperties(path: string, properties: Record<string, string>): Promise<boolean> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}`;
  const body = JSON.stringify({ custom_properties: properties });
  const result = await yandexRequest(url, 'PATCH', body, 'application/json');
  return result.code === 200;
}

export async function getUploadUrl(filePath: string, overwrite: boolean = true): Promise<string | null> {
  const url = `${YANDEX_API_BASE}/upload?path=${encodeURIComponent(filePath)}&overwrite=${overwrite}`;
  const result = await yandexRequest(url);

  if (result.code === 200) {
    const data = JSON.parse(result.data);
    return data.href || null;
  }
  return null;
}

export async function uploadToHref(href: string, fileBuffer: Buffer): Promise<number> {
  const response = await fetch(href, {
    method: 'PUT',
    body: fileBuffer as unknown as BodyInit,
  });
  return response.status;
}

export async function fetchPreview(previewUrl: string): Promise<{ data: Buffer; contentType: string } | null> {
  const token = getToken();
  const response = await fetch(previewUrl, {
    headers: {
      'Authorization': 'OAuth ' + token,
    },
  });

  if (response.ok) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { data: buffer, contentType };
  }
  return null;
}
