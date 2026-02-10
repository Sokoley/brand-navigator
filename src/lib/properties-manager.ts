import fs from 'fs';
import path from 'path';
import { CustomProperties } from './types';

const PROPERTIES_FILE = path.join(process.cwd(), 'custom_properties.json');

export function loadProperties(): CustomProperties {
  try {
    const data = fs.readFileSync(PROPERTIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    const defaults = getDefaultProperties();
    saveProperties(defaults);
    return defaults;
  }
}

export function saveProperties(properties: CustomProperties): void {
  fs.writeFileSync(PROPERTIES_FILE, JSON.stringify(properties, null, 4));
}

function getDefaultProperties(): CustomProperties {
  return {
    'Категория': ['POS', 'Web', 'Наружная реклама', 'Брендирование', 'Мерч'],
    'Подкатегория': {
      'POS': ['Листовка', 'Постер', 'Буклет', 'Каталог'],
      'Web': ['Баннер', 'Видео', 'Акции'],
      'Наружная реклама': ['Баннер'],
      'Брендирование': ['Авто', 'СТО', 'ПЗМ'],
      'Мерч': ['Одежда', 'Канцелярия', 'Новый год'],
    },
    'Ответственный': ['Запутряев', 'Каулин', 'Садыков', 'Искандер', 'Раханский', 'Соколов', 'Казанский'],
    'Группа товаров': ['Масла Моторные', 'Масла Трансмиссионные', 'Масла 2Т', 'Масла 4Т', 'Масла ГУР', 'Смазки Валера', 'Смазки Для тормозной системы', 'Смазки Для подшипников', 'Смазки Силиконовые', 'Смазки Вело-мото', 'Смазки Строительно-бытовые', 'Смазки Промышленные', 'Очистители двс', 'Добавки в масло', 'Добавки в топливо', 'Бытовая химия', 'Чистики', 'Уголок моториста'],
    'Тип файла': ['Главное фото', 'Фото', 'Видео', 'Документ', 'PNG'],
    'Тип контента': ['Макет', 'Товар'],
    'Название товара': [],
    'SKU': [],
  };
}

export function addPropertyValue(propertyType: string, value: string, parentCategory?: string): boolean {
  const properties = loadProperties();

  if (propertyType === 'Подкатегория' && parentCategory) {
    const subcats = properties['Подкатегория'] as Record<string, string[]>;
    if (!subcats[parentCategory]) {
      subcats[parentCategory] = [];
    }
    if (!subcats[parentCategory].includes(value)) {
      subcats[parentCategory].push(value);
    }
  } else {
    const arr = properties[propertyType] as string[];
    if (Array.isArray(arr) && !arr.includes(value)) {
      arr.push(value);
    }
  }

  saveProperties(properties);
  return true;
}

export function addProductName(name: string): void {
  const properties = loadProperties();
  const names = properties['Название товара'] as string[];
  if (!names.includes(name)) {
    names.push(name);
    saveProperties(properties);
  }
}

export function addSKU(sku: string): void {
  const trimmed = sku.trim();
  if (!trimmed) return;
  const properties = loadProperties();
  const skus = properties['SKU'] as string[];
  if (!skus.includes(trimmed)) {
    skus.push(trimmed);
    saveProperties(properties);
  }
}

export function addMultipleSKUs(skus: string[]): void {
  skus.forEach(addSKU);
}

export function updatePropertyValue(
  propertyType: string,
  oldValue: string,
  newValue: string,
  parentCategory?: string
): boolean {
  const properties = loadProperties();

  if (propertyType === 'Подкатегория' && parentCategory) {
    const subcats = properties['Подкатегория'] as Record<string, string[]>;
    if (!subcats[parentCategory]) {
      return false;
    }
    const index = subcats[parentCategory].indexOf(oldValue);
    if (index === -1) {
      return false;
    }
    if (subcats[parentCategory].includes(newValue)) {
      return false; // Duplicate check
    }
    subcats[parentCategory][index] = newValue;
  } else {
    const arr = properties[propertyType] as string[];
    if (!Array.isArray(arr)) {
      return false;
    }
    const index = arr.indexOf(oldValue);
    if (index === -1) {
      return false;
    }
    if (arr.includes(newValue)) {
      return false; // Duplicate check
    }
    arr[index] = newValue;
  }

  saveProperties(properties);
  return true;
}

export function deletePropertyValue(
  propertyType: string,
  value: string,
  parentCategory?: string
): boolean {
  const properties = loadProperties();

  if (propertyType === 'Подкатегория' && parentCategory) {
    const subcats = properties['Подкатегория'] as Record<string, string[]>;
    if (!subcats[parentCategory]) {
      return false;
    }
    const index = subcats[parentCategory].indexOf(value);
    if (index === -1) {
      return false;
    }
    subcats[parentCategory].splice(index, 1);
  } else {
    const arr = properties[propertyType] as string[];
    if (!Array.isArray(arr)) {
      return false;
    }
    const index = arr.indexOf(value);
    if (index === -1) {
      return false;
    }
    arr.splice(index, 1);
  }

  saveProperties(properties);
  return true;
}

export function hasSubcategories(category: string): boolean {
  const properties = loadProperties();
  const subcats = properties['Подкатегория'] as Record<string, string[]>;
  return subcats[category] !== undefined && subcats[category].length > 0;
}

export function getSubcategoriesForCategory(category: string): string[] {
  const properties = loadProperties();
  const subcats = properties['Подкатегория'] as Record<string, string[]>;
  return subcats[category] || [];
}
