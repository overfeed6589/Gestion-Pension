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
    <form action={formAction} className="space-y-4 bg-white border rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-lg">Nouvel espace (catégorie)</h2>

      <div>
        <label className="block text-sm font-medium">Nom</label>
        <input name="name" type="text" className="border p-2 rounded w-full" />
        {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">Nom public (site web, optionnel)</label>
        <input name="publicName" type="text" className="border p-2 rounded w-full" />
      </div>

      <div>
        <label className="block text-sm font-medium">Capacité (max animaux d’une même famille)</label>
        <input name="capacity" type="number" defaultValue={1} className="border p-2 rounded w-full" />
        {state.errors?.capacity && (
          <p className="text-red-500 text-xs mt-1">{state.errors.capacity[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Prix par nuit pour l’espace (€, TTC)</label>
        <input name="basePricePerNight" type="number" step="0.01" className="border p-2 rounded w-full" />
        {state.errors?.basePricePerNight && (
          <p className="text-red-500 text-xs mt-1">{state.errors.basePricePerNight[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">
          Supplément / animal supplémentaire / nuit (€)
        </label>
        <input name="surchargePerAnimal" type="number" step="0.01" defaultValue={0} className="border p-2 rounded w-full" />
        {state.errors?.surchargePerAnimal && (
          <p className="text-red-500 text-xs mt-1">{state.errors.surchargePerAnimal[0]}</p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input name="isPublic" type="checkbox" defaultChecked className="accent-slate-900" />
        Exposé sur le site public de réservation
      </label>

      {state.message && !state.success && <p className="text-red-600 text-sm">{state.message}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {isPending ? 'Création...' : 'Créer l’espace'}
      </button>
    </form>
  );
}
