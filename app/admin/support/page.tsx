'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSupportPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to main admin page with support view
    router.replace('/admin?view=support');
  }, [router]);

  return null;
}

