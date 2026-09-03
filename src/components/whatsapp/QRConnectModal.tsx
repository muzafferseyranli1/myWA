'use client';

import { X, CheckCircle, Smartphone, AlertTriangle } from 'lucide-react';

export default function QRConnectModal({ isOpen, onClose, qrCode, status }: any) {
  if (!isOpen) return null;

  const handleReconnect = async () => {
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('mywa_token')}` }
      });
    } catch (e) {
      console.error('Failed to trigger reconnect:', e);
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
          {status === 'qr' && qrCode && (
            <>
              <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48 mb-4 bg-white p-2 rounded" />
              <p className="text-sm text-[#8696A0]">WhatsApp'ınızdan QR kodu okutun</p>
            </>
          )}

          {status === 'connecting' && (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#00A884] mb-4"></div>
              <p className="text-sm text-[#8696A0]">Bağlanıyor...</p>
            </>
          )}

          {status === 'authenticated' && (
            <>
              <CheckCircle className="h-12 w-12 text-[#00A884] mb-4" />
              <p className="text-sm text-[#8696A0]">Doğrulandı, bağlantı kuruluyor...</p>
            </>
          )}

          {status === 'ready' && (
            <>
              <CheckCircle className="h-12 w-12 text-[#00A884] mb-4" />
              <p className="text-sm font-medium text-[#E9EDEF]">WhatsApp Bağlandı ✅</p>
            </>
          )}

          {status === 'disconnected' && (
            <>
              <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-sm text-red-400 mb-4">Bağlantı kesildi</p>
              <button onClick={handleReconnect} className="bg-[#00A884] text-[#111B21] px-4 py-2 rounded font-medium text-sm hover:bg-[#008f6f]">
                Yeniden Bağlan
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
