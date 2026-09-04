/**
 * Garantie anti double-réservation — Phase B2.
 *
 * Applique (idempotent) :
 *  1. l'extension `btree_gist` (nécessaire à la contrainte d'exclusion sur uuid) ;
 *  2. un index sur booking_segments(unit_id) ;
 *  3. une contrainte d'EXCLUSION : une unité ne peut pas avoir deux segments
 *     (de réservations non annulées) dont les périodes [start, end) se chevauchent.
 *
 * Raisons :
 *  - Même avec l'allocation atomique (allocation.ts, Phase B1), un INSERT/UPDATE
 *    direct ou concurrent qui contournerait le code applicatif pourrait
 *    double-réserver un box. La contrainte DB est la garantie ultime : toute
 *    écriture en conflit est rejetée par Postgres (erreur 23P01 / 23505).
 *
 * Pré-requis : DIRECT_URL (rôle postgres, port 5432). Usage :
 *   npx tsx scripts/apply-constraints.ts   (ou : npm run db:constraints)
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });

function requireVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} manquante dans .env.local`);
  return v;
}

async function main() {
  const directUrl = requireVar('DIRECT_URL');
  const sql = postgres(directUrl, { max: 1 });

  try {
    // Préflight : s'il existe déjà des segments qui se chevauchent sur une même
    // unité, la contrainte ne pourra pas être posée. On refuse et on l'explique.
    const duplicates = await sql`
      SELECT a.id AS a_id, b.id AS b_id
      FROM booking_segments a
      JOIN bookings ba ON ba.id = a.booking_id
      JOIN booking_segments b ON b.unit_id = a.unit_id
      JOIN bookings bb ON bb.id = b.booking_id
      WHERE a.unit_id IS NOT NULL
        AND ba.status <> 'cancelled'
        AND bb.status <> 'cancelled'
        AND a.start_date < b.end_date
        AND b.start_date < a.end_date
        AND a.id < b.id
      LIMIT 20
    `;

    if (duplicates.length > 0) {
      console.error(
        `✖ ${duplicates.length}+ segments se chevauchent sur une même unité.\n` +
          'Corrige d’abord ces conflits (les périodes se chevauchent pour une même unité) ' +
          'puis relance :\n' +
          duplicates.map((d) => `  - ${d.a_id} / ${d.b_id}`).join('\n')
      );
      process.exit(1);
    }

    console.log('→ Extension btree_gist + contrainte d’exclusion...');
    await sql.unsafe(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;

      CREATE INDEX IF NOT EXISTS booking_segments_unit_id_idx
        ON booking_segments (unit_id);

      ALTER TABLE booking_segments
        DROP CONSTRAINT IF EXISTS booking_segments_no_overlap;

      ALTER TABLE booking_segments
        ADD CONSTRAINT booking_segments_no_overlap
        EXCLUDE USING gist (
          unit_id WITH =,
          daterange(start_date, end_date, '[)') WITH &&
        )
        WHERE (unit_id IS NOT NULL);
    `);

    console.log('✔ Contrainte booking_segments_no_overlap active.');
    console.log('  (écriture en conflit = erreur 23P01 → renvoyée comme « box occupé » par l’app)');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
