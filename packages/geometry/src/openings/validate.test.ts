import { describe, it, expect } from 'vitest';
import { validateOpening, validateOpenings, assertValidOpenings } from './validate.js';
import { type OpeningInput } from './types.js';

describe('Validation des Ouvertures (validate.ts)', () => {
  const wallL = 4000;
  const wallH = 2800;

  describe('1. Dimensions invalides (W <= 0, H <= 0, non fini)', () => {
    it('rejette une largeur négative ou nulle', () => {
      const op0: OpeningInput = {
        id: 'op0',
        hostWallId: 'w1',
        u: 1000,
        width: 0,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues0 = validateOpening(op0, wallL, wallH);
      expect(issues0.some((i) => i.code === 'INVALID_DIMENSIONS')).toBe(true);

      const opNeg: OpeningInput = { ...op0, width: -200 };
      const issuesNeg = validateOpening(opNeg, wallL, wallH);
      expect(issuesNeg.some((i) => i.code === 'INVALID_DIMENSIONS')).toBe(true);
    });

    it('rejette une hauteur négative ou nulle', () => {
      const op: OpeningInput = {
        id: 'op1',
        hostWallId: 'w1',
        u: 1000,
        width: 800,
        height: 0,
        sillZ: 900,
        kind: 'window',
      };
      const issues = validateOpening(op, wallL, wallH);
      expect(issues.some((i) => i.code === 'INVALID_DIMENSIONS')).toBe(true);
    });
  });

  describe('2. Règle de Sévèrement de Mur (W >= L ou L < W + 2*clearance)', () => {
    it('rejette une ouverture dont la largeur est égale ou supérieure à la longueur du mur', () => {
      const opSevers: OpeningInput = {
        id: 'op_sever',
        hostWallId: 'w1',
        u: 2000,
        width: 4000,
        height: 2000,
        sillZ: 0,
        kind: 'door',
      };
      const issues = validateOpening(opSevers, 4000, wallH);
      expect(issues.some((i) => i.code === 'SEVERS_WALL')).toBe(true);
      expect(() => assertValidOpenings([opSevers], 4000, wallH)).toThrowError(/SEVERS_WALL/);
    });

    it('rejette un mur trop court pour accueillir la baie et les deux marges de 50 mm', () => {
      // Mur de 1050 mm, ouverture de 1000 mm -> il manque 50 mm pour avoir 2x50 mm
      const op: OpeningInput = {
        id: 'op_short',
        hostWallId: 'w1',
        u: 525,
        width: 1000,
        height: 1500,
        sillZ: 0,
        kind: 'door',
      };
      const issues = validateOpening(op, 1050, wallH);
      expect(issues.some((i) => i.code === 'SEVERS_WALL')).toBe(true);
    });

    it('accepte un mur de longueur minimale exacte W + 2*clearance (ex: 1100 mm pour W=1000)', () => {
      const op: OpeningInput = {
        id: 'op_exact',
        hostWallId: 'w1',
        u: 550, // uStart = 50, uEnd = 1050
        width: 1000,
        height: 1500,
        sillZ: 0,
        kind: 'door',
      };
      const issues = validateOpening(op, 1100, wallH);
      expect(issues.length).toBe(0);
    });
  });

  describe('3. Débordement aux extrémités et test de bornes exactes (49.99, 50.00, 50.01)', () => {
    const W = 800; // demi-largeur = 400

    it('teste la borne exacte au début du mur (uStart = 49.99 vs 50.00 vs 50.01)', () => {
      // u = 449.99 => uStart = 49.99 < 50.00 => REJET
      const op49: OpeningInput = {
        id: 'op49',
        hostWallId: 'w1',
        u: 449.99,
        width: W,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues49 = validateOpening(op49, wallL, wallH);
      expect(issues49.some((i) => i.code === 'OUT_OF_WALL_BOUNDS')).toBe(true);

      // u = 450.00 => uStart = 50.00 == MIN_OPENING_CLEARANCE => SUCCÈS
      const op50: OpeningInput = { ...op49, u: 450.0 };
      const issues50 = validateOpening(op50, wallL, wallH);
      expect(issues50.length).toBe(0);

      // u = 450.01 => uStart = 50.01 > 50.00 => SUCCÈS
      const op51: OpeningInput = { ...op49, u: 450.01 };
      const issues51 = validateOpening(op51, wallL, wallH);
      expect(issues51.length).toBe(0);
    });

    it('teste la borne exacte en fin de mur (uEnd = L - 49.99 vs L - 50.00 vs L - 50.01)', () => {
      // Pour L = 4000, max uEnd = 3950. Avec W = 800, max u = 3550.
      const opTooFar: OpeningInput = {
        id: 'op_far',
        hostWallId: 'w1',
        u: 3550.01, // uEnd = 3950.01 > 3950 => REJET
        width: W,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      expect(
        validateOpening(opTooFar, wallL, wallH).some((i) => i.code === 'OUT_OF_WALL_BOUNDS'),
      ).toBe(true);

      const opExactEnd: OpeningInput = { ...opTooFar, u: 3550.0 }; // uEnd = 3950.00 => SUCCÈS
      expect(validateOpening(opExactEnd, wallL, wallH).length).toBe(0);
    });
  });

  describe('4. Hauteurs, Allèges et Linteaux', () => {
    it('rejette une allège négative', () => {
      const op: OpeningInput = {
        id: 'op_neg_sill',
        hostWallId: 'w1',
        u: 1000,
        width: 800,
        height: 1200,
        sillZ: -10,
        kind: 'window',
      };
      expect(validateOpening(op, wallL, wallH).some((i) => i.code === 'HEIGHT_EXCEEDS_WALL')).toBe(
        true,
      );
    });

    it('rejette un linteau dépassant la hauteur du mur', () => {
      // wallH = 2800. sillZ = 900, H = 2000 => lintel = 2900 > 2800
      const op: OpeningInput = {
        id: 'op_too_high',
        hostWallId: 'w1',
        u: 1000,
        width: 800,
        height: 2000,
        sillZ: 900,
        kind: 'window',
      };
      expect(validateOpening(op, wallL, wallH).some((i) => i.code === 'HEIGHT_EXCEEDS_WALL')).toBe(
        true,
      );
    });

    it('accepte une ouverture toute hauteur (sillZ = 0, H = wallHeight)', () => {
      const opFullH: OpeningInput = {
        id: 'op_full_h',
        hostWallId: 'w1',
        u: 1000,
        width: 800,
        height: wallH,
        sillZ: 0,
        kind: 'window',
      };
      expect(validateOpening(opFullH, wallL, wallH).length).toBe(0);
    });
  });

  describe('5. Multi-ouvertures : Chevauchements et Trumeaux minimaux', () => {
    const op1: OpeningInput = {
      id: 'op1',
      hostWallId: 'w1',
      u: 1000, // [600, 1400]
      width: 800,
      height: 1200,
      sillZ: 900,
      kind: 'window',
    };

    it('rejette deux ouvertures se chevauchant directement', () => {
      const opOverlap: OpeningInput = {
        id: 'op2_overlap',
        hostWallId: 'w1',
        u: 1300, // [900, 1700] -> chevauche [600, 1400]
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues = validateOpenings([op1, opOverlap], wallL, wallH);
      expect(issues.some((i) => i.code === 'OPENING_OVERLAP')).toBe(true);
    });

    it('rejette un trumeau de 49.99 mm (< 50 mm)', () => {
      // op1 se termine à 1400.
      // op2 commence à 1400 + 49.99 = 1449.99.
      // Avec W = 800, u = 1449.99 + 400 = 1849.99.
      const op49: OpeningInput = {
        id: 'op2_49',
        hostWallId: 'w1',
        u: 1849.99,
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues = validateOpenings([op1, op49], wallL, wallH);
      expect(issues.some((i) => i.code === 'OPENING_CLEARANCE_BETWEEN')).toBe(true);
    });

    it('accepte deux ouvertures séparées par exactement MIN_OPENING_CLEARANCE (50.00 mm)', () => {
      // op1 fin à 1400. op2 début à 1450.00 => u = 1850.00.
      const op50: OpeningInput = {
        id: 'op2_50',
        hostWallId: 'w1',
        u: 1850.0,
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues = validateOpenings([op1, op50], wallL, wallH);
      expect(issues.length).toBe(0);
    });

    it('accepte deux ouvertures séparées par plus de 50 mm (ex: 200 mm)', () => {
      const op200: OpeningInput = {
        id: 'op2_200',
        hostWallId: 'w1',
        u: 2000, // début à 1600 > 1400 + 50
        width: 800,
        height: 1200,
        sillZ: 900,
        kind: 'window',
      };
      const issues = validateOpenings([op1, op200], wallL, wallH);
      expect(issues.length).toBe(0);
    });
  });
});
