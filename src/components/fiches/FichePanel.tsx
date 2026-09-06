'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { saveFicheAction, deleteFicheAction } from '@/app/dashboard/fiches/actions';
import { ActionState } from '@/types/actions';

export type Fiche = { id: string; title: string; content: string };

const initial: ActionState = { success: false };

export function FichePanel({ items, canManage }: { items: Fiche[]; canManage: boolean }) {
  const [state, formAction, isPending] = useActionState(saveFicheAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const remove = async (fiche: Fiche) => {
    if (!window.confirm(`Supprimer « ${fiche.title} » ?`)) return;
    setDeleting(fiche.id);
    const res = await deleteFicheAction(fiche.id);
    setDeleting(null);
    if (!res.success) window.alert(res.message);
  };

  const input = 'border rounded p-2 text-sm w-full';

  return (
    <div className="space-y-6">
      {canManage && (
        <form action={formAction} className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
          <h2 className="font-semibold">Ajouter une fiche technique</h2>
          <input name="title" placeholder="Titre (ex: Chat agressif : les bons réflexes)" className={input} />
          <textarea name="content" rows={5} placeholder="Contenu de la fiche…" className={input} />
          {state.message && (
            <p className={`text-sm ${state.success ? 'text-emerald-700' : 'text-red-600'}`}>{state.message}</p>
          )}
          <button type="submit" disabled={isPending} className="bg-slate-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50">
            {isPending ? '…' : 'Enregistrer la fiche'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-700 italic bg-white border rounded-xl p-6">
          Aucune fiche technique pour l’instant.
        </p>
      ) : (
        items.map((fiche) => (
          <article key={fiche.id} className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
            {editingId === fiche.id ? (
              <form action={formAction} className="space-y-3">
                <input type="hidden" name="id" value={fiche.id} />
                <input name="title" defaultValue={fiche.title} className={input} />
                <textarea name="content" defaultValue={fiche.content} rows={6} className={input} />
                <div className="flex items-center gap-3">
                  <button type="submit" className="bg-slate-900 text-white text-xs rounded px-3 py-1.5">Enregistrer</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs underline text-slate-600">Fermer</button>
                </div>
              </form>
            ) : (
              <>
                <h3 className="font-semibold">{fiche.title}</h3>
                <p className="text-sm whitespace-pre-wrap text-slate-800">{fiche.content}</p>
                {canManage && (
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={() => setEditingId(fiche.id)} className="underline text-slate-600">
                      Modifier
                    </button>
                    <button onClick={() => remove(fiche)} disabled={deleting === fiche.id} className="underline text-red-600">
                      {deleting === fiche.id ? '…' : 'Supprimer'}
                    </button>
                  </div>
                )}
              </>
            )}
          </article>
        ))
      )}
    </div>
  );
}
