import { describe, it, expect } from 'vitest';
import { cleanPolygonVertices, isConvexPolygon, triangulatePolygon } from './triangulate.js';
import { vec2, type Vec2 } from '../vec2.js';
import { signedArea } from '../polygon.js';

describe('Triangulation 2D de Polygones (triangulate.ts)', () => {
  // Helper pour calculer la somme des aires 2D des triangles à partir d'indices
  const computeTrianglesArea = (vertices: readonly Vec2[], indices: Uint32Array): number => {
    let totalArea = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];
      if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
        const v0 = vertices[i0];
        const v1 = vertices[i1];
        const v2 = vertices[i2];
        if (v0 && v1 && v2) {
          totalArea += Math.abs(signedArea([v0, v1, v2]));
        }
      }
    }
    return totalArea;
  };

  describe('1. Détection de Convexité (isConvexPolygon)', () => {
    it('détecte correctement un carré comme convexe', () => {
      const square = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];
      expect(isConvexPolygon(square)).toBe(true);
    });

    it('détecte un polygone en L comme non-convexe (concave)', () => {
      // Forme en L : (0,0) -> (200,0) -> (200,100) -> (100,100) -> (100,200) -> (0,200)
      const lShape = [
        vec2(0, 0),
        vec2(200, 0),
        vec2(200, 100),
        vec2(100, 100),
        vec2(100, 200),
        vec2(0, 200),
      ];
      expect(isConvexPolygon(lShape)).toBe(false);
    });

    it('identifie tout triangle comme convexe', () => {
      const tri = [vec2(0, 0), vec2(100, 50), vec2(20, 150)];
      expect(isConvexPolygon(tri)).toBe(true);
    });
  });

  describe('2. Nettoyage de sommets (cleanPolygonVertices)', () => {
    it('supprime un sommet consécutif dupliqué', () => {
      const raw = [
        vec2(0, 0),
        vec2(100, 0),
        vec2(100, 0), // dupliqué
        vec2(100, 100),
        vec2(0, 100),
      ];
      const cleaned = cleanPolygonVertices(raw);
      expect(cleaned.length).toBe(4);
      expect(cleaned[1]).toEqual(vec2(100, 0));
      expect(cleaned[2]).toEqual(vec2(100, 100));
    });

    it('supprime la fermeture redondante (dernier == premier)', () => {
      const raw = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100), vec2(0, 0)];
      const cleaned = cleanPolygonVertices(raw);
      expect(cleaned.length).toBe(4);
    });

    it('supprime les sommets intermédiaires colinéaires inutiles', () => {
      const raw = [
        vec2(0, 0),
        vec2(50, 0), // colinéaire entre (0,0) et (100,0)
        vec2(100, 0),
        vec2(100, 100),
        vec2(0, 100),
      ];
      const cleaned = cleanPolygonVertices(raw);
      expect(cleaned.length).toBe(4);
    });
  });

  describe('3. Triangulation Convexe Fan vs Ear Clipping', () => {
    it('carré (4 sommets) -> 2 triangles via fan', () => {
      const square = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];
      const { cleanedVertices, indices } = triangulatePolygon(square);

      expect(cleanedVertices.length).toBe(4);
      expect(indices.length).toBe(6); // 2 triangles * 3 indices
      const expectedArea = 100 * 100;
      expect(computeTrianglesArea(cleanedVertices, indices)).toBeCloseTo(expectedArea, 6);
    });

    it('triangle (3 sommets) -> 1 triangle', () => {
      const tri = [vec2(0, 0), vec2(200, 0), vec2(100, 150)];
      const { cleanedVertices, indices } = triangulatePolygon(tri);

      expect(cleanedVertices.length).toBe(3);
      expect(indices.length).toBe(3);
      const expectedArea = (200 * 150) / 2;
      expect(computeTrianglesArea(cleanedVertices, indices)).toBeCloseTo(expectedArea, 6);
    });

    it('pentagone régulier / convexe (5 sommets) -> 3 triangles', () => {
      const pentagon = [vec2(0, 0), vec2(200, 0), vec2(250, 150), vec2(100, 220), vec2(-20, 100)];
      const { cleanedVertices, indices } = triangulatePolygon(pentagon);

      expect(cleanedVertices.length).toBe(5);
      expect(indices.length).toBe(9); // 3 triangles * 3
      const polyArea = Math.abs(signedArea(cleanedVertices));
      expect(computeTrianglesArea(cleanedVertices, indices)).toBeCloseTo(polyArea, 6);
    });

    it('polygone non convexe (forme en L) -> triangulation ear clipping valide', () => {
      const lShape = [
        vec2(0, 0),
        vec2(300, 0),
        vec2(300, 100),
        vec2(100, 100),
        vec2(100, 300),
        vec2(0, 300),
      ];
      const { cleanedVertices, indices } = triangulatePolygon(lShape);

      expect(cleanedVertices.length).toBe(6);
      expect(indices.length).toBe(12); // 4 triangles * 3

      // Aire du L = (300*100) + (100*200) = 30000 + 20000 = 50000 mm²
      const polyArea = Math.abs(signedArea(cleanedVertices));
      expect(polyArea).toBe(50000);
      expect(computeTrianglesArea(cleanedVertices, indices)).toBeCloseTo(polyArea, 6);
    });
  });

  describe('4. Propriété : Exactitude de conservation d aire sur 10 polygones variés', () => {
    it('propriété : somme des aires des triangles == aire du polygone à ±1e-6 sur 10 polygones', () => {
      const testPolygons: Vec2[][] = [
        // Rectangle standard
        [vec2(0, 0), vec2(500, 0), vec2(500, 200), vec2(0, 200)],
        // Triangle rectangle
        [vec2(0, 0), vec2(400, 0), vec2(0, 300)],
        // Trapèze
        [vec2(50, 0), vec2(450, 0), vec2(350, 200), vec2(150, 200)],
        // Onglet 45°
        [vec2(100, -100), vec2(3000, -100), vec2(3000, 100), vec2(-100, 100)],
        // Pentagone miter tronqué
        [vec2(50, 100), vec2(50, -50), vec2(100, -100), vec2(1050, -100), vec2(1050, 100)],
        // Hexagone convexe
        [vec2(100, 0), vec2(300, 0), vec2(400, 150), vec2(300, 300), vec2(100, 300), vec2(0, 150)],
        // Forme en U (concave)
        [
          vec2(0, 0),
          vec2(300, 0),
          vec2(300, 300),
          vec2(200, 300),
          vec2(200, 100),
          vec2(100, 100),
          vec2(100, 300),
          vec2(0, 300),
        ],
        // Forme en croix
        [
          vec2(100, 0),
          vec2(200, 0),
          vec2(200, 100),
          vec2(300, 100),
          vec2(300, 200),
          vec2(200, 200),
          vec2(200, 300),
          vec2(100, 300),
          vec2(100, 200),
          vec2(0, 200),
          vec2(0, 100),
          vec2(100, 100),
        ],
        // Polygone avec grande échelle (1 km)
        [
          vec2(1000000, 1000000),
          vec2(1004000, 1000000),
          vec2(1004000, 1000200),
          vec2(1000000, 1000200),
        ],
        // Triangle très effilé (aigu)
        [vec2(0, 0), vec2(2000, 1), vec2(1000, 50)],
      ];

      for (let i = 0; i < testPolygons.length; i++) {
        const poly = testPolygons[i];
        if (!poly) continue;

        const { cleanedVertices, indices } = triangulatePolygon(poly);
        const polyArea = Math.abs(signedArea(cleanedVertices));
        const triArea = computeTrianglesArea(cleanedVertices, indices);

        const diff = Math.abs(triArea - polyArea);
        expect(diff).toBeLessThan(1e-6);
      }
    });
  });
});
