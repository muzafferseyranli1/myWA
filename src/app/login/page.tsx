'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error('Giriş başarısız');
      }

      const data = await res.json();
      localStorage.setItem('mywa_token', data.token);
      router.push('/chat');
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111B21] px-4">
      <div className="w-full max-w-md rounded-lg bg-[#202C33] p-8 shadow-lg border border-[#222E35]">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#E9EDEF]">MyWA</h1>
          <p className="mt-2 text-[#8696A0]">WhatsApp Görev Yönetimi</p>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-900/50 p-3 text-sm text-red-200 border border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#8696A0] mb-2">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md bg-[#2A3942] border border-[#222E35] px-4 py-2 text-[#E9EDEF] focus:border-[#00A884] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#8696A0] mb-2">
              Şifre
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-[#2A3942] border border-[#222E35] px-4 py-2 text-[#E9EDEF] focus:border-[#00A884] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#00A884] px-4 py-2 font-medium text-[#111B21] hover:bg-[#008f6f] focus:outline-none disabled:opacity-50 transition-colors"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
