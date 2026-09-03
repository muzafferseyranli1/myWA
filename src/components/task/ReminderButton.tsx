'use client';

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
    if (type === 'overdue') msg = '🚨 Süresi geçmiş tüm görevler için WhatsApp üzerinden hatırlatma gönderilecek. Onaylıyor musunuz?';
    if (type === 'summary') msg = '📊 Tüm aktif görevler için WhatsApp sohbet gruplarına durum özeti gönderilecek. Onaylıyor musunuz?';
    if (type === 'single') msg = '🔔 Bu görev için ilgili kişiye WhatsApp hatırlatması gönderilecek. Onaylıyor musunuz?';

    if (!confirm(msg)) return;

    setLoading(true);
    try {
      let url = '/api/tasks/remind';
      let body: any = { scope: type === 'overdue' ? 'overdue' : 'all_pending', chatId };

      if (type === 'single' && taskId) {
        url = `/api/tasks/${taskId}/remind`;
        body = {};
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('mywa_token')}`
        },
        body: type === 'single' ? undefined : JSON.stringify(body)
      });

      if (res.ok) {
        alert('WhatsApp hatırlatma mesajı başarıyla gönderildi ✅');
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Hata: ${err.error || 'Hatırlatma gönderilemedi'}`);
      }
    } catch (e) {
      alert('Sunucu ile bağlantı kurulamadı.');
    } finally {
      setLoading(false);
    }
  };

  if (type === 'single') {
    return (
      <button 
        onClick={handleClick} 
        disabled={loading}
        className="p-1.5 bg-[#2A3942] rounded-full text-[#8696A0] hover:text-[#00A884] transition-colors"
        title="WhatsApp Hatırlatması Gönder"
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
        {loading ? 'Gönderiliyor...' : type === 'overdue' ? 'Gecikenleri Hatırlat' : 'Durum Özeti Gönder'}
      </span>
    </button>
  );
}
