import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Point de santé (diagnostic + monitoring).
 * Renvoie quelles variables d'env sont présentes (noms uniquement) et l'état de
 * la connexion PostgreSQL (sans divulguer de secret). N'importe PAS le module db
 * (qui valide l'env) pour pouvoir remonter une erreur précise même si une
 * variable requise manque.
 */
export async function GET() {
  const names = [
    'DATABASE_URL',
    'DIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'CRON_SECRET',
    'NEXT_PUBLIC_SITE_URL',
    'EMAIL_FROM',
  ];

  const present: Record<string, boolean> = {};
  for (const name of names) {
    present[name] = Boolean(process.env[name]);
  }

  let db: { ok: boolean; message?: string } = { ok: false, message: 'DATABASE_URL absente' };
  if (process.env.DATABASE_URL) {
    try {
      // Driver postgres directement, sans passer par l'env validé ni le pooler
      // drizzle, pour isoler une erreur de connexion.
      const { default: postgres } = await import('postgres');
      const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
      await sql`select 1`;
      db = { ok: true };
      await sql.end();
    } catch (error) {
      db = {
        ok: false,
        message: error instanceof Error ? error.message.slice(0, 300) : String(error),
      };
    }
  }

  return NextResponse.json({
    status: db.ok ? 'ok' : 'error',
    envPresent: present,
    db,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
