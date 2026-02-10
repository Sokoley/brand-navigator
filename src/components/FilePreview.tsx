'use client';

import { YandexDiskItem } from '@/lib/types';
import { getPreviewProxyUrl } from '@/lib/utils';

export default function FilePreview({ file }: { file: YandexDiskItem | null }) {
  // Check if URL is external (not Yandex Disk) - use directly without proxy
  const isExternalUrl = file?.preview && (
    file.preview.startsWith('http://') ||
    file.preview.startsWith('https://')
  ) && !file.preview.includes('downloader.disk.yandex');

  const previewUrl = file?.preview
    ? (isExternalUrl ? file.preview : getPreviewProxyUrl(file.preview))
    : '';

  return (
    <div className="w-full h-[300px] md:h-[600px] border border-border rounded-xl flex justify-center items-center bg-[#f4f4f4] md:sticky md:top-5 shrink-0">
      {file && previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="max-w-full max-h-full rounded-lg"
        />
      ) : (
        <p className="text-gray-500">Выберите файл для просмотра</p>
      )}
    </div>
  );
}
