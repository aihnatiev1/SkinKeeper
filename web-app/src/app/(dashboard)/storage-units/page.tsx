'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StorageUnitsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/transfer');
  }, [router]);
  return null;
}
