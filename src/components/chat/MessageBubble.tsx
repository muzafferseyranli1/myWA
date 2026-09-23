'use client';
import { useState } from 'react';
import { FileText, Check, CheckCheck, Clock, Pin, RefreshCw, ExternalLink } from 'lucide-react';
import { cn, formatTime } from '../../lib/utils';
import { tokenizeMessage } from '../../lib/message-text';
function nameOf(id:string,contacts:any[]) {
 const raw=id?.replace(/^@/,'').split('@')[0];
 const found=contacts.find(c=>[c.id,c.lidId,c.phoneNumber,c.mappedJid].some(value=>value?.split('@')[0]===raw));
 return found?.displayName || found?.pushName || raw;
}
function Body({text,contacts}:{text:string;contacts:any[]}) {
 return <>{tokenizeMessage(text).map((part,i)=>{
  if(part.kind==='link') return <a key={i} href={part.text} target="_blank" rel="noopener noreferrer" className="text-[#027eb5] underline decoration-1 underline-offset-2">{part.text}</a>;
  if(part.kind==='bold') return <strong key={i}>{part.text}</strong>;
  if(part.kind==='italic') return <em key={i}>{part.text}</em>;
  if(part.kind==='strike') return <s key={i}>{part.text}</s>;
  if(part.kind==='code') return <code key={i} className="rounded bg-black/5 px-1 text-[14px]">{part.text}</code>;
  if(part.kind==='mention') return <span key={i} title={part.text} className="font-semibold text-[#008069]">@{nameOf(part.text,contacts)}</span>;
  return part.text;
 })}</>;
}
export default function MessageBubble({message,isOwn,onCreateTask,contacts=[]}:{message:any;isOwn:boolean;onCreateTask:()=>void;contacts?:any[]}) {
 const [mediaError,setMediaError]=useState(false),[revision,setRevision]=useState(0),[zoom,setZoom]=useState(false);
 const sender=message.senderName || message.sender?.displayName || message.sender?.pushName || nameOf(message.senderId,contacts);
 const media=message.mediaUrl && message.mediaUrl+(message.mediaUrl.includes('?')?'&':'?')+'v='+revision;
 const image=['IMAGE','STICKER'].includes(message.messageType);
 const reactions=(message.reactions || []).filter((r:any)=>r.text);
 return <div data-message-id={message.id} data-incoming={isOwn?'false':'true'} className={cn('message-bubble group relative mb-1 max-w-[85%] rounded-lg px-3 py-2 text-[#111b21] shadow-sm sm:max-w-[75%] lg:max-w-[68%]',isOwn?'self-end bg-[#d9fdd3] bubble-out':'self-start bg-white bubble-in')}>
  {!isOwn && sender && <p className="mb-1 text-[13px] font-semibold text-[#008069]">{sender}</p>}
  {!message.revoked && message.quotedText && <div className="mb-2 rounded border-l-[3px] border-[#06cf9c] bg-black/[0.04] px-3 py-2">
   <p className="text-[13px] font-semibold text-[#008069]">{message.quotedSender?nameOf(message.quotedSender,contacts):'İleti'}</p>
   <p className="line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-[#667781]">{message.quotedText}</p>
  </div>}
  {message.revoked ? <p className="italic text-[#667781]">Bu mesaj silindi.</p> : <>
   {media && <div className="mb-1">
    {mediaError ? <button className="flex items-center gap-2 rounded bg-black/5 p-3 text-sm" onClick={()=>{setMediaError(false);setRevision(v=>v+1);}}><RefreshCw size={16}/> Medya alınamadı. Yeniden dene</button> : image ? <button className="block" onClick={()=>setZoom(true)} aria-label="Fotoğrafı büyüt"><img key={revision} src={media} alt={message.mediaName || 'Fotoğraf'} loading="lazy" onError={()=>setMediaError(true)} className={cn('max-h-[360px] max-w-full rounded object-contain',message.messageType==='STICKER'?'h-40 w-40':'min-w-[200px]')}/></button> : message.messageType==='VIDEO' ? <video key={revision} src={media} controls preload="metadata" onError={()=>setMediaError(true)} className="max-h-[360px] max-w-full rounded"/> : message.messageType==='AUDIO' ? <audio key={revision} src={media} controls preload="metadata" onError={()=>setMediaError(true)} className="max-w-full"/> : <a href={media} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded bg-black/5 p-4"><FileText size={30} className="text-[#667781]"/><span className="break-all text-sm">{message.mediaName || 'Belgeyi aç'}</span><ExternalLink size={16}/></a>}
   </div>}
   {message.preview?.url && /^https?:\/\//.test(message.preview.url) && <a href={message.preview.url} target="_blank" rel="noopener noreferrer" className="mb-2 block overflow-hidden rounded-lg bg-black/[0.04]">
    {message.preview.thumbnail&&<img src={'data:image/jpeg;base64,'+message.preview.thumbnail} alt="" loading="lazy" className="max-h-52 w-full object-cover" onError={e=>{e.currentTarget.style.display='none';}}/>}
    <div className="p-3"><p className="text-[14px] font-medium">{message.preview.title||message.preview.url}</p><p className="mt-1 line-clamp-2 text-[12px] text-[#667781]">{message.preview.description}</p></div>
   </a>}
   {message.body ? <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.45]"><Body text={message.body} contacts={contacts}/></div> : !media && <p className="text-sm italic text-[#667781]">Metin içermeyen WhatsApp iletisi</p>}
  </>}
  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
   {/* Touch screens have no hover, so the task action sits in the footer there. */}
   <button onClick={onCreateTask} title="Mesajdan görev oluştur" aria-label="Mesajdan görev oluştur" className="mr-auto hidden items-center gap-1 rounded-full px-1.5 py-0.5 text-[#008069] [@media(hover:none)]:inline-flex"><Pin size={13}/>Görev</button>
   {message.editedAt && <span>düzenlendi</span>}<span>{formatTime(message.timestamp)}</span>
   {isOwn && (message.ack>=2?<CheckCheck size={16} className={message.ack>=3?'text-[#53bdeb]':''}/>:message.ack===1?<Check size={16}/>:<Clock size={13}/>)}
  </div>
  {!!reactions.length && <div className="mt-1 flex flex-wrap gap-1">{reactions.map((r:any)=><span key={r.senderId} title={nameOf(r.senderId,contacts)} className="rounded-full border border-[#e9edef] bg-white px-2 py-0.5 text-sm">{r.text}</span>)}</div>}
  <button onClick={onCreateTask} title="Mesajdan görev oluştur" className="absolute right-1 top-1 rounded-full border border-[#e9edef] bg-white p-1.5 text-[#667781] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:hidden"><Pin size={15}/></button>
  {message.task && <div className="mt-2 border-t border-black/10 pt-2 text-xs text-[#008069]">Görev: {message.task.title}</div>}
  {zoom && <div role="dialog" aria-label="Fotoğraf" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-3 sm:p-6" onClick={()=>setZoom(false)}><button className="absolute right-3 top-3 rounded bg-white px-4 py-2 text-black sm:right-6 sm:top-4">Kapat</button><img src={media} alt={message.mediaName || 'Fotoğraf'} className="max-h-[85vh] max-w-full object-contain"/></div>}
 </div>;
}
