import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Tableau de bord de la pension</h1>
      <p className="mt-2 text-slate-600">Bienvenue, {user.email}</p>
    </div>
  );
}