import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { uploadFileViaFTP } from '@/lib/ftp';

// Point type mapping
const POINT_TYPE_MAP: Record<string, string> = {
  'точка продаж': 'islands#grayDotIcon',
  'официальная точка продаж': 'islands#redDotIcon',
  'дилер': 'islands#blueDotIcon',
};

const DATA_URL = 'https://smazka.ru/data_test.json';

interface MapPoint {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    balloonContentHeader: string;
    balloonContent: string;
    balloonContentFooter: string;
    hintContent: string;
    adress: string;
  };
  options: {
    preset: string;
  };
}

interface PointsCollection {
  type: 'FeatureCollection';
  features: MapPoint[];
}

function parseCoordinates(coordString: string): { latitude: number; longitude: number } | null {
  if (!coordString) return null;
  const parts = coordString.toString().split(',').map(s => s.trim());
  if (parts.length !== 2) return null;
  const latitude = parseFloat(parts[0]);
  const longitude = parseFloat(parts[1]);
  if (isNaN(latitude) || isNaN(longitude)) return null;
  return { latitude, longitude };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Файл не загружен' }, { status: 400 });
    }

    // Read file
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    // Get first sheet
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];

    // Convert to JSON (skip header row)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Файл пустой или неверный формат' }, { status: 400 });
    }

    const points: Array<{
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      phone: string;
      email: string;
      website: string;
      preset: string;
    }> = [];

    const errors: string[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // +2 because of header and 0-based index

      const name = (row['Название'] || '').toString().trim();
      const address = (row['Адрес'] || '').toString().trim();
      const coordsStr = (row['Координаты'] || '').toString().trim();
      const phone = (row['Телефон'] || '').toString().trim();
      const email = (row['Email'] || '').toString().trim();
      const website = (row['Сайт'] || '').toString().trim();
      const typeStr = (row['Тип'] || '').toString().trim().toLowerCase();

      // Validate required fields
      if (!name) {
        errors.push(`Строка ${rowNum}: отсутствует название`);
        return;
      }
      if (!address) {
        errors.push(`Строка ${rowNum}: отсутствует адрес`);
        return;
      }

      const coords = parseCoordinates(coordsStr);
      if (!coords) {
        errors.push(`Строка ${rowNum}: неверный формат координат`);
        return;
      }

      // Map point type
      const preset = POINT_TYPE_MAP[typeStr] || 'islands#grayDotIcon';

      points.push({
        name,
        address,
        latitude: coords.latitude,
        longitude: coords.longitude,
        phone,
        email,
        website,
        preset,
      });
    });

    if (points.length === 0) {
      return NextResponse.json(
        { error: 'Не удалось импортировать точки', details: errors },
        { status: 400 }
      );
    }

    // Fetch current points data
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Не удалось загрузить текущие данные' }, { status: 500 });
    }
    const data: PointsCollection = await response.json();

    // Find max ID
    let maxId = Math.max(...data.features.map((f) => f.id), 0);

    // Add points directly
    const addedPoints: MapPoint[] = [];
    for (const point of points) {
      maxId++;
      const newPoint: MapPoint = {
        type: 'Feature',
        id: maxId,
        geometry: {
          type: 'Point',
          coordinates: [point.latitude, point.longitude],
        },
        properties: {
          balloonContentHeader: point.name,
          balloonContent: `Телефон: ${point.phone || 'нет'}<br>Email: ${point.email || 'нет'}<br>Сайт: ${
            point.website ? `<a target='_blank' href='${point.website}'>${point.website}</a>` : 'нет'
          }`,
          balloonContentFooter: point.address,
          hintContent: point.name,
          adress: point.address,
        },
        options: {
          preset: point.preset,
        },
      };
      data.features.push(newPoint);
      addedPoints.push(newPoint);
    }

    // Save to remote server via FTP
    const jsonContent = JSON.stringify(data, null, 2);
    await uploadFileViaFTP(jsonContent);

    return NextResponse.json({
      success: true,
      imported: addedPoints.length,
      total: points.length,
      errors: errors.length > 0 ? errors : undefined,
      points: addedPoints,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Ошибка обработки файла' }, { status: 500 });
  }
}
