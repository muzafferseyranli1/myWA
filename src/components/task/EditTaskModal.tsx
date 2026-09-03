'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';

export default function EditTaskModal({ isOpen, onClose, task, contacts }: any) {
  const [title, setTitle] = useState(task?.title || '');
  const [status, setStatus] = useState(task?.status || 'TODO');
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        },
        body: JSON.stringify({
          title,
          status,
          priority
        })
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Görevi silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        }
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-[#202C33] border border-[#222E35] flex flex-col">
        <div className="flex items-center justify-between border-b border-[#222E35] p-4">
          <h2 className="text-lg font-medium text-[#E9EDEF]">Görevi Düzenle</h2>
          <button onClick={onClose} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col p-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-[#8696A0]">Başlık</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Durum</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]">
                <option value="TODO">Yapılacak</option>
                <option value="IN_PROGRESS">Devam Ediyor</option>
                <option value="DONE">Tamamlandı</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Öncelik</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]">
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
                <option value="URGENT">Acil</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-[#222E35]">
            <button type="button" onClick={handleDelete} className="flex items-center text-red-500 hover:text-red-400 text-sm">
              <Trash2 className="w-4 h-4 mr-1" /> Sil
            </button>
            <div className="flex space-x-2">
              <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-[#8696A0] hover:bg-[#2A3942]">İptal</button>
              <button type="submit" disabled={loading} className="rounded bg-[#00A884] px-4 py-2 text-sm font-medium text-[#111B21] hover:bg-[#008f6f] disabled:opacity-50">
                {loading ? 'Kaydediliyor...' : 'Güncelle'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
