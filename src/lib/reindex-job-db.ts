/**
 * Состояние фоновой переиндексации в MySQL — общее для всех воркеров Next.js и переживает рестарт
 * (в отличие от переменной в памяти модуля).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool, executeWithRetry } from '@/lib/db';

/** «running» дольше этого — считаем зависшим (падение процесса, обрыв без finish). Переиндексация по большому каталогу может идти часами. */
const STALE_RUNNING_HOURS = 4;

export type ReindexJobRow = {
  status: 'idle' | 'running' | 'done' | 'error';
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  products: number | null;
  files: number | null;
};

/** Сброс «зависшего» running (падение процесса, обрыв БД без finishReindexJob и т.д.). */
export async function resetStaleRunningJob(): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry(
    `UPDATE reindex_meta
     SET status = 'error',
         finished_at = UTC_TIMESTAMP(),
         error_message = 'Прервано: предыдущий запуск не завершился (таймаут или сбой). Запустите переиндексацию снова.'
     WHERE id = 1
       AND status = 'running'
       AND started_at IS NOT NULL
       AND started_at < UTC_TIMESTAMP() - INTERVAL ${STALE_RUNNING_HOURS} HOUR`,
  );
}

/** Строка id=1 нужна, иначе UPDATE в tryStart даст 0 строк и клиент получит ложный «уже выполняется». */
export async function ensureReindexMetaRow(): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry(
    `INSERT IGNORE INTO reindex_meta (id, status) VALUES (1, 'idle')`,
  );
}

/**
 * Пытается перевести задачу в running. Возвращает started | already_running.
 */
export async function tryStartReindexJob(): Promise<'started' | 'already_running'> {
  if (!getPool()) throw new Error('Нет подключения к БД');

  await ensureReindexMetaRow();
  await resetStaleRunningJob();

  const [r] = await executeWithRetry(
    `UPDATE reindex_meta SET
       status = 'running',
       started_at = UTC_TIMESTAMP(),
       finished_at = NULL,
       error_message = NULL,
       products = NULL,
       files = NULL
     WHERE id = 1 AND status <> 'running'`,
  );
  const h = r as ResultSetHeader;
  if (h.affectedRows === 1) return 'started';
  return 'already_running';
}

export async function finishReindexJob(products: number, files: number): Promise<void> {
  if (!getPool()) return;
  await executeWithRetry(
    `UPDATE reindex_meta
     SET status = 'done',
         finished_at = UTC_TIMESTAMP(),
         products = ?,
         files = ?,
         error_message = NULL
     WHERE id = 1`,
    [products, files],
  );
}

export async function failReindexJob(message: string): Promise<void> {
  if (!getPool()) return;
  const msg = message.slice(0, 60000);
  await executeWithRetry(
    `UPDATE reindex_meta
     SET status = 'error',
         finished_at = UTC_TIMESTAMP(),
         error_message = ?
     WHERE id = 1`,
    [msg],
  );
}

export async function getReindexJob(): Promise<ReindexJobRow | null> {
  if (!getPool()) return null;
  const [rows] = await executeWithRetry(
    `SELECT status, started_at, finished_at, error_message, products, files
     FROM reindex_meta WHERE id = 1`,
  );
  const list = Array.isArray(rows) ? rows : [];
  const row = list[0] as RowDataPacket | undefined;
  if (!row) return null;
  return {
    status: String(row.status) as ReindexJobRow['status'],
    started_at: row.started_at ? new Date(row.started_at as string | Date) : null,
    finished_at: row.finished_at ? new Date(row.finished_at as string | Date) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    products: row.products != null ? Number(row.products) : null,
    files: row.files != null ? Number(row.files) : null,
  };
}
