import { Suspense } from 'react';
import Shelf from '@/components/Shelf.js';
import { Loading } from '@/components/ui.js';

// The shop opens straight onto the shelves: no landing page in front of the catalogue.
export default function Home() {
  return <Suspense fallback={<Loading />}><Shelf /></Suspense>;
}
