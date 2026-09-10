'use client';

import { useState, useTransition } from 'react';
import {
  createPurchaseOrderAction,
  markOrderAsReceivedAction,
} from '@/app/dashboard/purchase-orders/actions';

export function MarkReceivedButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markOrderAsReceivedAction(orderId);
        })
      }
      className="text-xs underline text-slate-700 disabled:opacity-40"
    >
      {pending ? '…' : 'Marquer reçue'}
    </button>
  );
}

const input = 'border rounded p-2 text-sm w-full';

export function NewOrderForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState([
    { description: '', quantity: 1, unitCostEuros: '' },
  ]);

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Créez d’abord un fournisseur pour pouvoir enregistrer des commandes.
      </p>
    );
  }

  const submit = () => {
    setMessage(null);
    const supplierId = (document.getElementById('po-supplier') as HTMLSelectElement).value;
    const notes = (document.getElementById('po-notes') as HTMLInputElement).value;
    const parsedItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description.trim(),
        quantity: Math.max(1, Math.floor(i.quantity)),
        unitCostInCents: Math.round(parseFloat(i.unitCostEuros.replace(',', '.') || '0') * 100),
      }));
    if (!supplierId) return setMessage('Choisissez un fournisseur.');
    if (parsedItems.length === 0) return setMessage('Ajoutez au moins un article.');
    if (parsedItems.some((i) => i.unitCostInCents <= 0)) {
      return setMessage('Chaque article doit avoir un coût unitaire positif.');
    }

    startTransition(async () => {
      const res = await createPurchaseOrderAction({ supplierId, notes: notes || undefined, items: parsedItems });
      setMessage(res.message ?? null);
      if (res.success) {
        setItems([{ description: '', quantity: 1, unitCostEuros: '' }]);
      }
    });
  };

  return (
    <section className="space-y-3 border rounded-xl bg-white p-4">
      <h2 className="font-semibold">Nouvelle commande</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600">Fournisseur</label>
          <select id="po-supplier" className={input}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-600">Note (optionnel)</label>
          <input id="po-notes" className={input} />
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-6 gap-2 items-center">
            <input
              className={`${input} col-span-3`}
              placeholder="Description"
              value={item.description}
              onChange={(e) =>
                setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, description: e.target.value } : it)))
              }
            />
            <input
              className={input}
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) =>
                setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, quantity: Number(e.target.value) } : it)))
              }
            />
            <input
              className={`${input} col-span-2`}
              placeholder="Coût unitaire €"
              value={item.unitCostEuros}
              onChange={(e) =>
                setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, unitCostEuros: e.target.value } : it)))
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="text-xs underline text-slate-700"
          onClick={() => setItems((prev) => [...prev, { description: '', quantity: 1, unitCostEuros: '' }])}
        >
          + Ajouter un article
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-slate-900 text-white text-sm rounded px-4 py-2 disabled:opacity-40"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer la commande'}
        </button>
        {message && <span className="text-xs text-slate-700">{message}</span>}
      </div>
    </section>
  );
}
