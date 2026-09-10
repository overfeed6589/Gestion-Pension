'use client';

import { useTransition } from 'react';
import { toggleDailyTaskDoneAction } from '@/app/dashboard/taches/actions';

/** Case « fait » des tâches du jour (persistée dans daily_reports). */
export function TaskDoneCheckbox({
  petId,
  segmentId,
  date,
  done,
}: {
  petId: string;
  segmentId: string;
  date: string;
  done: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => {
          const checked = e.target.checked;
          startTransition(async () => {
            await toggleDailyTaskDoneAction(petId, segmentId, date, checked);
          });
        }}
      />
      {pending ? '…' : done ? 'Fait' : 'Fait ?'}
    </label>
  );
}
