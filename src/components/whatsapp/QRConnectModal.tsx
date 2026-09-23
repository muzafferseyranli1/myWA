'use client';

import { useState, useEffect } from 'react';
import { X, CheckCircle, Smartphone, AlertTriangle, RefreshCw } from 'lucide-react';

export default function QRConnectModal({ isOpen, onClose, qrCode, status }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localQr, setLocalQr] = useState<string>(qrCode || '');
  const [localStatus, setLocalStatus] = useState<string>(status || 'disconnected');
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    setLocalQr(qrCode || '');
  }, [qrCode]);

  useEffect(() => {
    if (status) setLocalStatus(status);
  }, [status]);

  useEffect(() => {
    let interval: any = null;
    if (isOpen && (localStatus === 'connecting' || !localQr) && localStatus !== 'connected') {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/whatsapp/status', {
            headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status) setLocalStatus(data.status);
            setLocalQr(data.qr || '');
          }
        } catch (e) {}
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, localStatus, localQr]);

  useEffect(() => {
    if (localStatus === 'connected' || localStatus === 'ready' || status === 'connected' || status === 'ready') {
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [localStatus, status, onClose]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setLocalStatus('connecting');
    try {
      const connected = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
      if (!connected.ok) throw new Error((await connected.json()).error || 'Bağlantı başlatılamadı');
      const res = await fetch('/api/whatsapp/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setLocalStatus(data.status);
        setLocalQr(data.qr || '');
      }
    } catch (e: any) {
      setLocalStatus('disconnected'); setLocalQr(''); setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // A QR code cannot be scanned by the phone that is displaying it, so offer
  // WhatsApp's "link with phone number" pairing code as well.
  const requestPairingCode = async () => {
    setPairing(true); setError(''); setPairingCode('');
    try {
      const res = await fetch('/api/whatsapp/pairing-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Eşleştirme kodu alınamadı');
      setPairingCode(data.code);
    } catch (e: any) { setError(e.message); } finally { setPairing(false); }
  };

  const activeQr = qrCode || localQr;
  const activeStatus = localStatus || status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-lg bg-[#f0f2f5] border border-[#e9edef] flex flex-col p-5 sm:p-6 text-center shadow-xl">
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-medium text-[#111b21]">WhatsApp Bağlantısı</h2>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111b21]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[260px] bg-[#ffffff] rounded-lg p-4 border border-[#e9edef]">
          {activeQr && activeStatus !== 'connected' ? (
            <>
              <img src={activeQr} alt="WhatsApp QR Code" className="w-52 h-52 mb-4 bg-white p-2 rounded shadow-md" />
              <p className="text-sm font-semibold text-[#00A884]">QR Kodu WhatsApp ile Okutun</p>
              <p className="text-xs text-[#667781] mt-1">WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Bağla</p>
              <div className="mt-4 w-full border-t border-[#e9edef] pt-4 text-left">
                <p className="mb-2 text-xs text-[#667781]">Panel bağlayacağınız telefonda mı açık? QR yerine telefon numaranızla bağlanın:</p>
                <div className="flex gap-2">
                  <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="905xxxxxxxxx" aria-label="Telefon numarası (ülke koduyla)" className="min-w-0 flex-1 rounded-md border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00A884]" />
                  <button onClick={() => void requestPairingCode()} disabled={pairing || phone.replace(/\D/g, '').length < 10} className="shrink-0 rounded-md bg-[#00A884] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pairing ? 'Alınıyor…' : 'Kod al'}</button>
                </div>
                {pairingCode && <>
                  <p className="mt-3 select-all text-center font-mono text-2xl font-semibold tracking-[0.2em] text-[#111b21]">{pairingCode}</p>
                  <p className="mt-2 text-xs leading-5 text-[#667781]">WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Bağla &gt; <b>Bunun yerine telefon numarasıyla bağlan</b> adımından bu kodu girin.</p>
                </>}
              </div>
            </>
          ) : activeStatus === 'connected' || activeStatus === 'ready' ? (
            <>
              <CheckCircle className="h-14 w-14 text-[#00A884] mb-3" />
              <p className="text-base font-semibold text-[#111b21]">WhatsApp Bağlandı ✅</p>
              <p className="text-xs text-[#667781] mt-1">Sohbetler ve mesajlar anlık senkronize ediliyor.</p>
            </>
          ) : activeStatus === 'authenticated' ? (
            <>
              <CheckCircle className="h-12 w-12 text-[#00A884] mb-4 animate-pulse" />
              <p className="text-sm text-[#667781]">Doğrulandı, oturum açılıyor...</p>
            </>
          ) : activeStatus === 'connecting' || loading ? (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#00A884] mb-4"></div>
              <p className="text-sm text-[#111b21] font-medium">QR Kod Hazırlanıyor...</p>
              <p className="text-xs text-[#667781] mt-1">Lütfen birkaç saniye bekleyin</p>
            </>
          ) : (
            <>
              <Smartphone className="h-12 w-12 text-[#667781] mb-4" />
              <p className="text-sm text-[#667781] mb-4">Bağlantı kurulu değil</p>
              <button 
                onClick={handleConnect} 
                disabled={loading}
                className="flex items-center space-x-2 bg-[#00A884] text-[#ffffff] px-5 py-2.5 rounded-md font-semibold text-sm hover:bg-[#008f6f] transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Başlatılıyor...' : 'QR Kod Oluştur / Bağlan'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
