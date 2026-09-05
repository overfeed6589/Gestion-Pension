'use client';

import { useActionState, useState } from 'react';
import { createBookingWithOfferAction } from '@/app/dashboard/offres/actions';
import type { CreateOfferInput } from '@/lib/booking-offers';
import type { ActionState } from '@/types/actions';

type CategoryOption = {
  id: string;
  name: string;
  capacity: number;
  basePricePerNight: number;
  surchargePerAnimal: number;
};

type ClientOption = {
  id: string;
  firstName: string;
  lastName: string;
  pets: { id: string; name: string; species: string }[];
};

export type OfferFormProps = {
  clients: ClientOption[];
  categories: CategoryOption[];
};

type Row = { startDate: string; endDate: string; categoryId: string };

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

const initialActionState: ActionState = { success: false };

export function OfferForm({ clients, categories }: OfferFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionState, payload: CreateOfferInput) => createBookingWithOfferAction(payload),
    initialActionState
  );

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([
    { startDate: todayPlus(0), endDate: todayPlus(7), categoryId: categories[0]?.id ?? '' },
  ]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const togglePet = (petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const submit = () => {
    if (rows.length === 0 || selectedPetIds.length === 0 || !clientId) return;
    formAction({
      clientId,
      checkInDate: rows[0].startDate,
      checkOutDate: rows[rows.length - 1].endDate,
      segments: rows.map((row) => ({
        startDate: row.startDate,
        endDate: row.endDate,
        categoryId: row.categoryId,
        petIds: [...selectedPetIds],
      })),
      source: 'phone',
    });
  };

  return (
    <div className="bg-white border rounded-xl p-5 space-y-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-lg">Nouvelle offre de séjour</h2>
        <p className="text-xs text-slate-500">
          Les espaces sont bloqués dès la création. L’acompte (défaut 30 %) confirme la réservation.
        </p>
      </div>

      {/* Client */}
      <label className="block text-sm font-medium">
        Client
        <select
          className="mt-1 w-full border rounded p-2 text-sm"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setSelectedPetIds([]);
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </label>

      {/* Animaux */}
      {selectedClient && selectedClient.pets.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Animaux du séjour</p>
          <div className="flex flex-wrap gap-2">
            {selectedClient.pets.map((pet) => {
              const active = selectedPetIds.includes(pet.id);
              return (
                <button
                  key={pet.id}
                  type="button"
                  onClick={() => togglePet(pet.id)}
                  className={`px-3 py-1 rounded-full text-sm border transition ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {pet.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {selectedClient && selectedClient.pets.length === 0 && (
        <p className="text-xs text-amber-600">Ce client n’a pas encore d’animal : ajoutez-en dans Clients.</p>
      )}

      {/* Segments (découpage temporel — ex: 11 j type A + 2 j type B) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Découpage du séjour</p>
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  startDate: prev[prev.length - 1]?.endDate || todayPlus(0),
                  endDate: todayPlus(7),
                  categoryId: categories[0]?.id ?? '',
                },
              ])
            }
            className="text-xs text-slate-600 underline"
          >
            + Ajouter un espace/période
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
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} (capacité {cat.capacity})
                  </option>
                ))}
              </select>
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                className="self-end justify-self-end text-xs text-red-600"
              >
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={isPending || selectedPetIds.length === 0 || rows.length === 0}
        onClick={submit}
        className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
      >
        {isPending ? 'Création…' : 'Créer l’offre (bloque les espaces)'}
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
