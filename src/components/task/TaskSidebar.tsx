import { Plus } from 'lucide-react';
import TaskCard from './TaskCard';
import { useState } from 'react';
import CreateTaskModal from './CreateTaskModal';
import EditTaskModal from './EditTaskModal';

export default function TaskSidebar({ chatId, tasks, onEditTask, onRefresh }: any) {
  const [filter, setFilter] = useState('Tümü');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const filteredTasks = tasks.filter((t: any) => {
    if (filter === 'Tümü') return true;
    if (filter === 'Yapılacak' && t.status === 'TODO') return true;
    if (filter === 'Devam Eden' && t.status === 'IN_PROGRESS') return true;
    if (filter === 'Tamamlandı' && t.status === 'DONE') return true;
    return false;
  });

  return (
    <div className="flex h-full flex-col bg-[#111B21]">
      <div className="flex h-[60px] items-center justify-between border-b border-[#222E35] bg-[#202C33] px-4">
        <h2 className="text-lg font-medium text-[#E9EDEF]">Görevler</h2>
        <button onClick={() => setIsCreateOpen(true)} className="flex items-center space-x-1 rounded bg-[#00A884] px-2 py-1 text-sm font-medium text-[#111B21] hover:bg-[#008f6f]">
          <Plus className="h-4 w-4" />
          <span>Yeni</span>
        </button>
      </div>

      <div className="flex space-x-1 border-b border-[#222E35] p-2 overflow-x-auto">
        {['Tümü', 'Yapılacak', 'Devam Eden', 'Tamamlandı'].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`whitespace-nowrap rounded px-3 py-1 text-xs font-medium ${filter === tab ? 'bg-[#2A3942] text-[#00A884]' : 'text-[#8696A0] hover:bg-[#202C33]'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center text-sm text-[#8696A0] mt-10">Bu sohbette henüz görev yok</div>
        ) : (
          filteredTasks.map((task: any) => (
            <TaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} onRemind={() => {}} />
          ))
        )}
      </div>

      {isCreateOpen && <CreateTaskModal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); onRefresh(); }} chatId={chatId} contacts={[]} />}
      {editingTask && <EditTaskModal isOpen={!!editingTask} onClose={() => { setEditingTask(null); onRefresh(); }} task={editingTask} contacts={[]} />}
    </div>
  );
}
