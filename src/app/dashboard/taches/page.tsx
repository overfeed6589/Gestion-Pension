import { redirect } from 'next/navigation';

// ---------------------------------------------------------------------------
// Phase H2 : la page « Tâches du jour » est remplacée par le tableau de bord
// (« événements du jour ») qui intègre désormais les tâches staff
// (repas/soins + cochage daily_reports). Toutes les anciennes entrées
// redirigent vers /dashboard.
// ---------------------------------------------------------------------------

export default async function TachesPage() {
  redirect('/dashboard');
}