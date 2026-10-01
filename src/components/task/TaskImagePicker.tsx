'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Picked = { key: string; preview: string; id?: string; error?: string };

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('mywa_token')}` });

/**
 * Lets the user attach pictures to a new task. Each one is uploaded right away
 * and the task is created with the returned ids; `onChange` reports the ids of
 * the finished uploads and whether any upload is still running.
 */
export default function TaskImagePicker({ onChange }: { onChange: (ids: string[], busy: boolean) => void }) {
  const [items, setItems] = useState<Picked[]>([]);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    onChange(items.filter(i => i.id).map(i => i.id!), items.some(i => !i.id && !i.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  useEffect(() => () => previews.current.forEach(URL.revokeObjectURL), []);

  const upload = async (file: File, key: string) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/tasks/attachments', { method: 'POST', headers: auth(), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Görsel yüklenemedi');
      setItems(prev => prev.map(i => (i.key === key ? { ...i, id: data.id } : i)));
    } catch (e: any) {
      setItems(prev => prev.map(i => (i.key === key ? { ...i, error: e.message } : i)));
    }
  };

  const pick = (files: FileList | null) => {
    setMessage('');
    const chosen = Array.from(files || []);
    const room = MAX_FILES - items.length;
    if (chosen.length > room) setMessage(`En fazla ${MAX_FILES} görsel eklenebilir.`);
    for (const file of chosen.slice(0, Math.max(0, room))) {
      if (!TYPES.includes(file.type)) { setMessage('Yalnızca JPEG, PNG veya WebP görsel eklenebilir.'); continue; }
      if (file.size > MAX_BYTES) { setMessage('Görsel en fazla 10 MB olabilir.'); continue; }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setItems(prev => [...prev, { key, preview }]);
      void upload(file, key);
    }
    if (input.current) input.current.value = '';
  };

  const remove = (item: Picked) => {
    setItems(prev => prev.filter(i => i.key !== item.key));
    if (item.id) void fetch(`/api/tasks/attachments/${item.id}`, { method: 'DELETE', headers: auth() }).catch(() => {});
  };

  return (
    <div>
      <label className="mb-1 block text-sm text-[#667781]">🖼️ Görseller</label>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <div key={item.key} className="relative h-16 w-16 overflow-hidden rounded border border-[#d1d7db] bg-[#f0f2f5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.preview} alt="" className={'h-full w-full object-cover ' + (item.id ? '' : 'opacity-50')} />
            {!item.id && !item.error && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#54656f]">Yükleniyor…</span>}
            {item.error && <span title={item.error} className="absolute inset-0 flex items-center justify-center bg-red-100/80 text-[10px] text-red-700">Hata</span>}
            <button type="button" onClick={() => remove(item)} aria-label="Görseli kaldır" className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"><X size={12} /></button>
          </div>
        ))}
        {items.length < MAX_FILES && (
          <button type="button" onClick={() => input.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-[#00A884] text-[11px] text-[#008069] hover:bg-[#f0faf7]">
            <ImagePlus size={18} />Ekle
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pick(e.target.files)} />
      <p className="mt-1 text-[11px] text-[#667781]">En fazla {MAX_FILES} görsel, her biri en fazla 10 MB. Bildirim görselle birlikte gönderilir.</p>
      {message && <p className="mt-1 text-[11px] text-red-600">{message}</p>}
    </div>
  );
}
