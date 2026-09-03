'use client';

import { cn, formatTime } from '@/lib/utils';

export default function MessageBubble({ message, isOwn, onCreateTask }: { message: any, isOwn: boolean, onCreateTask: () => void }) {
  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        if (!message.task) onCreateTask();
      }}
      className={cn(
        "relative max-w-[65%] rounded-md px-2 py-1 mb-1 text-sm text-[#E9EDEF] shadow-sm",
        isOwn ? "self-end bg-[#005C4B] bubble-out rounded-tr-none" : "self-start bg-[#202C33] bubble-in rounded-tl-none"
      )}
    >
      {!isOwn && message.senderName && (
        <div className="text-xs font-medium text-orange-400 mb-1">{message.senderName}</div>
      )}
      
      <div>{message.body}</div>
      
      <div className="mt-1 flex items-center justify-end space-x-1 text-[11px] text-gray-400">
        <span>{formatTime(message.timestamp)}</span>
      </div>

      {message.task && (
        <div className="mt-2 rounded bg-black/20 p-2 text-xs border border-white/10 cursor-pointer">
          <div className="font-medium text-white mb-1 truncate">{message.task.title}</div>
          <div className="flex space-x-2">
            <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-blue-200">{message.task.status}</span>
            <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-red-200">{message.task.priority}</span>
          </div>
        </div>
      )}
    </div>
  );
}
