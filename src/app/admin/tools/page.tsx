'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { postReindexAndPoll } from '@/lib/admin-reindex-client';

type ActionId = 'sku' | 'png' | 'reindex' | 'content' | 'deleteFotos';

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

  /** Импорт фото из Контент 2.0/1. Фото → …/Товары/…/Фото */
  const runContentImport = async (dryRun: boolean) => {
    setBusy('content');
    setAlert(null);
    try {
      const res = await fetch('/api/admin/import-content-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlert({
          type: 'error',
          message: typeof data.error === 'string' ? data.error : data.message || `HTTP ${res.status}`,
        });
        return;
      }
      const u = Number(data.unmatched?.length) || 0;
      const a = Number(data.ambiguous?.length) || 0;
      const tail =
        u + a > 0
          ? ` Не сопоставлено: ${u}, спорных (два товара с близким баллом): ${a}. Список в ответе API (unmatched / ambiguous).`
          : '';
      setAlert({
        type: data.errors?.length ? 'error' : 'success',
        message: `${data.message || 'Готово'}${tail}`,
      });
    } catch (e) {
      setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Ошибка сети' });
    } finally {
      setBusy(null);
    }
  };

  /** Удалить все файлы в Товары/…/Фото (не сами папки) */
  const runDeleteProductFotos = async (execute: boolean) => {
    setBusy('deleteFotos');
    setAlert(null);
    try {
      const res = await fetch('/api/admin/delete-product-fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute ? { execute: true } : { dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlert({
          type: 'error',
          message: typeof data.error === 'string' ? data.error : data.message || `HTTP ${res.status}`,
        });
        return;
      }
      setAlert({
        type: data.errors?.length ? 'error' : 'success',
        message:
          typeof data.message === 'string'
            ? `${data.message}. Папок «Фото»: ${data.fotoFolders ?? '?'}.`
            : JSON.stringify(data),
      });
    } catch (e) {
      setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Ошибка сети' });
    } finally {
      setBusy(null);
    }
  };

  const runReindex = async () => {
    setBusy('reindex');
    setAlert(null);
    try {
      const r = await postReindexAndPoll();
      setAlert({
        type: r.ok ? 'success' : 'error',
        message: r.message,
      });
    } catch (e) {
      setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Ошибка' });
    } finally {
      setBusy(null);
    }
  };

  /** PNG: цепочка запросов — по 10 папок «Кросс коды» за раз, пока не обработаны все */
  const runPngBatches = async () => {
    setBusy('png');
    setAlert(null);
    let offset = 0;
    let sumReplaced = 0;
    let sumPng = 0;
    let sumSkipped = 0;
    const errSamples: string[] = [];
    try {
      let hasMore = true;
      while (hasMore) {
        const res = await fetch('/api/yandex/replace-cross-png', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAlert({
            type: 'error',
            message: typeof data.error === 'string' ? data.error : data.message || `HTTP ${res.status}`,
          });
          return;
        }
        sumReplaced += Number(data.replaced) || 0;
        sumPng += Number(data.pngUpdated) || 0;
        sumSkipped += Number(data.skippedNoPng) || 0;
        if (Array.isArray(data.errors)) {
          for (const e of data.errors as string[]) {
            if (errSamples.length < 15) errSamples.push(e);
          }
        }
        hasMore = Boolean(data.hasMore);
        offset = Number(data.nextOffset) || 0;
        const lo = Number(data.offset);
        const hi = Number(data.nextOffset);
        const tot = Number(data.totalCrossFolders);
        setAlert({
          type: 'success',
          message: `Партия папок «Кросс коды»: ${Number.isFinite(lo) && Number.isFinite(hi) ? `${lo + 1}–${hi}` : '—'} из ${Number.isFinite(tot) ? tot : '?'}. Накоплено: txt→png ${sumReplaced}, PNG ${sumPng}, пропусков ${sumSkipped}.${hasMore ? ' Дальше…' : ''}`,
        });
      }
      if (errSamples.length) {
        setAlert({
          type: 'error',
          message: `Завершено с ошибками (фрагмент): ${errSamples.join('; ')}. Итого txt→png ${sumReplaced}, PNG ${sumPng}, пропусков ${sumSkipped}.`,
        });
      } else {
        setAlert({
          type: 'success',
          message: `Готово, все партии. Итого txt→png ${sumReplaced}, обновлено PNG ${sumPng}, пропусков ${sumSkipped}.`,
        });
      }
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
          <h2 className="text-lg font-semibold mb-2">Импорт фото из «1. Фото»</h2>
          <p className="text-sm text-gray-600 mb-4">
            Копирование <code className="bg-gray-100 px-1 rounded">.png / .jpg / .jpeg / .webp</code> из{' '}
            <code className="bg-gray-100 px-1 rounded">Brand/1. Фото</code> в{' '}
            <code className="bg-gray-100 px-1 rounded">Товары/…/Фото</code>. Сопоставление только по имени файла и SKU из базы
            (транслит, расстояние Левенштейна). Если два кандидата с близким баллом — файл попадает в «спорные» и не копируется.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runContentImport(true)}
              className="px-5 py-2.5 rounded-lg border-2 border-border bg-white text-dark text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'content' ? 'Выполняется…' : 'Пробный прогон (dry-run)'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runContentImport(false)}
              className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'content' ? 'Выполняется…' : 'Импортировать в папки Фото'}
            </button>
          </div>
        </section>

        <section className="border border-border rounded-xl p-5 md:p-6 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Обновить PNG из Brand/PNG</h2>
          <p className="text-sm text-gray-600 mb-4">
            Скопировать одноимённые файлы из папки <code className="bg-gray-100 px-1 rounded">Brand/PNG</code> в «Кросс коды»
            товаров: заменить плейсхолдеры .txt и перезаписать существующие .png. Обработка идёт <strong>партиями по 10 товаров</strong> (папок
            «Кросс коды») за запрос к серверу, кнопка сама вызывает следующие партии до конца списка.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runPngBatches()}
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
            onClick={() => runReindex()}
            className="px-5 py-2.5 rounded-lg border-2 border-border bg-white text-dark text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'reindex' ? 'Выполняется…' : 'Переиндексировать'}
          </button>
        </section>

        <section className="border border-red-200 rounded-xl p-5 md:p-6 bg-red-50/50 shadow-sm">
          <h2 className="text-lg font-semibold mb-2 text-red-900">Удалить все файлы в папках «Фото» товаров</h2>
          <p className="text-sm text-gray-700 mb-4">
            На Яндекс.Диске в каждой папке <code className="bg-white px-1 rounded border">Brand/Товары/…/…/Фото</code> будут
            удалены <strong>все файлы</strong> (сами папки «Фото» остаются). Сначала нажмите пробный подсчёт.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runDeleteProductFotos(false)}
              className="px-5 py-2.5 rounded-lg border-2 border-border bg-white text-dark text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'deleteFotos' ? 'Выполняется…' : 'Сколько файлов (dry-run)'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (typeof window !== 'undefined' && !window.confirm('Удалить все файлы во всех папках «Фото» товаров на Диске?')) {
                  return;
                }
                runDeleteProductFotos(true);
              }}
              className="px-5 py-2.5 rounded-lg bg-red-700 text-white text-sm font-medium border-none cursor-pointer hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'deleteFotos' ? 'Выполняется…' : 'Удалить безвозвратно'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
