import Link from 'next/link';
import { db } from '@/db';
import { housingCategories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getPensionSettings } from '@/lib/settings';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [settings, categories] = await Promise.all([
    getPensionSettings(),
    db
      .select()
      .from(housingCategories)
      .where(eq(housingCategories.isPublic, true))
      .orderBy(housingCategories.basePricePerNight),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="font-semibold">{settings.pensionName}</p>
          <Link href="/login" className="text-xs text-slate-500 hover:text-slate-800">
            Espace équipe
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section className="space-y-5">
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            Votre chat en confiance, où que vous soyez.
          </h1>
          <p className="text-slate-600">
            Pension individuelle pour chats : chaque famille a son espace privé.
            Demandez une réservation : nous revenons vers vous sous 24/48 h avec
            une proposition et un acompte sécurisé.
          </p>

          {categories.length > 0 && (
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold">Nos espaces</h2>
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <span>{cat.publicName || cat.name}</span>
                  <span className="text-slate-500">
                    {formatCents(cat.basePricePerNight)}/nuit
                    {cat.surchargePerAnimal > 0
                      ? ` + ${formatCents(cat.surchargePerAnimal)}/chat supplémentaire`
                      : ''}
                  </span>
                </div>
              ))}
              <p className="text-xs text-slate-400">
                Capacité : un espace accueille jusqu’à 3 chats d’une même famille.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-xl">Demander une réservation</h2>
            <p className="text-slate-700 text-sm">
              En quelques étapes : vos dates, les espaces disponibles selon vos chats, puis les
              informations de vos animaux. Sans engagement — nous confirmons par email sous 24/48 h.
            </p>
            <Link
              href="/reserver"
              className="inline-block bg-slate-900 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-slate-800"
            >
              Réserver en ligne →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t bg-white mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-slate-400 flex flex-wrap justify-between gap-2">
          <span>
            {settings.pensionName}
            {settings.legalAddress ? ` — ${settings.legalAddress}` : ''}
            {settings.siret ? ` — SIRET ${settings.siret}` : ''}
          </span>
          <span>Réservation soumise à l’accord préalable et à la fiche sanitaire de votre chat.</span>
        </div>
      </footer>
    </div>
  );
}
