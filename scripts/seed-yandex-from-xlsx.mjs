#!/usr/bin/env node
/**
 * Создаёт на Яндекс.Диске структуру Brand/Товары/{Группа}/{Товар}/{тип}/… из xlsx
 * (та же логика, что POST /api/yandex/seed-from-xlsx).
 *
 * Использование: node scripts/seed-yandex-from-xlsx.mjs [путь-к.xlsx]
 * Требуется YANDEX_DISK_TOKEN в окружении или в .env / .env.local
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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
      /* ignore */
    }
  }
}

const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/resources';
const BRAND_BASE = 'disk:/Brand';
const PRODUCTS_ROOT = 'Товары';
const NO_GROUP = 'Без группы';

const FILE_TYPE_FOLDERS = ['Кросс коды', 'Фото', 'Видео', 'Этикетки', 'Документы'];
const crossCodesFolder = 'Кросс коды';

function sanitizeFolderPart(s) {
  return String(s || '')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Без названия';
}

function buildProductFolderPath(productName, productGroup) {
  const group = sanitizeFolderPart(productGroup || '') || NO_GROUP;
  const product = sanitizeFolderPart(productName) || 'Без названия';
  return `${PRODUCTS_ROOT}/${group}/${product}`;
}

function sanitizeFileName(s) {
  return (
    String(s || '')
      .replace(/[/\\:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'file'
  );
}

function getToken() {
  const token = process.env.YANDEX_DISK_TOKEN;
  if (!token) throw new Error('YANDEX_DISK_TOKEN не задан (export или .env.local)');
  return token;
}

async function yandexRequest(url, method = 'GET', body = null, contentType) {
  const h = {
    Authorization: 'OAuth ' + getToken(),
    Accept: 'application/json',
  };
  if (contentType) h['Content-Type'] = contentType;
  const opts = { method, headers: h };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) opts.body = body;
  const response = await fetch(url, opts);
  const data = await response.text();
  return { code: response.status, data };
}

async function createFolder(folderPath) {
  const url = `${YANDEX_API_BASE}?path=${encodeURIComponent(folderPath)}`;
  const result = await yandexRequest(url, 'PUT');
  return result.code === 201 || result.code === 409;
}

async function ensureFolderPath(base, relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += (acc ? '/' : '') + part;
    const ok = await createFolder(`${base}/${acc}`);
    if (!ok) throw new Error(`Не удалось создать папку: ${acc}`);
  }
}

async function getUploadUrl(filePath, overwrite = true) {
  const url = `${YANDEX_API_BASE}/upload?path=${encodeURIComponent(filePath)}&overwrite=${overwrite}`;
  const result = await yandexRequest(url);
  if (result.code !== 200) return null;
  const data = JSON.parse(result.data);
  return data.href || null;
}

async function uploadToHref(href, buffer) {
  const response = await fetch(href, { method: 'PUT', body: buffer });
  return response.status;
}

/** Выполнить задачи с ограничением параллелизма (ускоряет сотни загрузок на Диск). */
async function poolMap(items, limit, fn) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return ret;
}

async function main() {
  loadEnvFiles();
  const xlsxPath = path.resolve(process.argv[2] || path.join(root, 'Все товары.xlsx'));
  if (!fs.existsSync(xlsxPath)) {
    console.error('Файл не найден:', xlsxPath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  if (rows.length === 0) {
    console.error('В файле нет строк');
    process.exit(1);
  }

  const productMap = new Map();
  const key = (g, n) => `${g}\0${n}`;

  for (const row of rows) {
    const group = String(row['Группа'] ?? row['Группа товаров'] ?? '').trim();
    const name = String(row['Название'] ?? row['Названия'] ?? '').trim();
    const articul = String(row['Артикул'] ?? '').trim();
    const volume = String(row['Объём'] ?? '').trim();
    if (!group || !name) continue;

    const k = key(group, name);
    if (!productMap.has(k)) productMap.set(k, []);
    if (articul) {
      productMap.get(k).push({ articul, volume });
    }
  }

  console.log('Уникальных товаров (группа+название):', productMap.size);
  getToken();

  await ensureFolderPath(BRAND_BASE, PRODUCTS_ROOT);
  let created = 0;
  const errors = [];

  const entries = [...productMap.entries()];
  let done = 0;
  for (const [pair, articuls] of entries) {
    const [group, productName] = pair.split('\0');
    const productFolderPath = buildProductFolderPath(productName, group);
    const productFullPath = `${BRAND_BASE}/${productFolderPath}`;

    try {
      await ensureFolderPath(BRAND_BASE, productFolderPath);
      created++;

      for (const typeName of FILE_TYPE_FOLDERS) {
        const typePath = `${productFullPath}/${typeName}`;
        await createFolder(typePath);
      }

      const crossPath = `${productFullPath}/${crossCodesFolder}`;
      const uploadTasks = articuls.map(({ articul, volume }) => async () => {
        const safeName = sanitizeFileName(articul);
        const fileName = safeName ? `${safeName}.txt` : 'articul.txt';
        const filePath = `${crossPath}/${fileName}`;
        const content = volume ? `Объём: ${volume}\n` : '';
        const href = await getUploadUrl(filePath, true);
        if (href) {
          const status = await uploadToHref(href, Buffer.from(content, 'utf8'));
          if (status !== 201 && status !== 200) return `${filePath}: HTTP ${status}`;
        } else {
          return `Нет URL загрузки: ${filePath}`;
        }
        return null;
      });

      const batchErrs = await poolMap(
        uploadTasks,
        12,
        async (task) => task(),
      );
      for (const err of batchErrs) {
        if (err) errors.push(err);
      }
    } catch (e) {
      errors.push(`${productFolderPath}: ${e.message}`);
    }
    done++;
    if (done % 10 === 0 || done === entries.length) {
      console.log(`Прогресс: ${done}/${entries.length} товаров…`);
    }
  }

  console.log('Готово. Создано/обновлено веток товаров:', created);
  if (errors.length) {
    console.error('Ошибки:', errors.length);
    for (const e of errors.slice(0, 20)) console.error(' ', e);
    if (errors.length > 20) console.error(' …');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
