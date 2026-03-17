/**
 * Service wrapper over Yandex Disk API.
 * Re-exports lib for use by API routes; central place for future retries or logging.
 */
export {
  getFiles,
  getResource,
  getAllFilesRecursive,
  createFolder,
  deleteResource,
  setCustomProperties,
  getUploadUrl,
  uploadToHref,
  fetchPreview,
} from '@/lib/yandex-disk';
