'use client';
import { useState } from 'react';
import { Search, Users, Image as ImageIcon, Video, Mic, FileText } from 'lucide-react';
import { cn, formatTime } from '../../lib/utils';
export default function ChatList({chats,selectedChatId,onSelectChat,myJid}:{chats:any[];selectedChatId:string|null;onSelectChat:(id:string)=>void;myJid?:string}) {
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<'all'|'unread'|'groups'>('all');
 const list=(Array.isArray(chats)?chats:[]).filter(c=>(c.name||c.id||'').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))&&(filter!=='unread'||c.unreadCount>0)&&(filter!=='groups'||c.isGroup)).sort((a,b)=>Date.parse(b.lastMessage?.timestamp||b.updatedAt)-Date.parse(a.lastMessage?.timestamp||a.updatedAt));
 const unreadChats=chats.filter(c=>c.unreadCount>0).length;
 return <div className="flex h-full flex-col bg-white">
  <div className="px-5 pb-4 pt-6"><h1 className="mb-5 text-[23px] font-bold tracking-tight text-[#111b21]">Sohbetler</h1>
   <div className="relative"><Search size={18} className="absolute left-4 top-3 text-[#667781]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Aratın veya yeni sohbet başlatın" aria-label="Sohbet ara" className="w-full rounded-full bg-[#f0f2f5] py-2.5 pl-12 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-[#d9fdd3]"/></div>
   <div className="mt-3 flex gap-2">{([['all','Tümü'],['unread','Okunmamış'+(unreadChats?' '+unreadChats:'')],['groups','Gruplar']] as const).map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={cn('rounded-full border px-3 py-1.5 text-[13px]',filter===id?'border-[#b2ddb0] bg-[#d9fdd3] text-[#008069]':'border-[#e1e5e8] text-[#667781] hover:bg-[#f5f6f6]')}>{label}</button>)}</div>
  </div>
  <div className="flex-1 overflow-y-auto px-2 pb-2">
   {!list.length && <p className="p-6 text-center text-sm text-[#667781]">{search?'Sohbet bulunamadı.':'Görüntülenecek sohbet yok.'}</p>}
   {list.map(chat=>{
    const group=chat.isGroup||chat.id.endsWith('@g.us');
    const self=!group && myJid?.split('@')[0]===chat.id.split('@')[0];
    const name=(chat.name&&!chat.name.includes('@')?chat.name:chat.id.split('@')[0])+(self?' (Siz)':'');
    const msg=chat.lastMessage;
    const preview=msg?.revoked?'Bu mesaj silindi':msg?.body||({IMAGE:'Fotoğraf',VIDEO:'Video',AUDIO:'Sesli mesaj',DOCUMENT:'Belge',STICKER:'Çıkartma'} as any)[msg?.messageType]||'Henüz mesaj yok';
    const Icon=msg?.messageType==='IMAGE'?ImageIcon:msg?.messageType==='VIDEO'?Video:msg?.messageType==='AUDIO'?Mic:msg?.messageType==='DOCUMENT'?FileText:null;
    return <button key={chat.id} onClick={()=>onSelectChat(chat.id)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left hover:bg-[#f5f6f6]',selectedChatId===chat.id&&'bg-[#f0f2f5]')}>
     <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9edef] text-sm font-medium text-[#667781]">{chat.avatarUrl?<img src={chat.avatarUrl} alt="" className="h-full w-full object-cover" onError={e=>{e.currentTarget.style.display='none';}}/>:group?<Users size={23}/>:name.slice(0,2).toUpperCase()}</div>
     <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className={cn('flex-1 truncate text-[16px] leading-6',chat.unreadCount?'font-semibold':'font-normal')}>{name}</h2><time className={cn('shrink-0 text-[11px]',chat.unreadCount?'text-[#00a884]':'text-[#667781]')}>{formatTime(msg?.timestamp||chat.updatedAt)}</time></div>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[#667781]">{Icon&&<Icon size={15} className="shrink-0"/>}<p className="flex-1 truncate">{msg?.isFromMe?'Siz: ':''}{preview}</p>{chat.unreadCount>0&&<span aria-label={chat.unreadCount+' okunmamış mesaj'} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">{chat.unreadCount}</span>}</div>
     </div>
    </button>;
   })}
  </div>
 </div>;
}
