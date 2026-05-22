import { NextRequest, NextResponse } from 'next/server';
import {
  buildMapPoint,
  fetchPoints,
  savePointsToRemote,
  type MapPoint,
  type PointsCollection,
} from '@/lib/points-data';

export type { MapPoint, PointsCollection };

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

    const maxId = Math.max(...data.features.map((f) => f.id), 0);
    const newPoint = buildMapPoint(maxId + 1, {
      name: body.name || '',
      address: body.address || '',
      phone: body.phone,
      email: body.email,
      website: body.website,
      latitude: body.latitude ?? 53.9,
      longitude: body.longitude ?? 27.5667,
      preset: body.preset,
    });

    data.features.push(newPoint);
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

    if (updates.latitude !== undefined || updates.longitude !== undefined) {
      point.geometry.coordinates = [
        updates.latitude ?? point.geometry.coordinates[0],
        updates.longitude ?? point.geometry.coordinates[1],
      ];
    }

    if (updates.name !== undefined) {
      point.properties.balloonContentHeader = updates.name;
      point.properties.hintContent = updates.name;
    }

    if (updates.address !== undefined) {
      point.properties.balloonContentFooter = updates.address;
      point.properties.adress = updates.address;
    }

    if (updates.preset !== undefined) {
      point.options = point.options || { preset: 'islands#grayDotIcon' };
      point.options.preset = updates.preset;
    }

    if (updates.phone !== undefined || updates.email !== undefined || updates.website !== undefined) {
      const currentContent = point.properties.balloonContent;
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
    await savePointsToRemote(data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting point:', error);
    return NextResponse.json({ error: 'Failed to delete point: ' + (error as Error).message }, { status: 500 });
  }
}
