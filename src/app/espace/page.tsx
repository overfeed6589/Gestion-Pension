import Link from 'next/link';
import { redirect } from 'next/navigation';
import { consumeResumeLink } from '@/lib/client-access';
import { createEspaceSession } from '@/lib/espace-session';
import { EspaceClientView } from '@/components/client/EspaceClientView';
import { readEspaceSession } from '@/lib/espace-session';

export const dynamic = 'force-dynamic';

/**
 * Point d'entrée `/espace?resume=<jeton>` : consomme un lien de reprise
 * (usage unique, TTL) puis pose une session signée en cookie et rend l'espace.
 * Permet d'envoyer des liens d'accès dans les emails sans jamais exposer le
 * jeton dossier (stocké hashé en base depuis la sécurisation M1).
 */
export default async function EspaceResumePage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const { resume } = await searchParams;

  if (resume) {
    const clientId = await consumeResumeLink(resume);
    if (!clientId) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div className="bg-white border rounded-xl p-8 max-w-md text-center space-y-3">
            <p className="font-semibold text-lg">Lien expiré ou déjà utilisé</p>
            <p className="text-sm text-slate-700">
              Ce lien de reprise n’est plus valable. Utilisez le lien d’accès reçu dans l’email le
              plus récent, ou contactez-nous pour en recevoir un nouveau.
            </p>
            <Link href="/" className="text-sm underline text-slate-700">← Retour à l’accueil</Link>
          </div>
        </div>
      );
    }
    await createEspaceSession(clientId);
    redirect('/espace');
  }

  // Session déjà ouverte (cookie signé).
  const clientId = await readEspaceSession();
  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white border rounded-xl p-8 max-w-md text-center space-y-3">
          <p className="font-semibold text-lg">Accès requis</p>
          <p className="text-sm text-slate-700">
            Utilisez le lien d’accès reçu par email pour ouvrir votre espace.
          </p>
          <Link href="/" className="text-sm underline text-slate-700">← Retour à l’accueil</Link>
        </div>
      </div>
    );
  }

  return <EspaceClientView clientId={clientId} />;
}
