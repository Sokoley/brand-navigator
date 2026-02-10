'use client';

import Link from 'next/link';
import { Product } from '@/lib/types';
import { getPreviewProxyUrl, highlightText } from '@/lib/utils';

export default function ProductCard({
  product,
  searchQuery,
  onDelete,
}: {
  product: Product;
  searchQuery?: string;
  onDelete?: (name: string) => void;
}) {
  const mainImage = product.main_photo
    ? getPreviewProxyUrl(typeof product.main_photo === 'string' ? '' : product.main_photo.preview)
    : product.png_files.length > 0
      ? getPreviewProxyUrl(product.png_files[0].preview)
      : '';

  const totalFiles =
    (product.main_photo ? 1 : 0) +
    product.photos.length +
    product.videos.length +
    product.documents.length +
    product.png_files.length;

  return (
    <div className="bg-white border border-border rounded-xl p-4 md:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/product/${encodeURIComponent(product.name)}`} className="no-underline text-inherit">
        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
          {mainImage ? (
            <img
              src={mainImage}
              alt={product.name}
              className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover border border-border shrink-0"
            />
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-gray-100 border border-border shrink-0 flex items-center justify-center text-gray-400 text-xs">
              No image
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className="text-base md:text-lg font-semibold mb-1 text-dark truncate"
              dangerouslySetInnerHTML={{
                __html: searchQuery ? highlightText(product.name, searchQuery) : product.name,
              }}
            />
            {product.group && (
              <span className="inline-block bg-light text-dark px-2 py-1 rounded text-xs font-semibold">
                {product.group}
              </span>
            )}
          </div>
        </div>

        {product.skus.length > 0 && (
          <div className="mt-3 md:mt-4">
            <div className="text-xs md:text-sm font-semibold mb-1.5 md:mb-2 text-dark">SKU:</div>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {product.skus.map((sku) => (
                <span
                  key={sku}
                  className="inline-block bg-[#e3f2fd] px-2 md:px-3 py-1 md:py-1.5 rounded-md font-mono text-xs md:text-sm font-semibold"
                  dangerouslySetInnerHTML={{
                    __html: searchQuery ? highlightText(sku, searchQuery) : sku,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            Files: {product.file_count || totalFiles}
          </span>
          <span className="flex items-center gap-1">
            PNG: {product.png_files.length}
          </span>
        </div>
      </Link>

      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(product.name);
          }}
          className="mt-3 text-xs text-danger hover:underline cursor-pointer bg-transparent border-none p-0"
        >
          Удалить товар
        </button>
      )}
    </div>
  );
}
