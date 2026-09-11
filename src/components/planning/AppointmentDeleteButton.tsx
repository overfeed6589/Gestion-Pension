'use client';

import { useTransition } from 'react';
import { deleteAppointmentAction } from '@/app/dashboard/planning/actions';

/** Bouton de suppression d'un rdv du planning (Phase H4). */
export function AppointmentDeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        if (!confirm('Supprimer ce rendez-vous ?')) return;
        startTransition(async () => {
          await deleteAppointmentAction(id);
        });
      }}
      className="text-xs text-red-700 underline underline-offset-2 hover:text-red-900"
      title={pending ? '…' : 'Supprimer'}
    >
      {pending ? '…' : 'Supprimer'}
    </button>
  );
}