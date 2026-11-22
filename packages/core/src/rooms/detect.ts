import { isDraft, original, type Draft } from 'immer';
import { type BimState, type ElementId, type Room, type Wall } from '../types.js';
import { getOrBuildWallResolutionIndex } from '../walls/index-cache.js';
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

export interface DetectRoomsOptions {
  /**
   * Boîte englobante 2D (mm) pour restreindre l'analyse à une zone spatiale locale (ADR-014).
   * Seuls les murs intersectant cette boîte et les pièces dont le seed est à l'intérieur sont traités.
   */
  readonly boundingBox?: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  };
  /**
   * Indique qu'aucun mur n'a été ajouté au modèle dans cette transaction (ex: MoveWall, UpdateWall).
   * Évite l'énumération coûteuse des clés du draft Immer sur 10k entités.
   */
  readonly noNewWalls?: boolean;
  /**
   * Identifiants des murs mutés dans le draft pour n'accéder aux proxies Immer que pour ceux-ci.
   */
  readonly modifiedWallIds?: ReadonlySet<ElementId>;
}

/**
 * Cache mémoïsé pur indexé par référence immuable d'état (WeakMap) et par niveau / boîte.
 * Évite les recalculs redondants de clipping de polygones à travers l'application
 * (StatusBar, Viewport2D, MetricsPanel, etc.) sans aucun couplage React.
 */
const roomsCache = new WeakMap<BimState, Map<string, DetectedRoom[]>>();

/**
 * Détecte l'ensemble des pièces fermées pour un niveau donné en calculant
 * l'union booléenne des empreintes 2D de tous ses murs.
 *
 * Règle d'or : Les pièces sont des éléments dérivés. Aucune géométrie n'est stockée dans BimDocument.
 */
export function detectRooms(
  state: BimState,
  levelId: ElementId,
  options?: DetectRoomsOptions,
): DetectedRoom[] {
  let levelMap = roomsCache.get(state);
  if (!levelMap) {
    levelMap = new Map<string, DetectedRoom[]>();
    roomsCache.set(state, levelMap);
  }

  const cacheKey = options?.boundingBox
    ? `${levelId}:${options.boundingBox.minX},${options.boundingBox.minY},${options.boundingBox.maxX},${options.boundingBox.maxY}`
    : levelId;

  const cached = levelMap.get(cacheKey);
  if (cached) {
    return cached;
  }

  const detectedRooms = computeDetectRooms(state, levelId, options);
  levelMap.set(cacheKey, detectedRooms);
  return detectedRooms;
}

function computeDetectRooms(
  state: BimState,
  levelId: ElementId,
  options?: DetectRoomsOptions,
): DetectedRoom[] {
  const boundingBox = options?.boundingBox;
  // 1. Filtrer les murs appartenant strictement au niveau architectural requis
  // Lecture optimisée évitant le réveil de 4 000 proxies Immer si state est un draft
  const isDraftState = isDraft(state);
  const base = (isDraftState ? (original((state as unknown) as Draft<BimState>) ?? state) : state) as BimState;
  const levelWalls: Wall[] = [];

  const index = getOrBuildWallResolutionIndex(base);
  const baseLevelWalls = index.wallsByLevelId.get(levelId) ?? [];

  for (let i = 0; i < baseLevelWalls.length; i++) {
    const baseW = baseLevelWalls[i];
    if (!baseW) continue;

    // Filtrage spatial en amont sur l'objet brut sans réveiller le proxy Immer (ADR-014)
    if (boundingBox) {
      const minX = baseW.start.x < baseW.end.x ? baseW.start.x : baseW.end.x;
      const maxX = baseW.start.x < baseW.end.x ? baseW.end.x : baseW.start.x;
      const minY = baseW.start.y < baseW.end.y ? baseW.start.y : baseW.end.y;
      const maxY = baseW.start.y < baseW.end.y ? baseW.end.y : baseW.start.y;
      if (
        maxX < boundingBox.minX ||
        minX > boundingBox.maxX ||
        maxY < boundingBox.minY ||
        minY > boundingBox.maxY ||
        (minX >= boundingBox.maxX - 50 && maxX > boundingBox.maxX + 50) ||
        (maxX <= boundingBox.minX + 50 && minX < boundingBox.minX - 50) ||
        (minY >= boundingBox.maxY - 50 && maxY > boundingBox.maxY + 50) ||
        (maxY <= boundingBox.minY + 50 && minY < boundingBox.minY - 50)
      ) {
        continue;
      }
    }

    let wall = baseW;
    if (isDraftState) {
      if (options?.modifiedWallIds) {
        if (options.modifiedWallIds.has(baseW.id)) {
          const draftW = state.walls[baseW.id];
          if (!draftW) continue;
          wall = draftW;
        }
      } else {
        const draftW = state.walls[baseW.id];
        if (!draftW) continue;
        wall = draftW;
      }
    }

    levelWalls.push(wall);
  }

  // Si de nouveaux murs ont été créés dans le draft (ex: AddWallCommand)
  if (!options?.noNewWalls && isDraftState && state.walls) {
    for (const wId in state.walls) {
      if (base.walls && !(wId in base.walls)) {
        const wall = state.walls[wId];
        if (wall && wall.levelId === levelId) {
          if (boundingBox) {
            const minX = Math.min(wall.start.x, wall.end.x);
            const maxX = Math.max(wall.start.x, wall.end.x);
            const minY = Math.min(wall.start.y, wall.end.y);
            const maxY = Math.max(wall.start.y, wall.end.y);
            if (
              maxX < boundingBox.minX ||
              minX > boundingBox.maxX ||
              maxY < boundingBox.minY ||
              minY > boundingBox.maxY
            ) {
              continue;
            }
          }
          levelWalls.push(wall);
        }
      }
    }
  }

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
  const existingRoomsOnLevel: Room[] = [];
  const baseRoomsOnLevel = index.roomsByLevelId.get(levelId) ?? [];
  for (let i = 0; i < baseRoomsOnLevel.length; i++) {
    const baseR = baseRoomsOnLevel[i];
    if (!baseR) continue;
    if (
      boundingBox &&
      (baseR.seed.x < boundingBox.minX ||
        baseR.seed.x > boundingBox.maxX ||
        baseR.seed.y < boundingBox.minY ||
        baseR.seed.y > boundingBox.maxY)
    ) {
      continue;
    }

    let room = baseR;
    if (isDraftState && state.rooms) {
      const draftR = state.rooms[baseR.id];
      if (!draftR) continue;
      room = draftR;
    }
    existingRoomsOnLevel.push(room);
  }
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
