'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { bookings, invoices, invoiceItems } from '@/db/schema';
import { generateNextInvoiceNumber } from '@/lib/invoicing/numbering';
import { syncInvoiceToPennylane } from '@/lib/integrations/pennylane';
import { eq } from 'drizzle-orm';
import { createClient } from '@/utils/supabase/server';
import { ActionState } from '@/types/actions';

export async function generateFinalInvoiceAction(bookingId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: 'Non autorisé' };

  try {
    const newInvoiceId = await db.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: { RAW: (t) => eq(bookings.id, bookingId),},
        with: {
          client: true,
          payments: true,
          extraServices: {
            with: {
              service: true,
              pet: true,
            },
          },
          segments: {
            with: {
              category: true,
              occupantLinks: {
                with: {
                  pet: true,
                },
              },
            },
          },
        },
      });

      if (!booking) throw new Error('Réservation introuvable.');

      const checkIn = new Date(booking.checkInDate);
      const checkOut = new Date(booking.checkOutDate);
      const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 3600 * 24)));
      
      const primarySegment = booking.segments[0];
      const categoryName = primarySegment?.category?.name || 'Hébergement';
      const pricePerNightCents = primarySegment?.category?.basePricePerNight || 0;
      const totalNightsCents = nights * pricePerNightCents;

      // Type explicite pour 'link'
      const petNames = primarySegment?.occupantLinks
        ?.map((link) => link.pet?.name)
        .filter(Boolean)
        .join(', ') || 'Animal';

// 1. Paiements : utilisation de 'method' ou suppression de 'paymentType' si non présent
      const paidDepositCents = booking.payments
        .filter((p) => p.status === 'succeeded')
        .reduce((sum: number, p) => sum + p.amount, 0);

      // 2. Prestations annexes : utilisation de 'defaultPrice' et prise en compte de la quantité
      const totalExtrasCents = booking.extraServices.reduce(
        (sum: number, item) => sum + ((item.service?.defaultPrice || 0) * item.quantity),
        0
      );

      const subtotalCents = totalNightsCents + totalExtrasCents - paidDepositCents;
      const vatRate = 2000;
      const taxCents = Math.round((subtotalCents * vatRate) / 10000);
      const totalCents = subtotalCents + taxCents;

      const invoiceNumber = await generateNextInvoiceNumber(tx);

      const [newInvoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          type: 'final',
          status: 'issued',
          eInvoiceStatus: 'pending',
          clientId: booking.clientId,
          bookingId: booking.id,
          subtotalInCents: subtotalCents,
          taxInCents: taxCents,
          totalInCents: totalCents,
          vatRate,
          dueDate: new Date(),
        })
        .returning({ id: invoices.id });

      // Type explicite pour 'item' dans le map
      const itemsToInsert = [
        {
          invoiceId: newInvoice.id,
          description: `Séjour ${petNames} (${nights} nuitée(s) - ${categoryName})`,
          quantity: nights,
          unitPriceInCents: pricePerNightCents,
          totalInCents: totalNightsCents,
        },
        ...booking.extraServices.map((item) => ({
            invoiceId: newInvoice.id,
            description: `Prestation : ${item.service?.name ?? 'Service'}${item.pet ? ` (${item.pet.name})` : ''}`,
            quantity: item.quantity,
            unitPriceInCents: item.service?.defaultPrice ?? 0,
            totalInCents: (item.service?.defaultPrice ?? 0) * item.quantity,
        }))
      ];

      if (paidDepositCents > 0) {
        itemsToInsert.push({
          invoiceId: newInvoice.id,
          description: 'Déduction Acompte déjà réglé',
          quantity: 1,
          unitPriceInCents: -paidDepositCents,
          totalInCents: -paidDepositCents,
        });
      }

      await tx.insert(invoiceItems).values(itemsToInsert);
      return newInvoice.id;
    });

    // Synchronisation vers Pennylane
    try {
      await syncInvoiceToPennylane(newInvoiceId);
    } catch (pennylaneError) {
      console.error('Erreur lors de la synchro Pennylane :', pennylaneError);
    }

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath('/dashboard/invoices');

    return {
      success: true,
      message: 'Facture générée et transmise à Pennylane !',
      data: { invoiceId: newInvoiceId },
    };
  } catch (error) {
    console.error('Erreur de génération de facture :', error);
    return { success: false, message: 'Erreur lors de la création de la facture.' };
  }
}