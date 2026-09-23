'use client';

import { deliveryLabels } from '../../lib/types';
import { cn } from '../../lib/utils';
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
        "cursor-pointer rounded bg-[#f0f2f5] p-3 border-l-4 hover:bg-[#e9edef] transition-colors relative group",
        getStatusColor(task.status)
      )}
    >
      <div className="flex justify-between items-start">
        <h4 className="text-sm font-semibold text-[#111b21] pr-6 truncate">{task.title}</h4>
      </div>
      
      {task.description && (
        <p className="mt-1 text-xs text-[#667781] truncate">{task.description}</p>
      )}

      {task.notification && <p className="text-xs text-[#667781] mt-2">{deliveryLabels[task.notification.status as keyof typeof deliveryLabels]}</p>}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="rounded bg-[#e9edef] px-2 py-0.5 text-[#667781]">{task.priority}</span>
          {task.dueDate && <span className="text-[#667781]">⏱️ {new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>}
        </div>
        
        <div className="flex space-x-1">
          {task.assignees?.map((a: any, i: number) => {
            const name = a.contact?.displayName || a.contact?.pushName || a.contact?.phoneNumber || 'K';
            return (
              <div key={i} title={name} className="h-5 w-5 rounded-full bg-[#dfe5e7] text-[10px] flex items-center justify-center text-[#54656f] border border-[#f0f2f5]">
                {name.substring(0, 2).toUpperCase()}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100" onClick={(e) => e.stopPropagation()}>
        <ReminderButton type="single" taskId={task.id} />
      </div>
    </div>
  );
}
