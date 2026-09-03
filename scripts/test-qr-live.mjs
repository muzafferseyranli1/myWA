async function run() {
  console.log('Sending connect...');
  const connectRes = await fetch('http://188.132.198.144:3060/api/whatsapp/connect', { method: 'POST' });
  console.log('Connect res:', await connectRes.json());
  
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch('http://188.132.198.144:3060/api/whatsapp/status');
    const data = await res.json();
    console.log(`[${(i + 1) * 2}s] Status:`, data.status, 'hasQR:', !!data.qr);
    if (data.qr) {
      console.log('QR Code generated successfully! Length:', data.qr.length);
      break;
    }
  }
}
run();
