import Link from 'next/link';
import { ReservationWizard } from '@/components/public/ReservationWizard';
import { getPensionSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function ReserverPage() {
  const settings = await getPensionSettings();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="font-semibold">{settings.pensionName}</p>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">← Accueil</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réserver un séjour</h1>
          <p className="text-slate-700">
            1) vos coordonnées et les dates · 2) les hébergements disponibles · 3) vos chats.
            Demande sans engagement : nous confirmons ensuite par email.
          </p>
        </div>
        <ReservationWizard />
      </main>
    </div>
  );
}
