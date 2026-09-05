import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { ClientPetForm } from '@/components/clients/ClientPetForm';
import { PetAddForm } from '@/components/clients/PetAddForm';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  await requireRole('secretary');

  const clients = await db.query.clients.findMany({
    with: { pets: true, bookings: true },
    orderBy: (clients, { asc }) => [asc(clients.lastName)],
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clients & fiches animaux</h1>
        <p className="text-muted-foreground">
          Créez le dossier d’un client (propriétaire + 1er animal), puis réservez un séjour dans
          « Offres & réservations ».
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire de création */}
        <div className="lg:col-span-1">
          <ClientPetForm />
        </div>

        {/* Liste des dossiers */}
        <div className="lg:col-span-2 space-y-3">
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground italic bg-white border rounded-xl p-6">
              Aucun dossier client pour l’instant.
            </p>
          ) : (
            clients.map((client) => (
              <div key={client.id} className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {client.firstName} {client.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{client.email} • {client.phone}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Animaux : {client.pets.map((p) => p.name).join(', ') || '—'} •
                      Réservations : {client.bookings.length}
                    </p>
                  </div>
                </div>
                <div className="mt-2 border-t pt-2">
                  <PetAddForm clientId={client.id} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
