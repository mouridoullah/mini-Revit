import {
  type Vec2,
  vec2,
  distancePointToSegment,
  computeWallFootprint2d,
} from '@mini-bim/geometry';
import { type Transform2D } from './transform.js';
import { type DocumentFor2D, type WallFor2D, type WallTypeFor2D } from './types.js';
import { resolveDimensionPoints } from './renderer/dimensions.js';

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

/**
 * Résultat de détection d'un élément de réseau technique MEP sous le curseur.
 */
export interface HitMepElementResult {
  readonly id: string;
  readonly category: 'pipe' | 'duct' | 'cableTray' | 'mepFitting' | 'mepEquipment';
}

/**
 * Recherche si un élément MEP (tuyau, gaine, chemin de câbles, raccord, équipement)
 * est cliqué à l'écran.
 */
export function findMepElementAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): HitMepElementResult | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 8;
  const activeLevelId = options?.activeLevelId ?? null;

  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  // 1. Équipements techniques (boîtes orientées au premier plan)
  const equipments = state.mepEquipments ? Object.values(state.mepEquipments) : [];
  for (let i = equipments.length - 1; i >= 0; i--) {
    const eq = equipments[i];
    if (!eq) continue;
    if (activeLevelId && eq.levelId !== activeLevelId) continue;

    const dx = worldPos.x - eq.position.x;
    const dy = worldPos.y - eq.position.y;
    const rot = eq.rotation ?? 0;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const u = dx * cos - dy * sin;
    const v = dx * sin + dy * cos;
    const halfW = eq.width / 2;
    const halfD = eq.depth / 2;

    if (Math.abs(u) <= halfW + toleranceMm && Math.abs(v) <= halfD + toleranceMm) {
      return { id: eq.id, category: 'mepEquipment' };
    }
  }

  // 2. Raccords techniques (coudes, tés, etc.)
  const fittings = state.mepFittings ? Object.values(state.mepFittings) : [];
  for (let i = fittings.length - 1; i >= 0; i--) {
    const ft = fittings[i];
    if (!ft) continue;
    if (activeLevelId && ft.levelId !== activeLevelId) continue;

    const dist = Math.hypot(worldPos.x - ft.position.x, worldPos.y - ft.position.y);
    const radius = 100 + toleranceMm;
    if (dist <= radius) {
      return { id: ft.id, category: 'mepFitting' };
    }
  }

  // 3. Gaines aérauliques
  const ducts = state.ducts ? Object.values(state.ducts) : [];
  for (let i = ducts.length - 1; i >= 0; i--) {
    const duct = ducts[i];
    if (!duct) continue;
    if (activeLevelId && duct.levelId !== activeLevelId) continue;

    const dist = distancePointToSegment(worldPos, {
      start: { x: duct.start.x, y: duct.start.y },
      end: { x: duct.end.x, y: duct.end.y },
    });
    const halfW = (duct.width ?? duct.diameter ?? 200) / 2;
    if (dist <= halfW + toleranceMm) {
      return { id: duct.id, category: 'duct' };
    }
  }

  // 4. Chemins de câbles
  const cableTrays = state.cableTrays ? Object.values(state.cableTrays) : [];
  for (let i = cableTrays.length - 1; i >= 0; i--) {
    const ct = cableTrays[i];
    if (!ct) continue;
    if (activeLevelId && ct.levelId !== activeLevelId) continue;

    const dist = distancePointToSegment(worldPos, {
      start: { x: ct.start.x, y: ct.start.y },
      end: { x: ct.end.x, y: ct.end.y },
    });
    const halfW = ct.width / 2;
    if (dist <= halfW + toleranceMm) {
      return { id: ct.id, category: 'cableTray' };
    }
  }

  // 5. Tuyauteries
  const pipes = state.pipes ? Object.values(state.pipes) : [];
  for (let i = pipes.length - 1; i >= 0; i--) {
    const pipe = pipes[i];
    if (!pipe) continue;
    if (activeLevelId && pipe.levelId !== activeLevelId) continue;

    const dist = distancePointToSegment(worldPos, {
      start: { x: pipe.start.x, y: pipe.start.y },
      end: { x: pipe.end.x, y: pipe.end.y },
    });
    const halfD = (pipe.diameter ?? 50) / 2;
    if (dist <= halfD + toleranceMm) {
      return { id: pipe.id, category: 'pipe' };
    }
  }

  return null;
}

/**
 * Résultat de détection d'un port MEP sous le curseur.
 */
export interface HitMepPortResult {
  readonly port: import('./types.js').PortFor2D;
  readonly elementId: string;
  readonly screenPos: Vec2;
  readonly distanceScreenPx: number;
}

/**
 * Détecte le port MEP ouvert le plus proche sous le curseur selon l'ADR-047.
 * Tolérance en pixels écran (12 à 16 px) convertie en monde avec plafond maximal.
 */
export function findMepPortAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: {
    readonly hitTolerancePx?: number;
    readonly maxToleranceMm?: number;
    readonly activeLevelId?: string | null;
  },
): HitMepPortResult | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 14;
  const maxToleranceMm = options?.maxToleranceMm ?? 300;
  const activeLevelId = options?.activeLevelId ?? null;

  const toleranceMm = Math.min(
    transform.screenDistanceToWorld(hitTolerancePx),
    maxToleranceMm,
  );
  const worldPos = transform.screenToWorld(screenPos);
  const state = doc.getState();

  let closest: HitMepPortResult | null = null;
  let minScreenDistSq = hitTolerancePx * hitTolerancePx;

  const mepElements: Array<{ id: string; levelId?: string | undefined; ports?: readonly import('./types.js').PortFor2D[] | undefined }> = [
    ...Object.values(state.pipes ?? {}),
    ...Object.values(state.ducts ?? {}),
    ...Object.values(state.cableTrays ?? {}),
    ...Object.values(state.mepFittings ?? {}),
    ...Object.values(state.mepEquipments ?? {}),
  ];

  for (const elem of mepElements) {
    if (!elem) continue;
    if (activeLevelId && elem.levelId && elem.levelId !== activeLevelId) continue;
    if (!elem.ports || elem.ports.length === 0) continue;

    for (const port of elem.ports) {
      const portWorld: Vec2 = { x: port.position.x, y: port.position.y };
      const dxMm = portWorld.x - worldPos.x;
      const dyMm = portWorld.y - worldPos.y;
      const distMmSq = dxMm * dxMm + dyMm * dyMm;

      if (distMmSq <= toleranceMm * toleranceMm) {
        const portScreen = transform.worldToScreen(portWorld);
        const dxPx = portScreen.x - screenPos.x;
        const dyPx = portScreen.y - screenPos.y;
        const distPxSq = dxPx * dxPx + dyPx * dyPx;

        if (distPxSq < minScreenDistSq) {
          minScreenDistSq = distPxSq;
          closest = {
            port,
            elementId: elem.id,
            screenPos: portScreen,
            distanceScreenPx: Math.sqrt(distPxSq),
          };
        }
      }
    }
  }

  return closest;
}

/**
 * Résultat de détection d'une ligne de coupe sous le curseur.
 */
export interface HitSectionCutResult {
  readonly id: string;
  readonly category: 'sectionCut';
  readonly name: string;
  readonly label: string;
}

/**
 * Recherche si une ligne de coupe / élévation est cliquée à l'écran (ADR-063).
 */
export function findSectionCutAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): HitSectionCutResult | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 8;
  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  const cuts = state.sectionCuts ? Object.values(state.sectionCuts) : [];
  if (cuts.length === 0) return null;

  for (let i = cuts.length - 1; i >= 0; i--) {
    const cut = cuts[i];
    if (!cut) continue;

    const dist = distancePointToSegment(worldPos, {
      start: cut.start,
      end: cut.end,
    });

    if (dist <= toleranceMm) {
      return {
        id: cut.id,
        category: 'sectionCut',
        name: cut.name,
        label: cut.label,
      };
    }
  }

  return null;
}

/**
 * Résultat de détection d'une ligne de cote sous le curseur.
 */
export interface HitDimensionResult {
  readonly id: string;
  readonly category: 'dimension';
  readonly value: number;
}

/**
 * Recherche si une ligne de cotation est cliquée à l'écran (ADR-066).
 */
export function findDimensionAtScreen(
  screenPos: Vec2,
  transform: Transform2D,
  doc: DocumentFor2D,
  options?: HitTestOptions,
): HitDimensionResult | null {
  const hitTolerancePx = options?.hitTolerancePx ?? 8;
  const activeLevelId = options?.activeLevelId;
  const worldPos = transform.screenToWorld(screenPos);
  const toleranceMm = transform.screenDistanceToWorld(hitTolerancePx);
  const state = doc.getState();

  const dims = state.dimensions ? Object.values(state.dimensions) : [];
  if (dims.length === 0) return null;

  for (let i = dims.length - 1; i >= 0; i--) {
    const dim = dims[i];
    if (!dim) continue;
    if (activeLevelId && dim.levelId && dim.levelId !== activeLevelId) continue;

    const pts = resolveDimensionPoints(dim, state.walls);
    if (!pts) continue;

    const { p1, p2 } = pts;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const ox = nx * dim.offset;
    const oy = ny * dim.offset;

    const d1 = { x: p1.x + ox, y: p1.y + oy };
    const d2 = { x: p2.x + ox, y: p2.y + oy };

    // 1. Distance au segment principal de cote [d1, d2]
    const distMain = distancePointToSegment(worldPos, { start: d1, end: d2 });
    if (distMain <= toleranceMm) {
      return {
        id: dim.id,
        category: 'dimension',
        value: dim.value,
      };
    }

    // 2. Distance aux lignes de rappel [p1, d1] et [p2, d2]
    const distW1 = distancePointToSegment(worldPos, { start: p1, end: d1 });
    if (distW1 <= toleranceMm) {
      return {
        id: dim.id,
        category: 'dimension',
        value: dim.value,
      };
    }

    const distW2 = distancePointToSegment(worldPos, { start: p2, end: d2 });
    if (distW2 <= toleranceMm) {
      return {
        id: dim.id,
        category: 'dimension',
        value: dim.value,
      };
    }
  }

  return null;
}
