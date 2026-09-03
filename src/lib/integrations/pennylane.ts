import { db } from '@/db';
import { invoices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { serverEnv } from '@/lib/env';

const PENNYLANE_API_URL = 'https://api.pennylane.com/v1';

export async function syncInvoiceToPennylane(invoiceId: string) {
  if (!serverEnv.PENNYLANE_API_KEY) {
    throw new Error('PENNYLANE_API_KEY absente : synchronisation Pennylane impossible.');
  }

  const invoice = await db.query.invoices.findFirst({
    where: {RAW: (t) => eq(invoices.id, invoiceId),},
    with: {
      client: true,
      items: true,
    },
  });

  if (!invoice) throw new Error('Facture introuvable');

  const payload = {
    create_customer: true,
    customer: {
      name: `${invoice.client.firstName} ${invoice.client.lastName}`,
      email: invoice.client.email,
      phone: invoice.client.phone,
      address: invoice.client.address,
      siret: invoice.client.siret || undefined,
      vat_number: invoice.client.vatNumber || undefined,
    },
    issue_date: invoice.createdAt.toISOString().split('T')[0],
    deadline: invoice.dueDate ? invoice.dueDate.toISOString().split('T')[0] : undefined,
    invoice_number: invoice.invoiceNumber,
    currency: 'EUR',
    line_items: invoice.items.map((item) => ({
      label: item.description,
      quantity: item.quantity,
      raw_currency_unit_price: (item.unitPriceInCents / 100).toFixed(2),
      vat_rate: (invoice.vatRate / 100).toFixed(2),
    })),
  };

  const response = await fetch(`${PENNYLANE_API_URL}/customer_invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serverEnv.PENNYLANE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    await db
      .update(invoices)
      .set({ eInvoiceStatus: 'rejected' })
      .where(eq(invoices.id, invoiceId));

    throw new Error(`Erreur API Pennylane: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();

  await db
    .update(invoices)
    .set({
      pennylaneId: data.invoice.id,
      eInvoiceStatus: 'transmitted',
      transmittedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  return data.invoice;
}