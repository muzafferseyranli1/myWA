import { prisma } from '../lib/prisma';
import { runWithTenant, tenantScoped } from '../lib/tenant';
import { isSelfId, isSelfName } from '../lib/self';

/**
 * LID ↔ JID çözümleyici servis.
 * Modern WhatsApp, grup katılımcılarını LID formatında (@lid) gönderiyor.
 * Bu servis LID'leri gerçek JID'lere çevirir ve mention için doğru formatı üretir.
 */
export class ContactResolverService {
  // In-memory LID → JID cache
  private lidToJidMap: Map<string, string> = new Map();
  // In-memory Phone / JID → LID cache
  private jidToLidMap: Map<string, string> = new Map();
  // In-memory identifier (JID/LID/Phone/raw) → Display Name cache
  private nameCache: Map<string, string> = new Map();
  // In-memory identifier → Avatar URL cache
  private avatarCache: Map<string, string> = new Map();

  /** Resolves once the tenant's contacts have been loaded from the database. */
  public ready: Promise<void> = Promise.resolve();

  public constructor() {}


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
            this.jidToLidMap.set(id, (contact as any).lid);
            const rawPhone = id.split('@')[0].replace(/\D/g, '');
            if (rawPhone && !this.isLid(rawPhone)) {
              this.jidToLidMap.set(rawPhone, (contact as any).lid);
              this.jidToLidMap.set(`${rawPhone}@c.us`, (contact as any).lid);
              this.jidToLidMap.set(`${rawPhone}@s.whatsapp.net`, (contact as any).lid);
            }
          }
          const name = (contact as any)?.name || (contact as any)?.notify || (contact as any)?.verifiedName;
          if (name) {
            this.nameCache.set(id, name);
            this.nameCache.set(id.split('@')[0], name);
          }
          const imgUrl = (contact as any)?.imgUrl || (contact as any)?.profilePictureURL;
          if (imgUrl) {
            this.cacheAvatar(id, imgUrl);
          }
        }
        console.log(`> ContactResolver: Loaded ${this.lidToJidMap.size} LID→JID mappings from store`);
      }
    } catch (e) {
      console.error('ContactResolver loadFromBaileysStore error:', e);
    }
  }

  /**
   * Veritabanından LID→JID, İsim ve Profil Resmi eşlemelerini yükle
   */
  public async loadFromDatabase() {
    try {
      const contacts = await prisma.contact.findMany({
        select: { id: true, lidId: true, phoneNumber: true, pushName: true, displayName: true, avatarUrl: true }
      });
      for (const c of contacts) {
        const isSelf = isSelfId(c.id) || isSelfId(c.phoneNumber);
        let name = c.displayName || c.pushName;
        if (!isSelf && isSelfName(name)) {
          name = (!isSelfName(c.pushName) ? c.pushName : null) || null;
        }

        if (name && (isSelf || !isSelfName(name))) {
          this.cacheContactName(c.id, name);
          if (c.phoneNumber && !this.isLid(c.phoneNumber)) {
            this.cacheContactName(c.phoneNumber, name);
          }
          if (c.lidId) this.cacheContactName(c.lidId, name);
          const rawId = c.id.split('@')[0];
          this.cacheContactName(rawId, name);
        }

        const phone = c.phoneNumber ? c.phoneNumber.replace(/\D/g, '') : '';
        if (c.lidId) {
          this.lidToJidMap.set(c.lidId, c.id);
          if (phone && !this.isLid(phone)) {
            this.jidToLidMap.set(phone, c.lidId);
            this.jidToLidMap.set(`${phone}@c.us`, c.lidId);
            this.jidToLidMap.set(`${phone}@s.whatsapp.net`, c.lidId);
          }
          if (!c.id.endsWith('@lid')) {
            this.jidToLidMap.set(c.id, c.lidId);
            this.jidToLidMap.set(c.id.split('@')[0], c.lidId);
          }
        }
        if (phone && !this.isLid(phone) && c.id.endsWith('@lid')) {
          this.lidToJidMap.set(c.id, `${phone}@s.whatsapp.net`);
          this.jidToLidMap.set(phone, c.id);
          this.jidToLidMap.set(`${phone}@c.us`, c.id);
          this.jidToLidMap.set(`${phone}@s.whatsapp.net`, c.id);
        }

        if (c.avatarUrl) {
          this.cacheAvatar(c.id, c.avatarUrl);
          if (c.lidId) this.cacheAvatar(c.lidId, c.avatarUrl);
          if (phone) this.cacheAvatar(phone, c.avatarUrl);
        }
      }

      // Çift yönlü isim ve numara eşleme: LID ile JID arasındaki isimleri senkronize et
      for (const [lid, jid] of this.lidToJidMap.entries()) {
        const isSelf = isSelfId(lid) || isSelfId(jid);
        const nameFromLid = this.getDisplayNameSync(lid);
        const nameFromJid = this.getDisplayNameSync(jid);
        let bestName = nameFromLid || nameFromJid;
        if (!isSelf && isSelfName(bestName)) {
          bestName = null;
        }
        if (bestName) {
          this.cacheContactName(lid, bestName);
          this.cacheContactName(jid, bestName);
          this.cacheContactName(lid.split('@')[0], bestName);
          this.cacheContactName(jid.split('@')[0], bestName);
        }

        const avatar = this.getAvatarSync(lid) || this.getAvatarSync(jid);
        if (avatar) {
          this.cacheAvatar(lid, avatar);
          this.cacheAvatar(jid, avatar);
        }
      }

      // Sohbet tablosundaki avatarları da önbelleğe al
      const chatsWithAvatars = await prisma.chat.findMany({
        where: { avatarUrl: { not: null } },
        select: { id: true, avatarUrl: true }
      });
      for (const chat of chatsWithAvatars) {
        if (chat.avatarUrl) {
          this.cacheAvatar(chat.id, chat.avatarUrl);
        }
      }

      console.log(`> ContactResolver: Loaded ${contacts.length} contacts (${this.nameCache.size} names, ${this.lidToJidMap.size} mappings, ${this.avatarCache.size} avatars) from DB`);
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
   * Telefon numarası veya telefon JID'sinden karşılık gelen LID kimliğini bulur
   */
  public getLidByPhone(phoneOrJid: string): string | null {
    if (!phoneOrJid) return null;
    const clean = phoneOrJid.trim();
    if (this.jidToLidMap.has(clean)) return this.jidToLidMap.get(clean)!;
    const raw = clean.split('@')[0].replace(/\D/g, '');
    if (this.jidToLidMap.has(raw)) return this.jidToLidMap.get(raw)!;
    if (this.jidToLidMap.has(`${raw}@c.us`)) return this.jidToLidMap.get(`${raw}@c.us`)!;
    if (this.jidToLidMap.has(`${raw}@s.whatsapp.net`)) return this.jidToLidMap.get(`${raw}@s.whatsapp.net`)!;
    return null;
  }

  /**
   * Senkron olarak önbellekten profil resmi URL'i döndürür
   */
  public getAvatarSync(key: string): string | null {
    if (!key) return null;
    const clean = key.trim();
    if (this.avatarCache.has(clean)) return this.avatarCache.get(clean)!;
    const raw = clean.split('@')[0];
    if (this.avatarCache.has(raw)) return this.avatarCache.get(raw)!;

    // Eşleşen LID veya JID üzerinden kontrol et
    const mappedLid = this.getLidByPhone(clean);
    if (mappedLid && this.avatarCache.has(mappedLid)) return this.avatarCache.get(mappedLid)!;

    const mappedJid = this.lidToJidMap.get(clean) || this.lidToJidMap.get(`${raw}@lid`);
    if (mappedJid && this.avatarCache.has(mappedJid)) return this.avatarCache.get(mappedJid)!;

    return null;
  }

  /**
   * Profil resmini önbelleğe kaydeder ve ilgili eşlemelere aktarır
   */
  public cacheAvatar(key: string, url: string) {
    if (!key || !url) return;
    this.avatarCache.set(key, url);
    const raw = key.split('@')[0];
    this.avatarCache.set(raw, url);

    const mappedLid = this.jidToLidMap.get(key) || this.jidToLidMap.get(raw);
    if (mappedLid) {
      this.avatarCache.set(mappedLid, url);
    }
    const mappedJid = this.lidToJidMap.get(key) || this.lidToJidMap.get(`${raw}@lid`);
    if (mappedJid) {
      this.avatarCache.set(mappedJid, url);
      this.avatarCache.set(mappedJid.split('@')[0], url);
    }
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
    this.jidToLidMap.set(jid, lid);
    const phone = jid.split('@')[0].replace(/\D/g, '');
    if (phone && !this.isLid(phone)) {
      this.jidToLidMap.set(phone, lid);
      this.jidToLidMap.set(`${phone}@c.us`, lid);
      this.jidToLidMap.set(`${phone}@s.whatsapp.net`, lid);
    }

    // İsimleri çift yönlü aktar
    const name = this.getDisplayNameSync(lid) || this.getDisplayNameSync(jid);
    if (name) {
      this.cacheContactName(lid, name);
      this.cacheContactName(jid, name);
    }

    // Avatarları çift yönlü aktar
    const avatar = this.getAvatarSync(lid) || this.getAvatarSync(jid);
    if (avatar) {
      this.cacheAvatar(lid, avatar);
      this.cacheAvatar(jid, avatar);
    }

    // Veritabanında güncelle
    try {
      await prisma.contact.upsert({
        where: { id: jid },
        update: { 
          lidId: lid,
          ...(name && { pushName: name, displayName: name }),
          ...(avatar && { avatarUrl: avatar })
        },
        create: { 
          id: jid, 
          lidId: lid, 
          phoneNumber: jid.split('@')[0],
          pushName: name || null,
          displayName: name || null,
          avatarUrl: avatar || null
        }
      });

      if (phone && !this.isLid(phone)) {
        await prisma.contact.updateMany({
          where: { id: lid },
          data: { 
            phoneNumber: phone,
            ...(avatar && { avatarUrl: avatar })
          }
        });
      }
    } catch (e) {}
  }

  /**
   * Bir contact ID'yi mention için kullanılabilir gerçek JID'e çevir
   * @returns JID formatında ID (xxx@s.whatsapp.net veya xxx@lid) veya null
   */
  public resolveToMentionJid(contactId: string): string | null {
    if (!contactId) return null;

    // LID ise cache'den gerçek telefon JID'ine çevir, bulunamazsa LID'in kendisi WhatsApp için geçerli mention JID'sidir
    if (contactId.endsWith('@lid') || this.isLid(contactId)) {
      const fullLid = contactId.endsWith('@lid') ? contactId : `${contactId}@lid`;
      const mapped = this.lidToJidMap.get(fullLid) || this.lidToJidMap.get(contactId.split('@')[0]);
      if (mapped && mapped.endsWith('@s.whatsapp.net') && !this.isLid(mapped.split('@')[0])) {
        return mapped;
      }
      return fullLid;
    }

    // Zaten @s.whatsapp.net formatındaysa (ve sahte LID jid değilse) direkt kullan
    if (contactId.endsWith('@s.whatsapp.net')) {
      const raw = contactId.split('@')[0];
      if (!this.isLid(raw)) {
        return contactId;
      }
      return `${raw}@lid`;
    }

    // Sadece numara ise ve LID değilse @s.whatsapp.net ekle
    if (/^\d{10,13}$/.test(contactId) && !this.isLid(contactId)) {
      return `${contactId}@s.whatsapp.net`;
    }

    // 14-16 haneli LID ise @lid ekle
    if (/^\d{14,16}$/.test(contactId)) {
      return `${contactId}@lid`;
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
   * - Gerçek telefon numarası biliniyorsa WhatsApp bildirimi için @telefon_numarasi ve telefon JID döndürür.
   * - Sadece LID biliniyorsa WhatsApp grup bildirimleri için @lid_numarasi ve LID JID (<num>@lid) döndürür.
   *   WhatsApp bunu @~İsim olarak render eder ve ilgili kişiye bildirim iletir.
   */
  public resolveAssigneeMention(contact: {
    id: string;
    phoneNumber?: string | null;
    displayName?: string | null;
    pushName?: string | null;
    lidId?: string | null;
  }): { tag: string; jid: string | null } {
    let jid = this.resolveToMentionJid(contact.id);

    // Telefon numarası varsa ve LID değilse telefon JID'sini öncelikli kullan
    if ((!jid || jid.endsWith('@lid')) && contact.phoneNumber) {
      const cleanPhone = contact.phoneNumber.replace(/\D/g, '');
      const isLidNum = this.isLid(cleanPhone) || cleanPhone.length > 13;
      if (!isLidNum && cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        jid = `${cleanPhone}@s.whatsapp.net`;
        if (contact.id.endsWith('@lid')) {
          this.addMapping(contact.id, jid);
        }
      }
    }

    // Eğer hala jid yoksa ama lidId varsa kontrol et
    if (!jid && contact.lidId) {
      jid = this.resolveToMentionJid(contact.lidId);
    }

    if (jid) {
      return { tag: `@${jid.split('@')[0]}`, jid };
    }

    // Telefon veya LID bulunamayan kullanıcılar için doğrudan temiz @İsim kullan
    const name = contact.displayName || contact.pushName || this.getDisplayNameSync(contact.id);
    return { tag: name ? `@${name.trim()}` : '@Görevli', jid: null };
  }

  /**
   * Senkron olarak metin içerisindeki ham LID veya telefon mention'larını (@123456789) okunabilir isimlere (@İsim) çevirir.
   */
  public formatMentionsToNamesSync(text: string): string {
    if (!text) return text;
    const mentionRegex = /@(\d{9,16})/g;
    if (!mentionRegex.test(text)) return text;

    mentionRegex.lastIndex = 0;
    return text.replace(mentionRegex, (match, rawNumber) => {
      const name = this.getDisplayNameSync(rawNumber);
      if (name && name !== rawNumber && !name.includes('@')) {
        return `@${name.trim()}`;
      }
      return match;
    });
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

  /**
   * Bir contact nesnesinden doğrudan WhatsApp DM gönderimi yapılabilecek chatId (xxx@c.us) üretir.
   * Telefon numarası veya telefon JID'si bulunamazsa (yalnızca çözümlenemeyen LID ise) null döner.
   */
  public resolveDirectChatId(contact?: {
    id: string;
    phoneNumber?: string | null;
    lidId?: string | null;
  } | null): string | null {
    if (!contact?.id) return null;

    // 1. contact.phoneNumber varsa ve geçerli bir telefon numarası ise
    if (contact.phoneNumber) {
      const clean = contact.phoneNumber.replace(/\D/g, '');
      if (!this.isLid(clean) && clean.length >= 10 && clean.length <= 15) {
        return `${clean}@c.us`;
      }
    }

    // 2. contact.id doğrudan bir telefon JID'si ise (@s.whatsapp.net veya @c.us)
    if (!contact.id.endsWith('@lid') && (contact.id.endsWith('@s.whatsapp.net') || contact.id.endsWith('@c.us'))) {
      const clean = contact.id.split('@')[0].replace(/\D/g, '');
      if (!this.isLid(clean) && clean.length >= 10 && clean.length <= 15) {
        return `${clean}@c.us`;
      }
    }

    // 3. contact.id bir LID ise ve lidToJidMap eşlemesinde telefon JID'si varsa
    const mentionJid = this.resolveToMentionJid(contact.id);
    if (mentionJid && !mentionJid.endsWith('@lid')) {
      const clean = mentionJid.split('@')[0].replace(/\D/g, '');
      if (!this.isLid(clean) && clean.length >= 10 && clean.length <= 15) {
        return `${clean}@c.us`;
      }
    }

    // 4. contact.lidId üzerinden eşleşme kontrolü
    if (contact.lidId) {
      const lidMentionJid = this.resolveToMentionJid(contact.lidId);
      if (lidMentionJid && !lidMentionJid.endsWith('@lid')) {
        const clean = lidMentionJid.split('@')[0].replace(/\D/g, '');
        if (!this.isLid(clean) && clean.length >= 10 && clean.length <= 15) {
          return `${clean}@c.us`;
        }
      }
    }

    return null;
  }
}

/**
 * Name/LID caches of the tenant active in the current context. Each tenant has
 * its own instance, loaded from its own schema on first use.
 */
export const contactResolver = tenantScoped('contacts', tenant => {
  const resolver = new ContactResolverService();
  resolver.ready = runWithTenant(tenant, () => resolver.loadFromDatabase());
  return resolver;
});
