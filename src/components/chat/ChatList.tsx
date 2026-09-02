import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface ChatListProps {
  chats: any[];
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
}

export default function ChatList({ chats, selectedChatId, onSelectChat }: ChatListProps) {
  const [search, setSearch] = useState('');

  const filteredChats = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const sortedChats = [...filteredChats].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#222E35] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2 h-5 w-5 text-[#8696A0]" />
          <input
            type="text"
            placeholder="Aratın veya yeni sohbet başlatın"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md bg-[#202C33] py-2 pl-10 pr-4 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedChats.map(chat => (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={cn(
              "flex cursor-pointer items-center px-4 py-3 hover:bg-[#202C33]",
              selectedChatId === chat.id && "bg-[#2A3942]"
            )}
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#6B7C85] text-[#E9EDEF]">
              {chat.isGroup ? <Users className="h-6 w-6" /> : chat.name.substring(0, 2).toUpperCase()}
            </div>
            
            <div className="ml-3 flex-1 overflow-hidden border-b border-[#222E35] pb-3">
              <div className="flex items-center justify-between">
                <h3 className="truncate text-base font-medium text-[#E9EDEF]">{chat.name}</h3>
                <span className="text-xs text-[#8696A0]">
                  {chat.lastMessageTime ? formatTime(chat.lastMessageTime) : ''}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="truncate text-sm text-[#8696A0]">{chat.lastMessagePreview || 'Mesaj yok'}</p>
                <div className="flex items-center space-x-1">
                  {chat.taskCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00A884] text-xs font-bold text-[#111B21]">
                      {chat.taskCount}
                    </span>
                  )}
                  {chat.unreadCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00A884] text-xs font-bold text-[#111B21]">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
