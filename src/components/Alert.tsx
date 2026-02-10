'use client';

import { AlertType } from '@/lib/types';

const alertStyles: Record<AlertType, string> = {
  success: 'bg-[#d4edda] text-[#155724] border-[#c3e6cb]',
  warning: 'bg-[#fff3cd] text-[#856404] border-[#ffeaa7]',
  error: 'bg-[#f8d7da] text-[#721c24] border-[#f5c6cb]',
};

export default function Alert({
  type,
  message,
  children,
}: {
  type: AlertType;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`p-4 rounded-lg mb-5 border ${alertStyles[type]}`}>
      {message && <span>{message}</span>}
      {children}
    </div>
  );
}
