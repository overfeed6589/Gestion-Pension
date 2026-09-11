import { db } from '@/db';
import { auditLogs, auditLogsArchive } from '@/db/schema';
import { inArray, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Archivage du journal d'audit (Phase H6)
// ---------------------------------------------------------------------------
// Fenêtre de consultation des Logs = 1 mois. Le cron quotidien déplace les
// lignes plus vieilles que la rétention vers `audit_logs_archive` (par lots,
// en transaction : insertion + suppression sont atomiques).
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 30;

/**
 * Déplace les entrées d'audit au-delà de la rétention vers l'archive.
 * Renvoie le nombre de lignes archivées (0 si rien / échec, non-bloquant).
 */
export async function archiveOldAuditLogs(batchSize = 500): Promise<number> {
  try {
    const oldRows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(sql`${auditLogs.createdAt} < now() - interval '${sql.raw(String(RETENTION_DAYS))} days'`)
      .orderBy(auditLogs.createdAt)
      .limit(batchSize);

    if (oldRows.length === 0) return 0;
    const ids = oldRows.map((r) => r.id);

    await db.transaction(async (tx) => {
      const rows = await tx.select().from(auditLogs).where(inArray(auditLogs.id, ids));
      if (rows.length > 0) {
        await tx.insert(auditLogsArchive).values(
          rows.map((r) => ({
            id: r.id,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            actorId: r.actorId,
            metadata: r.metadata,
            createdAt: r.createdAt,
          }))
        );
      }
      await tx.delete(auditLogs).where(inArray(auditLogs.id, ids));
    });

    return ids.length;
  } catch (error) {
    console.error('archiveOldAuditLogs :', error);
    return -1;
  }
}