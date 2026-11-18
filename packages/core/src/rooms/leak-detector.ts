import { type BimState, type ElementId } from '../types.js';
import {
  type Vec2,
  vec2,
  distance,
  segment2,
  intersectSegments,
  projectPointOnSegment,
  isPointInPolygon,
} from '@mini-bim/geometry';
import { detectRooms } from './detect.js';

export interface LeakGap {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly distanceMm: number;
  readonly wallId1?: ElementId;
  readonly wallId2?: ElementId;
}

export type RoomLeakKind = 'unclosed_boundary' | 'redundant' | 'isolated';

export interface RoomLeakDiagnostic {
  readonly roomId: ElementId;
  readonly roomName: string;
  readonly seed: Vec2;
  readonly kind: RoomLeakKind;
  readonly leakPoint?: Vec2;
  readonly leakGap?: LeakGap;
  readonly message: string;
}

/**
 * Tolérance d'accrochage nominale pour considérer une extrémité comme connectée.
 */
const JUNCTION_TOLERANCE_MM = 5.0;

/**
 * Distance maximale de recherche d'une brèche locale (1.5 mètre).
 */
const MAX_LEAK_GAP_DISTANCE_MM = 1500;

/**
 * Vérifie si le segment reliant p1 à p2 coupe le corps d'un mur (hors extrémités).
 */
function isLineBlockedByWalls(
  p1: Vec2,
  p2: Vec2,
  walls: readonly { start: Vec2; end: Vec2 }[],
): boolean {
  const lineSeg = segment2(p1, p2);
  for (const w of walls) {
    const wSeg = segment2(w.start, w.end);
    const inter = intersectSegments(lineSeg, wSeg);
    if (inter.type === 'point' && inter.t > 0.05 && inter.t < 0.95 && inter.u > 0.05 && inter.u < 0.95) {
      return true;
    }
  }
  return false;
}

/**
 * Analyse l'état des pièces d'un niveau et diagnostique les éventuelles fuites
 * ou absences de délimitation fermée.
 *
 * @param state État documentaire BIM complet
 * @param levelId Niveau architectural analysé
 * @returns Liste des anomalies de fermeture détectées pour chaque pièce non enclose
 */
export function diagnoseRoomLeaks(state: BimState, levelId: ElementId): RoomLeakDiagnostic[] {
  const roomsOnLevel = Object.values(state.rooms ?? {}).filter((r) => r.levelId === levelId);
  if (roomsOnLevel.length === 0) {
    return [];
  }

  const levelWalls = Object.values(state.walls ?? {}).filter((w) => w.levelId === levelId);
  const detected = detectRooms(state, levelId);
  const diagnostics: RoomLeakDiagnostic[] = [];

  // Identifier quelles pièces ont été appariées à un espace clos
  const claimedRoomIds = new Set<ElementId>();
  for (const det of detected) {
    if (det.existingRoomId) {
      claimedRoomIds.add(det.existingRoomId);
    }
  }

  // 1. Détection des extrémités libres (dead ends) de tous les murs du niveau
  const wallEndpoints: { wallId: ElementId; point: Vec2; end: 'start' | 'end' }[] = [];
  for (const w of levelWalls) {
    wallEndpoints.push({ wallId: w.id, point: w.start, end: 'start' });
    wallEndpoints.push({ wallId: w.id, point: w.end, end: 'end' });
  }

  const freeEndpoints: typeof wallEndpoints = [];

  for (const ep of wallEndpoints) {
    let isConnected = false;

    // A. Connexion en coin (L-junction) avec une extrémité d'un autre mur
    for (const otherEp of wallEndpoints) {
      if (otherEp.wallId === ep.wallId) continue;
      if (distance(ep.point, otherEp.point) <= JUNCTION_TOLERANCE_MM) {
        isConnected = true;
        break;
      }
    }

    if (isConnected) continue;

    // B. Connexion en T (aboutement sur l'axe d'un mur traversant)
    for (const otherWall of levelWalls) {
      if (otherWall.id === ep.wallId) continue;
      const type = state.wallTypes[otherWall.typeId];
      const thickness = type?.thickness ?? 200;
      const seg = segment2(otherWall.start, otherWall.end);
      const proj = projectPointOnSegment(ep.point, seg);

      if (proj.t > 0 && proj.t < 1) {
        const distToAxis = distance(ep.point, proj.point);
        if (distToAxis <= thickness / 2 + JUNCTION_TOLERANCE_MM) {
          isConnected = true;
          break;
        }
      }
    }

    if (!isConnected) {
      freeEndpoints.push(ep);
    }
  }

  // 2. Construction de toutes les brèches candidates (gaps)
  const candidateGaps: LeakGap[] = [];

  // Gaps entre deux extrémités libres proches
  for (let i = 0; i < freeEndpoints.length; i++) {
    for (let j = i + 1; j < freeEndpoints.length; j++) {
      const ep1 = freeEndpoints[i];
      const ep2 = freeEndpoints[j];
      if (!ep1 || !ep2) continue;
      if (ep1.wallId === ep2.wallId) continue;

      const d = distance(ep1.point, ep2.point);
      if (d <= MAX_LEAK_GAP_DISTANCE_MM) {
        candidateGaps.push({
          start: ep1.point,
          end: ep2.point,
          distanceMm: Number(d.toFixed(1)),
          wallId1: ep1.wallId,
          wallId2: ep2.wallId,
        });
      }
    }
  }

  // Gaps entre une extrémité libre et le mur le plus proche (T-junction manquée)
  for (const ep of freeEndpoints) {
    let closestWall: typeof levelWalls[0] | undefined;
    let closestProjPt: Vec2 | undefined;
    let minGapDist = Infinity;

    for (const w of levelWalls) {
      if (w.id === ep.wallId) continue;
      const seg = segment2(w.start, w.end);
      const proj = projectPointOnSegment(ep.point, seg);
      const type = state.wallTypes[w.typeId];
      const halfT = (type?.thickness ?? 200) / 2;

      if (proj.t > 0.02 && proj.t < 0.98) {
        const d = distance(ep.point, proj.point);
        const gapDist = d - halfT;
        if (gapDist > JUNCTION_TOLERANCE_MM && gapDist < minGapDist && gapDist <= MAX_LEAK_GAP_DISTANCE_MM) {
          minGapDist = gapDist;
          closestWall = w;
          closestProjPt = proj.point;
        }
      }
    }

    if (closestWall && closestProjPt && minGapDist < Infinity) {
      candidateGaps.push({
        start: ep.point,
        end: closestProjPt,
        distanceMm: Number(minGapDist.toFixed(1)),
        wallId1: ep.wallId,
        wallId2: closestWall.id,
      });
    }
  }

  // 3. Traiter chaque pièce non enclose
  for (const room of roomsOnLevel) {
    if (claimedRoomIds.has(room.id)) {
      continue; // Pièce parfaitement fermée
    }

    // Vérifier si la pièce se trouve dans un trou déjà revendiqué par une autre pièce
    let isRedundant = false;
    let claimingRoomName = '';
    for (const det of detected) {
      if (isPointInPolygon(room.seed, det.polygon)) {
        isRedundant = true;
        const otherRoom = det.existingRoomId ? state.rooms[det.existingRoomId] : undefined;
        claimingRoomName = otherRoom?.name ?? 'une autre pièce';
        break;
      }
    }

    if (isRedundant) {
      diagnostics.push({
        roomId: room.id,
        roomName: room.name ?? 'Pièce sans nom',
        seed: room.seed,
        kind: 'redundant',
        message: `Pièce redondante : partage le même espace clos avec ${claimingRoomName}.`,
      });
      continue;
    }

    // La pièce fuit vers l'extérieur : rechercher la brèche la plus pertinente
    if (candidateGaps.length === 0) {
      diagnostics.push({
        roomId: room.id,
        roomName: room.name ?? 'Pièce sans nom',
        seed: room.seed,
        kind: 'isolated',
        message: 'Pièce non délimitée : aucun mur de clôture fermé détecté dans ce secteur.',
      });
      continue;
    }

    // Trouver la brèche la plus proche dont le milieu est accessible depuis le seed
    let bestGap: LeakGap | undefined;
    let minScore = Infinity;

    for (const gap of candidateGaps) {
      const mid = vec2((gap.start.x + gap.end.x) / 2, (gap.start.y + gap.end.y) / 2);
      const dFromSeed = distance(room.seed, mid);
      const isBlocked = isLineBlockedByWalls(room.seed, mid, levelWalls);

      // Favoriser les brèches locales réelles (petits gaps) et pénaliser les franchissements de murs
      const baseScore = dFromSeed + gap.distanceMm * 2;
      const score = isBlocked ? baseScore * 5 : baseScore;

      if (score < minScore) {
        minScore = score;
        bestGap = gap;
      }
    }

    if (bestGap) {
      const mid = vec2((bestGap.start.x + bestGap.end.x) / 2, (bestGap.start.y + bestGap.end.y) / 2);
      diagnostics.push({
        roomId: room.id,
        roomName: room.name ?? 'Pièce sans nom',
        seed: room.seed,
        kind: 'unclosed_boundary',
        leakPoint: mid,
        leakGap: bestGap,
        message: `Fuite détectée : brèche de ${bestGap.distanceMm} mm délimitant cette pièce.`,
      });
    } else {
      diagnostics.push({
        roomId: room.id,
        roomName: room.name ?? 'Pièce sans nom',
        seed: room.seed,
        kind: 'isolated',
        message: 'Pièce non délimitée : les murs environnants ne forment pas de boucle fermée.',
      });
    }
  }

  return diagnostics;
}
