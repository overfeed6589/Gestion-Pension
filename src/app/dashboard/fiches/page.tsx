import { db } from '@/db';
import { pensionRules } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, getCurrentProfile, canAccess } from '@/lib/auth';
import { FichePanel, type Fiche } from '@/components/fiches/FichePanel';

export const dynamic = 'force-dynamic';

export default async function FichesPage() {
  // Lecture : staff et au-dessus. Écriture : owner (via les actions + UI).
  await requireRole('staff');
  const profile = await getCurrentProfile();
  const canManage = profile ? canAccess(profile.role, ['owner']) : false;

  const rows = await db
    .select({ id: pensionRules.id, title: pensionRules.title, content: pensionRules.content })
    .from(pensionRules)
    .where(eq(pensionRules.category, 'technique'))
    .orderBy(pensionRules.title);

  const items: Fiche[] = rows.map((r) => ({ id: r.id, title: r.title, content: r.content }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fiches techniques</h1>
        <p className="text-slate-700">
          Les bons réflexes du métier (chat agressif, soins, manipulations…), disponibles pour
          toute l’équipe.
        </p>
      </div>
      <FichePanel items={items} canManage={canManage} />
    </div>
  );
}
