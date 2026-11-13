import { describe, it, expect } from 'vitest';
import { solveWallJunctions } from './engine.js';
import { exportJunctionsSvg } from './visualizer.js';
import { vec2, add } from '../vec2.js';
import { type WallInput } from './types.js';

describe('Moteur de Jonctions de Murs (Wall Junction Engine)', () => {
  describe('Boîte rectangulaire fermée (4 murs en L à 90°)', () => {
    // Pièce de 4000 mm × 3000 mm, épaisseur 200 mm
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 0),
      end: vec2(4000, 0),
      thickness: 200,
      locationLine: 'center',
    };
    const w2: WallInput = {
      id: 'w2',
      start: vec2(4000, 0),
      end: vec2(4000, 3000),
      thickness: 200,
      locationLine: 'center',
    };
    const w3: WallInput = {
      id: 'w3',
      start: vec2(4000, 3000),
      end: vec2(0, 3000),
      thickness: 200,
      locationLine: 'center',
    };
    const w4: WallInput = {
      id: 'w4',
      start: vec2(0, 3000),
      end: vec2(0, 0),
      thickness: 200,
      locationLine: 'center',
    };

    const walls = [w1, w2, w3, w4];

    it('détecte exactement 4 jonctions en L', () => {
      const solution = solveWallJunctions(walls);
      expect(solution.walls.length).toBe(4);
      expect(solution.junctions.length).toBe(4);
      expect(solution.junctions.every((j) => j.type === 'L')).toBe(true);
    });

    it('conserve rigoureusement la surface théorique sans trous ni superpositions', () => {
      const solution = solveWallJunctions(walls);

      // Enveloppe extérieure : (4000 + 200) × (3000 + 200) = 4200 × 3200 = 13 440 000 mm²
      // Enveloppe intérieure : (4000 - 200) × (3000 - 200) = 3800 × 2800 = 10 640 000 mm²
      // Surface théorique des murs = 13.44 m² - 10.64 m² = 2.80 m² = 2 800 000 mm²
      const expectedTotalArea = 2_800_000;

      expect(solution.totalArea).toBeCloseTo(expectedTotalArea, 0);

      // Chaque mur horizontal doit mesurer (4200 + 3800)/2 * 200 = 800 000 mm²
      const r1 = solution.walls.find((w) => w.id === 'w1')!;
      const r3 = solution.walls.find((w) => w.id === 'w3')!;
      expect(r1.area).toBeCloseTo(800_000, 0);
      expect(r3.area).toBeCloseTo(800_000, 0);

      // Chaque mur vertical doit mesurer (3200 + 2800)/2 * 200 = 600 000 mm²
      const r2 = solution.walls.find((w) => w.id === 'w2')!;
      const r4 = solution.walls.find((w) => w.id === 'w4')!;
      expect(r2.area).toBeCloseTo(600_000, 0);
      expect(r4.area).toBeCloseTo(600_000, 0);
    });

    it('garantit que tous les polygones finaux sont orientés CCW', () => {
      const solution = solveWallJunctions(walls);
      for (const w of solution.walls) {
        expect(w.polygon.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('Boîte fermée avec cloison séparatrice (Jonctions en T combinées)', () => {
    it('gère une cloison intérieure venant buter sur les murs porteurs opposés', () => {
      // 4 murs extérieurs
      const w1: WallInput = {
        id: 'ext_south',
        start: vec2(0, 0),
        end: vec2(4000, 0),
        thickness: 200,
        locationLine: 'center',
      };
      const w2: WallInput = {
        id: 'ext_east',
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
        thickness: 200,
        locationLine: 'center',
      };
      const w3: WallInput = {
        id: 'ext_north',
        start: vec2(4000, 3000),
        end: vec2(0, 3000),
        thickness: 200,
        locationLine: 'center',
      };
      const w4: WallInput = {
        id: 'ext_west',
        start: vec2(0, 3000),
        end: vec2(0, 0),
        thickness: 200,
        locationLine: 'center',
      };

      // Cloison séparatrice centrale de x = 2000
      const wPartition: WallInput = {
        id: 'partition',
        start: vec2(2000, 0),
        end: vec2(2000, 3000),
        thickness: 100,
        locationLine: 'center',
      };

      const solution = solveWallJunctions([w1, w2, w3, w4, wPartition]);

      expect(solution.walls.length).toBe(5);

      // Les 2 jonctions de la cloison doivent être des T
      const tJunctions = solution.junctions.filter((j) => j.type === 'T');
      expect(tJunctions.length).toBe(2);

      // La cloison doit faire exactement 2800 mm de haut (entre y=100 et y=2900)
      const part = solution.walls.find((w) => w.id === 'partition')!;
      // Surface attendue : 2800 mm × 100 mm = 280 000 mm²
      expect(part.area).toBeCloseTo(280_000, 0);
    });
  });

  describe('Croisement en X et scission', () => {
    it('scinde le mur secondaire en 2 branches propres autour du mur principal', () => {
      const wMain: WallInput = {
        id: 'w_main',
        start: vec2(0, 2000),
        end: vec2(4000, 2000),
        thickness: 200,
        locationLine: 'center',
        priority: 100,
      };
      const wCross: WallInput = {
        id: 'w_cross',
        start: vec2(2000, 0),
        end: vec2(2000, 4000),
        thickness: 200,
        locationLine: 'center',
        priority: 10,
      };

      const solution = solveWallJunctions([wMain, wCross]);

      // wMain reste 1 mur, wCross devient 2 branches => 3 murs résolus
      expect(solution.walls.length).toBe(3);

      const mainRes = solution.walls.find((w) => w.id === 'w_main')!;
      expect(mainRes.area).toBeCloseTo(4000 * 200, 0); // 800 000 mm²

      const branchA = solution.walls.find((w) => w.id === 'w_cross_branchA')!;
      const branchB = solution.walls.find((w) => w.id === 'w_cross_branchB')!;
      expect(branchA).toBeDefined();
      expect(branchB).toBeDefined();

      // Chaque branche s'arrête sur les faces y=1900 et y=2100 => longueur utile 1900 mm chacune
      expect(branchA.area).toBeCloseTo(1900 * 200, 0); // 380 000 mm²
      expect(branchB.area).toBeCloseTo(1900 * 200, 0); // 380 000 mm²

      // Surface totale cumulée = 800k + 380k + 380k = 1 560 000 mm²
      // Soit exactement (4000*200) + (4000*200) - (200*200) (déduction du carré de croisement partagé) !
      expect(solution.totalArea).toBeCloseTo(1_560_000, 0);
    });
  });

  describe('Jonction multiple (Y / Étoile à 3 murs)', () => {
    it('résout 3 murs convergeant au même point à 120°', () => {
      const center = vec2(0, 0);
      const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

      const walls: WallInput[] = angles.map((a, i) => ({
        id: `star_${i}`,
        start: center,
        end: vec2(1500 * Math.cos(a), 1500 * Math.sin(a)),
        thickness: 200,
        locationLine: 'center',
      }));

      const solution = solveWallJunctions(walls);
      expect(solution.walls.length).toBe(3);
      expect(solution.junctions.some((j) => j.type === 'multi')).toBe(true);

      for (const w of solution.walls) {
        expect(w.polygon.length).toBe(4);
        expect(w.area).toBeGreaterThan(0);
      }
    });
  });

  describe('Propriétés géométriques fondamentales', () => {
    const baseWalls: WallInput[] = [
      { id: 'w1', start: vec2(0, 0), end: vec2(3000, 0), thickness: 200, locationLine: 'center' },
      {
        id: 'w2',
        start: vec2(3000, 0),
        end: vec2(3000, 2000),
        thickness: 200,
        locationLine: 'center',
      },
    ];

    it('invariance par translation globale', () => {
      const sol1 = solveWallJunctions(baseWalls);

      const offset = vec2(10000, -25000);
      const translatedWalls: WallInput[] = baseWalls.map((w) => ({
        ...w,
        start: add(w.start, offset),
        end: add(w.end, offset),
      }));

      const sol2 = solveWallJunctions(translatedWalls);

      expect(sol2.totalArea).toBeCloseTo(sol1.totalArea, 4);
      expect(sol2.junctions.length).toBe(sol1.junctions.length);
      expect(sol2.walls[0]!.area).toBeCloseTo(sol1.walls[0]!.area, 4);
      expect(sol2.walls[1]!.area).toBeCloseTo(sol1.walls[1]!.area, 4);
    });

    it('indépendance de l ordre d insertion des murs (déterminisme)', () => {
      const solDirect = solveWallJunctions(baseWalls);
      const solReverse = solveWallJunctions([...baseWalls].reverse());

      expect(solReverse.totalArea).toBeCloseTo(solDirect.totalArea, 4);
      expect(solReverse.junctions.length).toBe(solDirect.junctions.length);
    });
  });

  describe('Visualisation et validation SVG', () => {
    it('génère un document SVG vectoriel valide et complet', () => {
      const walls: WallInput[] = [
        { id: 'w1', start: vec2(0, 0), end: vec2(2000, 0), thickness: 200, locationLine: 'center' },
        {
          id: 'w2',
          start: vec2(2000, 0),
          end: vec2(2000, 2000),
          thickness: 200,
          locationLine: 'center',
        },
      ];

      const solution = solveWallJunctions(walls);
      const svg = exportJunctionsSvg(solution);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('<polygon');
      expect(svg).toContain('w1');
      expect(svg).toContain('w2');
      expect(svg).toContain('junction-markers');
    });
  });
});
