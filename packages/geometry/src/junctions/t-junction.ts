import { type Vec2, sub, dot, normalize, mul, add } from '../vec2.js';
import { line2, intersectLines } from '../line.js';
import { type WallInput, type WallEnd } from './types.js';
import { getWallBoundaryAtEnd } from './miter.js';
import { computeWallFootprint2d } from '../wall-geometry.js';

/**
 * Résultat du raccordement en T pour le mur secondaire (abouté).
 */
export interface TStemResult {
  readonly stemWallId: string;
  readonly stemEnd: WallEnd;
  readonly throughWallId: string;
  /**
   * Les deux sommets d'extrémité modifiés venant buter exactement sur la face du mur traversant.
   * [pRight, pLeft] vu depuis l'extrémité vers l'intérieur du mur secondaire.
   */
  readonly vertices: readonly [Vec2, Vec2];
  readonly hitFace: 'exterior' | 'interior';
}

/**
 * Résout une jonction en T entre un mur principal traversant et un mur secondaire aboutissant.
 *
 * Le mur principal reste continu. Le mur secondaire voit son extrémité biseautée/ajustée
 * pour épouser rigoureusement la face latérale du mur principal sur laquelle il arrive.
 *
 * @param throughWall Mur principal traversant
 * @param stemWall Mur secondaire aboutant
 * @param stemEnd Extrémité connectée du mur secondaire ('start' | 'end')
 * @param connectionPoint Point de projection sur l'axe du mur traversant
 */
export function solveTJunction(
  throughWall: WallInput,
  stemWall: WallInput,
  stemEnd: WallEnd,
  connectionPoint: Vec2,
): TStemResult {
  // 1. Calcul de l'emprise nominale du mur traversant pour obtenir ses lignes de face
  const throughFootprint = computeWallFootprint2d({
    start: throughWall.start,
    end: throughWall.end,
    thickness: throughWall.thickness,
    locationLine: throughWall.locationLine,
  });

  const throughDir = throughFootprint.direction;
  const throughNormal = throughFootprint.normal; // Vers l'extérieur (+n)

  // Vecteur d'approche du mur secondaire vers le mur traversant
  const stemAxisVec = sub(stemWall.end, stemWall.start);
  const stemDir = normalize(stemAxisVec);
  const approachDir = stemEnd === 'end' ? stemDir : mul(stemDir, -1);

  // Déterminer quelle face du mur traversant est frappée par le mur secondaire
  const approachDot = dot(approachDir, throughNormal);
  const hitFace: 'exterior' | 'interior' = approachDot > 0 ? 'interior' : 'exterior';

  // Ligne infinie de la face ciblée
  const faceOrigin =
    hitFace === 'exterior'
      ? throughFootprint.exteriorFace.start
      : throughFootprint.interiorFace.start;
  const targetFaceLine = line2(faceOrigin, throughDir);

  // 2. Lignes de bordure latérale du mur secondaire
  const stemBoundary = getWallBoundaryAtEnd(stemWall, stemEnd, connectionPoint);

  const leftInter = intersectLines(stemBoundary.leftLine, targetFaceLine);
  const rightInter = intersectLines(stemBoundary.rightLine, targetFaceLine);

  let pLeft: Vec2;
  let pRight: Vec2;

  if (leftInter.type === 'point') {
    pLeft = leftInter.point;
  } else {
    // Repli de secours : projection orthogonale
    pLeft = add(connectionPoint, mul(stemBoundary.leftNormal, stemBoundary.leftOffset));
  }

  if (rightInter.type === 'point') {
    pRight = rightInter.point;
  } else {
    pRight = add(connectionPoint, mul(stemBoundary.leftNormal, -stemBoundary.rightOffset));
  }

  return {
    stemWallId: stemWall.id,
    stemEnd,
    throughWallId: throughWall.id,
    vertices: [pRight, pLeft],
    hitFace,
  };
}
