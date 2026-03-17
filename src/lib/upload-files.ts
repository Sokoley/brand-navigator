export interface UploadFileEntry {
  file: File;
  properties: Record<string, string>;
}

export interface UploadResult {
  type: string;
  name: string;
  original?: string;
  message?: string;
}

export interface ProductUploadOptions {
  /** Precomputed path: "Товары/Группа/Товар". */
  productFolderPath?: string;
  /** Product name to build folder path. */
  productName?: string;
  /** Product group (Группа товаров) to build folder path. */
  productGroup?: string;
  /** SKUs for file properties. */
  productSkus?: string[];
}

export async function uploadFilesWithProgress(
  entries: UploadFileEntry[],
  contentType: string,
  onProgress: (current: number, total: number) => void,
  options?: ProductUploadOptions,
): Promise<{ results: UploadResult[]; successCount: number; errorCount: number }> {
  const results: UploadResult[] = [];
  const total = entries.length;
  let successCount = 0;
  let errorCount = 0;

  onProgress(0, total);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const formData = new FormData();
    formData.append('contentType', contentType);
    formData.append('files', entry.file);
    formData.append('actions_0', 'rename');
    for (const [key, value] of Object.entries(entry.properties)) {
      formData.append(`prop_0_${key}`, value);
    }
    if (contentType === 'Товар' && options) {
      if (options.productFolderPath) {
        formData.append('productFolderPath', options.productFolderPath);
      } else if (options.productName) {
        formData.append('productName', options.productName);
        if (options.productGroup != null) formData.append('productGroup', options.productGroup);
        if (options.productSkus?.length) formData.append('productSkus', options.productSkus.join(','));
      }
    }

    try {
      const res = await fetch('/api/yandex/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.results?.[0]?.type === 'success') {
        successCount++;
        results.push(data.results[0]);
      } else {
        errorCount++;
        const msg = data.error || data.results?.[0]?.message || 'Upload failed';
        results.push({ type: 'error', name: entry.file.name, message: msg });
      }
    } catch {
      errorCount++;
      results.push({ type: 'error', name: entry.file.name, message: 'Network error' });
    }

    onProgress(i + 1, total);
  }

  return { results, successCount, errorCount };
}
