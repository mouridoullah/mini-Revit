import {
  type BimState,
  type ElementId,
  type Wall,
  type WallType,
  type Opening,
  type Room,
  type Level,
} from './types.js';
import { type DetectedRoom, detectRooms } from './rooms/detect.js';
import { isPointInPolygon } from '@mini-bim/geometry';

/**
 * Métriques géométriques et quantitatives détaillées pour un mur hôte.
 */
export interface WallMetrics {
  readonly wallId: ElementId;
  readonly grossAreaMm2: number; // surface brute : longueur × hauteur (mm²)
  readonly netAreaMm2: number; // surface nette : brute - baies réservées (mm²)
  readonly lengthMm: number; // longueur axiale (mm)
  readonly volumeMm3: number; // volume solide : surface nette × épaisseur (mm³)
  readonly openings: {
    readonly doorIds: ElementId[];
    readonly windowIds: ElementId[];
    readonly totalOpeningAreaMm2: number;
  };
}

/**
 * Calcule les métriques surfaciques et volumiques d'un mur en déduisant
 * l'intégralité des ouvertures (portes et fenêtres) qui y sont hébergées.
 *
 * Règle d'or : Conservation stricte des surfaces (Net = Brut - Σ Baies).
 */
export function computeWallMetrics(
  wall: Wall,
  wallType: WallType,
  openings: readonly Opening[],
): WallMetrics {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthMm = Math.hypot(dx, dy);

  const heightMm = wall.heightOverride ?? wallType.height;
  const grossAreaMm2 = lengthMm * heightMm;

  // Filtrer les ouvertures hébergées par ce mur
  const hosted = openings.filter((op) => op.hostWallId === wall.id);
  const doorIds: ElementId[] = [];
  const windowIds: ElementId[] = [];
  let totalOpeningAreaMm2 = 0;

  for (const op of hosted) {
    if (op.kind === 'door') {
      doorIds.push(op.id);
    } else if (op.kind === 'window') {
      windowIds.push(op.id);
    }
    totalOpeningAreaMm2 += op.width * op.height;
  }

  const netAreaMm2 = Math.max(0, grossAreaMm2 - totalOpeningAreaMm2);
  const volumeMm3 = netAreaMm2 * wallType.thickness;

  return {
    wallId: wall.id,
    grossAreaMm2,
    netAreaMm2,
    lengthMm,
    volumeMm3,
    openings: {
      doorIds: doorIds.sort(),
      windowIds: windowIds.sort(),
      totalOpeningAreaMm2,
    },
  };
}

/**
 * Métriques surfaciques et spatiales d'une pièce architecturale.
 */
export interface RoomMetrics {
  readonly roomId: ElementId;
  readonly name: string;
  readonly areaMm2: number; // surface utile intérieure (mm²)
  readonly perimeterMm: number; // périmètre intérieur (mm)
  readonly volumeMm3: number; // volume spatial intérieur : surface × hauteur sous plafond (mm³)
}

/**
 * Calcule les métriques d'une pièce à partir de sa géométrie détectée et de la hauteur sous plafond.
 *
 * Règle de priorité pour la hauteur utilisée dans volume = area * height :
 * 1. `level.height` si explicité sur le niveau architectural (convention BIM / IfcBuildingStorey),
 * 2. sinon `fallbackHeightMm` (hauteur nominale des murs bordant la pièce : `wall.heightOverride` ou `wallType.height`),
 * 3. sinon 2800 mm par défaut.
 */
export function computeRoomMetrics(
  room: Room,
  detectedRoom: DetectedRoom,
  level?: Level,
  fallbackHeightMm: number = 2800,
): RoomMetrics {
  const heightMm = level?.height ?? fallbackHeightMm;
  const areaMm2 = detectedRoom.areaMm2;
  const perimeterMm = detectedRoom.perimeterMm;
  const volumeMm3 = areaMm2 * heightMm;

  return {
    roomId: room.id,
    name: room.name,
    areaMm2,
    perimeterMm,
    volumeMm3,
  };
}

/**
 * Synthèse globale des métrés pour un niveau architectural donné.
 */
export interface LevelMetrics {
  readonly levelId: ElementId;
  readonly walls: WallMetrics[];
  readonly rooms: RoomMetrics[];
  readonly totals: {
    readonly wallLinearM: number;
    readonly wallNetAreaM2: number;
    readonly wallVolumeM3: number;
    readonly doorCount: number;
    readonly windowCount: number;
    readonly roomAreaM2: number;
  };
}

/**
 * Calcule l'intégralité des métrés d'un niveau (linéaires de murs, surfaces nettes,
 * volumes, comptage des baies, surfaces de pièces et totaux agrégés).
 */
export function computeLevelMetrics(state: BimState, levelId: ElementId): LevelMetrics {
  const level = state.levels[levelId];
  const wallsOnLevel = Object.values(state.walls).filter((w) => w.levelId === levelId);

  const allOpenings: Opening[] = [
    ...Object.values(state.doors ?? {}),
    ...Object.values(state.windows ?? {}),
  ];

  // 1. Calcul des métriques de chaque mur
  const wallMetricsList: WallMetrics[] = [];
  let totalWallLinearMm = 0;
  let totalWallNetAreaMm2 = 0;
  let totalWallVolumeMm3 = 0;
  let doorCount = 0;
  let windowCount = 0;

  for (const wall of wallsOnLevel) {
    const wallType = state.wallTypes[wall.typeId];
    if (!wallType) continue;

    const m = computeWallMetrics(wall, wallType, allOpenings);
    wallMetricsList.push(m);

    totalWallLinearMm += m.lengthMm;
    totalWallNetAreaMm2 += m.netAreaMm2;
    totalWallVolumeMm3 += m.volumeMm3;
    doorCount += m.openings.doorIds.length;
    windowCount += m.openings.windowIds.length;
  }

  // 2. Détection des pièces du niveau
  const detectedRooms = detectRooms(state, levelId);
  const roomsOnLevel = Object.values(state.rooms ?? {}).filter((r) => r.levelId === levelId);

  // Hauteur de pièce : priorité 1 = level.height, priorité 2 = wallType.height / heightOverride, priorité 3 = 2800 mm
  const wallHeight =
    wallsOnLevel[0] && state.wallTypes[wallsOnLevel[0].typeId]
      ? (wallsOnLevel[0].heightOverride ?? state.wallTypes[wallsOnLevel[0].typeId]?.height ?? 2800)
      : 2800;
  const effectiveHeightMm = level?.height ?? wallHeight;

  const roomMetricsList: RoomMetrics[] = [];
  let totalRoomAreaMm2 = 0;

  // Associer chaque Room déclarée avec sa géométrie détectée
  const matchedDetectedIndices = new Set<number>();

  for (const room of roomsOnLevel) {
    let matchedIndex = detectedRooms.findIndex((d) => d.existingRoomId === room.id);
    if (matchedIndex === -1) {
      matchedIndex = detectedRooms.findIndex(
        (d, idx) => !matchedDetectedIndices.has(idx) && isPointInPolygon(room.seed, d.polygon),
      );
    }

    const detected = matchedIndex !== -1 ? detectedRooms[matchedIndex] : undefined;
    if (detected) {
      matchedDetectedIndices.add(matchedIndex);
      const rm = computeRoomMetrics(room, detected, level, effectiveHeightMm);
      roomMetricsList.push(rm);
      totalRoomAreaMm2 += rm.areaMm2;
    } else {
      // Room orpheline / non close (surface 0)
      roomMetricsList.push({
        roomId: room.id,
        name: `${room.name} (Non clos)`,
        areaMm2: 0,
        perimeterMm: 0,
        volumeMm3: 0,
      });
    }
  }

  // Traiter les pièces détectées qui n'ont pas encore de Room déclarée
  detectedRooms.forEach((det, idx) => {
    if (!matchedDetectedIndices.has(idx)) {
      const autoId = `detected_room_${idx + 1}`;
      const rm: RoomMetrics = {
        roomId: autoId,
        name: `Pièce ${idx + 1}`,
        areaMm2: det.areaMm2,
        perimeterMm: det.perimeterMm,
        volumeMm3: det.areaMm2 * effectiveHeightMm,
      };
      roomMetricsList.push(rm);
      totalRoomAreaMm2 += rm.areaMm2;
    }
  });

  return {
    levelId,
    walls: wallMetricsList,
    rooms: roomMetricsList,
    totals: {
      wallLinearM: Number((totalWallLinearMm / 1000).toFixed(3)),
      wallNetAreaM2: Number((totalWallNetAreaMm2 / 1e6).toFixed(3)),
      wallVolumeM3: Number((totalWallVolumeMm3 / 1e9).toFixed(3)),
      doorCount,
      windowCount,
      roomAreaM2: Number((totalRoomAreaMm2 / 1e6).toFixed(3)),
    },
  };
}
