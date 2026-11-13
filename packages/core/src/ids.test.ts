import { describe, it, expect } from 'vitest';
import { generateId } from './ids.js';

describe('Génération d’Identifiants Uniques ULID (ids.ts)', () => {
  it('génère 1 000 identifiants conformes au standard Crockford Base32', () => {
    // Regex Crockford Base32 stricte : 0-9, A-Z excluant I, L, O, U (26 caractères exactement)
    const crockfordBase32Regex = /^[0-9A-HJKMNP-TV-Z]{26}$/;

    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const id = generateId();
      expect(id).toMatch(crockfordBase32Regex);
      expect(id).toHaveLength(26);
      ids.push(id);
    }

    // Unicité absolue sur 1 000 IDs
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(1000);
  });

  it('les identifiants générés à intervalles sont strictement croissants (tri chronologique)', async () => {
    const id1 = generateId();
    await new Promise((resolve) => setTimeout(resolve, 2)); // 2 ms d'écart pour garantir l'incrément de timestamp
    const id2 = generateId();

    expect(id2 > id1).toBe(true);
  });

  it('ne contient AUCUN caractère non-ASCII ou cyrillique', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      // Code ASCII entre 48-57 (0-9) ou 65-90 (A-Z)
      for (let c = 0; c < id.length; c++) {
        const code = id.charCodeAt(c);
        const isDigit = code >= 48 && code <= 57;
        const isUpperAlpha = code >= 65 && code <= 90;
        expect(isDigit || isUpperAlpha).toBe(true);
      }
    }
  });
});
