'use client';

import { useActionState } from 'react';
import { createHousingCategoryAction } from '@/app/dashboard/housing/actions';
import { ActionState } from '@/types/actions';

const initialState: ActionState = {
  success: false,
};

export function CategoryForm() {
  const [state, formAction, isPending] = useActionState(
    createHousingCategoryAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Nom</label>
        <input name="name" type="text" className="border p-2 rounded w-full" />
        {state.errors?.name && (
          <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Capacité</label>
        <input name="capacity" type="number" defaultValue={1} className="border p-2 rounded w-full" />
        {state.errors?.capacity && (
          <p className="text-red-500 text-xs mt-1">{state.errors.capacity[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Prix par nuit (€)</label>
        <input name="basePricePerNight" type="number" step="0.01" className="border p-2 rounded w-full" />
        {state.errors?.basePricePerNight && (
          <p className="text-red-500 text-xs mt-1">{state.errors.basePricePerNight[0]}</p>
        )}
      </div>

      {state.message && !state.success && (
        <p className="text-red-600 text-sm">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isPending ? 'Création...' : 'Créer la catégorie'}
      </button>
    </form>
  );
}