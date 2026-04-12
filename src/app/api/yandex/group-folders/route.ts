import { NextResponse } from 'next/server';

/**
 * POST: раньше создавал Brand/Товары и папку под каждую «Группа товаров» из свойств.
 * Папки групп на Яндекс.Диске не создаются автоматически (в т.ч. при перезагрузке страниц
 * или внешних вызовах API) — структура Товары/Группа/Товар появляется только при
 * создании товара (POST /api/yandex/product-folders) или загрузке файла (POST /api/yandex/upload).
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    created: [] as string[],
    message:
      'Создание папок групп отключено. Папки групп создаются вместе с товаром при «Добавить товар» или загрузке файлов.',
  });
}
