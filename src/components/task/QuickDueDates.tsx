'use client';
import { useState } from 'react';
import { QUICK_DUE_DATES, firstWorkingDay } from '@/lib/due-date';

/** One-tap due dates that skip weekends (Saturday/Sunday become Monday). */
export default function QuickDueDates({ value, onPick }: { value: string; onPick: (date: string) => void }) {
  // Several choices can land on the same working day, so remember which button was tapped.
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {QUICK_DUE_DATES.map(({ label, days }) => {
        const date = firstWorkingDay(days);
        const active = picked === label && value === date;
        return (
          <button key={label} type="button" onClick={() => { setPicked(label); onPick(date); }}
            className={'rounded-full border px-3 py-1 text-xs font-medium ' + (active ? 'border-[#00A884] bg-[#00A884] text-white' : 'border-[#d1d7db] bg-white text-[#54656f] hover:border-[#00A884]')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
