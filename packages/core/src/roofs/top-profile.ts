import { type Vec2, vec2 } from '@mini-bim/geometry';
import { type BimState, type Wall, type Roof, type GableRoofType } from '../types.js';

/**
 * Détermine si un point 2D est à l'intérieur d'un polygone (Ray-casting).
 */
function isPointInPolygon(pt: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  const len = poly.length;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    const intersect =
      pi.y > pt.y !== pj.y > pt.y &&
      pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Détermine si un mur est couvert (au moins partiellement) par une toiture.
 */
export function isWallCoveredByRoof(wall: Wall, roof: Roof): boolean {
  const footprint = roof.footprint;
  if (!footprint || footprint.length < 3) return false;

  // 1. Test rapide sur Bounding Box
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const wallMinX = Math.min(wall.start.x, wall.end.x);
  const wallMaxX = Math.max(wall.start.x, wall.end.x);
  const wallMinY = Math.min(wall.start.y, wall.end.y);
  const wallMaxY = Math.max(wall.start.y, wall.end.y);

  const tol = 10; // tolérance de 10 mm
  if (
    wallMaxX < minX - tol ||
    wallMinX > maxX + tol ||
    wallMaxY < minY - tol ||
    wallMinY > maxY + tol
  ) {
    return false;
  }

  // 2. Échantillonnage sur le segment du mur
  const mid = vec2((wall.start.x + wall.end.x) / 2, (wall.start.y + wall.end.y) / 2);
  if (
    isPointInPolygon(wall.start, footprint) ||
    isPointInPolygon(wall.end, footprint) ||
    isPointInPolygon(mid, footprint)
  ) {
    return true;
  }

  // Si le mur traverse le polygone sans que ses extrémités ne soient dedans
  return true;
}

/**
 * Calcule le profil d'arase supérieure polygonal (topProfile) d'un mur sous toiture (ADR-053 [D2 / 4.3]).
 *
 * Retourne une polyligne dans le repère 2D local du mur : (offsetAlong, zAbsolu) de u = 0 à u = L.
 *
 * Profils générés :
 * - Hors toiture : rectangle nominal [(0, zNominal), (L, zNominal)]
 * - Toit plat : rectangle [(0, zRoof), (L, zRoof)]
 * - Toit 2 pans, sous 1 pan (ou parallèle faîtage) : trapèze linéaire [(0, z0), (L, zL)]
 * - Toit 2 pans, traversant le faîtage (mur pignon) : chevron [(0, z0), (u_ridge, z_ridge), (L, zL)]
 */
export function computeWallTopProfile(
  wall: Wall,
  roof: Roof,
  state: BimState,
): Vec2[] {
  const wallType = state.wallTypes[wall.typeId];
  const defaultHeight = wallType?.height ?? 2800;
  const currentLevel = state.levels[wall.levelId];
  const zWallBase = (currentLevel?.elevation ?? 0) + (wall.baseOffset ?? 0);
  const nominalZTop = zWallBase + defaultHeight;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);

  // Cas dégénéré : mur de longueur nulle
  if (wallLength <= 1e-4) {
    return [vec2(0, nominalZTop), vec2(0, nominalZTop)];
  }

  // Vérifier si le mur est situé sous l'emprise de la toiture
  if (!isWallCoveredByRoof(wall, roof)) {
    return [vec2(0, nominalZTop), vec2(wallLength, nominalZTop)];
  }

  const roofLevel = state.levels[roof.levelId];
  const zRoofBase = (roofLevel?.elevation ?? 0) + (roof.baseOffset ?? 0);
  const roofType = state.roofTypes?.[roof.roofTypeId];

  // 1. Toiture plate (Flat)
  if (!roofType || roofType.family === 'flat') {
    const zTop = Math.max(zWallBase, zRoofBase);
    return [vec2(0, zTop), vec2(wallLength, zTop)];
  }

  // 2. Toiture à deux pans (Gable)
  const gableType = roofType as GableRoofType;
  const slopeDeg = roof.slopeOverrideDeg ?? gableType.slopeDeg ?? 35;
  const tanSlope = Math.tan((slopeDeg * Math.PI) / 180);

  const ridgeAxis = roof.ridgeAxis ?? {
    start: vec2(0, 0),
    end: vec2(1000, 0),
  };

  const ridgeDx = ridgeAxis.end.x - ridgeAxis.start.x;
  const ridgeDy = ridgeAxis.end.y - ridgeAxis.start.y;
  const ridgeLen = Math.hypot(ridgeDx, ridgeDy);
  const uRidge = ridgeLen > 1e-5 ? vec2(ridgeDx / ridgeLen, ridgeDy / ridgeLen) : vec2(1, 0);

  // Normale unitaire perpendiculaire au faîtage
  const nRidge = vec2(-uRidge.y, uRidge.x);

  // Demi-portée maximale pour calculer l'arase du faîtage
  let maxHalfSpan = 0;
  for (const v of roof.footprint) {
    const sDist = (v.x - ridgeAxis.start.x) * nRidge.x + (v.y - ridgeAxis.start.y) * nRidge.y;
    maxHalfSpan = Math.max(maxHalfSpan, Math.abs(sDist));
  }
  if (maxHalfSpan < 10) {
    maxHalfSpan = 4000;
  }

  const totalRise = maxHalfSpan * tanSlope;
  const zRidge = zRoofBase + totalRise;

  // Calcul de la distance signée au faîtage aux extrémités du mur
  const s0 = (wall.start.x - ridgeAxis.start.x) * nRidge.x + (wall.start.y - ridgeAxis.start.y) * nRidge.y;
  const s1 = (wall.end.x - ridgeAxis.start.x) * nRidge.x + (wall.end.y - ridgeAxis.start.y) * nRidge.y;

  // Fonction locale pour évaluer l'altitude en un point le long du mur
  const evalZ = (sDist: number): number => {
    return Math.max(zWallBase, zRidge - Math.abs(sDist) * tanSlope);
  };

  const z0 = evalZ(s0);
  const z1 = evalZ(s1);

  // Déterminer si le mur traverse l'axe de faîtage (signes strictement opposés)
  if (s0 * s1 < -1e-5) {
    // Intersection avec l'axe de faîtage
    const denom = s0 - s1;
    const tCross = Math.abs(denom) > 1e-9 ? s0 / denom : 0.5;
    const uCross = Math.max(0, Math.min(wallLength, tCross * wallLength));

    // Profil en chevron (3 sommets : départ, faîte au pic, fin)
    return [
      vec2(0, z0),
      vec2(uCross, zRidge),
      vec2(wallLength, z1),
    ];
  }

  // Profil trapézoïdal linéaire (2 sommets)
  return [
    vec2(0, z0),
    vec2(wallLength, z1),
  ];
}
