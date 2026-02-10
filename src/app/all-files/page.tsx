'use client';

import { useState, useEffect, useRef } from 'react';
import { YandexDiskItem, CustomProperties } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import FilterCloud from '@/components/FilterCloud';
import FileList from '@/components/FileList';
import FilePreview from '@/components/FilePreview';
import ConfirmDialog from '@/components/ConfirmDialog';
import Alert from '@/components/Alert';
import UploadProgress from '@/components/UploadProgress';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { uploadFilesWithProgress } from '@/lib/upload-files';

function AllFilesContent() {
  const { isAuth, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [allFiles, setAllFiles] = useState<YandexDiskItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<YandexDiskItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<YandexDiskItem | null>(null);
  const [properties, setProperties] = useState<CustomProperties>({});
  const [loading, setLoading] = useState(true);

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
    // Initialize filters from URL params
    const cat = searchParams.get('category');
    const sub = searchParams.get('subcategory');
    if (cat) setFilterCategory([cat]);
    if (sub) setFilterSubcategory([sub]);
  }, [searchParams]);

  const loadFiles = () => {
    Promise.all([
      fetch('/api/yandex/files').then((r) => r.json()),
      fetch('/api/properties').then((r) => r.json()),
    ]).then(([files, props]) => {
      setAllFiles(files);
      setProperties(props);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Clear subcategory filters when category changes
  useEffect(() => {
    if (filterCategory.length === 0) {
      // No category selected, clear subcategories
      if (filterSubcategory.length > 0) {
        setFilterSubcategory([]);
      }
    } else {
      // Check if selected subcategory is still valid for the selected category
      const validSubcats = subcategoriesObj[filterCategory[0]] || [];
      if (filterSubcategory.length > 0 && !validSubcats.includes(filterSubcategory[0])) {
        setFilterSubcategory([]);
      }
    }
  }, [filterCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let filtered = allFiles;

    // Only show "Макет" content type
    filtered = filtered.filter((f) => {
      const ct = f.custom_properties?.['Тип контента'] || '';
      return ct === 'Макет' || ct === '';
    });

    if (filterCategory.length > 0) {
      filtered = filtered.filter((f) => {
        const cat = f.custom_properties?.['Категория'] || '';
        return filterCategory.includes(cat);
      });
    }

    if (filterSubcategory.length > 0) {
      filtered = filtered.filter((f) => {
        const sub = f.custom_properties?.['Подкатегория'] || '';
        return filterSubcategory.includes(sub);
      });
    }

    if (filterResponsible.length > 0) {
      filtered = filtered.filter((f) => {
        const resp = f.custom_properties?.['Ответственный'] || '';
        return filterResponsible.includes(resp);
      });
    }

    if (filterProductGroup.length > 0) {
      filtered = filtered.filter((f) => {
        const pg = f.custom_properties?.['Группа товаров'] || '';
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
      // Get properties from the first file in the folder
      const sampleFile = folderFiles[0];
      const baseProperties = sampleFile.custom_properties || {};

      // Create entries with the same properties + folder name
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
        loadFiles(); // Reload files
      } else {
        setAlert({ type: 'error', message: `Загружено: ${successCount}, ошибок: ${errorCount}` });
        loadFiles(); // Reload files even if there were errors
      }
    } catch {
      setAlert({ type: 'error', message: 'Ошибка соединения' });
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      setCurrentUploadFolder(null);
    }
  };

  const categories = (properties['Категория'] as string[]) || [];
  const subcategoriesObj = (properties['Подкатегория'] as Record<string, string[]>) || {};
  const responsibleList = (properties['Ответственный'] as string[]) || [];
  const productGroups = (properties['Группа товаров'] as string[]) || [];

  // Get subcategories only for selected category (single selection)
  const availableSubcategories = filterCategory.length > 0
    ? (subcategoriesObj[filterCategory[0]] || [])
    : [];

  if (authLoading) {
    return <div className="text-center text-gray-500 py-20 mt-[140px]">Загрузка...</div>;
  }

  if (!isAuth) {
    return (
      <div className="text-center py-20 mt-[140px]">
        <h2 className="text-2xl font-bold mb-4">Все макеты</h2>
        <p className="text-gray-500">Для просмотра макетов необходимо авторизоваться</p>
      </div>
    );
  }

  return (
    <>
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

          // Find folder files to get properties
          const filesWithFolder: Record<string, YandexDiskItem[]> = {};
          for (const file of filteredFiles) {
            const folderName = file.custom_properties?.['Папка'];
            if (folderName) {
              if (!filesWithFolder[folderName]) {
                filesWithFolder[folderName] = [];
              }
              filesWithFolder[folderName].push(file);
            }
          }

          const folderFiles = filesWithFolder[currentUploadFolder] || [];
          if (folderFiles.length > 0) {
            handleUploadToFolder(currentUploadFolder, files, folderFiles);
          }
        }}
      />

      <div className="block mx-auto mt-20 md:mt-[140px] mb-8 md:mb-[50px] text-2xl sm:text-4xl md:text-[55px] font-bold text-center px-4">
        Все макеты
      </div>

      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        {alert && <Alert type={alert.type} message={alert.message} />}

        {loading ? (
          <div className="text-center text-gray-500 py-20">Загрузка...</div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-6">
              <FilterCloud
                title="Категория"
                values={categories}
                selectedValues={filterCategory}
                onChange={setFilterCategory}
                singleSelect
              />
              {filterCategory.length > 0 && availableSubcategories.length > 0 && (
                <FilterCloud
                  title="Подкатегория"
                  values={availableSubcategories}
                  selectedValues={filterSubcategory}
                  onChange={setFilterSubcategory}
                  singleSelect
                />
              )}
              {isAuth && (
                <FilterCloud
                  title="Ответственный"
                  values={responsibleList}
                  selectedValues={filterResponsible}
                  onChange={setFilterResponsible}
                  singleSelect
                />
              )}
              <FilterCloud
                title="Группа товаров"
                values={productGroups}
                selectedValues={filterProductGroup}
                onChange={setFilterProductGroup}
                singleSelect
              />
            </div>

            <div className="text-sm text-gray-500 mb-4">
              Найдено: {filteredFiles.length} файлов
            </div>

            {/* File list + preview */}
            <div className="flex gap-5 max-md:flex-col">
              <div className="w-full md:w-[55%] overflow-y-auto h-[400px] md:h-[600px] border border-border p-3 md:p-4 rounded-lg bg-white">
                {(() => {
                  // Group files by folder
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
                    <>
                      {/* Grouped files by folder */}
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

                      {/* Files without folder */}
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

                      {/* No files at all */}
                      {filteredFiles.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                          <h3 className="text-dark mb-2">Макеты не найдены</h3>
                          <p>Попробуйте изменить параметры фильтров</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="w-full md:w-[45%] md:sticky md:top-4">
                <FilePreview file={selectedFile} />
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Подтверждение удаления"
        message={`Вы уверены, что хотите удалить файл "${deleteTarget?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default function AllFilesPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-500 py-20">Загрузка...</div>}>
      <AllFilesContent />
    </Suspense>
  );
}
