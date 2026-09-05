import { db } from '@/db';
import { invoices } from '@/db/schema';
import { sql, like } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Numérotation robuste des factures (Phase B5)
// ---------------------------------------------------------------------------
// Raisons :
//  - L'ancienne version faisait un `SELECT MAX` hors verrou : deux transactions
//    simultanées pouvaient générer le MÊME numéro (le `unique` DB rejetait la
//    seconde sous forme d'erreur 500 au lieu de produire le numéro suivant).
//  - Ici on pose un verrou advisory de transaction (pg_advisory_xact_lock) :
//    il est automatiquement libéré au commit/rollback et sérialise UNIQUEMENT
//    la génération des numéros, pas les autres écritures. La lecture du max se
//    fait DANS la transaction verrouillée.
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Clé de verrou advisory (constante arbitraire propre à la numérotation). */
const INVOICE_SEQUENCE_LOCK_KEY = 7_100_017;

export async function generateNextInvoiceNumber(tx: Tx): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `FAC-${currentYear}-`;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${INVOICE_SEQUENCE_LOCK_KEY})`);

  const lastInvoice = await tx
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, `${prefix}%`))
    .orderBy(sql`${invoices.invoiceNumber} DESC`)
    .limit(1);

  if (lastInvoice.length === 0) {
    return `${prefix}0001`;
  }

  const lastSequence = parseInt(lastInvoice[0].invoiceNumber.replace(prefix, ''), 10);
  const nextSequence = (lastSequence + 1).toString().padStart(4, '0');

  return `${prefix}${nextSequence}`;
}
