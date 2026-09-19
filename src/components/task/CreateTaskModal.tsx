'use client';

import { useState, useRef } from 'react';
import { X, Search, MessageSquareText } from 'lucide-react';
import { newClientId } from '../../lib/client-id';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  sourceMessage?: { id: string; body: string; senderName: string; timestamp: string } | null;
  contacts: Array<{ id: string; phoneNumber: string; pushName?: string; displayName?: string }>;
  onTaskCreated?: () => void;
}

function replaceMentionsWithNames(
  text: string,
  contactList: Array<{ id: string; phoneNumber?: string; pushName?: string; displayName?: string }>
): string {
  if (!text) return '';
  return text.replace(/@(\d{9,16})/g, (match, num) => {
    const contact = contactList.find(c => {
      const p = c.phoneNumber?.replace(/\D/g, '') || '';
      const cId = c.id?.replace(/@.*$/, '') || '';
      return p === num || cId === num;
    });
    if (contact) {
      const name = contact.displayName || contact.pushName;
      if (name) return `@${name}`;
    }
    return match;
  });
}

export default function CreateTaskModal({ isOpen, onClose, chatId, sourceMessage, contacts, onTaskCreated }: CreateTaskModalProps) {
  const requestId = useRef<string | undefined>(undefined);
  const initialTitle = sourceMessage?.body ? replaceMentionsWithNames(sourceMessage.body, contacts || []).substring(0, 80) : '';
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [notifyOnCreate, setNotifyOnCreate] = useState(true);
  const [notifyAssigneesDirectly, setNotifyAssigneesDirectly] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Today's date for min value on date picker
  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    requestId.current ||= newClientId();
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        },
        body: JSON.stringify({
          clientRequestId: requestId.current,
          chatId,
          sourceMessageId: sourceMessage?.id,
          sourceMessageBody: sourceMessage?.body || null,
          title,
          description,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds,
          notifyOnCreate,
          notifyAssigneesDirectly
        })
      });
      if (res.ok) {
        requestId.current = undefined;
        alert('Görev kaydedildi. Bildirim durumunu Bildirimler bölümünden takip edebilirsiniz.');
        if (onTaskCreated) onTaskCreated();
        onClose();
      } else { const data = await res.json(); alert(data.error || 'Görev kaydedilemedi'); }
    } catch (err) {
      alert('Görev kaydı doğrulanamadı; aynı işlemle tekrar deneyebilirsiniz.');
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
      <div className="w-full max-w-md rounded-lg bg-[#e9edef] border border-[#e9edef] flex flex-col my-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-[#e9edef] p-4">
          <h2 className="text-lg font-medium text-[#111b21]">📋 Yeni Görev Oluştur</h2>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111b21]">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          {/* Mesaj Metni - Readonly, tam metin */}
          {sourceMessage && (
            <div className="mb-4">
              <label className="mb-1 flex items-center gap-1 text-sm text-[#667781]">
                <MessageSquareText className="h-4 w-4" /> Mesaj Metni
              </label>
              <div className="rounded-md bg-[#ffffff] p-3 text-sm text-[#111b21] border border-[#e9edef]">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-[#00A884] text-xs">{sourceMessage.senderName}</span>
                  <span className="text-xs text-[#667781]">{new Date(sourceMessage.timestamp).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div className="text-[#111b21] whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto text-[13px] leading-relaxed">{replaceMentionsWithNames(sourceMessage.body, contacts || [])}</div>
              </div>
            </div>
          )}

          <form id="create-task-form" onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#667781]">Görev Başlığı *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Görev için kısa başlık..." className="w-full rounded bg-[#ffffff] p-2 text-sm text-[#111b21] focus:outline-none focus:ring-1 focus:ring-[#00A884]" />
            </div>
            
            <div>
              <label className="mb-1 block text-sm text-[#667781]">Açıklama</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ek notlar..." rows={2} className="w-full rounded bg-[#ffffff] p-2 text-sm text-[#111b21] focus:outline-none focus:ring-1 focus:ring-[#00A884] resize-none" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#667781]">Öncelik</label>
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
              <label className="mb-1 block text-sm text-[#667781]">📅 Bitiş Tarihi</label>
              <input 
                type="date" 
                value={dueDate} 
                min={today}
                onChange={e => setDueDate(e.target.value)} 
                className="w-full rounded bg-[#ffffff] p-2 text-sm text-[#111b21] focus:outline-none focus:ring-1 focus:ring-[#00A884] [color-scheme:dark]" 
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#667781]">👥 Görevliler</label>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-4 w-4 text-[#667781]" />
                <input 
                  type="text" 
                  placeholder="Kişi ara..." 
                  value={searchContact} 
                  onChange={e => setSearchContact(e.target.value)} 
                  className="w-full rounded bg-[#ffffff] p-2 pl-8 text-sm text-[#111b21] focus:outline-none focus:ring-1 focus:ring-[#00A884]" 
                />
              </div>
              {assigneeIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {assigneeIds.map(id => {
                    const c = contacts.find(x => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#00A884]/20 px-2 py-0.5 text-xs text-[#00A884]">
                        {c?.pushName || c?.displayName || c?.phoneNumber || id.split('@')[0]}
                        <button type="button" onClick={() => toggleAssignee(id)} className="hover:text-red-400">×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="max-h-[120px] overflow-y-auto rounded bg-[#ffffff] border border-[#e9edef] p-2 space-y-1">
                {filteredContacts.length === 0 && <div className="text-xs text-[#667781] p-1">Kişi bulunamadı</div>}
                {filteredContacts.map(c => (
                  <label key={c.id} className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f2f5] rounded">
                    <input type="checkbox" checked={assigneeIds.includes(c.id)} onChange={() => toggleAssignee(c.id)} className="accent-[#00A884]" />
                    <span className="text-sm text-[#111b21]">{c.pushName || c.displayName || c.phoneNumber}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#e9edef]">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={notifyOnCreate} onChange={e => setNotifyOnCreate(e.target.checked)} className="accent-[#00A884] h-4 w-4" />
                <span className="text-sm text-[#111b21]">WhatsApp grubunda bildir</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={notifyAssigneesDirectly} onChange={e => setNotifyAssigneesDirectly(e.target.checked)} className="accent-[#00A884] h-4 w-4" />
                <span className="text-sm text-[#111b21]">Görevlilere özel mesaj da gönder (DM)</span>
              </label>
            </div>

          </form>
        </div>

        <div className="flex justify-end space-x-2 p-4 border-t border-[#e9edef]">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-[#667781] hover:bg-[#f0f2f5]">İptal</button>
          <button form="create-task-form" type="submit" disabled={loading} className="rounded bg-[#00A884] px-4 py-2 text-sm font-medium text-[#ffffff] hover:bg-[#008f6f] disabled:opacity-50">
            {loading ? 'Oluşturuluyor...' : 'Görev Oluştur 📌'}
          </button>
        </div>
      </div>
    </div>
  );
}
