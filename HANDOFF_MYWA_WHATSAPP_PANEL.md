# MyWA Devir Notu - WhatsApp Benzeri Panel ve Kararlilik Calismasi

Tarih: 2026-09-18
Calisma klasoru: X:\MyWA

## 0. Bu Oturumda Ne Yapildi

Bu oturumda once onaylanmis MyWA kararlilik planinin uygulanmasina devam edildi, sonra kullanicinin yeni talebiyle web panelinin WhatsApp Web'e daha cok benzeyen acik tema bir sohbet paneline donusturulmesi hedeflendi. Kullanici, WhatsApp'i kapatip sadece MyWA panelini kullanmak istedigini soyledigi icin tasarim degisikligi tek basina yeterli gorulmedi; medya, okunmamis mesaj, kacirilan mesaj, tekrar baglanma, gercek gonderim/okunma bilgisi ve kesinti sonrasi toparlanma da kapsama alindi.

Projede yapilan ana degisiklikler sunlar:

- Prisma semasi genisletildi; kalici incoming/outgoing kuyruklari, scheduler, connection preference, read state, reaction, sync state, message ack/revoked/edited/preview alanlari eklendi.
- Eklemeli migrationlar hazirlandi: baseline, reliability, chat panel ve link preview migrationlari.
- Webhook artik ham govde uzerinden HMAC-SHA512 dogruluyor, dogrulanmis eventleri DB'ye kaydediyor ve isleme arka planda yapiyor.
- Gelen mesaj isleme idempotent hale getirildi; tekrar eden webhook ikinci mesaj veya ikinci socket yayinina yol acmamali.
- Giden mesaj/gorev bildirimi/reminder isleri kalici outbox'a alindi; WhatsApp kapaliyken bekliyor, sonuc belirsizse otomatik tekrar gondermiyor.
- WAHA lifecycle kodu yeniden duzenlendi; admin-only connect/disconnect/QR, kullanicinin disconnect tercihi, timeoutlar ve degraded readiness eklendi.
- Upload auth/rate/quota kontrolleri eklendi.
- Bildirim durumlari icin API ve web/mobile ekranlari eklendi.
- Web chat arayuzu acik WhatsApp Web gorunumune yaklastirildi: sol sohbet listesi, acik tema balonlar, daha buyuk yazi, tarih ayiricilar, okunmamis rozetler, acilir gorev paneli, yeni mesaj butonu, emoji mini picker.
- WAHA medya URL'leri tarayiciya dogrudan verilmek yerine `server/routes/media.ts` uzerinden tokenli ve cache'li sunulacak sekilde medya proxy eklendi. Bu, resimlerin gelmemesinin ana sebebine yonelik duzeltmedir; WAHA media URL'i API key ister ve dahili host olabilir.
- Link preview, gercek ack tikleri, edit/revoke/reaction eventleri ve call eventlerinin sohbet icinde gorunmesi icin kod eklendi.
- Kacirilan mesajlar icin NOWEB store destekliyse WAHA history endpointlerinden `syncHistory` worker'i eklendi.
- Mobil tarafta ortak socket yonetimi, yeniden baglanma, medya gosterimi, okunma isaretleme ve acik tema renkleri icin degisiklikler yapildi.
- Next.js 15.5.25 ve React 19.2.3'e gecildi; paketler guncellendi.
- `.env.example`, Dockerfile, docker-compose, entrypoint, safe migration scriptleri, CI workflow ve deployment dokumani buyuk olcude guncellendi.
- Elektrik kesintisi sonrasi `server/routes/chats.ts` dosyasi NUL byte ile bozulmustu; dosya yeniden olusturuldu. Bu dosya mutlaka tekrar gozden gecirilmeli.

Bu oturumdaki son durum: testlerin buyuk kismi gecti, ama gorsel preview ve son build cikti kontrolu hak/ACL limitleri yuzunden tamamlanamadi. Baska agent once bu dosyayi okumali, sonra `git status --short` ve test komutlariyla mevcut calisma agacini dogrulamali.

## 1. Kullanici Hedefi

Kullanici MyWA panelini WhatsApp Web'e daha cok benzetmek istiyor:

- Acik tema, WhatsApp Web'e yakin gorunum.
- Yazilar ve mesaj balonlari okunur boyutta olmali.
- Resimler ve medya panelde gorunmeli.
- WhatsApp uygulamasini kapatip sadece bu paneli kullanmak istiyor; bu yuzden mesaj, medya, okunmamis durum, kesinti sonrasi yakalama ve gonderim durumu kaybolmamali.
- Daha once onaylanan kararlilik plani da halen kapsamda: PostgreSQL tabanli kalici gelen/giden kuyruk, WAHA HMAC webhook, task notification outbox, mobile socket stabilizasyonu, migration guvenligi, saglik kontrolleri.
- Dokuman/Git icindeki erisim sirlarini temizleme ve mevcut sir yenileme kapsam disi tutuldu. Bu, onceki user annotation kararidir: `:codex-annotation{index="1"}` final raporda anilacaksa korunmali.

## 2. En Kritik Mevcut Durum

Calisma agaci cok kirli ve kapsamli degisiklikler var. Commit yapilmadi.

Tamamlanan ana alanlar:

- `prisma/schema.prisma` genisletildi.
- Migrationlar eklendi:
  - `20260918000000_baseline`
  - `20260918010000_reliability`
  - `20260918020000_chat_panel`
  - `20260918030000_link_preview`
- Backend webhook, outbox/inbox, notification API, upload quota, WAHA lifecycle, scheduler, health/ready, Docker ve deployment belgeleri buyuk oranda uygulandi.
- Web chat UI acik tema olacak sekilde yeniden yazildi.
- Media proxy/cache eklendi: WAHA media URL'i tarayiciya direkt verilmeden MyWA uzerinden tokenli ve cache'li sunuluyor.
- Read/unread tracking eklendi: `message_reads` tablosu, `/api/chats/:chatId/read`, unread count.
- WAHA ack/edit/reaction/revoked eventleri isleniyor.
- Call events gorunur sistem mesajina cevrilmeye baslandi.
- Link preview icin `messages.preview` JSON alani eklendi.
- Mobilde ortak socket, medya gosterimi ve okunma isaretleme icin degisiklikler yapildi.
- Next.js `15.5.25` ve React `19.2.3`'e gecildi; `@hello-pangea/dnd` ve `lucide-react` guncellendi.
- `.env.example` artik `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET`, `WAHA_IMAGE`, `MEDIA_DIR`, `MEDIA_MAX_MB`, `MEDIA_QUOTA_MB` iceriyor.

## 3. Kesinti ve Sandbox Durumu

Elektrik kesintisi sonrasi `server/routes/chats.ts` dosyasi tamamen NUL byte ile bozulmustu. Dosya yeniden olusturuldu ve tip kontrolu sonrasinda calisir hale getirildi.

Windows sandbox ara ara `apply deny-read ACLs` hatasi verdi. Bu yuzden son donemde bazi komutlar `require_escalated` ile calisti. Son escalation denemesinde hak limiti nedeniyle su hata geldi:

`Automatic approval review failed: You've hit your usage limit... try again at 7:18 AM.`

Bu nedenle son asamada yerel synthetic preview baslatma ve Playwright gorsel kontrolu tamamlanamadi.

## 4. Canli Veri ve Izin Durumu

Canli production DB metadata kontrolu daha once onaylandi ve gecti: canli sema `prisma/baseline.prisma` ile uyumluydu.

Canli DB row export/copy islemi otomatik inceleme tarafindan reddedildi. Gerekce: kullanici, production `users`, `contacts`, `messages`, `tasks` verilerinin yerel snapshot/test DB'ye aktarilmasina acik izin vermedi.

- `scripts/test-live-copy.mjs` var, ama tekrar calistirma.
- Bu izin olmadan canli satir verisi kopyalama, export etme veya lokal snapshot alma yapma.
- Finalde gerekirse net izin sorusu sorulabilir: canli DB'den gecici yerel snapshot alip migration'i kopya uzerinde sinamak istiyor musunuz?

## 5. Test ve Dogrulama Durumu

Son bilinen basarili kontroller:

- `npm.cmd run typecheck` root: gecti.
- `npm.cmd run build` root: Next 15.5.25 ile build gecti. Uyarilar var, hata yok.
- `npm.cmd test`: gecti; `integration.test.ts` normal testte `TEST_DATABASE_URL` olmadigi icin skip.
- `npm.cmd run test:migrations` yerel PostgreSQL ile gecti: fresh, legacy, drift.
- `npm.cmd run test:integration` yerel PostgreSQL ile gecti: 13 test pass.
- `mobile npm.cmd run typecheck`: gecti.
- `mobile npm.cmd run build:check`: Expo Android export gecti.

Son bilinen root build uyarilari:

- `@next/next/no-img-element` uyarilari:
  - `src/components/chat/ChatList.tsx`
  - `src/components/chat/ChatWindow.tsx`
  - `src/components/chat/MessageBubble.tsx`
  - `src/components/whatsapp/QRConnectModal.tsx`
- `react-hooks/exhaustive-deps` uyarisi `ChatWindow.tsx` icin vardi; sonradan `visible.current` cleanup icin duzeltme yapildi, build yeniden tamamlanirken cikti polling yarim kaldi. Tekrar build calistirip uyarilar kontrol edilmeli.

Yerel test PostgreSQL:

- Runtime: `X:\MyWA\temp\postgres-tools\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe`
- Data dir: `X:\MyWA\temp\pgdata`
- URL: `postgresql://postgres@127.0.0.1:55432/mywa_test`
- Elektrik kesintisi sonrasi tekrar baslatildi. Is bitince durdur:
  `pg_ctl.exe -D X:\MyWA\temp\pgdata -w stop`

## 6. Onemli Dosya Degisiklikleri

Backend:

- `server/lib/reliability.ts`: HMAC verify, event key, parseMessage, media, ack, location/vCard fallback ve link preview parsing.
- `server/lib/media.ts`: Tokenli media URL uretimi, WAHA `/api/files/` path validation, saat penceresine sabit token.
- `server/routes/media.ts`: Tokenli medya endpointi, WAHA'dan `X-Api-Key` ile indirme, local cache, range support, `MEDIA_QUOTA_MB`, `MEDIA_MAX_MB`.
- `server/services/sync.service.ts`: WAHA NOWEB store destekliyse missed messages/chats overview taramasi, `sync_states` cursor.
- `server/services/delivery.service.ts`: Inbox/outbox durable processing, ack/edit/reaction/revoked/call event handling, notification outbox state machine.
- `server/routes/chats.ts`: Sohbet listesi, unread count, cursor paging, read endpoint, contacts/tasks. Kesintide bozuldugu icin tekrar incelenmeli.
- `server/routes/whatsapp-webhook.ts`: Event listesi genisledi: `message.any`, `session.status`, `message.ack`, `message.reaction`, `message.edited`, `message.revoked`, `call.received`, `call.accepted`, `call.rejected`.
- `server/services/workers.ts`: `syncHistory` loop ve ek schema startup checks.
- `server/index.ts`: `/api/media` route, socket message update events, `HOST` env support.

Web:

- `src/app/chat/page.tsx`: WhatsApp benzeri ana layout, sol icon nav, chat list, chat window, acilir gorev paneli, unread title count, reconnect refresh, notification prompt, sync status.
- `src/components/chat/ChatList.tsx`: Acik tema, unread/groups filter, avatar, preview icons.
- `src/components/chat/ChatWindow.tsx`: Header, date separators, older messages, read tracking via IntersectionObserver, scroll-to-bottom/new count, textarea input, emoji mini picker.
- `src/components/chat/MessageBubble.tsx`: Acik tema bubble, media render, zoom image, document/audio/video, link preview, mention/WhatsApp formatting, real ack icons, reactions, revoked/edited states.
- `src/lib/message-text.ts`: URL, mention, bold, italic, strike, code tokenizer.
- `public/chat-pattern.svg`: WhatsApp benzeri hafif arka plan pattern.

Mobile:

- `mobile/src/hooks/useSocket.ts`: Ortak socket registry, `message_updated` event mapping.
- `mobile/src/lib/socket-registry.ts`: `onMessageUpdated` handler.
- `mobile/src/components/MessageBubble.tsx`: Media image/document open, revoked handling, base URL resolution.
- `mobile/src/screens/ChatWindowScreen.tsx`: Read marker via viewable items, message update refresh.
- `mobile/src/screens/ChatListScreen.tsx`: Avatar image and unread count usage.
- `mobile/src/lib/constants.ts`: Acik tema renkleri.

Config/deploy:

- `docker-compose.yml`: WAHA hook events genisledi, `WAHA_API_DOWNLOAD_MEDIA=true`, `mywa_media` volume, `MEDIA_DIR`, `MEDIA_MAX_MB`, `MEDIA_QUOTA_MB`.
- `.env.example`: WAHA image digest ve yeni media envleri.
- `DEPLOYMENT.md`: Henuz yeni media/history/call event ayrintilari tam islenmedi; guncellenmeli.

## 7. Sonraki Net Adimlar

1. Komut izinleri tekrar uygun hale gelince once durum al:
   - `git status --short`
   - `npm.cmd run typecheck`
   - `npm.cmd run build`
   - `npm.cmd test`
   - `$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/mywa_test'; npm.cmd run test:migrations; npm.cmd run test:integration`
   - `cd mobile; npm.cmd run typecheck; npm.cmd run build:check`

2. `npm audit --omit=dev` tekrar bak.
   - Son auditte kalanlar: `qs/body-parser/express` moderate, `postcss/next` high/moderate.
   - Next 15.5.25, Windows RCE critical patch icin zaten guncellendi.
   - `postcss` icin npm fix Next 16 major oneriyordu. Bu major'a atlama yapmadan once resmi advisory ve Next 15 patch var mi kontrol et.
   - `express/body-parser/qs` icin semver-safe patch varsa uygula ve `npm ci` uyumlulugunu kontrol et.

3. Gorsel kontrol yap.
   - Synthetic preview script hazirlandi: `scripts/preview-panel.mjs`.
   - Amac: canli veri kullanmadan yapay mesajlarla paneli localhost'ta acmak.
   - Son deneme hak limiti nedeniyle baslatilamadi.
   - Komut:
     `$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/mywa_test'; $env:PREVIEW_IMAGE='C:\Users\muzaf\AppData\Local\Temp\codex-clipboard-02750186-d3cc-4d03-9401-ecb508fabfcb.png'; node scripts/preview-panel.mjs`
   - Sonra `http://127.0.0.1:3067/login` ac.
   - Login: user `preview`, password `preview-only`.
   - Computer-use helper son denemede ACL hatasi verdi. Alternatif olarak Playwright kullanilabilir; runtime node_modules icinde `playwright` var.
   - Screenshot ve temel layout assertleri eklenirse iyi olur: chat list width, bubble font, media visible, task drawer.

4. `DEPLOYMENT.md` guncelle.
   - NOWEB store uyarisi: resmi docs mevcut oturumda config degisikliginin history kaybina yol acabilecegini soyluyor. Oturum bulunmuyorsa create config store enabled/fullSync true yapiliyor; mevcut calisan oturum otomatik degistirilmemeli.
   - Media cache/backup: `mywa_media` volume backup kapsaminda olmali.
   - Call eventleri sadece gorunur kayit; panel arama yanitlama yapmaz.
   - WhatsApp'i tamamen kapatma beklentisi icin sinirlar: WAHA call receive gorur ama yanitlamak icin telefon/WA gerekir; status/channels/communities/polls gibi alanlarda kapsam siniri olabilir. Bunlari kullaniciya durustce yaz.

5. Testleri genislet veya duzelt.
   - `tests/chat-panel.test.ts` eklendi.
   - `tests/integration.test.ts` 13 test pass oldu.
   - Link preview create kisminda `preview` create data en son eklendi; test buna coverage eklemeli.
   - Call event processing icin integration assertion eklemek iyi olur.
   - Media quota ve token stability testleri var, ama local storage quota race icin gerekirse ek test yaz.

6. Son temizlik.
   - `scripts/preview-panel.mjs` kalabilir ama deployment artifact sayilacaksa docs'ta test araci olarak anlat.
   - `temp/audit-production.json`, `temp/preview-*`, `mobile/dist-check`, `temp/postgres-*` gitignore kapsaminda mi bak.
   - `npm ci` temiz kurulum kontrolu mumkunse yap.
   - Local test PostgreSQL'i finalde durdur.

## 8. Bilinen Riskler

- `server/routes/chats.ts` manuel yeniden olusturuldu; auth, unread counts, cursor pagination, read marking, contacts ve tasks uclari incelendi ve tum entegrasyon testlerinden basariyla gecti.
- `syncHistory` calismasina exponential backoff eklendi (`server/services/workers.ts`); WAHA store kapaliysa veya hata aliyorsa log spam yapmaz, 3s'den baslayip 60s'ye kadar kademeli bekler.
- `DEPLOYMENT.md` dokumanina NOWEB store uyarilari, `mywa_media` volume yedekleme zorunlulugu, call events sinirlari ve WhatsApp Web ikamesinin gercekci sinirlari eklendi.
- `tests/integration.test.ts` test paketine call event (SYSTEM mesaji donusumu) ve extendedTextMessage link preview assertion'lari eklendi ve 13 testin tamami gecti.
- `scripts/smoke-runtime.mjs` izole ve guvenli sema uzerinde calisacak sekilde guncellendi ve production runtime smoke testi basariyla dogrulandi.
- NOWEB store config, sadece yeni session olustururken set ediliyor. Mevcut oturumun ayarini otomatik degistirme; resmi docs risk uyariyor.
- Media proxy token URL icinde. Token kisa omurlu ve sadece message id icin; admin WAHA key tarayiciya sizmaz.
- `mediaView` token saat penceresine sabitlenmis durumda; cache icin stabil URL amacli.
- Call eventler sistem mesajina cevriliyor; arama cevaplama yok.
- Masaustu bildirimleri HTTPS veya secure context gerektirir. HTTP/IP adresinde tarayici bildirim izni calismayabilir; panel icindeki unread yine calisir.
- Full WhatsApp replacement vaadi icin son kabul testleri gercek WAHA oturumu ile yapilmali: foto, video, document, voice, reaction, edit, delete, call received, phone offline, app restart, WAHA restart.

## 9. Kaynak Dokuman Notlari

Bakilan resmi dokumanlar:

- WAHA NOWEB store: `https://waha.devlike.pro/docs/engines/noweb/`
  - Varsayilan NOWEB chats/contacts/messages store etmez.
  - Store enabled/fullSync ile history endpointleri calisir.
  - Mevcut QR taranmis oturumda config degistirme konusunda kayip riski uyarisi var.
- WAHA receive messages/media: `https://waha.devlike.pro/docs/how-to/receive-messages/`
  - `media.url` API key ister.
  - Tarayicida direkt media URL'e key koymak guvensiz; MyWA proxy bu yuzden eklendi.
  - `message.ack`, `message.reaction`, `message.revoked` eventleri mevcut.
- WAHA chats/history: `https://waha.devlike.pro/docs/how-to/chats/`
  - `GET /api/{session}/chats/all/messages`, `downloadMedia`, `offset`, timestamp filters.
- WAHA calls: `https://waha.devlike.pro/docs/how-to/calls/`
  - `call.received`, `call.accepted`, `call.rejected` events; reject API var ama panelde uygulanmadi.
- Expo SDK v57 docs: `https://docs.expo.dev/versions/v57.0.0/`
  - Mobile `AGENTS.md` geregi okundu.

## 10. Final Rapor Icin Onerilen Dil

Kullaniciya finalde kisa ve net yaz:

- Elektrik kesintisinden sonra yarim kalanlar toparlandi; devir dosyasi proje klasorune birakildi.
- Yapilan temel isler: acik WhatsApp benzeri panel, medya proxy/cache, unread/read tracking, missed message sync, real ack/edit/reaction/delete, call visibility, mobile media/read, durable queues.
- Gecen testleri say.
- Kalan: gorsel preview hak limiti yuzunden tamamlanamadi; canli veri kopyasi otomatik onay tarafindan reddedildi, acik izin gerektiriyor; production WAHA ile gercek cihaz kabul testi yapilmali.
- Sir temizleme/rotasyon kapsam disi kalmaya devam ediyor: `:codex-annotation{index="1"}`.

## 11. Dosya Konumu

Bu devir dosyasi: `X:\MyWA\HANDOFF_MYWA_WHATSAPP_PANEL.md`
