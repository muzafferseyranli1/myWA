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

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || '3060', 10);

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Health check endpoint
  server.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // CORS middleware
  server.use((req, res, nextFn) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    nextFn();
  });
  server.use(express.json());
  server.use(express.static('public'));

  // Setup file uploads
  const upload = multer({ dest: 'public/uploads/' });
  server.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // Mount APIs
  server.use('/api/auth', authRoutes);
  server.use('/api/chats', chatRoutes);
  server.use('/api/tasks', taskRoutes);
  server.use('/api/whatsapp', whatsappRoutes);

  // Setup sockets
  setupSockets(io);

  // Setup WhatsApp event hooks
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

  // Next.js fallback
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`> MyWA Server listening on http://0.0.0.0:${PORT}`);
    // Auto initialize WhatsApp service on boot
    whatsappService.initialize().catch((err) => {
      console.error('WhatsApp auto-init error:', err);
    });
  });
}).catch((ex) => {
  console.error('Server startup error:', ex.stack || ex);
  process.exit(1);
});
