import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/utils/supabase/server';

// ---------------------------------------------------------------------------
// Shell du dashboard (Phase G — Lot 3)
// ---------------------------------------------------------------------------
// Navigation minimale vers les modules existants. La sécurité repose sur les
// gardes `requireRole` des actions ; ici on vérifie seulement la session.
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { href: '/dashboard', label: 'Tableau de bord' },
  { href: '/dashboard/offres', label: 'Offres & réservations' },
  { href: '/dashboard/register', label: 'Registre / planning' },
  { href: '/dashboard/clients', label: 'Clients' },
  { href: '/dashboard/housing', label: 'Logements & box' },
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
          <p className="text-xs text-slate-400 mt-1">Itération 1 — pilote</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-3 py-2 rounded text-sm text-slate-200 hover:bg-slate-800 transition"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800 text-xs text-slate-400">
          {profile?.fullName ?? user.email}
        </div>
      </aside>
      <main className="pl-60 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
