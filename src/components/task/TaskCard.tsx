import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReminderButton from './ReminderButton';

export default function TaskCard({ task, onEdit, onRemind }: { task: any, onEdit: () => void, onRemind: () => void }) {
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'TODO': return 'border-l-yellow-500';
      case 'IN_PROGRESS': return 'border-l-blue-500';
      case 'DONE': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  return (
    <div 
      onClick={onEdit}
      className={cn(
        "cursor-pointer rounded bg-[#202C33] p-3 border-l-4 hover:bg-[#2A3942] transition-colors relative group",
        getStatusColor(task.status)
      )}
    >
      <div className="flex justify-between items-start">
        <h4 className="text-sm font-semibold text-[#E9EDEF] pr-6 truncate">{task.title}</h4>
      </div>
      
      {task.description && (
        <p className="mt-1 text-xs text-[#8696A0] truncate">{task.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="rounded bg-[#2A3942] px-2 py-0.5 text-[#8696A0]">{task.priority}</span>
          {task.dueDate && <span className="text-[#8696A0]">⏱️ {new Date(task.dueDate).toLocaleDateString()}</span>}
        </div>
        
        <div className="flex space-x-1">
          {task.assignees?.map((a: any, i: number) => (
            <div key={i} className="h-5 w-5 rounded-full bg-[#6B7C85] text-[10px] flex items-center justify-center text-white border border-[#202C33]">
              {a.name.substring(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <ReminderButton type="single" taskId={task.id} />
      </div>
    </div>
  );
}
