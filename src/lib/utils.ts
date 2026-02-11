export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + units[i];
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark class="highlight">$1</mark>');
}

export function getPreviewProxyUrl(previewUrl: string, size: string = 'XXXL'): string {
  if (!previewUrl) return '';
  const url = previewUrl.includes('size=') ? previewUrl : previewUrl + '&size=' + size;
  return '/api/preview?url=' + encodeURIComponent(url);
}

export function getDownloadProxyUrl(fileUrl: string, filename: string): string {
  if (!fileUrl) return '';
  return '/api/download?url=' + encodeURIComponent(fileUrl) + '&filename=' + encodeURIComponent(filename);
}

export const PROPERTY_DISPLAY_ORDER = [
  'Тип контента',
  'Категория',
  'Подкатегория',
  'Папка',
  'Группа товаров',
  'Название товара',
  'SKU',
  'Тип файла',
  'Ответственный',
];

export const PROPERTY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Категория': { bg: '#e3f2fd', text: '#1976d2', border: '#bbdefb' },
  'Подкатегория': { bg: '#e8f5e9', text: '#2e7d32', border: '#c8e6c9' },
  'Папка': { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'Ответственный': { bg: '#f3e5f5', text: '#7b1fa2', border: '#e1bee7' },
  'Группа товаров': { bg: '#fff3e0', text: '#ef6c00', border: '#ffcc80' },
  'Тип файла': { bg: '#e0f2f1', text: '#00695c', border: '#b2dfdb' },
  'Тип контента': { bg: '#fce4ec', text: '#c2185b', border: '#f8bbd9' },
  'SKU': { bg: '#e8eaf6', text: '#303f9f', border: '#c5cae9' },
  'Название товара': { bg: '#fff8e1', text: '#ff8f00', border: '#ffecb3' },
};

export const CATEGORY_COLORS = [
  { bg: '#000', text: '#fff', border: '#fff' },
  { bg: '#C6C6C6', text: '#000', border: '#000' },
  { bg: '#E0F37D', text: '#000', border: '#000' },
  { bg: '#4658C8', text: '#fff', border: '#fff' },
  { bg: '#EE5E36', text: '#fff', border: '#fff' },
];
