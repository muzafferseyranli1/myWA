import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';

test('PostgreSQL reliability contracts', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/mywa_test'), 'Use an isolated local mywa_test database');
  process.env.DATABASE_URL = url.href;
  Object.assign(process.env, { NODE_ENV: 'production' });
  process.env.JWT_SECRET = 'integration-test-only';
  process.env.WAHA_WEBHOOK_SECRET = 'integration-hmac';
  process.env.WAHA_API_KEY = 'integration-api';
  process.env.APP_URL = 'http://localhost:3060';
  let history:any[]=[];
  let state = 'WORKING', missing = false, httpError = 0, sendError = 0;
  const calls: string[] = [], sent: any[] = [];
  const mock = http.createServer(async (req,res) => {
    calls.push(req.url!); res.setHeader('Content-Type','application/json');
    assert.equal(req.headers['x-api-key'], 'integration-api');
    if (httpError) { res.statusCode=httpError; res.end('{}'); return; }
    if(req.url?.startsWith('/api/files/')){res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=','base64'));return;}
if(req.url?.includes('/chats/all/messages')){const query=new URL(req.url,'http://localhost').searchParams;const offset=Number(query.get('offset'));res.end(JSON.stringify(history.slice(offset,offset+100)));return;}
if(req.url?.includes('/chats/overview')){res.end('[]');return;}
if (req.url === '/api/sendText') {
      let body=''; for await (const chunk of req) body+=chunk; sent.push(JSON.parse(body));
      res.statusCode=sendError || 200; res.end(JSON.stringify({id:'provider-'+sent.length})); return;
    }
    if (req.url?.endsWith('/groups')) { res.end('[]'); return; }
    if (req.url?.includes('auth/qr')) { res.end(JSON.stringify({value:'test-qr'})); return; }
    if (req.url === '/api/sessions' && req.method==='POST') { missing=false; state='STOPPED'; res.end(JSON.stringify({status:state})); return; }
    if (missing) { res.statusCode=404; res.end('{}'); return; }
    if (req.method==='POST') { if (req.url?.endsWith('/stop')) state='STOPPED'; res.end('{}'); return; }
    res.end(JSON.stringify({name:'default',status:state}));
  });
  await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));
  process.env.WAHA_API_URL = `http://127.0.0.1:${(mock.address() as any).port}`;
  const {prisma} = await import('../server/lib/prisma');
  const {wahaService, WAHAService} = await import('../server/services/waha.service');
  const delivery = await import('../server/services/delivery.service');
  const {taskService} = await import('../server/services/task.service');
  const {events} = await import('../server/lib/events');
  const {default:webhooks} = await import('../server/routes/whatsapp-webhook');
  const {default:whatsapp} = await import('../server/routes/whatsapp');
  const {default:notifications} = await import('../server/routes/notifications');
  const {default:tasks} = await import('../server/routes/tasks');
  const {createUploadRouter} = await import('../server/middleware/upload');
  const {setupSockets} = await import('../server/sockets');
  const tenantLib = await import('../server/lib/tenant');
  const dir = await mkdtemp(path.join(os.tmpdir(),'mywa-upload-test-'));
  process.env.UPLOAD_DIR=dir; process.env.MAX_FILE_SIZE='0.001'; process.env.UPLOAD_QUOTA_MB='0.001';
  const app = express(); app.use('/webhook',webhooks); app.use(express.json());
  app.use('/whatsapp',whatsapp); app.use('/notifications',notifications); app.use('/tasks',tasks);
  app.use('/upload',(await createUploadRouter()).router);
  process.env.MEDIA_DIR=path.join(dir,'media');
  app.use('/api/media',(await import('../server/routes/media')).default);
  app.use('/chats',(await import('../server/routes/chats')).default);
  app.use('/admin',(await import('../server/routes/admin')).default);
  const api=http.createServer(app); const socketServer=new Server(api); setupSockets(socketServer);
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(api.address() as any).port}`;
  // The legacy owner of the (test) public schema, bound to the 'default' WAHA session.
  await tenantLib.systemDb().user.create({data:{id:'test-user',username:'test-user',passwordHash:'!',displayName:'Test',role:'USER',tenantSchema:'public',wahaSession:'default'}});
  await tenantLib.loadTenants();
  const tenant = tenantLib.tenantForUser('test-user')!;
  // Servers above were started outside any tenant, so every request must establish its own.
  await tenantLib.runWithTenant(tenant, async () => {
  const token=jwt.sign({id:'test-user',role:'USER'},process.env.JWT_SECRET!);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const event={event:'message.any',session:'default',payload:{id:randomUUID(),from:'inbound@g.us',participant:'123@c.us',body:'hello',timestamp:1780000000}};
  const hook=(data:any,valid=true)=>{ const body=JSON.stringify(data); return fetch(base+'/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Hmac-Algorithm':'sha512','X-Webhook-Hmac':valid?createHmac('sha512',process.env.WAHA_WEBHOOK_SECRET!).update(body).digest('hex'):'invalid'},body}); };
  const gate=()=>prisma.connectionPreference.update({where:{session:'default'},data:{enabled:true,lastDispatchAt:null}});
  try {
    await t.test('authentication and webhook signature are enforced before writes',async()=>{
      assert.equal((await fetch(base+'/whatsapp/status')).status,401);
      // A valid token of a user without a tenant cannot reach any data.
      const stranger=jwt.sign({id:'no-such-user',role:'ADMIN'},process.env.JWT_SECRET!);
      assert.equal((await fetch(base+'/whatsapp/status',{headers:{Authorization:`Bearer ${stranger}`}})).status,401);
      assert.equal((await fetch(base+'/chats',{headers:{Authorization:`Bearer ${stranger}`}})).status,401);
      assert.equal((await fetch(base+'/upload',{method:'POST'})).status,401);
      assert.equal((await hook(event,false)).status,401);
      assert.equal((await hook({...event,session:'other'})).status,400);
      assert.equal(await prisma.incomingEvent.count(),0);
    });
    await t.test('durable webhook deduplication survives interrupted processing',async()=>{
      const responses = await Promise.all([hook(event),hook({...event,event:'message'})]);
      for (const response of responses) assert.equal(response.status,200);
      assert.equal(await prisma.incomingEvent.count(),1);
      await prisma.incomingEvent.updateMany({data:{status:'PROCESSING',lockedUntil:new Date(0),lockToken:'old-worker'}});
      let emitted=0; const listener=()=>emitted++; events.on('new_message',listener);
      await Promise.all([delivery.processInbox(),delivery.processInbox()]);
      await delivery.processInbox(); events.off('new_message',listener);
      assert.equal(await prisma.message.count({where:{id:event.payload.id}}),1); assert.equal(emitted,1);
      assert.equal((await prisma.incomingEvent.findFirstOrThrow()).status,'COMPLETED');
      const db=tenant.db as any, original=db.$queryRaw;
      try { db.$queryRaw=async()=>{throw new Error('DB unavailable');}; assert.equal((await hook({...event,payload:{...event.payload,id:randomUUID()}})).status,503); }
      finally { db.$queryRaw=original; }
    });
    await t.test('session lifecycle preserves working sessions and persisted disconnect',async()=>{
      await wahaService.reconcile(); calls.length=0;
      await wahaService.reconcile(); assert.ok(!calls.some(c=>c.endsWith('/start')||c.endsWith('/restart')));
      state='STOPPED'; await wahaService.reconcile(); assert.ok(calls.some(c=>c.endsWith('/start')));
      missing=true; calls.length=0; await wahaService.reconcile(); assert.ok(calls.includes('/api/sessions'));
      state='FAILED'; calls.length=0; await wahaService.reconcile(); await wahaService.reconcile(); assert.equal(calls.filter(c=>c.endsWith('/restart')).length,1);
      const clock=Date.now; let elapsed=0; Date.now=()=>clock()+elapsed;
      try { for(let i=0;i<5;i++){elapsed+=120000;await wahaService.reconcile();} assert.equal(calls.filter(c=>c.endsWith('/restart')).length,3); }
      finally { Date.now=clock; }
      state='WORKING'; await wahaService.reconcile(); await wahaService.stopSession(); calls.length=0;
      await new WAHAService().reconcile(); assert.ok(!calls.some(c=>c.endsWith('/start')));
      await gate(); state='WORKING'; await wahaService.reconcile(); httpError=401;
      await assert.rejects(wahaService.reconcile()); assert.equal(wahaService.isConnected(),false);
      httpError=0; state='SCAN_QR_CODE'; await wahaService.reconcile();
      // Every user sees the QR code of their own session.
      assert.ok((await (await fetch(base+'/whatsapp/status',{headers})).json()).qr.startsWith('data:image/png'));
      state='WORKING'; await wahaService.reconcile();
      const original=globalThis.fetch; globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
      try { await assert.rejects(wahaService.updateStatus()); assert.equal(wahaService.isConnected(),false); }
      finally { globalThis.fetch=original; }
    });
    await t.test('task and notification commit together and client retries do not duplicate',async()=>{
      const chat=await prisma.chat.create({data:{id:'tasks@g.us',name:'Tasks',isGroup:true}});
      const data={chatId:chat.id,title:'offline task',clientRequestId:'one-operation'};
      const [a,b]=await Promise.all([taskService.createTask(data),taskService.createTask(data)]);
      assert.equal(a.id,b.id); assert.equal(a.notification?.status,'PENDING');
      const before=sent.length; await delivery.processOutbox(); assert.equal(sent.length,before);
      await assert.rejects(taskService.createTask({...data,clientRequestId:'invalid',assigneeIds:['missing-contact']}));
      assert.equal(await prisma.task.count(),1); assert.equal(await prisma.outgoingJob.count(),1);
      state='WORKING'; await wahaService.reconcile(); await gate();
      await Promise.all([delivery.processOutbox(),delivery.processOutbox()]);
      assert.equal(sent.length,before+1); assert.equal((await prisma.outgoingJob.findFirstOrThrow()).status,'ACCEPTED');
      await Promise.all([taskService.closeTask(a.id,{completionNote:'done'}),taskService.closeTask(a.id,{completionNote:'done'})]);
      assert.equal(await prisma.outgoingJob.count({where:{kind:'TASK_COMPLETED'}}),1);
      assert.equal((await fetch(base+`/tasks/${a.id}/public`)).status,200);
      assert.equal((await fetch(base+`/tasks/${a.id}/close`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({completionNote:'done'})})).status,200);
      await gate(); await delivery.processOutbox();
    });
    await t.test('uncertain sends require explicit retry and preserve chat order',async()=>{
      const first=await delivery.enqueue(prisma,{operationKey:'unknown-first',chatId:'ordered@g.us',kind:'CHAT',payload:{text:'first'}});
      await delivery.enqueue(prisma,{operationKey:'ordered-second',chatId:'ordered@g.us',kind:'CHAT',payload:{text:'second'}});
      sendError=500; await gate(); const before=sent.length; await delivery.processOutbox(); sendError=0;
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:first.id}})).status,'UNKNOWN');
      await gate(); await delivery.processOutbox(); assert.equal(sent.length,before+1);
      assert.equal((await fetch(base+`/notifications/${first.id}/retry`,{method:'POST',headers,body:'{}'})).status,409);
      assert.equal((await fetch(base+`/notifications/${first.id}/retry`,{method:'POST',headers,body:'{"confirmUnknown":true}'})).status,200);
      await gate(); await delivery.processOutbox(); await gate(); await delivery.processOutbox();
      assert.deepEqual(sent.slice(-2).map(m=>m.text),['first','second']);
      const expired=await delivery.enqueue(prisma,{operationKey:'crashed-send',chatId:'crash@g.us',kind:'CHAT',payload:{text:'maybe-sent'}});
      await prisma.outgoingJob.update({where:{id:expired.id},data:{status:'PROCESSING',lockedUntil:new Date(0),lockToken:'crashed'}});
      await delivery.processOutbox(); assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:expired.id}})).status,'UNKNOWN');
      const fatal=await delivery.enqueue(prisma,{operationKey:'unauthorized-send',chatId:'fatal@g.us',kind:'CHAT',payload:{text:'fatal'}});
      sendError=401; await gate(); await delivery.processOutbox(); sendError=0;
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:fatal.id}})).status,'FAILED');
      const safe=await delivery.enqueue(prisma,{operationKey:'rate-limited-send',chatId:'rate@g.us',kind:'CHAT',payload:{text:'rate'}});
      sendError=429; await gate(); await delivery.processOutbox();
      let delayed=await prisma.outgoingJob.findUniqueOrThrow({where:{id:safe.id}});
      assert.equal(delayed.status,'PENDING'); assert.equal(delayed.attempts,1); assert.ok(delayed.nextAttemptAt.getTime()>Date.now());
      await prisma.outgoingJob.update({where:{id:safe.id},data:{attempts:9,nextAttemptAt:new Date(0)}});
      await gate(); await delivery.processOutbox(); sendError=0;
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:safe.id}})).status,'FAILED');
      const timed=await delivery.enqueue(prisma,{operationKey:'timed-send',chatId:'timed@g.us',kind:'CHAT',payload:{text:'timed'}});
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async(input,options)=>String(input).endsWith('/api/sendText')?Promise.reject(new DOMException('timeout','TimeoutError')):originalFetch(input,options);
      try { await gate(); await delivery.processOutbox(); }
      finally { globalThis.fetch=originalFetch; }
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:timed.id}})).status,'UNKNOWN');
    });
    await t.test('socket acknowledgement returns the same durable job for the same operation',async()=>{
      const socket=client(base,{auth:{token},transports:['websocket']});
      try {
        await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
        const send=()=>new Promise<any>((resolve,reject)=>socket.timeout(5000).emit('send_message',{chatId:'socket@g.us',body:'queued',clientMessageId:'operation'},(e:any,r:any)=>e?reject(e):resolve(r)));
        const [a,b]=await Promise.all([send(),send()]); assert.equal(a.success,true); assert.equal(a.notification.id,b.notification.id);
      } finally { socket.disconnect(); }
    });
    await t.test('scheduler catches up once and completed or stale reminders are cancelled',async()=>{
      await gate(); await delivery.processOutbox();
      const task=await taskService.createTask({chatId:'tasks@g.us',title:'reminder',notifyOnCreate:false,dueDate:new Date(Date.now()-86400000).toISOString()});
      const before=new Date(); before.setUTCHours(5,59,59); await delivery.runScheduler(before); assert.equal(await prisma.schedulerRun.count(),0);
      const late=new Date(); late.setUTCHours(8,0,0);
      await Promise.all([delivery.runScheduler(late),delivery.runScheduler(late)]); assert.equal(await prisma.schedulerRun.count(),1);
      const reminder=await prisma.outgoingJob.findFirstOrThrow({where:{kind:'REMINDER'}});
      await taskService.closeTask(task.id,{completionNote:'before reminder'}); await gate(); const count=sent.length; await delivery.processOutbox();
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:reminder.id}})).status,'CANCELLED'); assert.equal(sent.length,count);
      const stale=await delivery.enqueue(prisma,{operationKey:'stale',chatId:'stale@g.us',kind:'REMINDER',payload:{taskIds:[task.id],day:'2020-01-01'}});
      // Drain queued jobs before checking the stale reminder.
      for(let i=0;i<4;i++){await gate();await delivery.processOutbox();}
      assert.equal((await prisma.outgoingJob.findUniqueOrThrow({where:{id:stale.id}})).status,'CANCELLED');
    });
    await t.test('upload quota rejects before creating a second file and rate is per user',async()=>{
      const upload=()=>{const data=new FormData();data.append('file',new Blob(['data']),'test.txt');return fetch(base+'/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:data});};
      assert.equal((await upload()).status,200); const files=await readdir(dir);
      assert.equal((await upload()).status,507); assert.deepEqual(await readdir(dir),files);
      for(let i=0;i<8;i++) await upload(); assert.equal((await upload()).status,429);
    });
    await t.test('missing messages are recovered once and a failed page does not advance the cursor',async()=>{
      state='WORKING';await gate();await wahaService.reconcile();
      const {syncHistory}=await import('../server/services/sync.service');
      history=[{id:'missed-message',from:'catchup@g.us',participant:'777@c.us',body:'recovered',timestamp:Math.floor(Date.now()/1000)-60,ack:2}];
      await syncHistory();assert.equal((await prisma.syncState.findFirstOrThrow()).offset,100);
      let published=0;const listener=()=>published++;events.on('new_message',listener);
      await delivery.processInbox();
      await hook({event:'message.any',session:'default',payload:history[0]});await delivery.processInbox();
      events.off('new_message',listener);assert.equal(published,1);
      assert.equal(await prisma.message.count({where:{id:'missed-message'}}),1);
      await syncHistory();const completed=await prisma.syncState.findFirstOrThrow();assert.ok(completed.completedUntil>0);assert.equal(completed.offset,0);
      httpError=503;await assert.rejects(syncHistory());httpError=0;
      const failed=await prisma.syncState.findFirstOrThrow();assert.equal(failed.offset,0);assert.equal(failed.completedUntil,completed.completedUntil);assert.ok(failed.lastError);
      history=[];
    });
    await t.test('media is privately served, cached through outages and supports range requests',async()=>{
      await prisma.message.create({data:{id:'photo-one',chatId:event.payload.from,messageType:'IMAGE',mediaMime:'image/png',mediaUrl:'http://unreachable-container:3000/api/files/test.png',timestamp:new Date()}});
      const {mediaView}=await import('../server/lib/media');
      const url=mediaView({id:'photo-one',messageType:'IMAGE'}).mediaUrl!;
      assert.equal((await fetch(base+'/api/media/photo-one')).status,401);
      assert.equal((await fetch(base+url.replace('photo-one','photo-other'))).status,401);
      const response=await fetch(base+url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
      const bytes=await response.arrayBuffer();assert.ok(bytes.byteLength>0);
      httpError=503;
      const cached=await fetch(base+url,{headers:{Range:'bytes=0-0'}});assert.equal(cached.status,206);assert.equal((await cached.arrayBuffer()).byteLength,1);httpError=0;
      await prisma.message.update({where:{id:'photo-one'},data:{revoked:true}});
      assert.equal((await fetch(base+url)).status,404);
    });
    await t.test('read markers only affect the visible incoming IDs and cursor pages remain stable',async()=>{
      const timestamp=new Date();
      for(const id of ['cursor-a','cursor-b','cursor-c'])await prisma.message.create({data:{id,chatId:event.payload.from,body:id,timestamp}});
      const first=await (await fetch(base+'/chats/'+encodeURIComponent(event.payload.from)+'/messages?limit=2',{headers})).json();
      const boundary=first.messages[0].id;
      await prisma.message.create({data:{id:'newer-record',chatId:event.payload.from,timestamp:new Date(timestamp.getTime()+1000)}});
      const second=await (await fetch(base+'/chats/'+encodeURIComponent(event.payload.from)+'/messages?limit=2&before='+encodeURIComponent(boundary),{headers})).json();
      assert.ok(!second.messages.some((m:any)=>first.messages.some((p:any)=>p.id===m.id)));
      await fetch(base+'/chats/'+encodeURIComponent(event.payload.from)+'/read',{method:'POST',headers,body:JSON.stringify({messageIds:['cursor-a','cursor-b','foreign-record']})});
      await fetch(base+'/chats/'+encodeURIComponent(event.payload.from)+'/read',{method:'POST',headers,body:JSON.stringify({messageIds:['cursor-a']})});
      assert.equal(await prisma.messageRead.count({where:{userId:'test-user'}}),2);
      assert.equal(await prisma.messageRead.count({where:{messageId:'cursor-c'}}),0);
      const chats=await(await fetch(base+'/chats',{headers})).json();assert.ok(chats.find((c:any)=>c.id===event.payload.from).unreadCount>0);
    });
    await t.test('real ACK, edit, reaction, call and link preview update stored messages',async()=>{
      await hook({event:'message.ack',session:'default',id:'ack-read',payload:{id:event.payload.id,ack:3}});await delivery.processInbox();
      await hook({event:'message.ack',session:'default',id:'ack-old',payload:{id:event.payload.id,ack:1}});await delivery.processInbox();
      assert.equal((await prisma.message.findUniqueOrThrow({where:{id:event.payload.id}})).ack,3);
      await hook({event:'message.edited',session:'default',id:'edit',payload:{after:{id:event.payload.id,body:'edited'}}});await delivery.processInbox();
      assert.equal((await prisma.message.findUniqueOrThrow({where:{id:event.payload.id}})).body,'edited');
      const reaction={event:'message.reaction',session:'default',id:'reaction',payload:{from:'777@c.us',timestamp:1780000001,reaction:{messageId:event.payload.id,text:'👍'}}};
      await hook(reaction);await delivery.processInbox();
      await hook({...reaction,id:'reaction-remove',payload:{...reaction.payload,timestamp:1780000002,reaction:{messageId:event.payload.id,text:''}}});await delivery.processInbox();
      assert.equal((await prisma.messageReaction.findFirstOrThrow({where:{messageId:event.payload.id}})).text,'');
      await hook({event:'message.revoked',session:'default',id:'revoke',payload:{after:{id:event.payload.id}}});await delivery.processInbox();
      assert.equal((await prisma.message.findUniqueOrThrow({where:{id:event.payload.id}})).revoked,true);
      await hook({event:'call.received',session:'default',id:'call-1',payload:{id:'call-99',from:event.payload.from,isVideo:false,timestamp:1780000010}});
      await delivery.processInbox();
      const callMsg=await prisma.message.findUniqueOrThrow({where:{id:'call:call-99:call.received'}});
      assert.equal(callMsg.messageType,'SYSTEM');
      assert.ok(callMsg.body && callMsg.body.includes('Sesli arama'));
      await hook({event:'message.any',session:'default',id:'preview-msg',payload:{id:'preview-msg-id',from:event.payload.from,participant:'123@c.us',body:'Check https://example.com',timestamp:1780000015,_data:{message:{extendedTextMessage:{title:'Example Title',description:'Example Desc',canonicalUrl:'https://example.com'}}}}});
      await delivery.processInbox();
      const previewMsg=await prisma.message.findUniqueOrThrow({where:{id:'preview-msg-id'}});
      assert.equal((previewMsg.preview as any)?.title,'Example Title');
    });
    await t.test('tenants are isolated: a second user reaches none of the first user\'s data',async()=>{
      const other=await tenantLib.systemDb().user.create({data:{username:'other-user',passwordHash:'!',displayName:'Other',role:'USER'}});
      const otherTenant=(await tenantLib.provisionTenant(other.id))!;
      assert.notEqual(otherTenant.schema,'public'); assert.match(otherTenant.session,/^u_[a-f0-9]+$/);
      const otherToken=jwt.sign({id:other.id,role:'USER'},process.env.JWT_SECRET!);
      const theirHeaders={Authorization:`Bearer ${otherToken}`,'Content-Type':'application/json'};
      const chatId=event.payload.from;
      assert.ok(await prisma.message.count({where:{chatId}})>0,'the first user has messages in this chat');
      // REST: chats, messages, contacts, tasks, notifications.
      assert.deepEqual(await (await fetch(base+'/chats',{headers:theirHeaders})).json(),[]);
      assert.equal((await (await fetch(base+'/chats/'+encodeURIComponent(chatId)+'/messages',{headers:theirHeaders})).json()).messages.length,0);
      assert.deepEqual(await (await fetch(base+'/chats/'+encodeURIComponent(chatId)+'/contacts',{headers:theirHeaders})).json(),[]);
      assert.equal(JSON.stringify(await (await fetch(base+'/tasks/kanban',{headers:theirHeaders})).json()).includes('offline task'),false);
      assert.equal((await (await fetch(base+'/notifications',{headers:theirHeaders})).json()).total,0);
      const ownTask=await prisma.task.findFirstOrThrow();
      assert.notEqual((await fetch(base+'/tasks/'+ownTask.id,{method:'PATCH',headers:theirHeaders,body:JSON.stringify({title:'hijacked'})})).status,200);
      assert.notEqual((await fetch(base+'/tasks/'+ownTask.id,{method:'DELETE',headers:theirHeaders})).status,200);
      assert.notEqual((await prisma.task.findUniqueOrThrow({where:{id:ownTask.id}})).title,'hijacked');
      await fetch(base+'/chats/read-all',{method:'POST',headers:theirHeaders});
      assert.equal(await prisma.messageRead.count({where:{userId:other.id}}),0);
      // Media: a token issued inside the other tenant only ever resolves in that tenant.
      await prisma.message.create({data:{id:'photo-private',chatId,messageType:'IMAGE',mediaMime:'image/png',mediaUrl:'http://unreachable-container:3000/api/files/test.png',timestamp:new Date()}});
      const {mediaView}=await import('../server/lib/media');
      const foreign=tenantLib.runWithTenant(otherTenant,()=>mediaView({id:'photo-private',messageType:'IMAGE'}).mediaUrl!);
      assert.equal((await fetch(base+foreign)).status,404);
      // Webhook: events of the other session are stored only in the other schema.
      const before=await prisma.message.count();
      const otherEvent={event:'message.any',session:otherTenant.session,payload:{id:'other-only',from:chatId,participant:'555@c.us',body:'secret of other',timestamp:1780000100}};
      assert.equal((await hook(otherEvent)).status,200);
      await tenantLib.runWithTenant(otherTenant,()=>delivery.processInbox());
      assert.equal(await prisma.message.count(),before);
      assert.equal(await otherTenant.db.message.count({where:{id:'other-only'}}),1);
      // Sockets: both users open the same WhatsApp group id; only the owner receives its events.
      const mine=client(base,{auth:{token},transports:['websocket']}), theirs=client(base,{auth:{token:otherToken},transports:['websocket']});
      try {
        await Promise.all([mine,theirs].map(socket=>new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);})));
        const got={mine:[] as any[],theirs:[] as any[]};
        for(const name of ['new_message','message_arrived','chat_updated']){mine.on(name,(m:any)=>got.mine.push(m));theirs.on(name,(m:any)=>got.theirs.push(m));}
        mine.emit('join_chat',chatId); theirs.emit('join_chat',chatId);
        await new Promise(r=>setTimeout(r,300));
        await hook({...otherEvent,payload:{...otherEvent.payload,id:'other-live',body:'live secret'}});
        await tenantLib.runWithTenant(otherTenant,()=>delivery.processInbox());
        await new Promise(r=>setTimeout(r,300));
        assert.deepEqual(got.mine,[]);
        assert.ok(got.theirs.some(m=>m?.id==='other-live'&&m.body==='live secret'));
      } finally { mine.disconnect(); theirs.disconnect(); }
      // Deactivation revokes access and stops routing webhook events immediately.
      await tenantLib.systemDb().user.update({where:{id:other.id},data:{isActive:false}}); await tenantLib.loadTenants();
      assert.equal((await fetch(base+'/chats',{headers:theirHeaders})).status,401);
      assert.equal((await hook({...otherEvent,payload:{...otherEvent.payload,id:'after-disable'}})).status,400);
    });
    await t.test('administrators manage accounts without any route to user data',async()=>{
      assert.equal((await fetch(base+'/admin/users',{headers})).status,403);
      const admin=await tenantLib.systemDb().user.create({data:{username:'admin-user',passwordHash:'!',displayName:'Admin',role:'ADMIN'}});
      await tenantLib.provisionTenant(admin.id);
      const adminHeaders={Authorization:`Bearer ${jwt.sign({id:admin.id,role:'ADMIN'},process.env.JWT_SECRET!)}`,'Content-Type':'application/json'};
      // The administrator's own tenant is empty: being admin grants no view into other schemas.
      assert.deepEqual(await (await fetch(base+'/chats',{headers:adminHeaders})).json(),[]);
      const created=await fetch(base+'/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({username:'new.user',password:'long-enough',displayName:'New'})});
      assert.equal(created.status,201);
      const view=await created.json(); assert.equal(view.provisioned,true); assert.equal(view.role,'USER');
      const list=await (await fetch(base+'/admin/users',{headers:adminHeaders})).json();
      assert.ok(list.every((u:any)=>!('qr' in u)&&!('passwordHash' in u)&&!('tenantSchema' in u)));
      assert.equal((await fetch(base+'/admin/users/'+admin.id,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({isActive:false})})).status,400);
    });
  } finally {
    socketServer.close(); await new Promise<void>(r=>api.close(()=>r()));
    mock.closeAllConnections(); await new Promise<void>(r=>mock.close(()=>r()));
    await prisma.$disconnect();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('mywa-upload-test-'));
    await rm(dir,{recursive:true,force:true});
  }
  });
});
