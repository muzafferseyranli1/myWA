'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertTriangle, User, MessageSquare, ArrowLeft, Send, Check } from 'lucide-react';

export default function PublicTaskClosePage({ params }: { params: { id: string } }) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [completedBy, setCompletedBy] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchTask();
  }, [params.id]);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${params.id}/public`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Görev bulunamadı veya silinmiş.');
        throw new Error('Görev bilgileri alınamadı.');
      }
      const data = await res.json();
      setTask(data);

      // Pre-fill completedBy with first assignee if available
      if (data.assignees && data.assignees.length > 0) {
        const first = data.assignees[0].contact;
        setCompletedBy(first?.pushName || first?.displayName || first?.phoneNumber || '');
      }
    } catch (err: any) {
      setError(err.message || 'Bilinmeyen bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionNote.trim()) {
      alert('Lütfen görev bitirme notunu giriniz.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/tasks/${params.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionNote: completionNote.trim(),
          completedBy: completedBy.trim() || undefined
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Görev kapatılırken hata oluştu');
      }

      setTask(resData.task);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'İşlem başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111B21] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#00A884] border-r-transparent"></div>
          <p className="mt-3 text-sm text-[#8696A0]">Görev yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-[#111B21] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl bg-[#202C33] p-6 text-center border border-[#222E35]">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[#E9EDEF]">Görev Bulunamadı</h2>
          <p className="mt-2 text-sm text-[#8696A0]">{error || 'Bu göreve ulaşılamıyor.'}</p>
        </div>
      </div>
    );
  }

  const isDone = task.status === 'DONE';
  const priorityLabels: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
    MEDIUM: { label: 'Orta', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
    HIGH: { label: 'Yüksek', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
    URGENT: { label: 'Acil', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  };

  const priorityInfo = priorityLabels[task.priority] || priorityLabels.MEDIUM;

  return (
    <div className="min-h-screen bg-[#111B21] text-[#E9EDEF] py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#222E35]">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-tight text-[#00A884]">MyWA</span>
            <span className="text-xs text-[#8696A0] font-medium px-2 py-0.5 rounded bg-[#202C33]">Görev Portalı</span>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${isDone ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
            {isDone ? '✅ Tamamlandı' : '🟡 Devam Ediyor'}
          </span>
        </div>

        {/* Başarı Kutusu */}
        {success && (
          <div className="rounded-xl bg-[#00A884]/15 border border-[#00A884]/40 p-4 text-center animate-fade-in">
            <CheckCircle2 className="h-10 w-10 text-[#00A884] mx-auto mb-2" />
            <h3 className="font-semibold text-base text-[#00A884]">Görev Başarıyla Kapatıldı!</h3>
            <p className="text-xs text-[#D1D7DB] mt-1">
              WhatsApp grubuna kapanış notunuz ve bildirim başarıyla iletildi.
            </p>
          </div>
        )}

        {/* Görev Bilgileri Kartı */}
        <div className="rounded-xl bg-[#202C33] border border-[#222E35] p-5 shadow-lg space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${priorityInfo.color}`}>
                {priorityInfo.label} Öncelik
              </span>
              {task.dueDate && (
                <span className="flex items-center text-xs text-[#8696A0] gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(task.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-[#E9EDEF] mt-2 leading-snug">
              {task.title}
            </h1>
            {task.description && (
              <p className="text-sm text-[#8696A0] mt-2 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Görevliler */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="pt-3 border-t border-[#2A3942]/60">
              <span className="text-xs text-[#8696A0] block mb-1.5 font-medium">👥 Görevliler</span>
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map((a: any) => {
                  const name = a.contact?.pushName || a.contact?.displayName || a.contact?.phoneNumber || a.contactId?.split('@')[0];
                  return (
                    <span key={a.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#111B21] border border-[#2A3942] text-xs text-[#D1D7DB]">
                      <User className="h-3 w-3 text-[#00A884]" />
                      {name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Kaynak WhatsApp Mesajı Kartı */}
        {task.sourceMessage && (
          <div className="rounded-xl bg-[#202C33] border border-[#222E35] p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-[#8696A0] mb-2 font-medium">
              <MessageSquare className="h-3.5 w-3.5 text-[#00A884]" />
              Orijinal WhatsApp Mesajı
            </div>
            <div className="rounded-lg bg-[#111B21] p-3 border border-[#2A3942]">
              <div className="flex justify-between items-center text-xs text-[#8696A0] mb-1">
                <span className="font-semibold text-[#00A884]">
                  {task.sourceMessage.sender?.pushName || task.sourceMessage.sender?.phoneNumber || 'Grup Üyesi'}
                </span>
                <span>{new Date(task.sourceMessage.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-xs text-[#D1D7DB] whitespace-pre-wrap break-words leading-relaxed">
                {task.sourceMessage.body}
              </p>
            </div>
          </div>
        )}

        {/* Kapanış Bilgisi veya Kapatma Formu */}
        {isDone ? (
          <div className="rounded-xl bg-[#202C33] border border-green-500/30 p-5 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
              <Check className="h-5 w-5" />
              Görev Tamamlandı
            </div>

            {task.completedBy && (
              <div className="text-xs text-[#8696A0]">
                Kapatan: <span className="text-[#E9EDEF] font-medium">{task.completedBy}</span>
              </div>
            )}

            {task.completedAt && (
              <div className="text-xs text-[#8696A0]">
                Tarih: <span className="text-[#E9EDEF] font-medium">{new Date(task.completedAt).toLocaleString('tr-TR')}</span>
              </div>
            )}

            {task.completionNote && (
              <div className="mt-2 pt-2 border-t border-[#2A3942]">
                <span className="text-xs text-[#8696A0] block mb-1">📝 Görev Bitirme Notu:</span>
                <div className="rounded-lg bg-[#111B21] p-3 text-xs text-[#D1D7DB] italic border border-[#2A3942]">
                  "{task.completionNote}"
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCloseTask} className="rounded-xl bg-[#202C33] border border-[#222E35] p-5 space-y-4 shadow-lg">
            <div className="border-b border-[#2A3942] pb-2">
              <h2 className="text-sm font-bold text-[#E9EDEF] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#00A884]" />
                Görevi Kapat
              </h2>
              <p className="text-xs text-[#8696A0] mt-0.5">
                Görevi tamamladıysanız bitirme notunuzu yazarak kapatın.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[#8696A0] mb-1 font-medium">
                Adınız / Kapatan Kişi
              </label>
              <input
                type="text"
                value={completedBy}
                onChange={(e) => setCompletedBy(e.target.value)}
                placeholder="Örn: Muzaffer"
                className="w-full rounded-lg bg-[#111B21] border border-[#2A3942] px-3 py-2 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8696A0] mb-1 font-medium">
                Görev Bitirme Notu <span className="text-red-400">* (Zorunlu)</span>
              </label>
              <textarea
                required
                rows={3}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Neler yapıldı? (Örn: Slogan alternatifleri tamamlanıp dokümana eklendi...)"
                className="w-full rounded-lg bg-[#111B21] border border-[#2A3942] px-3 py-2 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884] resize-none"
              />
            </div>

            <div className="rounded-lg bg-[#111B21]/60 p-2.5 text-[11px] text-[#8696A0] border border-[#2A3942]/40">
              ℹ️ Kapat butonuna bastığınızda, bu notla birlikte WhatsApp grubuna otomatik tamamlama mesajı gönderilecektir.
            </div>

            <button
              type="submit"
              disabled={submitting || !completionNote.trim()}
              className="w-full rounded-lg bg-[#00A884] hover:bg-[#008f6f] disabled:opacity-50 text-[#111B21] font-bold py-3 text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#111B21] border-r-transparent"></div>
                  Kapatılıyor & Bildiriliyor...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Görevi Tamamla & Kapat
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="text-center pt-2 text-xs text-[#8696A0]">
          MyWA WhatsApp Görev Takip Sistemi
        </div>
      </div>
    </div>
  );
}
