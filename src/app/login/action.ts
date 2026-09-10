'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, clientIpFromHeaders, rateLimitIdentifier } from '@/lib/rate-limit';

export async function login(formData: FormData) {
  // Anti brute-force complémentaire (Supabase atténue déjà) : 10 tentatives
  // par IP / 15 minutes.
  const h = await headers();
  const limit = await checkRateLimit(
    'login',
    rateLimitIdentifier('login', clientIpFromHeaders(h)),
    10,
    900
  );
  if (!limit.allowed) {
    const message = encodeURIComponent(
      `Trop de tentatives. Réessayez dans ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`
    );
    redirect(`/login?error=${message}`);
  }

  const supabase = await createClient();

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    const errorMessage = encodeURIComponent('Identifiants ou mot de passe incorrects');
    redirect(`/login?error=${errorMessage}`);
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/** Déconnexion (dashboard). */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}