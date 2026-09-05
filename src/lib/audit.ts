import { db } from '@/db';
import { auditLogs } from '@/db/schema';

// ---------------------------------------------------------------------------
// Journal d'audit (Phase C — traçabilité)
// ---------------------------------------------------------------------------
// Trace des actions sensibles (confirmations, annulations, mouvements registre,
// émissions de facture…). `actorId` est renseigné quand un humain est à
// l'origine (id du profil), sinon null (webhook/cron = système).
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(auditLogs).values({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    actorId: input.actorId ?? null,
    metadata: input.metadata ? (JSON.parse(JSON.stringify(input.metadata)) as object) : null,
  });
}
