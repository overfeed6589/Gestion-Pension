'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import {
  updateHousingCategoryAction,
  deleteHousingCategoryAction,
} from '@/app/dashboard/housing/actions';
import { ActionState } from '@/types/actions';

const initial: ActionState = { success: false };

export type CategoryEditProps = {
  categoryId: string;
  name: string;
  description: string | null;
  publicName: string | null;
  capacity: number;
  basePrice: number; // euros
  surcharge: number; // euros
  isPublic: boolean;
};

export function CategoryEdit(props: CategoryEditProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(updateHousingCategoryAction, initial);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!window.confirm(`Supprimer l’espace « ${props.name} » ?`)) return;
    setDeleting(true);
    const res = await deleteHousingCategoryAction(props.categoryId);
    setDeleting(false);
    if (!res.success) window.alert(res.message);
  };

  return (
    <div className="space-y-2">
      {open && (
        <form action={formAction} className="border rounded-xl p-4 space-y-3 bg-slate-50">
          <input type="hidden" name="categoryId" value={props.categoryId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium">Nom (interne)</label>
              <input name="name" defaultValue={props.name} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium">Nom public</label>
              <input name="publicName" defaultValue={props.publicName ?? ''} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium">Capacité</label>
              <input name="capacity" type="number" defaultValue={props.capacity} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium">Prix/nuit (€)</label>
              <input name="basePricePerNight" type="number" step="0.01" defaultValue={props.basePrice} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium">Supplément/animal (€)</label>
              <input name="surchargePerAnimal" type="number" step="0.01" defaultValue={props.surcharge} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">Description publique</label>
              <textarea name="description" defaultValue={props.description ?? ''} rows={2} className="border rounded p-1.5 text-sm w-full" />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-xs">
              <input name="isPublic" type="checkbox" defaultChecked={props.isPublic} className="accent-slate-900" />
              Exposé sur le site public
            </label>
          </div>
          {state.message && (
            <p className={`text-xs ${state.success ? 'text-emerald-700' : 'text-red-600'}`}>{state.message}</p>
          )}
          <button type="submit" disabled={isPending} className="bg-slate-900 text-white text-xs rounded px-3 py-1.5 disabled:opacity-50">
            {isPending ? '…' : 'Enregistrer'}
          </button>
        </form>
      )}
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((v) => !v)} className="text-xs underline text-slate-600">
          {open ? 'Fermer' : 'Modifier'}
        </button>
        <button onClick={remove} disabled={deleting} className="text-xs underline text-red-600">
          {deleting ? '…' : 'Supprimer'}
        </button>
      </div>
    </div>
  );
}
