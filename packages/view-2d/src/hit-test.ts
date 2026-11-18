import {
  type Vec2,
  vec2,
  distancePointToSegment,
  computeWallFootprint2d,
} from '@mini-bim/geometry';
import { type Transform2D } from './transform.js';
import { type DocumentFor2D, type WallFor2D, type WallTypeFor2D } from './types.js';

/**
 * Options de détection de clic (hit-testing) sur les éléments architecturaux.
 */
export interface HitTestOptions {
  /** Tolérance de sélection en pixels écran (défaut : 6 px). */
  readonly hitTolerancePx?: number;
  /** Filtre optionnel pour restreindre le hit-test à un niveau altimétrique spécifique. */
  readonly activeLevelId?: string | null;
}

/**
 * Vérifie si un point du monde 2D se situe à l'intérieur ou à proximité immédiate
 * du polygone d'emprise d'un mur (test par demi-plans CCW avec tolérance).
 */
export function isPointInsideOrNearFootprint(
  pt: Vec2,
  poly: readonly [Vec2, Vec2, Vec2, Vec2],
  toleranceMm: number,
): boolean {
  const [v0, v1, v2, v3] = poly;
  const edges: readonly [
    readonly [Vec2, Vec2],
    readonly [Vec2, Vec2],
    readonly [Vec2, Vec2],
    readonly [Vec2, Vec2],
  ] = [
    [v0, v1],
    [v1, v2],
    [v2, v3],
    [v3, v0],
  ];

  for (const [vCur, vNext] of edges) {
    const edge = vec2(vNext.x - vCur.x, vNext.y - vCur.y);
    const toPt = vec2(pt.x - vCur.x, pt.y - vCur.y);
    // Produit vectoriel 2D (composante Z) : edge.x * toPt.y - edge.y * toPt.x
    const cross = edge.x * toPt.y - edge.y * toPt.x;
    const edgeLen = Math.hypot(edge.x, edge.y);

    // Si le point est strictement en dehors du demi-plan au-delà de la tolérance
    if (cross < -toleranceMm * edgeLen) {
      return false;
    }
  }

  return true;
}

/**
 * Teste si un point du monde architectural (mm) touche un mur spécifique en tenant compte
 * de son épaisseur réelle issue de son type et d'une tolérance spatiale.
 */
export function hitTestWall(
  worldPos: Vec2,
  wall: WallFor2D,
  wallType: WallTypeFor2D,
  toleranceMm: number = 0,
): boolean {
  // 1. Filtrage rapide par distance orthogonale au segment d'axe
  const dist = distancePointToSegment(worldPos, { start: wall.start, end: wall.end });
  const maxDistance = wallType.thickness / 2 + toleranceMm;

  if (dist > maxDistance) {
    return false;
  }

  // 2. Validation précise par inclusion dans l'emprise polygonale (poché)
  try {
    const footprint = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness: wallType.thickness,
      locationLine: 'center',
    });
    return isPointInsideOrNearFootprint(worldPos, footprint.vertices, toleranceMm);
  } catch {
    // Si l'emprise ne peut être calculée (ex: mur quasi-ponctuel), la distance suffit
    return true;
  }
}

/**
 * Détecte l'élément architectural sous une coordonnée écran dans le document BIM.
 * Fonction pure et découplée de View2D, réutilisable directement par les futurs Tools (ex: WallTool en Phase 2.2).
 *
 * @param screenPos Position en pixels dans l'espace écran du canvas.
 * @param transform Matrice de transformation courante.
 * @param doc Document BIM contenant le modèle.
 * @param options Paramètres de tolérance et filtre de niveau.
 * @returns L'identifiant `ElementId` du mur touché, ou `null`.
 */
export function findWallAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): string | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 6;
  const activeLevelId = options?.activeLevelId ?? null;

  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  // Parcours en sens inverse (du plus récent au plus ancien = ordre d'affichage au premier plan)
  const walls = Object.values(state.walls);
  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    if (!wall) continue;

    if (activeLevelId && wall.levelId !== activeLevelId) {
      continue;
    }

    const wallType = wall.typeId ? state.wallTypes[wall.typeId] : undefined;
    if (!wallType) continue;

    if (hitTestWall(worldPos, wall, wallType, toleranceMm)) {
      return wall.id;
    }
  }

  return null;
}

/**
 * Résultat d'une détection d'ouverture sous le curseur.
 */
export interface HitOpeningResult {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly hostWallId: string;
}

/**
 * Détecte une ouverture (porte ou fenêtre) sous une coordonnée écran dans le document BIM.
 * Fonction pure et découplée pour les Tools de sélection et déplacement d'ouvertures.
 *
 * @param screenPos Position en pixels dans l'espace écran du canvas.
 * @param transform Matrice de transformation courante.
 * @param doc Document BIM contenant le modèle.
 * @param options Paramètres de tolérance et filtre de niveau.
 * @returns L'identifiant, le type et le mur hôte de l'ouverture touchée, ou `null`.
 */
export function findOpeningAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): HitOpeningResult | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 6;
  const activeLevelId = options?.activeLevelId ?? null;

  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  const doors = state.doors ? Object.values(state.doors) : [];
  const windows = state.windows ? Object.values(state.windows) : [];

  // Parcourir portes et fenêtres (du plus récent au plus ancien = dessus d'abord)
  const openings: Array<{
    id: string;
    kind: 'door' | 'window';
    hostWallId: string;
    offsetAlong: number;
    width: number;
  }> = [
    ...doors.map((d) => ({
      id: d.id,
      kind: 'door' as const,
      hostWallId: d.hostWallId,
      offsetAlong: d.offsetAlong,
      width: d.width ?? 900,
    })),
    ...windows.map((w) => ({
      id: w.id,
      kind: 'window' as const,
      hostWallId: w.hostWallId,
      offsetAlong: w.offsetAlong,
      width: w.width ?? 1200,
    })),
  ];

  for (let i = openings.length - 1; i >= 0; i--) {
    const op = openings[i];
    if (!op) continue;

    const wall = state.walls[op.hostWallId];
    if (!wall) continue;

    if (activeLevelId && wall.levelId !== activeLevelId) {
      continue;
    }

    const wallType = wall.typeId ? state.wallTypes[wall.typeId] : undefined;
    const thickness = wallType ? wallType.thickness : 200;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.hypot(dx, dy);
    if (wallLen < 1e-6) continue;

    const ux = dx / wallLen;
    const uy = dy / wallLen;

    const toPtX = worldPos.x - wall.start.x;
    const toPtY = worldPos.y - wall.start.y;

    const projAlong = toPtX * ux + toPtY * uy;
    const distPerp = Math.abs(toPtX * uy - toPtY * ux);

    const maxDistPerp = thickness / 2 + toleranceMm;

    if (
      projAlong >= op.offsetAlong - toleranceMm &&
      projAlong <= op.offsetAlong + op.width + toleranceMm &&
      distPerp <= maxDistPerp
    ) {
      return {
        id: op.id,
        kind: op.kind,
        hostWallId: op.hostWallId,
      };
    }
  }

  return null;
}

/**
 * Recherche si un composant d'aménagement ou mobilier est cliqué à l'écran.
 */
export function findComponentAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): string | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 6;
  const activeLevelId = options?.activeLevelId ?? null;

  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  const components = state.components ? Object.values(state.components) : [];
  if (components.length === 0) return null;

  // Parcourir du plus récent au plus ancien (dessus d'abord)
  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i];
    if (!comp) continue;

    if (activeLevelId && comp.levelId !== activeLevelId) {
      continue;
    }

    const type = state.componentTypes?.[comp.typeId];
    if (!type) continue;

    // Translation relative au centre du composant
    const dx = worldPos.x - comp.placement.x;
    const dy = worldPos.y - comp.placement.y;

    // Rotation inverse
    const rot = comp.placement.rotation ?? 0;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const u = dx * cos - dy * sin;
    const v = dx * sin + dy * cos;

    const halfW = (comp.widthOverride ?? type.width) / 2;
    const halfD = (comp.depthOverride ?? type.depth) / 2;

    if (
      Math.abs(u) <= halfW + toleranceMm &&
      Math.abs(v) <= halfD + toleranceMm
    ) {
      return comp.id;
    }
  }

  return null;
}
