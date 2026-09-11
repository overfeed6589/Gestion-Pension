import Link from 'next/link';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Logs (Phase H6) — journal d'audit, réservé owner/dev
// ---------------------------------------------------------------------------
// Niveau action : qui, quoi (action), sur quelle entité, quand. Fenêtre de
// 1 mois (le cron déplace les entrées plus vieilles vers l'archive).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;

const ENTITY_LABELS: Record<string, string> = {
  booking: 'Réservation',
  appointment: 'Rendez-vous',
  invoice: 'Facture',
  payment: 'Paiement',
  inventory_item: 'Inventaire',
  client: 'Client',
  pet: 'Animal',
  purchase_order: 'Commande',
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  await requireRole('owner');

  const params = await searchParams;
  const entityType = params.type ?? '';
  const q = (params.q ?? '').trim();
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const conditions = [gte(auditLogs.createdAt, sql`now() - interval '1 month'`)];
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
  if (q) conditions.push(sql`${auditLogs.action} ilike ${'%' + q + '%'}`);
  const where = and(...conditions);

  const [rows, countRows, entityTypes] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorRole: sql<string | null>`p.role`,
      })
      .from(auditLogs)
      .leftJoin(sql`profiles p`, sql`p.id = ${auditLogs.actorId}`)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
    db
      .select({ type: auditLogs.entityType, count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, sql`now() - interval '1 month'`))
      .groupBy(auditLogs.entityType)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const total = countRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmtDate = (d: Date) =>
    d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
        <p className="text-slate-700 text-sm mt-1">
          Journal des 30 derniers jours — {total} entrée(s), page {page}/{totalPages}. Au-delà,
          les entrées sont archivées automatiquement par le cron.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Type d’entité</span>
          <select name="type" defaultValue={entityType} className="border rounded-lg px-3 py-1.5">
            <option value="">Tous</option>
            {entityTypes.map((t) => (
              <option key={t.type} value={t.type}>
                {ENTITY_LABELS[t.type] ?? t.type} ({t.count})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Action contient</span>
          <input name="q" defaultValue={q} placeholder="booking.confirmed…" className="border rounded-lg px-3 py-1.5" />
        </label>
        <button type="submit" className="bg-slate-900 text-white rounded-lg px-4 py-1.5">
          Filtrer
        </button>
      </form>

      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2">Quand</th>
              <th className="px-3 py-2">Qui</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entité</th>
              <th className="px-3 py-2">Détail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-slate-600">Aucune entrée sur la période.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 text-xs whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-1.5 text-xs">{r.actorRole ?? 'système'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-1.5 text-xs">
                  {ENTITY_LABELS[r.entityType] ?? r.entityType}
                  {r.entityId ? <span className="text-slate-400"> · {r.entityId.slice(0, 8)}</span> : ''}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-600 max-w-md truncate">
                  {r.metadata ? JSON.stringify(r.metadata) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(page > 1 || page < totalPages) && (
        <div className="text-xs space-x-4">
          {page > 1 && (
            <Link href={`/dashboard/logs?type=${entityType}&q=${q}&page=${page - 1}`} className="underline">
              Page précédente
            </Link>
          )}
          {page < totalPages && (
            <Link href={`/dashboard/logs?type=${entityType}&q=${q}&page=${page + 1}`} className="underline">
              Page suivante
            </Link>
          )}
        </div>
      )}
    </div>
  );
}