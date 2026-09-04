'use client';

import { useState } from 'react';
import { uploadFilesWithProgress } from '@/lib/upload-files';
import UploadArea from '@/components/UploadArea';
import UploadProgress from '@/components/UploadProgress';
import Alert from '@/components/Alert';

export default function CategoryUploadModal({
  category,
  onClose,
  onUploaded,
}: {
  category: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
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
    <div
      className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white p-6 md:p-8 rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.3)] max-w-[560px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2 text-center">Загрузить файлы</h3>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Категория: <span className="font-semibold text-dark">{category}</span>
        </p>

        {alert && <Alert type={alert.type} message={alert.message} />}

        <UploadArea
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

        <div className="flex gap-2.5 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-5 py-2.5 bg-[#6c757d] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold disabled:opacity-50"
          >
            Закрыть
          </button>
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
    </div>
  );
}
