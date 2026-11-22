import { segmentLength } from '@tabax/geometry';
import type { BimState, ElementId } from '../types.js';
import type { RuleViolation } from './types.js';
import { validateStairBlondel } from './stairs.js';

/**
 * Diagnostic métier non-bloquant de l'état documentaire complet (ADR-070).
 *
 * Exécute un audit passif sans modifier l'état documentaire et retourne la liste des
 * anomalies ou avertissements géométriques/métier préexistants dans la maquette.
 */
export function auditDocumentState(state: BimState): readonly RuleViolation[] {
  const issues: RuleViolation[] = [];

  // 1. Audit des Murs (murs de longueur résiduelle ou quasi nulle)
  for (const [id, wall] of Object.entries(state.walls ?? {})) {
    if (!wall.start || !wall.end) continue;
    const len = segmentLength(wall);
    if (len < 50) {
      issues.push({
        code: 'WALL_TOO_SHORT',
        message: `Le mur "${id}" a une longueur critique de ${Math.round(len)} mm (< 50 mm).`,
        offendingIds: [id],
        severity: 'warning',
        measurement: Math.round(len),
        threshold: 50,
      });
    }
  }

  // 2. Audit des Ouvertures hébergées (Portes et Fenêtres)
  const openingsByWall = new Map<
    ElementId,
    Array<{
      id: ElementId;
      kind: 'door' | 'window';
      s1: number;
      s2: number;
      width: number;
      wallLen: number;
    }>
  >();

  for (const [id, door] of Object.entries(state.doors ?? {})) {
    const wall = state.walls[door.hostWallId];
    if (!wall) continue;
    const wallLen = segmentLength(wall);
    const doorType = state.doorTypes[door.doorTypeId];
    const width = doorType?.width ?? 900;
    const s1 = door.offsetAlong;
    const s2 = s1 + width;

    let list = openingsByWall.get(door.hostWallId);
    if (!list) {
      list = [];
      openingsByWall.set(door.hostWallId, list);
    }
    list.push({ id, kind: 'door', s1, s2, width, wallLen });

    if (s2 > wallLen + 5) {
      issues.push({
        code: 'OPENING_OUT_OF_BOUNDS',
        message: `La porte "${id}" déborde de son mur hôte "${door.hostWallId}" (${Math.round(s2)} mm > ${Math.round(wallLen)} mm).`,
        offendingIds: [id, door.hostWallId],
        severity: 'warning',
        measurement: Math.round(s2),
        threshold: Math.round(wallLen),
      });
    }
  }

  for (const [id, win] of Object.entries(state.windows ?? {})) {
    const wall = state.walls[win.hostWallId];
    if (!wall) continue;
    const wallLen = segmentLength(wall);
    const winType = state.windowTypes[win.windowTypeId];
    const width = winType?.width ?? 1200;
    const s1 = win.offsetAlong;
    const s2 = s1 + width;

    let list = openingsByWall.get(win.hostWallId);
    if (!list) {
      list = [];
      openingsByWall.set(win.hostWallId, list);
    }
    list.push({ id, kind: 'window', s1, s2, width, wallLen });

    if (s2 > wallLen + 5) {
      issues.push({
        code: 'OPENING_OUT_OF_BOUNDS',
        message: `La fenêtre "${id}" déborde de son mur hôte "${win.hostWallId}" (${Math.round(s2)} mm > ${Math.round(wallLen)} mm).`,
        offendingIds: [id, win.hostWallId],
        severity: 'warning',
        measurement: Math.round(s2),
        threshold: Math.round(wallLen),
      });
    }
  }

  // Détection des chevauchements d'ouvertures sur un même mur
  for (const [wallId, openings] of openingsByWall.entries()) {
    for (let i = 0; i < openings.length; i++) {
      for (let j = i + 1; j < openings.length; j++) {
        const a = openings[i];
        const b = openings[j];
        if (!a || !b) continue;
        // Chevauchement si l'intervalle [s1, s2] intersecte
        const overlap = Math.min(a.s2, b.s2) - Math.max(a.s1, b.s1);
        if (overlap > 10) {
          issues.push({
            code: 'OPENING_OVERLAP',
            message: `Les ouvertures "${a.id}" et "${b.id}" se chevauchent sur le mur "${wallId}" (${Math.round(overlap)} mm de conflit).`,
            offendingIds: [a.id, b.id, wallId],
            severity: 'warning',
            measurement: Math.round(overlap),
          });
        }
      }
    }
  }

  // 3. Audit des Escaliers (formule de confort de Blondel : 590 <= 2h + g <= 660 mm)
  for (const [id, stair] of Object.entries(state.stairs ?? {})) {
    try {
      const res = validateStairBlondel(stair, state);
      if (!res.isCompliant) {
        issues.push({
          code: 'STAIR_BLONDEL_OUT_OF_RANGE',
          message: `L’escalier "${id}" présente des avertissements ergonomiques de Blondel : ${res.warnings.join(' ; ')}.`,
          offendingIds: [id],
          severity: 'warning',
        });
      }
    } catch {
      // Ignorer si les niveaux ou le type sont absents
    }
  }

  // 4. Audit des Pièces (pièces non délimitées ou aire nulle)
  for (const [id, room] of Object.entries(state.rooms ?? {})) {
    if (room.status === 'unenclosed' || (room.area !== undefined && room.area <= 0)) {
      issues.push({
        code: 'ROOM_UNENCLOSED',
        message: `La pièce "${room.name ?? id}" n’est pas complètement close par des murs ou sa surface est nulle.`,
        offendingIds: [id],
        severity: 'warning',
      });
    }
  }

  // 5. Audit des Cotations (cotes dont les références sont manquantes)
  for (const [id, dim] of Object.entries(state.dimensions ?? {})) {
    if (dim.references && dim.references.length > 0) {
      const missingRefs = dim.references.filter((refId) => !state.walls[refId]);
      if (missingRefs.length > 0) {
        issues.push({
          code: 'DIMENSION_ORPHAN_REFERENCE',
          message: `La cotation "${id}" référence des murs inexistants ou supprimés : ${missingRefs.join(', ')}.`,
          offendingIds: [id, ...missingRefs],
          severity: 'warning',
        });
      }
    }
  }

  return issues;
}
