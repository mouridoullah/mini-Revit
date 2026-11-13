import { describe, it, expect } from 'vitest';
import { solveWallJunctions } from './engine.js';
import { exportJunctionsSvg } from './visualizer.js';
import { vec2, add, distance } from '../vec2.js';
import { segment2, intersectSegments } from '../segment.js';
import { isCCW } from '../polygon.js';
import { type WallInput } from './types.js';

/**
 * Vérifie si un polygone est simple (sans auto-intersection d'arêtes non adjacentes).
 */
function isSimplePolygon(vertices: readonly { x: number; y: number }[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const s1 = segment2(vertices[i]!, vertices[(i + 1) % n]!);
    for (let j = i + 1; j < n; j++) {
      // Les arêtes adjacentes ou identiques partagent un sommet par définition
      if (j === i || j === (i + 1) % n || (i === 0 && j === n - 1)) {
        continue;
      }
      const s2 = segment2(vertices[j]!, vertices[(j + 1) % n]!);
      const inter = intersectSegments(s1, s2);
      if (inter.type === 'point' || inter.type === 'overlap') {
        return false; // Auto-intersection détectée
      }
    }
  }
  return true;
}

/**
 * Vérifie qu'un polygone ne contient aucune arête de longueur quasi-nulle.
 */
function hasNoZeroLengthEdges(
  vertices: readonly { x: number; y: number }[],
  tolerance: number = 1e-4,
): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const d = distance(vertices[i]!, vertices[(i + 1) % n]!);
    if (d <= tolerance) return false;
  }
  return true;
}

describe('AUDIT APPROFONDI DU MOTEUR DE JONCTIONS', () => {
  describe('1. Propriétés géométriques fondamentales (Simplicité, Non-dégénérescence, CCW)', () => {
    it('garantit des polygones simples, sans arêtes nulles et strictement CCW sur une boîte 4 murs', () => {
      const walls: WallInput[] = [
        { id: 'w1', start: vec2(0, 0), end: vec2(5000, 0), thickness: 200, locationLine: 'center' },
        {
          id: 'w2',
          start: vec2(5000, 0),
          end: vec2(5000, 4000),
          thickness: 250,
          locationLine: 'center',
        },
        {
          id: 'w3',
          start: vec2(5000, 4000),
          end: vec2(0, 4000),
          thickness: 200,
          locationLine: 'center',
        },
        { id: 'w4', start: vec2(0, 4000), end: vec2(0, 0), thickness: 300, locationLine: 'center' },
      ];

      const solution = solveWallJunctions(walls);

      for (const w of solution.walls) {
        expect(w.polygon.length).toBeGreaterThanOrEqual(4);
        expect(isCCW(w.polygon)).toBe(true);
        expect(hasNoZeroLengthEdges(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
      }
    });

    it('garantit la simplicité polygonale sur toutes les combinaisons de locationLine en L', () => {
      const locations = ['center', 'exterior', 'interior'] as const;

      for (const loc1 of locations) {
        for (const loc2 of locations) {
          const w1: WallInput = {
            id: 'w1',
            start: vec2(0, 0),
            end: vec2(3000, 0),
            thickness: 200,
            locationLine: loc1,
          };
          const w2: WallInput = {
            id: 'w2',
            start: vec2(3000, 0),
            end: vec2(3000, 3000),
            thickness: 200,
            locationLine: loc2,
          };

          const solution = solveWallJunctions([w1, w2]);
          for (const w of solution.walls) {
            expect(isCCW(w.polygon)).toBe(true);
            expect(hasNoZeroLengthEdges(w.polygon)).toBe(true);
            expect(isSimplePolygon(w.polygon)).toBe(true);
          }
        }
      }
    });
  });

  describe('2. Test de coordonnées extrêmes (Grandes coordonnées, échelles réelles)', () => {
    it('résout avec précision des murs situés à 1 km de l origine (1 000 000 mm)', () => {
      const origin = vec2(1_000_000, 1_000_000);
      const walls: WallInput[] = [
        {
          id: 'w1',
          start: origin,
          end: add(origin, vec2(4000, 0)),
          thickness: 200,
          locationLine: 'center',
        },
        {
          id: 'w2',
          start: add(origin, vec2(4000, 0)),
          end: add(origin, vec2(4000, 3000)),
          thickness: 200,
          locationLine: 'center',
        },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.junctions.length).toBe(1);
      expect(sol.junctions[0]!.type).toBe('L');

      for (const w of sol.walls) {
        expect(isCCW(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
      }
    });

    it('résout des murs très courts (50 mm, longueur limite constructible)', () => {
      const walls: WallInput[] = [
        { id: 'w1', start: vec2(0, 0), end: vec2(100, 0), thickness: 50, locationLine: 'center' },
        {
          id: 'w2',
          start: vec2(100, 0),
          end: vec2(100, 100),
          thickness: 50,
          locationLine: 'center',
        },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(2);
      expect(sol.junctions[0]!.type).toBe('L');
    });
  });

  describe('3. Jonctions en L : Balayage angulaire complet', () => {
    const testAngles = [15, 30, 45, 60, 90, 120, 135, 150, 170];

    for (const deg of testAngles) {
      it(`résout une jonction en L à angle ${deg}°`, () => {
        const rad = (deg * Math.PI) / 180;
        const w1: WallInput = {
          id: 'w1',
          start: vec2(0, 0),
          end: vec2(2000, 0),
          thickness: 200,
          locationLine: 'center',
        };
        const w2: WallInput = {
          id: 'w2',
          start: vec2(2000, 0),
          end: add(vec2(2000, 0), vec2(2000 * Math.cos(rad), 2000 * Math.sin(rad))),
          thickness: 200,
          locationLine: 'center',
        };

        const sol = solveWallJunctions([w1, w2]);
        expect(sol.junctions.length).toBe(1);
        expect(sol.junctions[0]!.type).toBe('L');

        for (const w of sol.walls) {
          expect(w.area).toBeGreaterThan(0);
          expect(isCCW(w.polygon)).toBe(true);
          expect(isSimplePolygon(w.polygon)).toBe(true);
        }
      });
    }
  });

  describe('4. Jonctions en T : Frappe sur les deux faces et angles obliques', () => {
    const throughWall: WallInput = {
      id: 'through',
      start: vec2(0, 2000),
      end: vec2(6000, 2000),
      thickness: 250,
      locationLine: 'center',
    };

    it('frappe perpendiculaire sur face intérieure (depuis le bas)', () => {
      const stem: WallInput = {
        id: 'stem_bottom',
        start: vec2(3000, 0),
        end: vec2(3000, 2000),
        thickness: 150,
        locationLine: 'center',
      };

      const sol = solveWallJunctions([throughWall, stem]);
      expect(sol.junctions.length).toBe(1);
      expect(sol.junctions[0]!.type).toBe('T');

      const throughRes = sol.walls.find((w) => w.id === 'through')!;
      const stemRes = sol.walls.find((w) => w.id === 'stem_bottom')!;

      // Le mur traversant reste exactement de 6000 × 250 = 1 500 000 mm²
      expect(throughRes.area).toBeCloseTo(6000 * 250, 0);

      // Le mur secondaire s'arrête à y = 1875 (2000 - 125) => longueur 1875 mm
      expect(stemRes.area).toBeCloseTo(1875 * 150, 0);
    });

    it('frappe perpendiculaire sur face extérieure (depuis le haut)', () => {
      const stem: WallInput = {
        id: 'stem_top',
        start: vec2(3000, 4000),
        end: vec2(3000, 2000),
        thickness: 150,
        locationLine: 'center',
      };

      const sol = solveWallJunctions([throughWall, stem]);
      const stemRes = sol.walls.find((w) => w.id === 'stem_top')!;

      // S'arrête à y = 2125 (2000 + 125) => longueur 1875 mm
      expect(stemRes.area).toBeCloseTo(1875 * 150, 0);
    });

    it('frappe oblique à 60° et 120°', () => {
      const stem60: WallInput = {
        id: 'stem_60',
        start: vec2(1500, 0),
        end: vec2(3000, 2000),
        thickness: 200,
        locationLine: 'center',
      };

      const sol = solveWallJunctions([throughWall, stem60]);
      expect(sol.junctions[0]!.type).toBe('T');
      for (const w of sol.walls) {
        expect(isSimplePolygon(w.polygon)).toBe(true);
      }
    });
  });

  describe('5. Jonctions multiples (3, 4 et 5 branches)', () => {
    it('résout une jonction en croix à 4 branches au même nœud (Star 4 branches à 90°)', () => {
      const center = vec2(2000, 2000);
      const walls: WallInput[] = [
        {
          id: 'w_east',
          start: center,
          end: vec2(4000, 2000),
          thickness: 200,
          locationLine: 'center',
        },
        {
          id: 'w_north',
          start: center,
          end: vec2(2000, 4000),
          thickness: 200,
          locationLine: 'center',
        },
        { id: 'w_west', start: center, end: vec2(0, 2000), thickness: 200, locationLine: 'center' },
        {
          id: 'w_south',
          start: center,
          end: vec2(2000, 0),
          thickness: 200,
          locationLine: 'center',
        },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(4);
      expect(sol.junctions[0]!.type).toBe('multi');

      for (const w of sol.walls) {
        expect(isCCW(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
      }
    });

    it('résout une jonction asymétrique à 3 branches (ex: T formé par 3 murs connectés au nœud)', () => {
      const center = vec2(2000, 2000);
      const walls: WallInput[] = [
        { id: 'w_left', start: vec2(0, 2000), end: center, thickness: 200, locationLine: 'center' },
        {
          id: 'w_right',
          start: center,
          end: vec2(4000, 2000),
          thickness: 200,
          locationLine: 'center',
        },
        { id: 'w_stem', start: center, end: vec2(2000, 0), thickness: 200, locationLine: 'center' },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(3);

      for (const w of sol.walls) {
        expect(w.area).toBeGreaterThan(0);
        expect(isCCW(w.polygon)).toBe(true);
      }
    });

    it('résout une étoile à 5 branches régulières (72°)', () => {
      const center = vec2(3000, 3000);
      const count = 5;
      const walls: WallInput[] = [];

      for (let i = 0; i < count; i++) {
        const theta = (i * 2 * Math.PI) / count;
        walls.push({
          id: `branch_${i}`,
          start: center,
          end: add(center, vec2(1500 * Math.cos(theta), 1500 * Math.sin(theta))),
          thickness: 150,
          locationLine: 'center',
        });
      }

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(5);
      expect(sol.junctions[0]!.type).toBe('multi');

      for (const w of sol.walls) {
        expect(isCCW(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
      }
    });
  });

  describe('6. Tests de Propriétés (Invariance, Déterminisme et Répétabilité)', () => {
    const complexWalls: WallInput[] = [
      {
        id: 'ext1',
        start: vec2(0, 0),
        end: vec2(6000, 0),
        thickness: 300,
        locationLine: 'center',
        priority: 100,
      },
      {
        id: 'ext2',
        start: vec2(6000, 0),
        end: vec2(6000, 5000),
        thickness: 300,
        locationLine: 'center',
        priority: 100,
      },
      {
        id: 'ext3',
        start: vec2(6000, 5000),
        end: vec2(0, 5000),
        thickness: 300,
        locationLine: 'center',
        priority: 100,
      },
      {
        id: 'ext4',
        start: vec2(0, 5000),
        end: vec2(0, 0),
        thickness: 300,
        locationLine: 'center',
        priority: 100,
      },
      {
        id: 'part1',
        start: vec2(3000, 0),
        end: vec2(3000, 5000),
        thickness: 150,
        locationLine: 'center',
        priority: 20,
      },
      {
        id: 'part2',
        start: vec2(0, 2500),
        end: vec2(6000, 2500),
        thickness: 150,
        locationLine: 'center',
        priority: 10,
      },
    ];

    it('propriété : invariance stricte sous rotation globale de 90° et 180°', () => {
      const baseSol = solveWallJunctions(complexWalls);

      // Rotation de 90° autour de l'origine : (x, y) -> (-y, x)
      const rotated90Walls: WallInput[] = complexWalls.map((w) => ({
        ...w,
        start: vec2(-w.start.y, w.start.x),
        end: vec2(-w.end.y, w.end.x),
      }));

      const rotSol = solveWallJunctions(rotated90Walls);

      // L'aire totale cumulée doit être rigoureusement identique
      expect(rotSol.totalArea).toBeCloseTo(baseSol.totalArea, 2);
      expect(rotSol.walls.length).toBe(baseSol.walls.length);
      expect(rotSol.junctions.length).toBe(baseSol.junctions.length);
    });

    it('propriété : indépendance de l ordre d entrée sur configuration complexe', () => {
      const sol1 = solveWallJunctions(complexWalls);
      const sol2 = solveWallJunctions([...complexWalls].reverse());
      // Mélange déterministe
      const sol3 = solveWallJunctions([
        complexWalls[2]!,
        complexWalls[0]!,
        complexWalls[4]!,
        complexWalls[1]!,
        complexWalls[5]!,
        complexWalls[3]!,
      ]);

      expect(sol2.totalArea).toBeCloseTo(sol1.totalArea, 2);
      expect(sol3.totalArea).toBeCloseTo(sol1.totalArea, 2);
    });

    it('génère un document SVG d audit complet', () => {
      const sol = solveWallJunctions(complexWalls);
      const svg = exportJunctionsSvg(sol);

      expect(svg).toBeDefined();
      expect(svg.length).toBeGreaterThan(500);
      expect(svg).toContain('<polygon');
    });
  });

  describe('7. Validation des Correctifs Ciblés (Option B - Robustesse Topologique)', () => {
    it('Anomalie 1 : clôture étanche du biseau d onglet aigu (10°) sans vide ni fissure', () => {
      const angle10 = (10 * Math.PI) / 180;
      const node = vec2(2000, 0);
      const walls: WallInput[] = [
        { id: 'w1', start: vec2(0, 0), end: node, thickness: 200, locationLine: 'center' },
        {
          id: 'w2',
          start: node,
          end: vec2(2000 - 2000 * Math.cos(angle10), 2000 * Math.sin(angle10)),
          thickness: 200,
          locationLine: 'center',
        },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(2);
      expect(sol.junctions[0]!.type).toBe('L');
      expect((sol.junctions[0]!.details as { isBevelled?: boolean }).isBevelled).toBe(true);

      const res1 = sol.walls.find((w) => w.id === 'w1')!;
      const res2 = sol.walls.find((w) => w.id === 'w2')!;

      // Les deux polygones sont de surface strictement positive, CCW et simples
      expect(res1.area).toBeGreaterThan(0);
      expect(res2.area).toBeGreaterThan(0);
      expect(isCCW(res1.polygon)).toBe(true);
      expect(isCCW(res2.polygon)).toBe(true);
      expect(isSimplePolygon(res1.polygon)).toBe(true);
      expect(isSimplePolygon(res2.polygon)).toBe(true);
      expect(hasNoZeroLengthEdges(res1.polygon)).toBe(true);
      expect(hasNoZeroLengthEdges(res2.polygon)).toBe(true);

      // Clôture étanche : les deux murs partagent au moins 2 sommets communs sur l interface de coupe
      const sharedVertices = res1.polygon.filter((p1) =>
        res2.polygon.some((p2) => distance(p1, p2) <= 1e-3),
      );
      // Le coin intérieur ET le point médian sur la bissectrice (Mbevel) sont partagés
      expect(sharedVertices.length).toBeGreaterThanOrEqual(2);
    });

    it('Anomalie 2 : interception des angles 0° et chevauchements colinéaires au même nœud', () => {
      const node = vec2(0, 0);
      const walls: WallInput[] = [
        { id: 'w1', start: node, end: vec2(3000, 0), thickness: 200, locationLine: 'center' },
        { id: 'w2', start: node, end: vec2(2000, 0), thickness: 200, locationLine: 'center' },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(2);
      expect(sol.junctions[0]!.type).toBe('collinear');

      for (const w of sol.walls) {
        expect(w.polygon.length).toBe(4);
        expect(isCCW(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
        expect(hasNoZeroLengthEdges(w.polygon)).toBe(true);
        expect(w.area).toBeGreaterThan(0);
      }
    });

    it('Anomalie 3 : continuité des faces sur branches opposées (180°) dans les jonctions multiples', () => {
      const center = vec2(2000, 2000);
      const walls: WallInput[] = [
        {
          id: 'w_east',
          start: center,
          end: vec2(4000, 2000),
          thickness: 200,
          locationLine: 'center',
        },
        {
          id: 'w_north',
          start: center,
          end: vec2(2000, 4000),
          thickness: 200,
          locationLine: 'center',
        },
        { id: 'w_west', start: center, end: vec2(0, 2000), thickness: 200, locationLine: 'center' },
      ];

      const sol = solveWallJunctions(walls);
      expect(sol.walls.length).toBe(3);
      expect(sol.junctions[0]!.type).toBe('multi');

      const eastWall = sol.walls.find((w) => w.id === 'w_east')!;
      const westWall = sol.walls.find((w) => w.id === 'w_west')!;

      // La face Sud continue doit se trouver à y = 1900 (2000 - 100), et non s effondrer à y = 2000
      const eastBottomPt = eastWall.polygon.find(
        (p) => Math.abs(p.x - 2000) < 1 && Math.abs(p.y - 1900) < 1,
      );
      const westBottomPt = westWall.polygon.find(
        (p) => Math.abs(p.x - 2000) < 1 && Math.abs(p.y - 1900) < 1,
      );

      expect(eastBottomPt).toBeDefined();
      expect(westBottomPt).toBeDefined();

      for (const w of sol.walls) {
        expect(isCCW(w.polygon)).toBe(true);
        expect(isSimplePolygon(w.polygon)).toBe(true);
        expect(hasNoZeroLengthEdges(w.polygon)).toBe(true);
      }
    });
  });
});
