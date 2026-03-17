import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-[600px] mx-auto px-4 py-20 md:py-32 text-center">
      <h1 className="text-2xl md:text-4xl font-bold mb-4">Страница не найдена</h1>
      <p className="text-gray-600 mb-8">Запрашиваемая страница не существует или была перемещена.</p>
      <Link
        href="/"
        className="inline-block px-6 py-3 bg-[#ff0000] text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
      >
        На главную
      </Link>
    </div>
  );
}
