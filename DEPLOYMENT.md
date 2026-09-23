# MyWA kararlılık sürümü: kurulum ve geçiş

## Yapılandırma

Node.js 22 ve PostgreSQL 16 kullanın. `npm ci` ile kök ve mobil bağımlılıkları kurun.
Yeni kurulumda `.env.example` dosyasını `.env` olarak kopyalayın; DB adresi/parolası, JWT anahtarı,
ilk yönetici parolası ve dışarıdan erişilen `APP_URL` değerini doldurun.

```powershell
Copy-Item .env.example .env
node scripts/setup-waha-env.mjs
npm ci
npm ci --prefix mobile
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Mevcut kurulumda `Copy-Item` adımını atlayın. `setup-waha-env.mjs`, yalnızca boş/eksik
`WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET` ve `WAHA_IMAGE` değerlerini ekler; mevcut değerleri korur.
Yeni anahtarları Coolify gibi harici dağıtım ortamına ayrıca aktarın; `.env` Git'e eklenmez.

`WAHA_API_KEY` uygulama ile WAHA'da eşleşir. `WAHA_WEBHOOK_SECRET` uygulamada doğrulama,
WAHA'da `WHATSAPP_HOOK_HMAC_KEY` için kullanılır. Compose eşleşmeyi tek değişkenden sağlar.
`WAHA_WEBHOOK_URL` boş bırakıldığında dahili adres `http://mywa-app:${PORT}/api/whatsapp/webhook`
olur; `APP_URL` tarayıcı görev bağlantıları içindir. `WAHA_API_URL` Compose içinde servis adresiyle
değiştirilir. `WAHA_SESSION_NAME` varsayılan `default` oturumunu seçer.

`.env.example` içindeki WAHA digest'inin manifest hash'i 2026-09-18 tarihinde Docker Hub'dan
doğrulandı. Bu, imajın çalışma kabul testi değildir. İmajı test ortamında QR, oturum saklama,
HMAC başlıkları ve gönderim yanıtı bakımından sınamadan canlıya geçmeyin. Yeni imaj seçimi:

```sh
node scripts/resolve-waha-image.mjs <version-tag>
# Çıkan devlikeapro/waha@sha256:... değerini test edip WAHA_IMAGE alanına aktarın.
node --env-file=.env scripts/validate-waha-image.mjs
```

`MAX_FILE_SIZE` MB cinsindendir (varsayılan 50); `UPLOAD_QUOTA_MB` toplam disk kotasıdır
(varsayılan 5120). Eşzamanlı yüklemeler maksimum dosya boyutu kadar yer ayırır. Bu nedenle
kalan kota maksimum dosya boyutundan azsa küçük bir yükleme de reddedilir. Kullanıcı başına
dakikada en fazla 10 yükleme isteği kabul edilir. İlk sürüm tek uygulama örneği içindir.

## Migration kuralları

`scripts/migrate-safe.mjs`, eski DB'nin şemasını `prisma/baseline.prisma` ile karşılaştırır.
Tam eşleşme varsa baseline işaretler ve eklemeli migration'ı uygular. Fark varsa işlem durur.
Boş DB'de iki migration normal sırayla çalışır. Uygulama başlamadan önce migration ve ilk
yönetici kontrolü tamamlanır. Mevcut yönetici parolası değiştirilmez.

`db push`, reset, tablo silme ve doğrulamadan `migrate resolve` kullanmayın. Baseline dışındaki
şema farklarını yedek/kopya üzerinde inceleyin. Son şema da migration sonrasında tekrar karşılaştırılır.

## Doğrulama

Test DB adresi yalnızca localhost üzerinde `mywa_test` ile başlayan bir DB olabilir.
Entegrasyon ve migration testleri her çalışmada ayrı şema oluşturur; üretim DB'sine yazmaz.

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:test-only@127.0.0.1:5432/mywa_test'
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:migrations
npm run build
npm run typecheck --prefix mobile
npm run build:check --prefix mobile
node scripts/smoke-runtime.mjs
```

Son komut için test DB'nin ana şemasına migration uygulanmış olmalı. Üretim sunucusunu izole
DB ile çalıştırır; WAHA erişimi yokken `ready=degraded` yanıtını doğrular. Android export APK/AAB
değildir; gerçek cihaz testinin yerine geçmez. `.github/workflows/reliability.yml` otomatik kontrolleri içerir.

Canlı şema kontrolü yalnızca metadata okur:

```sh
node --env-file=.env scripts/verify-live-schema.mjs
```

Canlı veri kopyası testi, kullanıcı/kişi/mesaj/görev verisini `temp/live-copy-snapshot.json` ve
yerel `mywa_test` DB'sine aktarır. Bu veri aktarımı için açık izin alınmalıdır. İzin sonrasında:

```sh
node --env-file=.env scripts/test-live-copy.mjs
```

## Bakım aralığı

1. Kullanıcı trafiğini bakım sayfasına yönlendirin. Canlı WAHA oturum durumunu oturumu etkilemeden inceleyin (`npm run waha:check`). Eski uygulama sürümünü, Compose dosyasını, WAHA digest'ini kaydedin.
2. Uygulama ve WAHA'yı durdurun; logout veya oturum silme kullanmayın. Sunucuda tam yedek alın:
   ```bash
   bash scripts/backup.sh
   ```
   Bu betik `mywa-db` veritabanı yedeğini (`pg_dump -Fc`), `mywa_waha_sessions`, `mywa_uploads` ve `mywa_media` volume arşivlerini `./backups/` altına oluşturur ve boyutlarını doğrular.
3. Doğrulanmış imajı ve kaynak sürümünü hazırlayın. `docker compose config --quiet` ve
   `docker compose build mywa-app` geçmeden bakım devam eder.
4. `docker compose up -d mywa-db mywa-waha` ile bağımlılıkları başlatın. Yeni WAHA servisi
   yalnızca `message.any,session.status` global webhook'unu, HMAC anahtarını ve yeniden
   deneme ayarlarını alır.
5. Eski oturum bazlı webhook'ları, mevcut konfigürasyonun diğer alanlarını koruyarak kaldırın:
   `docker compose run --rm --no-deps --entrypoint node mywa-app scripts/configure-waha.mjs`.
   Bu komut yalnızca bakım sırasında çalıştırılır; normal uzlaştırma çalışan oturumu yeniden başlatmaz.
6. `docker compose up -d mywa-app` başlatın. Entrypoint digest kontrolü, güvenli migration ve
   ilk yönetici kontrolünü tamamlar; hata varsa uygulama başlamaz. WAHA oturumu bulunmuyorsa
   oluşturulur; kullanıcının DB'deki bağlantıyı kes tercihi korunur.
7. `/health`, `/ready`, imzalı gelen mesaj, sohbet gönderimi, görev oluşturma ve oturum açmadan
   görev kapatma kontrollerini yapın. Aynı istemci işlem kimliği ve aynı webhook'u tekrar gönderip
   kayıtların çoğalmadığını doğrulayın. Mobilde liste/sohbet/durum ekranlarını değiştirin;
   ağ kesilip geldiğinde sohbet odasına katılımı ve DB yenilemesini doğrulayın.
8. Kontroller tamamlanınca bakım sayfasını kaldırın.

## İlk 24 saat ve geri dönüş

Oturum açmış kullanıcı `GET /api/notifications/metrics` ile durum sayılarını, en eski bekleyen
işin zamanını ve son zamanlayıcı gününü okuyabilir. `/ready` ayrıca DB/işleyici hazırlığını ve
WAHA bağlantısını gösterir. Webhook HTTP 401/400/503 oranlarını proxy erişim kayıtlarından,
işleyici hatalarını uygulama kayıtlarından izleyin. Bekleyen en eski işin yaşı sürekli artarsa,
`FAILED`/`UNKNOWN` sayısı büyürse veya gelen işler `FAILED` olursa inceleyin.

`ACCEPTED`, WAHA'nın HTTP isteğini kabul ettiğini ifade eder; alıcıya teslim bilgisi değildir.
`UNKNOWN` otomatik gönderilmez. Web/mobil Bildirimler ekranında açık seçimle tekrar gönderilir
veya iptal edilir. `FAILED`/`UNKNOWN` çözülene kadar aynı sohbetin sonraki işleri bekler.
Güvenli tekrar denemeler en fazla 10 girişim, artan bekleme ve başlangıçta saniyede bir gönderim kullanır.

Geri dönüşte önce yeni uygulamayı/işleyiciyi durdurun. Eski uygulama imajını, WAHA digest'ini ve
webhook konfigürasyonunu geri alın. Eklenen tabloları ve bekleyen işleri koruyun; migration rollback
ve veri silme yapmayın. Eski sürüm yeni kuyruğu tüketmez; kabul edilmiş/belirsiz işlerin sonuçlarını
yeniden etkinleştirmeden önce değerlendirin. Gerçek bir veri bozulması yoksa DB'yi eski yedeğe
döndürmek yerine eklemeli şemayı koruyun.

## WhatsApp Web Paneli, Medya ve WAHA Entegrasyon Detayları

### 1. Medya Proxy ve mywa_media Volume
- WAHA medya URL'leri tarayıcıya veya mobil istemciye doğrudan verilmez. Doğrudan URL paylaşımı `WAHA_API_KEY` sızıntısına veya dahili Docker ağ adresinin erişilememesine yol açar.
- Bunun yerine `server/routes/media.ts` üzerinden kısa ömürlü, zaman pencereli ve mesaj kimliğine bağlı token'lar üretilir (`/api/media/:messageId?token=...`).
- İndirilen medya dosyaları `MEDIA_DIR` (varsayılan: `data/media`) altında saklanır ve disk kotası (`MEDIA_QUOTA_MB`, varsayılan 5120 MB) ile korunur.
- **Yedekleme**: Sunucu yedeklerinde `mywa_uploads` ve `mywa_waha_sessions` volume'lerinin yanı sıra `mywa_media` volume'ü de mutlaka yedekleme kapsamına alınmalıdır.

### 2. WAHA NOWEB Store ve Geçmiş Senkronizasyonu
- WAHA'nın varsayılan `NOWEB` motoru sohbet geçmişini RAM/disk üzerinde saklamaz. Geçmiş mesajları ve kaçırılan iletileri almak için oturum oluşturulurken `store.enabled: true` ve `store.fullSync: true` yapılandırılmalıdır.
- **DİKKAT (Mevcut Oturum Riski)**: WAHA resmi dokümantasyonuna göre halihazırda QR ile bağlanmış ve çalışan bir oturumun yapılandırmasını canlıda değiştirmek oturum ve geçmiş kaybına neden olabilir. Bu nedenle MyWA uzlaştırıcısı (`reconcile`), mevcut çalışan oturumun store yapılandırmasını otomatik olarak zorla değiştirmez; yalnızca oturum bulunmadığında yeni oturum oluştururken store ayarlarını aktarır.

### 3. Arama Olayları (Call Events) Kapsamı
- Webhook üzerinden `call.received`, `call.accepted` ve `call.rejected` olayları yakalanır ve ilgili sohbetin içerisine görsel bir sistem mesajı / bildirim kartı olarak kaydedilir.
- **Sınır**: Web paneli veya mobil uygulama üzerinden sesli/görüntülü arama başlatılamaz veya gelen arama cevaplanamaz. Aramanın yanıtlanması WhatsApp yüklü fiziksel cihazdan yapılmalıdır.

### 4. WhatsApp Web İkamesinin Gerçekçi Sınırları
Kullanıcı WhatsApp uygulamasını kapatıp yalnızca MyWA web panelini kullanmak istediğinde şu sınırlar geçerlidir:
- **Metin Mesajlaşması, Medya ve Tepkiler**: Tam desteklenir (Görseller, dokümanlar, ses kayıtları, videolar, çift tik / mavi tik ACK durumları, mesaj düzenleme/silme ve tepki emojileri).
- **Sesli ve Görüntülü Aramalar**: Sadece gelen arama bildirimi olarak görünür; web panelinden görüşme yapılamaz.
- **Durum / Hikaye (Status / Stories)**: Görüntüleme ve paylaşım desteklenmez; yerel WhatsApp uygulaması gerekir.
- **Kanallar ve Topluluklar (Channels / Communities)**: WAHA ve MyWA mimarisinde desteklenmez.
- **Anketler (Polls)**: Yerel anket oluşturma panelde desteklenmez.
- **İlk Eşleşme**: Cihaz bağlantısı ve QR okutma aşamasında fiziksel telefon her zaman gereklidir.

### 5. Sentetik Önizleme Aracı
Canlı üretim verisini kullanmadan, tamamen sahte veri ve yapay mesajlarla web panelinin görsel ve işlevsel kontrolünü sağlamak için `scripts/preview-panel.mjs` aracı kullanılabilir:
```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/mywa_test'
node scripts/preview-panel.mjs
```
Tarayıcıda `http://127.0.0.1:3067/login` adresine gidilerek `preview` / `preview-only` kullanıcı bilgileriyle panel test edilebilir.

Resmi sözleşmeler: [WAHA olaylar/HMAC/retry](https://waha.devlike.pro/docs/how-to/events/),
[WAHA oturum yaşam döngüsü](https://waha.devlike.pro/docs/how-to/sessions/),
[WAHA NOWEB Store](https://waha.devlike.pro/docs/engines/noweb/).


## Çok Kullanıcılı Yapı (Kullanıcı İzolasyonu)

- Her kullanıcının kendi PostgreSQL şeması (`t_xxxxxxxxxxxx`) ve kendi WAHA oturumu (`u_xxxxxxxxxxxx`) vardır. Sohbet, mesaj, görev ve kuyruk verileri bu şemada tutulur; bir kullanıcı başka birinin verisine uygulama üzerinden erişemez.
- Kurulumdan önceki veriler ana şemada (`public`) kalır ve ilk yönetici hesabına aittir; bu hesap `WAHA_SESSION_NAME` oturumunu kullanmaya devam eder. Migration sırasında var olan diğer hesaplar veriye erişimini kaybeder ve yönetici panelinden "Hazırla" ile boş bir alanla yeniden açılır.
- Yeni kullanıcılar `/admin` sayfasından oluşturulur; şema ve migration otomatik uygulanır. Kullanıcı giriş yapıp kendi WhatsApp'ını QR veya telefon numarası (eşleştirme kodu) ile bağlar.
- `scripts/migrate-safe.mjs` ana şemadan sonra tüm kullanıcı şemalarını da günceller.
- Birden fazla WAHA oturumu için WAHA 2026.6.1 veya sonrası gerekir (`devlikeapro/waha`); eski `waha-plus` imajı gerekmez.
- Webhook olayları `session` alanına göre ilgili kullanıcıya yönlendirilir; tanınmayan oturumlar 400 alır. WAHA HMAC başlığı gönderdiği doğrulandıktan sonra `STRICT_WEBHOOK_HMAC=true` ayarlanmalıdır.
- Yönetici hesapları yönetir (oluşturma, şifre sıfırlama, devre dışı bırakma) ama başka kullanıcıların sohbetlerini, mesajlarını veya QR kodunu göremez. Veritabanı parolasına sahip olan herkes tüm şemalara doğrudan erişebilir; bu parola gizli tutulmalıdır.
- Web paneli telefonla uyumludur ve ana ekrana eklenebilir (PWA manifest). Android uygulaması (`mobile/`) artık geliştirilmemektedir.
