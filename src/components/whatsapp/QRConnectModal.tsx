'use client';

import { useState } from 'react';
import { X, CheckCircle, Smartphone, AlertTriangle, RefreshCw } from 'lucide-react';

export default function QRConnectModal({ isOpen, onClose, qrCode, status }: any) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
    } catch (e) {
      console.error('Failed to trigger connect:', e);
    } finally {
      setTimeout(() => setLoading(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-[#202C33] border border-[#222E35] flex flex-col p-6 text-center shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-medium text-[#E9EDEF]">WhatsApp Bağlantısı</h2>
          <button onClick={onClose} className="text-[#8696A0] hover:text-[#E9EDEF]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[250px] bg-[#111B21] rounded-lg p-4 border border-[#222E35]">
          {qrCode ? (
            <>
              <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48 mb-4 bg-white p-2 rounded shadow-md" />
              <p className="text-sm font-medium text-[#E9EDEF]">WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Bağla</p>
              <p className="text-xs text-[#8696A0] mt-1">Telefonunuzdan QR kodu kameraya tutun</p>
            </>
          ) : status === 'connected' || status === 'ready' ? (
            <>
              <CheckCircle className="h-14 w-14 text-[#00A884] mb-3" />
              <p className="text-base font-semibold text-[#E9EDEF]">WhatsApp Bağlandı ✅</p>
              <p className="text-xs text-[#8696A0] mt-1">Sohbetler ve mesajlar anlık senkronize ediliyor.</p>
            </>
          ) : status === 'authenticated' ? (
            <>
              <CheckCircle className="h-12 w-12 text-[#00A884] mb-4 animate-pulse" />
              <p className="text-sm text-[#8696A0]">Doğrulandı, oturum açılıyor...</p>
            </>
          ) : status === 'connecting' || loading ? (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#00A884] mb-4"></div>
              <p className="text-sm text-[#E9EDEF] font-medium">QR Kod Hazırlanıyor...</p>
              <p className="text-xs text-[#8696A0] mt-1">Lütfen birkaç saniye bekleyin</p>
            </>
          ) : (
            <>
              <Smartphone className="h-12 w-12 text-[#8696A0] mb-4" />
              <p className="text-sm text-[#8696A0] mb-4">Bağlantı kurulu değil</p>
              <button 
                onClick={handleConnect} 
                disabled={loading}
                className="flex items-center space-x-2 bg-[#00A884] text-[#111B21] px-5 py-2.5 rounded-md font-semibold text-sm hover:bg-[#008f6f] transition-all disabled:opacity-50"
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
