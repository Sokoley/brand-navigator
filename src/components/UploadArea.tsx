'use client';

import { useState, useRef, useCallback } from 'react';

export default function UploadArea({
  onFilesSelected,
  accept,
  multiple = true,
  label = 'Выберите файлы или перетащите сюда',
  hint,
}: {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(files);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all font-medium ${
          isDragOver
            ? 'border-primary bg-blue-50'
            : selectedFiles.length > 0
              ? 'border-success bg-green-50 text-success'
              : 'border-border bg-white hover:border-primary hover:bg-blue-50'
        }`}
      >
        {selectedFiles.length > 0
          ? `Выбрано: ${selectedFiles.length} файл(ов)`
          : label}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {hint && (
        <div className="text-xs text-gray-500 mt-1 text-center">{hint}</div>
      )}
      {selectedFiles.length > 0 && (
        <div className="mt-2.5">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex justify-between items-center px-3 py-2 bg-light rounded-md mb-1"
            >
              <span className="text-sm truncate">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="bg-danger text-white border-none px-3 py-1.5 rounded-md cursor-pointer text-xs font-semibold"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
