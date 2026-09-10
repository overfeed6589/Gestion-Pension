'use client';

import { useState, useTransition } from 'react';
import { rotateClientAccessTokenAction } from '@/app/dashboard/clients/actions';

/**
 * Rotation du lien d'accès espace (M2) : révoque l'ancien jeton, en émet un
 * neuf, affiché une seule fois (il n'est jamais stocké en clair).
 */
export function RotateAccessLinkButton({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = () => {
    if (
      !window.confirm(
        'Régénérer le lien d’accès ? L’ancien lien du client cessera immédiatement de fonctionner.'
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await rotateClientAccessTokenAction(clientId);
      const data = res.data as { accessUrl?: string } | undefined;
      if (res.success && data?.accessUrl) {
        setUrl(data.accessUrl);
        setMessage(res.message ?? null);
      } else {
        setMessage(res.message ?? 'Erreur.');
      }
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs underline text-slate-700 disabled:opacity-40"
      >
        {pending ? 'Génération…' : 'Régénérer le lien d’accès'}
      </button>
      {url && (
        <code className="text-[11px] bg-slate-100 rounded px-2 py-1 max-w-full break-all">
          {url}
        </code>
      )}
      {message && !url && <span className="text-xs text-red-600">{message}</span>}
    </span>
  );
}
