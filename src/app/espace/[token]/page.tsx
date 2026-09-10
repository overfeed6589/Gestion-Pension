import { findClientByAccessToken } from '@/lib/client-access';
import { EspaceClientView } from '@/components/client/EspaceClientView';

export const dynamic = 'force-dynamic';

/** Accès direct à l'espace via le jeton dossier : /espace/<token>. */
export default async function EspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await findClientByAccessToken(token);

  if (!client) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white border rounded-xl p-8 max-w-md text-center space-y-3">
          <p className="font-semibold text-lg">Lien invalide</p>
          <p className="text-sm text-slate-700">
            Ce lien d’accès n’est pas reconnu. Vérifiez l’adresse reçue par email, ou contactez-nous
            pour recevoir un nouveau lien.
          </p>
          <p className="text-sm text-slate-700">Astuce : utilisez le lien le plus récent reçu par email.</p>
        </div>
      </div>
    );
  }

  return <EspaceClientView clientId={client.id} />;
}
