'use client';

import { cn, formatTime } from '../../lib/utils';
import { FileText, Image as ImageIcon, Play, CheckCheck } from 'lucide-react';

export default function MessageBubble({ message, isOwn, onCreateTask }: { message: any, isOwn: boolean, onCreateTask: () => void }) {
  const renderContent = () => {
    if (message.mediaUrl) {
      if (message.messageType === 'IMAGE') {
        return (
          <div className="mb-1 overflow-hidden rounded">
            <img src={message.mediaUrl} alt="Medya" className="max-h-64 max-w-full rounded object-cover cursor-pointer hover:opacity-90 transition-opacity" />
            {message.body && <p className="mt-1 text-sm">{message.body}</p>}
          </div>
        );
      }
      if (message.messageType === 'VIDEO') {
        return (
          <div className="mb-1">
            <video src={message.mediaUrl} controls className="max-h-64 max-w-full rounded" />
            {message.body && <p className="mt-1 text-sm">{message.body}</p>}
          </div>
        );
      }
      if (message.messageType === 'AUDIO') {
        return (
          <div className="mb-1 py-1">
            <audio src={message.mediaUrl} controls className="h-10 max-w-full" />
          </div>
        );
      }
      if (message.messageType === 'DOCUMENT') {
        return (
          <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center space-x-2 rounded bg-black/20 p-2 text-xs hover:bg-black/30">
            <FileText className="h-6 w-6 text-[#00A884]" />
            <span className="truncate underline">{message.mediaName || 'Belge İndir'}</span>
          </a>
        );
      }
    }

    if (message.body && message.body.trim().length > 0) {
      return <div className="whitespace-pre-wrap break-words">{message.body}</div>;
    }

    return <div className="italic text-gray-400 text-xs">💬 (WhatsApp iletisi)</div>;
  };

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        if (!message.task) onCreateTask();
      }}
      className={cn(
        "relative max-w-[70%] rounded-lg px-3 py-1.5 mb-1.5 text-sm text-[#E9EDEF] shadow-md",
        isOwn ? "self-end bg-[#005C4B] rounded-tr-none" : "self-start bg-[#202C33] rounded-tl-none border border-[#222E35]"
      )}
    >
      {!isOwn && message.senderName && (
        <div className="text-xs font-semibold text-emerald-400 mb-1">{message.senderName}</div>
      )}
      
      {renderContent()}
      
      <div className="mt-1 flex items-center justify-end space-x-1 text-[10px] text-gray-400">
        <span>{formatTime(message.timestamp)}</span>
        {isOwn && <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />}
      </div>

      {message.task && (
        <div className="mt-2 rounded bg-black/30 p-2 text-xs border border-white/10 cursor-pointer hover:bg-black/40 transition-colors">
          <div className="font-semibold text-[#00A884] mb-1 truncate">📋 {message.task.title}</div>
          <div className="flex space-x-2">
            <span className="rounded bg-blue-900/60 px-1.5 py-0.5 text-blue-200 text-[10px]">{message.task.status}</span>
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-200 text-[10px]">{message.task.priority}</span>
          </div>
        </div>
      )}
    </div>
  );
}
