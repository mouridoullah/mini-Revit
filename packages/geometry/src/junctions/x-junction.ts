import { type Vec2 } from '../vec2.js';
import { type WallInput } from './types.js';
import { solveTJunction, type TStemResult } from './t-junction.js';

/**
 * Résultat de la résolution d'une jonction en X entre deux murs sécants.
 */
export interface XJunctionResult {
  readonly primaryWallId: string;
  readonly secondaryWallId: string;
  readonly intersectionPoint: Vec2;
  /**
   * Les deux branches du mur secondaire découpé par le mur principal traversant.
   * - branch1 : de start au contact avec la première face du mur principal.
   * - branch2 : de la seconde face du mur principal jusqu'à end.
   */
  readonly branch1: {
    readonly id: string;
    readonly start: Vec2;
    readonly end: Vec2;
    readonly tResult: TStemResult;
  };
  readonly branch2: {
    readonly id: string;
    readonly start: Vec2;
    readonly end: Vec2;
    readonly tResult: TStemResult;
  };
}

/**
 * Résout une jonction en X (croisement de deux murs).
 *
 * Le mur de plus haute priorité reste continu et traverse l'intersection sans découpe.
 * Le mur secondaire est scindé en deux branches aboutissant chacune sur la face opposée du mur principal.
 */
export function solveXJunction(
  wall1: WallInput,
  wall2: WallInput,
  intersectionPoint: Vec2,
): XJunctionResult {
  // Sélection du mur prioritaire (traversant)
  const p1 = wall1.priority ?? 0;
  const p2 = wall2.priority ?? 0;

  let primary: WallInput;
  let secondary: WallInput;

  if (p1 >= p2) {
    primary = wall1;
    secondary = wall2;
  } else {
    primary = wall2;
    secondary = wall1;
  }

  // Branch 1 du mur secondaire : de secondary.start vers intersectionPoint
  const branch1Input: WallInput = {
    ...secondary,
    id: `${secondary.id}_branchA`,
    start: secondary.start,
    end: intersectionPoint,
  };
  const tResultBranch1 = solveTJunction(primary, branch1Input, 'end', intersectionPoint);

  // Branch 2 du mur secondaire : de intersectionPoint vers secondary.end
  const branch2Input: WallInput = {
    ...secondary,
    id: `${secondary.id}_branchB`,
    start: intersectionPoint,
    end: secondary.end,
  };
  const tResultBranch2 = solveTJunction(primary, branch2Input, 'start', intersectionPoint);

  return {
    primaryWallId: primary.id,
    secondaryWallId: secondary.id,
    intersectionPoint,
    branch1: {
      id: branch1Input.id,
      start: branch1Input.start,
      end: branch1Input.end,
      tResult: tResultBranch1,
    },
    branch2: {
      id: branch2Input.id,
      start: branch2Input.start,
      end: branch2Input.end,
      tResult: tResultBranch2,
    },
  };
}
