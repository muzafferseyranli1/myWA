import { prisma } from '../../src/lib/prisma';

/**
 * LID ↔ JID çözümleyici servis.
 * Modern WhatsApp, grup katılımcılarını LID formatında (@lid) gönderiyor.
 * Bu servis LID'leri gerçek JID'lere çevirir ve mention için doğru formatı üretir.
 */
export class ContactResolverService {
  private static instance: ContactResolverService;
  // In-memory LID → JID cache
  private lidToJidMap: Map<string, string> = new Map();
  // In-memory identifier (JID/LID/Phone/raw) → Display Name cache
  private nameCache: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): ContactResolverService {
    if (!ContactResolverService.instance) {
      ContactResolverService.instance = new ContactResolverService();
    }
    return ContactResolverService.instance;
  }

  /**
   * Baileys store'dan LID → JID eşlemelerini yükle
   */
  public async loadFromBaileysStore(sock: any) {
    try {
      if (sock?.store?.contacts) {
        for (const [id, contact] of Object.entries(sock.store.contacts as any)) {
          if (contact && (contact as any).lid) {
            this.lidToJidMap.set((contact as any).lid, id);
          }
          const name = (contact as any)?.name || (contact as any)?.notify || (contact as any)?.verifiedName;
          if (name) {
            this.nameCache.set(id, name);
            this.nameCache.set(id.split('@')[0], name);
          }
        }
        console.log(`> ContactResolver: Loaded ${this.lidToJidMap.size} LID→JID mappings from store`);
      }
    } catch (e) {
      console.error('ContactResolver loadFromBaileysStore error:', e);
    }
  }

  /**
   * Veritabanından LID→JID ve İsim eşlemelerini yükle
   */
  public async loadFromDatabase() {
    try {
      const contacts = await prisma.contact.findMany({
        select: { id: true, lidId: true, phoneNumber: true, pushName: true, displayName: true }
      });
      for (const c of contacts) {
        const name = c.displayName || c.pushName;
        if (name) {
          this.cacheContactName(c.id, name);
          if (c.phoneNumber) this.cacheContactName(c.phoneNumber, name);
          if (c.lidId) this.cacheContactName(c.lidId, name);
          const rawId = c.id.split('@')[0];
          this.cacheContactName(rawId, name);
        }
        if (c.lidId) {
          this.lidToJidMap.set(c.lidId, c.id);
        }
      }
      console.log(`> ContactResolver: Loaded ${contacts.length} contacts (${this.nameCache.size} name keys) from DB`);
    } catch (e) {
      console.error('ContactResolver loadFromDatabase error:', e);
    }
  }

  public cacheContactName(key: string, name: string) {
    if (!key || !name) return;
    this.nameCache.set(key, name);
    const raw = key.split('@')[0];
    this.nameCache.set(raw, name);
  }

  /**
   * LID → JID eşlemesi ekle
   */
  public addMapping(lid: string, jid: string) {
    this.lidToJidMap.set(lid, jid);
    // Veritabanında da güncelle
    prisma.contact.update({
      where: { id: jid },
      data: { lidId: lid }
    }).catch(() => {});
  }

  /**
   * Bir contact ID'yi mention için kullanılabilir JID'e çevir
   * @returns JID formatında ID (xxx@s.whatsapp.net) veya null
   */
  public resolveToMentionJid(contactId: string): string | null {
    if (!contactId) return null;

    // Zaten @s.whatsapp.net formatındaysa direkt kullan
    if (contactId.endsWith('@s.whatsapp.net')) {
      return contactId;
    }

    // LID ise cache'den JID'e çevir
    if (contactId.endsWith('@lid')) {
      const jid = this.lidToJidMap.get(contactId);
      if (jid && jid.endsWith('@s.whatsapp.net')) return jid;
      return null;
    }

    // Sadece numara ise @s.whatsapp.net ekle
    if (/^\d+$/.test(contactId)) {
      return `${contactId}@s.whatsapp.net`;
    }

    return null;
  }

  /**
   * Senkron olarak önbellekten isim döndürür, bulunamazsa null
   */
  public getDisplayNameSync(contactIdOrPhone: string): string | null {
    if (!contactIdOrPhone) return null;
    const clean = contactIdOrPhone.trim();
    if (this.nameCache.has(clean)) return this.nameCache.get(clean)!;
    const raw = clean.split('@')[0];
    if (this.nameCache.has(raw)) return this.nameCache.get(raw)!;
    return null;
  }

  /**
   * Bir contact'ın görüntüleme adını çözümle (Önce cache, sonra DB)
   */
  public async resolveDisplayName(contactId: string): Promise<string> {
    if (!contactId) return '';
    const cached = this.getDisplayNameSync(contactId);
    if (cached) return cached;

    try {
      const raw = contactId.split('@')[0];
      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { id: contactId },
            { id: `${raw}@lid` },
            { id: `${raw}@s.whatsapp.net` },
            { phoneNumber: raw },
            { lidId: contactId },
            { lidId: `${raw}@lid` }
          ]
        },
        select: { pushName: true, displayName: true, phoneNumber: true, id: true }
      });
      if (contact) {
        const name = contact.displayName || contact.pushName || contact.phoneNumber || raw;
        this.cacheContactName(contactId, name);
        this.cacheContactName(raw, name);
        this.cacheContactName(contact.id, name);
        return name;
      }
    } catch (e) {}
    return contactId.split('@')[0];
  }

  /**
   * Birden fazla contact için mention JID listesi oluştur
   */
  public resolveMentions(contactIds: string[]): string[] {
    return contactIds
      .map(id => this.resolveToMentionJid(id))
      .filter((jid): jid is string => jid !== null);
  }

  /**
   * Bir contact için etiketleme tag'i (@xxx) ve JID bilgisini çözümler.
   * WhatsApp'ta doğru bildirim ve mavi etiket için @telefon_numarasi döndürür.
   * Numara bulunamazsa @isim döner.
   */
  public resolveAssigneeMention(contact: {
    id: string;
    phoneNumber?: string | null;
    displayName?: string | null;
    pushName?: string | null;
  }): { tag: string; jid: string | null } {
    let jid = this.resolveToMentionJid(contact.id);
    if (!jid && contact.phoneNumber) {
      const cleanPhone = contact.phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        jid = `${cleanPhone}@s.whatsapp.net`;
        if (contact.id.endsWith('@lid')) {
          this.addMapping(contact.id, jid);
        }
      }
    }
    if (!jid && contact.id.endsWith('@s.whatsapp.net')) {
      jid = contact.id;
    }

    if (jid) {
      return { tag: `@${jid.split('@')[0]}`, jid };
    }

    const name = contact.displayName || contact.pushName || contact.phoneNumber;
    return { tag: name ? `@${name.trim()}` : '@Bilinmeyen', jid: null };
  }
}

export const contactResolver = ContactResolverService.getInstance();
