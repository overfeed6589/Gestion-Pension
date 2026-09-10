import { describe, it, expect } from 'vitest';
import { clientPetCompletionSchema } from '../validations/client-pet';
import { hashToken, tokensMatch } from '../tokens';

// ---------------------------------------------------------------------------
// Sécurité espace client (H1 + M1)
// ---------------------------------------------------------------------------

describe('clientPetCompletionSchema (allow-list)', () => {
  it('accepte les champs métier autorisés', () => {
    const res = clientPetCompletionSchema.safeParse({
      identificationNumber: '250268731234567',
      isSterilized: true,
      medicalNotes: 'Rien à signaler.',
      sex: 'M',
    });
    expect(res.success).toBe(true);
  });

  it('rejette les colonnes sensibles (clientId, name, species, vaccines)', () => {
    for (const injected of [
      { clientId: 'autre-client' },
      { name: 'Nouveau nom' },
      { species: 'Chien' },
      { vaccines: [{ name: 'fake' }] },
      { id: 'autre-id' },
    ]) {
      const res = clientPetCompletionSchema.safeParse(injected);
      expect(res.success, `devrait rejeter ${JSON.stringify(injected)}`).toBe(false);
    }
  });

  it('rejette un numéro I-CAD mal formé', () => {
    const res = clientPetCompletionSchema.safeParse({ identificationNumber: 'abc' });
    expect(res.success).toBe(false);
  });

  it('rejette un sexe hors énumération', () => {
    const res = clientPetCompletionSchema.safeParse({ sex: 'X' });
    expect(res.success).toBe(false);
  });
});

describe('hashToken', () => {
  it('produit un SHA-256 hexadécimal déterministe', () => {
    const h1 = hashToken('abc');
    const h2 = hashToken('abc');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('différencie deux jetons distincts', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('compare en temps constant', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
  });
});
