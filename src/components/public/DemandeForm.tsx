'use client';

import { useActionState } from 'react';
import { submitPublicDemandeAction } from '@/app/reservation/action';
import { ActionState } from '@/types/actions';

const initialState: ActionState = { success: false };

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DemandeForm() {
  const [state, formAction, isPending] = useActionState(submitPublicDemandeAction, initialState);

  if (state.success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-emerald-900 space-y-2">
        <p className="font-semibold text-lg">Merci, votre demande est bien enregistrée !</p>
        <p className="text-sm">{state.message}</p>
        <p className="text-xs text-emerald-700">
          Vous pouvez aussi nous appeler directement pour accélérer la réservation.
        </p>
      </div>
    );
  }

  const fieldError = (name: string) =>
    state.errors?.[name]?.[0] ? <p className="text-red-600 text-xs mt-1">{state.errors[name][0]}</p> : null;

  return (
    <form action={formAction} className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Prénom</label>
          <input name="firstName" className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('firstName')}
        </div>
        <div>
          <label className="text-sm font-medium">Nom</label>
          <input name="lastName" className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('lastName')}
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <input name="email" type="email" className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('email')}
        </div>
        <div>
          <label className="text-sm font-medium">Téléphone</label>
          <input name="phone" type="tel" className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('phone')}
        </div>
        <div>
          <label className="text-sm font-medium">Arrivée</label>
          <input name="checkInDate" type="date" defaultValue={todayPlus(0)} className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('checkInDate')}
        </div>
        <div>
          <label className="text-sm font-medium">Départ</label>
          <input name="checkOutDate" type="date" defaultValue={todayPlus(7)} className="border rounded-lg p-2 w-full text-sm" required />
          {fieldError('checkOutDate')}
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Nombre de chats</label>
          <select name="petCount" className="border rounded-lg p-2 w-full text-sm" defaultValue="1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {fieldError('petCount')}
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Message (optionnel)</label>
          <textarea name="message" rows={3} className="border rounded-lg p-2 w-full text-sm" />
        </div>
      </div>

      {/* Honeypot — doit rester vide */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input name="consent" type="checkbox" className="mt-0.5" required />
        <span>
          J’accepte que mes coordonnées soient utilisées pour traiter ma demande de réservation
          (données conservées le temps de la relation, jamais transmises à des tiers).
        </span>
      </label>
      {fieldError('consent')}

      {state.message && !state.success && (
        <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? 'Envoi…' : 'Demander une réservation'}
      </button>
    </form>
  );
}
