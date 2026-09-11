'use client';

import type { ReactNode } from 'react';
import { useFicheRouter } from './useFicheRouter';
import type { FicheKind } from '@/types/fiches';

// ---------------------------------------------------------------------------
// FicheLink : n'importe quel élément cliquable qui ouvre une fiche pop-up
// sans navigation. Rendu par défaut : lien souligné discret.
// ---------------------------------------------------------------------------

type FicheLinkProps = {
  kind: FicheKind;
  id: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

const DEFAULT_CLASS =
  'underline underline-offset-2 decoration-slate-300 hover:decoration-slate-800 hover:text-slate-900 cursor-pointer';

export function FicheLink({ kind, id, children, className, title }: FicheLinkProps) {
  const { open } = useFicheRouter();
  return (
    <button
      type="button"
      title={title ?? 'Ouvrir la fiche'}
      onClick={(e) => {
        e.stopPropagation();
        open(kind, id);
      }}
      className={className ?? DEFAULT_CLASS}
    >
      {children}
    </button>
  );
}