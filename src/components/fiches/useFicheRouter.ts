'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FICHE_PARAM,
  ficheUrl,
  isSameFicheRef,
  parseFicheStack,
} from './fiche-url';
import type { FicheKind, FicheRef } from '@/types/fiches';

// ---------------------------------------------------------------------------
// Hook de pilotage des fiches pop-up (Phase H1)
// ---------------------------------------------------------------------------
// `window.history.pushState` est intégré au routeur App : il met à jour
// l'URL SANS re-render du server component (pas de navigation, pas de
// rechargement) — c'est ce qui rend les fiches fluides. `useSearchParams`
// reflète ces changements.
// ---------------------------------------------------------------------------

function pushStack(stack: FicheRef[]) {
  window.history.pushState(null, '', ficheUrl(stack));
}

/** Pile courante des fiches ouvertes (profondeur = ordre d'ouverture). */
export function useFicheStack(): FicheRef[] {
  const params = useSearchParams();
  return useMemo(() => parseFicheStack(params.get(FICHE_PARAM)), [params]);
}

/**
 * Actions d'ouverture/fermeture. `open` empile (un clic sur un nom ouvre la
 * fiche par-dessus l'existante), `close` ferme la fiche au premier plan,
 * `closeAll` ferme tout d'un coup (bouton croix de la fiche racine).
 */
export function useFicheRouter() {
  const stack = useFicheStack();

  const open = useCallback(
    (kind: FicheKind, id: string) => {
      const top = stack.at(-1);
      if (top && isSameFicheRef(top, { kind, id })) return;
      pushStack([...stack, { kind, id }]);
    },
    [stack]
  );

  const close = useCallback(() => {
    pushStack(stack.slice(0, -1));
  }, [stack]);

  const closeAll = useCallback(() => {
    pushStack([]);
  }, []);

  return { stack, open, close, closeAll };
}