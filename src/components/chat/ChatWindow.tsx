'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Image as ImageIcon, FileText } from 'lucide-react';
import MessageBubble from './MessageBubble';
import CreateTaskModal from '../task/CreateTaskModal';
import { getSocket } from '../../lib/socket';

interface ChatWindowProps {
  chatId: string;
  messages: any[];
  onCreateTask: (messageId: string) => void;
}

export default function ChatWindow({ chatId, messages, onCreateTask }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedMsgForTask, setSelectedMsgForTask] = useState<any>(null);

  const msgList = Array.isArray(messages) ? messages : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgList]);

  const handleSend = () => {
    if (!input.trim()) return;
    const sock = getSocket();
    sock.emit('send_message', { chatId, text: input });
    setInput('');
  };

  const handleContextMenuTask = (msg: any) => {
    setSelectedMsgForTask(msg);
    setIsTaskModalOpen(true);
  };

  return (
    <div className="flex h-full flex-col relative">
      <div className="flex h-[60px] items-center bg-[#202C33] px-4">
        <h2 className="text-lg font-medium text-[#E9EDEF]">Sohbet {chatId}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {msgList.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[#8696A0]">
            Bu sohbette henüz mesaj bulunmuyor.
          </div>
        ) : (
          msgList.map((msg: any, idx: number) => (
            <div key={msg?.id || idx} className="flex flex-col">
              <MessageBubble 
                message={msg} 
                isOwn={!!msg?.isFromMe} 
                onCreateTask={() => handleContextMenuTask(msg)} 
              />
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="flex h-[62px] items-center bg-[#202C33] px-4 space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Bir mesaj yazın"
          className="flex-1 rounded-lg bg-[#2A3942] px-4 py-2 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none"
        />
        <button onClick={handleSend} className="p-2 text-[#8696A0] hover:text-[#E9EDEF] cursor-pointer">
          <Send className="h-6 w-6" />
        </button>
      </div>

      {isTaskModalOpen && (
        <CreateTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          chatId={chatId}
          sourceMessageId={selectedMsgForTask?.id}
          messageBody={selectedMsgForTask?.body}
          contacts={[]}
        />
      )}
    </div>
  );
}
