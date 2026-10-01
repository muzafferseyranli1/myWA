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
