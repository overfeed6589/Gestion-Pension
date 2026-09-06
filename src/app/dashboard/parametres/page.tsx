import { db } from '@/db';
import { pensionSettings } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { ParametresForm } from '@/components/settings/ParametresForm';

export const dynamic = 'force-dynamic';

export default async function ParametresPage() {
  await requireRole('owner');

  const [row] = await db.select().from(pensionSettings).limit(1);

  const defaultSlots = ['9h-11h', '11h-14h', '14h-17h', '17h-19h'];
  const arrivalSlots =
    row && Array.isArray(row.arrivalSlots) && row.arrivalSlots.length > 0
      ? row.arrivalSlots
      : defaultSlots;
  const departureSlots =
    row && Array.isArray(row.departureSlots) && row.departureSlots.length > 0
      ? row.departureSlots
      : defaultSlots;
  const reminderDays =
    row && Array.isArray(row.reminderDays) && row.reminderDays.length > 0
      ? row.reminderDays
      : [15, 7, 1];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres de la pension</h1>
        <p className="text-slate-700">
          Identité légale affichée sur le site public et règles commerciales (acompte, annulation,
          validité des offres) utilisées par les relances.
        </p>
      </div>
      <ParametresForm
        defaults={{
          pensionName: row?.pensionName ?? '',
          legalAddress: row?.legalAddress ?? '',
          siret: row?.siret ?? '',
          contactEmail: row?.contactEmail ?? '',
          phone: row?.phone ?? '',
          depositPercent: row?.depositPercent ?? 30,
          cancellationRefundDays: row?.cancellationRefundDays ?? 7,
          offerValidityHours: row?.offerValidityHours ?? 72,
          publicDomain: row?.publicDomain ?? '',
          logoUrl: row?.logoUrl ?? '',
          arrivalSlots,
          departureSlots,
          reminderDays,
        }}
      />
    </div>
  );
}
