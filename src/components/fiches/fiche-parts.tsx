'use client';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Briques de présentation communes aux fiches (Phase H1)
// ---------------------------------------------------------------------------

export function FicheSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border rounded-lg border border-border bg-muted/40">
        {children}
      </div>
    </section>
  );
}

export function FicheRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 px-3 py-2 text-sm">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

export function FicheEmpty({ message }: { message: string }) {
  return <p className="px-3 py-2 text-sm italic text-muted-foreground">{message}</p>;
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-muted text-muted-foreground border-border',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-800 border-red-200',
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}