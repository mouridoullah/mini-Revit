import { describe, it, expect } from 'vitest';
import {
  signedArea,
  isCCW,
  perimeter,
  centroid,
  clipPolygonWithHalfPlane,
  isPointInPolygon,
  computePolylabel,
  unionPolygonFootprints,
} from './polygon.js';
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

  describe('Écrêtage de polygone par demi-plan (Sutherland-Hodgman)', () => {
    const square = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];

    it('découpe un carré par un demi-plan vertical x >= 40', () => {
      const clipped = clipPolygonWithHalfPlane(square, vec2(40, 0), vec2(1, 0));
      expect(clipped.length).toBe(4);
      expect(signedArea(clipped)).toBeCloseTo(6000, 4); // 60 * 100
      expect(isCCW(clipped)).toBe(true);
    });

    it('isole une bande entre x = 30 et x = 70', () => {
      const step1 = clipPolygonWithHalfPlane(square, vec2(30, 0), vec2(1, 0));
      const step2 = clipPolygonWithHalfPlane(step1, vec2(70, 0), vec2(-1, 0));
      expect(step2.length).toBe(4);
      expect(signedArea(step2)).toBeCloseTo(4000, 4); // 40 * 100
      expect(isCCW(step2)).toBe(true);
    });

    it('renvoie un polygone vide si le demi-plan est entièrement disjoint', () => {
      const clipped = clipPolygonWithHalfPlane(square, vec2(200, 0), vec2(1, 0));
      expect(clipped.length).toBe(0);
    });

    it('renvoie le polygone identique si le demi-plan le contient entièrement', () => {
      const clipped = clipPolygonWithHalfPlane(square, vec2(-10, 0), vec2(1, 0));
      expect(clipped.length).toBe(4);
      expect(signedArea(clipped)).toBeCloseTo(10000, 4);
    });
  });

  describe('Point in Polygon (Ray-Casting)', () => {
    const poly = [vec2(100, 100), vec2(3900, 100), vec2(3900, 2900), vec2(100, 2900)];

    it('détecte un point strictement intérieur', () => {
      expect(isPointInPolygon(vec2(2000, 1500), poly)).toBe(true);
      expect(isPointInPolygon(vec2(200, 200), poly)).toBe(true);
      expect(isPointInPolygon(vec2(3800, 2800), poly)).toBe(true);
    });

    it('détecte un point extérieur', () => {
      expect(isPointInPolygon(vec2(0, 0), poly)).toBe(false);
      expect(isPointInPolygon(vec2(4000, 1500), poly)).toBe(false);
      expect(isPointInPolygon(vec2(2000, 3500), poly)).toBe(false);
    });

    it('renvoie false pour un polygone dégénéré', () => {
      expect(isPointInPolygon(vec2(10, 10), [])).toBe(false);
      expect(isPointInPolygon(vec2(10, 10), [vec2(0, 0), vec2(100, 100)])).toBe(false);
    });
  });

  describe('Pôle d inaccessibilité (computePolylabel)', () => {
    it('calcule le pôle d un rectangle centré', () => {
      const rect = [vec2(100, 100), vec2(3900, 100), vec2(3900, 2900), vec2(100, 2900)];
      const seed = computePolylabel(rect, undefined, 1.0);
      expect(seed.x).toBeCloseTo(2000, 0);
      expect(seed.y).toBeCloseTo(1500, 0);
    });

    it('évite un trou intérieur central', () => {
      const outer = [vec2(0, 0), vec2(1000, 0), vec2(1000, 1000), vec2(0, 1000)];
      const hole = [vec2(400, 400), vec2(600, 400), vec2(600, 600), vec2(400, 600)];
      const seed = computePolylabel(outer, [hole], 1.0);
      // Le seed ne doit pas être dans le trou [400, 600]x[400, 600]
      expect(isPointInPolygon(seed, hole)).toBe(false);
      expect(isPointInPolygon(seed, outer)).toBe(true);
    });
  });

  describe('Union Booléenne de Footprints (unionPolygonFootprints)', () => {
    it('détecte le trou intérieur exact pour 4 murs formant une pièce 3.8m × 2.8m', () => {
      // 4 murs d'axe 4000x3000, épaisseur 200 mm
      const south = [vec2(0, -100), vec2(4000, -100), vec2(4000, 100), vec2(0, 100)];
      const east = [vec2(3900, 0), vec2(4100, 0), vec2(4100, 3000), vec2(3900, 3000)];
      const north = [vec2(4000, 3100), vec2(0, 3100), vec2(0, 2900), vec2(4000, 2900)];
      const west = [vec2(-100, 3000), vec2(-100, 0), vec2(100, 0), vec2(100, 3000)];

      const result = unionPolygonFootprints([south, east, north, west]);
      expect(result.length).toBe(1);
      const poly = result[0];
      expect(poly?.holes.length).toBe(1);

      const hole = poly?.holes[0];
      expect(hole).toBeDefined();
      if (!hole) return;

      // Surface intérieure : 3800 * 2800 = 10 640 000 mm² = 10.64 m²
      const area = Math.abs(signedArea(hole));
      expect(area).toBe(10640000);
      expect(isCCW(hole)).toBe(true);

      // Périmètre intérieur : 2 * (3800 + 2800) = 13200 mm
      expect(perimeter(hole)).toBe(13200);
    });

    it('renvoie 0 trou pour 3 murs en U (pièce non fermée)', () => {
      const south = [vec2(0, -100), vec2(4000, -100), vec2(4000, 100), vec2(0, 100)];
      const east = [vec2(3900, 0), vec2(4100, 0), vec2(4100, 3000), vec2(3900, 3000)];
      const west = [vec2(-100, 3000), vec2(-100, 0), vec2(100, 0), vec2(100, 3000)];

      const result = unionPolygonFootprints([south, east, west]);
      expect(result.length).toBe(1);
      expect(result[0]?.holes.length).toBe(0);
    });
  });
});
