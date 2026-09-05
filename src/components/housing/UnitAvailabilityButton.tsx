'use client';

import { useState } from 'react';
import { toggleHousingUnitAvailabilityAction } from '@/app/dashboard/housing/actions';

export function UnitAvailabilityButton({ unitId }: { unitId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await toggleHousingUnitAvailabilityAction(unitId);
    setBusy(false);
    if (res.success) setMessage(res.message ?? null);
    else setError(res.message ?? 'Erreur.');
  };

  return (
    <div className="text-[11px]">
      {message && <p className="mb-1 text-slate-700">{message}</p>}
      {error && <p className="mb-1 text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="underline text-slate-500 hover:text-slate-800 disabled:opacity-50"
      >
        {busy ? '…' : 'Hors service / réactiver'}
      </button>
    </div>
  );
}
