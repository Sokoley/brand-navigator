import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let schemaPromise: Promise<void> | null = null;

function isRetriableConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; errno?: number; message?: string };
  if (e.code === 'PROTOCOL_CONNECTION_LOST') return true;
  if (e.code === 'ECONNRESET') return true;
  if (e.code === 'ETIMEDOUT') return true;
  if (e.code === 'ENOTFOUND') return true;
  if (typeof e.message === 'string' && e.message.includes('Connection lost')) return true;
  return false;
}

/** Закрыть пул и забыть схему — после PROTOCOL_CONNECTION_LOST следующий запрос создаст новые соединения. */
export async function resetPool(): Promise<void> {
  schemaPromise = null;
  const old = pool;
  pool = null;
  if (!old) return;
  try {
    await old.end();
  } catch {
    /* ignore */
  }
}

/**
 * Выполнение SQL с повтором при обрыве соединения (типично для MariaDB wait_timeout / сети).
 */
export async function executeWithRetry(
  sql: string,
  params?: unknown | unknown[],
): Promise<Awaited<ReturnType<mysql.Pool['execute']>>> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const p = getPool();
    if (!p) {
      throw new Error('DATABASE_URL не задан или пул не создан');
    }
    try {
      if (params !== undefined) {
        return await p.execute(sql, params as never);
      }
      return await p.execute(sql);
    } catch (err) {
      lastErr = err;
      if (isRetriableConnectionError(err) && attempt < maxAttempts - 1) {
        console.warn('[db] соединение с БД потеряно, пересоздаём пул, попытка', attempt + 2);
        await resetPool();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function getPool(): mysql.Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    pool = mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      /** Реже отваливается с PROTOCOL_CONNECTION_LOST за NAT / долгим idle на сервере БД */
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 20000,
    });
    return pool;
  } catch {
    return null;
  }
}

/** Создаёт таблицы при первом обращении к БД. Вызывается автоматически из сервисов. */
export async function ensureSchema(): Promise<void> {
  if (!getPool()) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = runSchema().catch((err) => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// product_group — название группы товара (папка в Brand/Товары/{product_group}/{name}/).
// Префиксы 191 — лимит InnoDB 767 байт/столбец (utf8mb4). ROW_FORMAT=DYNAMIC на всякий случай.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  product_group VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Группа товара — папка на Диске (Brand/Товары/product_group/...)',
  main_photo_path VARCHAR(1000) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_group (name(191), product_group(191))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  path VARCHAR(1000) NOT NULL,
  file_type VARCHAR(100) NOT NULL DEFAULT '',
  sku VARCHAR(200) NULL,
  size BIGINT NULL,
  preview_url TEXT NULL,
  file_url TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_path (path(191)),
  KEY idx_product_id (product_id),
  CONSTRAINT fk_product_files_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reindex_meta (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  products INT NULL,
  files INT NULL
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO reindex_meta (id, status) VALUES (1, 'idle');
`;

export async function runSchema(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан. Добавьте в .env и перезапустите сервер (npm run dev).');
  if (!getPool()) throw new Error('Подключение к БД не удалось. Проверьте DATABASE_URL в .env (формат: mysql://user:password@host:3306/database) и перезапустите сервер.');
  const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await executeWithRetry(stmt);
  }
  // Исправить длинные ключи на существующих таблицах (max 767 байт/столбец или 3072 всего)
  for (const table of ['products', 'product_files']) {
    try {
      await executeWithRetry(`ALTER TABLE \`${table}\` ROW_FORMAT=DYNAMIC`);
    } catch {
      // не критично
    }
  }
  try {
    await executeWithRetry('ALTER TABLE products DROP INDEX uk_name_group');
  } catch {
    // индекс может отсутствовать
  }
  try {
    await executeWithRetry('ALTER TABLE products ADD UNIQUE KEY uk_name_group (name(191), product_group(191))');
  } catch {
    // уже есть нужный индекс
  }
  try {
    await executeWithRetry('ALTER TABLE product_files DROP INDEX uk_path');
  } catch {
    // индекс может отсутствовать
  }
  try {
    await executeWithRetry('ALTER TABLE product_files ADD UNIQUE KEY uk_path (path(191))');
  } catch {
    // уже есть нужный индекс
  }
  try {
    await executeWithRetry('ALTER TABLE product_files DROP COLUMN custom_properties');
  } catch {
    // столбец уже удалён или отсутствует
  }
}
