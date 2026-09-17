'use client';

import { cn, formatTime } from '../../lib/utils';
import { FileText, Image as ImageIcon, Play, CheckCheck, CornerDownRight, Pin } from 'lucide-react';
import { useState, JSX } from 'react';

function resolveNameFromContacts(identifier: string, contacts: any[] = []): string | null {
  if (!identifier) return null;
  const clean = identifier.trim().replace(/^@/, '');
  const rawId = clean.split('@')[0];
  
  const found = contacts.find(c => {
    const cId = c.id ? c.id.split('@')[0] : '';
    const cPhone = c.phoneNumber ? c.phoneNumber.split('@')[0] : '';
    const cLid = c.lidId ? c.lidId.split('@')[0] : '';
    const cMapped = c.mappedJid ? c.mappedJid.split('@')[0] : '';
    return cId === rawId || cPhone === rawId || cLid === rawId || cMapped === rawId || c.id === clean || c.phoneNumber === clean;
  });

  if (found) {
    const name = found.displayName || found.pushName;
    if (name) return name;

    // Bağlı başka bir kayıt varsa (örn: LID veya JID) oradaki ismi kontrol et
    const linked = contacts.find(c => 
      (c !== found) && 
      ((found.lidId && (c.id === found.lidId || c.lidId === found.lidId)) ||
       (found.id && c.lidId === found.id))
    );
    if (linked && (linked.displayName || linked.pushName)) {
      return linked.displayName || linked.pushName;
    }

    if (found.phoneNumber && found.phoneNumber !== rawId && found.phoneNumber.length <= 13) {
      return found.phoneNumber;
    }
  }
  return null;
}

function formatMessageBodyWithMentions(text: string, contacts: any[] = []) {
  if (!text) return null;

  const mentionRegex = /@(\d{9,16})/g;
  if (!mentionRegex.test(text)) {
    return text;
  }

  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  mentionRegex.lastIndex = 0;

  while ((match = mentionRegex.exec(text)) !== null) {
    const rawNumber = match[1];
    const resolvedName = resolveNameFromContacts(rawNumber, contacts);
    
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (resolvedName) {
      parts.push(
        <span 
          key={match.index} 
          className="inline-flex items-center font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-1.5 py-0.5 rounded text-xs mx-0.5 shadow-sm"
          title={`@${rawNumber}`}
        >
          @{resolvedName}
        </span>
      );
    } else {
      parts.push(
        <span key={match.index} className="font-semibold text-emerald-400/90">
          @{rawNumber}
        </span>
      );
    }

    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export default function MessageBubble({ 
  message, 
  isOwn, 
  onCreateTask,
  contacts = []
}: { 
  message: any, 
  isOwn: boolean, 
  onCreateTask: () => void,
  contacts?: any[]
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  let senderDisplay = message.senderName || message.sender?.pushName || message.sender?.displayName;
  if (!senderDisplay && message.senderId) {
    const resolved = resolveNameFromContacts(message.senderId, contacts);
    senderDisplay = resolved || (!message.senderId.includes('@g.us') ? message.senderId.split('@')[0] : null);
  }

  const quotedSenderDisplay = message.quotedSender 
    ? (resolveNameFromContacts(message.quotedSender, contacts) || message.quotedSender)
    : 'İleti';

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
              {quotedSenderDisplay}
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

        {/* Text Body with Mention Highlighting */}
        {message.messageType === 'REACTION' && message.body ? (
          <div className="italic text-gray-400 text-xs">🫶 {message.body}</div>
        ) : message.body && message.body.trim().length > 0 ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {formatMessageBodyWithMentions(message.body, contacts)}
          </div>
        ) : !message.mediaUrl && !message.quotedText ? (
          <div className="italic text-gray-400 text-xs">💬 (WhatsApp iletisi)</div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!message.task) onCreateTask();
      }}
      className={cn(
        "relative max-w-[75%] rounded-lg px-3.5 py-2 mb-2 text-sm text-[#E9EDEF] shadow-md group",
        isOwn ? "self-end bg-[#005C4B] rounded-tr-none" : "self-start bg-[#202C33] rounded-tl-none border border-[#222E35]"
      )}
    >
      {/* Pin Button on Hover */}
      {!message.task && (
        <button 
          onClick={onCreateTask}
          className={cn(
            "absolute -top-2 rounded-full p-1 bg-[#2A3942] border border-[#222E35] text-[#8696A0] hover:text-[#00A884] transition-opacity shadow-md z-10",
            isHovered ? "opacity-100" : "opacity-0",
            isOwn ? "-left-2" : "-right-2"
          )}
          title="Görevi Oluştur"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      )}

      {!isOwn && senderDisplay && (
        <div className="text-xs font-semibold text-emerald-400 mb-1">{senderDisplay}</div>
      )}
      
      {renderContent()}
      
      <div className="mt-1 flex items-center justify-end space-x-1 text-[10px] text-gray-400">
        <span>{formatTime(message.timestamp)}</span>
        {isOwn && <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />}
      </div>

      {message.task && (
        <div onClick={onCreateTask} className="mt-2 rounded bg-black/30 p-2 text-xs border border-white/10 cursor-pointer hover:bg-black/40 transition-colors">
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
