'use client';
import { useCallback, useEffect, useState } from 'react';
import { deliveryLabels, NotificationItem } from '../lib/types';
import { getSocket } from '../lib/socket';

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?page=${page}&status=${status}`, { headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` } });
      if (!res.ok) throw new Error('Bildirimler okunamadı');
      const data = await res.json(); setItems(data.items); setPages(Math.max(1, data.totalPages)); setError('');
    } catch (e: any) { setError(e.message); }
  }, [page, status]);
  useEffect(() => {
    void load(); const sock = getSocket(); const refresh = () => { void load(); };
    sock.on('notification_updated', refresh); sock.on('connect', refresh);
    return () => { sock.off('notification_updated', refresh); sock.off('connect', refresh); };
  }, [load]);
  const act = async (job: NotificationItem, action: 'retry' | 'cancel') => {
    if (job.status === 'UNKNOWN' && action === 'retry' && !window.confirm('Mesaj daha önce gönderilmiş olabilir. Aynı mesajı tekrar göndermek istiyor musunuz?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notifications/${job.id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmUnknown: job.status === 'UNKNOWN' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'İşlem başarısız');
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4">
    <div className="bg-[#f0f2f5] p-4 sm:p-5 rounded-lg w-full max-w-2xl max-h-[90dvh] overflow-auto">
      <div className="flex justify-between items-center mb-3"><h2 className="font-medium">Bildirimler</h2><button onClick={onClose} className="rounded px-3 py-1.5 hover:bg-[#e9edef]">Kapat</button></div>
      <p className="text-xs text-[#667781] mb-3">WAHA kabulü, alıcıya teslim edildiği anlamına gelmez. Başarısız veya belirsiz işler aynı sohbetin sonraki gönderimlerini bekletir.</p>
      <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="bg-[#ffffff] p-2 mb-3"><option value="">Tüm durumlar</option>{Object.entries(deliveryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {items.map(job => <div key={job.id} className="border-t border-[#d1d7db] py-3 text-sm break-words [overflow-wrap:anywhere]">
        <p>{deliveryLabels[job.status]} · {job.kind} · {job.chatId}</p>
        {job.taskId && <a href={`/t/${job.taskId}`} className="text-[#00A884]">Görevi incele</a>}
        {job.lastError && <p className="text-red-300">{job.lastError}</p>}
        {['FAILED', 'UNKNOWN'].includes(job.status) && <div className="flex gap-4 mt-2"><button disabled={busy} onClick={() => void act(job, 'retry')}>Tekrar gönder</button><button disabled={busy} onClick={() => void act(job, 'cancel')}>İptal et</button></div>}
      </div>)}
      {!items.length && <p>Bildirim bulunmuyor.</p>}
      <div className="flex gap-4 mt-3"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Önceki</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sonraki</button></div>
    </div>
  </div>;
}
