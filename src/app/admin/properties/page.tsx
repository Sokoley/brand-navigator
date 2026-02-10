'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import PropertyAccordion from '@/components/PropertyAccordion';
import PropertyEditor from '@/components/PropertyEditor';
import SubcategoryManager from '@/components/SubcategoryManager';
import { CustomProperties } from '@/lib/types';

export default function PropertiesAdminPage() {
  const { isAuth, loading } = useAuth();
  const [properties, setProperties] = useState<CustomProperties>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load properties
  useEffect(() => {
    fetch('/api/properties')
      .then((r) => r.json())
      .then(setProperties)
      .catch(() => {
        setNotification({ type: 'error', message: 'Ошибка загрузки свойств' });
      });
  }, [refreshKey]);

  // Auto-dismiss alerts after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // CRUD handlers
  const handleAdd = async (propertyType: string, value: string, parent?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_type: propertyType, property_value: value, parent_category: parent }),
      });
      if (res.ok) {
        setNotification({ type: 'success', message: 'Значение добавлено' });
        refresh();
        return true;
      } else {
        const data = await res.json();
        setNotification({ type: 'error', message: data.message || 'Ошибка добавления' });
        return false;
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
      return false;
    }
  };

  const handleUpdate = async (
    propertyType: string,
    oldValue: string,
    newValue: string,
    parent?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_type: propertyType,
          old_value: oldValue,
          new_value: newValue,
          parent_category: parent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        let message = 'Значение обновлено';

        if (data.filesUpdated > 0) {
          message = `Значение обновлено. Обновлено файлов: ${data.filesUpdated}`;
          if (data.errors && data.errors.length > 0) {
            message += `. Ошибки в ${data.errors.length} файлах`;
          }
        }

        setNotification({ type: 'success', message });
        refresh();
        return true;
      } else {
        const data = await res.json();
        setNotification({ type: 'error', message: data.error || 'Ошибка обновления' });
        return false;
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
      return false;
    }
  };

  const handleDelete = async (propertyType: string, value: string, parent?: string): Promise<boolean> => {
    try {
      const params = new URLSearchParams({
        type: propertyType,
        value: value,
      });
      if (parent) {
        params.append('parent', parent);
      }

      const res = await fetch(`/api/properties?${params}`, {
        method: 'DELETE',
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.subcategories) {
          alert(
            `Категория имеет подкатегории: ${data.subcategories.join(', ')}. Удалите их сначала.`
          );
          return false;
        } else {
          const confirmed = confirm(
            `Значение используется в ${data.fileCount} файлах:\n${data.fileNames.slice(0, 5).join('\n')}${
              data.fileCount > 5 ? '\n...' : ''
            }\n\nПродолжить удаление?`
          );

          if (confirmed) {
            params.append('force', 'true');
            const forceRes = await fetch(`/api/properties?${params}`, {
              method: 'DELETE',
            });

            if (forceRes.ok) {
              setNotification({ type: 'success', message: 'Значение удалено' });
              refresh();
              return true;
            } else {
              setNotification({ type: 'error', message: 'Ошибка удаления' });
              return false;
            }
          }
          return false;
        }
      } else if (res.ok) {
        setNotification({ type: 'success', message: 'Значение удалено' });
        refresh();
        return true;
      } else {
        const data = await res.json();
        setNotification({ type: 'error', message: data.error || 'Ошибка удаления' });
        return false;
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
      return false;
    }
  };

  // Wrapper handlers for simple properties
  const createSimpleHandlers = (propertyType: string) => ({
    onAdd: (value: string) => handleAdd(propertyType, value),
    onUpdate: (oldValue: string, newValue: string) => handleUpdate(propertyType, oldValue, newValue),
    onDelete: (value: string) => handleDelete(propertyType, value),
  });

  // Wrapper handlers for subcategories
  const subcategoryHandlers = {
    onAdd: (parent: string, value: string) => handleAdd('Подкатегория', value, parent),
    onUpdate: (parent: string, oldValue: string, newValue: string) =>
      handleUpdate('Подкатегория', oldValue, newValue, parent),
    onDelete: (parent: string, value: string) => handleDelete('Подкатегория', value, parent),
  };

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20 text-center">
        <p className="text-lg md:text-xl">Загрузка...</p>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20 text-center">
        <h1 className="text-2xl sm:text-4xl md:text-[55px] font-bold mb-4">Доступ запрещен</h1>
        <p className="text-lg md:text-xl">Войдите в систему для доступа к этой странице.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 mt-20 md:mt-[140px] mb-20">
      <h1 className="text-2xl sm:text-4xl md:text-[55px] font-bold text-center mb-8 md:mb-[50px]">Управление свойствами</h1>

      {/* Alert */}
      {notification && (
        <div
          className={`mb-6 p-4 rounded ${
            notification.type === 'success' ? 'bg-[#28a745] text-white' : 'bg-[#dc3545] text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-4 text-xl font-bold">
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Editable properties */}
      <PropertyAccordion title="Категория" count={Array.isArray(properties['Категория']) ? properties['Категория'].length : 0}>
        <PropertyEditor
          propertyType="Категория"
          values={Array.isArray(properties['Категория']) ? properties['Категория'] : []}
          {...createSimpleHandlers('Категория')}
        />
      </PropertyAccordion>

      <PropertyAccordion
        title="Подкатегория"
        count={!Array.isArray(properties['Подкатегория']) ? Object.values(properties['Подкатегория'] || {}).flat().length : 0}
      >
        <SubcategoryManager
          subcategories={!Array.isArray(properties['Подкатегория']) ? (properties['Подкатегория'] || {}) : {}}
          categories={Array.isArray(properties['Категория']) ? properties['Категория'] : []}
          {...subcategoryHandlers}
        />
      </PropertyAccordion>

      <PropertyAccordion title="Ответственный" count={Array.isArray(properties['Ответственный']) ? properties['Ответственный'].length : 0}>
        <PropertyEditor
          propertyType="Ответственный"
          values={Array.isArray(properties['Ответственный']) ? properties['Ответственный'] : []}
          {...createSimpleHandlers('Ответственный')}
        />
      </PropertyAccordion>

      <PropertyAccordion title="Группа товаров" count={Array.isArray(properties['Группа товаров']) ? properties['Группа товаров'].length : 0}>
        <PropertyEditor
          propertyType="Группа товаров"
          values={Array.isArray(properties['Группа товаров']) ? properties['Группа товаров'] : []}
          {...createSimpleHandlers('Группа товаров')}
        />
      </PropertyAccordion>

      {/* Read-only properties */}
      <PropertyAccordion title="Тип файла" count={Array.isArray(properties['Тип файла']) ? properties['Тип файла'].length : 0}>
        <PropertyEditor
          propertyType="Тип файла"
          values={Array.isArray(properties['Тип файла']) ? properties['Тип файла'] : []}
          onAdd={() => Promise.resolve(false)}
          onUpdate={() => Promise.resolve(false)}
          onDelete={() => Promise.resolve(false)}
          readOnly
        />
      </PropertyAccordion>

      <PropertyAccordion title="Тип контента" count={Array.isArray(properties['Тип контента']) ? properties['Тип контента'].length : 0}>
        <PropertyEditor
          propertyType="Тип контента"
          values={Array.isArray(properties['Тип контента']) ? properties['Тип контента'] : []}
          onAdd={() => Promise.resolve(false)}
          onUpdate={() => Promise.resolve(false)}
          onDelete={() => Promise.resolve(false)}
          readOnly
        />
      </PropertyAccordion>

      <PropertyAccordion title="Название товара (авто)" count={Array.isArray(properties['Название товара']) ? properties['Название товара'].length : 0}>
        <PropertyEditor
          propertyType="Название товара"
          values={Array.isArray(properties['Название товара']) ? properties['Название товара'] : []}
          onAdd={() => Promise.resolve(false)}
          onUpdate={() => Promise.resolve(false)}
          onDelete={() => Promise.resolve(false)}
          readOnly
        />
        <p className="text-gray-500 text-sm mt-2">Автоматически добавляются при загрузке файлов товаров</p>
      </PropertyAccordion>

      <PropertyAccordion title="SKU (авто)" count={Array.isArray(properties['SKU']) ? properties['SKU'].length : 0}>
        <PropertyEditor
          propertyType="SKU"
          values={Array.isArray(properties['SKU']) ? properties['SKU'] : []}
          onAdd={() => Promise.resolve(false)}
          onUpdate={() => Promise.resolve(false)}
          onDelete={() => Promise.resolve(false)}
          readOnly
        />
        <p className="text-gray-500 text-sm mt-2">Автоматически добавляются при загрузке файлов товаров</p>
      </PropertyAccordion>
    </div>
  );
}
