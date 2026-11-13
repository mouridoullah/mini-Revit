import { describe, it, expect } from 'vitest';
import { signedArea, isCCW, perimeter, centroid } from './polygon.js';
import { vec2, equals } from './vec2.js';

describe('Algorithmes Polygonaux (Polygon)', () => {
  describe('Aire signée et orientation (Shoelace)', () => {
    it('calcule l aire positive pour un carré CCW', () => {
      const squareCCW = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];
      expect(signedArea(squareCCW)).toBe(10000); // 100 * 100
      expect(isCCW(squareCCW)).toBe(true);
    });

    it('calcule l aire négative pour un carré CW (sens horaire)', () => {
      const squareCW = [vec2(0, 0), vec2(0, 100), vec2(100, 100), vec2(100, 0)];
      expect(signedArea(squareCW)).toBe(-10000);
      expect(isCCW(squareCW)).toBe(false);
    });

    it('calcule l aire d un triangle rectangle', () => {
      const tri = [vec2(0, 0), vec2(60, 0), vec2(0, 80)];
      expect(signedArea(tri)).toBe((60 * 80) / 2); // 2400
      expect(isCCW(tri)).toBe(true);
    });

    it('renvoie 0 pour un polygone de moins de 3 sommets ou aplati', () => {
      expect(signedArea([])).toBe(0);
      expect(signedArea([vec2(10, 10), vec2(20, 20)])).toBe(0);

      // Points colinéaires
      const flat = [vec2(0, 0), vec2(50, 0), vec2(100, 0)];
      expect(signedArea(flat)).toBe(0);
    });
  });

  describe('Périmètre d un polygone', () => {
    it('calcule le périmètre d un rectangle 300 × 400', () => {
      const rect = [vec2(0, 0), vec2(300, 0), vec2(300, 400), vec2(0, 400)];
      expect(perimeter(rect)).toBe(2 * (300 + 400)); // 1400
    });

    it('calcule le périmètre d un triangle 3-4-5', () => {
      const tri = [vec2(0, 0), vec2(300, 0), vec2(0, 400)];
      expect(perimeter(tri)).toBe(300 + 500 + 400); // 1200
    });
  });

  describe('Centroïde géométrique', () => {
    it('calcule le centre d un rectangle symétrique', () => {
      const rect = [vec2(100, 100), vec2(500, 100), vec2(500, 300), vec2(100, 300)];
      const c = centroid(rect);
      expect(equals(c, vec2(300, 200))).toBe(true);
    });

    it('calcule le centroïde d un triangle (somme des coordonnées / 3)', () => {
      const tri = [vec2(0, 0), vec2(90, 0), vec2(0, 90)];
      const c = centroid(tri);
      expect(c.x).toBeCloseTo(30, 6);
      expect(c.y).toBeCloseTo(30, 6);
    });
  });
});
