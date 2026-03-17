'use client';

import { useState, useEffect } from 'react';
import { CustomProperties } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { uploadFilesWithProgress, UploadFileEntry } from '@/lib/upload-files';
import UploadProgress from '@/components/UploadProgress';
import Alert from '@/components/Alert';

interface SkuRow {
  sku: string;
  pngFile: File | null;
}

export default function UploadProductPage() {
  const { isAuth, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<CustomProperties>({});
  const [productName, setProductName] = useState('');
  const [productGroup, setProductGroup] = useState('');
  const [skuRows, setSkuRows] = useState<SkuRow[]>([{ sku: '', pngFile: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/properties')
      .then((r) => r.json())
      .then(setProperties);
  }, []);

  const addSkuRow = () => setSkuRows((prev) => [...prev, { sku: '', pngFile: null }]);

  const removeSkuRow = (index: number) => {
    if (skuRows.length <= 1) return;
    setSkuRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSku = (index: number, value: string) => {
    setSkuRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], sku: value };
      return updated;
    });
  };

  const updatePngFile = (index: number, file: File | null) => {
    setSkuRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], pngFile: file };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim() || !productGroup || skuRows.every((r) => !r.sku.trim())) {
      setAlert({ type: 'error', message: 'Заполните все обязательные поля' });
      return;
    }

    setSubmitting(true);
    setAlert(null);

    try {
      // Register product name via properties API
      await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_type: 'Название товара', property_value: productName.trim() }),
      });

      // Register SKUs via properties API
      for (const row of skuRows) {
        if (row.sku.trim()) {
          await fetch('/api/properties', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_type: 'SKU', property_value: row.sku.trim() }),
          });
        }
      }

      // Create all product folders on Yandex Disk: Товары/Группа/Товар + Фото, Видео, Документ, Кросс коды, Этикетки
      const foldersRes = await fetch('/api/yandex/product-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: productName.trim(), productGroup: productGroup || '' }),
      });
      if (!foldersRes.ok) {
        const err = await foldersRes.json().catch(() => ({}));
        setAlert({ type: 'error', message: err.error || 'Ошибка создания папок на диске' });
        setSubmitting(false);
        return;
      }

      // Upload Кросс коды files if provided
      const entries: UploadFileEntry[] = [];
      const baseProps = {
        'Название товара': productName.trim(),
        'Группа товаров': productGroup,
      };

      for (const row of skuRows) {
        if (row.pngFile && row.sku.trim()) {
          entries.push({
            file: row.pngFile,
            properties: { ...baseProps, SKU: row.sku.trim(), 'Тип файла': 'Кросс коды' },
          });
        }
      }

      if (entries.length > 0) {
        setUploadProgress({ current: 0, total: entries.length });
        const skus = skuRows.map((r) => r.sku.trim()).filter(Boolean);
        const { successCount, errorCount } = await uploadFilesWithProgress(
          entries,
          'Товар',
          (current, total) => setUploadProgress({ current, total }),
          { productName: productName.trim(), productGroup: productGroup || '', productSkus: skus },
        );

        if (errorCount > 0) {
          setAlert({
            type: 'error',
            message: `Товар создан, но загружено Кросс коды: ${successCount}, ошибок: ${errorCount}`,
          });
        } else {
          setAlert({
            type: 'success',
            message: `Товар "${productName}" успешно создан! Загружено файлов Кросс коды: ${successCount}. Загрузите остальные файлы на странице товара.`,
          });
        }
      } else {
        setAlert({
          type: 'success',
          message: `Товар "${productName}" успешно создан! Теперь перейдите на страницу товара для загрузки файлов.`,
        });
      }

      // Reset form
      setProductName('');
      setProductGroup('');
      setSkuRows([{ sku: '', pngFile: null }]);
      setUploadProgress({ current: 0, total: 0 });
    } catch {
      setAlert({ type: 'error', message: 'Ошибка создания товара' });
    }

    setSubmitting(false);
  };

  const productGroups = (properties['Группа товаров'] as string[]) || [];

  if (authLoading) {
    return <div className="text-center text-gray-500 py-20 mt-[140px]">Загрузка...</div>;
  }

  if (!isAuth) {
    return (
      <div className="text-center py-20 mt-[140px]">
        <h2 className="text-2xl font-bold mb-4">Добавить товар</h2>
        <p className="text-gray-500">Для добавления товара необходимо авторизоваться</p>
      </div>
    );
  }

  return (
    <>
      <div className="block mx-auto mt-20 md:mt-[140px] mb-8 md:mb-[50px] text-2xl sm:text-4xl md:text-[55px] font-bold text-center px-4">
        Добавить товар
      </div>

      <div className="max-w-[800px] mx-auto px-4 md:px-8">
        {alert && <Alert type={alert.type} message={alert.message} />}

        <form onSubmit={handleSubmit}>
          <h3 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-primary pb-1">
            Основная информация
          </h3>

          <div className="mb-6">
            <label className="block font-semibold mb-2 text-base after:content-['_*'] after:text-danger">
              Название товара
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Введите название товара"
              required
              className="w-full p-3 border-2 border-border rounded-lg text-base outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(157,161,168,0.1)] box-border"
            />
          </div>

          <div className="mb-6">
            <label className="block font-semibold mb-2 text-base after:content-['_*'] after:text-danger">
              Группа товаров
            </label>
            <select
              value={productGroup}
              onChange={(e) => setProductGroup(e.target.value)}
              required
              className="w-full p-3 border-2 border-border rounded-lg text-base outline-none transition-all focus:border-primary box-border"
            >
              <option value="">-- Выберите группу товаров --</option>
              {productGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <h3 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-primary pb-1">
            SKU товара
            <span className="bg-primary text-white px-2 py-0.5 rounded-full text-xs ml-2.5">
              {skuRows.length}
            </span>
          </h3>

          <div>
            {skuRows.map((row, index) => (
              <div
                key={index}
                className="flex gap-4 mb-4 items-end p-4 bg-light rounded-lg border border-border max-md:flex-col max-md:items-stretch"
              >
                <div className="flex-1">
                  <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={row.sku}
                    onChange={(e) => updateSku(index, e.target.value)}
                    placeholder="Введите артикул товара"
                    required
                    className="w-full p-3 border-2 border-border rounded-lg text-base outline-none focus:border-primary box-border"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-sm">Кросс коды (файл)</label>
                  <label
                    className={`block p-3 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all font-medium text-sm ${
                      row.pngFile
                        ? 'border-success bg-green-50 text-success'
                        : 'border-border bg-white hover:border-primary hover:bg-blue-50'
                    }`}
                  >
                    {row.pngFile ? row.pngFile.name : 'Выбрать файл'}
                    <input
                      type="file"
                      accept=".png,image/png"
                      className="hidden"
                      onChange={(e) => updatePngFile(index, e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                {skuRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSkuRow(index)}
                    className="bg-danger text-white border-none px-3 py-1.5 rounded-md cursor-pointer text-xs font-semibold"
                  >
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSkuRow}
            className="bg-success text-white border-none px-5 py-2.5 rounded-lg cursor-pointer text-sm font-semibold mt-2"
          >
            + Добавить еще SKU
          </button>

          <div className="mt-8 mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">📝 Следующий шаг: Загрузка файлов</h3>
            <p className="text-sm text-gray-700 mb-2">
              После создания товара вы сможете загрузить остальные файлы на странице товара:
            </p>
            <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
              <li>Дополнительные фото</li>
              <li>Видео</li>
              <li>Документы</li>
            </ul>
            <p className="text-sm text-gray-700 mt-2">
              <strong>💡 Главное фото:</strong> Выберите главное фото из загруженных, нажав ⭐ на нужном изображении.
            </p>
          </div>

          {submitting && uploadProgress.total > 0 && (
            <div className="mt-5">
              <UploadProgress
                current={uploadProgress.current}
                total={uploadProgress.total}
                label="Загрузка файлов Кросс коды..."
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-4 rounded-[25px] text-white text-base font-semibold border-none cursor-pointer transition-colors mt-5 ${
              submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            {submitting ? 'Создание товара...' : 'Создать товар'}
          </button>
        </form>
      </div>
    </>
  );
}
