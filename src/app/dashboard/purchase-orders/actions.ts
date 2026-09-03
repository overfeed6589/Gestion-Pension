'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { purchaseOrders, purchaseOrderItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireUser } from '@/lib/auth';

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
  // Garde d'authentification (Phase A1) : les commandes fournisseurs n'avaient
  // aucun contrôle d'accès.
  await requireUser();

  try {
    return await db.transaction(async (tx) => {
      const orderNumber = `CMD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      
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
  } catch (error) {
    return { success: false, message: 'Erreur lors de la création de la commande.' };
  }
}

export async function markOrderAsReceivedAction(
  orderId: string, 
  receivedDate: Date = new Date()
): Promise<ActionState> {
  await requireUser();

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
  } catch (error) {
    return { success: false, message: 'Erreur lors du marquage de réception.' };
  }
}