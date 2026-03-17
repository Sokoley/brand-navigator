const ALLOWED_HOSTS = [
  'cloud-api.yandex.net',
  'downloader.disk.yandex.ru',
  'get-preview.disk.yandex.ru',
];

export function isAllowedYandexUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.includes(host)) return true;
    if (host.endsWith('.disk.yandex.ru') || host.endsWith('.yandex.net')) return true;
    return false;
  } catch {
    return false;
  }
}
