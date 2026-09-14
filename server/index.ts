import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import next from 'next';
import multer from 'multer';
import path from 'path';

import authRoutes from './routes/auth';
import chatRoutes from './routes/chats';
import taskRoutes from './routes/tasks';
import whatsappRoutes from './routes/whatsapp';

import { setupSockets, broadcastNewMessage, broadcastWhatsAppStatus } from './sockets';
import { whatsappService } from './services/whatsapp.service';
import { messageService } from './services/message.service';
import { reminderService } from './services/reminder.service';

// ── Env validation ───────────────────────────────────────────────────────────
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'];
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || '3060', 10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE || '50', 10);

// Allowed origins: comma-separated or '*'
const rawOrigins = process.env.ALLOWED_ORIGIN || '*';
const corsOrigins: string | string[] =
  rawOrigins === '*' ? '*' : rawOrigins.split(',').map((o) => o.trim());

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // ── Health check ─────────────────────────────────────────────────────────
  server.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── CORS middleware ───────────────────────────────────────────────────────
  server.use((req, res, nextFn) => {
    const origin = req.headers.origin || '';
    const isAllowed =
      corsOrigins === '*' ||
      (Array.isArray(corsOrigins) && corsOrigins.includes(origin));

    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    nextFn();
  });

  server.use(express.json());
  server.use(express.static('public'));

  // ── File uploads ──────────────────────────────────────────────────────────
  const upload = multer({
    dest: 'public/uploads/',
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  });
  server.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // ── Mount APIs ────────────────────────────────────────────────────────────
  server.use('/api/auth', authRoutes);
  server.use('/api/chats', chatRoutes);
  server.use('/api/tasks', taskRoutes);
  server.use('/api/whatsapp', whatsappRoutes);

  // ── Sockets ───────────────────────────────────────────────────────────────
  setupSockets(io);

  // ── WhatsApp event hooks ──────────────────────────────────────────────────
  whatsappService.onQR = (qr) => broadcastWhatsAppStatus({ status: 'qr', qr });
  whatsappService.onStatus = (status) => broadcastWhatsAppStatus({ status });
  whatsappService.onMessage = async (msg) => {
    try {
      const saved = await messageService.saveMessage(msg);
      broadcastNewMessage(saved);
    } catch (err) {
      console.error('Error handling message:', err);
    }
  };

  // ── Next.js fallback ──────────────────────────────────────────────────────
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`> MyWA Server listening on http://0.0.0.0:${PORT}`);
    console.log(`> APP_URL: ${process.env.APP_URL}`);
    console.log(`> CORS allowed origins: ${JSON.stringify(corsOrigins)}`);

    // Auto initialize WhatsApp
    whatsappService.initialize().catch((err) => {
      console.error('WhatsApp auto-init error:', err);
    });

    // ── Daily reminder scheduler (runs every day at 09:00) ──────────────────
    scheduleReminders();
  });
}).catch((ex) => {
  console.error('Server startup error:', ex.stack || ex);
  process.exit(1);
});

/**
 * Schedules a daily check at 09:00 (server local time) that sends
 * reminders for overdue and due-soon tasks.
 */
function scheduleReminders() {
  const runReminders = async () => {
    try {
      console.log('[Scheduler] Running daily reminder check...');
      if (!whatsappService.isConnected()) {
        console.log('[Scheduler] WhatsApp not connected, skipping reminders.');
        return;
      }
      const overdueResult = await reminderService.sendBulkReminders('overdue');
      console.log(`[Scheduler] Overdue reminders sent: ${overdueResult.sent} tasks across ${overdueResult.chats} chats`);

      const dueSoonResult = await reminderService.sendBulkReminders('due_soon');
      console.log(`[Scheduler] Due-soon reminders sent: ${dueSoonResult.sent} tasks across ${dueSoonResult.chats} chats`);
    } catch (err) {
      console.error('[Scheduler] Reminder error:', err);
    }
  };

  const scheduleNext = () => {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(9, 0, 0, 0);
    if (nextRun <= now) {
      // Past 09:00 today → schedule for tomorrow
      nextRun.setDate(nextRun.getDate() + 1);
    }
    const msUntilNext = nextRun.getTime() - now.getTime();
    console.log(`[Scheduler] Next reminder check at ${nextRun.toLocaleString()} (in ${Math.round(msUntilNext / 60000)} min)`);

    setTimeout(async () => {
      await runReminders();
      scheduleNext(); // reschedule for next day
    }, msUntilNext);
  };

  scheduleNext();
}
