'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const success = await login(loginValue, password);
    setSubmitting(false);
    if (success) {
      onClose();
    } else {
      setError('Неверный логин или пароль');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white p-8 rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.3)] max-w-[400px] w-[90%]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-6 text-center">Вход</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-medium mb-1 text-sm">Логин</label>
            <input
              type="text"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              className="w-full p-3 border-2 border-border rounded-lg text-base outline-none focus:border-primary box-border"
              autoFocus
              required
            />
          </div>
          <div className="mb-4">
            <label className="block font-medium mb-1 text-sm">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border-2 border-border rounded-lg text-base outline-none focus:border-primary box-border"
              required
            />
          </div>
          {error && (
            <div className="text-danger text-sm mb-4 text-center">{error}</div>
          )}
          <div className="flex gap-2.5 justify-end">
            <button
              type="button"
              className="px-5 py-2.5 bg-[#6c757d] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-black text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? 'Вход...' : 'Войти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
