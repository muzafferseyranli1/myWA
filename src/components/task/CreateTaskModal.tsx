'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

export default function CreateTaskModal({ isOpen, onClose, chatId, sourceMessageId, messageBody, contacts }: any) {
  const [title, setTitle] = useState(messageBody?.substring(0, 100) || '');
  const [description, setDescription] = useState(messageBody || '');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        },
        body: JSON.stringify({
          chatId,
          sourceMessageId,
          title,
          description,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined
        })
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-[#202C33] border border-[#222E35] flex flex-col">
        <div className="flex items-center justify-between border-b border-[#222E35] p-4">
          <h2 className="text-lg font-medium text-[#E9EDEF]">Yeni Görev</h2>
          <button onClick={onClose} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col p-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-[#8696A0]">Başlık</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
          </div>
          
          <div>
            <label className="mb-1 block text-sm text-[#8696A0]">Açıklama</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884] min-h-[80px]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Öncelik</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]">
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
                <option value="URGENT">Acil</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Bitiş Tarihi</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full rounded bg-[#2A3942] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-[#8696A0] hover:bg-[#2A3942]">İptal</button>
            <button type="submit" disabled={loading} className="rounded bg-[#00A884] px-4 py-2 text-sm font-medium text-[#111B21] hover:bg-[#008f6f] disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
