'use client';

import { useActionState } from 'react';
import { createHousingUnitAction } from '@/app/dashboard/housing/actions';
import { ActionState } from '@/types/actions';

const initialState: ActionState = { success: false };

export function UnitForm({ categoryId }: { categoryId: string }) {
  const [state, formAction, isPending] = useActionState(
    createHousingUnitAction,
    initialState
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input
        name="name"
        type="text"
        placeholder="Ex : Box A1"
        className="border rounded px-2 py-1.5 text-sm w-32"
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
      >
        + Box
      </button>
      {state.message && <span className="text-xs text-slate-700">{state.message}</span>}
    </form>
  );
}
