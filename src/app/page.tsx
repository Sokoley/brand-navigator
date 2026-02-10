'use client';

import { useState, useEffect } from 'react';
import { Product, CustomProperties } from '@/lib/types';
import SearchBar from '@/components/SearchBar';
import ProductCard from '@/components/ProductCard';
import CategorySection from '@/components/CategorySection';

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Array<{ name: string; subcategories: string[] }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/yandex/products').then((r) => r.json()),
      fetch('/api/properties').then((r) => r.json()),
    ]).then(([productsData, propertiesData]) => {
      const productsList = Object.values(productsData) as Product[];
      setProducts(productsList);

      const props = propertiesData as CustomProperties;
      const cats = (props['Категория'] as string[]) || [];
      const subcats = (props['Подкатегория'] as Record<string, string[]>) || {};

      setCategories(
        cats.map((cat) => ({
          name: cat,
          subcategories: subcats[cat] || [],
        }))
      );

      setLoading(false);
    });
  }, []);

  const handleSearch = (results: Product[], query: string) => {
    setSearchResults(results);
    setSearchQuery(query);
  };

  return (
    <>
      <div className="block mx-auto mt-20 md:mt-[140px] mb-8 md:mb-[50px] text-2xl sm:text-4xl md:text-[55px] font-bold text-center px-4">
        Бренд-навигатор
      </div>

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 md:pt-10">
        {loading ? (
          <div className="text-center text-gray-500 py-20">Загрузка...</div>
        ) : (
          <>
            <SearchBar products={products} onSearch={handleSearch} />

            {searchQuery && (
              <div className="mt-8">
                <div className="text-sm text-gray-500 mb-5">
                  Найдено товаров: {searchResults.length} по запросу &quot;{searchQuery}&quot;
                </div>

                {searchResults.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <h3 className="text-dark mb-2">Товары не найдены</h3>
                    <p className="text-sm">Попробуйте изменить поисковый запрос или проверить написание</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 md:gap-5">
                    {searchResults.map((product) => (
                      <ProductCard
                        key={product.name}
                        product={product}
                        searchQuery={searchQuery}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!searchQuery && categories.length > 0 && (
        <CategorySection categories={categories} />
      )}
    </>
  );
}
