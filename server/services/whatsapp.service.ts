import { wahaService } from './waha.service';

/**
 * WhatsAppService Facade
 * Provides backward compatibility for all existing controllers and schedulers
 * by delegating operations to the isolated WAHA microservice.
 */
export class WhatsAppService {
  private static instance: WhatsAppService;

  public get onQR() {
    return wahaService.onQR;
  }
  public set onQR(fn: ((qr: string) => void) | undefined) {
    wahaService.onQR = fn;
  }

  public get onStatus() {
    return wahaService.onStatus;
  }
  public set onStatus(fn: ((status: string) => void) | undefined) {
    wahaService.onStatus = fn;
  }

  private constructor() {}

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  /**
   * Initializes the WhatsApp connection via WAHA
   */
  public async initialize(): Promise<void> {
    console.log('> [WhatsApp] Initializing session via WAHA...');
    await wahaService.startSession();
  }

  /**
   * Syncs all participating WhatsApp groups
   */
  public async syncAllGroups(): Promise<void> {
    await wahaService.syncAllGroups();
  }

  /**
   * Fetches metadata for a single group and saves to database
   */
  public async fetchAndSaveGroupMetadata(groupJid: string): Promise<void> {
    await wahaService.fetchAndSaveGroupMetadata(groupJid);
  }

  /**
   * Disconnects the WhatsApp session
   */
  public async disconnect(): Promise<void> {
    console.log('> [WhatsApp] Stopping session via WAHA...');
    await wahaService.stopSession();
  }

  /**
   * Resets / restarts the WhatsApp session
   */
  public async resetSession(): Promise<void> {
    console.log('> [WhatsApp] Resetting session via WAHA...');
    await wahaService.restartSession();
  }

  /**
   * Returns current connection status and QR data URL
   */
  public getStatus() {
    return wahaService.getStatus();
  }

  /**
   * Checks if WhatsApp is currently connected
   */
  public isConnected(): boolean {
    return wahaService.isConnected();
  }

  /**
   * Sends a message with optional mentions
   */
  public async sendMessage(chatId: string, text: string, mentions?: string[]): Promise<void> {
    await wahaService.sendMessage(chatId, text, mentions);
  }
}

export const whatsappService = WhatsAppService.getInstance();
