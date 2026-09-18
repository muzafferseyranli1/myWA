'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { getSocket } from '../../lib/socket';
import { moveTaskById } from '../../lib/client-state';
import { deliveryLabels } from '../../lib/types';
import EditTaskModal from './EditTaskModal';

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
      const previous = columns;
      setColumns(moveTaskById(columns, draggableId, source.droppableId, destination.droppableId, destination.index));
      setSaving(true); setError('');
      try {
        const res = await fetch(`/api/tasks/${draggableId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
          },
          body: JSON.stringify({ status: destination.droppableId })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Görev güncellenemedi');
        await fetchKanban();
      } catch (err: any) {
        setColumns(previous); setError(err.message); await fetchKanban();
      } finally { setSaving(false); }
    }
  };

  return (
    <div className="h-full flex flex-col p-6">
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

      {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
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
                  <span className="bg-[#ffffff] text-xs px-2 py-0.5 rounded text-[#667781]">{filteredTasks.length}</span>
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
                              className={`p-3 rounded bg-[#e9edef] shadow-sm border border-[#e9edef] cursor-pointer hover:border-[#00A884] transition-colors ${snapshot.isDragging ? 'opacity-70' : ''}`}
                            >
                              <div className="text-sm font-medium text-[#111b21] mb-2">{task.title}</div>
                              <div className="flex flex-col gap-2">
                                {task.notification && <p className="text-xs text-[#667781]">{deliveryLabels[task.notification.status as keyof typeof deliveryLabels]}</p>}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-[#667781] inline-block bg-[#ffffff] px-1.5 py-0.5 rounded">{task.priority}</span>
                                  {task.dueDate && <span className="text-[11px] text-[#667781]">⏱️ {new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>}
                                </div>
                                {task.completionNote && (
                                  <div className="text-[11px] text-green-400 bg-green-500/10 px-2 py-1 rounded line-clamp-2 italic border border-green-500/20">
                                    📝 {task.completionNote}
                                  </div>
                                )}
                                {task.assignees && task.assignees.length > 0 && (
                                  <div className="flex -space-x-2 mt-1">
                                    {task.assignees.map((a:any) => (
                                      <div key={a.id} className="w-6 h-6 rounded-full bg-[#00A884] border border-[#e9edef] flex items-center justify-center text-[10px] text-[#ffffff] font-bold" title={a.pushName || a.displayName || a.phoneNumber}>
                                        {(a.pushName || a.displayName || a.phoneNumber || '?').substring(0,2).toUpperCase()}
                                      </div>
                                    ))}
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
