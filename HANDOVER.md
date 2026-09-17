# 🚀 MyWA Proje Devir & Geliştirici Dokümanı (Handover)

Bu doküman, **MyWA (WhatsApp Entegreli Görev ve Sohbet Yönetim Platformu)** projesine başka bir makinede sorunsuz bir şekilde devam edebilmeniz, mimariyi anlamanız, canlı sunucu yönetimini sağlamanız ve mobil uygulamayı geliştirebilmeniz için hazırlanmıştır.

---

## 📌 1. Proje Genel Mimarisi

MyWA, WhatsApp Web soket protokolü (Baileys) ile çalışan, web ve mobil arayüzleri olan tam teşekküllü bir mesajlaşma ve görev (Kanban) yönetim sistemidir.

- **Web & Backend:**
  - **Framework:** Next.js 14 (App Router) + Express.js (Hybrid sunucu: `server/index.ts`)
  - **WhatsApp Motoru:** `@whiskeysockets/baileys` (Oturum klasörü: `.baileys_auth`)
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

---

## 🔑 2. Kritik Bilgiler ve Ortam Değişkenleri (`.env`)

Yeni makinede projenin kök dizinine `.env` dosyası oluşturulmalıdır:

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

# WhatsApp Oturum & Dosya Yolları
WA_SESSION_PATH=./.baileys_auth
UPLOAD_DIR=./public/uploads

# Coolify Canlı Dağıtım Değişkenleri
COOLIFY_HOST="http://188.132.198.144:8000"
COOLIFY_TOKEN="1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec"
COOLIFY_APP_UUID="tiadrkjgtdj1tet3ojuxegq4"
```

---

## 🛠️ 3. Son Yapılan Kritik Düzeltmeler ve Eklenen Özellikler

Başka bir makinede çalışırken bu bileşenlerin mantığını bilmeniz önemlidir:

### A. WhatsApp LID ↔ JID Çözümleme & Etiketleme Düzeltmesi (`contact-resolver.service.ts`)
- **Problem:** Modern WhatsApp gruplarında katılımcılar 14-16 haneli LID kimliğiyle (`@lid`) gelir. Sistem önceden bu LID sayısını telefon sanıp `129033...@s.whatsapp.net` üretiyor ve WhatsApp bunu ABD (+1) numarası sanıp `@+1 29033937375402` olarak gösteriyordu. Ayrıca Ahmet Hocaoğlu'nun LID ve telefon kayıtları birbirinden kopuktu.
- **Çözüm:**
  - `ContactResolverService.isLid()` ile LID kimlikleri gerçek telefon numaralarından güvenle ayrıldı.
  - Bir kişinin yalnızca LID'si biliniyorsa sahte numara üretilmiyor; temiz `@İsim` etiketi dönülüyor (WhatsApp'ta artık `@Alper` olarak temiz görünüyor).
  - Veritabanındaki LID ve JID kayıtları çift yönlü bağlandı (`loadFromDatabase`). İsimler ve numaralar çapraz eşitlendi.
  - Kaynak mesajlardaki (`_Kaynak mesaj:_`) ham LID numaraları (`@152875...`), `formatMentionsToNames()` fonksiyonu ile gönderilmeden önce gerçek isimlere (`@Ahmet Hocaoglu`) dönüştürüldü.

### B. Bireysel (1'e 1) Sohbet Başlıkları
- Bireysel sohbetler açıldığında başlığa ham numara yazılıyordu.
- Veritabanındaki 58 adet kişi sohbetinin başlığı kişi rehberiyle güncellendi.
- `server/routes/chats.ts` ve `server/services/message.service.ts` dosyalarında 1'e 1 sohbetlerin başlığı dinamik olarak kişinin adına eşitlenecek şekilde güncellendi.

### C. TinyURL URL Kısaltıcı Servisi (`url-shortener.service.ts`)
- WhatsApp mesajlarında IP ve portlu linkler (`http://188.132.198.144:3060/t/...`) Safari ve mobil WhatsApp'ta tıklanabilir mavi bağlantı olmuyordu.
- `UrlShortenerService` TinyURL API kullanarak linkleri güvenli HTTPS kısa bağlantılara çevirir ve memory-cache ile hızlandırır.

### D. Giriş Yapmadan Hızlı Görev Kapatma (`server/routes/tasks.ts`)
- WhatsApp bildirimindeki linke tıklayan görevliler oturum açmak zorunda kalmadan doğrudan görevi inceleyip kapanış notu ekleyerek kapatabilir (`/api/tasks/public/:id/close` & `/t/:id`).

### E. WhatsApp Bağlantı Sonsuz Döngü Çözümü (`whatsapp.service.ts`)
- WhatsApp 401 Unauthorized aldığında eski soket dinleyicileri temizlenir, retry sayaçları devreye girer ve otomatik oturum sıfırlama ile taze QR kodu üretilir.

---

## 💻 4. Yeni / Başka Bir Makinede Çalıştırma Adımları

Yeni bilgisayarınızda projeyi ayağa kaldırmak için:

```bash
# 1. Depoyu klonlayın (veya pull alın)
git clone https://github.com/muzafferseyranli1/myWA.git
cd myWA

# 2. Kök dizin bağımlılıklarını kurun
npm install

# 3. .env dosyasını oluşturun (Bölüm 2'deki değerlerle)

# 4. Prisma istemcisini oluşturun
npx prisma generate

# 5. Geliştirme sunucusunu başlatın (Next.js + Express tek komutla başlar)
npm run dev
```

> **Not:** Sunucu `http://localhost:3060` adresinde çalışacaktır. Tarayıcıdan açıp `admin` / `admin123` ile giriş yapabilirsiniz.

---

## 🚀 5. Canlı Sunucuya Dağıtım (Deploy)

Kodları canlı sunucuya (`188.132.198.144`) deploy etmek için:

```bash
# 1. Değişiklikleri commit edip GitHub'a gönderin
git add .
git commit -m "feat: yeni ozellikler"
git push origin main

# 2. Coolify deployment betiğini çalıştırın:
node scripts/deploy-coolify.mjs
```

*(Veya Coolify paneline `http://188.132.198.144:8000` adresinden girip `mywa-web` projesinde "Deploy" butonuna basabilirsiniz).*

---

## 📱 6. Mobil Uygulama: Durum, Yapılacaklar ve APK Alma

Mobil uygulama **React Native + Expo (v57)** altyapısıyla `mobile/` klasöründe yer almaktadır.

### A. Mevcut Ekranlar & Yetenekler:
- `LoginScreen`: Token tabanlı oturum açma, güvenli anahtar saklama (`expo-secure-store`).
- `ChatListScreen`: WhatsApp sohbet listesi (Grup ve bireysel sohbetler, okunmamış mesaj sayısı, aktif görev rozetleri).
- `ChatWindowScreen`: Sohbet penceresi, mesaj gönderme, çift yönlü Socket.io iletişimi, `@isim` mention renklendirmesi.
- `KanbanScreen`: Görev kartları (TODO, IN_PROGRESS, DONE sütunları), görev tamamlama, filtreleme, hatırlatma gönderme.
- `CreateTaskModal`: Mesajdan veya doğrudan yeni görev oluşturma, görevli seçme, WhatsApp bildirim açma/kapatma toggle'ı.
- `WhatsAppStatusScreen`: WhatsApp bağlantı durumu, QR kodu gösterme, bağlantıyı yenileme.

### B. Başka Makinede Mobilde Yapılması Gerekenler:

1. **Bağımlılıkları Yükleme:**
   ```bash
   cd mobile
   npm install
   ```

2. **API Adresi Yapılandırması (`mobile/src/lib/constants.ts`):**
   - Şu anda `DEFAULT_API_URL = 'http://188.132.198.144:3060'` canlı sunucuya ayarlıdır.
   - Eğer yerel makinenizdeki sunucuyla test edecekseniz telefonunuzun erişebileceği yerel IP adresinizi (Örn: `http://192.168.1.50:3060`) veya bir ngrok linki yazmalısınız.

3. **Geliştirme Sunucusunu Başlatma (Hot-Reload):**
   ```bash
   npx expo start
   ```
   - Ekrana gelen QR kodu telefonunuzdaki **Expo Go** uygulamasıyla taratarak geliştirmeyi anlık canlı olarak test edebilirsiniz.

4. **APK Çıkarma (Build Alma):**
   - Projede `mobile/eas.json` önceden yapılandırılmıştır (`preview` profili doğrudan APK çıktısı verir):
   ```json
   "preview": {
     "distribution": "internal",
     "android": {
       "buildType": "apk"
     }
   }
   ```
   - Expo hesabı ile tek komutla bulutta ücretsiz APK derlemek için:
   ```bash
   cd mobile
   npx eas-cli login
   npx eas-cli build --platform android --profile preview
   ```
   - Derleme bittiğinde terminalde doğrudan telefonunuza indirebileceğiniz bir `.apk` indirme linki verilecektir.

5. **Gelecekte Eklenebilecek Mobil Geliştirmeler (İsteğe Bağlı):**
   - **Arka Plan Bildirimleri (Push Notifications):** Uygulama kapalıyken yeni görev ve hatırlatma bildirimlerinin telefon kilit ekranına düşmesi için `expo-notifications` servisi entegre edilebilir.
   - **Medya Gönderme:** Mobilden fotoğraf veya dosya yükleme desteği eklenebilir.

---

## 📂 7. Önemli Klasör ve Dosya Haritası

```text
myWA/
├── HANDOVER.md                    # Bu doküman
├── package.json                   # Web & Backend bağımlılıkları
├── tsconfig.json                  # Root TypeScript ayarları (mobile hariç tutulmuştur)
│
├── prisma/
│   └── schema.prisma              # Veritabanı şeması (User, Chat, Contact, Task, Message vb.)
│
├── server/
│   ├── index.ts                   # Express & Socket.io ana sunucu dosyası
│   ├── routes/                    # API uç noktaları (auth, chats, tasks, whatsapp)
│   ├── services/
│   │   ├── whatsapp.service.ts    # Baileys WhatsApp istemcisi ve event yönetimi
│   │   ├── contact-resolver.service.ts # LID ↔ JID, telefon ve isim eşleme motoru
│   │   ├── task.service.ts        # Görev CRUD, bildirim mesajı oluşturma
│   │   ├── reminder.service.ts    # Otomatik WhatsApp hatırlatıcıları
│   │   └── url-shortener.service.ts # TinyURL kısa link servisi
│   └── sockets/                   # Canlı soket olayları
│
├── src/                           # Next.js Web Frontend
│   ├── app/                       # Sayfalar (/chat, /login, /t/[id] public task close)
│   ├── components/                # React bileşenleri (ChatList, ChatWindow, MessageBubble, Kanban)
│   └── lib/                       # Prisma istemcisi, utils, tipler
│
└── mobile/                        # React Native + Expo Mobil Uygulama
    ├── App.tsx                    # Mobil giriş noktası ve navigasyon yükleyicisi
    ├── app.json                   # Expo yapılandırması
    ├── eas.json                   # EAS Build profilleri (APK yapılandırması)
    ├── package.json               # Mobil bağımlılıkları (Expo 57, React Native 0.86)
    └── src/
        ├── api/                   # Mobil axios istemcileri (auth, chats, tasks, whatsapp)
        ├── components/            # Header, MessageBubble, TaskCard, CreateTaskModal
        ├── navigation/            # RootNavigator, TabNavigator
        ├── screens/               # ChatList, ChatWindow, Kanban, Login, WhatsAppStatus
        └── store/                 # Zustand auth state'i
```
