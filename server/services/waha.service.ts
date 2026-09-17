import qrcode from 'qrcode';
import { prisma } from '../lib/prisma';
import { contactResolver } from './contact-resolver.service';

export interface WAHASessionStatus {
  name: string;
  status: 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED' | string;
  config?: any;
  me?: {
    id: string;
    pushName?: string;
  };
}

export class WAHAService {
  private static instance: WAHAService;
  private baseUrl: string;
  private sessionName: string;
  private apiKey?: string;

  // Cached state for instant socket response
  private currentStatus: string = 'disconnected';
  private currentQr: string | null = null;

  public onQR?: (qr: string) => void;
  public onStatus?: (status: string) => void;

  private constructor() {
    this.baseUrl = (process.env.WAHA_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
    this.sessionName = process.env.WAHA_SESSION_NAME || 'default';
    this.apiKey = process.env.WAHA_API_KEY || undefined;
  }

  public static getInstance(): WAHAService {
    if (!WAHAService.instance) {
      WAHAService.instance = new WAHAService();
    }
    return WAHAService.instance;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Health check to see if WAHA container is reachable
   */
  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensures the session exists in WAHA. If not, creates it.
   */
  public async ensureSession(): Promise<WAHASessionStatus | null> {
    try {
      // 1. Check if session exists
      const checkRes = await fetch(`${this.baseUrl}/api/sessions/${this.sessionName}`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000)
      });

      if (checkRes.ok) {
        return (await checkRes.json()) as WAHASessionStatus;
      }

      // 2. If 404, create new session
      if (checkRes.status === 404) {
        console.log(`[WAHA] Session "${this.sessionName}" not found. Creating...`);
        const webhookUrl = `${process.env.APP_URL || 'http://188.132.198.144:3060'}/api/whatsapp/webhook`;
        
        const createRes = await fetch(`${this.baseUrl}/api/sessions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            name: this.sessionName,
            start: true,
            config: {
              webhooks: [
                {
                  url: webhookUrl,
                  events: ['message', 'message.any', 'session.status']
                }
              ]
            }
          })
        });

        if (createRes.ok) {
          return (await createRes.json()) as WAHASessionStatus;
        }
      }
      return null;
    } catch (err: any) {
      console.warn('[WAHA] ensureSession error:', err.message);
      return null;
    }
  }

  /**
   * Fetches latest status and QR from WAHA and updates internal cache
   */
  public async updateStatus(): Promise<{ status: string; qr: string | null }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.sessionName}`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(4000)
      });

      if (!res.ok) {
        if (res.status === 404) {
          this.currentStatus = 'disconnected';
          this.currentQr = null;
        }
        return { status: this.currentStatus, qr: this.currentQr };
      }

      const sessionData = (await res.json()) as WAHASessionStatus;
      const wahaStatus = sessionData.status;

      let mappedStatus = 'disconnected';
      let mappedQr: string | null = null;

      if (wahaStatus === 'WORKING') {
        mappedStatus = 'connected';
        mappedQr = null;
      } else if (wahaStatus === 'SCAN_QR_CODE') {
        mappedStatus = 'qr';
        mappedQr = await this.fetchQrCode();
      } else if (wahaStatus === 'STARTING') {
        mappedStatus = 'connecting';
        mappedQr = null;
      } else {
        mappedStatus = 'disconnected';
        mappedQr = null;
      }

      const statusChanged = this.currentStatus !== mappedStatus;
      const qrChanged = this.currentQr !== mappedQr;

      this.currentStatus = mappedStatus;
      this.currentQr = mappedQr;

      if (statusChanged && this.onStatus) {
        this.onStatus(this.currentStatus);
      }
      if (qrChanged && mappedQr && this.onQR) {
        this.onQR(mappedQr);
      }

      return { status: this.currentStatus, qr: this.currentQr };
    } catch (err: any) {
      this.currentStatus = 'disconnected';
      this.currentQr = null;
      return { status: this.currentStatus, qr: null };
    }
  }

  /**
   * Fetches the QR code image from WAHA as a Base64 data URL
   */
  public async fetchQrCode(): Promise<string | null> {
    try {
      // First attempt: Request raw string value and encode with qrcode
      const rawRes = await fetch(`${this.baseUrl}/api/${this.sessionName}/auth/qr?format=raw`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(4000)
      });

      if (rawRes.ok) {
        const rawJson = await rawRes.json().catch(() => null);
        if (rawJson && rawJson.value) {
          return await qrcode.toDataURL(rawJson.value);
        }
      }

      // Fallback: Request JSON image format
      const imgRes = await fetch(`${this.baseUrl}/api/${this.sessionName}/auth/qr?format=image`, {
        headers: { ...this.getHeaders(), 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });

      if (imgRes.ok) {
        const imgJson = await imgRes.json().catch(() => null);
        if (imgJson && imgJson.data) {
          const mime = imgJson.mimetype || 'image/png';
          return `data:${mime};base64,${imgJson.data}`;
        }
      }

      // Fallback 2: Direct binary image buffer
      const binRes = await fetch(`${this.baseUrl}/api/${this.sessionName}/auth/qr`, {
        headers: { ...this.getHeaders(), 'Accept': 'image/png' },
        signal: AbortSignal.timeout(4000)
      });

      if (binRes.ok) {
        const arrayBuf = await binRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        return `data:image/png;base64,${base64}`;
      }

      return null;
    } catch (err: any) {
      console.warn('[WAHA] fetchQrCode error:', err.message);
      return null;
    }
  }

  /**
   * Returns current cached status (instant response for UI/Sockets)
   */
  public getStatus() {
    return {
      status: this.currentStatus,
      qr: this.currentQr
    };
  }

  public isConnected(): boolean {
    return this.currentStatus === 'connected';
  }

  /**
   * Starts or resumes the WhatsApp session in WAHA
   */
  public async startSession(): Promise<boolean> {
    try {
      this.currentStatus = 'connecting';
      if (this.onStatus) this.onStatus(this.currentStatus);

      // Ensure session exists or start it
      const session = await this.ensureSession();
      if (!session) {
        await fetch(`${this.baseUrl}/api/sessions/${this.sessionName}/start`, {
          method: 'POST',
          headers: this.getHeaders()
        });
      }

      // Poll status after a short delay
      setTimeout(() => this.updateStatus(), 1500);
      return true;
    } catch (err: any) {
      console.error('[WAHA] startSession error:', err.message);
      this.currentStatus = 'disconnected';
      if (this.onStatus) this.onStatus(this.currentStatus);
      return false;
    }
  }

  /**
   * Stops the WhatsApp session
   */
  public async stopSession(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.sessionName}/stop`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      this.currentStatus = 'disconnected';
      this.currentQr = null;
      if (this.onStatus) this.onStatus(this.currentStatus);
      return res.ok;
    } catch (err: any) {
      console.error('[WAHA] stopSession error:', err.message);
      return false;
    }
  }

  /**
   * Restarts the session (useful for resetting connection)
   */
  public async restartSession(): Promise<boolean> {
    try {
      this.currentStatus = 'connecting';
      this.currentQr = null;
      if (this.onStatus) this.onStatus(this.currentStatus);

      await fetch(`${this.baseUrl}/api/sessions/${this.sessionName}/restart`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      setTimeout(() => this.updateStatus(), 2000);
      return true;
    } catch (err: any) {
      console.error('[WAHA] restartSession error:', err.message);
      return false;
    }
  }

  /**
   * Sends a text message with optional mentions via WAHA
   */
  public async sendMessage(chatId: string, text: string, mentions?: string[]): Promise<any> {
    const normalizedChatId = chatId.includes('@s.whatsapp.net') 
      ? chatId.replace('@s.whatsapp.net', '@c.us') 
      : chatId;

    const normalizedMentions = mentions?.map(m => 
      m.includes('@s.whatsapp.net') ? m.replace('@s.whatsapp.net', '@c.us') : m
    );

    const body: any = {
      session: this.sessionName,
      chatId: normalizedChatId,
      text
    };

    if (normalizedMentions && normalizedMentions.length > 0) {
      body.mentions = normalizedMentions;
    }

    const res = await fetch(`${this.baseUrl}/api/sendText`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`WAHA sendText failed (${res.status}): ${errorText}`);
    }

    return await res.json().catch(() => ({ success: true }));
  }

  /**
   * Syncs all participating WhatsApp groups from WAHA into PostgreSQL
   */
  public async syncAllGroups(): Promise<void> {
    try {
      console.log('> [WAHA] Fetching all participating groups...');
      const res = await fetch(`${this.baseUrl}/api/${this.sessionName}/groups`, {
        headers: this.getHeaders()
      });

      if (!res.ok) {
        console.warn(`[WAHA] Group sync failed: HTTP ${res.status}`);
        return;
      }

      const groups = await res.json();
      if (!Array.isArray(groups)) return;

      for (const g of groups) {
        const jid = g.id || g.jid;
        if (!jid) continue;

        const subject = g.subject || g.name || jid;

        await prisma.chat.upsert({
          where: { id: jid },
          update: {
            name: subject,
            isGroup: true,
            updatedAt: new Date()
          },
          create: {
            id: jid,
            name: subject,
            isGroup: true,
            updatedAt: new Date()
          }
        }).catch(() => {});

        if (Array.isArray(g.participants)) {
          for (const p of g.participants) {
            const pId = p.id || p.jid;
            if (!pId) continue;

            const isLidP = pId.endsWith('@lid') || contactResolver.isLid(pId);
            const pPhone = !isLidP ? pId.split('@')[0] : '';
            const pName = p.notify || p.name || null;

            await prisma.contact.upsert({
              where: { id: pId },
              update: {
                ...(pPhone ? { phoneNumber: pPhone } : {}),
                ...(pName ? { pushName: pName } : {})
              },
              create: {
                id: pId,
                phoneNumber: pPhone,
                pushName: pName,
                displayName: pName,
                ...(isLidP ? { lidId: pId } : {})
              }
            }).catch(() => {});

            const role = p.admin === 'superadmin' ? 'superadmin' : (p.admin ? 'admin' : (p.role || 'member'));
            await prisma.groupParticipant.upsert({
              where: { chatId_contactId: { chatId: jid, contactId: pId } },
              update: { role },
              create: { chatId: jid, contactId: pId, role }
            }).catch(() => {});
          }
        }
      }

      console.log(`> [WAHA] Successfully synced ${groups.length} WhatsApp groups! ✅`);
    } catch (err: any) {
      console.error('[WAHA] syncAllGroups error:', err.message);
    }
  }

  /**
   * Fetches metadata for a single group and saves to DB
   */
  public async fetchAndSaveGroupMetadata(groupJid: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/${this.sessionName}/groups/${groupJid}`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const meta = await res.json();
        const subject = meta.subject || meta.name;
        if (subject) {
          await prisma.chat.upsert({
            where: { id: groupJid },
            update: { name: subject, isGroup: true },
            create: { id: groupJid, name: subject, isGroup: true }
          });
        }
      }
    } catch (e) {}
  }
}

export const wahaService = WAHAService.getInstance();
