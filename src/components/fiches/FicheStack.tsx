'use client';

import { useEffect, useState } from 'react';
import { loadFiche } from '@/lib/fiches/loaders';
import { useFicheRouter } from './useFicheRouter';
import { FicheModal } from './FicheModal';
import { FicheAnimalView, FicheClientView, FicheReservationView } from './FicheViews';
import type { FicheData, FicheRef } from '@/types/fiches';

// ---------------------------------------------------------------------------
// FicheStack : rendu des fenêtres ouvertes (Phase H1)
// ---------------------------------------------------------------------------
// Monté une fois dans le layout du dashboard : lit l'URL, charge les données
// de chaque fiche via une server action (jamais de navigation), et rend les
// fenêtres empilées. Un clic sur un lien interne pousse un nouveau param —
// aucune page n'est rechargée.
// ---------------------------------------------------------------------------

const TITLES: Record<FicheRef['kind'], string> = {
  client: 'Fiche client',
  pet: 'Fiche animal',
  booking: 'Fiche réservation',
};

function titleFor(ref: FicheRef, data: FicheData | null): string {
  if (!data) return TITLES[ref.kind];
  switch (data.kind) {
    case 'client':
      return `${data.data.firstName} ${data.data.lastName}`;
    case 'pet':
      return data.data.name;
    case 'booking': {
      const d = data.data;
      return d.client ? `Réservation — ${d.client.firstName} ${d.client.lastName}` : 'Réservation';
    }
  }
}

function subtitleFor(ref: FicheRef, data: FicheData | null): string | undefined {
  if (!data) return undefined;
  switch (data.kind) {
    case 'client':
      return data.data.email;
    case 'pet':
      return `${data.data.species}${data.data.breed ? ` — ${data.data.breed}` : ''}`;
    case 'booking': {
      const d = data.data;
      return `${new Date(d.checkInDate).toLocaleDateString('fr-FR')} → ${new Date(
        d.checkOutDate
      ).toLocaleDateString('fr-FR')}`;
    }
  }
}

function FicheLayer({
  ref_,
  depth,
  isTop,
  onClose,
}: {
  ref_: FicheRef;
  depth: number;
  isTop: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; fiche: FicheData }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadFiche(ref_.kind, ref_.id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState({ status: 'ready', fiche: result.fiche });
        } else {
          setState({ status: 'error', message: result.message });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Erreur de chargement de la fiche.' });
      });
    return () => {
      cancelled = true;
    };
  }, [ref_.kind, ref_.id]);

  const data = state.status === 'ready' ? state.fiche : null;

  return (
    <FicheModal
      depth={depth}
      title={titleFor(ref_, data)}
      subtitle={subtitleFor(ref_, data)}
      onClose={onClose}
      isTop={isTop}
    >
      {state.status === 'loading' && (
        <p className="text-sm text-muted-foreground animate-pulse">Chargement…</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === 'ready' && state.fiche.kind === 'client' && <FicheClientView data={state.fiche.data} />}
      {state.status === 'ready' && state.fiche.kind === 'pet' && <FicheAnimalView data={state.fiche.data} />}
      {state.status === 'ready' && state.fiche.kind === 'booking' && <FicheReservationView data={state.fiche.data} />}
    </FicheModal>
  );
}

export function FicheStack() {
  const { stack, close } = useFicheRouter();

  return (
    <>
{stack.map((ref, index) => (
        <FicheLayer
          key={`${ref.kind}-${ref.id}-${index}`}
          ref_={ref}
          depth={index}
          isTop={index === stack.length - 1}
          onClose={close}
        />
      ))}
    </>
  );
}