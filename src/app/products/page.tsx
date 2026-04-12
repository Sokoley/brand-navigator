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
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const groups = Array.from(new Set(products.map((p) => p.group).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const loadProducts = (forceRefresh = false) => {
    setLoading(true);
    fetch(`/api/yandex/products${forceRefresh ? '?refresh=1' : ''}`)
      .then(async (r) => {
        if (!r.ok) return {};
        try {
          return await r.json();
        } catch {
          return {};
        }
      })
      .then((data) => {
        const raw = data && typeof data === 'object' ? data : {};
        const list = Object.values(raw) as Product[];
        setProducts(list);
        setFilteredProducts(list);
        setLoading(false);
      })
      .catch(() => {
        setProducts([]);
        setFilteredProducts([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    let list = products;
    if (selectedGroup) {
      list = list.filter((p) => p.group === selectedGroup);
    }
    if (searchQuery.trim()) {
      list = advancedSearch(list, searchQuery);
    }
    setFilteredProducts(list);
  }, [searchQuery, selectedGroup, products]);

  const handleReindex = async () => {
    setReindexing(true);
    setAlert(null);
    try {
      const res = await fetch('/api/admin/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setAlert({ type: 'success', message: data.message || 'Переиндексация завершена' });
        loadProducts(true);
      } else {
        setAlert({ type: 'error', message: data.error || 'Ошибка переиндексации' });
      }
    } catch {
      setAlert({ type: 'error', message: 'Ошибка переиндексации' });
    } finally {
      setReindexing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/yandex/delete?product=${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
    const data = await res.json();

    if (res.ok) {
      setAlert({ type: 'success', message: data.message || `Товар "${deleteTarget}" удален` });
      loadProducts(true);
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
        {alert && (
          <Alert type={alert.type} message={alert.message} />
        )}

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск товаров..."
            className="w-full px-4 md:px-5 py-3 md:py-4 border-2 border-border rounded-[25px] text-base md:text-lg outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(157,161,168,0.1)]"
          />
        </div>

        {groups.length > 0 && (
          <div className="mb-4">
            <span className="text-sm text-gray-600 mr-2">Группа:</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Все группы</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-6">
          <a
            href="https://disk.yandex.ru/d/Gibn8WMao0CGmA"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-transparent border-2 border-[#007bff] text-[#007bff] rounded-lg font-medium hover:bg-[#007bff] hover:text-white transition-colors"
          >
            Логотипы
          </a>
          <a
            href="https://smazka.ru/catalog-2025/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-transparent border-2 border-[#28a745] text-[#28a745] rounded-lg font-medium hover:bg-[#28a745] hover:text-white transition-colors"
          >
            Каталог
          </a>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 mb-5">
          <div className="text-sm text-gray-500">
            Найдено: {filteredProducts.length} товаров
          </div>
          <div className="flex gap-2">
            {isAuth && (
              <button
                onClick={handleReindex}
                disabled={reindexing}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 border-none cursor-pointer"
              >
                {reindexing ? 'Переиндексация…' : 'Переиндексировать из Yandex'}
              </button>
            )}
            <button
              onClick={() => loadProducts(true)}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors border-none cursor-pointer"
            >
              Обновить
            </button>
          </div>
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
