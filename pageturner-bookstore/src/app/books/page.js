import { redirect } from 'next/navigation';

// Old catalogue address: keep every existing link working by sending it to the shelves with the same filters.
export default async function BooksPage({ searchParams }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(qs ? `/?${qs}` : '/');
}
