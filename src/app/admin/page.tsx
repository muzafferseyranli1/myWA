'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, KeyRound, Power, RefreshCw } from 'lucide-react';

type AdminUser = { id: string; username: string; displayName: string; role: string; isActive: boolean; provisioned: boolean; whatsapp: string | null; createdAt: string };

function headers() { return { Authorization: 'Bearer ' + localStorage.getItem('mywa_token'), 'Content-Type': 'application/json' }; }
const waLabel = (status: string | null) => status === 'connected' ? 'Bağlı' : status === 'qr' ? 'QR bekliyor' : status === 'connecting' ? 'Bağlanıyor' : status ? 'Bağlı değil' : '—';

/**
 * Account management for administrators. Each user owns an isolated WhatsApp
 * account and data store; this page manages accounts only and never shows
 * another user's chats, messages or QR code.
 */
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<string>('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Kullanıcılar alınamadı');
      setUsers(await res.json());
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('mywa_token')) { router.push('/login'); return; }
    void fetch('/api/auth/me', { headers: headers() }).then(async res => {
      if (res.status === 401) { router.push('/login'); return; }
      const user = await res.json();
      if (user.role !== 'ADMIN') { router.push('/chat'); return; }
      setMe(user.id);
      void load();
    }).catch(() => setError('Oturum doğrulanamadı'));
  }, [router, load]);

  const update = async (id: string, body: Record<string, unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/users/' + id, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Güncellenemedi');
      setNotice(done); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: headers(), body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kullanıcı oluşturulamadı');
      setNotice(`${data.username} oluşturuldu. Giriş yapıp kendi WhatsApp'ını QR ile bağlayabilir.`);
      setForm({ username: '', displayName: '', password: '' });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const resetPassword = (user: AdminUser) => {
    const password = window.prompt(`${user.username} için yeni şifre (en az 8 karakter):`);
    if (password) void update(user.id, { password }, 'Şifre güncellendi.');
  };
  const toggle = (user: AdminUser) => {
    if (user.isActive && !window.confirm(`${user.username} devre dışı bırakılsın mı? WhatsApp oturumu durdurulur ve panele erişemez. Verileri silinmez.`)) return;
    void update(user.id, { isActive: !user.isActive }, user.isActive ? 'Kullanıcı devre dışı bırakıldı.' : 'Kullanıcı yeniden etkinleştirildi.');
  };

  const input = 'w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-[14px] outline-none focus:border-[#00a884]';
  return (
    <div className="min-h-dvh bg-[#f7f8fa] text-[#111b21]">
      <header className="flex min-h-[48px] items-center gap-3 border-b border-[#e9edef] bg-white px-4">
        <button onClick={() => router.push('/chat')} aria-label="Geri" className="rounded-full p-2 text-[#54656f] hover:bg-[#e9edef]"><ArrowLeft size={20} /></button>
        <h1 className="text-[16px] font-bold text-[#008069]">Kullanıcılar</h1>
        <button onClick={() => void load()} aria-label="Yenile" className="ml-auto rounded-full p-2 text-[#54656f] hover:bg-[#e9edef]"><RefreshCw size={18} /></button>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-3 py-4 sm:px-4 sm:py-6">
        <p className="text-[13px] leading-5 text-[#667781]">Her kullanıcı kendi WhatsApp numarasını bağlar ve yalnızca kendi sohbetlerini, mesajlarını ve görevlerini görür. Yöneticiler hesapları yönetebilir ama başka kullanıcıların verilerine erişemez.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-[13px] text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-[#d9fdd3] px-4 py-2 text-[13px] text-[#0b5c46]">{notice}</p>}

        <form onSubmit={create} className="rounded-xl border border-[#e9edef] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold"><UserPlus size={17} /> Yeni kullanıcı</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className={input} placeholder="Kullanıcı adı" autoComplete="off" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            <input className={input} placeholder="Görünen ad" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
            <input className={input} placeholder="Şifre (en az 8)" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <button disabled={busy} className="mt-3 rounded-lg bg-[#00a884] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">{busy ? 'Hazırlanıyor…' : 'Oluştur'}</button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-[#e9edef] bg-white">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[#e9edef] text-[#667781]">
              <tr><th className="px-4 py-2 font-medium">Kullanıcı</th><th className="hidden px-4 py-2 font-medium sm:table-cell">Rol</th><th className="px-4 py-2 font-medium">WhatsApp</th><th className="px-4 py-2 font-medium">Durum</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-[#f0f2f5] last:border-0">
                  <td className="px-4 py-3"><div className="font-medium">{user.displayName}</div><div className="text-[#667781]">{user.username}</div></td>
                  <td className="hidden px-4 py-3 sm:table-cell">{user.role === 'ADMIN' ? 'Yönetici' : 'Kullanıcı'}</td>
                  <td className="px-4 py-3">{user.provisioned ? waLabel(user.whatsapp) : 'Hazırlanmadı'}</td>
                  <td className="px-4 py-3">{user.isActive ? <span className="text-[#008069]">Etkin</span> : <span className="text-[#667781]">Devre dışı</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {user.isActive && !user.provisioned && <button disabled={busy} onClick={() => void update(user.id, {}, "Hesap hazırlandı. Kullanıcı boş bir alanla başlar ve kendi WhatsApp'ını bağlar.")} className="mr-1 rounded-lg border border-[#00a884] px-2 py-1 text-[12px] text-[#008069]">Hazırla</button>}
                    <button disabled={busy} onClick={() => resetPassword(user)} title="Şifre sıfırla" aria-label="Şifre sıfırla" className="rounded-full p-2 text-[#54656f] hover:bg-[#e9edef]"><KeyRound size={16} /></button>
                    {user.id !== me && <button disabled={busy} onClick={() => toggle(user)} title={user.isActive ? 'Devre dışı bırak' : 'Etkinleştir'} aria-label={user.isActive ? 'Devre dışı bırak' : 'Etkinleştir'} className={'rounded-full p-2 hover:bg-[#e9edef] ' + (user.isActive ? 'text-red-600' : 'text-[#008069]')}><Power size={16} /></button>}
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-[#667781]">Yükleniyor…</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
