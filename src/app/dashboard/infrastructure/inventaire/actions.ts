'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { inventoryItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import type { ActionState } from '@/types/actions';

// ---------------------------------------------------------------------------
// Actions de l'inventaire (Phase H5) — checklist d'articles de la pension
// ---------------------------------------------------------------------------
// Matrice PLAN.md : fournisseurs & commandes = owner. La coche « à commander »
// signale la demande ; « commandé » note la date de dernière commande.
// ---------------------------------------------------------------------------

const addItemSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(255),
  note: z.string().max(2000).optional().or(z.literal('')),
});

const renameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, 'Nom trop court').max(255),
  note: z.string().max(2000).optional().or(z.literal('')),
});

export async function addInventoryItemAction(formData: FormData): Promise<ActionState> {
  const user = await requireRole('owner');

  const parsed = addItemSchema.safeParse({
    name: formData.get('name'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.') || 'form';
      (errors[field] ??= []).push(issue.message);
    }
    return { success: false, message: 'Formulaire invalide.', errors };
  }

  try {
    await db.insert(inventoryItems).values({
      name: parsed.data.name,
      note: parsed.data.note || null,
    });
    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'inventory.created',
        entityType: 'inventory_item',
        actorId: user.id,
        metadata: { name: parsed.data.name },
      });
    });
    revalidatePath('/dashboard/infrastructure/inventaire');
    return { success: true, message: 'Article ajouté.' };
  } catch (error) {
    console.error('addInventoryItemAction :', error);
    return { success: false, message: 'Erreur lors de l’ajout.' };
  }
}

export async function renameInventoryItemAction(id: string, name: string, note: string): Promise<ActionState> {
  const user = await requireRole('owner');

  const parsed = renameSchema.safeParse({ id, name, note });
  if (!parsed.success) return { success: false, message: 'Saisie invalide.' };

  try {
    await db
      .update(inventoryItems)
      .set({ name: parsed.data.name, note: parsed.data.note || null })
      .where(eq(inventoryItems.id, id));
    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'inventory.updated',
        entityType: 'inventory_item',
        entityId: id,
        actorId: user.id,
      });
    });
    revalidatePath('/dashboard/infrastructure/inventaire');
    return { success: true, message: 'Article mis à jour.' };
  } catch (error) {
    console.error('renameInventoryItemAction :', error);
    return { success: false, message: 'Erreur lors de la mise à jour.' };
  }
}

/** Coche/décoche « à commander » — signale la personne gérante. */
export async function toggleOrderRequestAction(id: string, requested: boolean): Promise<ActionState> {
  const user = await requireRole('owner');

  try {
    await db
      .update(inventoryItems)
      .set({
        orderRequestedAt: requested ? new Date() : null,
        orderRequestedBy: requested ? user.id : null,
      })
      .where(eq(inventoryItems.id, id));
    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: requested ? 'inventory.order_requested' : 'inventory.order_request_cleared',
        entityType: 'inventory_item',
        entityId: id,
        actorId: user.id,
      });
    });
    revalidatePath('/dashboard/infrastructure/inventaire');
    return { success: true, message: requested ? 'Commande demandée.' : 'Demande annulée.' };
  } catch (error) {
    console.error('toggleOrderRequestAction :', error);
    return { success: false, message: 'Erreur lors de la mise à jour.' };
  }
}

export async function markOrderedAction(id: string): Promise<ActionState> {
  const user = await requireRole('owner');

  try {
    await db
      .update(inventoryItems)
      .set({ lastOrderedAt: new Date(), orderRequestedAt: null, orderRequestedBy: null })
      .where(eq(inventoryItems.id, id));
    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'inventory.ordered',
        entityType: 'inventory_item',
        entityId: id,
        actorId: user.id,
      });
    });
    revalidatePath('/dashboard/infrastructure/inventaire');
    return { success: true, message: 'Commande enregistrée.' };
  } catch (error) {
    console.error('markOrderedAction :', error);
    return { success: false, message: 'Erreur lors de l’enregistrement.' };
  }
}

export async function deleteInventoryItemAction(id: string): Promise<ActionState> {
  const user = await requireRole('owner');

  try {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'inventory.deleted',
        entityType: 'inventory_item',
        entityId: id,
        actorId: user.id,
      });
    });
    revalidatePath('/dashboard/infrastructure/inventaire');
    return { success: true, message: 'Article supprimé.' };
  } catch (error) {
    console.error('deleteInventoryItemAction :', error);
    return { success: false, message: 'Erreur lors de la suppression.' };
  }
}
/**
 * Adaptateur `<form action>` pour l'ajout d'article (signature Promise<void>).
 */
export async function submitAddInventoryItemAction(formData: FormData): Promise<void> {
  const result = await addInventoryItemAction(formData);
  if (!result.success) {
    console.warn('submitAddInventoryItemAction refusé :', result.message, result.errors);
  }
}
