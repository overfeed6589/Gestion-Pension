'use client';

import { useState, useTransition } from 'react';
import { generateFinalInvoiceAction } from '@/app/dashboard/invoices/actions';

/** Bouton dashboard : génère (idempotent) la facture finale d'un séjour. */
export function GenerateFinalInvoiceButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () => {
    startTransition(async () => {
      const res = await generateFinalInvoiceAction(bookingId);
      setMessage(res.message ?? null);
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs bg-slate-900 text-white rounded px-3 py-1.5 disabled:opacity-40"
      >
        {pending ? 'Génération…' : 'Générer la facture finale'}
      </button>
      {message && <span className="text-xs text-slate-700">{message}</span>}
    </span>
  );
}
