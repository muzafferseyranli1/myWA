import qrcode from 'qrcode';
import { prisma } from '../lib/prisma';
import { contactResolver } from './contact-resolver.service';
import { events } from '../lib/events';
import { maybeTenant, tenantScoped, updateSelf } from '../lib/tenant';

const WEBHOOK_EVENTS = ['message', 'message.any', 'session.status', 'message.ack', 'message.reaction', 'message.edited', 'message.revoked', 'call.received', 'call.accepted', 'call.rejected'];

export class WAHAHttpError extends Error {
  constructor(public status: number) { super(`WAHA HTTP ${status}`); }
}
export class WAHAService {
  private baseUrl = (process.env.WAHA_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
  private currentStatus = 'disconnected';
  private myJid: string | null = null;
  private currentQr: string | null = null;
  private failures = 0;
  private nextRecoveryAt = 0;
  private running: Promise<void> | null = null;
  public onQR?: (qr: string) => void;
  public onStatus?: (status: string) => void;
  constructor(private sessionName: string = process.env.WAHA_SESSION_NAME || 'default') {}
  private getHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY || '' };
  }
  private async request(url: string, options: RequestInit = {}, timeout = 15000) {
    const response = await fetch(url, { ...options, headers: { ...this.getHeaders(), ...options.headers }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new WAHAHttpError(response.status);
    return response;
  }
  private setStatus(status: string, qr: string | null = null) {
    const changed = this.currentStatus !== status || this.currentQr !== qr;
    this.currentStatus = status;
    this.currentQr = qr;
    if (changed) this.onStatus?.(status);
    if (qr) this.onQR?.(qr);
  }
  public getStatus() { return { status: this.currentStatus, qr: this.currentQr, myJid: this.myJid }; }
  public getSessionName() { return this.sessionName; }
  private async rememberSelf(me: any) {
    if (!me?.id || typeof me.id !== 'string') return;
    this.myJid = me.id;
    const tenant = maybeTenant();
    if (!tenant) return;
    const phone = me.id.split('@')[0].split(':')[0].replace(/\D/g, '') || null;
    const lid = typeof me.lid === 'string' ? me.lid : null;
    await updateSelf(tenant, { phone, lid, name: typeof me.pushName === 'string' && me.pushName ? me.pushName : null })
      .catch(err => console.warn('[WAHA] Could not store own identity:', err?.message || err));
  }
  public isConnected() { return this.currentStatus === 'connected'; }
  public async isHealthy() {
    try { await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}`, {}, 5000); return true; }
    catch { return false; }
  }
  /**
   * Each session carries its own webhook. WAHA has no global webhook in this
   * deployment, so a session without one never delivers live messages.
   */
  private webhookConfig() {
    const url = process.env.WAHA_WEBHOOK_URL || `${(process.env.APP_URL || '').replace(/\/+$/, '')}/api/whatsapp/webhook`;
    return {
      url,
      events: WEBHOOK_EVENTS,
      ...(process.env.WAHA_WEBHOOK_SECRET ? { hmac: { key: process.env.WAHA_WEBHOOK_SECRET } } : {}),
      retries: { policy: 'exponential', delaySeconds: 2, attempts: 10 },
    };
  }
  public async ensureSession(): Promise<any> {
    try {
      const session = await (await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}`, {}, 5000)).json();
      const needsStore = !session.config?.noweb?.store?.enabled;
      const needsWebhook = !session.config?.webhooks?.length;
      if (needsStore || needsWebhook) {
        // Existing store settings are kept: changing them on a paired session can lose history.
        await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: this.sessionName,
            config: {
              ...session.config,
              ...(needsStore ? { noweb: { ...session.config?.noweb, store: { enabled: true, fullSync: false } } } : {}),
              ...(needsWebhook ? { webhooks: [this.webhookConfig()] } : {}),
            }
          })
        }).catch(err => console.warn('[WAHA] Could not update session config:', err?.message || err));
      }
      return session;
    } catch (error) {
      if (!(error instanceof WAHAHttpError) || error.status !== 404) throw error;
      // New sessions request the full history from the phone when it is first linked.
      return (await this.request(`${this.baseUrl}/api/sessions`, { method: 'POST', body: JSON.stringify({ name: this.sessionName, start: false, config: { noweb: { store: { enabled: true, fullSync: true } }, webhooks: [this.webhookConfig()] } }) })).json();
    }
  }
  public async updateStatus() {
    try {
      const session = await (await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}`, {}, 5000)).json();
      if (session.status === 'WORKING') { await this.rememberSelf(session.me); this.setStatus('connected'); }
      else if (session.status === 'SCAN_QR_CODE') this.setStatus('qr', await this.fetchQrCode());
      else this.setStatus(session.status === 'STARTING' ? 'connecting' : 'disconnected');
      return this.getStatus();
    } catch (error) { this.setStatus('disconnected'); throw error; }
  }
  public async fetchQrCode(): Promise<string | null> {
    const response = await this.request(`${this.baseUrl}/api/${this.sessionName}/auth/qr?format=raw`, {}, 5000);
    const raw = await response.json();
    if (raw.value) return qrcode.toDataURL(raw.value);
    return null;
  }
  /**
   * Requests an 8-character pairing code so the phone can link via
   * "Link with phone number" instead of scanning a QR code; needed when the
   * panel is open on that same phone. The session must be waiting for QR.
   */
  public async requestPairingCode(phoneNumber: string): Promise<string> {
    const response = await this.request(`${this.baseUrl}/api/${encodeURIComponent(this.sessionName)}/auth/request-code`, { method: 'POST', body: JSON.stringify({ phoneNumber }) }, 20000);
    const data = await response.json();
    if (typeof data?.code !== 'string' || !data.code) throw new Error('Pairing code missing');
    return data.code;
  }
  public async startSession() {
    await prisma.connectionPreference.upsert({ where: { session: this.sessionName }, create: { session: this.sessionName, enabled: true }, update: { enabled: true } });
    this.failures = 0;
    this.nextRecoveryAt = 0;
    await this.reconcile();
    return true;
  }
  public async stopSession() {
    // Persist intent before the network call so an outage cannot undo Disconnect.
    await prisma.connectionPreference.upsert({ where: { session: this.sessionName }, create: { session: this.sessionName, enabled: false }, update: { enabled: false } });
    this.setStatus('disconnected');
    await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}/stop`, { method: 'POST' });
    return true;
  }
  public async restartSession() {
    await prisma.connectionPreference.upsert({ where: { session: this.sessionName }, create: { session: this.sessionName, enabled: true }, update: { enabled: true } });
    await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}/restart`, { method: 'POST' });
    this.setStatus('connecting');
    return true;
  }
  public reconcile(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.reconcileOnce().finally(() => { this.running = null; });
    return this.running;
  }
  private async reconcileOnce() {
    try {
      const preference = await prisma.connectionPreference.upsert({ where: { session: this.sessionName }, create: { session: this.sessionName }, update: {} });
      if (!preference.enabled) {
        this.setStatus('disconnected');
        try { await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}/stop`, { method: 'POST' }); }
        catch (error) { if (!(error instanceof WAHAHttpError) || error.status !== 404) throw error; }
        return;
      }
      const session = await this.ensureSession();
      const previouslyConnected = this.isConnected();
      if (session.status === 'STOPPED') {
        await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}/start`, { method: 'POST' });
        this.setStatus('connecting');
      } else if (session.status === 'FAILED') {
        this.setStatus('disconnected');
        if (this.failures < 3 && Date.now() >= this.nextRecoveryAt) {
          this.failures++;
          this.nextRecoveryAt = Date.now() + 30000 * this.failures;
          await this.request(`${this.baseUrl}/api/sessions/${this.sessionName}/restart`, { method: 'POST' });
          this.setStatus('connecting');
        }
      } else {
        await this.updateStatus();
        if (this.isConnected()) {
          this.failures = 0;
          if (!previouslyConnected) await this.syncAllGroups();
        }
      }
    } catch (error) { this.setStatus('disconnected'); throw error; }
  }
  public async sendMessage(
    chatId: string,
    text: string,
    mentions?: string[],
    replyTo?: string,
    linkPreview: boolean = false
  ): Promise<any> {
    const normalize = (id: string) => id.replace('@s.whatsapp.net', '@c.us');
    const body: any = {
      session: this.sessionName,
      chatId: normalize(chatId),
      text,
      mentions: mentions?.map(normalize),
      linkPreview,
    };
    if (replyTo) {
      body.reply_to = replyTo;
    }
    try {
      const response = await this.request(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (err: any) {
      if (replyTo) {
        console.warn(`[WAHA] sendMessage with reply_to=${replyTo} failed (${err?.message || err}). Retrying without reply_to...`);
        delete body.reply_to;
        const retry = await this.request(`${this.baseUrl}/api/sendText`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return await retry.json();
      }
      throw err;
    }
  }
  public async getHistory(offset: number, from: number, until: number) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset), downloadMedia: 'false', 'filter.timestamp.gte': String(from), 'filter.timestamp.lte': String(until) });
    return (await this.request(`${this.baseUrl}/api/${encodeURIComponent(this.sessionName)}/chats/all/messages?${query}`, {}, 15000)).json();
  }
  public async getChatOverview(offset = 0) {
    return (await this.request(`${this.baseUrl}/api/${encodeURIComponent(this.sessionName)}/chats/overview?limit=100&offset=${offset}`, {}, 15000)).json();
  }
  public async getMessage(chatId: string, id: string) {
    return (await this.request(`${this.baseUrl}/api/${encodeURIComponent(this.sessionName)}/chats/${encodeURIComponent(chatId.replace('@s.whatsapp.net','@c.us'))}/messages/${encodeURIComponent(id)}?downloadMedia=true`, {}, 30000)).json();
  }
  public async syncAllGroups(): Promise<void> {
    try {
      console.log('> [WAHA] Fetching all participating groups...');
      const res = await this.request(`${this.baseUrl}/api/${this.sessionName}/groups`, {
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
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;

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
      const res = await this.request(`${this.baseUrl}/api/${this.sessionName}/groups/${groupJid}`, {
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

  /**
   * Fetches profile picture URL for a chat (group or contact)
   */
  public async getChatPicture(chatId: string): Promise<string | null> {
    try {
      const normalized = chatId.replace('@s.whatsapp.net', '@c.us');
      const res = await this.request(
        `${this.baseUrl}/api/${encodeURIComponent(this.sessionName)}/chats/${encodeURIComponent(normalized)}/picture`,
        {},
        8000
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.url || data?.picture || data?.profilePictureURL || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches profile picture URL for a contact by phone number / JID
   */
  public async getContactPicture(contactId: string): Promise<string | null> {
    try {
      const normalized = contactId.replace('@s.whatsapp.net', '@c.us');
      const query = new URLSearchParams({
        contactId: normalized,
        session: this.sessionName
      });
      const res = await this.request(
        `${this.baseUrl}/api/contacts/profile-picture?${query}`,
        {},
        8000
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.profilePictureURL || data?.url || data?.picture || null;
    } catch {
      return null;
    }
  }
}

/** The WAHA session of the tenant active in the current context. */
export const wahaService = tenantScoped('waha', tenant => {
  const service = new WAHAService(tenant.session);
  service.onStatus = () => events.emit('whatsapp_status', tenant.id, service.getStatus());
  return service;
});
