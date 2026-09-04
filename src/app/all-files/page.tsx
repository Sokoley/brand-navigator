import { redirect } from 'next/navigation';

export default function AllFilesPage({
  searchParams,
}: {
  searchParams: { category?: string; subcategory?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set('category', searchParams.category);
  if (searchParams.subcategory) params.set('subcategory', searchParams.subcategory);
  const qs = params.toString();
  redirect(qs ? `/products?${qs}` : '/products');
}
