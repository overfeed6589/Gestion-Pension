'use client';

import { useState } from 'react';
import {
  proposeAvailabilityAction,
  submitProposalAction,
} from '@/app/reserver/actions';
import type { PublicAvailabilityResult, PublicCategoryOption } from '@/lib/availability';
import type { CreatePublicProposalInput, PublicPetInput } from '@/lib/public-reservation';
import { formatCents } from '@/lib/money';

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
const todayPlus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateInput(d);
};

type FullOption = { kind: 'category'; categoryId: string; requiredSpaces: number };
type SplitOption = {
  kind: 'split';
  portions: { categoryId: string; startDate: string; endDate: string }[];
};

export function ReservationWizard() {
  const [step, setStep] = useState(1);

  const [dates, setDates] = useState({ startDate: todayPlus(1), endDate: todayPlus(8) });
  const [petCount, setPetCount] = useState(1);
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '' });
  const [consent, setConsent] = useState(false);

  const [availability, setAvailability] = useState<PublicAvailabilityResult | null>(null);
  const [selected, setSelected] = useState<FullOption | SplitOption | null>(null);
  const [pets, setPets] = useState<PublicPetInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const setPet = (i: number, patch: Partial<PublicPetInput>) =>
    setPets((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const input = 'mt-1 w-full border rounded-lg p-2 text-sm';
  const label = 'block text-sm font-medium';
  const btn = 'bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-40';
  const box = 'bg-white border rounded-xl p-5 shadow-sm space-y-4';

  const availSplit = availability?.split;
  const splitSegments = availSplit && availSplit.ok ? availSplit.segments : [];
  const hasSplit = splitSegments.length > 0;

  const searchAvailability = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await proposeAvailabilityAction({
        startDate: dates.startDate,
        endDate: dates.endDate,
        petCount,
      });
      if (!res.success || !res.data) {
        setError(res.message ?? 'Erreur.');
        return;
      }
      const avail = res.data as PublicAvailabilityResult;
      setAvailability(avail);
      if (avail.split && avail.split.ok) {
        setSelected({
          kind: 'split',
          portions: avail.split.segments.map((s) => ({
            categoryId: s.categoryId,
            startDate: s.startDate,
            endDate: s.endDate,
          })),
        });
      }
      setPets(
        Array.from({ length: petCount }, () => ({
          name: '',
          species: 'Chat',
          sex: 'Mâle',
          isSterilized: false,
        }))
      );
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const startPets = () => {
    if (!selected) return setError('Choisissez d’abord une option.');
    setStep(3);
  };

  const submit = async () => {
    if (!consent) return setError('Consentement requis pour traiter votre demande.');
    if (!selected || pets.length !== petCount) return setError('Formulaire incomplet.');
    const payload: CreatePublicProposalInput = {
      contact: { ...contact, address: contact.address || null },
      checkInDate: dates.startDate,
      checkOutDate: dates.endDate,
      petCount,
      pets,
      option: selected,
      consent: true,
      requestNotes: null,
    };
    setLoading(true);
    setError(null);
    try {
      const res = await submitProposalAction(payload);
      if (!res.success) {
        setError(res.message ?? 'Erreur.');
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-900 space-y-2">
        <p className="font-semibold text-lg">Demande envoyée !</p>
        <p className="text-sm">
          Un email de confirmation vient de partir. Nous revenons vers vous sous 24/48 h avec le
          lien de paiement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Étapes 1 & contact */}
      {step === 1 && (
        <div className={box}>
          <h2 className="font-semibold text-lg">1. Votre demande</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Prénom</label>
              <input className={input} value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
            </div>
            <div>
              <label className={label}>Nom</label>
              <input className={input} value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input type="email" className={input} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </div>
            <div>
              <label className={label}>Téléphone</label>
              <input className={input} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className={label}>Adresse (optionnel)</label>
              <input className={input} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
            </div>
            <div>
              <label className={label}>Arrivée</label>
              <input type="date" className={input} value={dates.startDate} onChange={(e) => setDates({ ...dates, startDate: e.target.value })} />
            </div>
            <div>
              <label className={label}>Départ</label>
              <input type="date" className={input} value={dates.endDate} onChange={(e) => setDates({ ...dates, endDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className={label}>Nombre de chats</label>
              <select className={input} value={petCount} onChange={(e) => setPetCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <button className={btn} onClick={searchAvailability} disabled={loading}>
            {loading ? <Spinner label="Recherche…" /> : 'Voir les disponibilités →'}
          </button>
        </div>
      )}

      {/* Étapes 2 : propositions */}
      {step === 2 && availability && (
        <div className={box}>
          <h2 className="font-semibold text-lg">2. Choisissez votre hébergement</h2>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-3">
            {availability.options.filter((o) => o.freeFullRange).length === 0 && (
              <p className="text-sm text-slate-800">Aucune catégorie n’est libre en continu sur ces dates.</p>
            )}
            {availability.options
              .filter((o) => o.freeFullRange)
              .map((o) => (
                <OptionCard
                  key={o.categoryId}
                  option={o}
                  nights={nightsBetween(dates.startDate, dates.endDate)}
                  selected={selected?.kind === 'category' && selected.categoryId === o.categoryId}
                  onSelect={() => setSelected({ kind: 'category', categoryId: o.categoryId, requiredSpaces: o.requiredSpaces })}
                />
              ))}

            {hasSplit && (
              <div className="border border-dashed rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold">Solution en découpage (mixte)</p>
                {splitSegments.map((seg, i) => {
                  const opt = availability.options.find((o) => o.categoryId === seg.categoryId);
                  const segNights = nightsBetween(seg.startDate, seg.endDate);
                  return (
                    <p key={i} className="text-xs text-slate-800">
                      {i + 1}. {opt?.publicName || opt?.name || seg.categoryId} — {segNights} nuitée(s)
                      {opt ? ` (≈ ${formatCents(opt.perNightPriceCents * segNights)})` : ''}
                    </p>
                  );
                })}
                <button
                  className="text-xs underline text-slate-700"
                  onClick={() =>
                    setSelected({
                      kind: 'split',
                      portions: splitSegments.map((s) => ({
                        categoryId: s.categoryId,
                        startDate: s.startDate,
                        endDate: s.endDate,
                      })),
                    })
                  }
                >
                  {selected?.kind === 'split' ? '✓ Sélectionné' : 'Choisir cette solution'}
                </button>
              </div>
            )}
          </div>
          <button className={btn} onClick={startPets}>
            Continuer →
          </button>
        </div>
      )}

      {/* Étape 3 : animaux */}
      {step === 3 && (
        <div className={box}>
          <h2 className="font-semibold text-lg">3. Vos animaux</h2>
          {pets.map((pet, i) => (
            <fieldset key={i} className="border rounded-xl p-4 space-y-3 bg-slate-50">
              <legend className="text-sm font-medium px-1">Animal {i + 1}</legend>
              <p className="text-xs text-slate-700">Espèce : Chat (verrouillé)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Nom</label>
                  <input className={input} value={pet.name} onChange={(e) => setPet(i, { name: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Sexe</label>
                  <select className={input} value={pet.sex} onChange={(e) => setPet(i, { sex: e.target.value })}>
                    <option>Mâle</option>
                    <option>Femelle</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Stérilisé(e)</label>
                  <select className={input} value={pet.isSterilized ? 'true' : 'false'} onChange={(e) => setPet(i, { isSterilized: e.target.value === 'true' })}>
                    <option value="false">Non</option>
                    <option value="true">Oui</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Né(e) le (optionnel)</label>
                  <input type="date" className={input} value={pet.birthDate ?? ''} onChange={(e) => setPet(i, { birthDate: e.target.value || null })} />
                </div>
                <div className="col-span-2">
                  <label className={label}>N° I-CAD (optionnel maintenant)</label>
                  <input className={input} value={pet.identificationNumber ?? ''} onChange={(e) => setPet(i, { identificationNumber: e.target.value || null })} />
                </div>
              </div>
            </fieldset>
          ))}
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>J’accepte que mes coordonnées et celles de mes animaux soient utilisées pour traiter cette réservation.</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className={btn} onClick={submit} disabled={pets.some((p) => !p.name) || loading}>
            {loading ? <Spinner label="Envoi…" /> : 'Envoyer la demande'}
          </button>
        </div>
      )}
    </div>
  );
}

function nightsBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      {label}
    </span>
  );
}

function OptionCard({
  option: o,
  nights,
  selected,
  onSelect,
}: {
  option: PublicCategoryOption;
  nights: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border rounded-xl p-4 transition ${selected ? 'ring-2 ring-slate-900 border-slate-900' : 'hover:border-slate-400'}`}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">{o.publicName || o.name}</p>
        <p className="text-sm font-medium">{formatCents(o.perNightPriceCents)}/nuit</p>
      </div>
      {o.publicDescription && <p className="text-xs text-slate-800 mt-1">{o.publicDescription}</p>}
      <p className="text-xs text-slate-700 mt-2">
        {nights} nuitée(s) — estimation {formatCents(o.perNightPriceCents * nights)}{' '}
        {o.requiredSpaces > 1 ? `· ${o.requiredSpaces} espaces` : ''}
      </p>
    </button>
  );
}
