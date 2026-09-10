import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { MarkReceivedButton, NewOrderForm } from '@/components/purchase-orders/OrderActions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  received: 'Reçue',
  cancelled: 'Annulée',
};

export default async function PurchaseOrdersPage() {
  await requireRole('owner');

  const [orders, suppliers] = await Promise.all([
    db.query.purchaseOrders.findMany({
      with: { supplier: true, items: true },
      orderBy: (orders, { desc }) => [desc(orders.createdAt)],
      limit: 100,
    }),
    db.query.suppliers.findMany({ orderBy: (suppliers, { asc }) => [asc(suppliers.name)] }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commandes fournisseurs</h1>
        <p className="text-slate-700 text-sm mt-1">
          Suivi des achats : création, réception. Numérotation séquentielle annuelle.
        </p>
      </div>

      <NewOrderForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />

      <section className="space-y-3">
        <h2 className="font-semibold">Historique ({orders.length})</h2>
        <div className="overflow-x-auto border rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
              <tr>
                <th className="px-3 py-2">Numéro</th>
                <th className="px-3 py-2">Fournisseur</th>
                <th className="px-3 py-2">Articles</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-slate-600">Aucune commande.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-mono text-xs">{o.orderNumber}</td>
                  <td className="px-3 py-2">{o.supplier?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{o.items?.length ?? 0}</td>
                  <td className="px-3 py-2">{formatCents(o.totalCostInCents)}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[o.status] ?? o.status}</td>
                  <td className="px-3 py-2">
                    {o.status === 'sent' && <MarkReceivedButton orderId={o.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
