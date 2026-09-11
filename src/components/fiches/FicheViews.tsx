'use client';

import { formatCents } from '@/lib/money';
import { FicheLink } from './FicheLink';
import { FicheEmpty, FicheRow, FicheSection, StatusBadge } from './fiche-parts';
import type { FicheAnimalData, FicheBookingSummary, FicheClientData, FicheReservationData } from '@/types/fiches';

// ---------------------------------------------------------------------------
// Fiche client (Phase H1) — consultation seule à cette itération ; les
// actions d'édition restent sur les pages existantes (H3 les intégrera).
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_TONES: Record<string, 'neutral' | 'ok' | 'warn' | 'bad'> = {
  unpaid: 'bad',
  deposit_paid: 'warn',
  fully_paid: 'ok',
  partially_refunded: 'bad',
  refunded: 'neutral',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Non payée',
  deposit_paid: 'Acompte reçu',
  fully_paid: 'Soldée',
  partially_refunded: 'Partiellement remboursée',
  refunded: 'Remboursée',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function BookingSummaryRows({ bookings }: { bookings: FicheBookingSummary[] }) {
  if (bookings.length === 0) {
    return <FicheEmpty message="Aucune réservation." />;
  }
  return (
    <>
      {bookings.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {formatDay(b.checkInDate)} → {formatDay(b.checkOutDate)}
          </span>
          <StatusBadge tone={PAYMENT_STATUS_TONES[b.paymentStatus] ?? 'neutral'}>
            {PAYMENT_STATUS_LABELS[b.paymentStatus] ?? b.paymentStatus}
          </StatusBadge>
          <span className="ml-auto font-medium">{formatCents(b.totalPrice)}</span>
          <FicheLink kind="booking" id={b.id} className="text-xs underline underline-offset-2 decoration-slate-300 hover:decoration-slate-800">
            Voir la réservation
          </FicheLink>
        </div>
      ))}
    </>
  );
}

export function FicheClientView({ data }: { data: FicheClientData }) {
  return (
    <div className="space-y-5">
      <FicheSection title="Coordonnées">
        <FicheRow label="Email">{data.email}</FicheRow>
        <FicheRow label="Téléphone">{data.phone}</FicheRow>
        {data.address && <FicheRow label="Adresse">{data.address}</FicheRow>}
        {data.emergencyContactName && (
          <FicheRow label="Contact d'urgence">
            {data.emergencyContactName}
            {data.emergencyContactPhone ? ` • ${data.emergencyContactPhone}` : ''}
          </FicheRow>
        )}
        {data.isB2b && <FicheRow label="Entreprise (B2B)">SIRET : {data.siret ?? '—'}</FicheRow>}
      </FicheSection>

      <FicheSection title="Animaux">
        {data.pets.length === 0 ? (
          <FicheEmpty message="Aucun animal enregistré." />
        ) : (
          <>
            {data.pets.map((pet) => (
              <div key={pet.id} className="px-3 py-2 text-sm">
                <FicheLink kind="pet" id={pet.id}>
                  {pet.name}
                </FicheLink>
                <span className="text-muted-foreground"> — {pet.species}</span>
                {pet.breed && <span className="text-muted-foreground"> ({pet.breed})</span>}
              </div>
            ))}
          </>
        )}
      </FicheSection>

      <FicheSection title="Réservations">
        <BookingSummaryRows bookings={data.bookings} />
      </FicheSection>

      {data.invoicesCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.invoicesCount} facture(s) — visibles dans la liste Factures.
        </p>
      )}
    </div>
  );
}

export function FicheAnimalView({ data }: { data: FicheAnimalData }) {
  return (
    <div className="space-y-5">
      {data.owner && (
        <FicheSection title="Propriétaire">
          <FicheRow label="Client">
            <FicheLink kind="client" id={data.owner.id}>
              {data.owner.firstName} {data.owner.lastName}
            </FicheLink>
          </FicheRow>
        </FicheSection>
      )}

      <FicheSection title="Identité">
        <FicheRow label="Espèce / race">
          {data.species}
          {data.breed ? ` — ${data.breed}` : ''}
        </FicheRow>
        <FicheRow label="Sexe / stérilisation">
          {data.sex} • {data.isSterilized ? 'stérilisé' : 'non stérilisé'}
        </FicheRow>
        <FicheRow label="Naissance">
          {data.birthDate ? new Date(data.birthDate).toLocaleDateString('fr-FR') : '—'}
        </FicheRow>
        <FicheRow label="Identification">{data.identificationNumber ?? '—'}</FicheRow>
        <FicheRow label="Passeport">{data.passportNumber ?? '—'}</FicheRow>
      </FicheSection>

      <FicheSection title="Santé">
        <FicheRow label="Vaccins">
          <StatusBadge tone={data.vaccinesUpToDate ? 'ok' : 'bad'}>
            {data.vaccinesUpToDate ? 'À jour' : 'À faire'}
          </StatusBadge>
        </FicheRow>
        {data.vaccines.length > 0 && (
          <FicheRow label="Détail">
            <ul className="space-y-1">
              {data.vaccines.map((v, i) => (
                <li key={`${v.name}-${i}`}>
                  {v.name}
                  {v.expiresAt ? ` (rappel ${new Date(v.expiresAt).toLocaleDateString('fr-FR')})` : ''}
                </li>
              ))}
            </ul>
          </FicheRow>
        )}
        <FicheRow label="Vétérinaire">
          {data.veterinarianName ?? '—'}
          {data.veterinarianPhone ? ` • ${data.veterinarianPhone}` : ''}
        </FicheRow>
        <FicheRow label="Notes médicales">{data.medicalNotes ?? '—'}</FicheRow>
      </FicheSection>

      <FicheSection title="Séjours">
        {data.stays.length === 0 ? (
          <FicheEmpty message="Aucun séjour." />
        ) : (
          <>
            {data.stays.map((stay, i) => (
              <div
                key={`${stay.id}-${stay.categoryName}-${i}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {formatDay(stay.checkInDate)} → {formatDay(stay.checkOutDate)}
                </span>
                <span>
                  {stay.categoryName}
                  {stay.unitName ? ` • ${stay.unitName}` : ''}
                </span>
                <StatusBadge tone={PAYMENT_STATUS_TONES[stay.paymentStatus] ?? 'neutral'}>
                  {PAYMENT_STATUS_LABELS[stay.paymentStatus] ?? stay.paymentStatus}
                </StatusBadge>
                <FicheLink kind="booking" id={stay.id} className="ml-auto text-xs underline underline-offset-2 decoration-slate-300 hover:decoration-slate-800">
                  Voir la réservation
                </FicheLink>
              </div>
            ))}
          </>
        )}
      </FicheSection>
    </div>
  );
}

export function FicheReservationView({ data }: { data: FicheReservationData }) {
  return (
    <div className="space-y-5">
      <FicheSection title="Séjour">
        <FicheRow label="Dates">
          {formatDay(data.checkInDate)} → {formatDay(data.checkOutDate)}
        </FicheRow>
        <FicheRow label="Créneaux">
          {[
            data.arrivalTimeSlot ? `Arrivée : ${data.arrivalTimeSlot}` : null,
            data.departureTimeSlot ? `Départ : ${data.departureTimeSlot}` : null,
          ]
            .filter(Boolean)
            .join(' • ') || '—'}
        </FicheRow>
        <FicheRow label="Statut">{data.status}</FicheRow>
      </FicheSection>

      {data.client && (
        <FicheSection title="Client">
          <FicheRow label="Nom">
            <FicheLink kind="client" id={data.client.id}>
              {data.client.firstName} {data.client.lastName}
            </FicheLink>
          </FicheRow>
          <FicheRow label="Téléphone">{data.client.phone}</FicheRow>
        </FicheSection>
      )}

      <FicheSection title="Animaux">
        {data.pets.length === 0 ? (
          <FicheEmpty message="Aucun animal affecté." />
        ) : (
          <>
            {data.pets.map((pet) => (
              <div key={pet.id} className="px-3 py-2 text-sm">
                <FicheLink kind="pet" id={pet.id}>
                  {pet.name}
                </FicheLink>
                <span className="text-muted-foreground"> — {pet.species}</span>
              </div>
            ))}
          </>
        )}
      </FicheSection>

      <FicheSection title="Espaces">
        {data.segments.length === 0 ? (
          <FicheEmpty message="Aucun segment (réservation non construite)."/>
        ) : (
          <>
            {data.segments.map((s) => (
              <div key={s.id} className="px-3 py-2 text-sm">
                <span>
                  {s.categoryName}
                  {s.unitName ? ` • ${s.unitName}` : ' (unité à attribuer)'}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  — {s.startDate} → {s.endDate} • {formatCents(s.segmentPrice)}
                </span>
                {s.petNames.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{s.petNames.join(', ')}</p>
                )}
              </div>
            ))}
          </>
        )}
      </FicheSection>

      <FicheSection title="Paiement">
        <FicheRow label="Total">{formatCents(data.totalPrice)}</FicheRow>
        <FicheRow label="Acompte">{formatCents(data.depositAmount)}</FicheRow>
        <FicheRow label="Statut">
          <StatusBadge tone={PAYMENT_STATUS_TONES[data.paymentStatus] ?? 'neutral'}>
            {PAYMENT_STATUS_LABELS[data.paymentStatus] ?? data.paymentStatus}
          </StatusBadge>
        </FicheRow>
        {data.payments.length > 0 && (
          <FicheRow label="Encaissements">
            <ul className="space-y-1">
              {data.payments.map((p) => (
                <li key={p.id}>
                  {formatCents(p.amount)} • {p.method} • {p.status} •{' '}
                  {new Date(p.paidAt).toLocaleDateString('fr-FR')}
                </li>
              ))}
            </ul>
          </FicheRow>
        )}
      </FicheSection>

      {(data.dietNotes || data.belongingsNotes || data.requestNotes) && (
        <FicheSection title="Notes">
          {data.dietNotes && <FicheRow label="Alimentation">{data.dietNotes}</FicheRow>}
          {data.belongingsNotes && <FicheRow label="Affaires">{data.belongingsNotes}</FicheRow>}
          {data.requestNotes && <FicheRow label="Demande client">{data.requestNotes}</FicheRow>}
        </FicheSection>
      )}

      {data.extraServices.length > 0 && (
        <FicheSection title="Services annexes">
          <>
            {data.extraServices.map((s) => (
              <div key={s.id} className="flex justify-between gap-4 px-3 py-2 text-sm">
                <span>
                  {s.serviceName}
                  {s.petName ? ` (${s.petName})` : ''} ×{s.quantity}
                </span>
                <span>{formatCents(s.totalPrice)}</span>
              </div>
            ))}
          </>
        </FicheSection>
      )}

      {data.invoices.length > 0 && (
        <FicheSection title="Factures">
          <>
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex justify-between gap-4 px-3 py-2 text-sm">
                <span>{inv.invoiceNumber}</span>
                <span className="text-muted-foreground">{inv.type} • {inv.status}</span>
                <span>{formatCents(inv.totalInCents)}</span>
              </div>
            ))}
          </>
        </FicheSection>
      )}
    </div>
  );
}