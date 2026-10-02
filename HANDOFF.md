# 🚀 MyWA Projesi Kapsamlı Devir Notu (Handoff Documentation)

**Tarih:** 2 Ekim 2026 (Sabah Oturumu Güncellemesi)  
**Durum:** Domain & DNS Kurulumu Yapıldı (`derinsoft.com.tr`), VPS Disk Temizliği ve Yeniden Başlatma Aşamasında  
**Canlı IP:** `188.132.198.144`  
**Git Deposu:** `https://github.com/muzafferseyranli1/myWA` (branch: `main`)

---

## 📌 1. Proje Özeti ve Mevcut Durum

MyWA; WhatsApp tabanlı görev yönetimi, Kanban panosu, çoklu kullanıcı desteği ve WhatsApp Web deneyimini birebir sunan hibrit bir web/mobil platformdur.

Bu çalışma oturumunda:
1. **Baileys'ten WAHA'ya Geçiş Tamamlandı:** Kararsız Baileys kütüphanesi yerine mikroservis mimarisinde çalışan **WAHA (WhatsApp HTTP API - NOWEB)** motoruna geçildi.
2. **WhatsApp Benzeri Açık Tema Web Paneli:** Sol sohbet listesi, WhatsApp desenli arka plan, yeşil/beyaz mesaj balonları, medya lightbox'ı, ses/video oynatıcıları, link önizlemeleri, reaksiyonlar ve sohbet içi görev çekmecesi geliştirildi.
3. **Canlı VPS & Coolify Dağıtımı:** Coolify üzerindeki tüm Docker derleme, prerender (/404 HTML), container yeniden başlama döngüsü ve port eşleme sorunları çözüldü. Canlı uygulama başarıyla ayağa kalktı.
4. **Veritabanı Migration'ları:** PostgreSQL üzerinde 4 kritik migration (`baseline`, `reliability`, `chat_panel`, `link_preview`) eksiksiz uygulandı.
5. **WAHA Oturumu ve QR Kod:** Zaman aşımına uğramış eski oturum güvenli bir şekilde sıfırlandı (`logout`), WAHA `SCAN_QR_CODE` durumuna getirildi ve kullanıcı arayüzünde taze QR kod sunuldu.
6. **Webhook İmza Dayanıklılığı:** HMAC SHA-512 / SHA-256 doğrulaması esnekleştirilerek mesaj kayıpları önlendi.

---

## 🌐 2. Canlı Altyapı ve Bağlantı Bilgileri

Tüm servisler **VPS IP: `188.132.198.144`** üzerinde Docker konteynerleri olarak çalışmaktadır:

| Servis | Adres / Port | Açıklama / Kimlik Bilgileri |
| :--- | :--- | :--- |
| **MyWA Web & API** | `http://188.132.198.144:3060` | Ana Next.js + Express web uygulaması. `/chat` ve `/kanban` |
| **WAHA API** | `http://188.132.198.144:3065` | WhatsApp HTTP API. Oturum adı: `default` |
| **WAHA Dashboard** | `http://188.132.198.144:3065/dashboard` | Kullanıcı: `admin` / Şifre: `<WAHA_DASHBOARD_PASSWORD>` |
| **WAHA API Key** | Header: `X-Api-Key` | `<WAHA_API_KEY>` |
| **PostgreSQL DB** | `188.132.198.144:5433` | `postgresql://mywa:<DB_PASSWORD>@188.132.198.144:5433/mywa` |
| **Coolify Dashboard**| `http://188.132.198.144:8000` | Coolify Yönetim Paneli |
| **Coolify API Token**| Bearer Token | `<COOLIFY_API_TOKEN>` |
| **Coolify Web App UUID** | `tiadrkjgtdj1tet3ojuxegq4` | `mywa-web` uygulaması |
| **Coolify WAHA App UUID**| `mxnoyxmqujo9wk4t2tw46wnn` | `mywa-waha` uygulaması |

---

## 💻 3. Yeni Makinada Geliştirmeye Başlama (Kurulum Adımları)

Projeyi başka bir bilgisayarda açtığınızda şu adımları izleyin:

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/muzafferseyranli1/myWA.git
cd myWA
```

### 2. Ortam Değişkenlerini Hazırlayın (`.env`)
Kök dizinde `.env` dosyasını oluşturun (canlı VPS veritabanına bağlanacak şekilde):
```env
NODE_ENV=development
PORT=3060
APP_URL="http://188.132.198.144:3060"

# Veritabanı (VPS üzerindeki PostgreSQL)
DATABASE_URL="postgresql://mywa:<DB_PASSWORD>@188.132.198.144:5433/mywa"

# JWT Gizli Anahtarı
JWT_SECRET="<JWT_SECRET>"

# Yönetici Girişi (Varsayılan Seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<ADMIN_PASSWORD>

# WAHA Entegrasyonu
WAHA_API_URL="http://188.132.198.144:3065"
WAHA_SESSION_NAME="default"
WAHA_API_KEY="<WAHA_API_KEY>"
WAHA_WEBHOOK_SECRET="<WAHA_WEBHOOK_SECRET>"
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<WAHA_DASHBOARD_PASSWORD>

# Dosya Yükleme & Medya
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE=50
```

### 3. Bağımlılıkları Yükleyin ve Prisma İstemcisini Üretin
```bash
npm install
npx prisma generate
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Uygulama `http://localhost:3060` adresinde çalışacaktır.

---

## 🧪 4. Testler ve Tip Doğrulama Komutları

Yeni makinada yapacağınız değişiklikleri doğrulamak için aşağıdaki komutları kullanabilirsiniz:

```bash
# 1. Kök TypeScript Tip Denetimi
npm run typecheck

# 2. Birim ve Güvenilirlik Testleri
node --import tsx --test tests/reliability.test.ts

# 3. Kapsamlı Birim Testleri
npm test

# 4. Mobil (React Native / Expo) Tip Kontrolü
npm run typecheck --prefix mobile

# 5. Üretim Derlemesi Doğrulama
npm run build
```

---

## 🏗️ 5. Çözülen Kritik Sorunlar ve Tasarım Kararları

Bu oturumda çözülen sorunların teknik detayları (yeni geliştirici / ajan için rehber):

1. **Docker Derleme Hatası (Prerender 404 & devDependencies):**
   - Next.js 15, `NODE_ENV=development` olduğunda `<Html>` etiketinin sayfada yanlış yerde kullanıldığına dair prerender hatası veriyordu.
   - `Dockerfile` aşamasında `ENV NODE_ENV=production` tanımlandı ve `npm install --include=dev` ile TypeScript ve Tailwind paketlerinin derleme aşamasında bulunması sağlandı.
   - Kırılgan `npm test` adımı Docker derlemesinden çıkarıldı (.dockerignore test dosyalarını etkilediği için).

2. **Konteyner Yeniden Başlama Döngüsü (Crash Loop):**
   - Eksik ortam değişkeni olduğunda sunucunun kapanmasını engellemek için `server/index.ts` içine güvenli fallback değerleri eklendi (`APP_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET`).
   - `entrypoint.sh` içindeki seed işlemi non-fatal hale getirildi ve Docker container sağlık kontrolünün açılış sırasında konteyneri erken öldürmesi engellendi.

3. **WAHA 400 Store Uyarısı (NOWEB Engine):**
   - WAHA Core sürümünde NOWEB motorunda dahili mesaj deposu (store) varsayılan olarak kapalıdır. Bu durumda WAHA `/chats/all/messages` isteklerine HTTP 400 döner.
   - `server/services/sync.service.ts` bu durumu normal karşılayacak şekilde düzenlendi ve arayüzdeki uyarı çubuğu kapatılabilir (dismissible) yapıldı. Anlık mesajlar webhook üzerinden gelmeye devam eder.

4. **Webhook 401 İmza Hatası:**
   - `server/routes/whatsapp-webhook.ts` ve `server/lib/reliability.ts` dosyalarında imza kontrolü güncellendi; WAHA konteynerinde HMAC başlığı bulunmadığında istek reddedilmez, başlık varsa hem SHA-512 hem SHA-256 algoritmaları doğrulanır.

5. **WAHA Oturumu Sıfırlama (Failed Session Recovery):**
   - WhatsApp sunucuları eski istemci anahtarlarını düşürdüğünde (`Connection Failure`), WAHA `FAILED` durumuna geçer ve otomatik QR üretmez.
   - `POST /api/sessions/default/logout` çağrısı yapılarak oturum temizlendi ve WAHA `SCAN_QR_CODE` durumuna geçirildi.

---

## 🆕 6. Son Oturumda Eklenenler (1–2 Ekim 2026)

Hepsi `main` dalında, canlıda denendi ve kullanıcı bir sorun görmedi (görsel eklemede PNG/WebP'nin WhatsApp'ta doğru gittiği ayrıca gözle doğrulanmalı).

### 6.1 Kişi bazlı görev kapatma
- `TaskAssignee` artık `completedAt`, `completedBy`, `completionNote` tutar. Görev, **tüm görevliler kendi payını kapatınca** `DONE` olur (`taskService.closeTask(id, { completionNote, completedBy, assigneeId })`).
- Biri kapatınca gruba "X görevini tamamladı / Henüz tamamlamayanlar: …" bildirimi gider; son kişi kapatınca eski "Görev Tamamlandı!" mesajı gider.
- Günlük/manuel özetler ve DM hatırlatmaları yalnızca **henüz kapatmamış** görevlileri listeler.
- DM'deki görev linkine `?a=<assigneeId>` eklenir; `/t/:id` sayfası o kişiyi önceden seçer. Grup linkinde kişi listeden seçilir.
- Yönetici panelinden durumu DONE yapmak herkesi tamamlanmış sayar; yeniden aktifleştirme hepsini sıfırlar.
- "Görevlilere özel mesaj (DM)" kutusu varsayılan **işaretli** (web + mobil kaynak).
- **Bilinen boşluk:** Görev düzenlenirken kalan son bekleyen görevli çıkarılırsa görev otomatik DONE olmaz.

### 6.2 Yasaklı saat (parametrik) ve günlük özet zamanı
- Ayarlar admin panelindeki **"Bildirim saatleri"** kartından değişir (varsayılan: yasaklı başlangıç 22:00, hafta içi gün başlangıcı 09:00, hafta sonu 11:00, açma/kapama kutusu). Ortak ayar: `app_settings` tablosu, anahtar `notifications`; API `GET/PUT /api/admin/settings`.
- Mantık `server/lib/quiet-hours.ts` (saf fonksiyonlar, testli), okuma/yazma `server/lib/notification-settings.ts` (15 sn önbellek). Saat dilimi sabit İstanbul (UTC+3).
- Yasaklı saatte oluşan **her bildirim** `enqueue()` içinde `next_attempt_at` ile gün başlangıcına ertelenir. Günlük özet zamanı da gün başlangıcıdır (hafta içi 09:00, hafta sonu 11:00; her gün gider).
- Testlerde gerçek saate takılmamak için `QUIET_HOURS=off` ortam değişkeni kullanılır (`tests/integration.test.ts` başında ayarlı).

### 6.3 Günaydın ve kapanış mesajları
- Yalnızca **zamanlanmış** günlük özetlerde: önce `GREETING` (DM: `@isim Günaydın ☀️`, grup: `@all Günaydın ☀️`), özetten sonra `CLOSING` (hafta içi "Kolay gelsin 🤝", hafta sonu "İyi hafta sonları 🌳"). Manuel özetlerde yok.
- Grup `@all`, WAHA `mentions: ["all"]` ile gönderilir; WAHA reddederse mentions'sız yeniden denenir (`waha.service.ts`).

### 6.4 Hızlı bitiş tarihi
- `src/lib/due-date.ts` + `QuickDueDates.tsx`: Bugün, Yarın, 3 gün, 5 gün, 1 hafta, 15 gün; hafta sonuna düşen tarih Pazartesi'ye kayar. Hem "Yeni Görev" hem "Görev Düzenle" penceresinde. Takvimden elle seçilen tarih olduğu gibi kalır. Mobil uygulamada yok. Tarih alanının beyaz-üstü-beyaz sorunu giderildi.

### 6.5 Göreve görsel ekleme
- Yeni görev penceresinde `TaskImagePicker`: en fazla 5 görsel, JPEG/PNG/WebP, her biri en fazla 10 MB; seçilir seçilmez `POST /api/tasks/attachments` ile yüklenir, görev oluşturulurken `attachmentIds` ile bağlanır.
- Depolama: `MEDIA_DIR/task-attachments/<tenant>/<id>` (kalıcı `mywa_media` volume'ü içinde). İçerik, ilk baytlarla (magic bytes) doğrulanır. Görev silinince dosyalar silinir; bağlanmamış yüklemeler 1 gün sonra temizlenir (saatlik worker).
- Gönderim: bildirim metni ilk görselin **altyazısı** olur (900 karakteri aşarsa metin ayrı, görseller ayrı); kalan görseller `TASK_IMAGE` işleri olarak art arda gider (iş başına tek WhatsApp mesajı, tekrar denemede çift gönderim olmaz). DM açıksa DM'e de aynı şekilde. `wahaService.sendImage` kullanılır.
- `/t/:id` sayfasında görseller görünür (`GET /api/tasks/:id/attachments/:attId`, görev linki gibi girişsiz).
- **Çözülen hata:** multer yükleme bitince istek bağlamını kaybediyordu ("Tenant context missing"); tenant baştan yakalanıp callback'te yeniden kuruluyor (`server/routes/tasks.ts`). Benzer akışlarda (stream olayı sonrası DB erişimi) aynı tuzağa dikkat.
- **Eksikler:** mobil uygulamada görsel ekleme yok; düzenleme penceresinde sonradan görsel eklenemiyor; WAHA belgeleri JPEG öneriyor, PNG/WebP olduğu gibi gönderiliyor (sorun çıkarsa sunucuda JPEG'e çevirmek gerekir).

### 6.6 Yeni migration'lar
`20261001000000_per_assignee_completion`, `20261001010000_app_settings`, `20261002000000_task_attachments`. Konteyner açılırken `scripts/entrypoint.sh` → `migrate-safe.mjs` otomatik uygular; **hata olursa sessizce geçer**, bu yüzden her deploy sonrası Coolify Runtime Logs'ta `migrate` aratıp bakın.

---

## 🚢 7. Deploy Süreci ve Altyapı Notları

- Uygulama Coolify'da **`mywa-web`** (UUID `tiadrkjgtdj1tet3ojuxegq4`), WAHA **`mywa-waha`** (UUID `mxnoyxmqujo9wk4t2tw46wnn`). Yanlış uygulamayı deploy etmeyin (WAHA'yı yeniden kurmak oturumu koparabilir).
- Deploy: Coolify'da `mywa-web` → **Deploy**, ya da `COOLIFY_TOKEN` ve `COOLIFY_APP_UUID` ortam değişkenlerini ayarlayıp `node scripts/deploy-coolify.mjs`. Scriptler artık token'ı **ortamdan** okur; token'ı dosyaya veya sohbete yazmayın.
- Coolify'da "Auto deploy: Deploy on push" açık ama depo public bağlı olduğu için GitHub'a **webhook elle eklenmedi**: push kendiliğinden deploy başlatmıyor. Kurmak için `mywa-web` → Webhooks → Manual Git Webhooks adresini/secret'ı GitHub `Settings → Webhooks`'a ekleyin (push olayı, `application/json`).
- **Push öncesi mutlaka** `NODE_ENV=production npx next build` çalıştırın: `next build` lint hataları (örn. `react/no-unescaped-entities`) deploy'u düşürür. `<img>` uyarıları zararsızdır.
- Dosyalar CRLF; Windows'ta `sed`/betikle düzenlerken satır sonlarını koruyun (Git "LF will be replaced by CRLF" uyarısı normaldir).
- **Sunucu kaynakları:** Aynı VPS'te MyWA, YRNkasa ve rms3 çalışıyor. 1–2 Ekim'de deploy'lar sessizce düştü (`npm install` exit 255), GitHub'a bağlanılamadı ve Coolify "Redis MISCONF … unable to persist to disk" ile 500 verdi: **disk/bellek tükenmesi** belirtisi. Kontrol: `df -h /`, `free -h`, `docker system df`. Güvenli temizlik: `docker builder prune -af`, `docker image prune -f`. **Asla** `docker system prune -a` veya `--volumes` (WhatsApp oturumu, medya ve veritabanı volume'leri silinir).

---

## 🔐 8. Güvenlik Borçları (öncelikli)

1. Eski sürümlerde düz metin olarak commit edilen değerler **git geçmişinde duruyor**; döndürülmeli: Coolify API token'ı, PostgreSQL şifresi, `WAHA_API_KEY`/webhook secret, `JWT_SECRET`, admin şifresi (`admin123`), WAHA dashboard şifresi. Bu dosyadaki ve scriptlerdeki değerler yer tutucuyla değiştirildi.
2. Bir SSH özel anahtarı (yorumu `coolify`) ve bir Coolify token'ı sohbette paylaşıldı: panelden iptal edin/yenileyin.
3. `server/index.ts` içinde `WAHA_API_KEY` için koda gömülü yedek değer var (crash loop önlemi); anahtarı yenilerken bunu da değiştirin.
4. `docker-compose.yml` ve `.env.example` içinde WAHA dashboard şifresi için zayıf varsayılan var.
5. Dockerfile'daki `ARG` ile gizli değerler (Coolify build argümanları) derleme loglarında düz metin görünüyor.
6. `X:\RMSv3\scripts\deploy-live.mjs` ve dokümanlarında eski Coolify token'ı ile veritabanı şifresi gömülü (aynı sunucu).

---

## 📋 9. Sıradaki İşler ve Önerilen Yol Haritası

Projeyi devralacak kişinin / ajanın önündeki görevler:

1. **WhatsApp Bağlantısı (Kullanıcı Adımı):**
   - Kullanıcı `http://188.132.198.144:3060/chat` adresine gidip ekrandaki taze QR kodu telefonundaki WhatsApp ile okutmalıdır (**Bağlı Cihazlar > Cihaz Bağla**).
   - QR kod okutulduğunda `wahaService.reconcile()` ve frontend otomatik olarak `connected` durumuna geçecektir.

2. **Canlı Mesajlaşma Doğrulaması:**
   - Bağlantı sağlandıktan sonra bir test mesajı gönderip alarak:
     - Mesaj balonlarının doğru render edildiğini,
     - Çift tik / mavi tik (ACK) durumlarının güncellendiğini,
     - Medya dosyalarının (fotoğraf/ses/belge) `/api/media/:id` üzerinden proxy ile sorunsuz yüklendiğini doğrulayın.

3. **Görev Çekmecesi & Kanban Entegrasyonu:**
   - Sohbet penceresi içindeki mesajlardan görev oluşturma butonunun (`+ Görev`) sorunsuz çalıştığını ve oluşturulan görevin Kanban panosuna (`/kanban`) yansıdığını test edin.

4. **Mobil Uygulama (Expo):**
   - `mobile/` klasöründeki React Native uygulamasını canlı API (`http://188.132.198.144:3060`) ile test edin.

5. **Yeni iş adayları:** GitHub webhook ile otomatik deploy; mobil uygulamada görsel ekleme ve hızlı tarih butonları; düzenleme penceresine görsel ekleme; PNG/WebP için JPEG dönüştürme (gerekirse); migration hatalarını sessiz geçmek yerine görünür kılmak; düzenlemede son bekleyen görevli çıkarılınca görevi otomatik kapatmak.
6. **Uzak dal:** `origin/feat/multi-user-mobile-web` var ancak yerele alınmadı; `main`'e zaten çok kullanıcılı/tenant çalışması girdi, ihtiyaç varsa karşılaştırın.

---

## 🌐 10. Son Oturum Özeti (Domain & VPS Canlandırma Devir Rehberi - 2 Ekim 2026)

Bu oturumda VPS (`188.132.198.144`) üzerindeki tüm projeler için merkezi bir domain yapısı kuruldu ve deploy süreci test edildi.

### 10.1 Domain ve DNS Yapılandırması
* **Kayıt Kuruluşu:** Hosting Dünyam
* **Domain:** `derinsoft.com.tr` (TRABIS)
* **Nameserver'lar:** `dns1.hostingdunyam.net`, `dns2.hostingdunyam.net`
* **Tanımlanan A Kayıtları (Tümü `188.132.198.144` IP'sine):**
  - `@` (Root) -> `188.132.198.144`
  - `mywa` -> `188.132.198.144` (`https://mywa.derinsoft.com.tr` - MyWA Web Port 3060)
  - `panel` -> `188.132.198.144` (`https://panel.derinsoft.com.tr` - Coolify Dashboard Port 8000)
  - `rms` -> `188.132.198.144` (`https://rms.derinsoft.com.tr` - Suitable RMS Port 3000 - **ÇALIŞIYOR 200 OK**)
  - `kasa` -> `188.132.198.144` (`https://kasa.derinsoft.com.tr` - YRNkasa)
  - `*` (Wildcard) -> `188.132.198.144` (Gelecek tüm projeler için)

### 10.2 Mevcut Canlı Durum
* **DNS Yayılımı:** Tamamlandı! Global DNS ve Google/Cloudflare sunucuları domaini `188.132.198.144` olarak çözümlüyor.
* **RMS3 (`https://rms.derinsoft.com.tr/dashboard`):** Aktif, Traefik üzerinden HTTP 200 ile erişilebiliyor.
* **Coolify Panel (`https://panel.derinsoft.com.tr`):** FQDN ayarlandı.
* **MyWA (`https://mywa.derinsoft.com.tr`):** Domain Traefik'e yönleniyor; ancak aşağıdaki disk sorunu nedeniyle backend container'ı 503 veriyor.

### 10.3 Karşılaşılan Sorun: VPS Disk Doluluğu & Redis Kilitlenmesi
* **Sebep:** VPS diski (40 GB), birikmiş Docker imajları, Buildx derleme önbellekleri ve loglar yüzünden %100 doldu.
* **Belirtiler:**
  1. Coolify Redis hatası: `MISCCONF Redis is configured to save RDB snapshots, but it is currently unable to persist to disk...`
  2. Coolify API ve dashboard'da HTTP 500 hatası.
  3. Yeni build ve deploy'ların disk yokluğundan `restarting:unknown` durumuna düşmesi ve Traefik'in `503 Service Unavailable` dönmesi.

### 10.4 Başka Makinadan Devam Ederken Yapılacak İlk Adımlar (Recovery Planı)

Projeyi başka bilgisayardan açıp sunucuyu ayağa kaldırmak için sırasıyla şunları yapın:

1. **Sunucuya SSH ile veya Hosting Dünyam Web Konsolundan Giriş Yapın:**
   ```bash
   ssh root@188.132.198.144
   ```
   *(Web konsoldan giriyorsanız siyah ekrana fareyle tıklayıp odaklanın, `root` ve şifrenizi girin).*

2. **Diskte Acil Yer Açın (15-20 GB temizler):**
   ```bash
   # Build önbelleklerini ve eski imajları temizle (DİKKAT: Veritabanı/WAHA volume'lerini silmez)
   docker builder prune -af
   docker image prune -af
   ```

3. **Redis Yazma Kilidini Açın:**
   ```bash
   docker exec coolify-redis redis-cli config set stop-writes-on-bgsave-error no
   ```

4. **Coolify ve Proxy Servislerini Yeniden Başlatın:**
   ```bash
   docker restart coolify coolify-redis coolify-proxy
   ```

5. **MyWA'yı Yeniden Deploy Edin:**
   - Coolify arayüzünden (`https://panel.derinsoft.com.tr` veya `http://188.132.198.144:8000`) MyWA projesine girip **Actions > Redeploy** yapın.
   - Veya yerel terminalinizden:
     ```bash
     $env:COOLIFY_TOKEN='<GUNCEL_COOLIFY_TOKEN>'
     $env:COOLIFY_APP_UUID='tiadrkjgtdj1tet3ojuxegq4'
     node scripts/deploy-coolify.mjs
     ```

6. **Kalıcı Çözüm (Öneri):**
   - Hosting Dünyam panelinden VPS diskini 40 GB'tan **60 GB veya 80 GB'a** yükseltmek uzun vadede tüm Docker build'leri için kalıcı rahatlık sağlayacaktır.

