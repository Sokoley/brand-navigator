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

export async function getFiles(
  path: string = 'disk:/Brand',
  limit: number = 1000,
  previewSize: string = 'XXXL',
  offset: number = 0,
): Promise<YandexDiskItem[]> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}&limit=${limit}&offset=${offset}&preview_size=${previewSize}`;
  const result = await yandexRequest(url);

  if (result.code === 200 && result.data) {
    try {
      const data: YandexDiskResponse = JSON.parse(result.data);
      return data._embedded?.items || [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Все файлы непосредственно в папке (с пагинацией, если больше лимита листинга). */
export async function listAllFilesInFolder(folderPath: string, previewSize: string = 'XXXL'): Promise<YandexDiskItem[]> {
  const out: YandexDiskItem[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const batch = await getFiles(folderPath, limit, previewSize, offset);
    for (const it of batch) {
      if (it.type === 'file') out.push(it);
    }
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

/** Get single resource (file or dir) by path. Returns item with file, preview URLs. */
export async function getResource(path: string, previewSize: string = 'XXXL'): Promise<YandexDiskItem | null> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}&preview_size=${previewSize}`;
  const result = await yandexRequest(url);
  if (result.code !== 200 || !result.data) return null;
  try {
    return JSON.parse(result.data) as YandexDiskItem;
  } catch {
    return null;
  }
}

/** Create a folder. Parent folders are not created automatically. Returns true if created or already exists. */
export async function createFolder(folderPath: string): Promise<boolean> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(folderPath)}`;
  const result = await yandexRequest(url, 'PUT');
  // 201 = created, 409 = already exists
  return result.code === 201 || result.code === 409;
}

/** Для getAllFilesRecursive: при переиндексации пишет в консоль не чаще чем раз в logIntervalMs. */
export type YandexWalkProgress = {
  dirsVisited: number;
  lastLogAt: number;
  logIntervalMs?: number;
};

/** Опции полного обхода дерева (например не заходить в каталог товаров). */
export type GetAllFilesRecursiveOptions = {
  /** Не рекурсировать в подкаталоги с этими именами (`dir.name`), на любом уровне. */
  skipDirNames?: readonly string[];
};

/** Recursively list all files under basePath (e.g. disk:/Brand). Returns flat list of file items. Parallel per level. */
export async function getAllFilesRecursive(
  basePath: string = 'disk:/Brand',
  previewSize: string = 'XXXL',
  progress?: YandexWalkProgress,
  options?: GetAllFilesRecursiveOptions,
): Promise<YandexDiskItem[]> {
  if (progress) {
    progress.dirsVisited++;
    const interval = progress.logIntervalMs ?? 8000;
    const now = Date.now();
    if (now - progress.lastLogAt >= interval) {
      progress.lastLogAt = now;
      const short = basePath.length > 100 ? `${basePath.slice(0, 100)}…` : basePath;
      console.log(`[reindex/yandex] обход Диска: просмотрено каталогов ${progress.dirsVisited}, текущий: ${short}`);
    }
  }

  const items = await getFiles(basePath, 1000, previewSize);
  const files: YandexDiskItem[] = [];
  const dirs: YandexDiskItem[] = [];

  for (const item of items) {
    if (item.type === 'file') {
      files.push(item);
    } else if (item.type === 'dir') {
      dirs.push(item);
    }
  }

  const skipSet =
    options?.skipDirNames && options.skipDirNames.length > 0
      ? new Set(options.skipDirNames)
      : null;
  const dirsToWalk = skipSet ? dirs.filter((d) => !skipSet.has(d.name)) : dirs;

  if (dirsToWalk.length > 0) {
    const nestedArrays = await Promise.all(
      dirsToWalk.map((dir) => getAllFilesRecursive(dir.path, previewSize, progress, options)),
    );
    for (const arr of nestedArrays) {
      files.push(...arr);
    }
  }

  return files;
}

/**
 * Обходит дерево каталогов, но собирает только файлы из папок с заданным именем
 * (например «Кросс коды»). Не загружает списки файлов из остальных веток — сильно меньше запросов к API и времени.
 * @param folderName — точное имя папки на Диске
 */
export async function getFilesOnlyUnderNamedFolders(
  basePath: string,
  folderName: string,
  previewSize: string = 'XXXL',
): Promise<YandexDiskItem[]> {
  const items = await getFiles(basePath, 1000, previewSize);
  const dirs = items.filter((i) => i.type === 'dir');
  const files: YandexDiskItem[] = [];

  await Promise.all(
    dirs.map(async (dir) => {
      if (dir.name === folderName) {
        const inner = await getFiles(dir.path, 1000, previewSize);
        for (const f of inner) {
          if (f.type === 'file') files.push(f);
        }
        return;
      }
      const nested = await getFilesOnlyUnderNamedFolders(dir.path, folderName, previewSize);
      files.push(...nested);
    }),
  );

  return files;
}

/**
 * Собирает полные пути ко всем папкам с заданным именем под `basePath`
 * (без захода внутрь этих папок). Дешевле, чем собирать все файлы из «Кросс коды».
 */
export async function listFolderPathsByNameRecursive(
  basePath: string,
  folderName: string,
  previewSize: string = 'XXXL',
): Promise<string[]> {
  const items = await getFiles(basePath, 1000, previewSize);
  const dirs = items.filter((i) => i.type === 'dir');
  const paths: string[] = [];

  await Promise.all(
    dirs.map(async (dir) => {
      if (dir.name === folderName) {
        paths.push(dir.path);
        return;
      }
      const nested = await listFolderPathsByNameRecursive(dir.path, folderName, previewSize);
      paths.push(...nested);
    }),
  );

  return paths;
}

export async function deleteResource(path: string): Promise<{ code: number }> {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(path)}`;
  const result = await yandexRequest(url, 'DELETE');
  return { code: result.code };
}

/**
 * Копирование файла на Диске (серверное). Для непустых папок возможен 202 + опрос операции.
 * @see https://yandex.ru/dev/disk/api/reference/copy.html
 */
export async function copyFileOnDisk(
  fromPath: string,
  toPath: string,
  overwrite = true,
): Promise<boolean> {
  const url = `${YANDEX_API_BASE}/copy?from=${encodeURIComponent(fromPath)}&path=${encodeURIComponent(toPath)}&overwrite=${overwrite}`;
  const result = await yandexRequest(url, 'POST');
  if (result.code === 201) return true;
  if (result.code === 202) {
    try {
      const { href } = JSON.parse(result.data) as { href?: string };
      if (href) return await pollDiskOperation(href);
    } catch {
      return false;
    }
  }
  return false;
}

async function pollDiskOperation(href: string, maxAttempts = 120, delayMs = 400): Promise<boolean> {
  const token = getToken();
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(href, {
      headers: { Authorization: 'OAuth ' + token, Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    if (data.status === 'success') return true;
    if (data.status === 'failure') return false;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Скачать файл с Диска в буфер (по пути disk:/...). */
export async function downloadFileBuffer(filePath: string): Promise<Buffer | null> {
  const meta = await getResource(filePath);
  if (!meta?.file) return null;
  const token = getToken();
  const res = await fetch(meta.file, {
    headers: { Authorization: 'OAuth ' + token },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
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
