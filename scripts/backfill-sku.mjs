#!/usr/bin/env node
/**
 * Заполнение SKU из имён файлов в …/Кросс коды/… (только node, без npm/tsx).
 * Запуск из корня проекта: node scripts/backfill-sku.mjs
 * Нужны DATABASE_URL и (опционально) custom_properties.json рядом с проектом.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const CROSS_MARKER = '/Кросс коды/';
const PLACEHOLDER_STEMS = new Set(['articul', 'file']);

function loadEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    try {
      const text = fs.readFileSync(p, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* нет файла */
    }
  }
}

function stemFromPath(filePath) {
  const last = filePath.split('/').pop() || '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  const stem = name.replace(/\.[^./\\]+$/i, '').trim();
  if (!stem) return null;
  if (PLACEHOLDER_STEMS.has(stem.toLowerCase())) return null;
  return stem;
}

function addSKUToProperties(sku) {
  const trimmed = String(sku).trim();
  if (!trimmed) return;
  const propsPath = path.join(root, 'custom_properties.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(data['SKU'])) data['SKU'] = [];
  const skus = data['SKU'];
  if (!skus.includes(trimmed)) {
    skus.push(trimmed);
    fs.writeFileSync(propsPath, JSON.stringify(data, null, 4));
  }
}

async function main() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL не задан (добавьте в .env или экспортируйте в shell).');
    process.exit(1);
  }

  const pool = mysql.createPool({ uri: url, waitForConnections: true, connectionLimit: 4 });

  const result = { updated: 0, skipped: 0, errors: [] };
  const [rows] = await pool.execute(
    'SELECT id, path, sku FROM product_files WHERE path LIKE ?',
    [`%${CROSS_MARKER}%`],
  );
  const list = Array.isArray(rows) ? rows : [];
  const addedSkus = new Set();

  for (const row of list) {
    const stem = stemFromPath(row.path);
    if (!stem) {
      result.skipped++;
      continue;
    }
    const current = (row.sku || '').trim();
    if (current) {
      result.skipped++;
      continue;
    }
    try {
      await pool.execute('UPDATE product_files SET sku = ? WHERE id = ?', [stem, row.id]);
      result.updated++;
      if (!addedSkus.has(stem)) {
        addSKUToProperties(stem);
        addedSkus.add(stem);
      }
    } catch (e) {
      result.errors.push(`${row.path}: ${e.message}`);
    }
  }

  await pool.end();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
