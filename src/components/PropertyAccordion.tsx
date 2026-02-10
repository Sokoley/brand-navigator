'use client';

import { useState, ReactNode } from 'react';

interface PropertyAccordionProps {
  title: string;
  count: number;
  children: ReactNode;
}

export default function PropertyAccordion({ title, count, children }: PropertyAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[#dee2e6] rounded-lg mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <span className="bg-[#9DA1A8] text-white px-3 py-1 rounded-full text-sm">
            {count}
          </span>
        </div>
        <svg
          className={`w-6 h-6 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="p-6 border-t border-[#dee2e6]">
          {children}
        </div>
      )}
    </div>
  );
}
