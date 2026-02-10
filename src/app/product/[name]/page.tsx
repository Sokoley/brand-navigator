'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { YandexDiskItem } from '@/lib/types';
import { getPreviewProxyUrl, formatFileSize, formatDate, PROPERTY_COLORS, PROPERTY_DISPLAY_ORDER } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import FilePreview from '@/components/FilePreview';
import UploadProgress from '@/components/UploadProgress';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function getFileTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'Изображение';
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv'].includes(ext)) return 'Видео';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'Документ';
  return '';
}

export default function ProductDetailPage({ params }: { params: { name: string } }) {
  const { isAuth } = useAuth();
  const productName = decodeURIComponent(params.name);
  const [allFiles, setAllFiles] = useState<YandexDiskItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<YandexDiskItem[]>([]);
  const [fileTypes, setFileTypes] = useState<string[]>([]);
  const [availableFileTypes, setAvailableFileTypes] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<YandexDiskItem | null>(null);
  const [productGroup, setProductGroup] = useState('');
  const [productSkus, setProductSkus] = useState<string[]>([]);
  const [mainPhotoPreview, setMainPhotoPreview] = useState('');
  const [headerColor, setHeaderColor] = useState('#9DA1A8');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [showSkuModal, setShowSkuModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [selectedSku, setSelectedSku] = useState<string>('');
  const [newSku, setNewSku] = useState('');
  const [marketplaceImages, setMarketplaceImages] = useState<Array<{ sku: string; name: string; images: string[]; primaryImage: string | null }>>([]);
  const [loadingMarketplace, setLoadingMarketplace] = useState(false);
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(() => {
    fetch('/api/yandex/files')
      .then((r) => r.json())
      .then((items: YandexDiskItem[]) => {
        const productFiles = items.filter((f) => {
          const props = f.custom_properties || {};
          return props['Название товара'] === productName;
        });

        setAllFiles(productFiles);

        // Extract file types (only from product files, not layouts)
        const types = new Set<string>();
        const skus = new Set<string>();
        let group = '';
        let mainPreview = '';

        for (const f of productFiles) {
          const props = f.custom_properties || {};
          const contentType = props['Тип контента'] || '';

          // Only count file types for "Товар" content type
          if (contentType === 'Товар' || contentType === '') {
            const ft = props['Тип файла'] || getFileTypeFromName(f.name);
            if (ft) types.add(ft);
          }

          if (props['SKU']) skus.add(props['SKU']);
          if (props['Группа товаров'] && !group) group = props['Группа товаров'];
          if (props['Главное фото'] === 'true' && f.preview) {
            mainPreview = f.preview;
          }
        }

        if (!mainPreview && productFiles.length > 0 && productFiles[0].preview) {
          mainPreview = productFiles[0].preview;
        }

        setFileTypes(Array.from(types).sort());
        setProductSkus(Array.from(skus));
        setProductGroup(group);
        setMainPhotoPreview(mainPreview);

        // Set main photo as default preview
        const mainPhotoFile = productFiles.find((f) => {
          const props = f.custom_properties || {};
          return props['Главное фото'] === 'true';
        });
        if (mainPhotoFile) {
          setSelectedFile(mainPhotoFile);
        }

        // Default filter will be set after availableFileTypes is loaded

        setLoading(false);
      });
  }, [productName]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Load available file types from properties
  useEffect(() => {
    fetch('/api/properties')
      .then((r) => r.json())
      .then((properties) => {
        const fileTypes = properties['Тип файла'] || [];
        if (Array.isArray(fileTypes)) {
          setAvailableFileTypes(fileTypes);
        }
      })
      .catch(() => {
        // Fallback to default types if API fails
        setAvailableFileTypes(['PNG', 'Главное фото', 'Фото', 'Видео', 'Документ']);
      });
  }, []);

  // Set default filter when available file types and product files are loaded
  useEffect(() => {
    if (availableFileTypes.length > 0 && fileTypes.length > 0 && activeFilter === 'all') {
      // Try to default to PNG if available in both lists
      const pngType = availableFileTypes.find((ft) => fileTypes.includes(ft) && ft.toLowerCase().includes('png'));
      if (pngType) {
        setActiveFilter(pngType);
      }
    }
  }, [availableFileTypes, fileTypes, activeFilter]);

  // Fetch marketplace images from OZON API
  useEffect(() => {
    if (productSkus.length === 0) {
      setMarketplaceImages([]);
      return;
    }

    setLoadingMarketplace(true);
    fetch('/api/ozon/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: productSkus }),
    })
      .then(async (r) => {
        // Silently handle 503 (credentials not configured)
        if (r.status === 503) {
          setMarketplaceImages([]);
          return;
        }
        const data = await r.json();
        if (data.products) {
          setMarketplaceImages(data.products);
        }
      })
      .catch(() => {
        // Silently fail - marketplace images are optional
        setMarketplaceImages([]);
      })
      .finally(() => {
        setLoadingMarketplace(false);
      });
  }, [productSkus]);

  const handleDelete = useCallback(async (path: string) => {
    if (!confirm('Удалить этот файл?')) return;
    setDeleting((prev) => new Set(prev).add(path));
    try {
      const res = await fetch(`/api/yandex/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      if (res.ok) {
        setAllFiles((prev) => prev.filter((f) => f.path !== path));
        if (selectedFile?.path === path) setSelectedFile(null);
      } else {
        alert('Ошибка при удалении файла');
      }
    } catch {
      alert('Ошибка при удалении файла');
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [selectedFile]);

  const handleSetMainPhoto = useCallback(async (file: YandexDiskItem) => {
    if (!confirm(`Установить "${file.name}" как главное фото?`)) return;

    try {
      // First, remove "Главное фото" tag from all other files
      const mainPhotos = allFiles.filter((f) => {
        return f.custom_properties?.['Главное фото'] === 'true' && f.path !== file.path;
      });

      for (const mainPhoto of mainPhotos) {
        const newProps = { ...mainPhoto.custom_properties };
        delete newProps['Главное фото']; // Remove the main photo tag

        await fetch('/api/yandex/properties', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: mainPhoto.path,
            properties: newProps,
          }),
        });
      }

      // Add main photo tag to this file (keep original file type)
      const newProps = {
        ...file.custom_properties,
        'Главное фото': 'true',
      };
      const res = await fetch('/api/yandex/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: file.path,
          properties: newProps,
        }),
      });

      if (res.ok) {
        fetchFiles(); // Reload files to reflect changes
      } else {
        alert('Ошибка при установке главного фото');
      }
    } catch {
      alert('Ошибка при установке главного фото');
    }
  }, [allFiles, fetchFiles]);

  const handleUpload = useCallback(async (files: File[], fileType: string, sku?: string) => {
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    try {
      const entries = files.map((file) => {
        const props: Record<string, string> = {
          'Название товара': productName,
          'Тип файла': fileType,
        };
        if (productGroup) props['Группа товаров'] = productGroup;
        if (sku) props['SKU'] = sku;
        return { file, properties: props };
      });

      const { errorCount } = await uploadFilesWithProgress(entries, 'Товар', (current, total) => {
        setUploadProgress({ current, total });
      });

      if (errorCount > 0) {
        alert(`Ошибка: ${errorCount} файл(ов) не загружено`);
      }
      fetchFiles();
    } catch {
      alert('Ошибка при загрузке файла');
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  }, [productName, productGroup, allFiles, fetchFiles]);

  const handleDownloadAll = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const zip = new JSZip();

      if (activeFilter === 'PNG') {
        // Download all PNG files
        const pngFiles = filteredFiles;
        if (pngFiles.length === 0) {
          alert('Нет файлов для загрузки');
          setDownloading(false);
          return;
        }

        // Fetch each file and add to zip
        for (const file of pngFiles) {
          try {
            if (file.file) {
              const response = await fetch(file.file);
              const blob = await response.blob();
              zip.file(file.name, blob);
            }
          } catch (err) {
            console.error(`Failed to download ${file.name}:`, err);
          }
        }

        // Generate and download zip
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${productName}_PNG.zip`);
      } else if (activeFilter === 'Карточки для маркетплейсов') {
        // Download all marketplace images
        if (marketplaceImages.length === 0) {
          alert('Нет изображений для загрузки');
          setDownloading(false);
          return;
        }

        // Fetch each image and add to zip
        for (const product of marketplaceImages) {
          for (let idx = 0; idx < product.images.length; idx++) {
            try {
              const imageUrl = product.images[idx];
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
              zip.file(`${product.sku}_${idx + 1}.${ext}`, blob);
            } catch (err) {
              console.error(`Failed to download image:`, err);
            }
          }
        }

        // Generate and download zip
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${productName}_Marketplace.zip`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Ошибка при загрузке файлов');
    } finally {
      setDownloading(false);
    }
  }, [downloading, activeFilter, filteredFiles, marketplaceImages, productName]);

  useEffect(() => {
    if (activeFilter === 'all') {
      // Show all product files (excluding layouts)
      setFilteredFiles(
        allFiles.filter((f) => {
          const props = f.custom_properties || {};
          const contentType = props['Тип контента'] || '';
          return contentType !== 'Макет';
        })
      );
    } else if (activeFilter === 'Макеты') {
      // Special tab for layouts - only for authenticated users
      if (!isAuth) {
        // Redirect unauthorized users to 'all' filter
        setActiveFilter('all');
        setFilteredFiles([]);
        return;
      }
      setFilteredFiles(
        allFiles.filter((f) => {
          const props = f.custom_properties || {};
          return props['Тип контента'] === 'Макет';
        })
      );
    } else if (activeFilter === 'Главное фото') {
      // Special handling for main photo tab - show files marked as main photo
      setFilteredFiles(
        allFiles.filter((f) => {
          const props = f.custom_properties || {};
          return props['Главное фото'] === 'true';
        })
      );
    } else {
      // Show files of specific type (excluding layouts)
      setFilteredFiles(
        allFiles.filter((f) => {
          const props = f.custom_properties || {};
          const contentType = props['Тип контента'] || '';
          const ft = props['Тип файла'] || getFileTypeFromName(f.name);
          return ft === activeFilter && contentType !== 'Макет';
        })
      );
    }
  }, [activeFilter, allFiles, isAuth]);

  const getDominantColor = useCallback(() => {
    if (!imageRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = imageRef.current;
      const maxSize = 100;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxSize || h > maxSize) {
        const ratio = Math.min(maxSize / w, maxSize / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const data = ctx.getImageData(0, 0, w, h).data;
      const colorCount: Record<string, number> = {};

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) continue;
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (max === 0 || (max - min) / max * 100 < 20) continue;

        const key = `${Math.floor(data[i] / 20) * 20},${Math.floor(data[i + 1] / 20) * 20},${Math.floor(data[i + 2] / 20) * 20}`;
        colorCount[key] = (colorCount[key] || 0) + 1;
      }

      let maxCount = 0;
      let dominant = '';
      for (const key in colorCount) {
        if (colorCount[key] > maxCount) {
          maxCount = colorCount[key];
          dominant = key;
        }
      }

      if (dominant) {
        const [r, g, b] = dominant.split(',').map(Number);
        setHeaderColor(`rgb(${r}, ${g}, ${b})`);
      }
    } catch {
      // CORS or other error, keep default
    }
  }, []);

  const sectionImageUrl = mainPhotoPreview ? getPreviewProxyUrl(mainPhotoPreview) : '';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fileList = e.target.files;
          if (!fileList?.length || activeFilter === 'all') {
            e.target.value = '';
            return;
          }
          const files = Array.from(fileList);
          e.target.value = '';
          if (activeFilter === 'PNG') {
            setPendingFiles(files);
            setSelectedSku(productSkus[0] || '');
            setNewSku('');
            setShowSkuModal(true);
          } else {
            handleUpload(files, activeFilter);
          }
        }}
      />
      {/* SKU selection modal for PNG uploads */}
      {showSkuModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center"
          onClick={() => { setShowSkuModal(false); setPendingFiles(null); }}
        >
          <div
            className="bg-white p-8 rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.3)] max-w-[500px] w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Выберите SKU для загрузки</h3>
            <p className="text-gray-600 mb-4 text-sm">
              {pendingFiles && pendingFiles.length > 1
                ? `Выбрано файлов: ${pendingFiles.length}`
                : pendingFiles?.[0]?.name}
            </p>

            {productSkus.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Существующие SKU:</label>
                <div className="flex flex-col gap-2">
                  {productSkus.map((sku) => (
                    <label
                      key={sku}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedSku === sku && !newSku
                          ? 'border-[#ff0000] bg-red-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sku"
                        checked={selectedSku === sku && !newSku}
                        onChange={() => { setSelectedSku(sku); setNewSku(''); }}
                        className="accent-[#ff0000]"
                      />
                      <span className="font-mono text-sm">{sku}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {productSkus.length > 0 ? 'Или введите новый SKU:' : 'Введите SKU:'}
              </label>
              <input
                type="text"
                value={newSku}
                onChange={(e) => { setNewSku(e.target.value); setSelectedSku(''); }}
                placeholder="Новый SKU"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#ff0000] font-mono"
              />
            </div>

            <div className="flex gap-2.5 justify-end">
              <button
                className="px-5 py-2.5 bg-[#6c757d] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold"
                onClick={() => { setShowSkuModal(false); setPendingFiles(null); }}
              >
                Отмена
              </button>
              <button
                className="px-5 py-2.5 bg-[#ff0000] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!newSku && !selectedSku}
                onClick={() => {
                  const sku = newSku || selectedSku;
                  if (pendingFiles && sku) {
                    handleUpload(pendingFiles, 'PNG', sku);
                  }
                  setShowSkuModal(false);
                  setPendingFiles(null);
                }}
              >
                Загрузить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section header with dominant color */}
      <div
        className="w-screen h-[140px] md:h-[200px] relative px-4 md:px-8 flex items-end transition-colors duration-500"
        style={{ backgroundColor: headerColor, marginLeft: 'calc(-50vw + 50%)' }}
      >
        <h2 className="max-w-[1440px] mb-[60px] md:mb-[100px] ml-4 md:ml-[120px] text-white text-xl sm:text-2xl md:text-[32px] font-bold z-[2] drop-shadow-[1px_1px_3px_rgba(0,0,0,0.5)]">
          {productName}
        </h2>
        {sectionImageUrl && (
          <img
            ref={imageRef}
            src={sectionImageUrl}
            alt={productName}
            className="hidden"
            crossOrigin="anonymous"
            onLoad={getDominantColor}
          />
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20">Загрузка...</div>
      ) : (
        <>
          {/* File type filters */}
          <div className="bg-white px-4 md:px-8 max-w-[1440px] mx-auto">
            <div className="mt-[60px] md:mt-[100px] mb-4 md:mb-6 py-3 md:py-4">
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-2xl cursor-pointer text-xs md:text-sm border-2 transition-all ${
                    activeFilter === 'all'
                      ? 'bg-[#ff0000] text-white border-white/30'
                      : 'bg-[#edebeb] text-dark border-transparent hover:-translate-y-px hover:shadow-sm'
                  }`}
                >
                  Все
                </button>
                {availableFileTypes.filter((ft) => ft !== 'Главное фото').map((ft) => {
                  const count = allFiles.filter((f) => {
                    const props = f.custom_properties || {};
                    const contentType = props['Тип контента'] || '';
                    const t = props['Тип файла'] || getFileTypeFromName(f.name);
                    return t === ft && contentType !== 'Макет';
                  }).length;
                  return (
                    <button
                      key={ft}
                      onClick={() => setActiveFilter(ft)}
                      className={`px-3 md:px-4 py-1.5 md:py-2 rounded-2xl cursor-pointer text-xs md:text-sm border-2 transition-all ${
                        activeFilter === ft
                          ? 'bg-[#ff0000] text-white border-white/30'
                          : 'bg-[#edebeb] text-dark border-transparent hover:-translate-y-px hover:shadow-sm'
                      }`}
                    >
                      {ft}{count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
                {/* Макеты tab - only for authenticated users */}
                {isAuth && (() => {
                  const layoutCount = allFiles.filter((f) => {
                    const props = f.custom_properties || {};
                    return props['Тип контента'] === 'Макет';
                  }).length;
                  if (layoutCount === 0) return null;
                  return (
                    <button
                      onClick={() => setActiveFilter('Макеты')}
                      className={`px-3 md:px-4 py-1.5 md:py-2 rounded-2xl cursor-pointer text-xs md:text-sm border-2 transition-all ${
                        activeFilter === 'Макеты'
                          ? 'bg-[#ff0000] text-white border-white/30'
                          : 'bg-[#edebeb] text-dark border-transparent hover:-translate-y-px hover:shadow-sm'
                      }`}
                    >
                      Макеты ({layoutCount})
                    </button>
                  );
                })()}
                {/* Marketplace images tab */}
                {marketplaceImages.length > 0 && (
                  <button
                    onClick={() => setActiveFilter('Карточки для маркетплейсов')}
                    className={`px-3 md:px-4 py-1.5 md:py-2 rounded-2xl cursor-pointer text-xs md:text-sm border-2 transition-all ${
                      activeFilter === 'Карточки для маркетплейсов'
                        ? 'bg-[#ff0000] text-white border-white/30'
                        : 'bg-[#edebeb] text-dark border-transparent hover:-translate-y-px hover:shadow-sm'
                    }`}
                  >
                    Карточки ({marketplaceImages.reduce((sum, p) => sum + p.images.length, 0)})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* File list + preview */}
          <div className="flex gap-4 md:gap-5 max-w-[1440px] mx-auto px-4 md:px-8 flex-col md:flex-row">
            <div className="w-full md:w-[70%] overflow-y-auto h-[400px] md:h-[600px] border border-border p-3 md:p-4 rounded-lg bg-white">
              {/* Upload button for authorized users in PNG tab */}
              {isAuth && activeFilter !== 'all' && activeFilter !== 'Макеты' && activeFilter !== 'Карточки для маркетплейсов' && (
                <div className="mb-4 flex flex-col gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2 rounded-lg cursor-pointer text-sm bg-[#ff0000] text-white border-none hover:bg-[#dd0000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
                  >
                    {uploading ? 'Загрузка...' : `Загрузить в «${activeFilter}»`}
                  </button>
                  {uploading && uploadProgress.total > 0 && (
                    <UploadProgress
                      current={uploadProgress.current}
                      total={uploadProgress.total}
                      label={`Загрузка файлов...`}
                    />
                  )}
                </div>
              )}
              {/* Download all button for PNG and Marketplace Cards tabs */}
              {(activeFilter === 'PNG' || activeFilter === 'Карточки для маркетплейсов') && (
                <div className="mb-4">
                  <button
                    onClick={handleDownloadAll}
                    disabled={downloading || (activeFilter === 'PNG' && filteredFiles.length === 0) || (activeFilter === 'Карточки для маркетплейсов' && marketplaceImages.length === 0)}
                    className="px-4 py-2 rounded-lg cursor-pointer text-sm bg-[#9DA1A8] text-white border-none hover:bg-[#7A7E85] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloading ? 'Скачивание...' : 'Скачать всё'}
                  </button>
                </div>
              )}
              {activeFilter === 'Макеты' && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
                  <p className="font-medium mb-1">💡 Макеты</p>
                  <p>Это макеты, связанные с данным товаром. Они были загружены через страницу "Загрузить файлы" с указанием категории, подкатегории и ответственного.</p>
                </div>
              )}
              {activeFilter === 'Карточки для маркетплейсов' && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
                  <p className="font-medium mb-1">🛒 Карточки для маркетплейсов</p>
                  <p>Изображения товаров, загруженные на маркетплейс OZON. Данные получены через OZON API по SKU товаров.</p>
                </div>
              )}
              {activeFilter === 'Карточки для маркетплейсов' ? (
                loadingMarketplace ? (
                  <div className="text-center py-10 text-gray-500">Загрузка изображений с маркетплейса...</div>
                ) : marketplaceImages.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <h3 className="text-dark mb-2">Изображения не найдены</h3>
                    <p>Проверьте настройки OZON API или SKU товаров</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {marketplaceImages.map((product) => {
                      const isExpanded = expandedSkus.has(product.sku);
                      return (
                        <div key={product.sku} className="border border-border rounded-lg overflow-hidden bg-white">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => {
                              setExpandedSkus((prev) => {
                                const next = new Set(prev);
                                if (next.has(product.sku)) {
                                  next.delete(product.sku);
                                } else {
                                  next.add(product.sku);
                                }
                                return next;
                              });
                            }}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-lg mb-1">
                                SKU: {product.sku}
                              </div>
                              {product.name && (
                                <div className="text-sm text-gray-600">{product.name}</div>
                              )}
                              <div className="text-xs text-gray-500 mt-1">
                                {product.images.length} {product.images.length === 1 ? 'изображение' : 'изображений'}
                              </div>
                            </div>
                            <div className="text-2xl text-gray-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                              ▼
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-4 pt-0 border-t border-border">
                              <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
                                {product.images.map((imageUrl, idx) => (
                                  <div
                                    key={idx}
                                    className="aspect-square border border-border rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                                    onClick={() => {
                                      const tempFile: YandexDiskItem = {
                                        name: `${product.sku}_${idx + 1}.jpg`,
                                        preview: imageUrl,
                                        file: imageUrl,
                                        type: 'file',
                                        path: imageUrl,
                                        size: 0,
                                        created: '',
                                      };
                                      setSelectedFile(tempFile);
                                    }}
                                  >
                                    <img
                                      src={imageUrl}
                                      alt={`${product.sku} - изображение ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <h3 className="text-dark mb-2">Файлы не найдены</h3>
                  <p>Попробуйте изменить фильтр</p>
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const previewUrl = getPreviewProxyUrl(file.preview || '', 'S');
                  const props = file.custom_properties || {};
                  const properties = Object.entries(props)
                    .filter(([, v]) => v)
                    .map(([k, v]) => ({ type: k, value: v }))
                    .sort((a, b) => {
                      const ia = PROPERTY_DISPLAY_ORDER.indexOf(a.type);
                      const ib = PROPERTY_DISPLAY_ORDER.indexOf(b.type);
                      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                    });

                  return (
                    <div
                      key={file.path}
                      className={`flex items-start justify-between border-b border-border p-4 cursor-pointer transition-colors ${
                        selectedFile?.path === file.path ? 'bg-[#f0f7ff]' : 'hover:bg-[#f0f7ff]'
                      }`}
                      onClick={() => setSelectedFile(file)}
                    >
                      <div className="flex items-start gap-4 flex-1">
                        <img
                          className="w-20 h-20 bg-[#f4f4f4] border border-border rounded-lg object-cover shrink-0"
                          src={previewUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+'}
                          alt="preview"
                        />
                        <div className="flex flex-col text-[13px] text-gray-600 flex-1">
                          <div className="font-semibold text-base mb-2 text-dark">{file.name}</div>
                          <div className="text-xs text-gray-500 mb-2">
                            <div>{formatDate(file.created || '')}</div>
                            <div>{formatFileSize(file.size || 0)}</div>
                            {props['SKU'] && <div>SKU: <strong>{props['SKU']}</strong></div>}
                          </div>
                          {properties.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {properties.map((prop, i) => {
                                const colors = PROPERTY_COLORS[prop.type] || { bg: '#f0f0f0', text: '#666', border: '#ddd' };
                                return (
                                  <span
                                    key={i}
                                    className="px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1"
                                    style={{
                                      backgroundColor: colors.bg,
                                      color: colors.text,
                                      border: `1px solid ${colors.border}`,
                                      fontFamily: prop.type === 'SKU' ? 'monospace' : undefined,
                                    }}
                                  >
                                    <span className="font-semibold opacity-80">{prop.type}:</span>
                                    {prop.value}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 shrink-0 ml-2">
                        {file.file && (
                          <a
                            className="no-underline text-base text-black p-2 rounded-md hover:bg-gray-100"
                            href={file.file}
                            download={file.name}
                            onClick={(e) => e.stopPropagation()}
                            title="Скачать"
                          >
                            ⬇
                          </a>
                        )}
                        {isAuth && (() => {
                          const fileType = props['Тип файла'] || getFileTypeFromName(file.name);
                          const isPhoto = fileType === 'Фото' || fileType === 'PNG';
                          const isMainPhoto = props['Главное фото'] === 'true';

                          return (
                            <>
                              {isPhoto && !isMainPhoto && (
                                <button
                                  className="text-base p-2 rounded-md hover:bg-yellow-50 transition-colors bg-transparent border-none cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetMainPhoto(file);
                                  }}
                                  title="Установить как главное фото"
                                >
                                  ⭐
                                </button>
                              )}
                              {isMainPhoto && (
                                <span
                                  className="text-base p-2 text-yellow-500"
                                  title="Главное фото"
                                >
                                  ⭐
                                </span>
                              )}
                              <button
                                className="text-base text-danger p-2 rounded-md hover:bg-red-50 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(file.path);
                                }}
                                disabled={deleting.has(file.path)}
                                title="Удалить"
                              >
                                🗑
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="w-full md:w-[30%] md:sticky md:top-4">
              <FilePreview file={selectedFile} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
