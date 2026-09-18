'use client';

import { Plus, Search } from 'lucide-react';
import TaskCard from './TaskCard';
import { useState } from 'react';
import CreateTaskModal from './CreateTaskModal';
import EditTaskModal from './EditTaskModal';

export default function TaskSidebar({ chatId, tasks, contacts, onRefresh }: any) {
  const [filter, setFilter] = useState('Tümü');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const filteredTasks = tasks.filter((t: any) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    
    if (filter === 'Tümü') return true;
    if (filter === 'Yapılacak' && t.status === 'TODO') return true;
    if (filter === 'Devam Eden' && t.status === 'IN_PROGRESS') return true;
    if (filter === 'Tamamlandı' && t.status === 'DONE') return true;
    return false;
  });

  return (
    <div className="flex h-full flex-col bg-[#ffffff]">
      <div className="flex h-[60px] items-center justify-between border-b border-[#e9edef] bg-[#f0f2f5] px-4">
        <h2 className="text-lg font-medium text-[#111b21]">Görevler</h2>
        <button onClick={() => setIsCreateOpen(true)} className="flex items-center space-x-1 rounded bg-[#00A884] px-2 py-1 text-sm font-medium text-[#ffffff] hover:bg-[#008f6f]">
          <Plus className="h-4 w-4" />
          <span>Yeni</span>
        </button>
      </div>

      <div className="border-b border-[#e9edef] p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2 h-4 w-4 text-[#667781]" />
          <input
            type="text"
            placeholder="Görevlerde ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded bg-[#f0f2f5] py-1.5 pl-8 pr-3 text-sm text-[#111b21] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
          />
        </div>
        <div className="flex space-x-1 overflow-x-auto">
          {['Tümü', 'Yapılacak', 'Devam Eden', 'Tamamlandı'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`whitespace-nowrap rounded px-3 py-1 text-xs font-medium ${filter === tab ? 'bg-[#e9edef] text-[#00A884]' : 'text-[#667781] hover:bg-[#f0f2f5]'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center text-sm text-[#667781] mt-10">Bu sohbette henüz görev yok</div>
        ) : (
          filteredTasks.map((task: any) => (
            <TaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} onRemind={() => {}} />
          ))
        )}
      </div>

      {isCreateOpen && <CreateTaskModal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); onRefresh(); }} chatId={chatId} contacts={contacts} onTaskCreated={onRefresh} />}
      {editingTask && <EditTaskModal isOpen={!!editingTask} onClose={() => { setEditingTask(null); onRefresh(); }} task={editingTask} contacts={contacts} onTaskUpdated={onRefresh} />}
    </div>
  );
}
