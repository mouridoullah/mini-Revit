import {
  computeWallFootprint2d,
  solveWallJunctions,
  type WallInput,
  type Vec2,
  GEOM_CONFIG,
} from '@tabax/geometry';
import type { Transform2D } from '../transform.js';
import type { WallFor2D, WallTypeFor2D, WallRenderConfig } from '../types.js';
import { DEFAULT_WALL_RENDER_CONFIG } from './config.js';

/**
 * Dessine un mur architectural individuel avec poché, contour d'emprise et axe de référence.
 * Consomme obligatoirement l'algorithme `computeWallFootprint2d` de `@tabax/geometry`.
 */
export function drawWall(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  wall: WallFor2D,
  wallType: WallTypeFor2D,
  isSelected: boolean = false,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  resolvedPolygon?: readonly Vec2[] | undefined,
): void {
  // 1. Calcul de l'emprise 2D géométrique via le noyau mathématique pur
  const footprint = computeWallFootprint2d({
    start: wall.start,
    end: wall.end,
    thickness: wallType.thickness,
    locationLine: 'center',
  });

  const vertices =
    resolvedPolygon && resolvedPolygon.length >= 3 ? resolvedPolygon : footprint.vertices;
  const screenPoints = vertices.map((v) => transform.worldToScreen(v));
  if (screenPoints.length < 3) return;

  const first = screenPoints[0];
  if (!first) return;

  ctx.save();

  // 2. Poché architectural (Remplissage)
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < screenPoints.length; i++) {
    const pt = screenPoints[i];
    if (pt) {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.closePath();

  ctx.fillStyle = isSelected ? config.selectedFillColor : config.fillColor;
  ctx.fill();

  // 3. Arêtes vues / coupées (Contour fermé)
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;
  ctx.lineJoin = 'miter';
  ctx.stroke();

  // 4. Axe de référence central
  const cStart = transform.worldToScreen(footprint.centerAxis.start);
  const cEnd = transform.worldToScreen(footprint.centerAxis.end);

  ctx.beginPath();
  ctx.moveTo(cStart.x, cStart.y);
  ctx.lineTo(cEnd.x, cEnd.y);
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.centerlineColor;
  ctx.lineWidth = config.centerlineWidth;
  if (config.centerlineDash.length > 0) {
    ctx.setLineDash([...config.centerlineDash]);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Dessine l'ensemble des murs du document avec résolution topologique des jonctions.
 */
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  walls: Record<string, WallFor2D>,
  wallTypes: Record<string, WallTypeFor2D>,
  selectedIds: ReadonlySet<string>,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  levelFilter?: string | null,
  visibleWallIds?: ReadonlySet<string> | null,
): void {
  const wallInputs: WallInput[] = [];
  const levelWalls: WallFor2D[] = [];

  const candidateIds = visibleWallIds ?? Object.keys(walls);
  for (const wallId of candidateIds) {
    const wall = walls[wallId];
    if (!wall) continue;

    if (levelFilter && wall.levelId && wall.levelId !== levelFilter) {
      continue;
    }

    const wallType = wall.typeId ? wallTypes[wall.typeId] : undefined;
    if (!wallType) {
      continue;
    }

    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (len > GEOM_CONFIG.EPSILON_DISTANCE && wallType.thickness > 0) {
      wallInputs.push({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        thickness: wallType.thickness,
        locationLine: 'center',
      });
    }
    levelWalls.push(wall);
  }

  const resolvedPolygons = new Map<string, readonly Vec2[]>();
  if (wallInputs.length > 0) {
    try {
      const solution = solveWallJunctions(wallInputs);
      for (const rw of solution.walls) {
        resolvedPolygons.set(rw.id, rw.polygon);
      }
    } catch {
      // Fallback silencieux sur l'emprise nominale rectangulaire
    }
  }

  for (const wall of levelWalls) {
    const wallType = wall.typeId ? wallTypes[wall.typeId] : undefined;
    if (!wallType) {
      continue;
    }

    const isSelected = selectedIds.has(wall.id);
    const resolvedPoly = resolvedPolygons.get(wall.id);
    drawWall(ctx, transform, wall, wallType, isSelected, config, resolvedPoly);
  }
}
