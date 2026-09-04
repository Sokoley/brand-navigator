'use client';

import { useState } from 'react';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import UploadArea from '@/components/UploadArea';
import UploadProgress from '@/components/UploadProgress';
import Alert from '@/components/Alert';

export default function CategoryUploadModal({
  category,
  onUploaded,
}: {
  category: string;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [areaKey, setAreaKey] = useState(0);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleUpload = async () => {
    if (files.length === 0) {
      setAlert({ type: 'error', message: 'Выберите файлы для загрузки' });
      return;
    }

    setUploading(true);
    setAlert(null);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const folder = folderName.trim();
      const entries = files.map((file) => ({
        file,
        properties: {
          'Тип контента': 'Макет',
          'Категория': category,
          ...(folder ? { 'Папка': folder } : {}),
        },
      }));

      const { successCount, errorCount } = await uploadFilesWithProgress(entries, 'Макет', (current, total) => {
        setUploadProgress({ current, total });
      });

      if (errorCount === 0) {
        setAlert({ type: 'success', message: `Загружено файлов: ${successCount}` });
        setFiles([]);
        setFolderName('');
        setAreaKey((k) => k + 1);
        onUploaded();
      } else {
        setAlert({ type: 'error', message: `Загружено: ${successCount}, ошибок: ${errorCount}` });
      }
    } catch {
      setAlert({ type: 'error', message: 'Ошибка соединения' });
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="mb-6 p-4 md:p-6 bg-white border border-border rounded-xl">
      <h3 className="text-lg font-semibold mb-1">Загрузить файлы</h3>
      <p className="text-sm text-gray-500 mb-4">
        Категория: <span className="font-semibold text-dark">{category}</span>
      </p>

      {alert && <Alert type={alert.type} message={alert.message} />}

      <UploadArea
          key={areaKey}
          onFilesSelected={setFiles}
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        label="Перетащите файлы сюда или нажмите для выбора"
        hint="Поддерживаются изображения, видео и документы"
      />

      {files.length > 1 && (
        <div className="mt-4">
          <label className="block font-medium mb-1 text-sm">Название папки (необязательно)</label>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Объединить файлы в папку"
            disabled={uploading}
            className="w-full p-3 border-2 border-border rounded-lg text-base outline-none focus:border-primary box-border"
          />
        </div>
      )}

      {uploading && uploadProgress.total > 0 && (
        <div className="mt-4">
          <UploadProgress
            current={uploadProgress.current}
            total={uploadProgress.total}
            label="Загрузка файлов..."
          />
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          className="px-5 py-2.5 bg-[#ff0000] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold disabled:opacity-50"
        >
          {uploading ? 'Загрузка...' : 'Загрузить'}
        </button>
      </div>
    </div>
  );
}
