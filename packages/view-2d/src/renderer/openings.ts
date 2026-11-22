import { vec2 } from '@tabax/geometry';
import type { Transform2D } from '../transform.js';
import type {
  DoorFor2D,
  WindowFor2D,
  OpeningFor2D,
  WallFor2D,
  WallTypeFor2D,
  WallRenderConfig,
} from '../types.js';
import {
  DEFAULT_WALL_RENDER_CONFIG,
  DEFAULT_VIEW2D_RENDER_CONFIG,
} from './config.js';

/**
 * Dessine la représentation architecturale 2D d'une porte hébergée :
 * - Réservation blanche évidant le poché du mur
 * - Ébrasements transversaux (montants de baie)
 * - Vantail ouvert à 90° dans la direction du battement (swing.direction)
 * - Arc de cercle de débattement de 90° (rayon = width)
 */
export function drawOpeningDoor(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  door: DoorFor2D,
  wall: WallFor2D,
  wallThickness: number,
  isSelected: boolean = false,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  backgroundColor: string = DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
  customDoorWidth?: number,
): void {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) return;

  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;

  const halfT = wallThickness / 2;
  const doorWidth = customDoorWidth ?? door.width ?? 900;
  const u0 = door.offsetAlong;
  const u1 = door.offsetAlong + doorWidth;

  // 1. Évidement du poché du mur (remplissage à la couleur d'arrière-plan)
  const pA0 = vec2(wall.start.x + ux * u0 - vx * halfT, wall.start.y + uy * u0 - vy * halfT);
  const pB0 = vec2(wall.start.x + ux * u1 - vx * halfT, wall.start.y + uy * u1 - vy * halfT);
  const pB1 = vec2(wall.start.x + ux * u1 + vx * halfT, wall.start.y + uy * u1 + vy * halfT);
  const pA1 = vec2(wall.start.x + ux * u0 + vx * halfT, wall.start.y + uy * u0 + vy * halfT);

  const sA0 = transform.worldToScreen(pA0);
  const sB0 = transform.worldToScreen(pB0);
  const sB1 = transform.worldToScreen(pB1);
  const sA1 = transform.worldToScreen(pA1);

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(sA0.x, sA0.y);
  ctx.lineTo(sB0.x, sB0.y);
  ctx.lineTo(sB1.x, sB1.y);
  ctx.lineTo(sA1.x, sA1.y);
  ctx.closePath();
  ctx.fillStyle = backgroundColor;
  ctx.fill();

  // 2. Ébrasements transversaux de la baie (montants de part et d'autre)
  ctx.beginPath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;

  // Montant à u0
  ctx.moveTo(sA0.x, sA0.y);
  ctx.lineTo(sA1.x, sA1.y);
  // Montant à u1
  ctx.moveTo(sB0.x, sB0.y);
  ctx.lineTo(sB1.x, sB1.y);
  ctx.stroke();

  // 3. Détermination de la charnière (gond) et de la direction d'ouverture
  const isLeft = door.swing.side === 'left';
  const hingeU = isLeft ? u0 : u1;
  const latchU = isLeft ? u1 : u0;

  const hingeWorld = vec2(wall.start.x + ux * hingeU, wall.start.y + uy * hingeU);
  const closedWorld = vec2(wall.start.x + ux * latchU, wall.start.y + uy * latchU);

  // Direction d'ouverture : 'in' -> +v, 'out' -> -v
  const dirSign = door.swing.direction === 'in' ? 1 : -1;
  const openWorld = vec2(
    hingeWorld.x + vx * (doorWidth * dirSign),
    hingeWorld.y + vy * (doorWidth * dirSign),
  );

  const sHinge = transform.worldToScreen(hingeWorld);
  const sClosed = transform.worldToScreen(closedWorld);
  const sOpen = transform.worldToScreen(openWorld);

  // 4. Tracé du vantail de porte ouvert à 90°
  ctx.beginPath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.moveTo(sHinge.x, sHinge.y);
  ctx.lineTo(sOpen.x, sOpen.y);
  ctx.stroke();

  // 5. Tracé de l'arc de débattement de 90°
  const radius = transform.worldDistanceToScreen(doorWidth);
  const startAngle = Math.atan2(sClosed.y - sHinge.y, sClosed.x - sHinge.x);
  const endAngle = Math.atan2(sOpen.y - sHinge.y, sOpen.x - sHinge.x);

  // Calcul rigoureux du sens de rotation écran (counterclockwise)
  let deltaAngle = endAngle - startAngle;
  while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
  while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
  const counterclockwise = deltaAngle < 0;

  ctx.beginPath();
  ctx.arc(sHinge.x, sHinge.y, radius, startAngle, endAngle, counterclockwise);
  ctx.setLineDash([3, 3]);
  ctx.stroke();

  ctx.restore();
}

/**
 * Dessine la représentation architecturale 2D d'une fenêtre hébergée :
 * - Réservation blanche évidant le poché du mur
 * - Ébrasements transversaux (montants de baie)
 * - Deux lignes parallèles de vitrage dans l'épaisseur du mur
 * - Lignes fines d'allège/appui
 */
export function drawOpeningWindow(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  window: WindowFor2D,
  wall: WallFor2D,
  wallThickness: number,
  isSelected: boolean = false,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  backgroundColor: string = DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
  customWinWidth?: number,
): void {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) return;

  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;

  const halfT = wallThickness / 2;
  const winWidth = customWinWidth ?? window.width ?? 1200;
  const u0 = window.offsetAlong;
  const u1 = window.offsetAlong + winWidth;

  // 1. Évidement du poché du mur (remplissage à la couleur d'arrière-plan)
  const pA0 = vec2(wall.start.x + ux * u0 - vx * halfT, wall.start.y + uy * u0 - vy * halfT);
  const pB0 = vec2(wall.start.x + ux * u1 - vx * halfT, wall.start.y + uy * u1 - vy * halfT);
  const pB1 = vec2(wall.start.x + ux * u1 + vx * halfT, wall.start.y + uy * u1 + vy * halfT);
  const pA1 = vec2(wall.start.x + ux * u0 + vx * halfT, wall.start.y + uy * u0 + vy * halfT);

  const sA0 = transform.worldToScreen(pA0);
  const sB0 = transform.worldToScreen(pB0);
  const sB1 = transform.worldToScreen(pB1);
  const sA1 = transform.worldToScreen(pA1);

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(sA0.x, sA0.y);
  ctx.lineTo(sB0.x, sB0.y);
  ctx.lineTo(sB1.x, sB1.y);
  ctx.lineTo(sA1.x, sA1.y);
  ctx.closePath();
  ctx.fillStyle = backgroundColor;
  ctx.fill();

  // 2. Ébrasements transversaux de la baie (montants de part et d'autre)
  ctx.beginPath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;

  // Montant à u0
  ctx.moveTo(sA0.x, sA0.y);
  ctx.lineTo(sA1.x, sA1.y);
  // Montant à u1
  ctx.moveTo(sB0.x, sB0.y);
  ctx.lineTo(sB1.x, sB1.y);
  ctx.stroke();

  // 3. Lignes d'allège / appui de fenêtre le long des faces du mur (traits fins)
  ctx.beginPath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = 1;
  ctx.moveTo(sA0.x, sA0.y);
  ctx.lineTo(sB0.x, sB0.y);
  ctx.moveTo(sA1.x, sA1.y);
  ctx.lineTo(sB1.x, sB1.y);
  ctx.stroke();

  // 4. Deux lignes parallèles de vitrage au centre de l'épaisseur du mur
  const glassOffset = Math.min(15, halfT / 2);
  const gA0 = vec2(
    wall.start.x + ux * u0 - vx * glassOffset,
    wall.start.y + uy * u0 - vy * glassOffset,
  );
  const gB0 = vec2(
    wall.start.x + ux * u1 - vx * glassOffset,
    wall.start.y + uy * u1 - vy * glassOffset,
  );
  const gA1 = vec2(
    wall.start.x + ux * u0 + vx * glassOffset,
    wall.start.y + uy * u0 + vy * glassOffset,
  );
  const gB1 = vec2(
    wall.start.x + ux * u1 + vx * glassOffset,
    wall.start.y + uy * u1 + vy * glassOffset,
  );

  const sgA0 = transform.worldToScreen(gA0);
  const sgB0 = transform.worldToScreen(gB0);
  const sgA1 = transform.worldToScreen(gA1);
  const sgB1 = transform.worldToScreen(gB1);

  ctx.beginPath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : '#3b82f6'; // Bleu vitrage architectural
  ctx.lineWidth = 1.5;
  ctx.moveTo(sgA0.x, sgA0.y);
  ctx.lineTo(sgB0.x, sgB0.y);
  ctx.moveTo(sgA1.x, sgA1.y);
  ctx.lineTo(sgB1.x, sgB1.y);
  ctx.stroke();

  ctx.restore();
}

/**
 * Dessine l'ensemble des ouvertures hébergées (portes et fenêtres) par-dessus les murs.
 */
export function drawOpenings(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  walls: Record<string, WallFor2D>,
  wallTypes: Record<string, WallTypeFor2D>,
  openings: readonly OpeningFor2D[],
  selectedIds: ReadonlySet<string>,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  backgroundColor: string = DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
  levelFilter?: string | null,
  doorTypes?: Record<string, { readonly width: number; readonly height: number }>,
  windowTypes?: Record<string, { readonly width: number; readonly height: number }>,
  visibleOpeningIds?: ReadonlySet<string> | null,
): void {
  for (const op of openings) {
    if (visibleOpeningIds && !visibleOpeningIds.has(op.id)) continue;

    const wall = walls[op.hostWallId];
    if (!wall) continue;
    if (levelFilter && wall.levelId && wall.levelId !== levelFilter) continue;

    const wallType = wall.typeId ? wallTypes[wall.typeId] : undefined;
    const thickness = wallType?.thickness ?? 200;
    const isSelected = selectedIds.has(op.id) || selectedIds.has(wall.id);

    if (op.kind === 'door') {
      const dt = op.doorTypeId ? doorTypes?.[op.doorTypeId] : undefined;
      drawOpeningDoor(
        ctx,
        transform,
        op,
        wall,
        thickness,
        isSelected,
        config,
        backgroundColor,
        dt?.width,
      );
    } else if (op.kind === 'window') {
      const wt = op.windowTypeId ? windowTypes?.[op.windowTypeId] : undefined;
      drawOpeningWindow(
        ctx,
        transform,
        op,
        wall,
        thickness,
        isSelected,
        config,
        backgroundColor,
        wt?.width,
      );
    }
  }
}
