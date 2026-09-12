'use client';

import { cn, formatTime } from '../../lib/utils';
import { FileText, Image as ImageIcon, Play, CheckCheck, CornerDownRight } from 'lucide-react';

export default function MessageBubble({ message, isOwn, onCreateTask }: { message: any, isOwn: boolean, onCreateTask: () => void }) {
  const senderDisplay = message.senderName || message.sender?.pushName || message.sender?.displayName || (message.senderId && !message.senderId.includes('@g.us') ? message.senderId.split('@')[0] : null);

  const renderContent = () => {
    return (
      <div className="space-y-1">
        {/* Quoted Message Box */}
        {message.quotedText && (
          <div className={cn(
            "rounded-md border-l-4 p-2 text-xs mb-1.5 transition-colors",
            isOwn 
              ? "border-emerald-300 bg-black/25 text-emerald-100" 
              : "border-[#00A884] bg-black/35 text-gray-200"
          )}>
            <div className="font-semibold text-[11px] text-emerald-400 flex items-center gap-1 mb-0.5">
              <CornerDownRight className="h-3 w-3 inline" />
              {message.quotedSender ? message.quotedSender : 'İleti'}
            </div>
            <p className="line-clamp-2 text-xs italic text-gray-300">{message.quotedText}</p>
          </div>
        )}

        {/* Media Rendering */}
        {message.mediaUrl && (
          <div className="overflow-hidden rounded">
            {message.messageType === 'IMAGE' && (
              <img 
                src={message.mediaUrl} 
                alt="Medya" 
                className="max-h-72 max-w-full rounded object-cover cursor-pointer hover:opacity-95 transition-opacity" 
              />
            )}
            {message.messageType === 'VIDEO' && (
              <video src={message.mediaUrl} controls className="max-h-72 max-w-full rounded" />
            )}
            {message.messageType === 'AUDIO' && (
              <div className="py-1">
                <audio src={message.mediaUrl} controls className="h-10 max-w-full" />
              </div>
            )}
            {message.messageType === 'DOCUMENT' && (
              <a 
                href={message.mediaUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center space-x-2 rounded bg-black/20 p-2.5 text-xs hover:bg-black/30"
              >
                <FileText className="h-6 w-6 text-[#00A884]" />
                <span className="truncate underline font-medium">{message.mediaName || 'Belge İndir'}</span>
              </a>
            )}
          </div>
        )}

        {/* Text Body */}
        {message.body && message.body.trim().length > 0 ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</div>
        ) : !message.mediaUrl && !message.quotedText ? (
          <div className="italic text-gray-400 text-xs">💬 (WhatsApp iletisi)</div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        if (!message.task) onCreateTask();
      }}
      className={cn(
        "relative max-w-[75%] rounded-lg px-3.5 py-2 mb-2 text-sm text-[#E9EDEF] shadow-md",
        isOwn ? "self-end bg-[#005C4B] rounded-tr-none" : "self-start bg-[#202C33] rounded-tl-none border border-[#222E35]"
      )}
    >
      {!isOwn && senderDisplay && (
        <div className="text-xs font-semibold text-emerald-400 mb-1">{senderDisplay}</div>
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
