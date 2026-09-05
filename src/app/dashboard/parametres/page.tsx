import { db } from '@/db';
import { pensionSettings } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { ParametresForm } from '@/components/settings/ParametresForm';

export const dynamic = 'force-dynamic';

export default async function ParametresPage() {
  await requireRole('owner');

  const [row] = await db.select().from(pensionSettings).limit(1);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres de la pension</h1>
        <p className="text-slate-500">
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
        }}
      />
    </div>
  );
}
