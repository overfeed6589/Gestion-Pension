'use client';

import { useEffect, useRef } from 'react';
import { useFicheRouter } from './useFicheRouter';

// ---------------------------------------------------------------------------
// FicheModal : enveloppe visuelle générique d'une fenêtre empilée (Phase H1)
// ---------------------------------------------------------------------------
// Comportement : overlay semi-transparent (un cran plus sombre à chaque
// profondeur), fermeture par backdrop / Échap (fiche de premier plan seule),
// léger décalage vers la droite pour matérialiser l'empilement.
// ---------------------------------------------------------------------------

const MAX_LAYERS = 6;

export function FicheModal({
  depth,
  title,
  subtitle,
  onClose,
  isTop,
  children,
}: {
  /** Profondeur dans la pile (0 = fiche racine). */
  depth: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Seule la fiche de premier plan réagit à Échap (sinon toutes les couches fermeraient d'un coup). */
  isTop: boolean;
  children: React.ReactNode;
}) {
  const { closeAll } = useFicheRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fermeture au clavier : Échap ferme le premier plan, Échap+Maj ferme tout.
  useEffect(() => {
    if (!isTop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (event.shiftKey) {
          closeAll();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isTop, onClose, closeAll]);

  const layerOffset = Math.min(depth, MAX_LAYERS - 1) * 24;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ zIndex: 50 + depth }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 right-0 w-full max-w-xl flex flex-col bg-card border-l border-border shadow-2xl"
        style={{ transform: `translateX(-${layerOffset}px)` }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {depth > 0 && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Retour
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}