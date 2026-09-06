'use client';

import { useState } from 'react';
import { adjustOfferAction } from '@/app/dashboard/offres/actions';
import { ActionState } from '@/types/actions';

type Row = { startDate: string; endDate: string; categoryId: string };

function todayPlus(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export type OfferEditFormProps = {
  bookingId: string;
  clientLabel: string;
  pets: { id: string; name: string }[];
  categories: { id: string; name: string; capacity: number }[];
  initialPetIds: string[];
  initialRows: Row[];
  initialStart: string;
  initialEnd: string;
};

const initialState: ActionState = { success: false };

export function OfferEditForm(props: OfferEditFormProps) {
  const [rows, setRows] = useState<Row[]>(
    props.initialRows.length > 0
      ? props.initialRows
      : [{ startDate: props.initialStart, endDate: props.initialEnd, categoryId: props.categories[0]?.id ?? '' }]
  );
  const [petIds, setPetIds] = useState<string[]>(props.initialPetIds);
  const [state, setState] = useState<ActionState>(initialState);
  const [busy, setBusy] = useState(false);

  const togglePet = (id: string) =>
    setPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (petIds.length === 0 || rows.length === 0) return;
    setBusy(true);
    setState(initialState);
    const res = await adjustOfferAction({
      bookingId: props.bookingId,
      checkInDate: rows[0].startDate,
      checkOutDate: rows[rows.length - 1].endDate,
      petIds,
      portions: rows.map((r) => ({ categoryId: r.categoryId, startDate: r.startDate, endDate: r.endDate })),
    });
    setBusy(false);
    setState(res);
  };

  return (
    <div className="bg-white border rounded-xl p-5 space-y-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Ajuster la réservation</h2>
        <span className="text-xs text-slate-700">{props.clientLabel}</span>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Animaux du séjour</p>
        <div className="flex flex-wrap gap-2">
          {props.pets.map((pet) => {
            const active = petIds.includes(pet.id);
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => togglePet(pet.id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300'
                }`}
              >
                {pet.name}
              </button>
            );
          })}
        </div>
        {petIds.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">Sélectionnez au moins un animal.</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Découpage du séjour</p>
          <button
            type="button"
            className="text-xs underline text-slate-700"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  startDate: prev[prev.length - 1]?.endDate || todayPlus(0),
                  endDate: todayPlus(7),
                  categoryId: props.categories[0]?.id ?? '',
                },
              ])
            }
          >
            + Ajouter une période
          </button>
        </div>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded-lg p-3 bg-slate-50">
            <label className="text-xs">
              Arrivée
              <input
                type="date"
                className="mt-1 w-full border rounded p-1.5 text-sm"
                value={row.startDate}
                onChange={(e) => updateRow(index, { startDate: e.target.value })}
              />
            </label>
            <label className="text-xs">
              Départ
              <input
                type="date"
                className="mt-1 w-full border rounded p-1.5 text-sm"
                value={row.endDate}
                onChange={(e) => updateRow(index, { endDate: e.target.value })}
              />
            </label>
            <label className="text-xs md:col-span-1">
              Espace
              <select
                className="mt-1 w-full border rounded p-1.5 text-sm"
                value={row.categoryId}
                onChange={(e) => updateRow(index, { categoryId: e.target.value })}
              >
                {props.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (capacité {c.capacity})
                  </option>
                ))}
              </select>
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                className="self-end justify-self-end text-xs text-red-600"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy || petIds.length === 0 || rows.length === 0}
        className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
      >
        {busy ? 'Mise à jour…' : 'Recalculer & enregistrer'}
      </button>

      {state.message && (
        <p
          className={`text-sm rounded-lg p-3 ${
            state.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
