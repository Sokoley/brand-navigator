'use client';

import { useState } from 'react';

interface SubcategoryManagerProps {
  subcategories: Record<string, string[]>;
  categories: string[];
  onAdd: (parent: string, value: string) => Promise<boolean>;
  onUpdate: (parent: string, oldValue: string, newValue: string) => Promise<boolean>;
  onDelete: (parent: string, value: string) => Promise<boolean>;
}

export default function SubcategoryManager({
  subcategories,
  categories,
  onAdd,
  onUpdate,
  onDelete,
}: SubcategoryManagerProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleStartEdit = (parent: string, subcat: string, key: string) => {
    setEditingKey(key);
    setEditValue(subcat);
  };

  const handleSaveEdit = async (parent: string, oldValue: string) => {
    if (!editValue.trim() || editValue === oldValue) {
      setEditingKey(null);
      return;
    }

    setLoading(true);
    const success = await onUpdate(parent, oldValue, editValue.trim());
    setLoading(false);

    if (success) {
      setEditingKey(null);
    } else {
      alert('Ошибка при обновлении');
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const handleDelete = async (parent: string, value: string) => {
    const confirmed = confirm(`Удалить подкатегорию "${value}"?`);
    if (!confirmed) return;

    setLoading(true);
    const success = await onDelete(parent, value);
    setLoading(false);

    if (!success) {
      alert('Ошибка при удалении');
    }
  };

  const handleAdd = async (parent: string) => {
    const value = newValues[parent]?.trim();
    if (!value) return;

    setLoading(true);
    const success = await onAdd(parent, value);
    setLoading(false);

    if (success) {
      setNewValues({ ...newValues, [parent]: '' });
    } else {
      alert('Ошибка при добавлении');
    }
  };

  const setNewValue = (parent: string, value: string) => {
    setNewValues({ ...newValues, [parent]: value });
  };

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const subcats = subcategories[category] || [];
        return (
          <div key={category} className="border border-[#dee2e6] rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-[#9DA1A8]">{category}</h3>
            <div className="ml-4 space-y-2">
              {subcats.map((subcat, index) => {
                const editKey = `${category}-${index}`;
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded group"
                  >
                    {editingKey === editKey ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-3 py-2 border border-[#dee2e6] rounded"
                          disabled={loading}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(category, subcat);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <button
                          onClick={() => handleSaveEdit(category, subcat)}
                          disabled={loading}
                          className="px-3 py-2 bg-[#9DA1A8] text-white rounded hover:bg-[#7A7E85] disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={loading}
                          className="px-3 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">{subcat}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                          <button
                            onClick={() => handleStartEdit(category, subcat, editKey)}
                            disabled={loading}
                            className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 text-sm disabled:opacity-50"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => handleDelete(category, subcat)}
                            disabled={loading}
                            className="px-3 py-1 bg-[#dc3545] text-white rounded hover:bg-[#c82333] text-sm disabled:opacity-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Add new subcategory */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#dee2e6]">
                <input
                  type="text"
                  value={newValues[category] || ''}
                  onChange={(e) => setNewValue(category, e.target.value)}
                  placeholder={`Новая подкатегория для ${category}...`}
                  className="flex-1 px-3 py-2 border border-[#dee2e6] rounded"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd(category);
                  }}
                />
                <button
                  onClick={() => handleAdd(category)}
                  disabled={loading || !(newValues[category]?.trim())}
                  className="px-4 py-2 bg-[#9DA1A8] text-white rounded hover:bg-[#7A7E85] disabled:opacity-50"
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
