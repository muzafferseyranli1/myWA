import { Router, Request, Response } from 'express';
import { wahaService } from '../services/waha.service';
import { messageService } from '../services/message.service';
import { broadcastNewMessage } from '../sockets';

const router = Router();

/**
 * Handles webhook notifications dispatched by WAHA
 * POST /api/whatsapp/webhook
 */
router.post('/', async (req: Request, res: Response) => {
  // Always acknowledge immediately with 200 OK so WAHA does not retry
  res.status(200).json({ received: true });

  try {
    const { event, session, payload } = req.body || {};
    if (!event || !payload) return;

    // ── 1. Session Status Events ─────────────────────────────────────────────
    if (event === 'session.status' || event === 'state.change') {
      const wahaStatus = payload.status || payload.state;
      console.log(`[WAHA Webhook] Session "${session}" status changed to: ${wahaStatus}`);
      
      const updated = await wahaService.updateStatus();
      if (updated.status === 'connected') {
        // Auto-sync groups upon successful connection
        setTimeout(() => wahaService.syncAllGroups(), 1500);
      }
      return;
    }

    // ── 2. Message Events (inbound or outbound) ──────────────────────────────
    if (event === 'message' || event === 'message.any') {
      const isGroup = !!(payload.from?.endsWith('@g.us'));
      const fromMe = !!payload.fromMe;

      // Determine sender ID and phone
      let senderId: string;
      if (fromMe) {
        senderId = 'me';
      } else if (isGroup) {
        senderId = payload.participant || payload.author || payload.from;
      } else {
        senderId = payload.from;
      }

      const senderPhone = senderId !== 'me' ? senderId.split('@')[0] : '';
      const senderName = payload._data?.notifyName || payload.notifyName || payload._data?.pushname || undefined;

      // Determine Message Type
      let messageType = 'TEXT';
      if (payload.hasMedia || payload.media) {
        const mime = payload.media?.mimetype || '';
        if (mime.startsWith('image/')) messageType = 'IMAGE';
        else if (mime.startsWith('video/')) messageType = 'VIDEO';
        else if (mime.startsWith('audio/')) messageType = 'AUDIO';
        else messageType = 'DOCUMENT';
      }

      // Determine Quoted info if present
      const quotedMsg = payload.quotedMsg || payload._data?.quotedMsg;
      let quotedText: string | null = null;
      let quotedSender: string | null = null;
      if (quotedMsg) {
        quotedText = quotedMsg.body || (quotedMsg.caption ? quotedMsg.caption : null);
        quotedSender = quotedMsg.author ? quotedMsg.author.split('@')[0] : null;
      }

      // Normalize Timestamp
      let ts = Date.now();
      if (payload.timestamp) {
        ts = payload.timestamp > 1e11 ? payload.timestamp : payload.timestamp * 1000;
      }

      const parsedMsg = {
        id: payload.id,
        chatId: payload.from,
        chatName: isGroup ? undefined : (senderName || payload.from),
        isGroup,
        senderId,
        senderPhone,
        senderName,
        body: payload.body || '',
        quotedText,
        quotedSender,
        messageType,
        mediaUrl: payload.media?.url || null,
        mediaName: payload.media?.filename || null,
        mediaMime: payload.media?.mimetype || null,
        isFromMe: fromMe,
        timestamp: new Date(ts)
      };

      const saved = await messageService.saveMessage(parsedMsg);
      broadcastNewMessage(saved);

      // If it's a new group message and group name is missing or raw JID, fetch metadata
      if (isGroup) {
        wahaService.fetchAndSaveGroupMetadata(payload.from).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[WAHA Webhook] Processing error:', err);
  }
});

export default router;
