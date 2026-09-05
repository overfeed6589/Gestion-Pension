import { describe, it, expect } from 'vitest';
import { daysBeforeArrival, shouldRefundDeposit } from '@/lib/refund-policy';

const NOW = '2026-07-01T00:00:00Z';

describe('daysBeforeArrival', () => {
  it('compte les jours pleins avant l’arrivée', () => {
    expect(daysBeforeArrival(NOW, '2026-07-08T00:00:00Z')).toBe(7);
    expect(daysBeforeArrival(NOW, '2026-07-07T12:00:00Z')).toBe(6);
    expect(daysBeforeArrival(NOW, '2026-07-01T00:00:00Z')).toBe(0);
  });
});

describe('shouldRefundDeposit', () => {
  const base = {
    status: 'confirmed' as const,
    checkInDate: '2026-07-08T00:00:00Z', // J+7
    now: NOW,
    depositAmount: 7500,
    refundDays: 7,
  };

  it('rembourse à J+7 exactement (seuil atteint)', () => {
    expect(shouldRefundDeposit(base)).toBe(true);
  });

  it('ne rembourse pas avant le seuil (J+6)', () => {
    expect(
      shouldRefundDeposit({ ...base, checkInDate: '2026-07-07T12:00:00Z' })
    ).toBe(false);
  });

  it('ne rembourse pas si la réservation n’est pas confirmée', () => {
    expect(shouldRefundDeposit({ ...base, status: 'offered' })).toBe(false);
  });

  it('ne rembourse pas s’il n’y a pas d’acompte', () => {
    expect(shouldRefundDeposit({ ...base, depositAmount: 0 })).toBe(false);
  });

  it('respecte le délai configuré dans les paramètres', () => {
    expect(shouldRefundDeposit({ ...base, refundDays: 10 })).toBe(false);
    expect(shouldRefundDeposit({ ...base, refundDays: 5 })).toBe(true);
  });
});
