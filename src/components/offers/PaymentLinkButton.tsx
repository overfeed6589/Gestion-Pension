'use client';

import { useState } from 'react';
import { createDepositPaymentLinkAction } from '@/app/dashboard/offres/actions';

export function PaymentLinkButton({ bookingId, disabled }: { bookingId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    const res = await createDepositPaymentLinkAction(bookingId);
    setBusy(false);

    if (res.success && res.data && typeof res.data === 'object' && 'paymentUrl' in res.data) {
      const url = (res.data as { paymentUrl?: string }).paymentUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      setError(res.message ?? 'Erreur.');
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={handleClick}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-medium py-1.5 px-3 rounded transition"
      >
        {busy ? 'Génération…' : 'Lien d’acompte'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
