'use client';

import { useState, useEffect } from 'react';
import { CustomProperties } from '@/lib/types';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import { useAuth } from '@/components/AuthProvider';
import UploadArea from '@/components/UploadArea';
import UploadProgress from '@/components/UploadProgress';
import Alert from '@/components/Alert';

interface FileUploadEntry {
  file: File;
  properties: Record<string, string>;
}

export default function UploadPage() {
  const { isAuth, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<CustomProperties>({});
  const [files, setFiles] = useState<FileUploadEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [combineInFolder, setCombineInFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [sharedProperties, setSharedProperties] = useState<Record<string, string>>({ 'Тип контента': 'Макет' });

  useEffect(() => {
    fetch('/api/properties')
      .then((r) => r.json())
      .then(setProperties);
  }, []);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles(
      newFiles.map((file) => ({
        file,
        properties: { 'Тип контента': 'Макет' },
      }))
    );
  };

  const updateFileProperty = (index: number, key: string, value: string) => {
    setFiles((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        properties: { ...updated[index].properties, [key]: value },
      };
      return updated;
    });
  };

  const updateSharedProperty = (key: string, value: string) => {
    setSharedProperties((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    // Validate required fields
    const missingFields: string[] = [];

    if (combineInFolder) {
      // Validate shared properties
      if (!sharedProperties['Категория']) {
        missingFields.push('Категория');
      }
      if (!sharedProperties['Подкатегория']) {
        missingFields.push('Подкатегория');
      }
      if (!sharedProperties['Ответственный']) {
        missingFields.push('Ответственный');
      }
      if (!folderName.trim()) {
        missingFields.push('Название папки');
      }
    } else {
      // Validate individual properties for each file
      for (const entry of files) {
        if (!entry.properties['Категория']) {
          missingFields.push(`"${entry.file.name}" - Категория`);
        }
        if (!entry.properties['Подкатегория']) {
          missingFields.push(`"${entry.file.name}" - Подкатегория`);
        }
        if (!entry.properties['Ответственный']) {
          missingFields.push(`"${entry.file.name}" - Ответственный`);
        }
      }
    }

    if (missingFields.length > 0) {
      setAlert({
        type: 'error',
        message: `Заполните обязательные поля:\n${missingFields.slice(0, 3).join('\n')}${
          missingFields.length > 3 ? '\n...' : ''
        }`,
      });
      return;
    }

    setUploading(true);
    setAlert(null);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const entries = files.map((entry) => {
        let props: Record<string, string>;

        if (combineInFolder) {
          // Use shared properties for all files
          props = { ...sharedProperties };
          props['Папка'] = folderName.trim();
        } else {
          // Use individual properties for each file
          props = { ...entry.properties };
        }

        return {
          file: entry.file,
          properties: props,
        };
      });

      const { successCount, errorCount } = await uploadFilesWithProgress(entries, 'Макет', (current, total) => {
        setUploadProgress({ current, total });
      });

      if (errorCount === 0) {
        setAlert({ type: 'success', message: `Загружено файлов: ${successCount}` });
        setFiles([]);
        setCombineInFolder(false);
        setFolderName('');
        setSharedProperties({ 'Тип контента': 'Макет' });
      } else {
        setAlert({ type: 'error', message: `Загружено: ${successCount}, ошибок: ${errorCount}` });
      }
    } catch {
      setAlert({ type: 'error', message: 'Ошибка соединения' });
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
  };

  const [availableProducts, setAvailableProducts] = useState<Array<{ name: string; group: string }>>([]);

  useEffect(() => {
    // Load products list
    fetch('/api/yandex/products')
      .then((r) => r.json())
      .then((productsObj) => {
        // Convert object to array
        const productList = Object.values(productsObj).map((p: any) => ({
          name: p.name,
          group: p.group,
        }));
        setAvailableProducts(productList);
      })
      .catch(() => {
        setAvailableProducts([]);
      });
  }, []);

  const categories = (properties['Категория'] as string[]) || [];
  const subcategories = (properties['Подкатегория'] as Record<string, string[]>) || {};
  const responsibleList = (properties['Ответственный'] as string[]) || [];
  const productGroups = (properties['Группа товаров'] as string[]) || [];

  if (authLoading) {
    return <div className="text-center text-gray-500 py-20 mt-[140px]">Загрузка...</div>;
  }

  if (!isAuth) {
    return (
      <div className="text-center py-20 mt-[140px]">
        <h2 className="text-2xl font-bold mb-4">Загрузить файлы</h2>
        <p className="text-gray-500">Для загрузки файлов необходимо авторизоваться</p>
      </div>
    );
  }

  return (
    <>
      <div className="block mx-auto mt-20 md:mt-[140px] mb-8 md:mb-[50px] text-2xl sm:text-4xl md:text-[55px] font-bold text-center px-4">
        Загрузить файлы
      </div>

      <div className="max-w-[800px] mx-auto px-4 md:px-8">
        {alert && <Alert type={alert.type} message={alert.message} />}

        <div className="mb-6">
          <UploadArea
            onFilesSelected={handleFilesSelected}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            label="Перетащите файлы сюда или нажмите для выбора"
            hint="Поддерживаются изображения, видео и документы"
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold border-b-2 border-primary pb-1">Свойства файлов</h3>

            {files.length > 1 && (
              <div className="p-4 bg-light rounded-lg border border-border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineInFolder}
                    onChange={(e) => setCombineInFolder(e.target.checked)}
                    className="w-5 h-5 accent-primary cursor-pointer"
                  />
                  <span className="font-semibold text-base">Объединить в одну папку</span>
                </label>
                {combineInFolder && (
                  <div className="mt-4">
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Название папки
                    </label>
                    <input
                      type="text"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="Введите название папки"
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Все файлы будут объединены под этой папкой на странице "Все макеты"
                    </p>
                  </div>
                )}
              </div>
            )}

            {combineInFolder ? (
              // Shared properties for all files when combining into folder
              <div className="p-4 bg-light rounded-lg border border-border">
                <div className="font-semibold mb-3">
                  Общие свойства для всех файлов ({files.length} {files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'})
                </div>

                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Категория
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={sharedProperties['Категория'] || ''}
                      onChange={(e) => {
                        updateSharedProperty('Категория', e.target.value);
                        updateSharedProperty('Подкатегория', '');
                      }}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Подкатегория
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={sharedProperties['Подкатегория'] || ''}
                      onChange={(e) => updateSharedProperty('Подкатегория', e.target.value)}
                      disabled={!sharedProperties['Категория']}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {(subcategories[sharedProperties['Категория']] || []).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Ответственный
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={sharedProperties['Ответственный'] || ''}
                      onChange={(e) => updateSharedProperty('Ответственный', e.target.value)}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {responsibleList.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm">Группа товаров</label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={sharedProperties['Группа товаров'] || ''}
                      onChange={(e) => {
                        updateSharedProperty('Группа товаров', e.target.value);
                        updateSharedProperty('Название товара', '');
                      }}
                    >
                      <option value="">-- Выберите --</option>
                      {productGroups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block font-semibold mb-1 text-sm">Товар</label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={sharedProperties['Название товара'] || ''}
                      onChange={(e) => updateSharedProperty('Название товара', e.target.value)}
                      disabled={!sharedProperties['Группа товаров']}
                    >
                      <option value="">-- Выберите товар (опционально) --</option>
                      {availableProducts
                        .filter((p) => p.group === sharedProperties['Группа товаров'])
                        .map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Если выбран товар, макеты появятся на странице товара во вкладке "Макеты"
                    </p>
                  </div>
                </div>

                {/* File list preview */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-sm font-semibold text-gray-600 mb-2">Файлы для загрузки:</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {files.map((entry, index) => (
                      <div key={index} className="text-sm text-gray-600 px-2 py-1 bg-white rounded border border-gray-200">
                        {entry.file.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // Individual properties for each file
              files.map((entry, index) => (
              <div key={index} className="p-4 bg-light rounded-lg border border-border">
                <div className="font-semibold mb-3">{entry.file.name}</div>

                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Категория
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={entry.properties['Категория'] || ''}
                      onChange={(e) => {
                        updateFileProperty(index, 'Категория', e.target.value);
                        // Clear subcategory when category changes
                        updateFileProperty(index, 'Подкатегория', '');
                      }}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Подкатегория
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={entry.properties['Подкатегория'] || ''}
                      onChange={(e) => updateFileProperty(index, 'Подкатегория', e.target.value)}
                      disabled={!entry.properties['Категория']}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {(subcategories[entry.properties['Категория']] || []).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm after:content-['_*'] after:text-danger">
                      Ответственный
                    </label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={entry.properties['Ответственный'] || ''}
                      onChange={(e) => updateFileProperty(index, 'Ответственный', e.target.value)}
                      required
                    >
                      <option value="">-- Выберите --</option>
                      {responsibleList.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-sm">Группа товаров</label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={entry.properties['Группа товаров'] || ''}
                      onChange={(e) => {
                        updateFileProperty(index, 'Группа товаров', e.target.value);
                        // Clear product when group changes
                        updateFileProperty(index, 'Название товара', '');
                      }}
                    >
                      <option value="">-- Выберите --</option>
                      {productGroups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block font-semibold mb-1 text-sm">Товар</label>
                    <select
                      className="w-full p-3 border-2 border-border rounded-lg text-base"
                      value={entry.properties['Название товара'] || ''}
                      onChange={(e) => updateFileProperty(index, 'Название товара', e.target.value)}
                      disabled={!entry.properties['Группа товаров']}
                    >
                      <option value="">-- Выберите товар (опционально) --</option>
                      {availableProducts
                        .filter((p) => p.group === entry.properties['Группа товаров'])
                        .map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Если выбран товар, макет появится на странице товара во вкладке "Макеты"
                    </p>
                  </div>
                </div>
              </div>
              ))
            )}

            {uploading && uploadProgress.total > 0 && (
              <div className="mb-4">
                <UploadProgress
                  current={uploadProgress.current}
                  total={uploadProgress.total}
                  label="Загрузка файлов..."
                />
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading}
              className={`w-full py-4 rounded-[25px] text-white text-base font-semibold border-none cursor-pointer transition-colors ${
                uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {uploading ? 'Загрузка...' : 'Загрузить файлы'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
