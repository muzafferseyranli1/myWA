import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export class WhatsAppService {
  private static instance: WhatsAppService;
  private sock: any;
  private qrcodeDataUrl: string | null = null;
  private status: string = 'disconnected';
  private isInitializing: boolean = false;
  
  public onQR?: (qr: string) => void;
  public onStatus?: (status: string) => void;
  public onMessage?: (msg: any) => void;

  private constructor() {}

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  public async initialize() {
    if (this.isInitializing) return;
    this.isInitializing = true;
    this.status = 'connecting';
    if (this.onStatus) this.onStatus(this.status);

    try {
      const sessionPath = process.env.WA_SESSION_PATH || path.join(process.cwd(), '.baileys_auth');
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      let version = [2, 3000, 1015901307];
      try {
        const v = await fetchLatestBaileysVersion();
        if (v?.version) version = v.version;
      } catch (err: any) {
        console.log('Using default Baileys version:', err.message);
      }
      
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version: version as any,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['MyWA Web', 'Chrome', '124.0.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        getMessage: async () => {
          return { conversation: 'hello' };
        }
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          console.log('> New WhatsApp QR Generated');
          this.qrcodeDataUrl = await qrcode.toDataURL(qr);
          this.status = 'qr';
          if (this.onQR) this.onQR(this.qrcodeDataUrl);
          if (this.onStatus) this.onStatus(this.status);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`> WhatsApp connection closed. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);
          
          this.status = 'disconnected';
          this.qrcodeDataUrl = null;
          this.isInitializing = false;
          if (this.onStatus) this.onStatus(this.status);
          
          if (shouldReconnect) {
            setTimeout(() => this.initialize(), 3000);
          } else {
            this.sock = null;
          }
        } else if (connection === 'open') {
          console.log('> WhatsApp Connected successfully! 🎉');
          this.status = 'connected';
          this.qrcodeDataUrl = null;
          this.isInitializing = false;
          if (this.onStatus) this.onStatus(this.status);
        }
      });

      this.sock.ev.on('messages.upsert', async (m: any) => {
        if (m.type === 'notify' && this.onMessage) {
          for (const msg of m.messages) {
            if (!msg.message) continue;
            
            let mediaUrl = null;
            let mediaName = null;
            let mediaMime = null;
            
            const isMedia = msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage;
            
            if (isMedia) {
              try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
                  logger,
                  reuploadRequest: this.sock?.updateMediaMessage
                } as any);
                const ext = this.getExtension(msg.message);
                const filename = `${randomUUID()}${ext}`;
                const filepath = path.join(UPLOAD_DIR, filename);
                fs.writeFileSync(filepath, buffer);
                mediaUrl = `/uploads/${filename}`;
                mediaName = filename;
                mediaMime = this.getMime(msg.message);
              } catch (err) {
                console.error('Media download error:', err);
              }
            }
            
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
            
            let mType = 'TEXT';
            if (msg.message.imageMessage) mType = 'IMAGE';
            else if (msg.message.videoMessage) mType = 'VIDEO';
            else if (msg.message.audioMessage) mType = 'AUDIO';
            else if (msg.message.documentMessage) mType = 'DOCUMENT';
            else if (msg.message.stickerMessage) mType = 'STICKER';

            const parsedMsg = {
              id: msg.key.id,
              chatId: msg.key.remoteJid,
              chatName: msg.pushName || msg.key.remoteJid,
              isGroup: msg.key.remoteJid?.endsWith('@g.us'),
              senderId: msg.key.participant || msg.key.remoteJid,
              senderPhone: (msg.key.participant || msg.key.remoteJid)?.split('@')[0],
              senderName: msg.pushName,
              body: text,
              messageType: mType,
              mediaUrl,
              mediaName,
              mediaMime,
              isFromMe: msg.key.fromMe,
              timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000)
            };
            
            this.onMessage(parsedMsg);
          }
        }
      });
    } catch (error) {
      console.error('WhatsApp initialization fatal error:', error);
      this.status = 'disconnected';
      this.isInitializing = false;
      if (this.onStatus) this.onStatus(this.status);
    }
  }
  
  private getExtension(message: any) {
    if (message.imageMessage) return '.jpg';
    if (message.videoMessage) return '.mp4';
    if (message.audioMessage) return '.ogg';
    if (message.documentMessage) {
      const parts = message.documentMessage.fileName?.split('.');
      return parts ? `.${parts[parts.length - 1]}` : '.bin';
    }
    return '.bin';
  }
  
  private getMime(message: any) {
    if (message.imageMessage) return message.imageMessage.mimetype;
    if (message.videoMessage) return message.videoMessage.mimetype;
    if (message.audioMessage) return message.audioMessage.mimetype;
    if (message.documentMessage) return message.documentMessage.mimetype;
    return 'application/octet-stream';
  }

  public async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {}
      this.sock = null;
      this.status = 'disconnected';
      this.qrcodeDataUrl = null;
      this.isInitializing = false;
      if (this.onStatus) this.onStatus(this.status);
    }
  }

  public getStatus() {
    return {
      status: this.status,
      qr: this.qrcodeDataUrl
    };
  }

  public isConnected() {
    return this.status === 'connected' && !!this.sock;
  }

  public async sendMessage(chatId: string, text: string, options?: any) {
    if (!this.isConnected()) throw new Error('WhatsApp not connected');
    
    const sendOptions: any = { text };
    if (options?.mentions && options.mentions.length > 0) {
      sendOptions.mentions = options.mentions;
    }
    
    return await this.sock.sendMessage(chatId, sendOptions);
  }

  public async getChats() {
    return []; 
  }
}

export const whatsappService = WhatsAppService.getInstance();
