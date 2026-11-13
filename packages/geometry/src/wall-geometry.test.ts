import { describe, it, expect } from 'vitest';
import { computeWallFootprint2d } from './wall-geometry.js';
import { vec2, distance, add } from './vec2.js';
import { signedArea, isCCW } from './polygon.js';

describe('Géométrie des Murs Isolés (WallFootprint2D)', () => {
  describe('Murs horizontaux, verticaux et obliques', () => {
    it('calcule correctement un mur horizontal orienté Est (+X) avec justification center', () => {
      const footprint = computeWallFootprint2d({
        start: vec2(0, 0),
        end: vec2(4000, 0),
        thickness: 200,
        locationLine: 'center',
      });

      expect(footprint.length).toBe(4000);
      expect(footprint.thickness).toBe(200);

      // Normale gauche vers le Nord (+Y) : n = (0, 1)
      expect(footprint.normal.x).toBe(0);
      expect(footprint.normal.y).toBe(1);

      // Intérieur à -100 (y = -100), Extérieur à +100 (y = +100)
      const [v0, v1, v2, v3] = footprint.vertices;
      expect(v0).toEqual(vec2(0, -100));
      expect(v1).toEqual(vec2(4000, -100));
      expect(v2).toEqual(vec2(4000, 100));
      expect(v3).toEqual(vec2(0, 100));

      expect(distance(v0, v3)).toBe(200); // Largeur au départ
      expect(distance(v1, v2)).toBe(200); // Largeur à l'arrivée
      expect(distance(v0, v1)).toBe(4000); // Longueur face intérieure
      expect(distance(v3, v2)).toBe(4000); // Longueur face extérieure
    });

    it('calcule correctement un mur vertical orienté Nord (+Y) avec justification center', () => {
      const footprint = computeWallFootprint2d({
        start: vec2(1000, 2000),
        end: vec2(1000, 5000),
        thickness: 300,
        locationLine: 'center',
      });

      expect(footprint.length).toBe(3000);
      expect(footprint.thickness).toBe(300);

      // Normale gauche vers l'Ouest (-X) : n = (-1, 0)
      expect(footprint.normal.x).toBe(-1);
      expect(footprint.normal.y).toBe(0);

      const [v0, v1, v2, v3] = footprint.vertices;
      // Intérieur (-n, donc vers +X) : x = 1000 + 150 = 1150
      expect(v0).toEqual(vec2(1150, 2000));
      expect(v1).toEqual(vec2(1150, 5000));
      // Extérieur (+n, donc vers -X) : x = 1000 - 150 = 850
      expect(v2).toEqual(vec2(850, 5000));
      expect(v3).toEqual(vec2(850, 2000));
    });

    it('calcule correctement un mur oblique à 45°', () => {
      const L = 2000 * Math.SQRT2; // ~2828.427 mm
      const footprint = computeWallFootprint2d({
        start: vec2(0, 0),
        end: vec2(2000, 2000),
        thickness: 200,
        locationLine: 'center',
      });

      expect(footprint.length).toBeCloseTo(L, 6);
      expect(footprint.thickness).toBe(200);

      // Direction unitaire : (1/√2, 1/√2)
      expect(footprint.direction.x).toBeCloseTo(Math.SQRT1_2, 6);
      expect(footprint.direction.y).toBeCloseTo(Math.SQRT1_2, 6);

      // Normale gauche : (-1/√2, 1/√2)
      expect(footprint.normal.x).toBeCloseTo(-Math.SQRT1_2, 6);
      expect(footprint.normal.y).toBeCloseTo(Math.SQRT1_2, 6);

      // Vérification que les faces sont parallèles et séparées de 200 mm
      expect(distance(footprint.vertices[0], footprint.vertices[3])).toBeCloseTo(200, 6);
      expect(distance(footprint.vertices[1], footprint.vertices[2])).toBeCloseTo(200, 6);
    });
  });

  describe('Lignes de référence (locationLine)', () => {
    const start = vec2(0, 0);
    const end = vec2(3000, 0);
    const thickness = 200;

    it('locationLine = exterior : l axe est la face extérieure (+n)', () => {
      const footprint = computeWallFootprint2d({
        start,
        end,
        thickness,
        locationLine: 'exterior',
      });

      // Face extérieure sur y = 0
      expect(footprint.exteriorFace.start.y).toBe(0);
      expect(footprint.exteriorFace.end.y).toBe(0);

      // Face intérieure sur y = -200
      expect(footprint.interiorFace.start.y).toBe(-200);
      expect(footprint.interiorFace.end.y).toBe(-200);

      // Axe central sur y = -100
      expect(footprint.centerAxis.start.y).toBe(-100);
      expect(footprint.centerAxis.end.y).toBe(-100);
    });

    it('locationLine = interior : l axe est la face intérieure (-n)', () => {
      const footprint = computeWallFootprint2d({
        start,
        end,
        thickness,
        locationLine: 'interior',
      });

      // Face intérieure sur y = 0
      expect(footprint.interiorFace.start.y).toBe(0);
      expect(footprint.interiorFace.end.y).toBe(0);

      // Face extérieure sur y = +200
      expect(footprint.exteriorFace.start.y).toBe(200);
      expect(footprint.exteriorFace.end.y).toBe(200);

      // Axe central sur y = +100
      expect(footprint.centerAxis.start.y).toBe(100);
      expect(footprint.centerAxis.end.y).toBe(100);
    });
  });

  describe('Propriétés mathématiques et invariants géométriques', () => {
    it('propriété : l orientation de l emprise est strictement CCW', () => {
      const locations = ['center', 'exterior', 'interior'] as const;
      const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];

      for (const loc of locations) {
        for (const angle of angles) {
          const start = vec2(100, 100);
          const end = add(start, vec2(1500 * Math.cos(angle), 1500 * Math.sin(angle)));
          const footprint = computeWallFootprint2d({
            start,
            end,
            thickness: 250,
            locationLine: loc,
          });

          expect(isCCW(footprint.vertices)).toBe(true);
        }
      }
    });

    it('propriété : l aire du polygone est exactement égale à Longueur × Épaisseur', () => {
      const footprint = computeWallFootprint2d({
        start: vec2(500, 1200),
        end: vec2(4500, 1200), // L = 4000 mm
        thickness: 300,
        locationLine: 'center',
      });

      const expectedArea = 4000 * 300; // 1 200 000 mm²
      expect(signedArea(footprint.vertices)).toBeCloseTo(expectedArea, 6);
    });

    it('propriété : invariance sous translation globale', () => {
      const input = {
        start: vec2(100, 200),
        end: vec2(3100, 200),
        thickness: 200,
        locationLine: 'center' as const,
      };
      const f1 = computeWallFootprint2d(input);

      const offset = vec2(5000, -8000);
      const f2 = computeWallFootprint2d({
        start: add(input.start, offset),
        end: add(input.end, offset),
        thickness: input.thickness,
        locationLine: input.locationLine,
      });

      expect(f2.length).toBe(f1.length);
      expect(f2.thickness).toBe(f1.thickness);
      expect(signedArea(f2.vertices)).toBeCloseTo(signedArea(f1.vertices), 6);
    });
  });

  describe('Validation des cas d erreur', () => {
    it('rejette une épaisseur négative ou nulle', () => {
      expect(() =>
        computeWallFootprint2d({
          start: vec2(0, 0),
          end: vec2(1000, 0),
          thickness: 0,
          locationLine: 'center',
        }),
      ).toThrow(RangeError);

      expect(() =>
        computeWallFootprint2d({
          start: vec2(0, 0),
          end: vec2(1000, 0),
          thickness: -150,
          locationLine: 'center',
        }),
      ).toThrow(RangeError);
    });

    it('rejette un mur de longueur nulle (start = end)', () => {
      expect(() =>
        computeWallFootprint2d({
          start: vec2(500, 500),
          end: vec2(500, 500),
          thickness: 200,
          locationLine: 'center',
        }),
      ).toThrow(RangeError);
    });
  });
});
