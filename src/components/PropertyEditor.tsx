'use client';

import { useState } from 'react';

interface PropertyEditorProps {
  propertyType: string;
  values: string[];
  onAdd: (value: string) => Promise<boolean>;
  onUpdate: (oldValue: string, newValue: string) => Promise<boolean>;
  onDelete: (value: string) => Promise<boolean>;
  readOnly?: boolean;
}

export default function PropertyEditor({
  propertyType,
  values,
  onAdd,
  onUpdate,
  onDelete,
  readOnly = false,
}: PropertyEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartEdit = (index: number, currentValue: string) => {
    setEditingIndex(index);
    setEditValue(currentValue);
  };

  const handleSaveEdit = async (oldValue: string) => {
    if (!editValue.trim() || editValue === oldValue) {
      setEditingIndex(null);
      return;
    }

    setLoading(true);
    const success = await onUpdate(oldValue, editValue.trim());
    setLoading(false);

    if (success) {
      setEditingIndex(null);
    } else {
      alert('Ошибка при обновлении');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const handleDelete = async (value: string) => {
    const confirmed = confirm(`Удалить значение "${value}"?`);
    if (!confirmed) return;

    setLoading(true);
    const success = await onDelete(value);
    setLoading(false);

    if (!success) {
      alert('Ошибка при удалении');
    }
  };

  const handleAdd = async () => {
    if (!newValue.trim()) return;

    setLoading(true);
    const success = await onAdd(newValue.trim());
    setLoading(false);

    if (success) {
      setNewValue('');
    } else {
      alert('Ошибка при добавлении');
    }
  };

  return (
    <div className="space-y-2">
      {/* Values list */}
      {values.map((value, index) => (
        <div
          key={index}
          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded group"
        >
          {editingIndex === index ? (
            <>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-[#dee2e6] rounded"
                disabled={loading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(value);
                  if (e.key === 'Escape') handleCancelEdit();
                }}
              />
              <button
                onClick={() => handleSaveEdit(value)}
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
              <span className="flex-1">{value}</span>
              {!readOnly && (
                <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                  <button
                    onClick={() => handleStartEdit(index, value)}
                    disabled={loading}
                    className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 text-sm disabled:opacity-50"
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => handleDelete(value)}
                    disabled={loading}
                    className="px-3 py-1 bg-[#dc3545] text-white rounded hover:bg-[#c82333] text-sm disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Add new value */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#dee2e6]">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Новое значение..."
            className="flex-1 px-3 py-2 border border-[#dee2e6] rounded"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newValue.trim()}
            className="px-4 py-2 bg-[#9DA1A8] text-white rounded hover:bg-[#7A7E85] disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}
