import { db } from '@/db';
import { inventoryItems } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { requireRole, canAccess, getCurrentProfile } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { MarkReceivedButton, NewOrderForm } from '@/components/purchase-orders/OrderActions';
import {
  ItemEditForm,
  MarkOrderedButton,
  OrderRequestToggle,
} from '@/components/inventory/InventoryActions';
import { submitAddInventoryItemAction } from './actions';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Infrastructure » Inventaire & commandes (Phase H5)
// ---------------------------------------------------------------------------
// 1. Inventaire : checklist des articles « censés être à la pension » — note
//    libre, date de dernière commande, coche « à commander » pour signaler la
//    personne gérante.
// 2. Commandes fournisseurs : reprise de la page itération 1 (création,
//    réception, numérotation annuelle).
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  received: 'Reçue',
  cancelled: 'Annulée',
};

export default async function InventairePage() {
  await requireRole('secretary', 'staff', 'owner');
  const profile = await getCurrentProfile();
  const isOwner = profile ? canAccess(profile.role, ['owner']) : false;

  const [items, orders, suppliers] = await Promise.all([
    db
      .select()
      .from(inventoryItems)
      .orderBy(sql`${inventoryItems.orderRequestedAt} desc nulls last, ${inventoryItems.name} asc`),
    db.query.purchaseOrders.findMany({
      with: { supplier: true, items: true },
      orderBy: (orders, { desc }) => [desc(orders.createdAt)],
      limit: 100,
    }),
    db.query.suppliers.findMany({ orderBy: (suppliers, { asc }) => [asc(suppliers.name)] }),
  ]);

  const requestedItems = items.filter((i) => i.orderRequestedAt !== null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventaire & commandes</h1>
        <p className="text-slate-700 text-sm mt-1">
          Ce qui est censé être à la pension, la dernière commande de chaque article et les
          commandes fournisseurs en cours.
        </p>
      </div>

      {isOwner && (
        <section className="bg-white border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Ajouter un article</h2>
          <form action={submitAddInventoryItemAction} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="Croquettes, litière, sacs poubelle…" className="border rounded-lg px-3 py-2 text-sm w-64" />
            <input name="note" placeholder="Note (optionnel)" className="border rounded-lg px-2 py-1 text-sm flex-1 min-w-40" />
            <button type="submit" className="bg-slate-900 text-white text-sm rounded-lg px-4 py-2">
              Ajouter
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">
          À commander ({requestedItems.length})
        </h2>
        {requestedItems.length === 0 ? (
          <p className="text-sm text-slate-600">Rien à commander pour le moment.</p>
        ) : (
          <ul className="divide-y border rounded-xl bg-white">
            {requestedItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">{item.name}</span>
                {item.note && <span className="text-xs text-slate-600">{item.note}</span>}
                <span className="text-xs text-slate-500">
                  demandé le {item.orderRequestedAt?.toISOString().slice(0, 10)}
                </span>
                {isOwner && <span className="ml-auto"><MarkOrderedButton id={item.id} /></span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Inventaire ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-700 italic bg-white border rounded-xl p-6">
            Aucun article — ajoutez ce qui est censé être à la pension.
          </p>
        ) : (
          <ul className="divide-y border rounded-xl bg-white">
            {items.map((item) => (
              <li key={item.id} className="px-4 py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-slate-600">
                    dernière commande : {item.lastOrderedAt?.toISOString().slice(0, 10) ?? 'jamais'}
                  </span>
                  <span className="ml-auto"><OrderRequestToggle id={item.id} requested={item.orderRequestedAt !== null} /></span>
                </div>
                {item.note && <p className="text-xs text-slate-600">{item.note}</p>}
                {isOwner && (
                  <div className="pt-1 border-t">
                    <ItemEditForm id={item.id} name={item.name} note={item.note} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <CommandesSection
          orders={orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            supplierName: o.supplier?.name ?? '—',
            itemsCount: o.items?.length ?? 0,
            totalCostInCents: o.totalCostInCents,
            status: o.status,
          }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Commandes fournisseurs (reprise de la page itération 1)
// ---------------------------------------------------------------------------

function CommandesSection({
  orders,
  suppliers,
}: {
  orders: {
    id: string;
    orderNumber: string;
    supplierName: string;
    itemsCount: number;
    totalCostInCents: number;
    status: string;
  }[];
  suppliers: { id: string; name: string }[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Commandes fournisseurs</h2>
      <NewOrderForm suppliers={suppliers} />
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
                <td className="px-3 py-2">{o.supplierName}</td>
                <td className="px-3 py-2 text-slate-600">{o.itemsCount}</td>
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
  );
}