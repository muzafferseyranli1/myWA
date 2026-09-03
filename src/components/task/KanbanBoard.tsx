'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const initialColumns = {
  TODO: { id: 'TODO', title: 'Yapılacak', tasks: [] },
  IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Devam Ediyor', tasks: [] },
  DONE: { id: 'DONE', title: 'Tamamlandı', tasks: [] }
};

export default function KanbanBoard() {
  const [columns, setColumns] = useState<any>(initialColumns);
  const [search, setSearch] = useState('');

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
  }, []);

  const onDragEnd = async (result: any) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    
    if (source.droppableId !== destination.droppableId) {
      const sourceCol = columns[source.droppableId];
      const destCol = columns[destination.droppableId];
      const sourceTasks = [...sourceCol.tasks];
      const destTasks = [...destCol.tasks];
      const [removed] = sourceTasks.splice(source.index, 1);
      removed.status = destination.droppableId;
      destTasks.splice(destination.index, 0, removed);
      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceCol, tasks: sourceTasks },
        [destination.droppableId]: { ...destCol, tasks: destTasks }
      });

      try {
        await fetch(`/api/tasks/${draggableId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
          },
          body: JSON.stringify({ status: destination.droppableId })
        });
      } catch (err) {
        console.error('Failed to sync task status:', err);
      }
    }
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#E9EDEF]">Tüm Görevler (Kanban)</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Görev ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded bg-[#202C33] px-3 py-1.5 text-sm text-[#E9EDEF] focus:outline-none placeholder-[#8696A0]"
          />
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-1 space-x-6 overflow-x-auto">
          {Object.values(columns).map((col: any) => {
            const filteredTasks = col.tasks.filter((t: any) => t.title.toLowerCase().includes(search.toLowerCase()));
            return (
              <div key={col.id} className="flex flex-col w-80 bg-[#202C33] rounded-lg">
                <div className="p-3 border-b border-[#222E35] flex justify-between items-center bg-[#2A3942] rounded-t-lg">
                  <h3 className="font-medium text-[#E9EDEF]">{col.title}</h3>
                  <span className="bg-[#111B21] text-xs px-2 py-0.5 rounded text-[#8696A0]">{filteredTasks.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-3 space-y-3 ${snapshot.isDraggingOver ? 'bg-[#2A3942]/50' : ''}`}>
                      {filteredTasks.map((task: any, index: number) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`p-3 rounded bg-[#2A3942] shadow-sm border border-[#222E35] ${snapshot.isDragging ? 'opacity-70' : ''}`}
                            >
                              <div className="text-sm font-medium text-[#E9EDEF] mb-2">{task.title}</div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-[#8696A0] inline-block bg-[#111B21] px-1.5 py-0.5 rounded">{task.priority}</span>
                                {task.dueDate && <span className="text-[11px] text-[#8696A0]">⏱️ {new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>}
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
    </div>
  );
}
