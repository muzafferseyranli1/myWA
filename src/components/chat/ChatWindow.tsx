'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Send, Users, Smile, ArrowDown, ListTodo, ArrowLeft } from 'lucide-react';
import MessageBubble from './MessageBubble';
import CreateTaskModal from '../task/CreateTaskModal';
import { getSocket } from '../../lib/socket';
import { newClientId } from '../../lib/client-id';
interface Props {chatId:string;chatName?:string;avatarUrl?:string;messages:any[];contacts?:any[];myJid?:string;hasMore?:boolean;loadingOlder?:boolean;onLoadOlder?:()=>Promise<void>;onRead?:(ids:string[])=>Promise<boolean>;onToggleTasks?:()=>void;onBack?:()=>void;tasksOpen?:boolean;taskCount?:number;}
export default function ChatWindow({chatId,chatName,avatarUrl,messages,contacts=[],myJid='',hasMore,loadingOlder,onLoadOlder,onRead,onToggleTasks,onBack,tasksOpen,taskCount=0}:Props) {
 const pending=useRef<{id:string;text:string}|null>(null);
 const [input,setInput]=useState(''),[sending,setSending]=useState(false),[sendStatus,setSendStatus]=useState(''),[emojiOpen,setEmojiOpen]=useState(false);
 const [taskMessage,setTaskMessage]=useState<any>(null),[nearBottom,setNearBottom]=useState(true),[newCount,setNewCount]=useState(0);
 const scroller=useRef<HTMLDivElement>(null),initial=useRef(true),previousLast=useRef<string|null>(null);
 const seen=useRef(new Set<string>()),visible=useRef(new Set<string>()),readPending=useRef(false);
 const list=useMemo(()=>Array.isArray(messages)?messages:[],[messages]);
 const name=(chatName&&!chatName.includes('@')?chatName:chatId.split('@')[0])+(myJid?.split('@')[0]===chatId.split('@')[0]?' (Siz)':'');
 const bottom=useCallback((smooth=false)=>{const el=scroller.current;if(el) el.scrollTo({top:el.scrollHeight,behavior:smooth?'smooth':'auto'});setNewCount(0);},[]);
 useEffect(()=>{
  const last=list.at(-1)?.id;
  if(!last) return;
  if(initial.current){bottom();initial.current=false;}
  else if(previousLast.current!==last){if(nearBottom) bottom(true);else setNewCount(n=>n+1);}
  previousLast.current=last;
 },[list,nearBottom,bottom]);
 useEffect(()=>{
  const root=scroller.current; const currentVisible=visible.current; if(!root || !onRead) return;
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=(entry.target as HTMLElement).dataset.messageId!;if(entry.isIntersecting) currentVisible.add(id);else currentVisible.delete(id);}},{root,threshold:0.25});
  root.querySelectorAll('[data-incoming="true"]').forEach(el=>observer.observe(el));
  const flush=async()=>{
   if(document.visibilityState!=='visible'||!document.hasFocus()||readPending.current) return;
   const ids=[...currentVisible].filter(id=>!seen.current.has(id)).slice(0,100);if(!ids.length) return;
   readPending.current=true;
   try {if(await onRead(ids)) ids.forEach(id=>seen.current.add(id));} finally{readPending.current=false;}
  };
  const timer=setInterval(()=>void flush(),1000);
  return ()=>{observer.disconnect();clearInterval(timer);currentVisible.clear();};
 },[list,onRead]);
 const loadOlder=async()=>{
  const el=scroller.current;if(!el||!onLoadOlder||loadingOlder) return;
  const height=el.scrollHeight,top=el.scrollTop;
  await onLoadOlder();
  requestAnimationFrame(()=>{if(scroller.current) scroller.current.scrollTop=top+scroller.current.scrollHeight-height;});
 };
 const send=()=>{
  if(!input.trim()||sending) return;
  const socket=getSocket();if(!socket.connected){setSendStatus('Sunucu bağlantısı yok; mesaj yazınız korunuyor.');return;}
  const text=input.trim();if(pending.current?.text!==text) pending.current={id:newClientId(),text};
  setSending(true);setSendStatus('Kaydediliyor…');
  socket.timeout(15000).emit('send_message',{chatId,body:text,clientMessageId:pending.current.id},(error:Error|null,result:any)=>{
   setSending(false);if(error||!result?.success){setSendStatus(result?.error||'Kayıt doğrulanamadı. Aynı mesajı güvenle tekrar deneyebilirsiniz.');return;}
   pending.current=null;setInput('');setSendStatus('Mesaj kaydedildi; WhatsApp gönderimi bekliyor.');
  });
 };
 return <div className="relative flex h-full min-w-0 flex-col">
  <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-[#e9edef] bg-white px-5">
   <button onClick={onBack} className="md:hidden" aria-label="Sohbetlere dön"><ArrowLeft size={22}/></button>
   <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9edef] text-[#667781]">{avatarUrl?<img src={avatarUrl} alt="" className="h-full w-full object-cover"/>:chatId.endsWith('@g.us')?<Users size={22}/>:name.slice(0,2).toUpperCase()}</div>
   <div className="min-w-0 flex-1"><h2 className="truncate text-[16px] font-medium">{name}</h2><p className="truncate text-[12px] text-[#667781]">{chatId.endsWith('@g.us')?(contacts.length?contacts.slice(0,8).map(c=>c.displayName||c.pushName||c.phoneNumber).join(', '):'Grup sohbeti'):'WhatsApp sohbeti'}</p></div>
   <button onClick={onToggleTasks} aria-pressed={tasksOpen} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-[#667781] hover:bg-[#f0f2f5]" title="Sohbet görevleri"><ListTodo size={22}/><span className="hidden lg:inline">Görevler{taskCount?' '+taskCount:''}</span></button>
  </header>
  <div ref={scroller} onScroll={()=>{const el=scroller.current;if(el){const near=el.scrollHeight-el.scrollTop-el.clientHeight<100;setNearBottom(near);if(near)setNewCount(0);}}} className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 lg:px-[6%]">
   {hasMore && <div className="mb-4 text-center"><button disabled={loadingOlder} onClick={()=>void loadOlder()} className="rounded-lg bg-white px-4 py-2 text-sm text-[#008069] shadow-sm">{loadingOlder?'Yükleniyor…':'Önceki mesajları yükle'}</button></div>}
   {!list.length && <p className="mx-auto mt-12 w-fit rounded-lg bg-white/90 px-5 py-3 text-sm text-[#667781]">Bu sohbette henüz kayıtlı mesaj yok.</p>}
   {list.map((message,index)=>{
    const date=new Date(message.timestamp).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
    const previous=index?new Date(list[index-1].timestamp).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):null;
    return <div key={message.id} className="flex flex-col">{date!==previous&&<div className="my-4 self-center rounded-lg bg-white/90 px-3 py-1.5 text-[12px] text-[#54656f] shadow-sm">{date}</div>}<MessageBubble message={message} isOwn={!!message.isFromMe} contacts={contacts} onCreateTask={()=>setTaskMessage({...message,senderName:message.senderName||message.sender?.displayName||message.sender?.pushName})}/></div>;
   })}
  </div>
  {!nearBottom&&<button onClick={()=>bottom(true)} className="absolute bottom-24 right-5 flex items-center gap-2 rounded-full bg-white p-3 text-[#667781] shadow-lg" aria-label="Son mesajlara git">{newCount>0&&<span className="text-xs font-semibold text-[#008069]">{newCount} yeni mesaj</span>}<ArrowDown size={22}/></button>}
  {sendStatus&&<p role="status" className="bg-[#f0f2f5] px-6 pt-2 text-[12px] text-[#667781]">{sendStatus}</p>}
  <div className="relative flex min-h-[72px] shrink-0 items-end gap-3 bg-[#f0f2f5] px-4 py-3">
   <button onClick={()=>setEmojiOpen(!emojiOpen)} aria-label="Emoji ekle" className="mb-2 text-[#54656f]"><Smile size={25}/></button>
   {emojiOpen&&<div className="absolute bottom-20 left-4 flex gap-2 rounded-xl border bg-white p-3 shadow-lg">{['😊','👍','❤️','🙏','✅','🎉','😂'].map(emoji=><button key={emoji} className="text-2xl" onClick={()=>{setInput(t=>t+emoji);setEmojiOpen(false);}}>{emoji}</button>)}</div>}
   <textarea value={input} disabled={sending} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} rows={1} placeholder="Bir mesaj yazın" aria-label="Mesaj" className="max-h-36 min-h-[46px] flex-1 resize-none rounded-2xl bg-white px-4 py-3 text-[15px] leading-5 outline-none focus:ring-1 focus:ring-[#c5e5c1]"/>
   <button disabled={sending||!input.trim()} onClick={send} aria-label="Mesajı gönder" className="mb-2 p-1 text-[#008069] disabled:opacity-40"><Send size={25}/></button>
  </div>
  {!!taskMessage&&<CreateTaskModal isOpen onClose={()=>setTaskMessage(null)} chatId={chatId} sourceMessage={taskMessage} contacts={contacts}/>}
 </div>;
}
