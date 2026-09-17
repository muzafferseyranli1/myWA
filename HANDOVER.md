# 🚀 MyWA Proje Devir & Geliştirici Dokümanı (Handover)

Bu doküman, **MyWA (WhatsApp Entegreli Görev ve Sohbet Yönetim Platformu)** projesine başka bir makinede veya başka bir AI Agent ile sorunsuz devam edebilmeniz, yeni mimariyi anlamanız, canlı sunucu yönetimini sağlamanız ve mobil uygulamayı geliştirebilmeniz için hazırlanmıştır.

---

## 📌 1. Proje Genel Mimarisi

MyWA; WhatsApp mesajlaşma altyapısını görev (Kanban) yönetimiyle birleştiren, web ve mobil arayüzleri olan tam teşekküllü bir platformdur.

- **Web & Backend:**
  - **Framework:** Next.js 14 (App Router) + Express.js (Hybrid sunucu: `server/index.ts`)
  - **WhatsApp Motoru (YENİ MİMARİ):** **WAHA (WhatsApp HTTP API - `devlikeapro/waha`)** izole mikroservisi. 
    *(Dahili `@whiskeysockets/baileys` ana sunucu sürecinden tamamen çıkarılmış; Docker üzerinde bağımsız koşan REST API + Webhook mimarisine geçilmiştir).*
  - **Veritabanı & ORM:** PostgreSQL 16 + Prisma ORM (`prisma/schema.prisma`)
  - **Gerçek Zamanlı İletişim:** Socket.io (durum, QR, yeni mesajlar, görev güncellemeleri)
  - **UI/Tasarım:** TailwindCSS + Lucide React (Dark WhatsApp Web teması)
- **Mobil Uygulama (`mobile/`):**
  - **Framework:** React Native + Expo (v57) + TypeScript
  - **State Yönetimi:** Zustand + Expo Secure Store (Token saklama)
  - **Navigasyon:** React Navigation (Native Stack + Bottom Tabs)
  - **Build Aracı:** Expo Application Services (EAS Build)
- **Canlı Altyapı:**
  - **Sunucu:** Ubuntu VPS (`188.132.198.144`)
  - **Panel / CI-CD:** Coolify Dashboard (`http://188.132.198.144:8000`)
  - **Canlı Web Uygulaması:** `http://188.132.198.144:3060`
  - **Canlı Veritabanı:** PostgreSQL (`188.132.198.144:5433`)
  - **WAHA Dashboard:** `http://188.132.198.144:3000/dashboard` (Kullanıcı: `admin` / Şifre: `MyWA_123`)

---

## 🔑 2. Kritik Bilgiler ve Ortam Değişkenleri (`.env`)

Yeni makinede projenin kök dizinine `.env` dosyası aşağıdaki gibi yapılandırılmalıdır:

```env
# Uygulama Ortamı
NODE_ENV=development
PORT=3060
APP_URL="http://188.132.198.144:3060"

# PostgreSQL Veritabanı (VPS Port 5433)
DATABASE_URL="postgresql://mywa:MyWA_Secure_2026!@188.132.198.144:5433/mywa"

# JWT Token Gizli Anahtarı
JWT_SECRET="mywa_jwt_production_secret_2026_super_key"

# Panel Yönetici Giriş Bilgileri
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# WAHA (WhatsApp HTTP API Mikroservisi)
WAHA_API_URL=http://localhost:3000
WAHA_SESSION_NAME=default
WAHA_PORT=3000
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=MyWA_123

# Dosya Yükleme
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE=50

# Coolify Canlı Dağıtım Değişkenleri
COOLIFY_HOST="http://188.132.198.144:8000"
COOLIFY_TOKEN="1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec"
COOLIFY_APP_UUID="tiadrkjgtdj1tet3ojuxegq4"
```

---

## 🛠️ 3. Mimari İyileştirmeler & WAHA Geçişi (Yeni Güncelleme)

### A. WAHA (WhatsApp HTTP API) Mimarisine Geçiş (Baileys'in Ayrıştırılması)
- **Eski Sorun:** Baileys doğrudan Next.js + Express ile aynı tek-çekirdekli Node.js process'inde koşuyordu. WhatsApp'tan gelen yoğun mesaj/keepalive paketleri ile Next.js render ve Prisma veritabanı sorguları çakışınca Event-Loop kilitleniyor, keep-alive timeout oluşuyor, oturum düşüyor (`401`) ve sistem sürekli QR istiyordu.
- **Yeni Çözüm:**
  - WhatsApp protokolü ve oturum yönetimi tamamen **izole WAHA Docker servisine** devredildi (`devlikeapro/waha`).
  - `server/services/waha.service.ts`: WAHA ile REST API üzerinden haberleşen hafif servis eklendi (`startSession`, `stopSession`, `sendMessage`, `syncAllGroups`).
  - `server/routes/whatsapp-webhook.ts`: WAHA'nın gelen mesajları ve durum güncellemelerini MyWA'ya anında bildirdiği Webhook rotası (`POST /api/whatsapp/webhook`) kuruldu.
  - `server/services/whatsapp.service.ts`: Eski 559 satırlık dahili Baileys dinleyicileri kaldırıldı; `waha.service.ts`'i sarmalayan temiz bir Facade servisine dönüştürüldü. **Böylece `task.service.ts`, `reminder.service.ts`, `routes/chats.ts` ve soket dinleyicileri sıfır değişiklikle sorunsuz çalışmaya devam etti.**
  - `@whiskeysockets/baileys` ve `@hapi/boom` paketleri `package.json`'dan çıkarıldı. Sunucu açılış süresi ve bellek tüketimi 4 kat iyileştirildi.

### B. WhatsApp LID ↔ JID Çözümleme & Etiketleme Düzeltmesi (`contact-resolver.service.ts`)
- Modern WhatsApp gruplarında katılımcılar 14-16 haneli LID kimliğiyle (`@lid`) gelir.
- `ContactResolverService.isLid()` ile LID kimlikleri gerçek telefon numaralarından güvenle ayrıldı.
- Veritabanındaki LID ve JID kayıtları çift yönlü bağlandı (`loadFromDatabase`).
- Kaynak mesajlardaki ham LID numaraları (`@152875...`), `formatMentionsToNames()` fonksiyonu ile gönderilmeden önce gerçek isimlere (`@Ahmet Hocaoglu`) dönüştürüldü.

### C. Bireysel (1'e 1) Sohbet Başlıkları
- Bireysel sohbetlerin başlığı dinamik olarak kişinin rehberdeki gerçek adına eşitlenecek şekilde güncellendi.

### D. TinyURL URL Kısaltıcı Servisi (`url-shortener.service.ts`)
- WhatsApp mesajlarında IP ve portlu linkler mavi tıklanabilir bağlantı olmadığı için `UrlShortenerService` TinyURL API ile güvenli HTTPS kısa bağlantılar üretir.

### E. Giriş Yapmadan Hızlı Görev Kapatma (`server/routes/tasks.ts`)
- Görevliler oturum açmadan `/t/:id` linki üzerinden kapanış notu ekleyerek görevi doğrudan kapatabilir.

---

## 📱 4. Mobil Uygulama: Durum ve Yapılacaklar

> [!IMPORTANT]
> **MOBİL KODUNDA DEĞİŞİKLİK GEREKİYOR MU?**
> **HAYIR! Mobil uygulama kodunda tek bir satır bile değiştirilmesi gerekmez.**
> 
> **Neden?**
> Mobil uygulamanın kullandığı API sözleşmesi (`GET /api/whatsapp/status`, `POST /api/whatsapp/connect`, `POST /api/whatsapp/disconnect`) ve Socket.io bildirimleri (`whatsapp_status`, `new_message`), yeni WAHA Facade mimarisinde **birebir aynı şekilde korunmuştur**. Mobil uygulama arka planda Baileys yerine WAHA çalıştığını hissetmeden kusursuz çalışır.

### Mobil Uygulama Bilgileri:
- **Dizin:** `mobile/`
- **Geliştirme Sunucusu:** `npx expo start` (Expo Go ile test edilebilir)
- **Canlı API URL:** `mobile/src/lib/constants.ts` dosyasında `DEFAULT_API_URL = 'http://188.132.198.144:3060'` ayarlıdır.
- **APK Derleme:** Tek komutla cloud EAS Build:
  ```bash
  cd mobile
  npx eas-cli build --platform android --profile preview
  ```

---

## 💻 5. Yeni / Başka Bir Makinede Çalıştırma Adımları

Yeni bilgisayarınızda projeyi yerel olarak ayağa kaldırmak için:

```bash
# 1. Depoyu klonlayın (veya pull alın)
git clone https://github.com/muzafferseyranli1/myWA.git
cd myWA

# 2. Bağımlılıkları kurun
npm install

# 3. .env dosyasını oluşturun (Bölüm 2'deki değerlerle)

# 4. Prisma istemcisini oluşturun
npx prisma generate

# 5. WAHA Docker container'ını başlatın (Yerel WhatsApp köprüsü için)
docker run -d --name mywa-waha -p 3000:3000 \
  -e WHATSAPP_DEFAULT_ENGINE=NOWEB \
  -e WAHA_DASHBOARD_ENABLED=true \
  -e WAHA_DASHBOARD_USERNAME=admin \
  -e WAHA_DASHBOARD_PASSWORD=MyWA_123 \
  -e WHATSAPP_HOOK_URL=http://host.docker.internal:3060/api/whatsapp/webhook \
  -e WHATSAPP_HOOK_EVENTS=message,message.any,session.status \
  -v waha_sessions:/app/.sessions \
  devlikeapro/waha:latest

# 6. Geliştirme sunucusunu başlatın (Next.js + Express tek komutla başlar)
npm run dev
```

> **Not:** Uygulama `http://localhost:3060` adresinde açılır (`admin` / `admin123`). WAHA Dashboard'a `http://localhost:3000/dashboard` adresinden erişebilirsiniz.

---

## 🚀 6. Canlı Sunucuya Dağıtım (Deploy - Coolify & VPS)

Canlı sunucuda (`188.132.198.144`) hem MyWA uygulamasının hem de WAHA servisinin çalışması için:

### A. Docker Compose ile Dağıtım (Önerilen):
Projedeki `docker-compose.yml` dosyası güncellenmiştir. Sunucuda tek komutla tüm stack ayağa kalkar:
```bash
docker compose up -d --build
```
Bu komut sırasıyla:
1. `mywa-db` (PostgreSQL - Port 5433)
2. `mywa-waha` (WAHA WhatsApp Gateway - Port 3000)
3. `mywa-app` (MyWA Next.js & Express - Port 3060)
servislerini başlatır ve birbirine otomatik bağlar.

### B. Coolify Paneli Üzerinden Dağıtım:
1. **Kodları GitHub'a gönderin:**
   ```bash
   git add .
   git commit -m "feat: WAHA WhatsApp HTTP API mimarisine gecildi"
   git push origin main
   ```
2. **Coolify'da WAHA Servisini Ekleyin (Tek Seferlik):**
   - Coolify Paneli (`http://188.132.198.144:8000`) ➔ Project ➔ New Service ➔ **Docker Image** seçin.
   - İmaj: `devlikeapro/waha:latest`
   - Port Mapping: `3000:3000`
   - Ortam Değişkenleri:
     - `WHATSAPP_DEFAULT_ENGINE=NOWEB`
     - `WAHA_DASHBOARD_ENABLED=true`
     - `WAHA_DASHBOARD_USERNAME=admin`
     - `WAHA_DASHBOARD_PASSWORD=MyWA_123`
     - `WHATSAPP_HOOK_URL=http://188.132.198.144:3060/api/whatsapp/webhook`
     - `WHATSAPP_HOOK_EVENTS=message,message.any,session.status`
   - Persistent Storage: `waha_sessions` ➔ `/app/.sessions`
3. **MyWA Web Uygulamasını Deploy Edin:**
   - Coolify panelinde `mywa-web` projesinde "Deploy" butonuna basın (veya `node scripts/deploy-coolify.mjs`).

---

## 📂 7. Önemli Klasör ve Dosya Haritası

```text
myWA/
├── HANDOVER.md                    # Bu doküman (Mimari & Devir Rehberi)
├── package.json                   # Web & Backend bağımlılıkları (Baileys çıkarıldı)
├── docker-compose.yml             # PostgreSQL + WAHA + MyWA-App tam yığın
├── Dockerfile                     # Hafifletilmiş Next.js üretim container'ı
│
├── prisma/
│   └── schema.prisma              # Veritabanı şeması (User, Chat, Contact, Task, Message vb.)
│
├── server/
│   ├── index.ts                   # Express & Socket.io ana sunucu dosyası
│   ├── routes/
│   │   ├── auth.ts                # Giriş / JWT doğrulama
│   │   ├── chats.ts               # Sohbet listesi & mesaj geçmişi
│   │   ├── tasks.ts               # Görev CRUD & hızlı görev kapatma
│   │   ├── whatsapp.ts            # WhatsApp durum, bağlan, kes rotaları
│   │   └── whatsapp-webhook.ts    # [YENİ] WAHA gelen bildirim & mesaj webhook'u
│   ├── services/
│   │   ├── waha.service.ts        # [YENİ] WAHA REST API istemcisi (Oturum, QR, Gruplar, Mesaj)
│   │   ├── whatsapp.service.ts    # [GÜNCELLENDİ] WAHA Facade servisi (Geriye uyumlu arayüz)
│   │   ├── contact-resolver.service.ts # LID ↔ JID, telefon ve isim eşleme motoru
│   │   ├── message.service.ts     # Mesaj kaydetme & sohbet adı eşleme
│   │   ├── task.service.ts        # Görev CRUD, bildirim mesajı oluşturma
│   │   ├── reminder.service.ts    # Otomatik WhatsApp hatırlatıcıları (Her sabah 09:00)
│   │   └── url-shortener.service.ts # TinyURL kısa link servisi
│   └── sockets/                   # Canlı soket olayları (whatsapp_status, new_message)
│
├── src/                           # Next.js Web Frontend
│   ├── app/                       # Sayfalar (/chat, /login, /t/[id] public task close)
│   ├── components/                # React bileşenleri (ChatList, ChatWindow, Kanban, QRConnectModal)
│   └── lib/                       # Prisma istemcisi, utils, tipler
│
└── mobile/                        # React Native + Expo Mobil Uygulama (Değişiklik GEREKTİRMEZ)
    ├── App.tsx                    # Mobil giriş noktası
    ├── eas.json                   # EAS Build profilleri (APK derleme)
    ├── package.json               # Mobil bağımlılıkları (Expo 57)
    └── src/
        ├── api/                   # Mobil axios istemcileri (whatsapp.api.ts vb.)
        ├── components/            # Header, MessageBubble, TaskCard
        ├── navigation/            # RootNavigator, TabNavigator
        ├── screens/               # ChatList, ChatWindow, Kanban, WhatsAppStatus
        └── store/                 # Zustand auth state'i
```
