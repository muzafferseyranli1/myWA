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
        }
        console.log(`> ContactResolver: Loaded ${this.lidToJidMap.size} LID→JID mappings from store`);
      }
    } catch (e) {
      console.error('ContactResolver loadFromBaileysStore error:', e);
    }
  }

  /**
   * Veritabanındaki lidId alanlarından cache'i yükle
   */
  public async loadFromDatabase() {
    try {
      const contacts = await prisma.contact.findMany({
        where: { lidId: { not: null } },
        select: { id: true, lidId: true }
      });
      for (const c of contacts) {
        if (c.lidId) {
          this.lidToJidMap.set(c.lidId, c.id);
        }
      }
      console.log(`> ContactResolver: Loaded ${contacts.length} LID→JID mappings from DB`);
    } catch (e) {
      console.error('ContactResolver loadFromDatabase error:', e);
    }
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
      // LID çözülemezse null dön (mention atılamaz)
      return null;
    }

    // Sadece numara ise @s.whatsapp.net ekle
    if (/^\d+$/.test(contactId)) {
      return `${contactId}@s.whatsapp.net`;
    }

    return null;
  }

  /**
   * Bir contact'ın görüntüleme adını çözümle
   */
  public async resolveDisplayName(contactId: string): Promise<string> {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { pushName: true, displayName: true, phoneNumber: true }
      });
      if (contact) {
        return contact.pushName || contact.displayName || contact.phoneNumber || contactId.split('@')[0];
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
}

export const contactResolver = ContactResolverService.getInstance();
