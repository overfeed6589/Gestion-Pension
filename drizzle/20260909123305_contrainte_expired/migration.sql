-- Contrainte anti double-réservation : libérer les unités des réservations
-- `cancelled` / `expired` (bug B2).
--
-- La contrainte EXCLUDE ne peut pas filtrer sur le statut (porté par `bookings`,
-- pas par `booking_segments`). Or cancelBooking / expireOfferedBooking gardaient
-- les segments en base : toute ré-attribution de ces unités échouait en 23P01
-- alors que le checker (cancelled/expired exclus) les annonce libres.
--
-- Correctif : purge des segments des réservations non actives + le code
-- applicatif supprime désormais les segments à l'annulation / expiration.
-- (Idempotent : drop-if-exists puis re-création de la contrainte.)
-- Pré-requis : extension btree_gist.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Purge : segments d'unités assignées appartenant à des réservations annulées
-- ou expirées (aucun rapport quotidien ne peut exister pour ces statuts).
DELETE FROM booking_segments s
USING bookings b
WHERE s.booking_id = b.id
  AND b.status IN ('cancelled', 'expired')
  AND s.unit_id IS NOT NULL;

ALTER TABLE booking_segments
  DROP CONSTRAINT IF EXISTS booking_segments_no_overlap;

ALTER TABLE booking_segments
  ADD CONSTRAINT booking_segments_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  )
  WHERE (unit_id IS NOT NULL);
