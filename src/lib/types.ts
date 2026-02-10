export interface FileInfo {
  name: string;
  preview: string;
  file: string;
  size: number;
  created: string;
  sku?: string;
  file_type?: string;
  category?: string;
  subcategory?: string;
  responsible?: string;
  product_group?: string;
  all_properties?: Record<string, string>;
}

export interface Product {
  name: string;
  group: string;
  skus: string[];
  main_photo: FileInfo | null | '';
  photos: FileInfo[];
  videos: FileInfo[];
  documents: FileInfo[];
  png_files: FileInfo[];
  file_count?: number;
  all_files?: FileInfo[];
}

export interface CustomProperties {
  [key: string]: string[] | Record<string, string[]>;
}

export interface SearchResult extends Product {
  matchType?: 'exact' | 'translit' | 'fuzzy' | 'sku';
}

export interface YandexDiskItem {
  name: string;
  type: 'file' | 'dir';
  path: string;
  preview?: string;
  file?: string;
  size?: number;
  created?: string;
  custom_properties?: Record<string, string>;
}

export interface YandexDiskResponse {
  _embedded?: {
    items: YandexDiskItem[];
  };
}

export interface PropertyBadge {
  type: string;
  value: string;
}

export type AlertType = 'success' | 'warning' | 'error';

export interface UploadFileState {
  file: File;
  preview: string | null;
  hasConflict: boolean;
  action: 'rename' | 'replace' | null;
  properties: Record<string, string | string[]>;
  isComplete: boolean;
}
