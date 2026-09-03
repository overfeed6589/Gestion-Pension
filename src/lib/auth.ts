import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, type ProfileRole } from '@/db/schema';
import { createClient } from '@/utils/supabase/server';

// ---------------------------------------------------------------------------
// Helpers d'authentification et d'autorisation centralisés (Phases A1 & A2)
// ---------------------------------------------------------------------------
// Raisons :
//  - Avant A1, la moitié des server actions ne vérifiaient PAS que l'utilisateur
//    était connecté (bookings, scheduling, housing, purchase-orders). Une server
//    action est un endpoint HTTP : contrôle systématique obligatoire.
//  - A2 ajoute l'autorisation par rôle (matrice PLAN.md) : la permission d'une
//    action se déclare par `requireRole('secretary')`, etc. `dev`/`owner` sont
//    des "boss" qui couvrent tous les rôles (un owner peut tout faire).
//  - `secretary` et `staff` sont DISJOINTS (pas de hiérarchie entre eux) : une
//    comparaison par "niveau" serait fausse, d'où la notion de liste autorisée +
//    boss.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  email: string;
};

export type StaffProfile = {
  role: ProfileRole;
  fullName: string | null;
};

/** Rôles disposant d'un accès complet (couvrent toutes les permissions). */
const BOSS_ROLES: readonly ProfileRole[] = ['dev', 'owner'];

/**
 * Autorise-t-on `role` à agir pour l'une des permissions `allowed` ?
 * Vrai si le rôle est dans la liste OU si c'est un boss (dev/owner).
 */
export function canAccess(role: ProfileRole, allowed: readonly ProfileRole[]): boolean {
  return allowed.includes(role) || BOSS_ROLES.includes(role);
}

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
 * Profil de l'utilisateur courant (rôle) ou `null` si non connecté / non profilé.
 */
export async function getCurrentProfile(): Promise<(SessionUser & StaffProfile) | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getProfileByUserId(user.id);
  if (!profile) return null;

  return { ...user, ...profile };
}

async function getProfileByUserId(userId: string): Promise<StaffProfile | null> {
  const [row] = await db
    .select({ role: profiles.role, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!row) return null;

  return { role: row.role, fullName: row.fullName };
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

/**
 * Exige une session + un rôle autorisé pour l'une des permissions `allowed`.
 * Redirige vers /login si non connecté, vers /dashboard si rôle insuffisant
 * (l'utilisateur est connu mais n'a pas le droit — pas la peine de l'envoyer
 * vers la page de login).
 */
export async function requireRole(
  ...allowed: ProfileRole[]
): Promise<SessionUser & StaffProfile> {
  const user = await requireUser();
  const profile = await getProfileByUserId(user.id);

  if (!profile || !canAccess(profile.role, allowed)) {
    redirect('/dashboard');
  }

  return { ...user, ...profile };
}

/**
 * Variante stricte : le rôle doit appartenir exactement à la liste (les boss ne
 * sont PAS injectés automatiquement). Utile pour des droits réservés à un rôle
 * précis si besoin à l'avenir.
 */
export async function requireRoleStrict(
  ...allowed: ProfileRole[]
): Promise<SessionUser & StaffProfile> {
  const user = await requireUser();
  const profile = await getProfileByUserId(user.id);

  if (!profile || !allowed.includes(profile.role)) {
    redirect('/dashboard');
  }

  return { ...user, ...profile };
}
