import { type BimState, type ElementId, type Room } from '../types.js';
import {
  type Vec2,
  computeWallFootprint2d,
  unionPolygonFootprints,
  isPointInPolygon,
  computePolylabel,
  signedArea,
  perimeter,
} from '@mini-bim/geometry';

/**
 * Représentation géométrique d'une pièce calculée à la demande.
 * Résulte de l'analyse topologique des trous formés par l'union des emprises de murs.
 */
export interface DetectedRoom {
  /**
   * Contour extérieur de la pièce orienté dans le sens trigonométrique anti-horaire (CCW).
   */
  readonly polygon: Vec2[];

  /**
   * Éventuels îlots intérieurs (ex. poteaux isolés ou voiles centraux).
   */
  readonly holes?: readonly Vec2[][];

  /**
   * Surface utile intérieure nette (mm²).
   */
  readonly areaMm2: number;

  /**
   * Périmètre intérieur total (mm).
   */
  readonly perimeterMm: number;

  /**
   * Point de repère central de la pièce (seed du Room existant ou polylabel calculé).
   */
  readonly seed: Vec2;

  /**
   * Identifiant de l'entité Room associée si présente dans le document.
   */
  readonly existingRoomId?: ElementId;
}

/**
 * Cache mémoïsé pur indexé par référence immuable d'état (WeakMap) et par niveau.
 * Évite les recalculs redondants de clipping de polygones à travers l'application
 * (StatusBar, Viewport2D, MetricsPanel, etc.) sans aucun couplage React.
 */
const roomsCache = new WeakMap<BimState, Map<ElementId, DetectedRoom[]>>();

/**
 * Détecte l'ensemble des pièces fermées pour un niveau donné en calculant
 * l'union booléenne des empreintes 2D de tous ses murs.
 *
 * Règle d'or : Les pièces sont des éléments dérivés. Aucune géométrie n'est stockée dans BimDocument.
 */
export function detectRooms(state: BimState, levelId: ElementId): DetectedRoom[] {
  let levelMap = roomsCache.get(state);
  if (!levelMap) {
    levelMap = new Map<ElementId, DetectedRoom[]>();
    roomsCache.set(state, levelMap);
  }

  const cached = levelMap.get(levelId);
  if (cached) {
    return cached;
  }

  const detectedRooms = computeDetectRooms(state, levelId);
  levelMap.set(levelId, detectedRooms);
  return detectedRooms;
}

function computeDetectRooms(state: BimState, levelId: ElementId): DetectedRoom[] {
  // 1. Filtrer les murs appartenant strictement au niveau architectural requis
  const levelWalls = Object.values(state.walls).filter((w) => w.levelId === levelId);
  if (levelWalls.length < 3) {
    return [];
  }

  // 2. Extraire les empreintes rectangulaires 2D de tous les murs
  const footprints: Vec2[][] = [];
  for (const wall of levelWalls) {
    const wallType = state.wallTypes[wall.typeId];
    if (!wallType) continue;

    const fp = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness: wallType.thickness,
      locationLine: 'center',
    });
    footprints.push([...fp.vertices]);
  }

  // 3. Union booléenne des empreintes
  const unionResult = unionPolygonFootprints(footprints);
  if (unionResult.length === 0) {
    return [];
  }

  // 4. Extraire tous les trous (espaces intérieurs clos formés par les murs périphériques)
  const candidateHoles: Vec2[][] = [];
  for (const poly of unionResult) {
    for (const hole of poly.holes) {
      if (hole.length >= 3) {
        candidateHoles.push(hole);
      }
    }
  }

  if (candidateHoles.length === 0) {
    return [];
  }

  // 5. Associer les trous aux Rooms déclarées sur ce niveau
  const existingRoomsOnLevel = Object.values(state.rooms ?? {}).filter(
    (r) => r.levelId === levelId,
  );
  const claimedRoomIds = new Set<ElementId>();

  const detectedRooms: DetectedRoom[] = [];

  for (const hole of candidateHoles) {
    // Vérifier les éventuels îlots intérieurs (poteaux / murs isolés au centre de la pièce)
    const islands: Vec2[][] = [];
    for (const otherPoly of unionResult) {
      const firstOuterPt = otherPoly.outer[0];
      if (otherPoly.outer.length >= 3 && firstOuterPt && isPointInPolygon(firstOuterPt, hole)) {
        islands.push(otherPoly.outer);
      }
    }

    // Calcul de l'aire nette (aire du trou moins aire des îlots)
    const grossAreaMm2 = Math.abs(signedArea(hole));
    const islandAreaMm2 = islands.reduce((sum, isl) => sum + Math.abs(signedArea(isl)), 0);
    const areaMm2 = Math.max(0, grossAreaMm2 - islandAreaMm2);

    // Calcul du périmètre intérieur (périmètre du trou + périmètre des îlots)
    const perimeterMm = perimeter(hole) + islands.reduce((sum, isl) => sum + perimeter(isl), 0);

    // Recherche de la Room déclarée dont le seed se trouve à l'intérieur du trou
    let matchedRoom: Room | undefined;
    for (const room of existingRoomsOnLevel) {
      if (
        !claimedRoomIds.has(room.id) &&
        isPointInPolygon(room.seed, hole) &&
        !islands.some((isl) => isPointInPolygon(room.seed, isl))
      ) {
        matchedRoom = room;
        claimedRoomIds.add(room.id);
        break;
      }
    }

    const seed = matchedRoom
      ? matchedRoom.seed
      : computePolylabel(hole, islands.length > 0 ? islands : undefined);

    detectedRooms.push({
      polygon: hole,
      ...(islands.length > 0 ? { holes: islands } : {}),
      areaMm2,
      perimeterMm,
      seed,
      ...(matchedRoom ? { existingRoomId: matchedRoom.id } : {}),
    });
  }

  return detectedRooms;
}
