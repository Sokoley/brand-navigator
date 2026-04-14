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
