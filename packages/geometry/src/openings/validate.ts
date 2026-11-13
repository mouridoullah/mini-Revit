import { GEOM_CONFIG, MIN_OPENING_CLEARANCE } from '../constants.js';
import { type OpeningInput, type OpeningValidationIssue } from './types.js';

export { MIN_OPENING_CLEARANCE };

/**
 * Valide géométriquement et dimensionnellement une ouverture isolée par rapport à son mur hôte.
 *
 * Fonction pure sans effet de bord.
 *
 * @param opening Paramètres de l'ouverture
 * @param wallLength Longueur nominale du mur (mm)
 * @param wallHeight Hauteur nominale du mur (mm)
 * @param minClearance Garde minimale exigée aux extrémités (par défaut MIN_OPENING_CLEARANCE = 50 mm)
 * @returns Liste des anomalies détectées (vide si valide)
 */
export function validateOpening(
  opening: OpeningInput,
  wallLength: number,
  wallHeight: number,
  minClearance: number = MIN_OPENING_CLEARANCE,
): OpeningValidationIssue[] {
  const issues: OpeningValidationIssue[] = [];
  const eps = GEOM_CONFIG.EPSILON_NUMERICAL;

  // 1. Validation dimensionnelle de base
  if (
    !Number.isFinite(opening.width) ||
    opening.width <= 0 ||
    !Number.isFinite(opening.height) ||
    opening.height <= 0
  ) {
    issues.push({
      code: 'INVALID_DIMENSIONS',
      openingId: opening.id,
      message: `Dimensions d'ouverture invalides pour "${opening.id}" : largeur ${opening.width} mm, hauteur ${opening.height} mm (doivent être > 0)`,
    });
    return issues; // Impossible de poursuivre les validations spatiales si dimensions nulles/négatives
  }

  // 2. Vérification que l'ouverture ne sévère pas le mur
  if (opening.width >= wallLength) {
    issues.push({
      code: 'SEVERS_WALL',
      openingId: opening.id,
      message: `L'ouverture "${opening.id}" sévère le mur : largeur (${opening.width} mm) >= longueur du mur (${wallLength} mm)`,
    });
    return issues;
  }

  if (wallLength < opening.width + 2 * minClearance) {
    issues.push({
      code: 'SEVERS_WALL',
      openingId: opening.id,
      message: `Mur trop court (${wallLength} mm) pour accueillir l'ouverture "${opening.id}" (${opening.width} mm) avec la garde minimale de ${minClearance} mm aux deux extrémités`,
    });
    return issues;
  }

  // 3. Positionnement longitudinal le long de l'axe (u)
  const uStart = opening.u - opening.width / 2;
  const uEnd = opening.u + opening.width / 2;

  if (uStart < minClearance - eps) {
    issues.push({
      code: 'OUT_OF_WALL_BOUNDS',
      openingId: opening.id,
      message: `Débordement de l'ouverture "${opening.id}" au début du mur : position de début (${uStart.toFixed(2)} mm) < garde minimale (${minClearance} mm)`,
    });
  }

  if (uEnd > wallLength - minClearance + eps) {
    issues.push({
      code: 'OUT_OF_WALL_BOUNDS',
      openingId: opening.id,
      message: `Débordement de l'ouverture "${opening.id}" en fin de mur : position de fin (${uEnd.toFixed(2)} mm) > limite permise (${(wallLength - minClearance).toFixed(2)} mm)`,
    });
  }

  // 4. Altitudes et hauteurs (allège et linteau)
  if (opening.sillZ < -eps) {
    issues.push({
      code: 'HEIGHT_EXCEEDS_WALL',
      openingId: opening.id,
      message: `Hauteur d'allège négative invalide pour "${opening.id}" : ${opening.sillZ} mm`,
    });
  }

  const lintelZ = opening.sillZ + opening.height;
  if (lintelZ > wallHeight + eps) {
    issues.push({
      code: 'HEIGHT_EXCEEDS_WALL',
      openingId: opening.id,
      message: `Le linteau de l'ouverture "${opening.id}" (${lintelZ.toFixed(2)} mm) dépasse la hauteur du mur (${wallHeight} mm)`,
    });
  }

  return issues;
}

/**
 * Valide une collection d'ouvertures sur un même mur hôte, incluant les détections de collisions
 * et de trumeaux minimaux entre baies successives.
 *
 * @param openings Liste des ouvertures
 * @param wallLength Longueur nominale du mur (mm)
 * @param wallHeight Hauteur nominale du mur (mm)
 * @param minClearance Garde minimale (mm, par défaut 50 mm)
 */
export function validateOpenings(
  openings: readonly OpeningInput[],
  wallLength: number,
  wallHeight: number,
  minClearance: number = MIN_OPENING_CLEARANCE,
): OpeningValidationIssue[] {
  const issues: OpeningValidationIssue[] = [];
  const eps = GEOM_CONFIG.EPSILON_NUMERICAL;

  // Validation individuelle
  for (const op of openings) {
    const singleIssues = validateOpening(op, wallLength, wallHeight, minClearance);
    issues.push(...singleIssues);
  }

  if (openings.length < 2) {
    return issues;
  }

  // Tri par position uStart croissant
  const sorted = [...openings].sort((a, b) => a.u - a.width / 2 - (b.u - b.width / 2));

  // Vérification des collisions et trumeaux
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (!cur || !next) continue;

    const curEnd = cur.u + cur.width / 2;
    const nextStart = next.u - next.width / 2;

    if (nextStart < curEnd - eps) {
      issues.push({
        code: 'OPENING_OVERLAP',
        openingIds: [cur.id, next.id],
        message: `Chevauchement entre l'ouverture "${cur.id}" (fin à ${curEnd.toFixed(2)} mm) et "${next.id}" (début à ${nextStart.toFixed(2)} mm)`,
      });
    } else if (nextStart < curEnd + minClearance - eps) {
      issues.push({
        code: 'OPENING_CLEARANCE_BETWEEN',
        openingIds: [cur.id, next.id],
        message: `Trumeau insuffisant (${(nextStart - curEnd).toFixed(2)} mm) entre les ouvertures "${cur.id}" et "${next.id}" (minimum requis : ${minClearance} mm)`,
      });
    }
  }

  return issues;
}

/**
 * Lève une exception explicite si les ouvertures violent les contraintes géométriques du mur.
 */
export function assertValidOpenings(
  openings: readonly OpeningInput[],
  wallLength: number,
  wallHeight: number,
  minClearance: number = MIN_OPENING_CLEARANCE,
): void {
  const issues = validateOpenings(openings, wallLength, wallHeight, minClearance);
  const first = issues[0];
  if (first) {
    throw new RangeError(`[${first.code}] ${first.message}`);
  }
}
