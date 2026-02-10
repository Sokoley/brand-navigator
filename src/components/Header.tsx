'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import LoginModal from './LoginModal';

export default function Header() {
  const { isAuth, loading, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="shadow-sm">
        <div className="max-w-[1440px] mx-auto flex justify-between items-center px-4 md:px-8 py-4 bg-white">
          <Link href="/">
            <img
              className="w-[80px] md:w-[100px]"
              src="https://smazka.ru/wp-content/uploads/2023/12/logo_ru_black.png"
              alt="Logo"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {isAuth && (
              <Link href="/all-files" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
                Все макеты
              </Link>
            )}
            <Link href="/products" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
              Все товары
            </Link>
            {isAuth && (
              <>
                <Link href="/admin/properties" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
                  Свойства
                </Link>
                <Link href="/admin/points" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
                  Точки на карте
                </Link>
                <Link href="/upload-product" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
                  Добавить товар
                </Link>
                <Link href="/upload" className="text-black px-4 py-2 no-underline font-medium text-sm lg:text-base lg:px-5 lg:py-2.5">
                  Загрузить файлы
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Auth Button */}
            <div className="hidden md:block">
              {loading ? (
                <span className="bg-gray-300 text-white px-6 lg:px-10 py-2 lg:py-2.5 rounded-[20px] font-medium text-sm">...</span>
              ) : isAuth ? (
                <button
                  onClick={logout}
                  className="bg-black text-white px-6 lg:px-10 py-2 lg:py-2.5 rounded-[20px] font-medium border-none cursor-pointer text-sm"
                >
                  Выход
                </button>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="bg-black text-white px-6 lg:px-10 py-2 lg:py-2.5 rounded-[20px] font-medium border-none cursor-pointer text-sm"
                >
                  Вход
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-2xl bg-transparent border-none cursor-pointer"
              aria-label="Меню"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 px-4 py-4">
            <div className="flex flex-col gap-2">
              {isAuth && (
                <Link
                  href="/all-files"
                  className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                  onClick={() => setMenuOpen(false)}
                >
                  Все макеты
                </Link>
              )}
              <Link
                href="/products"
                className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                Все товары
              </Link>
              {isAuth && (
                <>
                  <Link
                    href="/admin/properties"
                    className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Свойства
                  </Link>
                  <Link
                    href="/admin/points"
                    className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Точки на карте
                  </Link>
                  <Link
                    href="/upload-product"
                    className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Добавить товар
                  </Link>
                  <Link
                    href="/upload"
                    className="text-black px-4 py-3 no-underline font-medium rounded-lg hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Загрузить файлы
                  </Link>
                </>
              )}
              <div className="border-t border-gray-200 pt-3 mt-2">
                {loading ? (
                  <span className="block text-center bg-gray-300 text-white px-6 py-3 rounded-[20px] font-medium">...</span>
                ) : isAuth ? (
                  <button
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                    }}
                    className="w-full bg-black text-white px-6 py-3 rounded-[20px] font-medium border-none cursor-pointer"
                  >
                    Выход
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowLogin(true);
                      setMenuOpen(false);
                    }}
                    className="w-full bg-black text-white px-6 py-3 rounded-[20px] font-medium border-none cursor-pointer"
                  >
                    Вход
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
