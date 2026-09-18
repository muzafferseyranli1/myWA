'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { getSocket } from '../../lib/socket';
import { moveTaskById } from '../../lib/client-state';
import { deliveryLabels } from '../../lib/types';
import EditTaskModal from './EditTaskModal';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

const initialColumns = {
  TODO: { id: 'TODO', title: 'Yapılacak', tasks: [] },
  IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Devam Ediyor', tasks: [] },
  DONE: { id: 'DONE', title: 'Tamamlandı', tasks: [] }
};

export default function KanbanBoard() {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<any>(initialColumns);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [editingTask, setEditingTask] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);

  // Drag dialog states
  const [reactivatePrompt, setReactivatePrompt] = useState<{
    task: any;
    targetStatus: string;
  } | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const [completePrompt, setCompletePrompt] = useState<{
    task: any;
  } | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  const fetchKanban = async () => {
    try {
      const res = await fetch('/api/tasks/kanban', {
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const tasks = data.tasks || [];
        setColumns({
          TODO: { id: 'TODO', title: 'Yapılacak', tasks: tasks.filter((t: any) => t.status === 'TODO') },
          IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Devam Ediyor', tasks: tasks.filter((t: any) => t.status === 'IN_PROGRESS') },
          DONE: { id: 'DONE', title: 'Tamamlandı', tasks: tasks.filter((t: any) => t.status === 'DONE') }
        });
      }
    } catch (e) {
      console.error('Failed to load kanban data:', e);
    }
  };

  useEffect(() => {
    fetchKanban();

    const token = localStorage.getItem('mywa_token');
    if (token) {
      fetch('/api/contacts', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : []))
        .then(data => setContacts(Array.isArray(data) ? data : []))
        .catch(() => {});
    }

    const sock = getSocket();
    const onTaskCreated = () => fetchKanban();
    const onTaskUpdated = () => fetchKanban();
    const onTaskDeleted = () => fetchKanban();

    sock.on('connect', onTaskUpdated);
    sock.on('notification_updated', onTaskUpdated);
    sock.on('task_created', onTaskCreated);
    sock.on('task_updated', onTaskUpdated);
    sock.on('task_deleted', onTaskDeleted);

    return () => {
      sock.off('connect', onTaskUpdated);
      sock.off('notification_updated', onTaskUpdated);
      sock.off('task_created', onTaskCreated);
      sock.off('task_updated', onTaskUpdated);
      sock.off('task_deleted', onTaskDeleted);
    };
  }, []);

  const onDragEnd = async (result: any) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    if (source.droppableId !== destination.droppableId) {
      if (saving) return;

      const task = columns[source.droppableId]?.tasks?.find((t: any) => t.id === draggableId);
      if (!task) return;

      // 1. Durum: DONE -> TODO veya IN_PROGRESS (Yeniden Aktifleştirme)
      if (source.droppableId === 'DONE' && destination.droppableId !== 'DONE') {
        setReactivatePrompt({
          task,
          targetStatus: destination.droppableId
        });
        setReactivateReason('');
        setNewDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
        return;
      }

      // 2. Durum: TODO/IN_PROGRESS -> DONE (Tamamlama)
      if (destination.droppableId === 'DONE') {
        setCompletePrompt({ task });
        setCompletionNote('');
        return;
      }

      // 3. Durum: Normal geçiş (TODO <-> IN_PROGRESS)
      await updateTaskStatus(draggableId, destination.droppableId);
    }
  };

  const updateTaskStatus = async (
    taskId: string,
    status: string,
    extra: { completionNote?: string; reactivateReason?: string; dueDate?: string | null } = {}
  ) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        },
        body: JSON.stringify({
          status,
          ...extra
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Görev güncellenemedi');
      }
      await fetchKanban();
    } catch (err: any) {
      setError(err.message);
      await fetchKanban();
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReactivation = async () => {
    if (!reactivatePrompt) return;
    if (!reactivateReason.trim()) {
      alert('Lütfen yeniden aktifleştirme nedenini belirtiniz.');
      return;
    }
    const { task, targetStatus } = reactivatePrompt;
    setReactivatePrompt(null);
    await updateTaskStatus(task.id, targetStatus, {
      reactivateReason: reactivateReason.trim(),
      dueDate: newDueDate ? new Date(newDueDate).toISOString() : null
    });
  };

  const handleConfirmCompletion = async () => {
    if (!completePrompt) return;
    const { task } = completePrompt;
    setCompletePrompt(null);
    await updateTaskStatus(task.id, 'DONE', {
      completionNote: completionNote.trim() || 'Admin tarafından tamamlandı'
    });
  };

  return (
    <div className="h-full flex flex-col p-6 bg-[#ffffff]">
      <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-[#111b21]">Tüm Görevler (Kanban)</h2>
        <div className="flex space-x-4">
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="rounded bg-[#f0f2f5] px-3 py-1.5 text-sm text-[#111b21] focus:outline-none"
          >
            <option value="ALL">Tüm Öncelikler</option>
            <option value="LOW">Düşük</option>
            <option value="MEDIUM">Orta</option>
            <option value="HIGH">Yüksek</option>
            <option value="URGENT">Acil</option>
          </select>
          <input
            type="text"
            placeholder="Görev ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded bg-[#f0f2f5] px-3 py-1.5 text-sm text-[#111b21] focus:outline-none placeholder-[#667781]"
          />
        </div>
      </div>

      {error && <p role="alert" className="text-red-500 mb-3 text-sm font-medium">{error}</p>}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-1 space-x-6 overflow-x-auto">
          {Object.values(columns).map((col: any) => {
            const filteredTasks = col.tasks.filter((t: any) => {
              const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
              const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
              return matchesSearch && matchesPriority;
            });
            return (
              <div key={col.id} className="flex flex-col w-80 bg-[#f0f2f5] rounded-lg">
                <div className="p-3 border-b border-[#e9edef] flex justify-between items-center bg-[#e9edef] rounded-t-lg">
                  <h3 className="font-medium text-[#111b21]">{col.title}</h3>
                  <span className="bg-[#ffffff] text-xs px-2 py-0.5 rounded text-[#667781] font-medium">{filteredTasks.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-3 space-y-3 overflow-y-auto ${snapshot.isDraggingOver ? 'bg-[#e9edef]/50' : ''}`}>
                      {filteredTasks.map((task: any, index: number) => (
                        <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={saving}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setEditingTask(task)}
                              className={`p-3 rounded-lg bg-[#ffffff] shadow-sm border border-[#e9edef] cursor-pointer hover:border-[#00A884] transition-colors ${snapshot.isDragging ? 'opacity-70' : ''}`}
                            >
                              <div className="text-sm font-semibold text-[#111b21] mb-2 leading-snug">{task.title}</div>
                              <div className="flex flex-col gap-2">
                                {task.notification && <p className="text-[11px] text-[#667781]">{deliveryLabels[task.notification.status as keyof typeof deliveryLabels]}</p>}
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-[#667781] font-medium inline-block bg-[#f0f2f5] px-2 py-0.5 rounded">{task.priority}</span>
                                  {task.dueDate && <span className="text-[11px] text-[#667781]">⏱️ {new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>}
                                </div>
                                {task.completionNote && (
                                  <div className="text-[11px] text-green-700 bg-green-50 px-2 py-1 rounded line-clamp-2 italic border border-green-200">
                                    📝 {task.completionNote}
                                  </div>
                                )}
                                {task.assignees && task.assignees.length > 0 && (
                                  <div className="flex -space-x-1 mt-1">
                                    {task.assignees.map((a: any) => {
                                      const name = a.contact?.pushName || a.contact?.displayName || a.contact?.phoneNumber || '?';
                                      return (
                                        <div key={a.id} className="w-6 h-6 rounded-full bg-[#00A884] border-2 border-[#ffffff] flex items-center justify-center text-[10px] text-[#ffffff] font-bold" title={name}>
                                          {name.substring(0, 2).toUpperCase()}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Yeniden Aktifleştirme Modalı */}
      {reactivatePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4 border border-[#e9edef]">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Görevi Yeniden Aktifleştir
              </div>
              <button onClick={() => setReactivatePrompt(null)} className="text-[#667781] hover:text-[#111b21]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-[#667781] leading-relaxed">
              <strong>&quot;{reactivatePrompt.task.title}&quot;</strong> görevi tekrar aktifleştirilecek ve WhatsApp grubuna bildirim gönderilecektir.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#111b21] mb-1">
                Aktifleştirme Nedeni <span className="text-red-500">* (Zorunlu)</span>
              </label>
              <textarea
                required
                rows={3}
                value={reactivateReason}
                onChange={e => setReactivateReason(e.target.value)}
                placeholder="Örn: Müşteri arama numarasında yeni format belirlendi, tekrar teste alındı..."
                className="w-full rounded-lg border border-[#e9edef] p-2 text-sm text-[#111b21] focus:outline-none focus:border-[#00A884]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111b21] mb-1">
                Yeni Bitiş Tarihi
              </label>
              <input
                type="date"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#e9edef] p-2 text-sm text-[#111b21] focus:outline-none focus:border-[#00A884]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setReactivatePrompt(null)}
                className="rounded-lg px-4 py-2 text-sm text-[#667781] hover:bg-[#f0f2f5]"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={saving || !reactivateReason.trim()}
                onClick={handleConfirmReactivation}
                className="rounded-lg bg-[#00A884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008f6f] disabled:opacity-50"
              >
                {saving ? 'Aktifleştiriliyor...' : 'Tekrar Aktifleştir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tamamlama Notu Modalı */}
      {completePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4 border border-[#e9edef]">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-[#00A884] font-bold text-base">
                <CheckCircle2 className="h-5 w-5 text-[#00A884]" />
                Görevi Tamamla
              </div>
              <button onClick={() => setCompletePrompt(null)} className="text-[#667781] hover:text-[#111b21]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-[#667781]">
              <strong>&quot;{completePrompt.task.title}&quot;</strong> tamamlandı olarak işaretlenecek ve WhatsApp grubuna bildirim gönderilecektir.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#111b21] mb-1">
                Görev Bitirme Notu
              </label>
              <textarea
                rows={3}
                value={completionNote}
                onChange={e => setCompletionNote(e.target.value)}
                placeholder="Yapılan işlemler ve kapanış notu..."
                className="w-full rounded-lg border border-[#e9edef] p-2 text-sm text-[#111b21] focus:outline-none focus:border-[#00A884]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setCompletePrompt(null)}
                className="rounded-lg px-4 py-2 text-sm text-[#667781] hover:bg-[#f0f2f5]"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmCompletion}
                className="rounded-lg bg-[#00A884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008f6f] disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Tamamlandı Olarak Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <EditTaskModal 
          isOpen={!!editingTask} 
          onClose={() => setEditingTask(null)} 
          task={editingTask} 
          contacts={contacts} 
          onTaskUpdated={fetchKanban} 
        />
      )}
    </div>
  );
}
