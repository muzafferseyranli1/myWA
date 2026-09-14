/**
 * TinyURL URL Shortener Service
 * WhatsApp mesajlarında ve Safari tarayıcısında sorunsuz çalışan,
 * şık ve tıklanabilir kısa bağlantılar üretir.
 */
export class UrlShortenerService {
  private static instance: UrlShortenerService;
  private cache: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): UrlShortenerService {
    if (!UrlShortenerService.instance) {
      UrlShortenerService.instance = new UrlShortenerService();
    }
    return UrlShortenerService.instance;
  }

  /**
   * Verilen uzun URL'i TinyURL API'sini kullanarak kısaltır.
   * Başarısız olursa veya zaman aşımına uğrarsa orijinal URL'i döner (fallback).
   */
  public async shortenUrl(longUrl: string): Promise<string> {
    if (!longUrl) return '';

    // Önbellek kontrolü
    if (this.cache.has(longUrl)) {
      return this.cache.get(longUrl)!;
    }

    try {
      const endpoint = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const shortUrl = (await response.text()).trim();
        if (shortUrl && shortUrl.startsWith('http')) {
          this.cache.set(longUrl, shortUrl);
          return shortUrl;
        }
      }
    } catch (err: any) {
      console.warn(`[UrlShortener] Failed to shorten URL (${longUrl}):`, err?.message || err);
    }

    // Fallback: Herhangi bir hata olursa orijinal adresi dön
    return longUrl;
  }
}

export const urlShortenerService = UrlShortenerService.getInstance();
