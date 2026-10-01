/**
 * Quiet hours and the daily summary time, all in Istanbul wall-clock time
 * (UTC+3 year-round, no daylight saving).
 *
 * Quiet time runs overnight from `quietStart` until the "day starts" time,
 * which is `weekdayEnd` Monday-Friday and the later `weekendEnd` on Saturday
 * and Sunday. The scheduled daily summary goes out when quiet time ends.
 */
export type NotificationSettings = { enabled: boolean; quietStart: string; weekdayEnd: string; weekendEnd: string };
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { enabled: true, quietStart: '22:00', weekdayEnd: '09:00', weekendEnd: '11:00' };

const OFFSET_MS = 3 * 3600_000;
const DAY_MS = 86_400_000;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function istanbul(date: Date) {
  const local = new Date(date.getTime() + OFFSET_MS);
  return {
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
    midnight: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS,
  };
}
const isWeekendDay = (weekday: number) => weekday === 0 || weekday === 6;
export const isWeekend = (date = new Date()) => isWeekendDay(istanbul(date).weekday);
const dayStart = (weekday: number, s: NotificationSettings) => minutes(isWeekendDay(weekday) ? s.weekendEnd : s.weekdayEnd);

/** When quiet time ends if `now` is inside it; null when notifications may go out. */
export function quietUntil(now: Date, s: NotificationSettings): Date | null {
  if (!s.enabled) return null;
  const { minute, weekday, midnight } = istanbul(now);
  if (minute < dayStart(weekday, s)) return new Date(midnight + dayStart(weekday, s) * 60_000);
  if (minute >= minutes(s.quietStart)) return new Date(midnight + DAY_MS + dayStart((weekday + 1) % 7, s) * 60_000);
  return null;
}

/** True once the day has started and quiet time has not begun again. */
export function summaryDue(now: Date, s: NotificationSettings): boolean {
  const { minute, weekday } = istanbul(now);
  if (!s.enabled) return minute >= minutes(DEFAULT_NOTIFICATION_SETTINGS.weekdayEnd);
  return minute >= dayStart(weekday, s) && minute < minutes(s.quietStart);
}

/** Returns the cleaned settings, or an error message in Turkish. */
export function parseNotificationSettings(input: any): NotificationSettings | string {
  const { enabled, quietStart, weekdayEnd, weekendEnd } = input || {};
  if (typeof enabled !== 'boolean') return 'Geçersiz durum';
  for (const value of [quietStart, weekdayEnd, weekendEnd]) if (typeof value !== 'string' || !TIME.test(value)) return 'Saatler SS:DD biçiminde olmalı';
  if (minutes(quietStart) <= minutes(weekdayEnd) || minutes(quietStart) <= minutes(weekendEnd)) return 'Yasaklı saat başlangıcı, gün başlangıç saatlerinden sonra olmalı (örn. 22:00 → 09:00)';
  return { enabled, quietStart, weekdayEnd, weekendEnd };
}
