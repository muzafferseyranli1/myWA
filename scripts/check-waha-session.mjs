// Diagnostic tool: Inspects live WAHA session without modifying or restarting it.
const base = (process.env.WAHA_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const name = process.env.WAHA_SESSION_NAME || 'default';
const key = process.env.WAHA_API_KEY;

if (!key) {
  console.error('HATA: WAHA_API_KEY ortam değişkeni tanımlı değil.');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', 'X-Api-Key': key };

async function get(suffix) {
  const res = await fetch(base + suffix, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function run() {
  console.log('==============================================');
  console.log(` WAHA Oturum Teşhis Raporu (${new Date().toISOString()})`);
  console.log(` Endpoint: ${base} | Oturum: ${name}`);
  console.log('==============================================');

  try {
    // 1. Session Details
    const session = await get(`/api/sessions/${encodeURIComponent(name)}`);
    console.log(`\n[1] Oturum Durumu: ${session.status}`);
    console.log(`    - Motor (Engine): ${session.engine || 'NOWEB'}`);
    if (session.me) {
      console.log(`    - Bağlı Numara: ${session.me.id || session.me.jid || 'N/A'}`);
      console.log(`    - Push Name: ${session.me.pushName || 'N/A'}`);
    }

    // 2. NOWEB Store Check
    const storeConfig = session.config?.noweb?.store;
    console.log('\n[2] NOWEB Geçmiş Deposu (Store) Durumu:');
    if (storeConfig?.enabled) {
      console.log('    ✅ AKTİF (store.enabled: true)');
      console.log(`    - fullSync: ${!!storeConfig.fullSync}`);
      console.log('    - Geçmiş ve kaçırılan mesajlar syncHistory worker tarafından taranabilir.');
    } else {
      console.log('    ⚠️ PASİF (store varsayılan olarak kapalı)');
      console.log('    - Anlık mesajlar webhook üzerinden gelmeye devam eder.');
      console.log('    - WAHA uyarısı: Oturum aktifken store ayarını değiştirmek geçmiş kaybına yol açabilir.');
      console.log('    - İpucu: Yeni bir oturum kurulduğunda MyWA bunu otomatik aktif eder.');
    }

    // 3. Webhook Inspection
    console.log('\n[3] Webhook Yapılandırması:');
    const sessionHooks = session.config?.webhooks || [];
    if (sessionHooks.length) {
      console.log(`    ⚠️ Oturum bazlı ${sessionHooks.length} webhook bulundu (Compose global hook ile çakışabilir):`);
      for (const h of sessionHooks) {
        console.log(`       - URL: ${h.url} (Olaylar: ${h.events?.join(', ') || 'tümü'})`);
      }
    } else {
      console.log('    ✅ Oturum düzeyinde gereksiz webhook yok (Tüm olaylar Docker global hook ile yönetiliyor).');
    }

    console.log('\n==============================================');
    console.log(' Teşhis tamamlandı. Oturumda hiçbir değişiklik yapılmadı.');
    console.log('==============================================');
  } catch (error) {
    console.error(`\n❌ WAHA Teşhis Hatası: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
