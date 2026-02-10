'use client';

import { YandexDiskItem } from '@/lib/types';
import { formatFileSize, formatDate, getPreviewProxyUrl } from '@/lib/utils';

export default function FileList({
  files,
  onSelectFile,
  selectedPath,
  onDelete,
}: {
  files: YandexDiskItem[];
  onSelectFile: (file: YandexDiskItem) => void;
  selectedPath?: string;
  onDelete?: (path: string, name: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        <h3 className="text-dark mb-2">Макеты не найдены</h3>
        <p>Попробуйте изменить параметры фильтров</p>
      </div>
    );
  }

  return (
    <div>
      {files.map((file) => {
        const previewUrl = getPreviewProxyUrl(file.preview || '', 'S');
        const isSelected = file.path === selectedPath;

        return (
          <div
            key={file.path}
            className={`flex items-start justify-between border-b border-border p-3 md:p-4 cursor-pointer transition-colors ${
              isSelected ? 'bg-[#f0f7ff]' : 'hover:bg-[#f0f7ff]'
            }`}
            onClick={() => onSelectFile(file)}
          >
            <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
              <img
                className="w-14 h-14 md:w-20 md:h-20 bg-[#f4f4f4] border border-border rounded-lg object-cover shrink-0"
                src={previewUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNDAiIHk9IjQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZm9udC1zaXplPSIxMCIgZmlsbD0iIzk5OSI+Tm8gaW1hZ2U8L3RleHQ+PC9zdmc+'}
                alt="preview"
              />
              <div className="flex flex-col text-xs md:text-[13px] text-gray-600 flex-1 min-w-0">
                <div className="font-semibold text-sm md:text-base mb-1 md:mb-2 text-dark truncate">{file.name}</div>
                <div className="text-xs text-gray-500 mb-2 leading-relaxed">
                  <div>{formatDate(file.created || '')}</div>
                  <div>{formatFileSize(file.size || 0)}</div>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-1 md:gap-2.5 shrink-0 ml-1 md:ml-2">
              {file.file && (
                <a
                  className="no-underline text-base text-black p-2 rounded-md hover:bg-gray-100 transition-colors"
                  href={file.file}
                  download={file.name}
                  onClick={(e) => e.stopPropagation()}
                  title="Скачать"
                >
                  ⬇
                </a>
              )}
              {onDelete && (
                <button
                  className="text-base text-danger p-2 rounded-md hover:bg-red-50 transition-colors bg-transparent border-none cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file.path, file.name);
                  }}
                  title="Удалить"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
