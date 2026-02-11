'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import YandexMap from '@/components/YandexMap';

interface MapPoint {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    balloonContentHeader: string;
    balloonContent: string;
    balloonContentFooter: string;
    hintContent: string;
    adress: string;
  };
  options: {
    preset: string;
  };
}

interface PointsCollection {
  type: 'FeatureCollection';
  features: MapPoint[];
}

// Point type presets
const POINT_TYPES = {
  'islands#grayDotIcon': { label: 'Точка продаж', color: '#9DA1A8' },
  'islands#redDotIcon': { label: 'Официальная точка продаж', color: '#dc3545' },
  'islands#blueDotIcon': { label: 'Дилер', color: '#007bff' },
} as const;

type PresetType = keyof typeof POINT_TYPES;

function getPointTypeLabel(preset?: string): string {
  return POINT_TYPES[preset as PresetType]?.label || 'Неизвестный тип';
}

function getPointTypeColor(preset?: string): string {
  return POINT_TYPES[preset as PresetType]?.color || '#9DA1A8';
}

interface EditFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  coordinates: string;
  preset: string;
}

function parseCoordinates(coordString: string): { latitude: number; longitude: number } | null {
  const parts = coordString.split(',').map(s => s.trim());
  if (parts.length !== 2) return null;
  const latitude = parseFloat(parts[0]);
  const longitude = parseFloat(parts[1]);
  if (isNaN(latitude) || isNaN(longitude)) return null;
  return { latitude, longitude };
}

function parsePointContent(point: MapPoint): EditFormData {
  const content = point.properties?.balloonContent || '';

  const phoneMatch = content.match(/Телефон: ([^<]*)/);
  const emailMatch = content.match(/Email: ([^<]*)/);
  const websiteMatch = content.match(/href='([^']+)'/);

  const lat = point.geometry?.coordinates?.[0] || 59.93;
  const lng = point.geometry?.coordinates?.[1] || 30.31;

  return {
    name: point.properties?.balloonContentHeader || '',
    address: point.properties?.adress || point.properties?.balloonContentFooter || '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    email: emailMatch ? emailMatch[1].trim() : '',
    website: websiteMatch ? websiteMatch[1] : '',
    coordinates: `${lat}, ${lng}`,
    preset: point.options?.preset || 'islands#grayDotIcon',
  };
}

export default function PointsAdminPage() {
  const { isAuth, loading } = useAuth();
  const [points, setPoints] = useState<PointsCollection | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPoint, setEditingPoint] = useState<MapPoint | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newPointData, setNewPointData] = useState<EditFormData>({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    coordinates: '',
    preset: 'islands#grayDotIcon',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download Excel template
  const handleDownloadTemplate = () => {
    window.location.href = '/api/points/template';
  };

  // Upload Excel file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/points/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh points list
        const pointsRes = await fetch('/api/points');
        const pointsData = await pointsRes.json();
        setPoints(pointsData);

        setNotification({
          type: 'success',
          message: `Импортировано ${data.imported} из ${data.total} точек`,
        });
      } else {
        setNotification({
          type: 'error',
          message: data.error || 'Ошибка импорта',
        });
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка загрузки файла' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Load points
  useEffect(() => {
    if (isAuth) {
      fetch('/api/points')
        .then((r) => r.json())
        .then(setPoints)
        .catch(() => {
          setNotification({ type: 'error', message: 'Ошибка загрузки точек' });
        });
    }
  }, [isAuth]);

  // Auto-dismiss alerts
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Filter and sort points by search query
  const searchFilteredPoints = useMemo(() => {
    if (!points?.features) return [];

    // Filter out invalid points first
    const validPoints = points.features.filter(
      (p) => p && p.id != null && p.properties && p.geometry
    );

    const query = searchQuery.toLowerCase().trim();

    // If no search query, return all points sorted by ID
    if (!query) {
      return [...validPoints].sort((a, b) => a.id - b.id);
    }

    // Filter and calculate relevance score
    const scored = validPoints
      .map((point) => {

        const header = (point.properties?.balloonContentHeader || '').toLowerCase();
        const adress = (point.properties?.adress || '').toLowerCase();
        const footer = (point.properties?.balloonContentFooter || '').toLowerCase();
        const idStr = point.id?.toString() || '';

        // Calculate relevance score (higher = more relevant)
        let score = 0;

        if (header === query) {
          score = 100; // Exact match in name
        } else if (header.startsWith(query)) {
          score = 80; // Name starts with query
        } else if (header.includes(query)) {
          score = 60; // Name contains query
        } else if (adress.startsWith(query)) {
          score = 40; // Address starts with query
        } else if (adress.includes(query) || footer.includes(query)) {
          score = 20; // Address/footer contains query
        } else if (idStr.includes(query)) {
          score = 10; // ID contains query
        }

        if (score === 0) return null;

        return { point, score };
      })
      .filter((item): item is { point: MapPoint; score: number } => item !== null);

    // Sort by score (descending), then by ID
    return scored
      .sort((a, b) => b.score - a.score || a.point.id - b.point.id)
      .map((item) => item.point);
  }, [points, searchQuery]);

  // Start editing
  const handleEdit = (point: MapPoint) => {
    setEditingPoint(point);
    setEditFormData(parsePointContent(point));
    setIsAddingNew(false);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingPoint(null);
    setEditFormData(null);
    setIsAddingNew(false);
    setNewPointData({
      name: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      coordinates: '',
      preset: 'islands#grayDotIcon',
    });
  };

  // Save edited point
  const handleSaveEdit = async () => {
    if (!editingPoint || !editFormData) return;

    if (!editFormData.name.trim()) {
      setNotification({ type: 'error', message: 'Заполните название' });
      return;
    }
    if (!editFormData.address.trim()) {
      setNotification({ type: 'error', message: 'Заполните адрес' });
      return;
    }
    const coords = parseCoordinates(editFormData.coordinates);
    if (!coords) {
      setNotification({ type: 'error', message: 'Неверный формат координат. Пример: 59.924668, 30.288937' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/points', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPoint.id,
          name: editFormData.name,
          address: editFormData.address,
          phone: editFormData.phone,
          email: editFormData.email,
          website: editFormData.website,
          latitude: coords.latitude,
          longitude: coords.longitude,
          preset: editFormData.preset,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPoints((prev) => {
          if (!prev) return prev;
          const idx = prev.features.findIndex((f) => f.id === editingPoint.id);
          if (idx !== -1) {
            const newFeatures = [...prev.features];
            newFeatures[idx] = data.point;
            return { ...prev, features: newFeatures };
          }
          return prev;
        });
        setNotification({ type: 'success', message: 'Точка обновлена' });
        handleCancelEdit();
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Ошибка сохранения' });
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
    } finally {
      setIsSaving(false);
    }
  };

  // Add new point
  const handleAddNew = async () => {
    if (!newPointData.name.trim()) {
      setNotification({ type: 'error', message: 'Заполните название' });
      return;
    }
    if (!newPointData.address.trim()) {
      setNotification({ type: 'error', message: 'Заполните адрес' });
      return;
    }
    const coords = parseCoordinates(newPointData.coordinates);
    if (!coords) {
      setNotification({ type: 'error', message: 'Неверный формат координат. Пример: 59.924668, 30.288937' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPointData.name,
          address: newPointData.address,
          phone: newPointData.phone,
          email: newPointData.email,
          website: newPointData.website,
          latitude: coords.latitude,
          longitude: coords.longitude,
          preset: newPointData.preset,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPoints((prev) => {
          if (!prev) return prev;
          return { ...prev, features: [...prev.features, data.point] };
        });
        setNotification({ type: 'success', message: 'Точка добавлена' });
        handleCancelEdit();
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Ошибка добавления' });
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete point
  const handleDelete = async (point: MapPoint) => {
    if (!confirm(`Удалить точку "${point.properties?.balloonContentHeader || 'без названия'}"?`)) return;

    try {
      const res = await fetch(`/api/points?id=${point.id}`, { method: 'DELETE' });

      if (res.ok) {
        setPoints((prev) => {
          if (!prev) return prev;
          return { ...prev, features: prev.features.filter((f) => f.id !== point.id) };
        });
        setNotification({ type: 'success', message: 'Точка удалена' });
        if (editingPoint?.id === point.id) {
          handleCancelEdit();
        }
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Ошибка удаления' });
      }
    } catch {
      setNotification({ type: 'error', message: 'Ошибка сети' });
    }
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
      <h1 className="text-2xl sm:text-4xl md:text-[55px] font-bold text-center mb-8 md:mb-[50px]">
        Управление точками на карте
      </h1>

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

      {/* Add Button and Excel Import/Export */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <button
          onClick={() => {
            setIsAddingNew(true);
            setEditingPoint(null);
            setEditFormData(null);
          }}
          className="px-6 py-2 bg-[#28a745] text-white rounded hover:bg-[#218838] transition-colors"
        >
          + Добавить точку
        </button>
      </div>

      {/* Excel Import/Export */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2 bg-[#007bff] text-white rounded hover:bg-[#0056b3] transition-colors text-sm"
        >
          Скачать шаблон Excel
        </button>
        <label className={`px-4 py-2 bg-[#17a2b8] text-white rounded hover:bg-[#138496] transition-colors text-sm cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isUploading ? 'Загрузка...' : 'Загрузить из Excel'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Stats */}
      <p className="text-[#9DA1A8] mb-4">
        Всего точек: {points?.features.length || 0}
      </p>

      {/* Map */}
      {points && points.features.length > 0 && (
        <div className="mb-6">
          <YandexMap
            points={searchFilteredPoints}
            onPointClick={handleEdit}
            className="w-full h-[400px] rounded-lg border border-[#dee2e6]"
          />
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <p className="text-sm text-[#9DA1A8]">
              Нажмите на точку на карте для редактирования
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(POINT_TYPES).map(([preset, { label, color }]) => (
                <span key={preset} className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[#9DA1A8]">{label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Поиск по названию, адресу или ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
        />
        {searchQuery && (
          <p className="text-sm text-[#9DA1A8] mt-2">
            Найдено: {searchFilteredPoints.length} из {points?.features.length || 0}
          </p>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAddingNew || editingPoint) && (
        <div className="bg-gray-50 border border-[#dee2e6] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">
            {isAddingNew ? 'Добавить новую точку' : `Редактировать: ${editingPoint?.properties?.balloonContentHeader || 'Точка'}`}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={isAddingNew ? newPointData.name : editFormData?.name || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, name: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Адрес <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={isAddingNew ? newPointData.address : editFormData?.address || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, address: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, address: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Телефон</label>
              <input
                type="text"
                value={isAddingNew ? newPointData.phone : editFormData?.phone || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, phone: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, phone: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={isAddingNew ? newPointData.email : editFormData?.email || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, email: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, email: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Сайт</label>
              <input
                type="url"
                value={isAddingNew ? newPointData.website : editFormData?.website || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, website: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, website: e.target.value })
                }
                placeholder="https://..."
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Координаты <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={isAddingNew ? newPointData.coordinates : editFormData?.coordinates || ''}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, coordinates: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, coordinates: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Тип точки</label>
              <select
                value={isAddingNew ? newPointData.preset : editFormData?.preset || 'islands#grayDotIcon'}
                onChange={(e) =>
                  isAddingNew
                    ? setNewPointData({ ...newPointData, preset: e.target.value })
                    : setEditFormData((prev) => prev && { ...prev, preset: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#dee2e6] rounded focus:outline-none focus:border-[#9DA1A8] bg-white"
              >
                {Object.entries(POINT_TYPES).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={isAddingNew ? handleAddNew : handleSaveEdit}
              disabled={isSaving}
              className="px-6 py-2 bg-[#28a745] text-white rounded hover:bg-[#218838] transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-6 py-2 bg-[#9DA1A8] text-white rounded hover:bg-[#7c8085] transition-colors"
            >
              Отмена
            </button>
            {!isAddingNew && editingPoint && (
              <button
                onClick={() => handleDelete(editingPoint)}
                className="px-6 py-2 bg-[#dc3545] text-white rounded hover:bg-[#c82333] transition-colors ml-auto"
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      )}

      {/* Points Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-[#dee2e6] px-4 py-3 text-left">ID</th>
              <th className="border border-[#dee2e6] px-4 py-3 text-left">Тип</th>
              <th className="border border-[#dee2e6] px-4 py-3 text-left">Название</th>
              <th className="border border-[#dee2e6] px-4 py-3 text-left">Адрес</th>
              <th className="border border-[#dee2e6] px-4 py-3 text-left">Координаты</th>
              <th className="border border-[#dee2e6] px-4 py-3 text-center w-[150px]">Действия</th>
            </tr>
          </thead>
          <tbody>
            {searchFilteredPoints.map((point) => {
              if (!point || !point.properties) return null;
              return (
              <tr
                key={point.id}
                className={`hover:bg-gray-50 ${editingPoint?.id === point.id ? 'bg-yellow-50' : ''}`}
              >
                <td className="border border-[#dee2e6] px-4 py-3">{point.id}</td>
                <td className="border border-[#dee2e6] px-4 py-3">
                  <span
                    className="inline-block px-2 py-1 rounded text-white text-xs font-medium"
                    style={{ backgroundColor: getPointTypeColor(point.options?.preset) }}
                  >
                    {getPointTypeLabel(point.options?.preset)}
                  </span>
                </td>
                <td className="border border-[#dee2e6] px-4 py-3">{point.properties?.balloonContentHeader || '—'}</td>
                <td className="border border-[#dee2e6] px-4 py-3">
                  {point.properties?.adress || point.properties?.balloonContentFooter || '—'}
                </td>
                <td className="border border-[#dee2e6] px-4 py-3 text-sm text-[#9DA1A8]">
                  {point.geometry?.coordinates?.[0]?.toFixed(6) || '—'}, {point.geometry?.coordinates?.[1]?.toFixed(6) || '—'}
                </td>
                <td className="border border-[#dee2e6] px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => handleEdit(point)}
                      className="px-3 py-1 text-sm bg-[#007bff] text-white rounded hover:bg-[#0056b3] transition-colors"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => handleDelete(point)}
                      className="px-3 py-1 text-sm bg-[#dc3545] text-white rounded hover:bg-[#c82333] transition-colors"
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {searchFilteredPoints.length === 0 && (
          <p className="text-center text-[#9DA1A8] py-8">
            {searchQuery ? 'Ничего не найдено' : (points ? 'Нет точек' : 'Загрузка точек...')}
          </p>
        )}
      </div>
    </div>
  );
}
