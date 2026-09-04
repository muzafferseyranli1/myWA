'use client';

import { useState } from 'react';
import { Search, Users, User } from 'lucide-react';
import { cn, formatTime } from '../../lib/utils';

interface ChatListProps {
  chats: any[];
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
}

export default function ChatList({ chats, selectedChatId, onSelectChat }: ChatListProps) {
  const [search, setSearch] = useState('');

  const chatList = Array.isArray(chats) ? chats : [];

  const filteredChats = chatList.filter(c => {
    const name = (c.name || c.id || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const sortedChats = [...filteredChats].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.lastMessage?.timestamp || 0).getTime();
    const timeB = new Date(b.updatedAt || b.lastMessage?.timestamp || 0).getTime();
    return timeB - timeA;
  });

  return (
    <div className="flex h-full flex-col bg-[#111B21]">
      <div className="border-b border-[#222E35] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8696A0]" />
          <input
            type="text"
            placeholder="Aratın veya sohbet bulun"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-[#202C33] py-2 pl-10 pr-4 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedChats.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#8696A0]">
            {search ? 'Sohbet bulunamadı' : 'Henüz sohbet yüklenmedi'}
          </div>
        ) : (
          sortedChats.map(chat => {
            const rawName = chat.name || (chat.id.includes('@') ? chat.id.split('@')[0] : chat.id);
            const isSelf = chat.id.includes('905332760534'); // user number
            const displayName = isSelf ? `${rawName} (Siz)` : rawName;
            const lastMsg = chat.lastMessage?.body || chat.lastMessagePreview || '';
            const lastTime = chat.lastMessage?.timestamp || chat.updatedAt;

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={cn(
                  "flex cursor-pointer items-center px-4 py-3 hover:bg-[#202C33] transition-colors border-b border-[#222E35]/40",
                  selectedChatId === chat.id && "bg-[#2A3942]"
                )}
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#6B7C85] text-sm font-bold text-[#E9EDEF]">
                  {chat.isGroup ? <Users className="h-5 w-5" /> : displayName.substring(0, 2).toUpperCase()}
                </div>
                
                <div className="ml-3 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <h3 className="truncate text-sm font-semibold text-[#E9EDEF]">{displayName}</h3>
                    <span className="text-[11px] text-[#8696A0]">
                      {lastTime ? formatTime(lastTime) : ''}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="truncate text-xs text-[#8696A0] max-w-[180px]">
                      {lastMsg || <span className="italic text-gray-500">Mesaj yok</span>}
                    </p>
                    <div className="flex items-center space-x-1">
                      {chat._count?.tasks > 0 && (
                        <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#00A884] text-[10px] font-bold text-[#111B21]">
                          {chat._count.tasks} görev
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
