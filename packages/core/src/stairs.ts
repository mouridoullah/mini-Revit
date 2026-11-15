import { vec2, type Vec2 } from '@mini-bim/geometry';
import type { BimState, Stair, StairType, ElementId } from './types.js';

/**
 * Géométrie calculée d'un escalier droit paramétrique.
 */
export interface StairGeometry {
  readonly numberOfSteps: number; // N (nombre de contremarches)
  readonly stepHeight: number; // h en mm
  readonly stepDepth: number; // g en mm (giron)
  readonly totalRise: number; // ΔZ en mm
  readonly totalRun: number; // L en mm
  readonly direction: Vec2; // Vecteur directeur unitaire orienté vers le haut (start -> end)
  readonly isCompliant: boolean; // Conforme à la formule de Blondel (plage de confort)
  readonly warnings: readonly string[];
}

/**
 * Calcule la géométrie paramétrique complète d'un escalier droit.
 * Conforme à ADR-048 (§3 et D3).
 */
export function computeStairGeometry(stair: Stair, state: BimState): StairGeometry {
  const bottomLevel = state.levels[stair.bottomLevelId];
  const topLevel = state.levels[stair.topLevelId];

  const bottomElev = bottomLevel?.elevation ?? 0;
  const topElev = topLevel?.elevation ?? bottomElev + 2800;
  const totalRise = Math.max(1, topElev - bottomElev);

  // 1. Nombre de contremarches N = clamp(round(ΔZ / 175), 3, 30)
  const numberOfSteps = Math.min(30, Math.max(3, Math.round(totalRise / 175)));
  const stepHeight = totalRise / numberOfSteps;

  // 2. Reculement horizontal L et direction
  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const totalRun = Math.hypot(dx, dy);
  const direction = totalRun > 1e-4 ? vec2(dx / totalRun, dy / totalRun) : vec2(1, 0);

  const stepDepth = totalRun > 0 ? totalRun / numberOfSteps : 280;

  // 3. Formule de Blondel : M = 2h + g
  const blondel = 2 * stepHeight + stepDepth;
  const warnings: string[] = [];

  const isComfort =
    blondel >= 600 &&
    blondel <= 640 &&
    stepHeight >= 160 &&
    stepHeight <= 190 &&
    stepDepth >= 250 &&
    stepDepth <= 320;

  if (blondel < 560 || blondel > 680) {
    warnings.push(
      `STAIR_BLONDEL_OUT_OF_SAFETY: Le pas de foulée (${blondel.toFixed(1)} mm) est hors de la plage réglementaire de sécurité [560, 680] mm.`,
    );
  } else if (blondel < 600 || blondel > 640) {
    warnings.push(
      `STAIR_BLONDEL_OUT_OF_COMFORT: Le pas de foulée (${blondel.toFixed(1)} mm) dévie de la plage optimale de confort [600, 640] mm.`,
    );
  }

  if (stepHeight < 160 || stepHeight > 190) {
    warnings.push(
      `STAIR_STEP_HEIGHT_WARNING: La hauteur de contremarche (${stepHeight.toFixed(1)} mm) est hors de la plage recommandée [160, 190] mm.`,
    );
  }

  if (stepDepth < 250 || stepDepth > 320) {
    warnings.push(
      `STAIR_STEP_DEPTH_WARNING: Le giron (${stepDepth.toFixed(1)} mm) est hors de la plage recommandée [250, 320] mm.`,
    );
  }

  return {
    numberOfSteps,
    stepHeight,
    stepDepth,
    totalRise,
    totalRun,
    direction,
    isCompliant: isComfort,
    warnings,
  };
}

/**
 * Calcule l'indice de marche k (0 <= k <= N) à partir duquel l'échappée libre devient insuffisante
 * sous la dalle supérieure (hauteur libre < minHeadroom, nominalement 2000 mm).
 *
 * Sous la dalle d'étage d'arase inférieure Z_inf = Z_top - slabThickness,
 * l'échappée libre au droit de la marche k (d'élévation Z_bottom + k * stepHeight) est :
 *   H(k) = (Z_top - slabThickness) - (Z_bottom + k * stepHeight) = totalRise - slabThickness - k * stepHeight
 *
 * L'indice de rupture k* (cutoff) correspond au premier indice k tel que H(k) < minHeadroom :
 *   k * stepHeight > totalRise - slabThickness - minHeadroom
 *
 * À partir de cette marche k*, la dalle supérieure DOIT être découpée pour garantir le gabarit de passage.
 */
export function computeHeadroomCutoffStep(
  geom: StairGeometry,
  minHeadroom: number = 2000,
  slabThickness: number = 200,
): number {
  const maxClearance = geom.totalRise - slabThickness - minHeadroom;
  if (maxClearance <= 0) {
    // Même au pied de l'escalier (k = 0), l'échappée est insuffisante -> trémie dès le départ
    return 0;
  }

  const exactK = maxClearance / geom.stepHeight;
  // Premier entier k où H(k) < minHeadroom (strictement inférieur) :
  // Si exactK est entier (H(k) == minHeadroom), cutoff = exactK + 1.
  // Si exactK n'est pas entier, cutoff = ceil(exactK) = floor(exactK) + 1.
  const cutoffK = Math.floor(exactK) + 1;
  return Math.min(geom.numberOfSteps, Math.max(0, cutoffK));
}

export interface StairShaftOptions {
  readonly minHeadroom?: number;
  readonly slabThickness?: number;
  readonly useHeadroomCutoff?: boolean;
}

/**
 * Dérive l'emprise polygonale (rectangle en coordonnées monde mm) de la trémie d'escalier
 * projetée sur le niveau supérieur (topLevel).
 * Règle d'or ADR-048 (D5) : La trémie n'est jamais stockée dans slab.holes.
 */
export function computeStairShaft(
  stair: Stair,
  state: BimState,
  options?: StairShaftOptions,
): readonly Vec2[] {
  const stairType: StairType | undefined = state.stairTypes?.[stair.stairTypeId];
  const nominalWidth = stair.widthOverride ?? stairType?.width ?? 900;

  // Dégagements prescrits par ADR-048 D5 :
  // +50 mm de chaque côté (main courante) = +100 mm au total sur la largeur
  // +100 mm de dégagement aux extrémités (pied et tête)
  const shaftWidth = nominalWidth + 2 * 50;
  const halfWidth = shaftWidth / 2;
  const endExtension = 100;

  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const len = Math.hypot(dx, dy);
  const u = len > 1e-4 ? vec2(dx / len, dy / len) : vec2(1, 0);
  const n = vec2(-u.y, u.x); // Normal unitaire

  let pStart: Vec2;
  if (options?.useHeadroomCutoff) {
    const geom = computeStairGeometry(stair, state);
    const cutoffStep = computeHeadroomCutoffStep(
      geom,
      options.minHeadroom ?? 2000,
      options.slabThickness ?? 200,
    );
    const shaftStartDistance = Math.max(0, cutoffStep * geom.stepDepth - endExtension);
    pStart = vec2(stair.start.x + u.x * shaftStartDistance, stair.start.y + u.y * shaftStartDistance);
  } else {
    pStart = vec2(stair.start.x - u.x * endExtension, stair.start.y - u.y * endExtension);
  }

  const pEnd = vec2(stair.end.x + u.x * endExtension, stair.end.y + u.y * endExtension);

  // 4 coins du rectangle orienté en ordre trigonométrique (CCW)
  return [
    vec2(pStart.x - n.x * halfWidth, pStart.y - n.y * halfWidth),
    vec2(pEnd.x - n.x * halfWidth, pEnd.y - n.y * halfWidth),
    vec2(pEnd.x + n.x * halfWidth, pEnd.y + n.y * halfWidth),
    vec2(pStart.x + n.x * halfWidth, pStart.y + n.y * halfWidth),
  ];
}

/**
 * Calcule l'échappée minimale sous plafond/dalle au droit de l'escalier (en mm).
 * Exigence minimale réglementaire : 2000 mm.
 */
export function computeHeadroom(stair: Stair, state: BimState): number {
  const geom = computeStairGeometry(stair, state);
  const topLevel = state.levels[stair.topLevelId];
  const topElev = topLevel?.elevation ?? geom.totalRise;

  // Estimation de l'arase inférieure de la dalle haute (épaisseur nominale 200 mm)
  const slabSoffitElev = topElev - 200;

  // Hauteur minimale entre les marches et l'arase de trémie
  // Pour la dernière marche sous dalle (à l'amorce de la trémie)
  const criticalStepHeight = geom.stepHeight * Math.max(1, geom.numberOfSteps - 3);
  const headroom = slabSoffitElev - criticalStepHeight;

  return Math.max(0, headroom);
}
