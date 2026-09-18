import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { taskService } from '../services/task.service';
import { messageService } from '../services/message.service';
import { requireAuth } from '../middleware/auth';
import { contactResolver } from '../services/contact-resolver.service';
const router=Router();
router.use(requireAuth);
router.get('/',async(req,res)=>{
 try{
  const chats=await prisma.chat.findMany({orderBy:{updatedAt:'desc'},include:{_count:{select:{tasks:true}},messages:{orderBy:[{timestamp:'desc'},{id:'desc'}],take:1}}});
  const counts=await prisma.$queryRaw<{chat_id:string;count:bigint}[]>`SELECT m.chat_id,COUNT(*) AS count FROM messages m LEFT JOIN message_reads r ON r.message_id=m.id AND r.user_id=${(req as any).user.id} WHERE m.is_from_me=false AND m.revoked=false AND r.message_id IS NULL GROUP BY m.chat_id`;
  const unread=new Map(counts.map(row=>[row.chat_id,Number(row.count)]));
  res.json(chats.map(chat=>{
   const {messages,...rest}=chat;
   const resolved=contactResolver.getDisplayNameSync(chat.id);
   const name=!chat.isGroup&&resolved&&!resolved.includes('@')&&!/^\d+$/.test(resolved)?resolved:chat.name;
   return {...rest,name,unreadCount:unread.get(chat.id)||0,lastMessage:messages[0]?{...messages[0],mediaUrl:null}:null};
  }));
 }catch{res.status(500).json({error:'Sohbetler alınamadı.'});}
});
router.get('/:chatId/messages',async(req,res)=>{
 try{
  const page=Math.max(1,parseInt(req.query.page as string)||1),limit=Math.max(1,Math.min(100,parseInt(req.query.limit as string)||50));
  const result=await messageService.getMessagesByChat(req.params.chatId as string,page,limit,typeof req.query.before==='string'?req.query.before:undefined);
  const reactions=await prisma.messageReaction.findMany({where:{messageId:{in:result.messages.map(m=>m.id)}}});
  res.json({...result,messages:result.messages.map(m=>({...m,reactions:reactions.filter(r=>r.messageId===m.id)}))});
 }catch{res.status(500).json({error:'Mesajlar alınamadı.'});}
});
router.post('/read-all', async (req: any, res) => {
  try {
    const userId = req.user.id;
    await prisma.$executeRaw`
      INSERT INTO message_reads (user_id, message_id, read_at)
      SELECT ${userId}, m.id, NOW()
      FROM messages m
      LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ${userId}
      WHERE m.is_from_me = false AND m.revoked = false AND r.message_id IS NULL
      ON CONFLICT DO NOTHING
    `;
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Okundu işaretlenemedi.' });
  }
});
router.post('/:chatId/read', async (req: any, res) => {
  const chatId = req.params.chatId as string;
  const userId = req.user.id;
  const ids = req.body?.messageIds;
  const markAll = req.body?.all === true || !ids;

  try {
    if (markAll) {
      await prisma.$executeRaw`
        INSERT INTO message_reads (user_id, message_id, read_at)
        SELECT ${userId}, m.id, NOW()
        FROM messages m
        LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ${userId}
        WHERE m.chat_id = ${chatId} AND m.is_from_me = false AND m.revoked = false AND r.message_id IS NULL
        ON CONFLICT DO NOTHING
      `;
      return res.json({ success: true });
    }

    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Invalid message IDs' });
    }

    const messages = await prisma.message.findMany({ where: { chatId, id: { in: ids }, isFromMe: false }, select: { id: true } });
    await prisma.messageRead.createMany({ data: messages.map(m => ({ userId, messageId: m.id })), skipDuplicates: true });
    res.json({ success: true });
  } catch {
    res.status(503).json({ error: 'Okunma kaydedilemedi.' });
  }
});
router.get('/:chatId/tasks',async(req,res)=>{
 try{res.json(await taskService.getTasksByChat(req.params.chatId as string));}catch{res.status(500).json({error:'Görevler alınamadı.'});}
});
router.get('/:chatId/contacts',async(req,res)=>{
 try{
  const chatId=req.params.chatId as string;
  const participants=await prisma.groupParticipant.findMany({where:{chatId},include:{contact:true}});
  let contacts=participants.map(p=>({...p.contact,role:p.role}));
  if(!contacts.length){
   const senders=await prisma.message.findMany({where:{chatId,senderId:{not:null}},select:{senderId:true},distinct:['senderId']});
   contacts=(await prisma.contact.findMany({where:{id:{in:senders.map(s=>s.senderId!).filter(Boolean)}}})).map(c=>({...c,role:'member'}));
  }
  res.json(contacts.map(c=>{
   const mappedJid=c.id.endsWith('@lid')?contactResolver.resolveToMentionJid(c.id):null;
   const name=c.displayName||c.pushName||contactResolver.getDisplayNameSync(c.id);
   return {...c,pushName:name||c.pushName,displayName:c.displayName||name,mappedJid,lidId:c.lidId||(c.id.endsWith('@lid')?c.id:null)};
  }));
 }catch{res.status(500).json({error:'Kişiler alınamadı.'});}
});
export default router;
