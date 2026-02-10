import { NextResponse } from 'next/server';
import {
  loadProperties,
  addPropertyValue,
  updatePropertyValue,
  deletePropertyValue,
  hasSubcategories,
  getSubcategoriesForCategory
} from '@/lib/properties-manager';
import { checkPropertyUsage, updatePropertyInFiles } from '@/lib/property-validator';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const properties = loadProperties();
  return NextResponse.json(properties);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { property_type, property_value, parent_category } = body;

  if (!property_type || !property_value) {
    return NextResponse.json({ success: false, message: 'Missing data' }, { status: 400 });
  }

  const success = addPropertyValue(property_type, property_value, parent_category);
  if (success) {
    return NextResponse.json({ success: true, message: 'Property added' });
  }
  return NextResponse.json({ success: false, message: 'Failed to add property' }, { status: 500 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { property_type, old_value, new_value, parent_category } = body;

  if (!property_type || !old_value || !new_value) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const success = updatePropertyValue(property_type, old_value, new_value, parent_category);

  if (success) {
    // Update all files that use this property value
    const updateResult = await updatePropertyInFiles(property_type, old_value, new_value);

    // Invalidate products cache
    const cacheFile = path.join(process.cwd(), 'products_cache.json');
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (error) {
      console.error('Error deleting cache:', error);
    }

    return NextResponse.json({
      success: true,
      filesUpdated: updateResult.updatedCount,
      errors: updateResult.errors,
    });
  }

  return NextResponse.json({ error: 'Update failed' }, { status: 500 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyType = searchParams.get('type');
  const value = searchParams.get('value');
  const parent = searchParams.get('parent');
  const force = searchParams.get('force') === 'true';

  if (!propertyType || !value) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  // Check usage before deletion (unless forced)
  if (!force) {
    const usage = await checkPropertyUsage(propertyType, value);
    if (usage.isUsed) {
      return NextResponse.json({
        error: 'Property in use',
        fileCount: usage.fileCount,
        fileNames: usage.fileNames
      }, { status: 409 });
    }
  }

  // Special check for categories: prevent deletion if has subcategories
  if (propertyType === 'Категория' && hasSubcategories(value)) {
    const subcats = getSubcategoriesForCategory(value);
    return NextResponse.json({
      error: 'Cannot delete category with subcategories',
      subcategories: subcats
    }, { status: 409 });
  }

  const success = deletePropertyValue(propertyType, value, parent || undefined);

  if (success) {
    // Invalidate products cache
    const cacheFile = path.join(process.cwd(), 'products_cache.json');
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (error) {
      console.error('Error deleting cache:', error);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
}
