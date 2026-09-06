import { describe, it, expect } from 'vitest';
import {
  computeRequiredSpaces,
  partitionPetCount,
  computeGroupNightPrice,
  buildSplitPlan,
  buildSegmentsForGroup,
  nightsRange,
  addDays,
} from '@/lib/split-plan';

describe('computeRequiredSpaces', () => {
  it('calcule le nombre d’espaces parallèles nécessaires', () => {
    expect(computeRequiredSpaces(1, 3)).toBe(1);
    expect(computeRequiredSpaces(3, 3)).toBe(1);
    expect(computeRequiredSpaces(4, 3)).toBe(2);
    expect(computeRequiredSpaces(6, 3)).toBe(2);
    expect(computeRequiredSpaces(7, 3)).toBe(3);
  });
});

describe('partitionPetCount', () => {
  it('répartit équitablement les animaux entre les espaces', () => {
    expect(partitionPetCount(4, 2)).toEqual([2, 2]);
    expect(partitionPetCount(5, 2)).toEqual([3, 2]);
    expect(partitionPetCount(7, 3)).toEqual([3, 2, 2]);
    expect(partitionPetCount(2, 3)).toEqual([1, 1]); // pas plus d’espaces que d’animaux
  });
});

describe('computeGroupNightPrice', () => {
  it('1 espace : base + supplément des animaux au-delà du 1er', () => {
    // 2 chats, capacité 3, base 2000, supplément 600 → 2000 + 600 = 2600.
    expect(computeGroupNightPrice(2, 3, 2000, 600)).toBe(2600);
  });
  it('groupe > capacité : prix de plusieurs espaces parallèles', () => {
    // 4 chats, cap 3 → 2 espaces [2,2] → 2×(2000+600).
    expect(computeGroupNightPrice(4, 3, 2000, 600)).toBe(2 * 2600);
  });
});

describe('buildSegmentsForGroup', () => {
  it('groupe > capacité : découpe en espaces parallèles disjoints', () => {
    const segs = buildSegmentsForGroup({
      petIds: ['p1', 'p2', 'p3', 'p4'],
      portions: [{ categoryId: 'suite', startDate: '2026-07-01', endDate: '2026-07-04', capacity: 3 }],
    });
    expect(segs).toHaveLength(2);
    expect(segs[0].petIds).toEqual(['p1', 'p2']);
    expect(segs[1].petIds).toEqual(['p3', 'p4']);
  });

  it('couverture d’un split séquentiel (suite 11 j + box 2 j)', () => {
    const petIds = ['p1', 'p2'];
    const segs = buildSegmentsForGroup({
      petIds,
      portions: [
        { categoryId: 'suite', startDate: '2026-07-01', endDate: '2026-07-12', capacity: 3 },
        { categoryId: 'box', startDate: '2026-07-12', endDate: '2026-07-14', capacity: 1 },
      ],
    });
    // suite : 1 segment (2 chats ≤ 3) ; box capacité 1 → 2 espaces [1,1].
    expect(segs).toHaveLength(3);
    expect(segs[1].petIds.length).toBe(1);
    expect(segs[2].petIds.length).toBe(1);
  });
});

describe('nightsRange / addDays', () => {
  it('compte les nuits entre deux dates (UTC)', () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-14T00:00:00Z');
    expect(nightsRange(start, end)).toBe(13);
    expect(addDays(start, 11).toISOString().slice(0, 10)).toBe('2026-07-12');
  });
});

describe('buildSplitPlan', () => {
  const categoryIds = ['suite', 'box'];

  it('séjour couvert par une seule catégorie (libre en continu)', async () => {
    const plan = await buildSplitPlan({
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      categoryIds,
      prefixNights: async (cat) => (cat === 'suite' ? 13 : 3),
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.segments).toEqual([
        { categoryId: 'suite', startDate: '2026-07-01', endDate: '2026-07-14' },
      ]);
    }
  });

  it('découpage mixte quand aucune catégorie ne couvre tout (11 j suite + 2 j box)', async () => {
    const plan = await buildSplitPlan({
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      categoryIds,
      prefixNights: async (cat, from) => {
        // suite libre du 1 au 12, box libre seulement à partir du 12.
        return cat === 'suite' && from.toISOString().slice(0, 10) < '2026-07-12' ? 11 : cat === 'box' ? 2 : 0;
      },
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.segments).toEqual([
        { categoryId: 'suite', startDate: '2026-07-01', endDate: '2026-07-12' },
        { categoryId: 'box', startDate: '2026-07-12', endDate: '2026-07-14' },
      ]);
    }
  });

  it('échec si un trou n’est couvert par aucune catégorie', async () => {
    const plan = await buildSplitPlan({
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      categoryIds: ['suite'],
      // La catégorie n'est plus disponible après le 10 : trou non couvert.
      prefixNights: async (_cat, from) =>
        from.toISOString().slice(0, 10) < '2026-07-10' ? 5 : 0,
    });
    expect(plan.ok).toBe(false);
  });

  it('dates inversées → échec', async () => {
    const plan = await buildSplitPlan({
      startDate: '2026-07-14',
      endDate: '2026-07-01',
      categoryIds,
      prefixNights: async () => 1,
    });
    expect(plan.ok).toBe(false);
  });
});
