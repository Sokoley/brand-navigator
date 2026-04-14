import { transliterate } from '@/lib/search';

/** Латинский сегмент URL из названия товара (без гарантии уникальности). */
export function slugifyFromProductName(name: string): string {
  const t = transliterate(name || '').toLowerCase();
  const s = t
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'product';
}

/**
 * Уникальный slug внутри одной группы товаров: базовый slug + при коллизии -2, -3, …
 */
export function allocateSlugInGroup(baseName: string, usedInGroup: Set<string>): string {
  const base = slugifyFromProductName(baseName);
  let candidate = base;
  let n = 2;
  while (usedInGroup.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  usedInGroup.add(candidate);
  return candidate;
}

/** Slug группы товара для query-параметра `group` (латиница). */
export function groupSlugFromLabel(groupName: string): string {
  return slugifyFromProductName(groupName);
}

/**
 * Совпадение `group` из URL с названием группы в БД: точное (legacy) или по латинскому slug.
 */
export function matchesGroupQuery(urlGroup: string, dbGroup: string): boolean {
  const u = (urlGroup || '').trim();
  const d = (dbGroup || '').trim();
  if (!u || !d) return false;
  if (u === d) return true;
  return slugifyFromProductName(d) === u.toLowerCase();
}
