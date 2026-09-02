import { db } from '@/db';
import { invoices } from '@/db/schema';
import { sql, like } from 'drizzle-orm';

export async function generateNextInvoiceNumber(tx: any = db): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `FAC-${currentYear}-`;

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