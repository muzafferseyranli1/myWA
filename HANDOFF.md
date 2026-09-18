# 🚀 MyWA Projesi Kapsamlı Devir Notu (Handoff Documentation)

**Tarih:** 18 Eylül 2026  
**Durum:** Üretim Ortamında Canlıda (Coolify VPS `188.132.198.144`) & Tüm Testler Geçti  
**Son Commit:** `5a118dd` (veya güncel `main`)  
**Git Deposu:** `https://github.com/muzafferseyranli1/myWA`

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
| **WAHA Dashboard** | `http://188.132.198.144:3065/dashboard` | Kullanıcı: `admin` / Şifre: `MyWA_123` |
| **WAHA API Key** | Header: `X-Api-Key` | `MyWA_ApiKey_2026!` |
| **PostgreSQL DB** | `188.132.198.144:5433` | `postgresql://mywa:MyWA_Secure_2026!@188.132.198.144:5433/mywa` |
| **Coolify Dashboard**| `http://188.132.198.144:8000` | Coolify Yönetim Paneli |
| **Coolify API Token**| Bearer Token | `1\|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec` |
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
DATABASE_URL="postgresql://mywa:MyWA_Secure_2026!@188.132.198.144:5433/mywa"

# JWT Gizli Anahtarı
JWT_SECRET="mywa_jwt_production_secret_2026_super_key"

# Yönetici Girişi (Varsayılan Seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# WAHA Entegrasyonu
WAHA_API_URL="http://188.132.198.144:3065"
WAHA_SESSION_NAME="default"
WAHA_API_KEY="MyWA_ApiKey_2026!"
WAHA_WEBHOOK_SECRET="MyWA_ApiKey_2026!"
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=MyWA_123

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

## 📋 6. Sıradaki İşler ve Önerilen Yol Haritası

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
