'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { CustomProperties, YandexDiskItem } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import FilterCloud from '@/components/FilterCloud';
import FileList from '@/components/FileList';
import FilePreview from '@/components/FilePreview';
import ConfirmDialog from '@/components/ConfirmDialog';
import Alert from '@/components/Alert';
import UploadProgress from '@/components/UploadProgress';
import { useSearchParams } from 'next/navigation';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import { isUnderProductsRoot } from '@/lib/product-paths';

export default function MaketsBrowser() {
  const { isAuth } = useAuth();
  const searchParams = useSearchParams();
  const [allFiles, setAllFiles] = useState<YandexDiskItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<YandexDiskItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<YandexDiskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [propertyCategories, setPropertyCategories] = useState<string[]>([]);
  const [propertySubcategories, setPropertySubcategories] = useState<Record<string, string[]>>({});

  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState<string[]>([]);
  const [filterProductGroup, setFilterProductGroup] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [currentUploadFolder, setCurrentUploadFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cat = searchParams.get('category');
    const sub = searchParams.get('subcategory');
    if (cat) setFilterCategory([cat]);
    if (sub) setFilterSubcategory([sub]);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/properties')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: CustomProperties) => {
        setPropertyCategories((data['Категория'] as string[]) || []);
        setPropertySubcategories((data['Подкатегория'] as Record<string, string[]>) || {});
      })
      .catch(() => {
        setPropertyCategories([]);
        setPropertySubcategories({});
      });
  }, []);

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

  useEffect(() => {
    if (filterCategory.length === 0 && filterSubcategory.length > 0) {
      setFilterSubcategory([]);
    }
  }, [filterCategory, filterSubcategory.length]);

  const maketFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const ct = f.custom_properties?.['Тип контента'] || '';
      if (!(ct === 'Макет' || ct === '')) return false;
      return !isUnderProductsRoot(f.path);
    });
  }, [allFiles]);

  const categoriesWithFiles = useMemo(() => {
    const s = new Set<string>();
    for (const f of maketFiles) {
      const v = (f.custom_properties?.['Категория'] || '').trim();
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [maketFiles]);

  const categoryValues = propertyCategories.length > 0 ? propertyCategories : categoriesWithFiles;

  const subcategoriesWithFiles = useMemo(() => {
    if (filterCategory.length === 0) return [];
    const cat = filterCategory[0];
    const s = new Set<string>();
    for (const f of maketFiles) {
      if ((f.custom_properties?.['Категория'] || '').trim() !== cat) continue;
      const v = (f.custom_properties?.['Подкатегория'] || '').trim();
      if (v) s.add(v);
    }
    const fromProps = propertySubcategories[cat] || [];
    for (const v of fromProps) {
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [maketFiles, filterCategory, propertySubcategories]);

  const filesAfterCategorySub = useMemo(() => {
    let list = maketFiles;
    if (filterCategory.length > 0) {
      const c = filterCategory[0];
      list = list.filter((f) => (f.custom_properties?.['Категория'] || '').trim() === c);
    }
    if (filterSubcategory.length > 0) {
      const sub = filterSubcategory[0];
      list = list.filter((f) => (f.custom_properties?.['Подкатегория'] || '').trim() === sub);
    }
    return list;
  }, [maketFiles, filterCategory, filterSubcategory]);

  const responsibleWithFiles = useMemo(() => {
    const s = new Set<string>();
    for (const f of filesAfterCategorySub) {
      const v = (f.custom_properties?.['Ответственный'] || '').trim();
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [filesAfterCategorySub]);

  const filesAfterResponsible = useMemo(() => {
    let list = filesAfterCategorySub;
    if (filterResponsible.length > 0) {
      const r = filterResponsible[0];
      list = list.filter((f) => (f.custom_properties?.['Ответственный'] || '').trim() === r);
    }
    return list;
  }, [filesAfterCategorySub, filterResponsible]);

  const productGroupsWithFiles = useMemo(() => {
    const s = new Set<string>();
    for (const f of filesAfterResponsible) {
      const v = (f.custom_properties?.['Группа товаров'] || '').trim();
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [filesAfterResponsible]);

  useEffect(() => {
    if (loading) return;
    if (filterSubcategory.length > 0 && filterCategory.length > 0) {
      if (!subcategoriesWithFiles.includes(filterSubcategory[0])) {
        setFilterSubcategory([]);
      }
    }
  }, [loading, subcategoriesWithFiles, filterSubcategory, filterCategory]);

  useEffect(() => {
    if (loading) return;
    if (filterResponsible.length > 0 && !responsibleWithFiles.includes(filterResponsible[0])) {
      setFilterResponsible([]);
    }
  }, [loading, responsibleWithFiles, filterResponsible]);

  useEffect(() => {
    if (loading) return;
    if (filterProductGroup.length > 0 && !productGroupsWithFiles.includes(filterProductGroup[0])) {
      setFilterProductGroup([]);
    }
  }, [loading, productGroupsWithFiles, filterProductGroup]);

  useEffect(() => {
    let filtered = allFiles;

    filtered = filtered.filter((f) => {
      const ct = f.custom_properties?.['Тип контента'] || '';
      return ct === 'Макет' || ct === '';
    });

    filtered = filtered.filter((f) => !isUnderProductsRoot(f.path));

    if (filterCategory.length > 0) {
      filtered = filtered.filter((f) => {
        const cat = (f.custom_properties?.['Категория'] || '').trim();
        return filterCategory.includes(cat);
      });
    }

    if (filterSubcategory.length > 0) {
      filtered = filtered.filter((f) => {
        const sub = (f.custom_properties?.['Подкатегория'] || '').trim();
        return filterSubcategory.includes(sub);
      });
    }

    if (filterResponsible.length > 0) {
      filtered = filtered.filter((f) => {
        const resp = (f.custom_properties?.['Ответственный'] || '').trim();
        return filterResponsible.includes(resp);
      });
    }

    if (filterProductGroup.length > 0) {
      filtered = filtered.filter((f) => {
        const pg = (f.custom_properties?.['Группа товаров'] || '').trim();
        return filterProductGroup.includes(pg);
      });
    }

    setFilteredFiles(filtered);
  }, [allFiles, filterCategory, filterSubcategory, filterResponsible, filterProductGroup]);

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

      <div className="mb-6">
        <FilterCloud
          title="Категория"
          values={categoryValues}
          selectedValues={filterCategory}
          onChange={setFilterCategory}
          singleSelect
        />
        {filterCategory.length > 0 && subcategoriesWithFiles.length > 0 && (
          <FilterCloud
            title="Подкатегория"
            values={subcategoriesWithFiles}
            selectedValues={filterSubcategory}
            onChange={setFilterSubcategory}
            singleSelect
          />
        )}
        {isAuth && (
          <FilterCloud
            title="Ответственный"
            values={responsibleWithFiles}
            selectedValues={filterResponsible}
            onChange={setFilterResponsible}
            singleSelect
          />
        )}
        <FilterCloud
          title="Группа товаров"
          values={productGroupsWithFiles}
          selectedValues={filterProductGroup}
          onChange={setFilterProductGroup}
          singleSelect
        />
      </div>

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
