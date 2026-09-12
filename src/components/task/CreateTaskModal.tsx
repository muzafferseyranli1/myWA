'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  sourceMessage?: { id: string; body: string; senderName: string; timestamp: string } | null;
  contacts: Array<{ id: string; phoneNumber: string; pushName?: string; displayName?: string }>;
  onTaskCreated?: () => void;
}

export default function CreateTaskModal({ isOpen, onClose, chatId, sourceMessage, contacts, onTaskCreated }: CreateTaskModalProps) {
  const [title, setTitle] = useState(sourceMessage?.body?.substring(0, 60) || '');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [notifyOnCreate, setNotifyOnCreate] = useState(true);
  const [searchContact, setSearchContact] = useState('');
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
          sourceMessageId: sourceMessage?.id,
          title,
          description,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds,
          notifyOnCreate
        })
      });
      if (res.ok) {
        if (onTaskCreated) onTaskCreated();
        onClose();
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssignee = (id: string) => {
    if (assigneeIds.includes(id)) {
      setAssigneeIds(assigneeIds.filter(a => a !== id));
    } else {
      setAssigneeIds([...assigneeIds, id]);
    }
  };

  const filteredContacts = (contacts || []).filter(c => {
    const term = searchContact.toLowerCase();
    return (c.pushName?.toLowerCase().includes(term) || c.displayName?.toLowerCase().includes(term) || c.phoneNumber?.includes(term));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-lg bg-[#2A3942] border border-[#222E35] flex flex-col my-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-[#222E35] p-4">
          <h2 className="text-lg font-medium text-[#E9EDEF]">📋 Yeni Görev Oluştur</h2>
          <button onClick={onClose} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          {sourceMessage && (
            <div className="mb-4 rounded-md bg-[#202C33] p-3 text-sm text-[#E9EDEF] border border-[#222E35]">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-[#00A884]">{sourceMessage.senderName}</span>
                <span className="text-xs text-[#8696A0]">{new Date(sourceMessage.timestamp).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="italic text-gray-300 line-clamp-3">{sourceMessage.body}</div>
            </div>
          )}

          <form id="create-task-form" onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Görev Başlığı</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
            </div>
            
            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Açıklama</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884] min-h-[80px]" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Öncelik</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'LOW', label: 'Düşük', color: 'text-green-400 bg-green-400/10' },
                  { value: 'MEDIUM', label: 'Orta', color: 'text-yellow-400 bg-yellow-400/10' },
                  { value: 'HIGH', label: 'Yüksek', color: 'text-orange-400 bg-orange-400/10' },
                  { value: 'URGENT', label: 'Acil', color: 'text-red-400 bg-red-400/10' },
                ].map(p => (
                  <label key={p.value} className={`flex items-center space-x-1 cursor-pointer rounded-full px-3 py-1 text-xs border ${priority === p.value ? 'border-[#00A884]' : 'border-transparent'} ${p.color}`}>
                    <input type="radio" name="priority" value={p.value} checked={priority === p.value} onChange={() => setPriority(p.value)} className="hidden" />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Bitiş Tarihi</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">👥 Görevliler</label>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-4 w-4 text-[#8696A0]" />
                <input 
                  type="text" 
                  placeholder="Kişi ara..." 
                  value={searchContact} 
                  onChange={e => setSearchContact(e.target.value)} 
                  className="w-full rounded bg-[#111B21] p-2 pl-8 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" 
                />
              </div>
              <div className="max-h-[120px] overflow-y-auto rounded bg-[#111B21] border border-[#222E35] p-2 space-y-1">
                {filteredContacts.length === 0 && <div className="text-xs text-[#8696A0] p-1">Kişi bulunamadı</div>}
                {filteredContacts.map(c => (
                  <label key={c.id} className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#202C33] rounded">
                    <input type="checkbox" checked={assigneeIds.includes(c.id)} onChange={() => toggleAssignee(c.id)} className="accent-[#00A884]" />
                    <span className="text-sm text-[#E9EDEF]">{c.pushName || c.displayName || c.phoneNumber}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center space-x-2 cursor-pointer pt-2">
              <input type="checkbox" checked={notifyOnCreate} onChange={e => setNotifyOnCreate(e.target.checked)} className="accent-[#00A884] h-4 w-4" />
              <span className="text-sm text-[#E9EDEF]">WhatsApp'ta bildir</span>
            </label>

          </form>
        </div>

        <div className="flex justify-end space-x-2 p-4 border-t border-[#222E35]">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-[#8696A0] hover:bg-[#202C33]">İptal</button>
          <button form="create-task-form" type="submit" disabled={loading} className="rounded bg-[#00A884] px-4 py-2 text-sm font-medium text-[#111B21] hover:bg-[#008f6f] disabled:opacity-50">
            {loading ? 'Oluşturuluyor...' : 'Görev Oluştur 📌'}
          </button>
        </div>
      </div>
    </div>
  );
}
