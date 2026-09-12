'use client';

import { useState } from 'react';
import { X, Trash2, Search, Link as LinkIcon, Check } from 'lucide-react';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  contacts: Array<{ id: string; phoneNumber: string; pushName?: string; displayName?: string }>;
  onTaskUpdated?: () => void;
}

export default function EditTaskModal({ isOpen, onClose, task, contacts, onTaskUpdated }: EditTaskModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || 'TODO');
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM');
  const [dueDate, setDueDate] = useState(task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assignees?.map((a: any) => a.contactId || a.contact?.id || a.id) || []
  );
  const [completionNote, setCompletionNote] = useState(task?.completionNote || '');
  const [searchContact, setSearchContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDoneMsg, setShowDoneMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !task) return null;

  const copyTaskLink = () => {
    const url = `${window.location.origin}/t/${task.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

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
          description,
          status,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds,
          completionNote: status === 'DONE' ? completionNote : undefined
        })
      });
      if (res.ok) {
        if (onTaskUpdated) onTaskUpdated();
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
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    if (newStatus === 'DONE') {
      setShowDoneMsg(true);
      setTimeout(() => setShowDoneMsg(false), 3000);
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
          <h2 className="text-lg font-medium text-[#E9EDEF]">Görevi Düzenle</h2>
          <button onClick={onClose} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          {showDoneMsg && (
            <div className="mb-4 bg-green-500/20 text-green-400 p-2 rounded text-sm text-center">
              Görev tamamlandı olarak işaretlendi! 🎉
            </div>
          )}
          <form id="edit-task-form" onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Başlık</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#8696A0]">Açıklama</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884] min-h-[80px]" />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm text-[#8696A0]">Durum</label>
                <select value={status} onChange={handleStatusChange} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]">
                  <option value="TODO">Yapılacak</option>
                  <option value="IN_PROGRESS">Devam Ediyor</option>
                  <option value="DONE">Tamamlandı</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#8696A0]">Öncelik</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884]">
                  <option value="LOW">Düşük</option>
                  <option value="MEDIUM">Orta</option>
                  <option value="HIGH">Yüksek</option>
                  <option value="URGENT">Acil</option>
                </select>
              </div>
            </div>

            {status === 'DONE' && (
              <div className="rounded bg-[#202C33] p-3 border border-[#00A884]/30">
                <label className="mb-1 block text-xs font-semibold text-[#00A884]">
                  📝 Görev Bitirme Notu {task.completedBy && `(${task.completedBy})`}
                </label>
                <textarea
                  value={completionNote}
                  onChange={e => setCompletionNote(e.target.value)}
                  placeholder="Görev kapatma notu..."
                  className="w-full rounded bg-[#111B21] p-2 text-sm text-[#E9EDEF] focus:outline-none focus:ring-1 focus:ring-[#00A884] min-h-[60px]"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm text-[#8696A0]">Bitiş Tarihi</label>
                <button
                  type="button"
                  onClick={copyTaskLink}
                  className="inline-flex items-center gap-1 text-xs text-[#00A884] hover:underline"
                >
                  {copiedLink ? <Check className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                  {copiedLink ? 'Link Kopyalandı!' : 'Mobil Kapatma Linki'}
                </button>
              </div>
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

          </form>
        </div>
        <div className="flex justify-between p-4 border-t border-[#222E35]">
          <button type="button" onClick={handleDelete} className="flex items-center text-red-500 hover:text-red-400 text-sm">
            <Trash2 className="w-4 h-4 mr-1" /> Sil
          </button>
          <div className="flex space-x-2">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-[#8696A0] hover:bg-[#202C33]">İptal</button>
            <button form="edit-task-form" type="submit" disabled={loading} className="rounded bg-[#00A884] px-4 py-2 text-sm font-medium text-[#111B21] hover:bg-[#008f6f] disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Güncelle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
