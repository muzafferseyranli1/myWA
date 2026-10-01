import { systemDb } from './tenant';
import { DEFAULT_NOTIFICATION_SETTINGS, NotificationSettings, parseNotificationSettings } from './quiet-hours';

const KEY = 'notifications';
let cached: { at: number; value: NotificationSettings } | undefined;

/** Settings are shared by every user and managed from the admin panel. */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (process.env.QUIET_HOURS === 'off') return { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false };
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  let value = DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const row = await systemDb().appSetting.findUnique({ where: { key: KEY } });
    const parsed = row ? parseNotificationSettings(row.value) : null;
    if (parsed && typeof parsed !== 'string') value = parsed;
  } catch {
    // The table may not exist yet or there is no database (unit tests): use defaults.
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function saveNotificationSettings(value: NotificationSettings) {
  await systemDb().appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  cached = undefined;
}
