import type { Transform2D } from '../transform.js';
import type { StairFor2D, StairTypeFor2D, StairRenderConfig } from '../types.js';
import { DEFAULT_STAIR_RENDER_CONFIG } from './config.js';

export function drawStair(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  stair: StairFor2D,
  stairType?: StairTypeFor2D,
  isSelected: boolean = false,
  config: StairRenderConfig = DEFAULT_STAIR_RENDER_CONFIG,
): void {
  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const len = Math.hypot(dx, dy);
  const width = stair.widthOverride ?? stairType?.width ?? 900;
  if (len <= 1e-4 || width <= 0) return;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const halfW = width / 2;

  // 4 coins en coordonnées monde
  const c1 = { x: stair.start.x - nx * halfW, y: stair.start.y - ny * halfW };
  const c2 = { x: stair.end.x - nx * halfW, y: stair.end.y - ny * halfW };
  const c3 = { x: stair.end.x + nx * halfW, y: stair.end.y + ny * halfW };
  const c4 = { x: stair.start.x + nx * halfW, y: stair.start.y + ny * halfW };

  const sc1 = transform.worldToScreen(c1);
  const sc2 = transform.worldToScreen(c2);
  const sc3 = transform.worldToScreen(c3);
  const sc4 = transform.worldToScreen(c4);

  ctx.save();

  // 1. Fond de l'emprise
  ctx.beginPath();
  ctx.moveTo(sc1.x, sc1.y);
  ctx.lineTo(sc2.x, sc2.y);
  ctx.lineTo(sc3.x, sc3.y);
  ctx.lineTo(sc4.x, sc4.y);
  ctx.closePath();
  ctx.fillStyle = config.fillColor;
  ctx.fill();

  // 2. Lignes de nez de marches transversales
  const nSteps = Math.max(3, Math.round(len / 280));
  const stepDist = len / nSteps;
  ctx.beginPath();
  for (let i = 1; i < nSteps; i++) {
    const mx = stair.start.x + ux * (i * stepDist);
    const my = stair.start.y + uy * (i * stepDist);
    const pA = transform.worldToScreen({ x: mx - nx * halfW, y: my - ny * halfW });
    const pB = transform.worldToScreen({ x: mx + nx * halfW, y: my + ny * halfW });
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
  }
  ctx.strokeStyle = config.stepLineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Ligne de foulée axiale
  const sStart = transform.worldToScreen(stair.start);
  const sEnd = transform.worldToScreen(stair.end);

  ctx.beginPath();
  ctx.moveTo(sStart.x, sStart.y);
  ctx.lineTo(sEnd.x, sEnd.y);
  ctx.strokeStyle = config.walklineColor;
  ctx.lineWidth = config.walklineWidth;
  ctx.stroke();

  // Pastille / cercle de départ en pied
  ctx.beginPath();
  ctx.arc(sStart.x, sStart.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = config.walklineColor;
  ctx.fill();

  // Flèche d'arrivée en tête
  const sDx = sEnd.x - sStart.x;
  const sDy = sEnd.y - sStart.y;
  const sLen = Math.hypot(sDx, sDy);
  if (sLen > 8) {
    const sUx = sDx / sLen;
    const sUy = sDy / sLen;
    const arrowSize = 8;
    const a1 = {
      x: sEnd.x - sUx * arrowSize - sUy * (arrowSize * 0.5),
      y: sEnd.y - sUy * arrowSize + sUx * (arrowSize * 0.5),
    };
    const a2 = {
      x: sEnd.x - sUx * arrowSize + sUy * (arrowSize * 0.5),
      y: sEnd.y - sUy * arrowSize - sUx * (arrowSize * 0.5),
    };
    ctx.beginPath();
    ctx.moveTo(sEnd.x, sEnd.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.closePath();
    ctx.fillStyle = config.walklineColor;
    ctx.fill();
  }

  // 4. Contour périphérique de la volée (tracé en dernier pour netteté d'arête)
  ctx.beginPath();
  ctx.moveTo(sc1.x, sc1.y);
  ctx.lineTo(sc2.x, sc2.y);
  ctx.lineTo(sc3.x, sc3.y);
  ctx.lineTo(sc4.x, sc4.y);
  ctx.closePath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;
  ctx.stroke();

  ctx.restore();
}

/**
 * Dessine l'ensemble des escaliers du document associés au niveau actif.
 */
export function drawStairs(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  stairs: Record<string, StairFor2D> | readonly StairFor2D[],
  stairTypes: Record<string, StairTypeFor2D> = {},
  selectedIds: ReadonlySet<string> = new Set(),
  config: StairRenderConfig = DEFAULT_STAIR_RENDER_CONFIG,
  levelFilter?: string | null,
  visibleStairIds?: ReadonlySet<string> | null,
): void {
  const stairList = Array.isArray(stairs) ? stairs : Object.values(stairs);
  for (const stair of stairList) {
    if (visibleStairIds && !visibleStairIds.has(stair.id)) {
      continue;
    }
    // Règle multi-niveaux : visible si c'est le niveau inférieur OU le niveau supérieur
    if (
      levelFilter &&
      stair.bottomLevelId &&
      stair.bottomLevelId !== levelFilter &&
      stair.topLevelId !== levelFilter
    ) {
      continue;
    }
    const stairType = stair.stairTypeId ? stairTypes[stair.stairTypeId] : undefined;
    const isSelected = selectedIds.has(stair.id);
    drawStair(ctx, transform, stair, stairType, isSelected, config);
  }
}
