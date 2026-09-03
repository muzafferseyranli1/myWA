'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatList from '../../components/chat/ChatList';
import ChatWindow from '../../components/chat/ChatWindow';
import TaskSidebar from '../../components/task/TaskSidebar';
import KanbanBoard from '../../components/task/KanbanBoard';
import QRConnectModal from '../../components/whatsapp/QRConnectModal';
import ReminderButton from '../../components/task/ReminderButton';
import { getSocket } from '../../lib/socket';
import { LogOut, Smartphone, CheckCircle, Clock } from 'lucide-react';

export default function ChatDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'kanban'>('chat');
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  
  const [waStatus, setWaStatus] = useState<'qr' | 'connecting' | 'authenticated' | 'ready' | 'disconnected'>('disconnected');
  const [qrCode, setQrCode] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isTaskSidebarOpen, setIsTaskSidebarOpen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mywa_token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem('mywa_token');
        router.push('/login');
      });

    const sock = getSocket();
    sock.auth = { token };
    sock.connect();

    const onStatus = (data: any) => {
      if (typeof data === 'string') setWaStatus(data as any);
      else if (data?.status) setWaStatus(data.status);
    };

    const onQR = (data: any) => {
      const qrVal = typeof data === 'string' ? data : data?.qr || data?.qrCode || '';
      setQrCode(qrVal);
      setWaStatus('qr');
    };

    const onNewMsg = (msg: any) => {
      setMessages(prev => [...prev, msg]);
    };

    const onTaskCreated = (task: any) => {
      setTasks(prev => [...prev, task]);
    };

    const onTaskUpdated = (updatedTask: any) => {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    };

    const onTaskDeleted = (taskId: string) => {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    };

    sock.on('whatsapp_status', onStatus);
    sock.on('whatsapp_qr', onQR);
    sock.on('new_message', onNewMsg);
    sock.on('task_created', onTaskCreated);
    sock.on('task_updated', onTaskUpdated);
    sock.on('task_deleted', onTaskDeleted);

    fetchChats();

    return () => {
      sock.off('whatsapp_status', onStatus);
      sock.off('whatsapp_qr', onQR);
      sock.off('new_message', onNewMsg);
      sock.off('task_created', onTaskCreated);
      sock.off('task_updated', onTaskUpdated);
      sock.off('task_deleted', onTaskDeleted);
    };
  }, [router]);

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chats', {
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
      if (res.ok) setChats(await res.json());
    } catch (e) {}
  };

  const fetchMessagesAndTasks = async (chatId: string) => {
    try {
      const [msgRes, taskRes] = await Promise.all([
        fetch(`/api/chats/${chatId}/messages`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
        }),
        fetch(`/api/chats/${chatId}/tasks`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
        })
      ]);
      
      if (msgRes.ok) setMessages(await msgRes.json());
      if (taskRes.ok) setTasks(await taskRes.json());
    } catch (e) {}
  };

  const handleSelectChat = (chatId: string) => {
    const sock = getSocket();
    if (selectedChatId) {
      sock.emit('leave_chat', selectedChatId);
    }
    setSelectedChatId(chatId);
    sock.emit('join_chat', chatId);
    fetchMessagesAndTasks(chatId);
  };

  const handleLogout = () => {
    localStorage.removeItem('mywa_token');
    router.push('/login');
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen flex-col bg-[#111B21] text-[#E9EDEF]">
      {/* Header Bar */}
      <header className="flex h-16 items-center justify-between border-b border-[#222E35] bg-[#202C33] px-4">
        <div className="flex items-center space-x-6">
          <h1 className="text-xl font-bold text-[#E9EDEF]">MyWA</h1>
          
          <div className="flex rounded-md bg-[#111B21] p-1">
            <button
              onClick={() => setCurrentView('chat')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${currentView === 'chat' ? 'bg-[#2A3942] text-[#00A884]' : 'text-[#8696A0] hover:text-[#E9EDEF]'}`}
            >
              Sohbet
            </button>
            <button
              onClick={() => setCurrentView('kanban')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${currentView === 'kanban' ? 'bg-[#2A3942] text-[#00A884]' : 'text-[#8696A0] hover:text-[#E9EDEF]'}`}
            >
              Kanban
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <ReminderButton type="overdue" />
          <ReminderButton type="summary" />
          
          <button 
            onClick={() => setIsQrModalOpen(true)}
            className="flex items-center space-x-2 rounded-md border border-[#222E35] bg-[#2A3942] px-3 py-1.5 hover:bg-[#374151]"
          >
            <div className={`h-2.5 w-2.5 rounded-full ${waStatus === 'ready' ? 'bg-green-500' : waStatus === 'connecting' || waStatus === 'qr' || waStatus === 'authenticated' ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <Smartphone className="h-4 w-4 text-[#8696A0]" />
            <span className="text-sm font-medium text-[#E9EDEF]">
              {waStatus === 'ready' ? 'Bağlı' : waStatus === 'disconnected' ? 'Bağlan' : 'Bağlanıyor...'}
            </span>
          </button>
          
          <button onClick={handleLogout} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {currentView === 'chat' ? (
          <>
            <div className="w-[320px] flex-shrink-0 border-r border-[#222E35] bg-[#111B21]">
              <ChatList chats={chats} selectedChatId={selectedChatId} onSelectChat={handleSelectChat} />
            </div>
            
            <div className="flex-1 bg-[url('/chat-bg.png')] bg-repeat bg-[#0B141A]">
              {selectedChatId ? (
                <ChatWindow chatId={selectedChatId} messages={messages} onCreateTask={() => {}} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center bg-[#222E35]">
                  <div className="rounded-full bg-[#2A3942] p-4 text-[#00A884]">
                    <CheckCircle className="h-12 w-12" />
                  </div>
                  <p className="mt-4 text-[#8696A0]">Görüntülemek için bir sohbet seçin</p>
                </div>
              )}
            </div>

            {isTaskSidebarOpen && selectedChatId && (
              <div className="w-[350px] flex-shrink-0 border-l border-[#222E35] bg-[#111B21]">
                <TaskSidebar chatId={selectedChatId} tasks={tasks} onEditTask={() => {}} onRefresh={() => fetchMessagesAndTasks(selectedChatId)} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-auto bg-[#111B21]">
            <KanbanBoard />
          </div>
        )}
      </div>

      <QRConnectModal 
        isOpen={isQrModalOpen} 
        onClose={() => setIsQrModalOpen(false)} 
        qrCode={qrCode} 
        status={waStatus} 
      />
    </div>
  );
}
