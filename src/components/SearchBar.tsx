'use client';

import { useState, useRef, useEffect } from 'react';
import { Product } from '@/lib/types';
import { advancedSearch } from '@/lib/search';
import { highlightText } from '@/lib/utils';

export default function SearchBar({
  products,
  onSearch,
}: {
  products: Product[];
  onSearch: (results: Product[], query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length >= 2) {
      const results = advancedSearch(products, query);
      setSuggestions(results.slice(0, 10));
      setShowSuggestions(results.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query, products]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        selectProduct(suggestions[selectedIndex]);
      } else {
        doSearch();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const selectProduct = (product: Product) => {
    setQuery(product.name);
    setShowSuggestions(false);
    onSearch([product], product.name);
  };

  const doSearch = () => {
    const results = advancedSearch(products, query);
    onSearch(results, query);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <div className="flex mb-8 items-center relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Поиск по товарам, SKU..."
          className="flex-1 px-4 md:px-5 py-3 md:py-5 border-2 border-border rounded-[25px] text-base md:text-xl outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(157,161,168,0.1)]"
        />
      </div>
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 bg-white border border-border rounded-lg shadow-sm max-h-[250px] md:max-h-[400px] overflow-y-auto z-[1000]"
        >
          {suggestions.map((product, index) => (
            <div
              key={product.name}
              className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                index === selectedIndex ? 'bg-light' : 'hover:bg-light'
              }`}
              onClick={() => selectProduct(product)}
            >
              <div
                className="font-semibold mb-1 text-dark text-base md:text-xl"
                dangerouslySetInnerHTML={{ __html: highlightText(product.name, query) }}
              />
              <div className="text-sm text-gray-500 font-mono">
                SKU: {product.skus.map((sku, i) => (
                  <span key={sku}>
                    {i > 0 && ', '}
                    <span dangerouslySetInnerHTML={{ __html: highlightText(sku, query) }} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-gray-500 -mt-4 text-center">
        Поддерживается поиск по имени товара, SKU, с транслитерацией и учетом опечаток
      </div>
    </div>
  );
}
