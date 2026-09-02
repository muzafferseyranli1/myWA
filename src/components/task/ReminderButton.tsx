import { useState } from 'react';
import { Bell, AlertCircle, BarChart2 } from 'lucide-react';

interface ReminderButtonProps {
  type: 'overdue' | 'summary' | 'single';
  taskId?: string;
  chatId?: string;
  onSuccess?: () => void;
}

export default function ReminderButton({ type, taskId, chatId, onSuccess }: ReminderButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    let msg = '';
    if (type === 'overdue') msg = '🚨 Süresi geçmiş tüm görevler için hatırlatma gönderilecek. Onaylıyor musunuz?';
    if (type === 'summary') msg = '📊 Tüm aktif görevler için durum özeti gönderilecek. Onaylıyor musunuz?';
    if (type === 'single') msg = '🔔 Bu görev için hatırlatma gönderilecek. Onaylıyor musunuz?';

    if (!confirm(msg)) return;

    setLoading(true);
    // Dummy API call
    setTimeout(() => {
      setLoading(false);
      alert('Hatırlatma gönderildi ✅');
      if (onSuccess) onSuccess();
    }, 1000);
  };

  if (type === 'single') {
    return (
      <button 
        onClick={handleClick} 
        disabled={loading}
        className="p-1.5 bg-[#2A3942] rounded-full text-[#8696A0] hover:text-[#00A884] transition-colors"
        title="Hatırlat"
      >
        <Bell className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center space-x-2 rounded-md border border-[#222E35] bg-[#2A3942] px-3 py-1.5 hover:bg-[#374151] transition-colors ${loading ? 'opacity-50' : ''}`}
    >
      {type === 'overdue' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <BarChart2 className="w-4 h-4 text-blue-400" />}
      <span className="text-sm font-medium text-[#E9EDEF]">
        {type === 'overdue' ? 'Gecikenleri Hatırlat' : 'Durum Özeti Gönder'}
      </span>
    </button>
  );
}
