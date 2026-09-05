'use client';

import { useActionState, useState } from 'react';
import { createPetForClientAction } from '@/app/dashboard/clients/actions';
import { ActionState } from '@/types/actions';

const initialState: ActionState = { success: false };

export function PetAddForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createPetForClientAction, initialState);

  const input = 'border rounded p-2 text-sm w-full';
  const err = (name: string) =>
    state.errors?.[name]?.[0] ? <p className="text-red-600 text-xs mt-1">{state.errors[name][0]}</p> : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="text-xs text-slate-600 underline"
      >
        {open ? 'Fermer' : '+ Ajouter un animal'}
      </button>

      {open && (
        <form action={formAction} className="mt-3 border rounded-xl p-4 space-y-3 bg-slate-50">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Nom *</label>
              <input name="name" required className={input} />
              {err('name')}
            </div>
            <div>
              <label className="text-xs font-medium">Espèce * (ex: Chat)</label>
              <input name="species" required defaultValue="Chat" className={input} />
              {err('species')}
            </div>
            <div>
              <label className="text-xs font-medium">Sexe *</label>
              <select name="sex" className={input} defaultValue="Mâle">
                <option>Mâle</option>
                <option>Femelle</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">N° I-CAD (puce) *</label>
              <input name="identificationNumber" required className={input} />
              {err('identificationNumber')}
            </div>
            <div>
              <label className="text-xs font-medium">Né(e) le</label>
              <input name="birthDate" type="date" className={input} />
            </div>
            <div>
              <label className="text-xs font-medium">Stérilisé(e)</label>
              <select name="isSterilized" className={input} defaultValue="false">
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </select>
            </div>
          </div>

          {state.message && (
            <p className={`text-xs rounded p-2 ${state.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="bg-slate-900 text-white text-xs font-medium rounded px-3 py-2 disabled:opacity-50"
          >
            {isPending ? 'Ajout…' : 'Ajouter la fiche animal'}
          </button>
        </form>
      )}
    </div>
  );
}
