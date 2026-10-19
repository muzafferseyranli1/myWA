'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { CheckCircle2, Clock, AlertTriangle, User, MessageSquare, ArrowLeft, Send, Check, RefreshCw } from 'lucide-react';
import { COMMIT_CHOICES, istanbulWorkingDay } from '@/lib/due-date';

// Due dates are stored as UTC midnight of the chosen day.
const longDate = (d: string | Date) => new Date(d).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' });
const nameOf = (a: any) => a.contact?.displayName || a.contact?.pushName || a.contact?.phoneNumber || a.contactId?.split('@')[0] || '';

export default function PublicTaskClosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [completedBy, setCompletedBy] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<'progress' | 'close'>('progress');
  const [days, setDays] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);

  const fetchTask = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${id}/public`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Görev bulunamadı veya silinmiş.');
        throw new Error('Görev bilgileri alınamadı.');
      }
      const data = await res.json();
      setTask(data);

      // Pre-select the assignee: the one the link was sent to, or the only one left.
      const pending = (data.assignees || []).filter((a: any) => !a.completedAt);
      const fromLink = new URLSearchParams(window.location.search).get('a');
      const me = pending.find((a: any) => a.id === fromLink) || (pending.length === 1 ? pending[0] : null);
      if (me) {
        setAssigneeId(me.id);
        setCompletedBy(nameOf(me));
      }
    } catch (err: any) {
      setError(err.message || 'Bilinmeyen bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchTask(); }, [fetchTask]);

  const handleCloseTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasAssignees && !assigneeId) {
      alert('Lütfen kendi adınızı seçiniz.');
      return;
    }
    if (!completionNote.trim()) {
      alert('Lütfen görev bitirme notunu giriniz.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/tasks/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionNote: completionNote.trim(),
          completedBy: completedBy.trim() || undefined,
          assigneeId: assigneeId || undefined
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

  const handleCommit = async () => {
    if (!assigneeId || days === null) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/tasks/${id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId, days })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Kaydedilemedi');
      setTask(resData.task);
      setCommitted(true);
      setDays(null);
    } catch (err: any) {
      alert(err.message || 'İşlem başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#00A884] border-r-transparent"></div>
          <p className="mt-3 text-sm text-[#667781]">Görev yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl bg-[#f0f2f5] p-6 text-center border border-[#e9edef]">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[#111b21]">Görev Bulunamadı</h2>
          <p className="mt-2 text-sm text-[#667781]">{error || 'Bu göreve ulaşılamıyor.'}</p>
        </div>
      </div>
    );
  }

  const isDone = task.status === 'DONE';
  const assignees: any[] = task.assignees || [];
  const hasAssignees = assignees.length > 0;
  const pendingAssignees = assignees.filter(a => !a.completedAt);
  const me = assignees.find(a => a.id === assigneeId);
  // Without assignees there is nobody to promise a date; only closing is offered.
  const activeMode = hasAssignees ? mode : 'close';
  const priorityLabels: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
    MEDIUM: { label: 'Orta', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
    HIGH: { label: 'Yüksek', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
    URGENT: { label: 'Acil', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  };

  const priorityInfo = priorityLabels[task.priority] || priorityLabels.MEDIUM;

  return (
    <div className="min-h-screen bg-[#ffffff] text-[#111b21] py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#e9edef]">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-tight text-[#00A884]">MyWA</span>
            <span className="text-xs text-[#667781] font-medium px-2 py-0.5 rounded bg-[#f0f2f5]">Görev Portalı</span>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${isDone ? 'bg-green-500/10 text-green-600 border-green-500/20' : task.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20'}`}>
            {isDone ? '✅ Tamamlandı' : task.status === 'IN_PROGRESS' ? '🔄 Devam Ediyor' : '🟡 Bekliyor'}
          </span>
        </div>

        {/* Başarı Kutusu */}
        {success && (
          <div className="rounded-xl bg-[#00A884]/15 border border-[#00A884]/40 p-4 text-center animate-fade-in">
            <CheckCircle2 className="h-10 w-10 text-[#00A884] mx-auto mb-2" />
            <h3 className="font-semibold text-base text-[#00A884]">{isDone ? 'Görev Başarıyla Kapatıldı!' : 'Göreviniz Kapatıldı!'}</h3>
            <p className="text-xs text-[#D1D7DB] mt-1">
              WhatsApp grubuna kapanış notunuz ve bildirim başarıyla iletildi.
            </p>
          </div>
        )}

        {/* Görev Bilgileri Kartı */}
        <div className="rounded-xl bg-[#f0f2f5] border border-[#e9edef] p-5 shadow-lg space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${priorityInfo.color}`}>
                {priorityInfo.label} Öncelik
              </span>
              {task.dueDate && (
                <span className="flex items-center text-xs text-[#667781] gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(task.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-[#111b21] mt-2 leading-snug">
              {task.title}
            </h1>
            {task.description && (
              <p className="text-sm text-[#667781] mt-2 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Görseller */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="pt-3 border-t border-[#e9edef]/60">
              <span className="text-xs text-[#667781] block mb-1.5 font-medium">🖼️ Görseller</span>
              <div className="grid grid-cols-2 gap-2">
                {task.attachments.map((a: any) => (
                  <a key={a.id} href={`/api/tasks/${id}/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/tasks/${id}/attachments/${a.id}`} alt={a.fileName} className="w-full rounded-lg border border-[#e9edef] object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Görevliler */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="pt-3 border-t border-[#e9edef]/60">
              <span className="text-xs text-[#667781] block mb-1.5 font-medium">👥 Görevliler</span>
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map((a: any) => {
                  const name = nameOf(a);
                  return (
                    <span key={a.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#ffffff] border border-[#e9edef] text-xs text-[#54656f]">
                      {a.completedAt ? <Check className="h-3 w-3 text-[#00A884]" /> : a.committedAt ? <RefreshCw className="h-3 w-3 text-blue-600" /> : <User className="h-3 w-3 text-[#00A884]" />}
                      {name}{a.completedAt ? ' · tamamladı' : a.committedDueDate ? ` · devam ediyor · ${longDate(a.committedDueDate)} tarihine kadar` : ' · bekliyor'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Kaynak WhatsApp Mesajı Kartı */}
        {task.sourceMessage && (
          <div className="rounded-xl bg-[#f0f2f5] border border-[#e9edef] p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-[#667781] mb-2 font-medium">
              <MessageSquare className="h-3.5 w-3.5 text-[#00A884]" />
              Orijinal WhatsApp Mesajı
            </div>
            <div className="rounded-lg bg-[#ffffff] p-3 border border-[#e9edef]">
              <div className="flex justify-between items-center text-xs text-[#667781] mb-1">
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
          <div className="rounded-xl bg-[#f0f2f5] border border-green-500/30 p-5 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
              <Check className="h-5 w-5" />
              Görev Tamamlandı
            </div>

            {task.completedBy && (
              <div className="text-xs text-[#667781]">
                Kapatan: <span className="text-[#111b21] font-medium">{task.completedBy}</span>
              </div>
            )}

            {task.completedAt && (
              <div className="text-xs text-[#667781]">
                Tarih: <span className="text-[#111b21] font-medium">{new Date(task.completedAt).toLocaleString('tr-TR')}</span>
              </div>
            )}

            {task.completionNote && (
              <div className="mt-2 pt-2 border-t border-[#e9edef]">
                <span className="text-xs text-[#667781] block mb-1">📝 Görev Bitirme Notu:</span>
                <div className="rounded-lg bg-[#ffffff] p-3 text-xs text-[#D1D7DB] italic border border-[#e9edef]">
                  &quot;{task.completionNote}&quot;
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-[#f0f2f5] border border-[#e9edef] p-5 space-y-4 shadow-lg">
            {hasAssignees ? (
              <div>
                <label className="block text-xs text-[#667781] mb-1 font-medium">
                  Kim olarak işlem yapıyorsunuz?
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => {
                    setAssigneeId(e.target.value);
                    const picked = pendingAssignees.find(a => a.id === e.target.value);
                    setCompletedBy(picked ? nameOf(picked) : '');
                  }}
                  className="w-full rounded-lg bg-[#ffffff] border border-[#e9edef] px-3 py-2 text-sm text-[#111b21] focus:outline-none focus:border-[#00A884]"
                >
                  <option value="">Seçiniz...</option>
                  {pendingAssignees.map(a => <option key={a.id} value={a.id}>{nameOf(a)}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-[#667781] mb-1 font-medium">
                  Adınız / Kapatan Kişi
                </label>
                <input
                  type="text"
                  value={completedBy}
                  onChange={(e) => setCompletedBy(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full rounded-lg bg-[#ffffff] border border-[#e9edef] px-3 py-2 text-sm text-[#111b21] placeholder-[#667781] focus:outline-none focus:border-[#00A884]"
                />
              </div>
            )}


            {hasAssignees && (
              <div className="grid grid-cols-2 gap-2" role="tablist">
                <button type="button" role="tab" aria-selected={activeMode === 'progress'} onClick={() => setMode('progress')}
                  className={'flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-semibold ' + (activeMode === 'progress' ? 'border-blue-600 bg-blue-600 text-white' : 'border-[#d1d7db] bg-white text-[#54656f]')}>
                  <RefreshCw className="h-4 w-4" /> Devam ediyorum
                </button>
                <button type="button" role="tab" aria-selected={activeMode === 'close'} onClick={() => setMode('close')}
                  className={'flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-semibold ' + (activeMode === 'close' ? 'border-[#00A884] bg-[#00A884] text-white' : 'border-[#d1d7db] bg-white text-[#54656f]')}>
                  <CheckCircle2 className="h-4 w-4" /> Görevi kapat
                </button>
              </div>
            )}

            {activeMode === 'progress' ? (
              <div className="space-y-3">
                {committed && me?.committedAt && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-center text-sm font-medium text-blue-700">
                    Kaydedildi, WhatsApp grubuna bildirildi.
                  </div>
                )}
                {!me ? (
                  <p className="text-xs text-[#667781]">Önce kendi adınızı seçin.</p>
                ) : me.committedAt ? (
                  <div className="rounded-lg bg-white p-3 text-sm text-[#111b21] border border-[#e9edef]">
                    Görevi <b>{longDate(me.committedDueDate)}</b> tarihine kadar tamamlayacağınızı bildirdiniz.
                    <p className="mt-1 text-xs text-[#667781]">Tarih yalnızca bir kez verilebilir. Bitirdiğinizde &quot;Görevi kapat&quot; sekmesinden kapatın.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="block text-xs text-[#667781] mb-1.5 font-medium">Ne zamana kadar tamamlayacaksınız?</span>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {COMMIT_CHOICES.map(c => (
                          <button key={c.days} type="button" onClick={() => setDays(c.days)} aria-pressed={days === c.days} aria-label={`${c.label}: ${longDate(istanbulWorkingDay(c.days))}`}
                            className={'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ' + (days === c.days ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-[#d1d7db] bg-white text-[#111b21]')}>
                            <span className="font-semibold">{c.label}</span>
                            <span className="text-xs text-[#667781]">{longDate(istanbulWorkingDay(c.days))}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#ffffff]/60 p-2.5 text-[11px] text-[#667781] border border-[#e9edef]/40">
                      ℹ️ Seçtiğiniz tarih görevin bitiş tarihi olur ve WhatsApp grubuna bildirilir. Tarih <b>yalnızca bir kez</b> verilebilir; hafta sonuna denk gelen tarih Pazartesi&apos;ye kayar.
                    </div>
                    <button type="button" onClick={() => void handleCommit()} disabled={submitting || days === null}
                      className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 text-sm flex items-center justify-center gap-2 shadow-md">
                      <RefreshCw className="h-4 w-4" /> {submitting ? 'Kaydediliyor…' : 'Devam ediyorum'}
                    </button>
                  </>
                )}
              </div>
            ) : (
          <form onSubmit={handleCloseTask} className="space-y-4">
            <div>
              <label className="block text-xs text-[#667781] mb-1 font-medium">
                Görev Bitirme Notu <span className="text-red-400">* (Zorunlu)</span>
              </label>
              <textarea
                required
                rows={3}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Neler yapıldı? (Örn: Slogan alternatifleri tamamlanıp dokümana eklendi...)"
                className="w-full rounded-lg bg-[#ffffff] border border-[#e9edef] px-3 py-2 text-sm text-[#111b21] placeholder-[#667781] focus:outline-none focus:border-[#00A884] resize-none"
              />
            </div>

            <div className="rounded-lg bg-[#ffffff]/60 p-2.5 text-[11px] text-[#667781] border border-[#e9edef]/40">
              ℹ️ Kapat butonuna bastığınızda, bu notla birlikte WhatsApp grubuna otomatik tamamlama mesajı gönderilecektir.{pendingAssignees.length > 1 ? ' Görev, tüm görevliler kendi payını kapatınca tamamlanır.' : ''}
            </div>

            <button
              type="submit"
              disabled={submitting || !completionNote.trim()}
              className="w-full rounded-lg bg-[#00A884] hover:bg-[#008f6f] disabled:opacity-50 text-[#ffffff] font-bold py-3 text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#ffffff] border-r-transparent"></div>
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
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 text-xs text-[#667781]">
          MyWA WhatsApp Görev Takip Sistemi
        </div>
      </div>
    </div>
  );
}
