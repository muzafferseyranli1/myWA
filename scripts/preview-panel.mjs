import {PrismaClient} from '@prisma/client';
import {spawn,spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const url=new URL(process.env.TEST_DATABASE_URL||'');
assert.ok(url.hostname==='127.0.0.1'&&url.pathname==='/mywa_test','Preview requires an isolated local test database');
url.searchParams.set('schema','preview_'+Date.now());
const env={...process.env,DATABASE_URL:url.href,TEST_DATABASE_URL:url.href,JWT_SECRET:'preview-only',WAHA_API_KEY:'preview-only',WAHA_WEBHOOK_SECRET:'preview-only',APP_URL:'http://127.0.0.1:3067',PORT:'3067',HOST:'127.0.0.1',UPLOAD_DIR:'temp/preview-uploads',MEDIA_DIR:'temp/preview-media',NODE_ENV:'production',ADMIN_USERNAME:'preview',ADMIN_PASSWORD:'preview-only'};
const migrated=spawnSync(process.execPath,['scripts/migrate-safe.mjs'],{env,encoding:'utf8'});
if(migrated.status!==0)throw new Error(migrated.stderr||migrated.stdout);
const db=new PrismaClient({datasourceUrl:url.href});
await db.chat.createMany({data:[{id:'preview@g.us',name:'Ürün ve Operasyon',isGroup:true},{id:'preview-person@c.us',name:'Ayşe Yılmaz'}]});
await db.contact.create({data:{id:'preview-sender@c.us',pushName:'Alper',phoneNumber:'905551234567'}});
const base=Date.now()-3600000;
for(let i=0;i<65;i++)await db.message.create({data:{id:'preview-'+String(i).padStart(3,'0'),chatId:'preview@g.us',senderId:i%3?'preview-sender@c.us':null,isFromMe:i%3===0,ack:i%3===0?3:null,body:i===62?'*Yeni görev oluşturuldu*\n\n*Çağrı merkezi servis bölgeleri*\nŞube ayarlarını birlikte kontrol edelim.\nÖncelik: Yüksek\nGörevi incele: https://example.com/task':i===63?'Servis bölgelerini kontrol ettim. Güncelleme hazır.':i===64?'Teşekkürler 😊 Bir sonraki adımda test sonuçlarını da paylaşalım.':i===61?'Yeni arayüz: açık tema, okunabilir yazılar ve fotoğraflar.':i%2?'Toplantı notlarını buradan paylaşabiliriz.':'Tamam, kontrol edip bilgi vereceğim.',quotedText:i===64?'Servis bölgelerini kontrol ettim. Güncelleme hazır.':null,quotedSender:i===64?'Alper':null,messageType:i===61?'IMAGE':'TEXT',mediaMime:i===61?'image/png':null,mediaUrl:i===61?'http://private:3000/api/files/preview.png':null,timestamp:new Date(base+i*30000)}});
await db.message.create({data:{id:'preview-person-message',chatId:'preview-person@c.us',body:'Merhaba, bugünkü toplantı saatini teyit edebilir miyiz?',timestamp:new Date()}});
await db.task.create({data:{id:'preview-task',chatId:'preview@g.us',title:'Çağrı merkezi servis bölgeleri',description:'Şube ayarlarını kontrol et ve test sonuçlarını paylaş.',priority:'HIGH'}});
const seeded=spawnSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,encoding:'utf8'});
if(seeded.status!==0)throw new Error(seeded.stderr||seeded.stdout);
await db.$disconnect();
const mock=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url?.startsWith('/api/files/')){
  res.setHeader('Content-Type','image/png');
  const img = process.env.PREVIEW_IMAGE && fs.existsSync(process.env.PREVIEW_IMAGE)
    ? fs.readFileSync(process.env.PREVIEW_IMAGE)
    : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=','base64');
  res.end(img);
  return;
 }
 if(req.url?.endsWith('/groups')||req.url?.includes('/chats/all/messages')||req.url?.includes('/chats/overview')){res.end('[]');return;}
 if(req.url==='/api/sendText'){res.end(JSON.stringify({id:'preview-sent'}));return;}
 res.end(JSON.stringify({name:'default',status:'WORKING'}));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));env.WAHA_API_URL='http://127.0.0.1:'+mock.address().port;
const app=spawn(process.execPath,['--import','tsx','server/index.ts'],{env,windowsHide:true,stdio:'inherit'});
console.log('Synthetic preview at http://127.0.0.1:3067/login — user preview, password preview-only');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.kill('SIGTERM');mock.close();});
app.once('exit',()=>{mock.close();process.exit();});
