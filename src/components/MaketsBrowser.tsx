'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { YandexDiskItem } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import FileList from '@/components/FileList';
import FilePreview from '@/components/FilePreview';
import ConfirmDialog from '@/components/ConfirmDialog';
import Alert from '@/components/Alert';
import UploadProgress from '@/components/UploadProgress';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import { isUnderProductsRoot } from '@/lib/product-paths';

export default function MaketsBrowser({ selectedCategory = '' }: { selectedCategory?: string }) {
  const { isAuth } = useAuth();
  const [allFiles, setAllFiles] = useState<YandexDiskItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<YandexDiskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [currentUploadFolder, setCurrentUploadFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = () => {
    setLoading(true);
    setAlert(null);

    const readJsonError = async (res: Response) => {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j && typeof j.error === 'string') return j.error;
      } catch {
        /* ignore */
      }
      return text.trim() || `HTTP ${res.status}`;
    };

    (async () => {
      const r = await fetch('/api/yandex/files');
      if (!r.ok) throw new Error(await readJsonError(r));
      const data: unknown = await r.json();
      return Array.isArray(data) ? data : [];
    })()
      .then((files) => {
        setAllFiles(files);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('loadFiles', err);
        const msg =
          err instanceof TypeError
            ? 'Не удалось связаться с сервером. Проверьте сеть, адрес сайта и что приложение запущено.'
            : err instanceof Error
              ? err.message
              : String(err);
        setAlert({ type: 'error', message: msg });
        setAllFiles([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const filteredFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const ct = f.custom_properties?.['Тип контента'] || '';
      if (!(ct === 'Макет' || ct === '')) return false;
      if (isUnderProductsRoot(f.path)) return false;
      if (selectedCategory) {
        const cat = (f.custom_properties?.['Категория'] || '').trim();
        if (cat !== selectedCategory) return false;
      }
      return true;
    });
  }, [allFiles, selectedCategory]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/yandex/delete?path=${encodeURIComponent(deleteTarget.path)}`, { method: 'DELETE' });

    if (res.ok) {
      setAlert({ type: 'success', message: `Файл "${deleteTarget.name}" удален` });
      setAllFiles((prev) => prev.filter((f) => f.path !== deleteTarget.path));
      if (selectedFile?.path === deleteTarget.path) setSelectedFile(null);
    } else {
      setAlert({ type: 'error', message: 'Ошибка удаления' });
    }
    setDeleteTarget(null);
  };

  const handleUploadToFolder = async (folderName: string, files: File[], folderFiles: YandexDiskItem[]) => {
    if (files.length === 0 || folderFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const sampleFile = folderFiles[0];
      const baseProperties = sampleFile.custom_properties || {};

      const entries = files.map((file) => ({
        file,
        properties: {
          'Тип контента': baseProperties['Тип контента'] || 'Макет',
          'Категория': baseProperties['Категория'] || '',
          'Подкатегория': baseProperties['Подкатегория'] || '',
          'Ответственный': baseProperties['Ответственный'] || '',
          'Группа товаров': baseProperties['Группа товаров'] || '',
          'Название товара': baseProperties['Название товара'] || '',
          'Папка': folderName,
        },
      }));

      const { successCount, errorCount } = await uploadFilesWithProgress(entries, 'Макет', (current, total) => {
        setUploadProgress({ current, total });
      });

      if (errorCount === 0) {
        setAlert({ type: 'success', message: `Загружено файлов: ${successCount}` });
        loadFiles();
      } else {
        setAlert({ type: 'error', message: `Загружено: ${successCount}, ошибок: ${errorCount}` });
        loadFiles();
      }
    } catch {
      setAlert({ type: 'error', message: 'Ошибка соединения' });
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      setCurrentUploadFolder(null);
    }
  };

  const filesWithFolder: Record<string, YandexDiskItem[]> = {};
  const filesWithoutFolder: YandexDiskItem[] = [];

  for (const file of filteredFiles) {
    const folderName = file.custom_properties?.['Папка'];
    if (folderName) {
      if (!filesWithFolder[folderName]) {
        filesWithFolder[folderName] = [];
      }
      filesWithFolder[folderName].push(file);
    } else {
      filesWithoutFolder.push(file);
    }
  }

  const folderNames = Object.keys(filesWithFolder).sort();
  const hasFolders = folderNames.length > 0;

  return (
    <div id="makets" className="scroll-mt-24 md:scroll-mt-[140px] mb-10">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const fileList = e.target.files;
          if (!fileList?.length || !currentUploadFolder) {
            e.target.value = '';
            return;
          }
          const files = Array.from(fileList);
          e.target.value = '';

          const grouped: Record<string, YandexDiskItem[]> = {};
          for (const file of filteredFiles) {
            const folderName = file.custom_properties?.['Папка'];
            if (folderName) {
              if (!grouped[folderName]) grouped[folderName] = [];
              grouped[folderName].push(file);
            }
          }

          const folderFiles = grouped[currentUploadFolder] || [];
          if (folderFiles.length > 0) {
            handleUploadToFolder(currentUploadFolder, files, folderFiles);
          }
        }}
      />

      {alert && <Alert type={alert.type} message={alert.message} />}

      {loading ? (
        <div className="text-center text-gray-500 py-10">Загрузка макетов...</div>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-4">
            Найдено: {filteredFiles.length} файлов
          </div>

          <div className="flex gap-5 max-md:flex-col">
            <div className="w-full md:w-[55%] overflow-y-auto h-[400px] md:h-[600px] border border-border p-3 md:p-4 rounded-lg bg-white">
              {hasFolders && (
                <div className="space-y-4 mb-6">
                  {folderNames.map((folderName) => {
                    const folderFiles = filesWithFolder[folderName];
                    const isExpanded = expandedFolders.has(folderName);
                    return (
                      <div key={folderName} className="border border-border rounded-lg overflow-hidden bg-white">
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            setExpandedFolders((prev) => {
                              const next = new Set(prev);
                              if (next.has(folderName)) {
                                next.delete(folderName);
                              } else {
                                next.add(folderName);
                              }
                              return next;
                            });
                          }}
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-lg mb-1">
                              📁 {folderName}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {folderFiles.length} {folderFiles.length === 1 ? 'файл' : 'файлов'}
                            </div>
                          </div>
                          <div className="text-2xl text-gray-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border">
                            {isAuth && (
                              <div className="p-4 border-b border-border bg-gray-50">
                                <button
                                  onClick={() => {
                                    setCurrentUploadFolder(folderName);
                                    fileInputRef.current?.click();
                                  }}
                                  disabled={uploading}
                                  className="px-4 py-2 rounded-lg cursor-pointer text-sm bg-primary text-white border-none hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {uploading && currentUploadFolder === folderName ? 'Загрузка...' : 'Добавить файлы в папку'}
                                </button>
                                {uploading && currentUploadFolder === folderName && uploadProgress.total > 0 && (
                                  <div className="mt-3">
                                    <UploadProgress
                                      current={uploadProgress.current}
                                      total={uploadProgress.total}
                                      label="Загрузка файлов..."
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            <FileList
                              files={folderFiles}
                              onSelectFile={setSelectedFile}
                              selectedPath={selectedFile?.path}
                              onDelete={isAuth ? (path, name) => setDeleteTarget({ path, name }) : undefined}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {filesWithoutFolder.length > 0 && (
                <>
                  {hasFolders && (
                    <div className="text-sm font-semibold text-gray-600 mb-3 pb-2 border-b border-border">
                      Файлы без папки
                    </div>
                  )}
                  <FileList
                    files={filesWithoutFolder}
                    onSelectFile={setSelectedFile}
                    selectedPath={selectedFile?.path}
                    onDelete={isAuth ? (path, name) => setDeleteTarget({ path, name }) : undefined}
                  />
                </>
              )}

              {filteredFiles.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  <h3 className="text-dark mb-2">Макеты не найдены</h3>
                  <p>Попробуйте изменить параметры фильтров</p>
                </div>
              )}
            </div>
            <div className="w-full md:w-[45%] md:sticky md:top-4">
              <FilePreview file={selectedFile} />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Подтверждение удаления"
        message={`Вы уверены, что хотите удалить файл "${deleteTarget?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
