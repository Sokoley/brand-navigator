import { Product, SearchResult } from './types';

const russianToEnglish: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E', 'Ж': 'Zh',
  'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
  'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts',
  'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu',
  'Я': 'Ya',
};

const layoutMap: Record<string, string> = {
  'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ',
  'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д', ';': 'ж', "'": 'э',
  'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю', '/': '.',
  'Q': 'Й', 'W': 'Ц', 'E': 'У', 'R': 'К', 'T': 'Е', 'Y': 'Н', 'U': 'Г', 'I': 'Ш', 'O': 'Щ', 'P': 'З', '{': 'Х', '}': 'Ъ',
  'A': 'Ф', 'S': 'Ы', 'D': 'В', 'F': 'А', 'G': 'П', 'H': 'Р', 'J': 'О', 'K': 'Л', 'L': 'Д', ':': 'Ж', '"': 'Э',
  'Z': 'Я', 'X': 'Ч', 'C': 'С', 'V': 'М', 'B': 'И', 'N': 'Т', 'M': 'Ь', '<': 'Б', '>': 'Ю', '?': ',',
};

export function transliterate(text: string): string {
  return text.split('').map(char => russianToEnglish[char] || char).join('');
}

export function fixLayout(text: string): string {
  return text.split('').map(char => layoutMap[char] || char).join('');
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function advancedSearch(products: Product[], query: string): SearchResult[] {
  const searchTerm = query.toLowerCase().trim();

  if (searchTerm.length < 2) return [];

  const searchTermTranslit = transliterate(searchTerm).toLowerCase();
  const searchTermFixed = fixLayout(searchTerm);

  return products.filter(product => {
    const productName = product.name.toLowerCase();
    const productNameTranslit = transliterate(product.name).toLowerCase();
    const skus = product.skus.map(sku => sku.toLowerCase());

    // Exact name match (original + transliteration + layout fix)
    if (productName.includes(searchTerm)) return true;
    if (productNameTranslit.includes(searchTermTranslit)) return true;
    if (productName.includes(searchTermFixed.toLowerCase())) return true;

    // Exact SKU match
    if (skus.some(sku => sku.includes(searchTerm) || sku.includes(searchTermFixed.toLowerCase()))) return true;

    // Fuzzy match (for queries >= 3 chars)
    if (searchTerm.length >= 3) {
      const distOrig = levenshteinDistance(searchTerm, productName.substring(0, searchTerm.length));
      if (distOrig <= 2 && distOrig < searchTerm.length / 2) return true;

      const distTranslit = levenshteinDistance(searchTermTranslit, productNameTranslit.substring(0, searchTermTranslit.length));
      if (distTranslit <= 2 && distTranslit < searchTermTranslit.length / 2) return true;

      // Partial substring match
      if (productName.includes(searchTerm.substring(0, Math.max(2, searchTerm.length - 1)))) return true;
      if (productNameTranslit.includes(searchTermTranslit.substring(0, Math.max(2, searchTermTranslit.length - 1)))) return true;

      // Sliding window fuzzy
      for (let i = 0; i <= productName.length - searchTerm.length; i++) {
        const sub = productName.substring(i, i + searchTerm.length);
        if (levenshteinDistance(searchTerm, sub) <= 1) return true;
      }

      for (let i = 0; i <= productNameTranslit.length - searchTermTranslit.length; i++) {
        const sub = productNameTranslit.substring(i, i + searchTermTranslit.length);
        if (levenshteinDistance(searchTermTranslit, sub) <= 1) return true;
      }
    }

    return false;
  }) as SearchResult[];
}
