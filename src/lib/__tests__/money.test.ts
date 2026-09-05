import { describe, it, expect } from 'vitest';
import { eurosToCents, centsToEuros, computeNights, formatCents } from '@/lib/money';

describe('eurosToCents', () => {
  it('convertit euros -> centimes sans erreur flottante', () => {
    expect(eurosToCents(25)).toBe(2500);
    expect(eurosToCents(25.5)).toBe(2550);
    expect(eurosToCents(0.1)).toBe(10);
  });
});

describe('centsToEuros', () => {
  it('convertit centimes -> euros', () => {
    expect(centsToEuros(2500)).toBe(25);
    expect(centsToEuros(1234)).toBe(12.34);
  });
});

describe('formatCents', () => {
  it('formate en devise française', () => {
    expect(formatCents(1234)).toContain('12,34');
    expect(formatCents(0)).toContain('0');
  });
});

describe('computeNights', () => {
  it('calcule le nombre de nuits (fin exclusive), min 1', () => {
    expect(computeNights('2026-07-01', '2026-07-02')).toBe(1);
    expect(computeNights('2026-07-01', '2026-07-14')).toBe(13);
    // Fin antérieure ou égale : on facture au moins la nuit d'arrivée.
    expect(computeNights('2026-07-01', '2026-07-01')).toBe(1);
  });
});
