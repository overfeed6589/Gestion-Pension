'use client';

import { useTransition } from 'react';
import {
  markOrderedAction,
  renameInventoryItemAction,
  toggleOrderRequestAction,
} from '@/app/dashboard/infrastructure/inventaire/actions';

// ---------------------------------------------------------------------------
// Boutons de la checklist d'inventaire (Phase H5)
// ---------------------------------------------------------------------------

export function OrderRequestToggle({ id, requested }: { id: string; requested: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
      <input
        type="checkbox"
        checked={requested}
        disabled={pending}
        onChange={(e) => {
          const checked = e.target.checked;
          startTransition(async () => {
            await toggleOrderRequestAction(id, checked);
          });
        }}
      />
      {pending ? '…' : requested ? 'À commander' : 'Commander ?'}
    </label>
  );
}

export function MarkOrderedButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markOrderedAction(id);
        })
      }
      className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
    >
      {pending ? '…' : 'Commandé ✓'}
    </button>
  );
}

export function ItemEditForm({ id, name, note }: { id: string; name: string; note: string | null }) {
  return (
    <form
      action={async (fd) => {
        await renameInventoryItemAction(id, String(fd.get('name') ?? ''), String(fd.get('note') ?? ''));
      }}
      className="flex flex-wrap gap-2 items-center"
    >
      <input
        name="name"
        defaultValue={name}
        className="border rounded-lg px-2 py-1 text-sm w-48"
        aria-label="Nom de l'article"
      />
      <input
        name="note"
        defaultValue={note ?? ''}
        placeholder="Note (quantité, marque…)"
        className="border rounded-lg px-2 py-1 text-sm flex-1 min-w-40"
        aria-label="Note de l'article"
      />
      <button type="submit" className="text-xs underline text-slate-700 hover:text-slate-900">
        Enregistrer
      </button>
    </form>
  );
}