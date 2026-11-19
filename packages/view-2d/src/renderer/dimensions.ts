import type { Transform2D } from '../transform.js';
import type { DimensionFor2D, WallFor2D, DimensionRenderConfig } from '../types.js';
import { DEFAULT_DIMENSION_RENDER_CONFIG } from './config.js';

export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  dimensions: readonly DimensionFor2D[],
  walls: Record<string, WallFor2D>,
  config: DimensionRenderConfig = DEFAULT_DIMENSION_RENDER_CONFIG,
  levelFilter?: string | null,
  visibleDimIds?: ReadonlySet<string> | null,
): void {
  if (dimensions.length === 0) return;

  ctx.save();
  ctx.lineWidth = config.lineWidth;
  ctx.strokeStyle = config.lineColor;
  ctx.fillStyle = config.textColor;
  ctx.font = config.font;

  for (const dim of dimensions) {
    if (visibleDimIds && !visibleDimIds.has(dim.id)) continue;
    if (levelFilter && dim.levelId && dim.levelId !== levelFilter) {
      continue;
    }

    let p1: { x: number; y: number } | null = null;
    let p2: { x: number; y: number } | null = null;

    const ref0 = dim.references[0];
    const ref1 = dim.references[1];

    if (dim.references.length === 1 && ref0) {
      const wall = walls[ref0];
      if (!wall) continue;
      p1 = { x: wall.start.x, y: wall.start.y };
      p2 = { x: wall.end.x, y: wall.end.y };
    } else if (dim.references.length >= 2 && ref0 && ref1) {
      const w1 = walls[ref0];
      const w2 = walls[ref1];
      if (!w1 || !w2) continue;
      p1 = { x: (w1.start.x + w1.end.x) / 2, y: (w1.start.y + w1.end.y) / 2 };
      p2 = { x: (w2.start.x + w2.end.x) / 2, y: (w2.start.y + w2.end.y) / 2 };
    }

    if (!p1 || !p2) continue;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    // Vecteur unitaire et normale
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    // Décalage perpendiculaire en coordonnées monde
    const ox = nx * dim.offset;
    const oy = ny * dim.offset;

    const d1World = { x: p1.x + ox, y: p1.y + oy };
    const d2World = { x: p2.x + ox, y: p2.y + oy };

    const sp1 = transform.worldToScreen(p1);
    const sp2 = transform.worldToScreen(p2);
    const sd1 = transform.worldToScreen(d1World);
    const sd2 = transform.worldToScreen(d2World);

    // 1. Lignes de rappel (witness lines)
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sd1.x, sd1.y);
    ctx.moveTo(sp2.x, sp2.y);
    ctx.lineTo(sd2.x, sd2.y);
    ctx.stroke();

    // 2. Ligne de cote
    ctx.beginPath();
    ctx.moveTo(sd1.x, sd1.y);
    ctx.lineTo(sd2.x, sd2.y);
    ctx.stroke();

    // 3. Ticks architecturaux à 45°
    const tick = config.tickSize;
    ctx.beginPath();
    ctx.moveTo(sd1.x - tick / 2, sd1.y + tick / 2);
    ctx.lineTo(sd1.x + tick / 2, sd1.y - tick / 2);
    ctx.moveTo(sd2.x - tick / 2, sd2.y + tick / 2);
    ctx.lineTo(sd2.x + tick / 2, sd2.y - tick / 2);
    ctx.stroke();

    // 4. Texte de cotation
    const label =
      dim.customLabel ??
      (dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`);

    const midScreenX = (sd1.x + sd2.x) / 2;
    const midScreenY = (sd1.y + sd2.y) / 2;

    let angle = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
    // Garder le texte orienté de gauche à droite
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      angle += Math.PI;
    }

    ctx.save();
    ctx.translate(midScreenX, midScreenY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, -3);
    ctx.restore();
  }

  ctx.restore();
}
