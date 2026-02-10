import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function GET() {
  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Points Admin';
  workbook.created = new Date();

  // Create main sheet
  const worksheet = workbook.addWorksheet('Точки');

  // Define columns
  worksheet.columns = [
    { header: 'Название', key: 'name', width: 30 },
    { header: 'Адрес', key: 'address', width: 40 },
    { header: 'Координаты', key: 'coordinates', width: 25 },
    { header: 'Телефон', key: 'phone', width: 20 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Сайт', key: 'website', width: 30 },
    { header: 'Тип', key: 'type', width: 30 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add example row
  worksheet.addRow({
    name: 'Пример магазина',
    address: 'Санкт-Петербург, ул. Примерная, д. 1',
    coordinates: '59.924668, 30.288937',
    phone: '+7 (999) 123-45-67',
    email: 'example@mail.ru',
    website: 'https://example.com',
    type: 'Точка продаж',
  });

  // Add data validation for Type column (rows 2-1000)
  for (let row = 2; row <= 1000; row++) {
    worksheet.getCell(`G${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Точка продаж,Официальная точка продаж,Дилер"'],
      showErrorMessage: true,
      errorTitle: 'Ошибка',
      error: 'Выберите тип из списка: Точка продаж, Официальная точка продаж, Дилер',
    };
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="points_template.xlsx"',
    },
  });
}
