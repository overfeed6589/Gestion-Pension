import { describe, it, expect } from 'vitest';
import { buildOfferPlan, type OfferPlanCategory, type OfferSegmentInput } from '@/lib/offer-plan';

// Catégories d'exemple (prix TTC en centimes).
const cats: OfferPlanCategory[] = [
  { id: 'type1', name: 'Box Chat Unique', capacity: 1, basePricePerNight: 2000, surchargePerAnimal: 600 },
  { id: 'type2', name: 'Suite Famille', capacity: 3, basePricePerNight: 3200, surchargePerAnimal: 800 },
];

const seg = (p: Partial<OfferSegmentInput>): OfferSegmentInput => ({
  startDate: '2026-07-01',
  endDate: '2026-07-02',
  categoryId: 'type1',
  petIds: ['p1'],
  ...p,
});

describe('buildOfferPlan', () => {
  it('séjour simple : prix = nuitée × base, 1 animal', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-14', // 13 nuits
      segments: [seg({ startDate: '2026-07-01', endDate: '2026-07-14', categoryId: 'type1' })],
      categories: cats,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.segments[0].nights).toBe(13);
      expect(plan.segments[0].price).toBe(13 * 2000);
      expect(plan.totalPrice).toBe(13 * 2000);
    }
  });

  it('séjour scindé (ex: 11 j type 1 + 2 j type 2) — somme des segments', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-14',
      segments: [
        seg({ startDate: '2026-07-01', endDate: '2026-07-12', categoryId: 'type1' }), // 11 nuits
        seg({ startDate: '2026-07-12', endDate: '2026-07-14', categoryId: 'type2' }), // 2 nuits
      ],
      categories: cats,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.totalPrice).toBe(11 * 2000 + 2 * 3200);
    }
  });

  it('famille de 3 dans une suite capacité 3 : base + 2 suppléments/nuit', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-04', // 3 nuits
      segments: [
        seg({ startDate: '2026-07-01', endDate: '2026-07-04', categoryId: 'type2', petIds: ['p1', 'p2', 'p3'] }),
      ],
      categories: cats,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      // 3200 + 2×800 = 4800/nuit × 3
      expect(plan.totalPrice).toBe(3 * (3200 + 2 * 800));
    }
  });

  it('groupe > capacité réparti sur deux espaces parallèles (couverture exacte)', () => {
    // 4 chats, suites capacité 3 → 2 suites parallèles (3 + 1) sur les mêmes dates.
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-04',
      segments: [
        seg({ startDate: '2026-07-01', endDate: '2026-07-04', categoryId: 'type2', petIds: ['p1', 'p2', 'p3'] }),
        seg({ startDate: '2026-07-01', endDate: '2026-07-04', categoryId: 'type2', petIds: ['p4'] }),
      ],
      categories: cats,
    });
    expect(plan.ok).toBe(true);
  });

  it('rejette un animal présent sur deux espaces la même nuit', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-04',
      segments: [
        seg({ startDate: '2026-07-01', endDate: '2026-07-04', categoryId: 'type2', petIds: ['p1', 'p2'] }),
        seg({ startDate: '2026-07-01', endDate: '2026-07-04', categoryId: 'type2', petIds: ['p1', 'p3'] }),
      ],
      categories: cats,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toContain('plusieurs espaces');
  });

  it('rejette un animal qui ne couvre pas la fin du séjour', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-08',
      segments: [
        seg({ startDate: '2026-07-01', endDate: '2026-07-05', categoryId: 'type1', petIds: ['p1'] }),
        // p2 n'est présent que du 1 au 5 → ne couvre pas jusqu'au 8.
        seg({ startDate: '2026-07-05', endDate: '2026-07-08', categoryId: 'type1', petIds: ['p2'] }),
      ],
      categories: cats,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toContain('totalité du séjour');
  });

  it('rejette le dépassement de capacité d’un espace', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-02',
      segments: [seg({ categoryId: 'type1', petIds: ['p1', 'p2'] })], // capacité type1 = 1
      categories: cats,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toContain('Capacité dépassée');
  });

  it('rejette une catégorie inconnue', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-02',
      segments: [seg({ categoryId: 'inconnu' })],
      categories: cats,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toContain('catégorie');
  });

  it('rejette des dates inversées', () => {
    const plan = buildOfferPlan({
      checkInDate: '2026-07-08',
      checkOutDate: '2026-07-01',
      segments: [seg({ startDate: '2026-07-01', endDate: '2026-07-08' })],
      categories: cats,
    });
    expect(plan.ok).toBe(false);
  });
});
