'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, KeyRound, Power, RefreshCw, Moon, Trash2, Table2, Copy } from 'lucide-react';

type NotificationSettings = { enabled: boolean; quietStart: string; weekdayEnd: string; weekendEnd: string };
type Board = { id: string; slug: string; title: string; chatId: string; chatName: string; isActive: boolean };
type AdminUser = { id: string; username: string; displayName: string; role: string; isActive: boolean; provisioned: boolean; whatsapp: string | null; createdAt: string };

function headers() { return { Authorization: 'Bearer ' + localStorage.getItem('mywa_token'), 'Content-Type': 'application/json' }; }
const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
// "Metin Yazıcı" -> "metin.yazici": usernames stay ASCII so they are easy to type at login.
const toUsername = (name: string) => name.toLocaleLowerCase('tr')
  .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' } as Record<string, string>)[c])
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '').slice(0, 32);
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
  const [usernameEdited, setUsernameEdited] = useState(false);
  const usernameError = form.username && !USERNAME.test(form.username) ? 'Boşluk ve Türkçe karakter olmadan 3-32 karakter: harf, rakam, nokta, tire, alt çizgi' : '';
  const passwordError = form.password && form.password.length < 8 ? 'En az 8 karakter olmalı' : '';

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [boardForm, setBoardForm] = useState({ chatId: '', title: '', password: '' });
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/settings', { method: 'PUT', headers: headers(), body: JSON.stringify(settings) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ayarlar kaydedilemedi');
      setSettings(data); setNotice('Bildirim saatleri kaydedildi.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const load = useCallback(async () => {
    try {
      const s = await fetch('/api/admin/settings', { headers: headers() });
      if (s.ok) setSettings(await s.json());
      const b = await fetch('/api/admin/boards', { headers: headers() });
      if (b.ok) setBoards(await b.json());
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
    if (usernameError || passwordError) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: headers(), body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kullanıcı oluşturulamadı');
      setNotice(`${data.displayName} oluşturuldu. Kullanıcı adı: ${data.username}. Giriş yapıp kendi WhatsApp'ını bağlayabilir.`);
      setForm({ username: '', displayName: '', password: '' });
      setUsernameEdited(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = async (user: AdminUser) => {
    if (window.prompt(`${user.username} kalıcı olarak silinecek: WhatsApp oturumu, tüm sohbetleri, mesajları ve görevleri. Bu işlem geri alınamaz.\n\nOnaylamak için kullanıcı adını yazın:`) !== user.username) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/users/' + user.id, { method: 'DELETE', headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Silinemedi');
      setNotice(`${user.username} kalıcı olarak silindi.`); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const boardUrl = (b: Board) => `${window.location.origin}/pano/${b.slug}`;
  const openBoardForm = async () => {
    try { const res = await fetch('/api/admin/board-chats', { headers: headers() }); if (res.ok) setGroups(await res.json()); } catch {}
  };
  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/boards', { method: 'POST', headers: headers(), body: JSON.stringify(boardForm) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Pano oluşturulamadı');
      setNotice(`Pano oluşturuldu: ${boardUrl(data)}`); setBoardForm({ chatId: '', title: '', password: '' }); setGroups([]); await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const updateBoard = async (b: Board, body: Record<string, unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/boards/' + b.id, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Güncellenemedi');
      setNotice(done); await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
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
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#54656f]">Ad Soyad</span>
              <input className={input} placeholder="Metin Yazıcı" autoComplete="off" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value, username: usernameEdited ? form.username : toUsername(e.target.value) })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#54656f]">Kullanıcı adı (girişte kullanılır)</span>
              <input className={input + (usernameError ? ' border-red-400' : '')} placeholder="metin.yazici" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={form.username} onChange={e => { setUsernameEdited(true); setForm({ ...form, username: e.target.value }); }} />
              <span className={'mt-1 block text-[11px] ' + (usernameError ? 'text-red-600' : 'text-[#667781]')}>{usernameError || 'Boşluksuz; Türkçe karakter olmadan'}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#54656f]">Şifre</span>
              <input className={input + (passwordError ? ' border-red-400' : '')} placeholder="En az 8 karakter" type="password" autoComplete="new-password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              <span className={'mt-1 block text-[11px] ' + (passwordError ? 'text-red-600' : 'text-[#667781]')}>{passwordError || 'En az 8 karakter; yalnızca rakam da olur'}</span>
            </label>
          </div>
          <button disabled={busy || !!usernameError || !!passwordError} className="mt-3 rounded-lg bg-[#00a884] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">{busy ? 'Hazırlanıyor…' : 'Oluştur'}</button>
        </form>

        {settings && (
          <form onSubmit={saveSettings} className="rounded-xl border border-[#e9edef] bg-white p-4">
            <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold"><Moon size={17} /> Bildirim saatleri</h2>
            <p className="mb-3 text-[12px] leading-5 text-[#667781]">Yasaklı saatlerde oluşturulan görevlerin bildirimleri bekletilir ve gün başlayınca gönderilir. Günlük özet de gün başlangıç saatinde (hafta içi ve hafta sonu ayrı) gider.</p>
            <label className="mb-3 flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[#00a884]" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} /> Yasaklı saat uygulansın</label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">Yasaklı saat başlangıcı</span><input type="time" required className={input} value={settings.quietStart} onChange={e => setSettings({ ...settings, quietStart: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">Hafta içi gün başlangıcı / özet</span><input type="time" required className={input} value={settings.weekdayEnd} onChange={e => setSettings({ ...settings, weekdayEnd: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">Hafta sonu gün başlangıcı / özet</span><input type="time" required className={input} value={settings.weekendEnd} onChange={e => setSettings({ ...settings, weekendEnd: e.target.value })} /></label>
            </div>
            <button disabled={busy} className="mt-3 rounded-lg bg-[#00a884] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">Kaydet</button>
          </form>
        )}

        <section className="rounded-xl border border-[#e9edef] bg-white p-4">
          <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold"><Table2 size={17} /> Ortak grup panoları</h2>
          <p className="mb-3 text-[12px] leading-5 text-[#667781]">Bir panonun bağlantısını ve şifresini bilen herkes, o gruptaki tüm kullanıcıların görevlerini görür, düzenler ve yeni görev ekler. Değişiklikler gruba duyurulur. Diğer sohbetler görünmez.</p>
          <div className="space-y-2">
            {boards.map(b => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e9edef] px-3 py-2 text-[13px]">
                <div className="min-w-0 flex-1"><div className="font-medium">{b.title} {!b.isActive && <span className="text-[#667781]">(kapalı)</span>}</div><div className="truncate text-[12px] text-[#667781]">{b.chatName} · {boardUrl(b)}</div></div>
                <button onClick={() => { void navigator.clipboard?.writeText(boardUrl(b)); setNotice('Pano bağlantısı kopyalandı.'); }} title="Bağlantıyı kopyala" aria-label="Bağlantıyı kopyala" className="rounded-full p-2 text-[#54656f] hover:bg-[#e9edef]"><Copy size={15} /></button>
                <button disabled={busy} onClick={() => { const password = window.prompt('Yeni pano şifresi (en az 6 karakter). Eski şifreyle açık oturumlar kapanır:'); if (password) void updateBoard(b, { password }, 'Pano şifresi değiştirildi.'); }} title="Şifreyi değiştir" aria-label="Şifreyi değiştir" className="rounded-full p-2 text-[#54656f] hover:bg-[#e9edef]"><KeyRound size={15} /></button>
                <button disabled={busy} onClick={() => void updateBoard(b, { isActive: !b.isActive }, b.isActive ? 'Pano kapatıldı.' : 'Pano açıldı.')} title={b.isActive ? 'Panoyu kapat' : 'Panoyu aç'} aria-label={b.isActive ? 'Panoyu kapat' : 'Panoyu aç'} className={'rounded-full p-2 hover:bg-[#e9edef] ' + (b.isActive ? 'text-red-600' : 'text-[#008069]')}><Power size={15} /></button>
              </div>
            ))}
          </div>
          {groups.length ? (
            <form onSubmit={createBoard} className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">WhatsApp grubu</span>
                <select required className={input} value={boardForm.chatId} onChange={e => setBoardForm({ ...boardForm, chatId: e.target.value, title: boardForm.title || (groups.find(g => g.id === e.target.value)?.name || '') })}>
                  <option value="">Grup seçin…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">Pano adı</span><input className={input} value={boardForm.title} onChange={e => setBoardForm({ ...boardForm, title: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium text-[#54656f]">Pano şifresi</span><input required minLength={6} type="password" autoComplete="new-password" className={input} value={boardForm.password} onChange={e => setBoardForm({ ...boardForm, password: e.target.value })} /></label>
              <div className="flex gap-2 sm:col-span-3"><button disabled={busy} className="rounded-lg bg-[#00a884] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">Panoyu oluştur</button><button type="button" onClick={() => setGroups([])} className="rounded-lg px-4 py-2 text-[14px] text-[#54656f]">Vazgeç</button></div>
            </form>
          ) : <button onClick={() => void openBoardForm()} className="mt-3 rounded-lg border border-[#00a884] px-3 py-1.5 text-[13px] text-[#008069]">+ Yeni pano</button>}
        </section>

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
                    {!user.isActive && user.role !== 'ADMIN' && <button disabled={busy} onClick={() => void remove(user)} title="Kalıcı olarak sil" aria-label="Kalıcı olarak sil" className="rounded-full p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>}
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
