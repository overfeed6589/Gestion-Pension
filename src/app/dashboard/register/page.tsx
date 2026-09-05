import { db } from '@/db';
import { checkInBookingAction, checkOutBookingAction } from '@/app/dashboard/bookings/actions';
import { getCurrentProfile, canAccess } from '@/lib/auth';

export default async function WeeklyRegisterPage() {
  // Profil courant pour le masquage UI (A2) : les boutons check-in/check-out ne
  // sont affichés qu'aux rôles habilités (`staff`, couvert par dev/owner).
  // La sécurité repose sur les gardes `requireRole` des actions, pas sur ce masquage.
  const currentProfile = await getCurrentProfile();
  const canManageMouvements = currentProfile
    ? canAccess(currentProfile.role, ['staff'])
    : false;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Calculer les 7 prochains jours pour la vue planning
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() + i);
    return {
      dateObj: d,
      dateStr: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
    };
  });

  // Récupération de toutes les réservations pertinentes (actives ou sur la semaine)
  const bookings = await db.query.bookings.findMany({
    with: {
      client: true,
      segments: {
        with: {
          assignedUnit: { with: { category: true } },
          occupantLinks: { with: { pet: true } },
        },
      },
    },
    orderBy: (bookings, { asc }) => [asc(bookings.checkInDate)],
  });

  // 1. Mouvements d'aujourd’hui (pour action directe)
  const arrivingToday = bookings.filter((b) => {
    const checkIn = new Date(b.checkInDate).toISOString().split('T')[0];
    return checkIn === todayStr && b.status === 'confirmed';
  });

  const departingToday = bookings.filter((b) => {
    const checkOut = new Date(b.checkOutDate).toISOString().split('T')[0];
    return checkOut === todayStr && b.status === 'checked_in';
  });

  // 2. Animaux actuellement en pension (en cours)
  const currentlyInPension = bookings.filter((b) => b.status === 'checked_in');

  return (
    <div className="p-6 space-y-10 max-w-7xl mx-auto">
      
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registre & Planning des Mouvements</h1>
          <p className="text-muted-foreground">
            Pilotez les entrées/sorties du jour et visualisez la charge de la semaine.
          </p>
        </div>
        <div className="bg-muted px-4 py-2 rounded-lg text-sm font-medium">
          Aujourd’hui : {today.toLocaleDateString('fr-FR', { dateStyle: 'full' })}
        </div>
      </div>

      {/* SECTION A : ACTIONS DU JOUR (Arrivées & Départs immédiats) */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight border-b pb-2 flex items-center gap-2">
          ⚡ Actions Prioritaires du Jour
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Arrivées à valider */}
          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              📥 Arrivées à encaisser / valider ({arrivingToday.length})
            </h3>
            <div className="space-y-3">
              {arrivingToday.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucune arrivée en attente aujourd’hui.</p>
              ) : (
                arrivingToday.map((booking) => {
                  const petsList = booking.segments.flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name)).join(', ');
                  const unitName = booking.segments[0]?.assignedUnit?.name || 'Box non assigné';
                  return (
                    <div key={booking.id} className="bg-background border p-3 rounded-lg flex items-center justify-between gap-4 shadow-sm">
                      <div>
                        <p className="font-medium">{petsList || 'Animal'}</p>
                        <p className="text-xs text-muted-foreground">{booking.client?.firstName} {booking.client?.lastName} • <span className="font-semibold text-amber-600">{unitName}</span></p>
                      </div>
                      {canManageMouvements && (
                        <form action={async () => { 'use server'; await checkInBookingAction(booking.id); }}>
                          <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium py-1.5 px-3 rounded transition">
                            Check-in
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Départs à valider */}
          <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
              📤 Départs prévus ({departingToday.length})
            </h3>
            <div className="space-y-3">
              {departingToday.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucun départ prévu aujourd’hui.</p>
              ) : (
                departingToday.map((booking) => {
                  const petsList = booking.segments.flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name)).join(', ');
                  const unitName = booking.segments[0]?.assignedUnit?.name || 'Box';
                  return (
                    <div key={booking.id} className="bg-background border p-3 rounded-lg flex items-center justify-between gap-4 shadow-sm">
                      <div>
                        <p className="font-medium">{petsList}</p>
                        <p className="text-xs text-muted-foreground">{booking.client?.firstName} {booking.client?.lastName} • <span className="font-semibold text-blue-600">{unitName}</span></p>
                      </div>
                      {canManageMouvements && (
                        <form action={async () => { 'use server'; await checkOutBookingAction(booking.id); }}>
                          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition">
                            Check-out
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* SECTION B : ANIMAUX ACTUELLEMENT EN PENSION */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight border-b pb-2 flex items-center gap-2">
          🐾 Animaux Actuellement en Pension ({currentlyInPension.length})
        </h2>
        
        {currentlyInPension.length === 0 ? (
          <p className="text-sm text-muted-foreground italic bg-card border p-4 rounded-xl">Aucun animal n’est actuellement hébergé dans la pension.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {currentlyInPension.map((booking) => {
              const petsList = booking.segments.flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name)).join(', ');
              const unitName = booking.segments[0]?.assignedUnit?.name || 'Box non assigné';
              return (
                <div key={booking.id} className="bg-card border border-emerald-500/30 p-4 rounded-xl space-y-2 shadow-sm">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold text-base">{petsList}</p>
                    <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {unitName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Proprio : {booking.client?.firstName} {booking.client?.lastName}</p>
                  <p className="text-xs text-emerald-600 font-medium pt-2 border-t">
                    En garde depuis le : {new Date(booking.actualCheckIn || booking.checkInDate).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION C : VISIBILITÉ SUR LES 7 PROCHAINS JOURS */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight border-b pb-2 flex items-center gap-2">
          📅 Visibilité des Flux sur 7 Jours
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            // Filtrer les arrivées et départs pour ce jour précis
            const dayArrivals = bookings.filter(b => new Date(b.checkInDate).toISOString().split('T')[0] === day.dateStr);
            const dayDepartures = bookings.filter(b => new Date(b.checkOutDate).toISOString().split('T')[0] === day.dateStr);
            const isToday = day.dateStr === todayStr;

            return (
              <div 
                key={day.dateStr} 
                className={`border rounded-xl p-3 space-y-3 bg-card ${isToday ? 'ring-2 ring-primary border-primary' : ''}`}
              >
                <div className="text-center pb-2 border-b">
                  <p className={`text-xs font-bold uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isToday ? "Aujourd’hui" : day.label.split(' ')[0]}
                  </p>
                  <p className="text-sm font-semibold">{day.label.split(' ').slice(1).join(' ')}</p>
                </div>

                {/* Arrivées prévues ce jour-là */}
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-amber-600 uppercase">Entrées ({dayArrivals.length})</p>
                  {dayArrivals.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucune</p>
                  ) : (
                    dayArrivals.map(b => {
                      const pName = b.segments.flatMap(s => s.occupantLinks.map(ol => ol.pet?.name)).join(', ');
                      return (
                        <div key={b.id} className="text-xs bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200/50">
                          <span className="font-medium truncate block">{pName}</span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Départs prévus ce jour-là */}
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-semibold text-blue-600 uppercase">Sorties ({dayDepartures.length})</p>
                  {dayDepartures.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucun</p>
                  ) : (
                    dayDepartures.map(b => {
                      const pName = b.segments.flatMap(s => s.occupantLinks.map(ol => ol.pet?.name)).join(', ');
                      return (
                        <div key={b.id} className="text-xs bg-blue-50 dark:bg-blue-950/40 p-1.5 rounded border border-blue-200/50">
                          <span className="font-medium truncate block">{pName}</span>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}