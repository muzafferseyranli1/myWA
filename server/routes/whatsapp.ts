import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';

const router = Router();

router.get('/status', (req, res) => {
  res.json(whatsappService.getStatus());
});

router.post('/connect', async (req, res) => {
  try {
    await whatsappService.initialize();
    res.json({ success: true, status: 'connecting' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, status: 'disconnected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
