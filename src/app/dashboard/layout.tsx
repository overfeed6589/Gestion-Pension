import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/utils/supabase/server';
import { logout } from '@/app/login/action';
import { FicheStack } from '@/components/fiches/FicheStack';

// ---------------------------------------------------------------------------
// Shell du dashboard (Phase G — Lot 3)
// ---------------------------------------------------------------------------
// Navigation filtrée par rôle (les gardes `requireRole` des pages restent la
// vraie sécurité ; ici c'est ergonomique). `dev`/`owner` (boss) voient tout.
// ---------------------------------------------------------------------------

type NavLink = { href: string; label: string; roles: string[]; section?: string };

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Tableau de bord', roles: ['secretary', 'staff', 'owner', 'dev'] },
  { href: '/dashboard/offres', label: 'Offres & réservations', roles: ['secretary', 'owner', 'dev'] },
  { href: '/dashboard/informations/reservations', label: 'Réservations', roles: ['secretary', 'staff', 'owner', 'dev'], section: 'Informations' },
  { href: '/dashboard/informations/clients', label: 'Clients', roles: ['secretary', 'owner', 'dev'], section: 'Informations' },
  { href: '/dashboard/informations/animaux', label: 'Animaux', roles: ['staff', 'owner', 'dev'], section: 'Informations' },
  { href: '/dashboard/informations/factures', label: 'Factures', roles: ['secretary', 'owner', 'dev'], section: 'Informations' },
  { href: '/dashboard/planning/rdv', label: 'Rendez-vous', roles: ['secretary', 'staff', 'owner', 'dev'], section: 'Planning' },
  { href: '/dashboard/planning/animaux', label: 'Animaux par box', roles: ['secretary', 'staff', 'owner', 'dev'], section: 'Planning' },
  { href: '/dashboard/register', label: 'Registre (check-in/out)', roles: ['secretary', 'staff', 'owner', 'dev'] },
  { href: '/dashboard/fiches', label: 'Fiches techniques', roles: ['staff', 'owner', 'dev'] },
  { href: '/dashboard/infrastructure/logements', label: 'Logements & box', roles: ['secretary', 'staff', 'owner', 'dev'], section: 'Infrastructure' },
  { href: '/dashboard/infrastructure/inventaire', label: 'Inventaire & commandes', roles: ['secretary', 'staff', 'owner', 'dev'], section: 'Infrastructure' },
  { href: '/dashboard/logs', label: 'Logs', roles: ['owner', 'dev'] },
  { href: '/dashboard/rapports', label: 'Rapports', roles: ['owner', 'dev'] },
  { href: '/dashboard/parametres', label: 'Paramètres', roles: ['owner', 'dev'] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <p className="font-semibold text-sm leading-tight">Gestion Pension</p>
          <p className="text-xs text-slate-400 mt-1">Itération 2 — réorganisation</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_LINKS.filter(
            (link) => !profile?.role || link.roles.includes(profile.role)
          ).map((link, index, filtered) => (
            <div key={link.href}>
              {link.section && (index === 0 || filtered[index - 1].section !== link.section) && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {link.section}
                </p>
              )}
              <Link
                href={link.href}
                className="block px-3 py-2 rounded text-sm text-slate-200 hover:bg-slate-800 transition"
              >
                {link.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <p>{profile?.fullName ?? user.email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="text-slate-300 hover:text-white underline underline-offset-2"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <main className="pl-60 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
      {/* Fenêtres « fiche » empilées (Phase H1) — pilotées par l'URL, montées
          une seule fois pour que toutes les pages en bénéficient. */}
      <Suspense fallback={null}>
        <FicheStack />
      </Suspense>
    </div>
  );
}
