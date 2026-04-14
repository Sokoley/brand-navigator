'use client';

import Link from 'next/link';
import { Product } from '@/lib/types';
import { groupSlugFromLabel } from '@/lib/product-slug';
import { getPreviewProxyUrl, highlightText } from '@/lib/utils';

function mainPhotoPreviewUrl(main: Product['main_photo']): string {
  if (!main || typeof main === 'string') return '';
  return (main.preview || '').trim();
}

export default function ProductCard({
  product,
  searchQuery,
  onDelete,
}: {
  product: Product;
  searchQuery?: string;
  onDelete?: (name: string) => void;
}) {
  // Превью: главное фото с непустым preview; иначе PNG из Кросс кодов (с превью), новее первым
  const fallbackPng =
    product.png_files.length > 0
      ? [...product.png_files]
          .filter((p) => (p.preview || '').trim())
          .sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0]
      : null;
  const primaryPreview = mainPhotoPreviewUrl(product.main_photo);
  const mainImage = primaryPreview
    ? getPreviewProxyUrl(primaryPreview)
    : fallbackPng
      ? getPreviewProxyUrl(fallbackPng.preview)
      : '';

  const groupQs = product.group
    ? product.groupSlug || groupSlugFromLabel(product.group)
    : '';

  return (
    <div className="bg-white border border-border rounded-xl p-4 md:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href={`/product/${product.slug ? encodeURIComponent(product.slug) : encodeURIComponent(product.name)}${groupQs ? `?group=${encodeURIComponent(groupQs)}` : ''}`}
        className="no-underline text-inherit"
      >
        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
          {mainImage ? (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg border border-border bg-gray-50 shrink-0 overflow-hidden flex items-center justify-center">
              <img
                src={mainImage}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-gray-100 border border-border shrink-0 flex items-center justify-center text-gray-400 text-xs">
              No image
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className="text-sm md:text-base font-semibold mb-1 text-dark break-words"
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
