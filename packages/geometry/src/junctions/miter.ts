import { GEOM_CONFIG } from '../constants.js';
import { type Vec2, add, sub, mul, perp, normalize, distance } from '../vec2.js';
import { line2, intersectLines } from '../line.js';
import { type WallInput, type WallEnd } from './types.js';

/**
 * Définition des lignes de bordure latérale d'un mur vu depuis un nœud d'extrémité.
 */
export interface WallBoundaryAtEnd {
  readonly wallId: string;
  readonly end: WallEnd;
  readonly outgoingDir: Vec2; // Vecteur unitaire partant du nœud vers l'intérieur du mur
  readonly leftNormal: Vec2; // Normale gauche par rapport à outgoingDir
  readonly leftLine: { origin: Vec2; direction: Vec2 };
  readonly rightLine: { origin: Vec2; direction: Vec2 };
  readonly leftOffset: number;
  readonly rightOffset: number;
}

/**
 * Calcule les lignes de bordure latérale (gauche et droite) d'un mur vu depuis son extrémité.
 */
export function getWallBoundaryAtEnd(
  wall: WallInput,
  end: WallEnd,
  nodePoint: Vec2,
): WallBoundaryAtEnd {
  const wallVec = sub(wall.end, wall.start);
  const wallDir = normalize(wallVec);

  let outgoingDir: Vec2;
  if (end === 'start') {
    outgoingDir = wallDir; // Vers l'avant
  } else {
    outgoingDir = mul(wallDir, -1); // Vers l'arrière
  }

  const leftNormal = perp(outgoingDir);

  let sInt: number;
  let sExt: number;
  const t = wall.thickness;

  switch (wall.locationLine) {
    case 'center':
      sInt = -t / 2;
      sExt = t / 2;
      break;
    case 'exterior':
      sInt = -t;
      sExt = 0;
      break;
    case 'interior':
      sInt = 0;
      sExt = t;
      break;
  }

  let leftOffset: number;
  let rightOffset: number;

  if (end === 'start') {
    leftOffset = sExt;
    rightOffset = -sInt;
  } else {
    leftOffset = -sInt;
    rightOffset = sExt;
  }

  // Origines des droites de face latérale
  const leftOrigin = add(nodePoint, mul(leftNormal, leftOffset));
  const rightOrigin = add(nodePoint, mul(leftNormal, -rightOffset));

  return {
    wallId: wall.id,
    end,
    outgoingDir,
    leftNormal,
    leftLine: line2(leftOrigin, outgoingDir),
    rightLine: line2(rightOrigin, outgoingDir),
    leftOffset,
    rightOffset,
  };
}

/**
 * Résultat du calcul d'un onglet en L pour une extrémité de mur.
 */
export interface MiterEndResult {
  readonly wallId: string;
  readonly end: WallEnd;
  /**
   * Sommets d'extrémité modifiés à insérer dans le polygone du mur.
   * Ordonnés de la face droite vers la face gauche par rapport à outgoingDir.
   */
  readonly vertices: readonly Vec2[];
  readonly isBevelled: boolean;
}

/**
 * Calcule la géométrie de jonction en L entre deux murs se rejoignant à un nœud.
 *
 * Gère tous les angles (droits, aigus, obtus), les épaisseurs différentes, les lignes
 * de référence différentes, et applique une limite d'onglet stricte (miter limit).
 *
 * @param wall1 Premier mur
 * @param end1 Extrémité connectée du mur 1
 * @param wall2 Second mur
 * @param end2 Extrémité connectée du mur 2
 * @param nodePoint Point de rencontre théorique des axes
 * @param miterLimitRatio Ratio de limite d'onglet (par défaut 4.0, soit angle min ~28.96°)
 */
export function solveLMiter(
  wall1: WallInput,
  end1: WallEnd,
  wall2: WallInput,
  end2: WallEnd,
  nodePoint: Vec2,
  miterLimitRatio: number = GEOM_CONFIG.MITER_LIMIT_RATIO,
): { readonly result1: MiterEndResult; readonly result2: MiterEndResult } {
  const b1 = getWallBoundaryAtEnd(wall1, end1, nodePoint);
  const b2 = getWallBoundaryAtEnd(wall2, end2, nodePoint);

  const angle1 = Math.atan2(b1.outgoingDir.y, b1.outgoingDir.x);
  const angle2 = Math.atan2(b2.outgoingDir.y, b2.outgoingDir.x);

  let deltaAngle = (angle2 - angle1) % (2 * Math.PI);
  if (deltaAngle < 0) deltaAngle += 2 * Math.PI;

  const maxThickness = Math.max(wall1.thickness, wall2.thickness);
  const maxMiterDistance = miterLimitRatio * maxThickness;

  // Cas quasi-colinéaire opposé (180°)
  if (Math.abs(deltaAngle - Math.PI) <= GEOM_CONFIG.EPSILON_COLLINEAR) {
    const p1Right = add(nodePoint, mul(b1.leftNormal, -b1.rightOffset));
    const p1Left = add(nodePoint, mul(b1.leftNormal, b1.leftOffset));
    const p2Right = add(nodePoint, mul(b2.leftNormal, -b2.rightOffset));
    const p2Left = add(nodePoint, mul(b2.leftNormal, b2.leftOffset));

    return {
      result1: { wallId: wall1.id, end: end1, vertices: [p1Right, p1Left], isBevelled: false },
      result2: { wallId: wall2.id, end: end2, vertices: [p2Right, p2Left], isBevelled: false },
    };
  }

  // Cas quasi-colinéaire de même direction (0° ou 360°)
  if (
    deltaAngle <= GEOM_CONFIG.EPSILON_COLLINEAR ||
    Math.abs(deltaAngle - 2 * Math.PI) <= GEOM_CONFIG.EPSILON_COLLINEAR
  ) {
    const p1Right = add(nodePoint, mul(b1.leftNormal, -b1.rightOffset));
    const p1Left = add(nodePoint, mul(b1.leftNormal, b1.leftOffset));
    const p2Right = add(nodePoint, mul(b2.leftNormal, -b2.rightOffset));
    const p2Left = add(nodePoint, mul(b2.leftNormal, b2.leftOffset));

    return {
      result1: { wallId: wall1.id, end: end1, vertices: [p1Right, p1Left], isBevelled: false },
      result2: { wallId: wall2.id, end: end2, vertices: [p2Right, p2Left], isBevelled: false },
    };
  }

  let corner1: Vec2; // Coin partagé 1
  let corner2: Vec2; // Coin partagé 2
  const corner1Bevelled = false;
  let corner2Bevelled = false;

  // Sommets de remplacement pour W1 et W2
  let w1RightVerts: Vec2[];
  let w1LeftVerts: Vec2[];
  let w2RightVerts: Vec2[];
  let w2LeftVerts: Vec2[];

  if (deltaAngle < Math.PI) {
    // W2 est à gauche de W1
    // Coin intérieur : left de W1 et right de W2
    const intRes = intersectLines(b1.leftLine, b2.rightLine);
    if (intRes.type === 'point') {
      corner1 = intRes.point;
    } else {
      corner1 = nodePoint;
    }

    // Coin extérieur : right de W1 et left de W2
    const extRes = intersectLines(b1.rightLine, b2.leftLine);
    if (extRes.type === 'point') {
      corner2 = extRes.point;
      const dExt = distance(corner2, nodePoint);
      if (dExt > maxMiterDistance) {
        corner2Bevelled = true;
      }
    } else {
      corner2 = nodePoint;
    }

    if (corner2Bevelled) {
      // Troncature biseautée étanche du coin extérieur excessif sur la bissectrice
      const vExt = sub(corner2, nodePoint);
      const uBisector = normalize(vExt);
      const mBevel = add(nodePoint, mul(uBisector, maxMiterDistance));
      const bevelLine = line2(mBevel, perp(uBisector));

      const b1Inter = intersectLines(b1.rightLine, bevelLine);
      const b2Inter = intersectLines(b2.leftLine, bevelLine);

      const p1Cut = b1Inter.type === 'point' ? b1Inter.point : corner2;
      const p2Cut = b2Inter.type === 'point' ? b2Inter.point : corner2;

      w1RightVerts = [p1Cut, mBevel];
      w2LeftVerts = [mBevel, p2Cut];
    } else {
      w1RightVerts = [corner2];
      w2LeftVerts = [corner2];
    }

    w1LeftVerts = [corner1];
    w2RightVerts = [corner1];
  } else {
    // W1 est à gauche de W2 (deltaAngle > Math.PI)
    // Coin intérieur : right de W1 et left de W2
    const intRes = intersectLines(b1.rightLine, b2.leftLine);
    if (intRes.type === 'point') {
      corner1 = intRes.point;
    } else {
      corner1 = nodePoint;
    }

    // Coin extérieur : left de W1 et right de W2
    const extRes = intersectLines(b1.leftLine, b2.rightLine);
    if (extRes.type === 'point') {
      corner2 = extRes.point;
      const dExt = distance(corner2, nodePoint);
      if (dExt > maxMiterDistance) {
        corner2Bevelled = true;
      }
    } else {
      corner2 = nodePoint;
    }

    if (corner2Bevelled) {
      const vExt = sub(corner2, nodePoint);
      const uBisector = normalize(vExt);
      const mBevel = add(nodePoint, mul(uBisector, maxMiterDistance));
      const bevelLine = line2(mBevel, perp(uBisector));

      const b1Inter = intersectLines(b1.leftLine, bevelLine);
      const b2Inter = intersectLines(b2.rightLine, bevelLine);

      const p1Cut = b1Inter.type === 'point' ? b1Inter.point : corner2;
      const p2Cut = b2Inter.type === 'point' ? b2Inter.point : corner2;

      w1LeftVerts = [mBevel, p1Cut];
      w2RightVerts = [p2Cut, mBevel];
    } else {
      w1LeftVerts = [corner2];
      w2RightVerts = [corner2];
    }

    w1RightVerts = [corner1];
    w2LeftVerts = [corner1];
  }

  return {
    result1: {
      wallId: wall1.id,
      end: end1,
      vertices: [...w1RightVerts, ...w1LeftVerts],
      isBevelled: corner1Bevelled || corner2Bevelled,
    },
    result2: {
      wallId: wall2.id,
      end: end2,
      vertices: [...w2RightVerts, ...w2LeftVerts],
      isBevelled: corner1Bevelled || corner2Bevelled,
    },
  };
}
