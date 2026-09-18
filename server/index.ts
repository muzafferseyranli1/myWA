import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import next from 'next';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chats';
import taskRoutes from './routes/tasks';
import whatsappRoutes from './routes/whatsapp';
import whatsappWebhookRoutes from './routes/whatsapp-webhook';
import notificationsRoutes from './routes/notifications';
import mediaRoutes from './routes/media';
import { setupSockets, broadcastNewMessage, broadcastWhatsAppStatus } from './sockets';
import { whatsappService } from './services/whatsapp.service';
import { prisma } from './lib/prisma';
import { events } from './lib/events';
import { createUploadRouter } from './middleware/upload';
import { startWorkers, stopWorkers, workersReady } from './services/workers';

for (const key of ['DATABASE_URL', 'JWT_SECRET', 'APP_URL', 'WAHA_API_KEY', 'WAHA_WEBHOOK_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();
const port = Number(process.env.PORT || 3060);
const origins = process.env.ALLOWED_ORIGIN || '*';
const allowed = origins === '*' ? '*' : origins.split(',').map(o => o.trim());
app.prepare().then(async () => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = new Server(httpServer, { cors: { origin: allowed, methods: ['GET', 'POST'] } });
  server.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  server.use((req, res, nextFn) => {
    const origin = req.headers.origin || '';
    if (allowed === '*' || allowed.includes(origin)) res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    nextFn();
  });
  // Signature validation sees the original bytes, before the general JSON parser.
  server.use('/api/whatsapp/webhook', whatsappWebhookRoutes);
  server.use(express.json());
  const uploads = await createUploadRouter();
  server.use('/api/upload', uploads.router);
  server.use('/uploads', express.static(uploads.dir));
  server.use(express.static('public'));
  server.use('/api/auth', authRoutes);
  server.use('/api/chats', chatRoutes);
  server.use('/api/tasks', taskRoutes);
  server.use('/api/whatsapp', whatsappRoutes);
  server.use('/api/notifications', notificationsRoutes);
  server.use('/api/media', mediaRoutes);
  setupSockets(io);
  events.on('new_message', broadcastNewMessage);
  events.on('chat_updated', () => io.emit('chat_updated'));
  events.on('message_updated', message => { io.to('chat_'+message.chatId).emit('message_updated', {id:message.id,chatId:message.chatId,body:message.body,ack:message.ack,revoked:message.revoked,editedAt:message.editedAt}); io.emit('chat_updated',message.chatId); });
  whatsappService.onQR = () => broadcastWhatsAppStatus(whatsappService.getStatus());
  whatsappService.onStatus = () => broadcastWhatsAppStatus(whatsappService.getStatus());
  await startWorkers();
  server.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1 FROM incoming_events LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM outgoing_jobs LIMIT 1`;
      const ready = workersReady();
      res.status(ready ? 200 : 503).json({ status: ready ? (whatsappService.isConnected() ? 'ready' : 'degraded') : 'not_ready', database: 'ok', workers: ready, whatsapp: whatsappService.getStatus().status });
    } catch { res.status(503).json({ status: 'not_ready', database: 'unavailable' }); }
  });
  server.all('*', (req, res) => handle(req, res));
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 30000);
    httpServer.close();
    await stopWorkers();
    io.close();
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  httpServer.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`MyWA listening on ${port}`));
}).catch(error => { console.error('Server startup failed:', error.code || error.message); process.exit(1); });
