import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

// Durcissement des cookies de session (Phase A3) : on impose httpOnly + sameSite=lax,
// et secure dès que NODE_ENV=production (le cookie ne transite alors qu'en HTTPS).
// On fusionne APRÈS les options Supabase pour garantir ces valeurs quoi qu'il arrive.
function cookieSecurityOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export async function createClient() {
  const cookieStore = await cookies();

  // Env validé centralement (Phase A5) : échec tôt si clé Supabase manquante.
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...cookieSecurityOptions(), ...options })
            );
          } catch {
            // Le proxy (src/proxy.ts) rafraîchit les cookies
          }
        },
      },
    }
  );
}