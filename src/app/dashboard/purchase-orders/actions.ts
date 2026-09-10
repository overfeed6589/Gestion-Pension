'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { purchaseOrders, purchaseOrderItems } from '@/db/schema';
import { eq, like, sql } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Verrou advisory dédié à la numérotation des commandes (même principe que la
// numérotation des factures) : sérialise la lecture du max, évite les collisions.
const ORDER_SEQUENCE_LOCK_KEY = 7_200_017;

/** Numéro séquentiel CMD-AAAA-0001 (collision impossible sous verrou advisory). */
export async function generateNextOrderNumber(tx: Tx): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `CMD-${currentYear}-`;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ORDER_SEQUENCE_LOCK_KEY})`);

  const [last] = await tx
    .select({ orderNumber: purchaseOrders.orderNumber })
    .from(purchaseOrders)
    .where(like(purchaseOrders.orderNumber, `${prefix}%`))
    .orderBy(sql`${purchaseOrders.orderNumber} DESC`)
    .limit(1);

  if (!last) return `${prefix}0001`;

  const lastSequence = parseInt(last.orderNumber.replace(prefix, ''), 10);
  const next = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

interface OrderItemInput {
  description: string;
  quantity: number;
  unitCostInCents: number;
}

export async function createPurchaseOrderAction(data: {
  supplierId: string;
  expectedDeliveryDate?: Date;
  notes?: string;
  items: OrderItemInput[];
}): Promise<ActionState> {
  // Garde d'autorisation (A2) : achats/fournisseurs réservés à `owner`/`dev`.
  await requireRole('owner');

  try {
    return await db.transaction(async (tx) => {
      const orderNumber = await generateNextOrderNumber(tx);
      
      const totalCostInCents = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitCostInCents, 
        0
      );

      const [newOrder] = await tx
        .insert(purchaseOrders)
        .values({
          orderNumber,
          supplierId: data.supplierId,
          status: 'sent',
          sentAt: new Date(),
          expectedDeliveryDate: data.expectedDeliveryDate,
          notes: data.notes,
          totalCostInCents,
        })
        .returning({ id: purchaseOrders.id });

      await tx.insert(purchaseOrderItems).values(
        data.items.map((item) => ({
          purchaseOrderId: newOrder.id,
          description: item.description,
          quantity: item.quantity,
          unitCostInCents: item.unitCostInCents,
          totalCostInCents: item.quantity * item.unitCostInCents,
        }))
      );

      revalidatePath('/dashboard/purchase-orders');
      return { success: true, message: `Commande ${orderNumber} enregistrée avec succès.` };
    });
  } catch {
    return { success: false, message: 'Erreur lors de la création de la commande.' };
  }
}

export async function markOrderAsReceivedAction(
  orderId: string, 
  receivedDate: Date = new Date()
): Promise<ActionState> {
  await requireRole('owner');

  try {
    await db
      .update(purchaseOrders)
      .set({
        status: 'received',
        receivedAt: receivedDate,
      })
      .where(eq(purchaseOrders.id, orderId));

    revalidatePath('/dashboard/purchase-orders');
    return { success: true, message: 'Réception enregistrée avec succès.' };
  } catch {
    return { success: false, message: 'Erreur lors du marquage de réception.' };
  }
}