import Link from 'next/link';
import { CATEGORY_COLORS } from '@/lib/utils';

interface CategoryData {
  name: string;
  subcategories: string[];
}

export default function CategorySection({ categories }: { categories: CategoryData[] }) {
  return (
    <div className="max-w-[1440px] mx-auto mt-[70px] px-8">
      <div className="flex flex-col flex-wrap">
        {categories.map((cat, index) => {
          const colors = CATEGORY_COLORS[index] || CATEGORY_COLORS[0];
          return (
            <div
              key={cat.name}
              className="flex -mt-5 p-10 rounded-t-[20px] justify-between max-md:flex-col max-md:gap-4"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              <Link
                href={`/all-files?category=${encodeURIComponent(cat.name)}`}
                className="font-light text-[28px] pb-2.5 no-underline"
                style={{ color: colors.text }}
              >
                {cat.name}
              </Link>
              <div className="pb-2.5 max-md:flex max-md:flex-wrap max-md:gap-2.5">
                {cat.subcategories.map((sub) => (
                  <Link
                    key={sub}
                    href={`/all-files?subcategory=${encodeURIComponent(sub)}`}
                    className="font-light text-lg ml-5 max-md:ml-0 rounded-[30px] px-8 py-2.5 no-underline border"
                    style={{ borderColor: colors.border, color: colors.text }}
                  >
                    {sub}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
