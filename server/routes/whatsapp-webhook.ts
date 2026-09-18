import { Router, raw } from 'express';
import { acceptEvent } from '../services/delivery.service';
import { verifySignature, eventKey, parseMessage } from '../lib/reliability';
const router = Router();
router.post('/', raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.headers['x-webhook-hmac'], req.headers['x-webhook-hmac-algorithm'], process.env.WAHA_WEBHOOK_SECRET || '')) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  let body: any;
  try {
    body = JSON.parse(req.body.toString('utf8'));
    if (body.session !== (process.env.WAHA_SESSION_NAME || 'default')) return res.status(400).json({ error: 'Unexpected session' });
    if (!['message', 'message.any', 'message.ack', 'message.reaction', 'message.edited', 'message.revoked', 'call.received', 'call.accepted', 'call.rejected', 'session.status', 'state.change'].includes(body.event)) return res.json({ ignored: true });
    eventKey(body);
    if (['message','message.any'].includes(body.event)) parseMessage(body.payload);
    else if (body.event.startsWith('message') && !body.payload) throw new Error('Missing payload');
  } catch { return res.status(400).json({ error: 'Invalid event' }); }
  try { await acceptEvent(body); res.json({ received: true }); }
  catch { res.status(503).json({ error: 'Event storage unavailable; retry later' }); }
});
export default router;
