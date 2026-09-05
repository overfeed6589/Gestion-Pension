import { describe, it, expect } from 'vitest';
import {
  computeSegmentPrice,
  computeStayPrice,
  computeDepositAmount,
  computeRemainingBalance,
  type SegmentPricingInput,
} from '@/lib/pricing';

describe('computeSegmentPrice', () => {
  it('1 animal = prix de l’espace seul (aucun supplément)', () => {
    expect(
      computeSegmentPrice({ nights: 10, basePricePerNight: 2000, surchargePerAnimal: 600, petCount: 1 })
    ).toBe(20000);
  });

  it('2 animaux = base + 1 supplément par nuit', () => {
    expect(
      computeSegmentPrice({ nights: 10, basePricePerNight: 2000, surchargePerAnimal: 600, petCount: 2 })
    ).toBe(10 * (2000 + 600)); // 26000
  });

  it('3 animaux = base + 2 suppléments', () => {
    expect(
      computeSegmentPrice({ nights: 7, basePricePerNight: 1500, surchargePerAnimal: 500, petCount: 3 })
    ).toBe(7 * (1500 + 2 * 500));
  });

  it('rejette les entrées incohérentes', () => {
    expect(() =>
      computeSegmentPrice({ nights: 0, basePricePerNight: 1000, surchargePerAnimal: 0, petCount: 1 })
    ).toThrow();
    expect(() =>
      computeSegmentPrice({ nights: 1, basePricePerNight: 1000, surchargePerAnimal: 0, petCount: 0 })
    ).toThrow();
  });
});

describe('computeStayPrice', () => {
  it('somme les segments (séjour scindé en plusieurs espaces)', () => {
    const segments: SegmentPricingInput[] = [
      { nights: 11, basePricePerNight: 2000, surchargePerAnimal: 600, petCount: 1 },
      { nights: 2, basePricePerNight: 1500, surchargePerAnimal: 500, petCount: 1 },
    ];
    expect(computeStayPrice(segments)).toBe(11 * 2000 + 2 * 1500);
  });
});

describe('computeDepositAmount', () => {
  it('30 % arrondi', () => {
    expect(computeDepositAmount(25000, 30)).toBe(7500);
    expect(computeDepositAmount(12345, 30)).toBe(3704);
  });
});

describe('computeRemainingBalance', () => {
  it('solde = total - acompte, jamais négatif', () => {
    expect(computeRemainingBalance(25000, 7500)).toBe(17500);
    expect(computeRemainingBalance(100, 150)).toBe(0);
  });
});
