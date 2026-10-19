/** Quick due-date choices. A date that lands on a weekend moves to Monday. */
export const QUICK_DUE_DATES: { label: string; days: number }[] = [
  { label: 'Bugün', days: 0 },
  { label: 'Yarın', days: 1 },
  { label: '3 gün', days: 3 },
  { label: '5 gün', days: 5 },
  { label: '1 hafta', days: 7 },
  { label: '15 gün', days: 15 },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateInputValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `YYYY-MM-DD` for today + `days`, moved forward to the first working day (Mon-Fri). */
export function firstWorkingDay(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return toDateInputValue(d);
}

/** Choices an assignee has when they take a task on from its link. */
export const COMMIT_CHOICES: { label: string; days: number }[] = [
  { label: 'Yarın', days: 1 },
  { label: '3 gün', days: 3 },
  { label: '5 gün', days: 5 },
  { label: '1 hafta', days: 7 },
  { label: '15 gün', days: 15 },
];

/**
 * Like firstWorkingDay, but counted from today's date in Istanbul so the server
 * (which runs in UTC) and every browser agree on the same day.
 */
export function istanbulWorkingDay(days: number, now = new Date()): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** "Ahmet · 25 Eki" for every assignee who promised a date and has not finished yet. */
export function openCommitments(task: { assignees?: any[] }): string[] {
  return (task.assignees || [])
    .filter(a => a.committedDueDate && !a.completedAt)
    .map(a => {
      const name = a.contact?.displayName || a.contact?.pushName || a.contact?.phoneNumber || 'Görevli';
      const date = new Date(a.committedDueDate).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
      return `${name} · ${date}`;
    });
}
