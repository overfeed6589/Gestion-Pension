'use client';

import { useState } from 'react';
import {
  validateProposedBookingAction,
  validateWithoutPaymentAction,
} from '@/app/dashboard/offres/actions';

export function DemandValidateActions({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (kind: 'validate' | 'nowithout') => {
    setBusy(kind);
    setMsg(null);
    const res =
      kind === 'validate'
        ? await validateProposedBookingAction(bookingId)
        : await validateWithoutPaymentAction(bookingId);
    setBusy(null);
    setMsg(res.message ?? null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => run('validate')}
        disabled={busy !== null}
        className="bg-slate-900 text-white text-xs font-medium py-1.5 px-3 rounded disabled:opacity-40"
      >
        {busy === 'validate' ? '…' : 'Valider & envoyer le paiement'}
      </button>
      <button
        onClick={() => run('nowithout')}
        disabled={busy !== null}
        className="bg-emerald-700 text-white text-xs font-medium py-1.5 px-3 rounded disabled:opacity-40"
      >
        {busy === 'nowithout' ? '…' : 'Valider sans acompte'}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
