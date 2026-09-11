import { isFicheKind, type FicheKind, type FicheRef } from '@/types/fiches';

// ---------------------------------------------------------------------------
// Encodage de la pile de fiches dans l'URL (Phase H1)
// ---------------------------------------------------------------------------
// Convention : `?fiche=client,<uuid>:booking,<uuid>` — un segment par fenêtre,
// ordre = profondeur (la dernière est au premier plan). Format volontairement
// court et partageable ; les séparateurs `:` et `,` ne sont pas encodés par
// URLSearchParams.
// ---------------------------------------------------------------------------

export const FICHE_PARAM = 'fiche';

export function parseFicheStack(raw: string | null | undefined): FicheRef[] {
  if (!raw) return [];
  return raw
    .split(':')
    .map((chunk) => {
      const [kind, id] = chunk.split(',');
      return { kind: kind as FicheKind, id: id ?? '' };
    })
    .filter((ref): ref is FicheRef => ref.id.length > 0 && isFicheKind(ref.kind));
}

export function serializeFicheStack(stack: FicheRef[]): string | null {
  if (stack.length === 0) return null;
  return stack.map((ref) => `${ref.kind},${ref.id}`).join(':');
}

/** Construit l'URL de la page courante avec la pile de fiches donnée. */
export function ficheUrl(stack: FicheRef[]): string {
  const url = new URL(window.location.href);
  const serialized = serializeFicheStack(stack);
  if (serialized) {
    url.searchParams.set(FICHE_PARAM, serialized);
  } else {
    url.searchParams.delete(FICHE_PARAM);
  }
  return url.toString();
}

export function isSameFicheRef(a: FicheRef, b: FicheRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}