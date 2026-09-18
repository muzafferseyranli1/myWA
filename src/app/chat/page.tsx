'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatList from '../../components/chat/ChatList';
import ChatWindow from '../../components/chat/ChatWindow';
import TaskSidebar from '../../components/task/TaskSidebar';
import KanbanBoard from '../../components/task/KanbanBoard';
import QRConnectModal from '../../components/whatsapp/QRConnectModal';
import NotificationsPanel from '../../components/NotificationsPanel';
import ReminderButton from '../../components/task/ReminderButton';
import { getSocket, disconnectSocket } from '../../lib/socket';
import { LogOut, Smartphone, MessageCircle, LayoutDashboard, Bell, X, RefreshCw } from 'lucide-react';
function headers(){return {Authorization:'Bearer '+localStorage.getItem('mywa_token')};}
function merge(previous:any[],incoming:any[]){return [...new Map([...previous,...incoming].map(m=>[m.id,m])).values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.id.localeCompare(b.id));}
export default function ChatDashboard(){
 const router=useRouter(),activeChat=useRef<string|null>(null),version=useRef(0),chatRef=useRef<any[]>([]),notified=useRef(new Set<string>());
 const [authenticated,setAuthenticated]=useState(false),[admin,setAdmin]=useState(false),[error,setError]=useState('');
 const [view,setView]=useState<'chat'|'kanban'>('chat'),[selected,setSelected]=useState<string|null>(null),[chats,setChats]=useState<any[]>([]),[messages,setMessages]=useState<any[]>([]),[tasks,setTasks]=useState<any[]>([]),[contacts,setContacts]=useState<any[]>([]);
 const [status,setStatus]=useState('disconnected'),[qr,setQr]=useState(''),[myJid,setMyJid]=useState(''),[showQr,setShowQr]=useState(false),[showTasks,setShowTasks]=useState(false),[showNotifications,setShowNotifications]=useState(false);
 const [socketOnline,setSocketOnline]=useState(false),[sync,setSync]=useState<any>(null),[hasMore,setHasMore]=useState(false),[loadingOlder,setLoadingOlder]=useState(false),[notice,setNotice]=useState<any>(null),[notificationHint,setNotificationHint]=useState(''),[bannerDismissed,setBannerDismissed]=useState(false);
 const fetchChats=useCallback(async()=>{
  try {const res=await fetch('/api/chats',{headers:headers()});if(!res.ok)throw new Error('Sohbetler alınamadı.');const data=await res.json();setChats(data);chatRef.current=data;}catch(e:any){setError(e.message);}
 },[]);
 const fetchStatus=useCallback(async()=>{
  try {const [wa,history]=await Promise.all([fetch('/api/whatsapp/status',{headers:headers()}),fetch('/api/whatsapp/sync',{headers:headers()})]);
   if(wa.ok){const data=await wa.json();setStatus(data.status);setQr(data.qr||'');if(data.myJid)setMyJid(data.myJid);}
   if(history.ok)setSync(await history.json());
  }catch{setStatus('disconnected');}
 },[]);
 const fetchContacts=useCallback(async(id:string)=>{try{const res=await fetch('/api/chats/'+encodeURIComponent(id)+'/contacts',{headers:headers()});if(res.ok&&activeChat.current===id)setContacts(await res.json());}catch{}},[]);
 const fetchData=useCallback(async(id:string)=>{
  const request=++version.current;
  try{
   const [a,b]=await Promise.all([fetch('/api/chats/'+encodeURIComponent(id)+'/messages',{headers:headers()}),fetch('/api/chats/'+encodeURIComponent(id)+'/tasks',{headers:headers()})]);
   if(!a.ok||!b.ok)throw new Error('Mesajlar veya görevler alınamadı; yeniden denenecek.');
   const [messageData,taskData]=await Promise.all([a.json(),b.json()]);
   if(activeChat.current!==id||version.current!==request)return;
   setMessages(previous=>merge(previous,messageData.messages||messageData));setTasks(taskData);
   setHasMore(previous=>previous||!!messageData.hasMore);setError('');
  }catch(e:any){if(activeChat.current===id)setError(e.message);}
 },[]);
 const selectChat=useCallback((id:string)=>{
  const socket=getSocket();if(activeChat.current)socket.emit('leave_chat',activeChat.current);
  activeChat.current=id;version.current++;setSelected(id);setView('chat');setMessages([]);setTasks([]);setContacts([]);setHasMore(false);setNotice(null);
  socket.emit('join_chat',id);void fetchData(id);void fetchContacts(id);
 },[fetchData,fetchContacts]);
 useEffect(()=>{
  const token=localStorage.getItem('mywa_token');if(!token){router.push('/login');return;}
  let closed=false;
  void fetch('/api/auth/me',{headers:headers()}).then(async res=>{
   if(res.status===401){disconnectSocket();localStorage.removeItem('mywa_token');router.push('/login');return;}
   if(!res.ok)throw new Error('Oturum doğrulanamadı. Yeniden deneyin.');
   const user=await res.json();if(!closed){setAdmin(user.role==='ADMIN');setAuthenticated(true);}
  }).catch(e=>setError(e.message));
  const socket=getSocket();socket.auth={token};
  const refresh=()=>{setSocketOnline(socket.connected);void fetchChats();void fetchStatus();if(activeChat.current){socket.emit('join_chat',activeChat.current);void fetchData(activeChat.current);void fetchContacts(activeChat.current);}};
  const disconnected=()=>setSocketOnline(false);
  const onMessage=(m:any)=>{if(m.chatId===activeChat.current)setMessages(prev=>merge(prev,[m]));};
  const onUpdated=(m:any)=>{if(m.chatId===activeChat.current){setMessages(prev=>prev.map(old=>old.id===m.id?{...old,...m}:old));void fetchData(m.chatId);}};
  const onChat=()=>void fetchChats();
  const onTask=()=>{if(activeChat.current)void fetchData(activeChat.current);};
  const onStatus=(data:any)=>{setStatus(data.status||data);setQr(data.qr||'');if(data.myJid)setMyJid(data.myJid);};
  const onArrived=(m:any)=>{
   if(m.isFromMe||notified.current.has(m.id)||Date.now()-Date.parse(m.timestamp)>300000)return;
   notified.current.add(m.id);
   if(activeChat.current===m.chatId&&document.visibilityState==='visible'&&document.hasFocus())return;
   const title=chatRef.current.find(c=>c.id===m.chatId)?.name||'Yeni WhatsApp mesajı';
   setNotice({...m,title});
   if('Notification' in window&&Notification.permission==='granted'){
    const notification=new Notification(title,{body:m.body||'Yeni medya iletisi',tag:m.id});
    notification.onclick=()=>{window.focus();selectChat(m.chatId);notification.close();};
   }
  };
  socket.on('connect',refresh);socket.on('disconnect',disconnected);socket.on('new_message',onMessage);socket.on('message_updated',onUpdated);socket.on('message_arrived',onArrived);socket.on('chat_updated',onChat);socket.on('notification_updated',onTask);socket.on('task_created',onTask);socket.on('task_updated',onTask);socket.on('task_deleted',onTask);socket.on('whatsapp_status',onStatus);
  socket.connect();refresh();
  const focus=()=>refresh();window.addEventListener('focus',focus);
  const interval=setInterval(()=>{void fetchChats();void fetchStatus();if(activeChat.current)void fetchData(activeChat.current);},10000);
  return ()=>{closed=true;clearInterval(interval);window.removeEventListener('focus',focus);socket.off('connect',refresh);socket.off('disconnect',disconnected);socket.off('new_message',onMessage);socket.off('message_updated',onUpdated);socket.off('message_arrived',onArrived);socket.off('chat_updated',onChat);socket.off('notification_updated',onTask);socket.off('task_created',onTask);socket.off('task_updated',onTask);socket.off('task_deleted',onTask);socket.off('whatsapp_status',onStatus);};
 },[router,fetchChats,fetchStatus,fetchData,fetchContacts,selectChat]);
 useEffect(()=>{const count=chats.reduce((sum,c)=>sum+(c.unreadCount||0),0);document.title=(count?'('+count+') ':'')+'MyWA';},[chats]);
 const read=useCallback(async(ids:string[])=>{
  const id=activeChat.current;if(!id)return false;
  try{const res=await fetch('/api/chats/'+encodeURIComponent(id)+'/read',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({messageIds:ids})});if(res.ok)void fetchChats();return res.ok;}catch{return false;}
 },[fetchChats]);
 const older=async()=>{
  const id=activeChat.current,before=messages[0]?.id,request=version.current;if(!id||!before||loadingOlder)return;
  setLoadingOlder(true);
  try{
   const res=await fetch('/api/chats/'+encodeURIComponent(id)+'/messages?before='+encodeURIComponent(before),{headers:headers()});if(!res.ok)throw new Error('Önceki mesajlar alınamadı.');
   const data=await res.json();if(activeChat.current===id&&request===version.current){setMessages(prev=>merge(prev,data.messages));setHasMore(data.hasMore);}
  }catch(e:any){setError(e.message);}finally{setLoadingOlder(false);}
 };
 const enableNotifications=async()=>{
  if(!('Notification' in window)||!window.isSecureContext){setNotificationHint('Masaüstü bildirimleri için paneli HTTPS üzerinden açın. Okunmamış sayıları panelde gösterilmeye devam eder.');return;}
  const permission=await Notification.requestPermission();setNotificationHint(permission==='granted'?'Masaüstü bildirimleri açık.':'Tarayıcı bildirim izni vermedi; site izinlerini kontrol edin.');
 };
 const resync=async()=>{try{const res=await fetch('/api/whatsapp/sync',{method:'POST',headers:headers()});if(!res.ok)throw new Error();void fetchStatus();}catch{setError('Geçmiş eşitlemesi başlatılamadı.');}};
 const currentChat=chats.find(c=>c.id===selected),connected=['connected','ready'].includes(status);
 if(!authenticated)return <div className="p-8 text-[#111b21]">{error||'Yükleniyor…'}{error&&<button className="ml-3 underline" onClick={()=>window.location.reload()}>Yeniden dene</button>}</div>;
 return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white text-[#111b21]">
  <header className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 border-b border-[#e9edef] bg-[#f7f8fa] px-4">
   <span className="text-[16px] font-bold text-[#008069]">MyWA</span>
   <div className="flex items-center gap-2">
    <div className="hidden xl:flex"><ReminderButton type="overdue"/><ReminderButton type="summary"/></div>
    <button title="Gönderim durumları" onClick={()=>setShowNotifications(true)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#54656f] hover:bg-[#e9edef]">Gönderimler</button>
    <button disabled={!admin} onClick={()=>setShowQr(true)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[#54656f]" title="WhatsApp bağlantısı"><span className={'h-2 w-2 rounded-full '+(connected?'bg-[#25d366]':'bg-amber-500')}/><Smartphone size={17}/><span className="hidden sm:inline">{connected?'WhatsApp bağlı':status==='disconnected'?'WhatsApp bağlantısı yok':'WhatsApp bağlanıyor'}</span></button>
   </div>
  </header>
  {!bannerDismissed&&(!socketOnline||!connected||error||notificationHint)&&<div role="status" className="flex flex-wrap items-center gap-3 border-b border-[#edd8a3] bg-[#fff7dd] px-4 py-2 text-[13px] text-[#66542c]">{!socketOnline?'Panel bağlantısı kesildi; yeniden bağlanılıyor. ':!connected?'WhatsApp çevrimdışı. Gönderimler kuyrukta bekliyor. ':''}{error||notificationHint}<button onClick={()=>{setError('');setNotificationHint('');setBannerDismissed(true);}} aria-label="Uyarıyı kapat" className="ml-auto"><X size={16}/></button></div>}
  <div className="flex min-h-0 flex-1">
   <nav className="hidden w-[64px] shrink-0 flex-col items-center gap-5 border-r border-[#e9edef] bg-[#f0f2f5] py-5 sm:flex">
    <button onClick={()=>setView('chat')} title="Sohbetler" aria-label="Sohbetler" className={'rounded-full p-3 '+(view==='chat'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f]')}><MessageCircle size={23}/></button>
    <button onClick={()=>setView('kanban')} title="Kanban" aria-label="Kanban" className={'rounded-full p-3 '+(view==='kanban'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f]')}><LayoutDashboard size={23}/></button>
    <button onClick={()=>void enableNotifications()} title="Masaüstü bildirimlerini aç" aria-label="Masaüstü bildirimlerini aç" className="rounded-full p-3 text-[#54656f] hover:bg-[#e9edef]"><Bell size={23}/></button>
    <button onClick={()=>{disconnectSocket();localStorage.removeItem('mywa_token');router.push('/login');}} title="Çıkış" aria-label="Çıkış" className="mt-auto p-3 text-[#54656f]"><LogOut size={23}/></button>
   </nav>
   {view==='chat'?<>
    <aside className={'shrink-0 border-r border-[#e9edef] md:block md:w-[340px] lg:w-[380px] xl:w-[420px] '+(selected?'hidden':'w-full')}><ChatList chats={chats} selectedChatId={selected} onSelectChat={selectChat} myJid={myJid}/></aside>
    <main className={'relative min-w-0 flex-1 '+(!selected?'hidden md:block':'')}>
     {selected?<ChatWindow key={selected} chatId={selected} chatName={currentChat?.name} avatarUrl={currentChat?.avatarUrl} messages={messages} contacts={contacts} myJid={myJid} hasMore={hasMore} loadingOlder={loadingOlder} onLoadOlder={older} onRead={read} tasksOpen={showTasks} taskCount={tasks.filter(t=>t.status!=='DONE').length} onToggleTasks={()=>setShowTasks(!showTasks)} onBack={()=>{activeChat.current=null;setSelected(null);}}/>:<div className="flex h-full flex-col items-center justify-center bg-[#f7f8fa] px-10 text-center"><MessageCircle size={64} strokeWidth={1} className="text-[#00a884]"/><h2 className="mt-6 text-[28px] font-light">MyWA</h2><p className="mt-3 max-w-sm text-[14px] leading-6 text-[#667781]">Sohbetlerinizi ve görevlerinizi tek panelden takip edin.<br/>Başlamak için bir sohbet seçin.</p>{sync?.roundUntil&&<p className="mt-5 text-xs text-[#667781]">WhatsApp geçmişi eşitleniyor…</p>}</div>}
     {notice&&<button onClick={()=>selectChat(notice.chatId)} className="absolute right-5 top-5 z-20 max-w-xs rounded-xl border border-[#d9fdd3] bg-white p-4 text-left shadow-lg"><p className="text-sm font-semibold text-[#008069]">{notice.title}</p><p className="mt-1 line-clamp-2 text-[13px] text-[#667781]">{notice.body||'Yeni medya iletisi'}</p></button>}
    </main>
    {showTasks&&selected&&<aside className="absolute bottom-0 right-0 top-12 z-30 w-[350px] border-l border-[#e9edef] bg-white shadow-xl xl:static xl:shadow-none"><button className="absolute right-3 top-[-3px] z-10 rounded-full bg-white p-1 text-[#54656f]" onClick={()=>setShowTasks(false)} aria-label="Görev panelini kapat"><X size={17}/></button><TaskSidebar chatId={selected} tasks={tasks} contacts={contacts} onRefresh={()=>void fetchData(selected)}/></aside>}
   </>:<main className="min-w-0 flex-1 overflow-auto bg-[#f7f8fa]"><KanbanBoard/></main>}
  </div>
  {showNotifications&&<NotificationsPanel onClose={()=>setShowNotifications(false)}/>}
  {admin&&<QRConnectModal isOpen={showQr} onClose={()=>setShowQr(false)} qrCode={qr} status={status}/>}
 </div>;
}
