'use client';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, LogOut, Plus, RefreshCw, Search, X, ExternalLink, Check } from 'lucide-react';

type Assignee = { contactId: string; name: string; completedAt?: string | null; committedDueDate?: string | null };
type Row = { ref: string; owner: string; title: string; priority: string; status: string; dueDate: string | null; assignees: Assignee[]; createdAt: string; updatedAt: string; link: string };
type Member = { contactId: string; name: string };

const PRIORITY: Record<string, string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek', URGENT: 'Acil' };
const STATUS: Record<string, string> = { TODO: 'Yapılacak', IN_PROGRESS: 'Devam ediyor', DONE: 'Tamamlandı' };
const STATUS_STYLE: Record<string, string> = { TODO: 'bg-amber-50 text-amber-800', IN_PROGRESS: 'bg-blue-50 text-blue-800', DONE: 'bg-green-50 text-green-800' };
// Due dates are stored as UTC midnight of the chosen day.
const dayValue = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const dayLabel = (d: string) => new Date(d).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Picks group members; changes are applied when the picker closes. */
function AssigneePicker({ members, value, onClose }: { members: Member[]; value: string[]; onClose: (ids: string[] | null) => void }) {
  const [picked, setPicked] = useState(new Set(value));
  const [query, setQuery] = useState('');
  const shown = members.filter(m => m.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  const toggle = (id: string) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => onClose(null)}>
      <div className="w-full max-w-sm rounded-t-xl bg-white p-3 shadow-xl sm:rounded-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#d1d7db] px-2">
          <Search size={16} className="text-[#667781]" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Kişi ara…" className="w-full py-2 text-sm outline-none" />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {shown.map(m => (
            <label key={m.contactId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#f0f2f5]">
              <input type="checkbox" checked={picked.has(m.contactId)} onChange={() => toggle(m.contactId)} /> {m.name}
            </label>
          ))}
          {!shown.length && <p className="p-3 text-center text-xs text-[#667781]">Kişi bulunamadı</p>}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={() => onClose(null)} className="rounded-lg px-3 py-1.5 text-sm text-[#54656f]">Vazgeç</button>
          <button onClick={() => onClose([...picked])} className="rounded-lg bg-[#00a884] px-3 py-1.5 text-sm font-medium text-white">Uygula ({picked.size})</button>
        </div>
      </div>
    </div>
  );
}

export default function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const storageKey = `mywa-board:${slug}`;
  const [title, setTitle] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [editor, setEditor] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ ref: string; field: string } | null>(null);
  const [picker, setPicker] = useState<{ ref: string | null; value: string[] } | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [personFilter, setPersonFilter] = useState('');
  const [draft, setDraft] = useState({ title: '', priority: 'MEDIUM', dueDate: '', assigneeIds: [] as string[] });
  const [login, setLogin] = useState({ name: '', password: '' });
  const busy = useRef(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`/api/boards/${slug}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    if (res.status === 401 && token) { localStorage.removeItem(storageKey); setToken(null); throw new Error('Oturum sona erdi; yeniden giriş yapın'); }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'İşlem başarısız');
    return res;
  }, [slug, token, storageKey]);

  useEffect(() => {
    fetch(`/api/boards/${slug}`).then(r => r.ok ? r.json() : Promise.reject()).then(b => setTitle(b.title)).catch(() => setError('Pano bulunamadı'));
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved?.token) { setToken(saved.token); setEditor(saved.name); } } catch {}
  }, [slug, storageKey]);

  const load = useCallback(async () => {
    if (!token || busy.current) return;
    try {
      const [t, m] = await Promise.all([api('/tasks').then(r => r.json()), members.length ? Promise.resolve(members) : api('/members').then(r => r.json())]);
      setRows(t); setMembers(m); setError('');
    } catch (e: any) { setError(e.message); }
  }, [api, token, members]);

  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Others edit the same board; refresh unless the user is in the middle of an edit.
    const timer = setInterval(() => { if (!editing && !picker) void load(); }, 20000);
    return () => clearInterval(timer);
  }, [load, editing, picker]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const res = await fetch(`/api/boards/${slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Giriş yapılamadı');
      localStorage.setItem(storageKey, JSON.stringify({ token: data.token, name: data.name }));
      setToken(data.token); setEditor(data.name); setLogin({ name: '', password: '' });
    } catch (err: any) { setError(err.message); }
  };

  const save = async (ref: string, patch: Record<string, unknown>) => {
    setSaving(ref); busy.current = true; setError('');
    try {
      const updated: Row = await (await api(`/tasks/${encodeURIComponent(ref)}`, { method: 'PATCH', body: JSON.stringify(patch) })).json();
      setRows(prev => prev.map(r => r.ref === ref ? updated : r));
      setNotice('Kaydedildi. Değişiklik 2 dakika içinde gruba bildirilecek.');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); busy.current = false; setEditing(null); }
  };

  const addTask = async () => {
    if (!draft.title.trim()) return;
    setSaving('new'); setError('');
    try {
      const created: Row = await (await api('/tasks', { method: 'POST', body: JSON.stringify({ ...draft, dueDate: draft.dueDate || null }) })).json();
      setRows(prev => [created, ...prev]);
      setDraft({ title: '', priority: 'MEDIUM', dueDate: '', assigneeIds: [] });
      setNotice('Görev eklendi ve gruba duyuruldu.');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  };

  const exportExcel = async () => {
    try {
      const blob = await (await api('/export')).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title || 'pano'}-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message); }
  };

  const shown = useMemo(() => rows.filter(r =>
    (statusFilter === 'ALL' || (statusFilter === 'OPEN' ? r.status !== 'DONE' : r.status === statusFilter)) &&
    (!personFilter || r.assignees.some(a => a.contactId === personFilter)) &&
    (!query || r.title.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
  ), [rows, statusFilter, personFilter, query]);

  const nameOf = (id: string) => members.find(m => m.contactId === id)?.name || id.split('@')[0];
  const cell = 'border-b border-r border-[#e9edef] px-2 py-1.5 align-top';
  const input = 'w-full rounded border border-[#00a884] bg-white px-1.5 py-1 text-sm outline-none';

  if (!token) return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] px-4">
      <form onSubmit={signIn} className="w-full max-w-sm space-y-3 rounded-xl border border-[#e9edef] bg-white p-6 shadow-sm">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-[#008069]">MyWA ortak pano</p><h1 className="mt-1 text-lg font-bold text-[#111b21]">{title || '…'}</h1></div>
        <label className="block"><span className="mb-1 block text-xs font-medium text-[#54656f]">Adınız (değişiklikler bu adla bildirilir)</span>
          <input required minLength={2} maxLength={60} value={login.name} onChange={e => setLogin({ ...login, name: e.target.value })} className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-[#54656f]">Pano şifresi</span>
          <input required type="password" autoComplete="current-password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-[#00a884] py-2 text-sm font-semibold text-white">Giriş</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#f7f8fa] text-[#111b21]">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-[#e9edef] bg-white px-3 py-2 sm:px-5">
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#008069]">Ortak pano</p><h1 className="truncate text-base font-bold">{title}</h1></div>
        <span className="hidden text-xs text-[#667781] sm:inline">{editor}</span>
        <button onClick={() => void load()} title="Yenile" aria-label="Yenile" className="rounded-lg p-2 text-[#54656f] hover:bg-[#f0f2f5]"><RefreshCw size={17} /></button>
        <button onClick={() => void exportExcel()} className="flex items-center gap-1.5 rounded-lg border border-[#00a884] px-3 py-1.5 text-sm font-medium text-[#008069]"><Download size={16} /> Excel</button>
        <button onClick={() => { localStorage.removeItem(storageKey); setToken(null); }} title="Çıkış" aria-label="Çıkış" className="rounded-lg p-2 text-[#54656f] hover:bg-[#f0f2f5]"><LogOut size={17} /></button>
      </header>

      <div className="flex flex-wrap gap-2 px-3 py-3 sm:px-5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#d1d7db] bg-white px-2"><Search size={16} className="text-[#667781]" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Görev ara…" className="w-full py-1.5 text-sm outline-none" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-[#d1d7db] bg-white px-2 py-1.5 text-sm">
          <option value="OPEN">Açık görevler</option><option value="ALL">Tümü</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="max-w-[180px] rounded-lg border border-[#d1d7db] bg-white px-2 py-1.5 text-sm">
          <option value="">Tüm görevliler</option>{members.map(m => <option key={m.contactId} value={m.contactId}>{m.name}</option>)}
        </select>
        <span className="self-center text-xs text-[#667781]">{shown.length} / {rows.length} görev</span>
      </div>

      {(error || notice) && <div className="px-3 sm:px-5">
        {error ? <p role="alert" className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}<button onClick={() => setError('')} aria-label="Kapat"><X size={15} /></button></p>
          : <p role="status" className="mb-2 flex items-center justify-between rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm text-[#0b5c46]">{notice}<button onClick={() => setNotice('')} aria-label="Kapat"><X size={15} /></button></p>}
      </div>}

      <div className="overflow-x-auto px-3 pb-8 sm:px-5">
        <table className="w-full min-w-[920px] border-separate border-spacing-0 overflow-hidden rounded-lg border-l border-t border-[#e9edef] bg-white text-sm">
          <thead className="sticky top-0 bg-[#f0f2f5] text-left text-xs text-[#54656f]">
            <tr>{['#', 'Görev', 'Görevliler', 'Öncelik', 'Bitiş', 'Durum', 'Oluşturan', ''].map((h, i) => <th key={i} className={cell + ' font-semibold'}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const isEditing = (field: string) => editing?.ref === r.ref && editing.field === field;
              return (
                <tr key={r.ref} className={saving === r.ref ? 'opacity-60' : 'hover:bg-[#fafafa]'}>
                  <td className={cell + ' w-10 text-xs text-[#667781]'}>{i + 1}</td>
                  <td className={cell + ' min-w-[260px]'} onClick={() => !isEditing('title') && setEditing({ ref: r.ref, field: 'title' })}>
                    {isEditing('title')
                      ? <input autoFocus defaultValue={r.title} className={input} onBlur={e => e.target.value.trim() && e.target.value.trim() !== r.title ? void save(r.ref, { title: e.target.value }) : setEditing(null)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                      : <span className="cursor-text whitespace-pre-wrap">{r.title}</span>}
                  </td>
                  <td className={cell + ' min-w-[200px] cursor-pointer'} onClick={() => setPicker({ ref: r.ref, value: r.assignees.map(a => a.contactId) })}>
                    <div className="flex flex-wrap gap-1">{r.assignees.length ? r.assignees.map(a => (
                      <span key={a.contactId} title={a.committedDueDate ? `${dayLabel(a.committedDueDate)} tarihine kadar` : undefined} className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' + (a.completedAt ? 'bg-green-50 text-green-800' : 'bg-[#f0f2f5] text-[#3b4a54]')}>{a.completedAt && <Check size={11} />}{a.name}</span>
                    )) : <span className="text-xs text-[#99a3aa]">Görevli seç</span>}</div>
                  </td>
                  <td className={cell + ' w-28'}>
                    <select value={r.priority} onChange={e => void save(r.ref, { priority: e.target.value })} className="w-full bg-transparent text-sm outline-none">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </td>
                  <td className={cell + ' w-36'}>
                    <input type="date" value={dayValue(r.dueDate)} onChange={e => void save(r.ref, { dueDate: e.target.value || null })} className="w-full bg-transparent text-sm outline-none" />
                  </td>
                  <td className={cell + ' w-36'}>
                    <select value={r.status} onChange={e => void save(r.ref, { status: e.target.value })} className={'w-full rounded px-1 py-0.5 text-sm outline-none ' + STATUS_STYLE[r.status]}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </td>
                  <td className={cell + ' w-32 text-xs text-[#667781]'}>{r.owner}<br />{new Date(r.createdAt).toLocaleDateString('tr-TR')}</td>
                  <td className={cell + ' w-10'}><a href={r.link} target="_blank" rel="noreferrer" title="Görev sayfası" aria-label="Görev sayfası" className="text-[#54656f]"><ExternalLink size={15} /></a></td>
                </tr>
              );
            })}
            <tr className="bg-[#f7fdf9]">
              <td className={cell}><Plus size={15} className="text-[#00a884]" /></td>
              <td className={cell}><input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && void addTask()} placeholder="Yeni görev yazın…" className="w-full bg-transparent py-1 text-sm outline-none" /></td>
              <td className={cell + ' cursor-pointer'} onClick={() => setPicker({ ref: null, value: draft.assigneeIds })}>
                <div className="flex flex-wrap gap-1">{draft.assigneeIds.length ? draft.assigneeIds.map(id => <span key={id} className="rounded-full bg-[#f0f2f5] px-2 py-0.5 text-xs">{nameOf(id)}</span>) : <span className="text-xs text-[#99a3aa]">Görevli seç</span>}</div>
              </td>
              <td className={cell}><select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })} className="w-full bg-transparent text-sm outline-none">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td className={cell}><input type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} className="w-full bg-transparent text-sm outline-none" /></td>
              <td className={cell} colSpan={3}><button disabled={!draft.title.trim() || saving === 'new'} onClick={() => void addTask()} className="rounded-lg bg-[#00a884] px-3 py-1 text-sm font-medium text-white disabled:opacity-40">{saving === 'new' ? 'Ekleniyor…' : 'Ekle ve duyur'}</button></td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[#667781]">Değişiklikler gruba WhatsApp ile bildirilir; aynı görevde 2 dakika içinde yapılan değişiklikler tek mesajda toplanır.</p>
      </div>

      {picker && <AssigneePicker members={members} value={picker.value} onClose={ids => {
        const target = picker.ref; setPicker(null);
        if (!ids) return;
        if (target) void save(target, { assigneeIds: ids });
        else setDraft(d => ({ ...d, assigneeIds: ids }));
      }} />}
    </div>
  );
}
