import { use } from 'react';
import BookView from '@/components/BookView.js';

export default function BookPage({ params }) {
  const { id } = use(params);
  return <BookView id={id} />;
}
