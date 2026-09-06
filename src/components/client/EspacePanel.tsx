'use client';

import { useState } from 'react';
import {
  completePetAction,
  setTimeSlotsAction,
  payBookingAction,
  type PetCompletionFields,
} from '@/app/espace/actions';
import { formatCents } from '@/lib/money';

export type EspacePet = {
  id: string;
  name: string;
  species: string;
  sex: string;
  isSterilized: boolean;
  birthDate: string | null;
  identificationNumber: string | null;
  breed: string | null;
  veterinarianName: string | null;
  veterinarianPhone: string | null;
  vaccinesUpToDate: boolean;
  medicalNotes: string | null;
};

export type EspaceBooking = {
  id: string;
  status: string;
  statusLabel: string;
  checkInDate: string;
  checkOutDate: string;
  totalPrice: number;
  depositAmount: number;
  paid: number;
  outstanding: number;
  arrivalTimeSlot: string | null;
  departureTimeSlot: string | null;
};

export type EspacePanelData = {
  token: string;
  firstName: string;
  arrivalSlots: string[];
  departureSlots: string[];
  pets: EspacePet[];
  bookings: EspaceBooking[];
};

export function EspacePanel({ data }: { data: EspacePanelData }) {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bonjour {data.firstName}</h1>
        <p className="text-slate-700">
          Complétez vos informations, choisissez vos heures et réglez votre séjour.
        </p>
      </div>

      {/* Animaux */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Vos animaux</h2>
        {data.pets.map((pet) => (
          <PetForm key={pet.id} token={data.token} pet={pet} />
        ))}
      </section>

      {/* Réservations */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Vos réservations</h2>
        {data.bookings.length === 0 ? (
          <p className="text-sm text-slate-700 italic bg-white border rounded-xl p-6">
            Aucune réservation pour l’instant.
          </p>
        ) : (
          data.bookings.map((b) => <BookingCard key={b.id} token={data.token} booking={b} data={data} />)
        )}
      </section>
    </div>
  );
}

const input = 'mt-1 w-full border rounded-lg p-2 text-sm';
const label = 'block text-sm font-medium';

function PetForm({ token, pet }: { token: string; pet: EspacePet }) {
  const [fields, setFields] = useState<PetCompletionFields>({
    identificationNumber: pet.identificationNumber ?? undefined,
    birthDate: pet.birthDate ?? undefined,
    breed: pet.breed ?? undefined,
    sex: pet.sex,
    isSterilized: pet.isSterilized,
    veterinarianName: pet.veterinarianName ?? undefined,
    veterinarianPhone: pet.veterinarianPhone ?? undefined,
    vaccinesUpToDate: pet.vaccinesUpToDate,
    medicalNotes: pet.medicalNotes ?? undefined,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<PetCompletionFields>) => setFields((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await completePetAction(token, pet.id, {
      ...fields,
      birthDate: fields.birthDate || null,
    });
    setBusy(false);
    if (res.success) setMsg('Enregistré ✓');
    else setErr(res.message ?? 'Erreur.');
  };

  const missing = !fields.identificationNumber;

  return (
    <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {pet.name}{' '}
          <span className="text-xs font-normal text-slate-700">({pet.species})</span>
        </p>
        {missing && (
          <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
            I-CAD manquant
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>N° I-CAD (puce)</label>
          <input
            className={input}
            value={fields.identificationNumber ?? ''}
            onChange={(e) => set({ identificationNumber: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Né(e) le</label>
          <input
            type="date"
            className={input}
            value={fields.birthDate ?? ''}
            onChange={(e) => set({ birthDate: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Vaccins à jour</label>
          <select
            className={input}
            value={fields.vaccinesUpToDate ? 'true' : 'false'}
            onChange={(e) => set({ vaccinesUpToDate: e.target.value === 'true' })}
          >
            <option value="true">Oui</option>
            <option value="false">Non / à préciser</option>
          </select>
        </div>
        <div>
          <label className={label}>Vétérinaire (nom)</label>
          <input
            className={input}
            value={fields.veterinarianName ?? ''}
            onChange={(e) => set({ veterinarianName: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Vétérinaire (téléphone)</label>
          <input
            className={input}
            value={fields.veterinarianPhone ?? ''}
            onChange={(e) => set({ veterinarianPhone: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className={label}>Notes santé / comportement</label>
          <input
            className={input}
            value={fields.medicalNotes ?? ''}
            onChange={(e) => set({ medicalNotes: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="bg-slate-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {busy ? '…' : 'Enregistrer'}
        </button>
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </div>
  );
}

function BookingCard({
  token,
  booking,
  data,
}: {
  token: string;
  booking: EspaceBooking;
  data: EspacePanelData;
}) {
  const [arrival, setArrival] = useState(booking.arrivalTimeSlot ?? '');
  const [departure, setDeparture] = useState(booking.departureTimeSlot ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const slotsAllowed = ['offered', 'confirmed', 'checked_in'].includes(booking.status);
  const canDeposit = booking.status === 'offered' && booking.paid === 0 && booking.depositAmount > 0;
  const canPay = ['offered', 'confirmed'].includes(booking.status) && booking.outstanding > 0;

  const saveSlots = async () => {
    setBusy(true);
    setMsg(null);
    const res = await setTimeSlotsAction(
      token,
      booking.id,
      arrival || null,
      departure || null
    );
    setBusy(false);
    setMsg(res.message ?? null);
  };

  const pay = async (kind: 'deposit' | 'payment') => {
    setBusy(true);
    setMsg(null);
    const res = await payBookingAction(token, booking.id, kind);
    setBusy(false);
    if (res.success && res.data && typeof res.data === 'object' && 'paymentUrl' in res.data) {
      const url = (res.data as { paymentUrl?: string }).paymentUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      setMsg(res.message ?? 'Erreur.');
    }
  };

  return (
    <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {booking.checkInDate} → {booking.checkOutDate}
          </p>
          <p className="text-xs text-slate-700">
            Total {formatCents(booking.totalPrice)} · Payé {formatCents(booking.paid)} · Reste{' '}
            {formatCents(booking.outstanding)}
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-800 whitespace-nowrap">
          {booking.statusLabel}
        </span>
      </div>

      {(canDeposit || canPay) && (
        <div className="flex flex-wrap gap-2">
          {canDeposit && (
            <button
              onClick={() => pay('deposit')}
              disabled={busy}
              className="bg-slate-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              Payer l’acompte ({formatCents(booking.depositAmount)})
            </button>
          )}
          {canPay && (
            <button
              onClick={() => pay('payment')}
              disabled={busy}
              className="bg-emerald-700 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {booking.paid === 0
                ? `Payer le séjour complet (${formatCents(booking.outstanding)})`
                : `Régler le solde (${formatCents(booking.outstanding)})`}
            </button>
          )}
        </div>
      )}

      {slotsAllowed && (
        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <label className={label}>Arrivée le {booking.checkInDate}</label>
            <select className={input} value={arrival} onChange={(e) => setArrival(e.target.value)}>
              <option value="">— à préciser —</option>
              {data.arrivalSlots.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Départ le {booking.checkOutDate}</label>
            <select className={input} value={departure} onChange={(e) => setDeparture(e.target.value)}>
              <option value="">— à préciser —</option>
              {data.departureSlots.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button
              onClick={saveSlots}
              disabled={busy}
              className="border border-slate-900 text-slate-900 text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              Enregistrer mes heures
            </button>
            {msg && <span className="text-sm text-slate-700">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
