'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

type ActionId = 'sku' | 'png' | 'reindex';

export default function AdminToolsPage() {
  const { isAuth, loading } = useAuth();
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const run = async (id: ActionId, url: string) => {
    setBusy(id);
    setAlert(null);
    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlert({
          type: 'error',
          message: typeof data.error === 'string' ? data.error : data.message || `HTTP ${res.status}`,
        });
        return;
      }
      const text =
        typeof data.message === 'string'
          ? data.message
          : [
              data.updated != null && `Обновлено записей: ${data.updated}`,
              data.skipped != null && `Пропущено: ${data.skipped}`,
              data.pngUpdated != null && `PNG обновлено: ${data.pngUpdated}`,
              data.replaced != null && `txt→png: ${data.replaced}`,
              data.products != null && `Товаров в индексе: ${data.products}`,
              data.files != null && `Файлов в индексе: ${data.files}`,
            ]
              .filter(Boolean)
              .join(' · ') || JSON.stringify(data);
      setAlert({ type: 'success', message: text });
    } catch (e) {
      setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Ошибка сети' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20 text-center text-gray-500">
        Загрузка...
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Доступ запрещён</h1>
        <p className="text-gray-600">Войдите в систему для доступа к этой странице.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20">
      <h1 className="text-2xl sm:text-4xl font-bold text-center mb-2">Сервис</h1>
      <p className="text-center text-gray-600 text-sm mb-10">
        Действия с каталогом товаров и Яндекс.Диском (вместо команд в консоли на сервере).
      </p>

      {alert && (
        <div
          className={`mb-6 p-4 rounded-lg text-sm ${
            alert.type === 'success' ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {alert.message}
        </div>
      )}

      <div className="space-y-6">
        <section className="border border-border rounded-xl p-5 md:p-6 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Заполнить SKU из «Кросс коды»</h2>
          <p className="text-sm text-gray-600 mb-4">
            Для файлов в путях …/Кросс коды/… в базе подставляется SKU из имени файла (без расширения), если поле SKU ещё пустое.
            Также дополняется список SKU в свойствах.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('sku', '/api/admin/backfill-sku')}
            className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'sku' ? 'Выполняется…' : 'Заполнить SKU'}
          </button>
        </section>

        <section className="border border-border rounded-xl p-5 md:p-6 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Обновить PNG из Brand/PNG</h2>
          <p className="text-sm text-gray-600 mb-4">
            Скопировать одноимённые файлы из папки <code className="bg-gray-100 px-1 rounded">Brand/PNG</code> в «Кросс коды»
            товаров: заменить плейсхолдеры .txt и перезаписать существующие .png.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('png', '/api/yandex/replace-cross-png')}
            className="px-5 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-medium border-none cursor-pointer hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'png' ? 'Выполняется…' : 'Обновить PNG в кросс-кодах'}
          </button>
        </section>

        <section className="border border-border rounded-xl p-5 md:p-6 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Переиндексация из Яндекс.Диска</h2>
          <p className="text-sm text-gray-600 mb-4">
            Полная пересборка индекса товаров в базе по файлам на Диске. Долго при большом числе файлов.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('reindex', '/api/admin/reindex')}
            className="px-5 py-2.5 rounded-lg border-2 border-border bg-white text-dark text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'reindex' ? 'Выполняется…' : 'Переиндексировать'}
          </button>
        </section>
      </div>
    </div>
  );
}
