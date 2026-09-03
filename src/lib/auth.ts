import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

// ---------------------------------------------------------------------------
// Helpers d'authentification centralisés (Phase A1)
// ---------------------------------------------------------------------------
// Raisons :
//  - Avant cette étape, la moitié des server actions ne vérifiaient PAS que
//    l'utilisateur était connecté (bookings, scheduling, housing, purchase-orders).
//    Une server action est un endpoint HTTP : il faut un contrôle systématique
//    (défense en profondeur, le middleware /dashboard seul ne suffit pas).
//  - Le rôle (Phase A2) viendra s'ajouter ici sans toucher aux appelants.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Renvoie l'utilisateur connecté ou `null` (lecture seule, pas de redirection).
 * Utile dans les pages server components pour un rendu conditionnel.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? '',
  };
}

/**
 * Exige une session valide pour une server action ou une page protégée.
 * Redirige vers /login si absent (idiome Next.js standard).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}
