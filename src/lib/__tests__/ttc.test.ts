import { describe, it, expect } from 'vitest';
import { splitTtc } from '@/lib/invoicing/ttc';

describe('splitTtc', () => {
  it('décompose un montant TTC exact (7500 cts à 20 % → HT 6250 + TVA 1250)', () => {
    const { subtotal, tax } = splitTtc(7500, 2000);
    expect(tax).toBe(1250);
    expect(subtotal).toBe(6250);
    expect(subtotal + tax).toBe(7500);
  });

  it('arrondit la TVA et conserve un total TTC exact quel que soit le montant', () => {
    for (const ttc of [1, 10, 3704, 12345, 999999]) {
      const { subtotal, tax } = splitTtc(ttc, 2000);
      expect(subtotal + tax).toBe(ttc);
      // TVA ≈ 20 % du TTC (à l'arrondi près).
      expect(Math.abs(tax - (ttc * 2000) / 12000)).toBeLessThanOrEqual(1);
    }
  });

  it('taux 0 (exonération) → aucune TVA', () => {
    const { subtotal, tax } = splitTtc(1000, 0);
    expect(tax).toBe(0);
    expect(subtotal).toBe(1000);
  });
});
