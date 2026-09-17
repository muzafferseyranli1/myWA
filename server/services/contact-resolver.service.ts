import { prisma } from '../lib/prisma';

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

  public isLid(identifier: string): boolean {
    if (!identifier) return false;
    if (identifier.endsWith('@lid')) return true;
    const clean = identifier.split('@')[0].trim();
    if (this.lidToJidMap.has(`${clean}@lid`) || this.lidToJidMap.has(clean)) return true;
    // WhatsApp LIDs are typically 14-16 digits and do not match standard Turkish numbers (10-12 digits)
    if (/^\d{14,16}$/.test(clean) && !clean.startsWith('90')) return true;
    return false;
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
        const isSelf = c.id.includes('905332760534') || c.id === '31933115404296@lid' || c.phoneNumber === '905332760534';
        let name = c.displayName || c.pushName;
        if (!isSelf && name === 'Muzaffer') {
          name = (c.pushName !== 'Muzaffer' ? c.pushName : null) || null;
        }

        if (name && (isSelf || name !== 'Muzaffer')) {
          this.cacheContactName(c.id, name);
          if (c.phoneNumber && !this.isLid(c.phoneNumber)) {
            this.cacheContactName(c.phoneNumber, name);
          }
          if (c.lidId) this.cacheContactName(c.lidId, name);
          const rawId = c.id.split('@')[0];
          this.cacheContactName(rawId, name);
        }
        if (c.lidId) {
          this.lidToJidMap.set(c.lidId, c.id);
        }
        if (c.phoneNumber && !this.isLid(c.phoneNumber) && c.id.endsWith('@lid')) {
          this.lidToJidMap.set(c.id, `${c.phoneNumber}@s.whatsapp.net`);
        }
      }

      // Çift yönlü isim ve numara eşleme: LID ile JID arasındaki isimleri senkronize et
      for (const [lid, jid] of this.lidToJidMap.entries()) {
        const isSelf = lid === '31933115404296@lid' || jid.includes('905332760534');
        const nameFromLid = this.getDisplayNameSync(lid);
        const nameFromJid = this.getDisplayNameSync(jid);
        let bestName = nameFromLid || nameFromJid;
        if (!isSelf && bestName === 'Muzaffer') {
          bestName = null;
        }
        if (bestName) {
          this.cacheContactName(lid, bestName);
          this.cacheContactName(jid, bestName);
          this.cacheContactName(lid.split('@')[0], bestName);
          this.cacheContactName(jid.split('@')[0], bestName);
        }
      }

      console.log(`> ContactResolver: Loaded ${contacts.length} contacts (${this.nameCache.size} name keys, ${this.lidToJidMap.size} mappings) from DB`);
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
  public async addMapping(lid: string, jid: string) {
    if (!lid || !jid || lid === jid) return;
    // JID'in sahte bir LID olmadığından emin ol
    if (jid.endsWith('@s.whatsapp.net') && this.isLid(jid.split('@')[0])) {
      return;
    }

    this.lidToJidMap.set(lid, jid);

    // İsimleri çift yönlü aktar
    const name = this.getDisplayNameSync(lid) || this.getDisplayNameSync(jid);
    if (name) {
      this.cacheContactName(lid, name);
      this.cacheContactName(jid, name);
    }

    // Veritabanında güncelle
    try {
      await prisma.contact.upsert({
        where: { id: jid },
        update: { 
          lidId: lid,
          ...(name && { pushName: name, displayName: name })
        },
        create: { 
          id: jid, 
          lidId: lid, 
          phoneNumber: jid.split('@')[0],
          pushName: name || null,
          displayName: name || null
        }
      });

      const phone = jid.split('@')[0];
      if (phone && !this.isLid(phone)) {
        await prisma.contact.updateMany({
          where: { id: lid },
          data: { phoneNumber: phone }
        });
      }
    } catch (e) {}
  }

  /**
   * Bir contact ID'yi mention için kullanılabilir gerçek JID'e çevir
   * @returns JID formatında ID (xxx@s.whatsapp.net) veya null
   */
  public resolveToMentionJid(contactId: string): string | null {
    if (!contactId) return null;

    // LID ise cache'den gerçek JID'e çevir
    if (contactId.endsWith('@lid') || this.isLid(contactId)) {
      const fullLid = contactId.endsWith('@lid') ? contactId : `${contactId}@lid`;
      const jid = this.lidToJidMap.get(fullLid) || this.lidToJidMap.get(contactId.split('@')[0]);
      if (jid && jid.endsWith('@s.whatsapp.net') && !this.isLid(jid.split('@')[0])) {
        return jid;
      }
      return null;
    }

    // Zaten @s.whatsapp.net formatındaysa (ve sahte LID jid değilse) direkt kullan
    if (contactId.endsWith('@s.whatsapp.net')) {
      const raw = contactId.split('@')[0];
      if (!this.isLid(raw)) {
        return contactId;
      }
      return null;
    }

    // Sadece numara ise ve LID değilse @s.whatsapp.net ekle
    if (/^\d{10,13}$/.test(contactId) && !this.isLid(contactId)) {
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

    // Eşleşen LID veya JID varsa oradan da bak
    const mapped = this.lidToJidMap.get(clean) || this.lidToJidMap.get(`${raw}@lid`);
    if (mapped) {
      if (this.nameCache.has(mapped)) return this.nameCache.get(mapped)!;
      const rawMapped = mapped.split('@')[0];
      if (this.nameCache.has(rawMapped)) return this.nameCache.get(rawMapped)!;
    }

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
        select: { pushName: true, displayName: true, phoneNumber: true, id: true, lidId: true }
      });

      if (contact) {
        let name: string | null = contact.displayName || contact.pushName || null;
        // Eğer bu kayıtta isim yoksa ama bağlı lidId / JID varsa ona bak
        if (!name && contact.lidId) {
          const linked = await prisma.contact.findUnique({
            where: { id: contact.lidId },
            select: { pushName: true, displayName: true }
          });
          name = linked?.displayName || linked?.pushName || null;
        }

        if (name) {
          this.cacheContactName(contactId, name);
          this.cacheContactName(raw, name);
          this.cacheContactName(contact.id, name);
          if (contact.lidId) this.cacheContactName(contact.lidId, name);
          return name;
        }
      }
    } catch (e) {}

    // İsim bulunamadıysa: Eğer LID ise ham numara yerine 'Bilinmeyen' yerine raw dönebilir
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
   * - Gerçek telefon numarası biliniyorsa WhatsApp bildirimi için @telefon_numarasi ve jid döndürür.
   * - Sadece LID biliniyorsa ve telefon yoksa ASLA sahte numara üretmez, @İsim ve jid: null döndürür.
   */
  public resolveAssigneeMention(contact: {
    id: string;
    phoneNumber?: string | null;
    displayName?: string | null;
    pushName?: string | null;
  }): { tag: string; jid: string | null } {
    let jid = this.resolveToMentionJid(contact.id);

    // Telefon numarası varsa ve LID değilse JID üret
    if (!jid && contact.phoneNumber) {
      const cleanPhone = contact.phoneNumber.replace(/\D/g, '');
      const isLidNum = this.isLid(contact.id) || this.isLid(cleanPhone) || cleanPhone === contact.id.split('@')[0];
      if (!isLidNum && cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        jid = `${cleanPhone}@s.whatsapp.net`;
        if (contact.id.endsWith('@lid')) {
          this.addMapping(contact.id, jid);
        }
      }
    }

    if (jid) {
      return { tag: `@${jid.split('@')[0]}`, jid };
    }

    // Telefon/JID bulunamayan LID kullanıcıları için doğrudan temiz @İsim kullan
    const name = contact.displayName || contact.pushName || this.getDisplayNameSync(contact.id);
    return { tag: name ? `@${name.trim()}` : '@Görevli', jid: null };
  }

  /**
   * Metin içerisindeki ham LID veya telefon mention'larını (@123456789) okunabilir isimlere (@İsim) çevirir.
   */
  public async formatMentionsToNames(text: string): Promise<string> {
    if (!text) return text;
    const mentionRegex = /@(\d{9,16})/g;
    if (!mentionRegex.test(text)) return text;

    mentionRegex.lastIndex = 0;
    let result = text;
    const matches = Array.from(text.matchAll(mentionRegex));

    for (const match of matches) {
      const rawNumber = match[1];
      const name = await this.resolveDisplayName(rawNumber);
      if (name && name !== rawNumber && !name.includes('@')) {
        result = result.replaceAll(`@${rawNumber}`, `@${name.trim()}`);
      }
    }
    return result;
  }
}

export const contactResolver = ContactResolverService.getInstance();
