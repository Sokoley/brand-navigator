import { uploadFileViaFTP } from '@/lib/ftp';

export const DATA_URL = 'https://smazka.ru/data_test.json';

export interface MapPoint {
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

export interface PointsCollection {
  type: 'FeatureCollection';
  features: MapPoint[];
}

let cachedData: PointsCollection | null = null;

export function invalidatePointsCache(): void {
  cachedData = null;
}

export function setPointsCache(data: PointsCollection): void {
  cachedData = data;
}

export async function fetchPoints(options?: { bypassCache?: boolean }): Promise<PointsCollection> {
  if (!options?.bypassCache && cachedData) {
    return cachedData;
  }

  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch points data');
  }

  cachedData = await response.json();
  return cachedData!;
}

export async function savePointsToRemote(data: PointsCollection): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2);
  await uploadFileViaFTP(jsonContent);
  cachedData = data;
}

export function buildMapPoint(
  id: number,
  input: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone?: string;
    email?: string;
    website?: string;
    preset?: string;
  }
): MapPoint {
  const phone = input.phone || 'нет';
  const email = input.email || 'нет';
  const website = input.website?.trim() || '';

  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Point',
      coordinates: [input.latitude, input.longitude],
    },
    properties: {
      balloonContentHeader: input.name,
      balloonContent: `Телефон: ${phone}<br>Email: ${email}<br>Сайт: ${
        website ? `<a target='_blank' href='${website}'>${website}</a>` : 'нет'
      }`,
      balloonContentFooter: input.address,
      hintContent: input.name,
      adress: input.address,
    },
    options: {
      preset: input.preset || 'islands#grayDotIcon',
    },
  };
}
