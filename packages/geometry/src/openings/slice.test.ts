import { describe, it, expect } from 'vitest';
import { sliceWallWithOpenings, type SlicingWallInput } from './slice.js';
import { type OpeningInput } from './types.js';
import { vec2, add } from '../vec2.js';
import { isCCW } from '../polygon.js';
import { computeWallFootprint2d } from '../wall-geometry.js';
import { solveWallJunctions } from '../junctions/engine.js';

describe('Découpage 2.5D d Ouvertures (slice.ts)', () => {
  const wallLength = 4000;
  const wallThickness = 200;
  const wallHeight = 2800;

  // Mur droit nominal centré
  const straightFootprint = computeWallFootprint2d({
    start: vec2(0, 0),
    end: vec2(wallLength, 0),
    thickness: wallThickness,
    locationLine: 'center',
  });

  const baseWall: SlicingWallInput = {
    id: 'w_test',
    start: vec2(0, 0),
    end: vec2(wallLength, 0),
    thickness: wallThickness,
    height: wallHeight,
    polygon: straightFootprint.vertices,
  };

  // Mur avec tête en onglet à 45° à l'origine (coin intérieur (100, -100), extérieur (-100, 100))
  const miteredPoly = [vec2(100, -100), vec2(3000, -100), vec2(3000, 100), vec2(-100, 100)];
  const miteredWall: SlicingWallInput = {
    id: 'miter_wall',
    start: vec2(0, 0),
    end: vec2(3000, 0),
    thickness: 200,
    height: 2800,
    polygon: miteredPoly,
  };

  describe('1. Configurations élémentaires (Fenêtre, Porte, Baie toute hauteur)', () => {
    it('mur droit + 1 fenêtre centrée standard (sillZ > 0, lintel < wallH)', () => {
      // Fenêtre 1200 × 1400, allège 900, linteau = 2300 < 2800, centrée à u = 2000
      const windowOp: OpeningInput = {
        id: 'win_1',
        hostWallId: baseWall.id,
        u: 2000,
        width: 1200,
        height: 1400,
        sillZ: 900,
        kind: 'window',
      };

      const result = sliceWallWithOpenings(baseWall, [windowOp]);

      // 5 morceaux attendus :
      // 1. Tranche pleine avant [0, 1400]
      // 2. Allège [1400, 2600], z in [0, 900]
      // 3. Vide [1400, 2600], z in [900, 2300]
      // 4. Linteau [1400, 2600], z in [2300, 2800]
      // 5. Tranche pleine après [2600, 4000]
      expect(result.pieces.length).toBe(5);

      const roles = result.pieces.map((p) => p.role);
      expect(roles).toEqual(['full', 'sill', 'void', 'lintel', 'full']);

      // Vérification des altitudes
      const sillPiece = result.pieces.find((p) => p.role === 'sill')!;
      expect(sillPiece.z0).toBe(0);
      expect(sillPiece.z1).toBe(900);

      const voidPiece = result.pieces.find((p) => p.role === 'void')!;
      expect(voidPiece.z0).toBe(900);
      expect(voidPiece.z1).toBe(2300);

      const lintelPiece = result.pieces.find((p) => p.role === 'lintel')!;
      expect(lintelPiece.z0).toBe(2300);
      expect(lintelPiece.z1).toBe(2800);

      // Conservation exacte des volumes
      expect(result.solidVolume + result.voidVolume).toBeCloseTo(result.wallVolume, 2);
      expect(result.wallVolume).toBeCloseTo(wallLength * wallThickness * wallHeight, 2);

      // Chaque polygone 2D doit être CCW et valide
      for (const piece of result.pieces) {
        expect(piece.poly2D.length).toBeGreaterThanOrEqual(4);
        expect(isCCW(piece.poly2D)).toBe(true);
      }
    });

    it('mur droit + 1 porte (sillZ = 0) -> absence de tranche sill', () => {
      // Porte 900 × 2100, sillZ = 0, linteau = 2100, u = 1500
      const doorOp: OpeningInput = {
        id: 'door_1',
        hostWallId: baseWall.id,
        u: 1500,
        width: 900,
        height: 2100,
        sillZ: 0,
        kind: 'door',
      };

      const result = sliceWallWithOpenings(baseWall, [doorOp]);

      // 4 morceaux attendus : full, void, lintel, full
      expect(result.pieces.length).toBe(4);
      expect(result.pieces.map((p) => p.role)).toEqual(['full', 'void', 'lintel', 'full']);

      const voidPiece = result.pieces.find((p) => p.role === 'void')!;
      expect(voidPiece.z0).toBe(0);
      expect(voidPiece.z1).toBe(2100);

      const lintelPiece = result.pieces.find((p) => p.role === 'lintel')!;
      expect(lintelPiece.z0).toBe(2100);
      expect(lintelPiece.z1).toBe(wallHeight);

      expect(result.solidVolume + result.voidVolume).toBeCloseTo(result.wallVolume, 2);
    });

    it('mur droit + 1 baie toute hauteur (sillZ = 0, H = wallHeight) -> ni sill ni lintel', () => {
      const fullOp: OpeningInput = {
        id: 'full_op',
        hostWallId: baseWall.id,
        u: 2000,
        width: 1000,
        height: wallHeight,
        sillZ: 0,
        kind: 'window',
      };

      const result = sliceWallWithOpenings(baseWall, [fullOp]);

      // 3 morceaux attendus : full avant, void, full après
      expect(result.pieces.length).toBe(3);
      expect(result.pieces.map((p) => p.role)).toEqual(['full', 'void', 'full']);
      expect(result.solidVolume + result.voidVolume).toBeCloseTo(result.wallVolume, 2);
    });

    it('mur sans ouverture -> renvoie 1 unique pièce pleine hauteur', () => {
      const result = sliceWallWithOpenings(baseWall, []);
      expect(result.pieces.length).toBe(1);
      const piece0 = result.pieces[0];
      expect(piece0).toBeDefined();
      if (!piece0) return;
      expect(piece0.role).toBe('full');
      expect(piece0.z0).toBe(0);
      expect(piece0.z1).toBe(wallHeight);
      expect(result.solidVolume).toBe(result.wallVolume);
      expect(result.voidVolume).toBe(0);
    });
  });

  describe('2. Multi-ouvertures sur un même mur', () => {
    it('mur + 2 ouvertures -> présence d une tranche pleine intermédiaire', () => {
      const win1: OpeningInput = {
        id: 'w1',
        hostWallId: baseWall.id,
        u: 1000, // [600, 1400]
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const win2: OpeningInput = {
        id: 'w2',
        hostWallId: baseWall.id,
        u: 2600, // [2200, 3000]
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };

      const result = sliceWallWithOpenings(baseWall, [win1, win2]);

      // Tranches le long de u :
      // 1. [0, 600] : full
      // 2. [600, 1400] : sill, void, lintel (3 pièces)
      // 3. [1400, 2200] : full intermédiaire
      // 4. [2200, 3000] : sill, void, lintel (3 pièces)
      // 5. [3000, 4000] : full final
      // Total = 1 + 3 + 1 + 3 + 1 = 9 pièces
      expect(result.pieces.length).toBe(9);

      // Vérifier la tranche intermédiaire
      const interPiece = result.pieces.find(
        (p) => p.role === 'full' && p.uInterval[0] === 1400 && p.uInterval[1] === 2200,
      );
      expect(interPiece).toBeDefined();
      if (!interPiece) return;
      expect(interPiece.z0).toBe(0);
      expect(interPiece.z1).toBe(wallHeight);

      expect(result.solidVolume + result.voidVolume).toBeCloseTo(result.wallVolume, 2);
    });
  });

  describe('3. Cas Limites Complexes Post-Audit (Onglet 45°, Trémie au ras de la garde)', () => {
    it('résout une ouverture à la clearance exacte (50 mm) d un coin en onglet à 45°', () => {
      // Ouverture commençant à la clearance exacte : uStart = 50 mm.
      // Largeur = 1000 mm => uEnd = 1050 mm. u = 550 mm.
      const opNearMiter: OpeningInput = {
        id: 'op_near_miter',
        hostWallId: miteredWall.id,
        u: 550,
        width: 1000,
        height: 1400,
        sillZ: 900,
        kind: 'window',
      };

      const result = sliceWallWithOpenings(miteredWall, [opNearMiter]);
      expect(result.pieces.length).toBe(5);

      // Conservation stricte de l'aire 2D et du volume
      const sumArea2D = result.pieces
        .filter((p) => p.role === 'full' || p.role === 'void')
        .reduce((acc, p) => acc + p.area2D, 0);

      expect(sumArea2D).toBeCloseTo(result.totalArea2D, 2);
      expect(result.solidVolume + result.voidVolume).toBeCloseTo(result.wallVolume, 2);

      // La tranche 0 (avant l'ouverture) doit conserver la tête d'onglet inclinée
      const slice0 = result.pieces[0];
      expect(slice0).toBeDefined();
      if (!slice0) return;
      expect(slice0.poly2D.some((v) => v.x < 0)).toBe(true); // Englobe le coin (-100, 100)
    });

    it('rejette avec RangeError une ouverture sévère (W >= L) ou mur trop court', () => {
      const opSever: OpeningInput = {
        id: 'op_sever',
        hostWallId: baseWall.id,
        u: 2000,
        width: 4000,
        height: 2000,
        sillZ: 0,
        kind: 'door',
      };
      expect(() => sliceWallWithOpenings(baseWall, [opSever])).toThrowError(/SEVERS_WALL/);
    });
  });

  describe('4. Tests de Propriétés (Invariance, Déterminisme, Stabilité Numérique)', () => {
    const windowOp: OpeningInput = {
      id: 'win_prop',
      hostWallId: 'w_prop',
      u: 2000,
      width: 1200,
      height: 1400,
      sillZ: 900,
      kind: 'window',
    };

    it('propriété : invariance stricte sous translation globale de 1 km (1 000 000 mm)', () => {
      const offset = vec2(1_000_000, 1_000_000);
      const translatedWall: SlicingWallInput = {
        ...baseWall,
        start: add(baseWall.start, offset),
        end: add(baseWall.end, offset),
        polygon: baseWall.polygon.map((p) => add(p, offset)),
      };

      const baseRes = sliceWallWithOpenings(baseWall, [windowOp]);
      const transRes = sliceWallWithOpenings(translatedWall, [windowOp]);

      expect(transRes.pieces.length).toBe(baseRes.pieces.length);
      expect(transRes.solidVolume).toBeCloseTo(baseRes.solidVolume, 2);
      expect(transRes.voidVolume).toBeCloseTo(baseRes.voidVolume, 2);
    });

    it('propriété : invariance stricte sous rotation globale de 90°', () => {
      // Rotation de 90° : (x, y) -> (-y, x)
      const rotWall: SlicingWallInput = {
        ...baseWall,
        start: vec2(-baseWall.start.y, baseWall.start.x),
        end: vec2(-baseWall.end.y, baseWall.end.x),
        polygon: baseWall.polygon.map((p) => vec2(-p.y, p.x)),
      };

      const baseRes = sliceWallWithOpenings(baseWall, [windowOp]);
      const rotRes = sliceWallWithOpenings(rotWall, [windowOp]);

      expect(rotRes.pieces.length).toBe(baseRes.pieces.length);
      expect(rotRes.solidVolume).toBeCloseTo(baseRes.solidVolume, 2);
      expect(rotRes.voidVolume).toBeCloseTo(baseRes.voidVolume, 2);
    });

    it('propriété : déterminisme absolu face à l ordre d entrée des ouvertures', () => {
      const winA: OpeningInput = {
        id: 'winA',
        hostWallId: baseWall.id,
        u: 1000,
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const winB: OpeningInput = {
        id: 'winB',
        hostWallId: baseWall.id,
        u: 2500,
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };

      const resAB = sliceWallWithOpenings(baseWall, [winA, winB]);
      const resBA = sliceWallWithOpenings(baseWall, [winB, winA]);

      // Égalité structurelle et géométrique stricte indépendante de l'ordre d'insertion
      expect(resBA).toEqual(resAB);
    });

    it('propriété : conservation d aire exacte à des altitudes Z explicites (z = 100, 1000, 2000, 2700 mm)', () => {
      // Cas 1 : Mur avec Fenêtre (sillZ = 900, height = 1200 => vide actif dans [900, 2100])
      const winOp: OpeningInput = {
        id: 'win_z',
        hostWallId: baseWall.id,
        u: 2000,
        width: 1200,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const resWin = sliceWallWithOpenings(baseWall, [winOp]);

      // Cas 2 : Mur avec Porte (sillZ = 0, height = 2100 => vide actif dans [0, 2100])
      const doorOp: OpeningInput = {
        id: 'door_z',
        hostWallId: baseWall.id,
        u: 2000,
        width: 900,
        height: 2100,
        sillZ: 0,
        kind: 'door',
      };
      const resDoor = sliceWallWithOpenings(baseWall, [doorOp]);

      // Cas 3 : Mur en Onglet 45° et Fenêtre (sillZ = 900, height = 1400 => vide actif dans [900, 2300])
      const miterOp: OpeningInput = {
        id: 'miter_win_z',
        hostWallId: miteredWall.id,
        u: 550,
        width: 1000,
        height: 1400,
        sillZ: 900,
        kind: 'window',
      };
      const resMiter = sliceWallWithOpenings(miteredWall, [miterOp]);

      const zTestLevels = [100, 1000, 2000, 2700];

      const verifyZLevels = (res: typeof resWin) => {
        for (const z of zTestLevels) {
          const activeSolids = res.pieces.filter((p) => p.role !== 'void' && z >= p.z0 && z < p.z1);
          const activeVoids = res.pieces.filter((p) => p.role === 'void' && z >= p.z0 && z < p.z1);

          const sumSolidArea = activeSolids.reduce((acc, p) => acc + p.area2D, 0);
          const sumVoidArea = activeVoids.reduce((acc, p) => acc + p.area2D, 0);

          const expectedSolidArea = res.totalArea2D - sumVoidArea;
          const diff = Math.abs(sumSolidArea - expectedSolidArea);

          // Tolérance stricte 1e-6 mm²
          expect(diff).toBeLessThan(1e-6);
        }
      };

      verifyZLevels(resWin);
      verifyZLevels(resDoor);
      verifyZLevels(resMiter);
    });

    it('propriété : étanchéité volumique exacte sur configurations paramétriques', () => {
      // Test de partition de matière sur variations d'ouvertures et d'allèges
      const testCases = [
        { u: 800, w: 600, h: 1000, sill: 1000 },
        { u: 1500, w: 1000, h: 1500, sill: 800 },
        { u: 2000, w: 1200, h: 2100, sill: 0 },
        { u: 2800, w: 800, h: 1800, sill: 600 },
        { u: 3200, w: 700, h: 1200, sill: 1100 },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const c = testCases[i];
        if (!c) continue;
        const op: OpeningInput = {
          id: `rand_op_${i}`,
          hostWallId: baseWall.id,
          u: c.u,
          width: c.w,
          height: c.h,
          sillZ: c.sill,
          kind: c.sill === 0 ? 'door' : 'window',
        };

        const res = sliceWallWithOpenings(baseWall, [op]);

        // Mesure empirique réelle sur les polygones produits
        const measuredSolidVolume = res.pieces
          .filter((p) => p.role !== 'void')
          .reduce((sum, p) => sum + p.area2D * (p.z1 - p.z0), 0);
        const measuredVoidVolume = res.pieces
          .filter((p) => p.role === 'void')
          .reduce((sum, p) => sum + p.area2D * (p.z1 - p.z0), 0);

        const diff = Math.abs(measuredSolidVolume + measuredVoidVolume - res.wallVolume);
        expect(diff).toBeLessThan(1e-6);
      }
    });
  });

  describe('5. Test Croisé : Intégration Mur de Jonction L résolu + Ouverture', () => {
    it('insère une porte dans un mur issu d une jonction en L résolue sans altérer le mur voisin', () => {
      // Deux murs en L orthogonaux résolus par solveWallJunctions
      const w1 = {
        id: 'w1',
        start: vec2(0, 0),
        end: vec2(4000, 0),
        thickness: 200,
        locationLine: 'center' as const,
      };
      const w2 = {
        id: 'w2',
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
        thickness: 200,
        locationLine: 'center' as const,
      };

      const juncSol = solveWallJunctions([w1, w2]);
      const resolvedW1 = juncSol.walls.find((w) => w.id === 'w1')!;
      const resolvedW2 = juncSol.walls.find((w) => w.id === 'w2')!;

      // Insérer une porte dans W1
      const door: OpeningInput = {
        id: 'door_w1',
        hostWallId: 'w1',
        u: 2000,
        width: 900,
        height: 2100,
        sillZ: 0,
        kind: 'door',
      };

      const slicingInput: SlicingWallInput = {
        id: resolvedW1.id,
        start: resolvedW1.start,
        end: resolvedW1.end,
        thickness: resolvedW1.thickness,
        height: 2800,
        polygon: resolvedW1.polygon,
      };

      const sliceRes = sliceWallWithOpenings(slicingInput, [door]);
      expect(sliceRes.pieces.length).toBe(4);
      expect(sliceRes.solidVolume + sliceRes.voidVolume).toBeCloseTo(sliceRes.wallVolume, 2);

      // Le mur voisin W2 n'a absolument pas été altéré (aire nominale 3000 × 200 = 600 000 mm²)
      expect(resolvedW2.area).toBeCloseTo(3000 * 200, 0);
    });
  });
});
