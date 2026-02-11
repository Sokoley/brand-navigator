'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/types';
import { advancedSearch } from '@/lib/search';
import { useAuth } from '@/components/AuthProvider';
import ProductCard from '@/components/ProductCard';
import ConfirmDialog from '@/components/ConfirmDialog';
import Alert from '@/components/Alert';

export default function ProductsPage() {
  const { isAuth } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadProducts = () => {
    setLoading(true);
    fetch('/api/yandex/products?refresh=1')
      .then((r) => r.json())
      .then((data) => {
        const list = Object.values(data) as Product[];
        setProducts(list);
        setFilteredProducts(list);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(advancedSearch(products, searchQuery));
    }
  }, [searchQuery, products]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/yandex/delete?product=${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
    const data = await res.json();

    if (res.ok) {
      setAlert({ type: 'success', message: data.message || `Товар "${deleteTarget}" удален` });
      loadProducts();
    } else {
      setAlert({ type: 'error', message: data.error || 'Ошибка удаления' });
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <div className="block mx-auto mt-20 md:mt-[140px] mb-8 md:mb-[50px] text-2xl sm:text-4xl md:text-[55px] font-bold text-center px-4">
        Все товары
      </div>

      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <a
            href="https://disk.yandex.ru/d/Gibn8WMao0CGmA"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-[#007bff] text-white rounded-lg font-medium hover:bg-[#0056b3] transition-colors"
          >
            Логотипы
          </a>
          <a
            href="https://smazka.ru/catalog-2025/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-[#28a745] text-white rounded-lg font-medium hover:bg-[#218838] transition-colors"
          >
            Каталог
          </a>
        </div>
        {alert && (
          <Alert type={alert.type} message={alert.message} />
        )}

        <div className="mb-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск товаров..."
            className="w-full px-4 md:px-5 py-3 md:py-4 border-2 border-border rounded-[25px] text-base md:text-lg outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(157,161,168,0.1)]"
          />
        </div>

        <div className="flex justify-between items-center mb-5">
          <div className="text-sm text-gray-500">
            Найдено: {filteredProducts.length} товаров
          </div>
          <button
            onClick={loadProducts}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors border-none cursor-pointer"
          >
            Обновить
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Загрузка...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <h3 className="text-dark mb-2">Товары не найдены</h3>
            <p className="text-sm">Попробуйте изменить поисковый запрос</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 md:gap-5">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.name}
                product={product}
                searchQuery={searchQuery}
                onDelete={isAuth ? (name) => setDeleteTarget(name) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Подтверждение удаления"
        message={`Вы уверены, что хотите удалить товар "${deleteTarget}" и все его файлы?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
