'use client';

import { useEffect, useRef, useState } from 'react';

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

export interface MapBounds {
  southWest: [number, number];
  northEast: [number, number];
}

interface YandexMapProps {
  points: MapPoint[];
  onPointClick?: (point: MapPoint) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  className?: string;
}

declare global {
  interface Window {
    ymaps: any;
  }
}


export default function YandexMap({ points, onPointClick, onBoundsChange, className = '' }: YandexMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const objectManagerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const onBoundsChangeRef = useRef(onBoundsChange);

  // Keep ref updated
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  // Load Yandex Maps API
  useEffect(() => {
    if (window.ymaps) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || '';
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        setIsLoaded(true);
      });
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

    const ymaps = window.ymaps;

    // Default to Saint Petersburg area
    const defaultCenter = [59.93, 30.31]; // Saint Petersburg
    const defaultZoom = 8;

    mapInstanceRef.current = new ymaps.Map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      controls: ['zoomControl', 'fullscreenControl', 'geolocationControl'],
    });

    // Create ObjectManager without clustering
    objectManagerRef.current = new ymaps.ObjectManager({
      clusterize: false,
    });

    objectManagerRef.current.objects.options.set('preset', 'islands#grayDotIcon');

    mapInstanceRef.current.geoObjects.add(objectManagerRef.current);

    // Handle click on points - prevent default balloon behavior
    if (onPointClick) {
      objectManagerRef.current.objects.events.add('click', (e: any) => {
        e.preventDefault();
        const objectId = e.get('objectId');
        const point = points.find(p => p.id === objectId);
        if (point) {
          onPointClick(point);
        }
      });
    }

    // Handle bounds change
    const emitBounds = () => {
      if (onBoundsChangeRef.current && mapInstanceRef.current) {
        const bounds = mapInstanceRef.current.getBounds();
        if (bounds) {
          onBoundsChangeRef.current({
            southWest: bounds[0],
            northEast: bounds[1],
          });
        }
      }
    };

    mapInstanceRef.current.events.add('boundschange', emitBounds);
    // Emit initial bounds after map is ready
    setTimeout(emitBounds, 100);
    setTimeout(emitBounds, 500);
    setTimeout(emitBounds, 1000);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
        objectManagerRef.current = null;
      }
    };
  }, [isLoaded]);

  // Update points on map
  useEffect(() => {
    if (!objectManagerRef.current || !mapInstanceRef.current) return;

    const geoJson = {
      type: 'FeatureCollection',
      features: points.map(point => ({
        type: 'Feature',
        id: point.id,
        geometry: point.geometry,
        properties: {
          balloonContentHeader: point.properties.balloonContentHeader || 'Точка',
          balloonContent: point.properties.balloonContent || '',
          balloonContentFooter: point.properties.adress || point.properties.balloonContentFooter || '',
          hintContent: point.properties.hintContent || point.properties.balloonContentHeader || '',
        },
        options: {
          preset: point.options?.preset || 'islands#grayDotIcon',
        },
      })),
    };

    objectManagerRef.current.removeAll();
    objectManagerRef.current.add(geoJson);

  }, [points, isLoaded]);

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`} style={{ minHeight: '400px' }}>
        <p className="text-gray-500">Загрузка карты...</p>
      </div>
    );
  }

  return <div ref={mapContainerRef} className={className} style={{ minHeight: '400px' }} />;
}
