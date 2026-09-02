'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mywa_token');
    if (token) {
      router.push('/chat');
    } else {
      router.push('/login');
    }
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111B21]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#00A884]"></div>
      </div>
    );
  }

  return null;
}
