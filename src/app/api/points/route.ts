import { NextRequest, NextResponse } from 'next/server';
import { uploadFileViaFTP } from '@/lib/ftp';

const DATA_URL = 'https://smazka.ru/data_test.json';

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

// In-memory cache
let cachedData: PointsCollection | null = null;

async function fetchPoints(): Promise<PointsCollection> {
  if (cachedData) {
    return cachedData;
  }

  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch points data');
  }

  cachedData = await response.json();
  return cachedData!;
}

// Save data to remote server via FTP
async function savePointsToRemote(data: PointsCollection): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2);
  await uploadFileViaFTP(jsonContent);
}

// GET - Fetch all points
export async function GET() {
  try {
    const data = await fetchPoints();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching points:', error);
    return NextResponse.json({ error: 'Failed to fetch points' }, { status: 500 });
  }
}

// POST - Add a new point
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await fetchPoints();

    // Generate new ID
    const maxId = Math.max(...data.features.map((f) => f.id), 0);
    const newPoint: MapPoint = {
      type: 'Feature',
      id: maxId + 1,
      geometry: {
        type: 'Point',
        coordinates: [body.latitude || 53.9, body.longitude || 27.5667],
      },
      properties: {
        balloonContentHeader: body.name || '',
        balloonContent: `Телефон: ${body.phone || 'нет'}<br>Email: ${body.email || 'нет'}<br>Сайт: ${
          body.website ? `<a target='_blank' href='${body.website}'>${body.website}</a>` : 'нет'
        }`,
        balloonContentFooter: body.address || '',
        hintContent: body.name || '',
        adress: body.address || '',
      },
      options: {
        preset: body.preset || 'islands#grayDotIcon',
      },
    };

    data.features.push(newPoint);
    cachedData = data;

    // Save to remote server
    await savePointsToRemote(data);

    return NextResponse.json({ success: true, point: newPoint });
  } catch (error) {
    console.error('Error adding point:', error);
    return NextResponse.json({ error: 'Failed to add point: ' + (error as Error).message }, { status: 500 });
  }
}

// PATCH - Update a point
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const data = await fetchPoints();
    const pointIndex = data.features.findIndex((f) => f.id === id);

    if (pointIndex === -1) {
      return NextResponse.json({ error: 'Point not found' }, { status: 404 });
    }

    const point = data.features[pointIndex];

    // Update coordinates
    if (updates.latitude !== undefined || updates.longitude !== undefined) {
      point.geometry.coordinates = [
        updates.latitude ?? point.geometry.coordinates[0],
        updates.longitude ?? point.geometry.coordinates[1],
      ];
    }

    // Update properties
    if (updates.name !== undefined) {
      point.properties.balloonContentHeader = updates.name;
      point.properties.hintContent = updates.name;
    }

    if (updates.address !== undefined) {
      point.properties.balloonContentFooter = updates.address;
      point.properties.adress = updates.address;
    }

    // Update preset/point type
    if (updates.preset !== undefined) {
      point.options = point.options || { preset: 'islands#grayDotIcon' };
      point.options.preset = updates.preset;
    }

    // Rebuild balloonContent if contact info changed
    if (updates.phone !== undefined || updates.email !== undefined || updates.website !== undefined) {
      const currentContent = point.properties.balloonContent;

      // Parse current values
      const phoneMatch = currentContent.match(/Телефон: ([^<]*)/);
      const emailMatch = currentContent.match(/Email: ([^<]*)/);
      const websiteMatch = currentContent.match(/href='([^']+)'/);

      const phone = updates.phone ?? (phoneMatch ? phoneMatch[1] : 'нет');
      const email = updates.email ?? (emailMatch ? emailMatch[1] : 'нет');
      const website = updates.website ?? (websiteMatch ? websiteMatch[1] : '');

      point.properties.balloonContent = `Телефон: ${phone}<br>Email: ${email}<br>Сайт: ${
        website ? `<a target='_blank' href='${website}'>${website}</a>` : 'нет'
      }`;
    }

    data.features[pointIndex] = point;
    cachedData = data;

    // Save to remote server
    await savePointsToRemote(data);

    return NextResponse.json({ success: true, point });
  } catch (error) {
    console.error('Error updating point:', error);
    return NextResponse.json({ error: 'Failed to update point: ' + (error as Error).message }, { status: 500 });
  }
}

// DELETE - Delete a point
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') || '', 10);

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const data = await fetchPoints();
    const pointIndex = data.features.findIndex((f) => f.id === id);

    if (pointIndex === -1) {
      return NextResponse.json({ error: 'Point not found' }, { status: 404 });
    }

    data.features.splice(pointIndex, 1);
    cachedData = data;

    // Save to remote server
    await savePointsToRemote(data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting point:', error);
    return NextResponse.json({ error: 'Failed to delete point: ' + (error as Error).message }, { status: 500 });
  }
}
