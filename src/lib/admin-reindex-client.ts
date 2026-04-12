/**
 * Клиент для фоновой переиндексации: POST запускает задачу и сразу отвечает,
 * затем опрос GET до завершения (долгие операции не держат одно HTTP-соединение).
 */

const POLL_MS = 2000;
const MAX_POLLS = 3600; // ~2 ч при интервале 2 с

export type ReindexPollResult =
  | { ok: true; message: string; products?: number; files?: number }
  | { ok: false; message: string };

export async function postReindexAndPoll(
  options?: { content?: string },
): Promise<ReindexPollResult> {
  const q = options?.content ? `?content=${encodeURIComponent(options.content)}` : '';
  const post = await fetch(`/api/admin/reindex${q}`, { method: 'POST' });
  const data = (await post.json().catch(() => ({}))) as Record<string, unknown>;

  if (post.status === 503) {
    return { ok: false, message: String(data.error || 'База данных не настроена') };
  }
  if (post.status === 409) {
    return { ok: false, message: String(data.error || 'Переиндексация уже выполняется') };
  }
  if (!post.ok && post.status !== 202) {
    return {
      ok: false,
      message: String(data.error || data.message || `HTTP ${post.status}`),
    };
  }

  if (post.status !== 202) {
    return { ok: false, message: String(data.error || 'Неизвестный ответ сервера') };
  }

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await fetch('/api/admin/reindex', { method: 'GET' });
    const j = (await st.json().catch(() => ({}))) as Record<string, unknown>;

    if (j.status === 'done' && j.success) {
      return {
        ok: true,
        message: String(j.message || 'Готово'),
        products: typeof j.products === 'number' ? j.products : undefined,
        files: typeof j.files === 'number' ? j.files : undefined,
      };
    }
    if (j.status === 'error') {
      return { ok: false, message: String(j.error || 'Ошибка переиндексации') };
    }
    if (j.status === 'idle' && i > 2) {
      return {
        ok: false,
        message:
          'Состояние переиндексации сброшено (перезапуск сервера?). Запустите снова.',
      };
    }
  }

  return {
    ok: false,
    message: 'Превышено время ожидания (≈2 ч). Проверьте логи сервера.',
  };
}
