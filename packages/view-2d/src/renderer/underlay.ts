import type { Transform2D } from '../transform.js';
import type { UnderlayRenderConfig } from '../types.js';
import { DEFAULT_UNDERLAY_RENDER_CONFIG } from './config.js';

/**
 * Dessine la vue fantôme (Underlay) du niveau inférieur via son tracé vectoriel Path2D en coordonnées monde.
 */
export function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  underlayPath: Path2D,
  config: UnderlayRenderConfig = DEFAULT_UNDERLAY_RENDER_CONFIG,
): void {
  ctx.save();

  const cx = transform.viewportWidth / 2;
  const cy = transform.viewportHeight / 2;
  const scale = transform.scale;

  // Appliquer la transformation monde -> écran au contexte Canvas
  ctx.setTransform(
    scale,
    0,
    0,
    -scale,
    cx - transform.origin.x * scale,
    cy + transform.origin.y * scale,
  );

  ctx.strokeStyle = config.strokeColor;
  ctx.lineWidth = 1 / scale;
  const scaledDash = config.lineDash.map((d) => d / scale);
  ctx.setLineDash(scaledDash);
  ctx.globalAlpha = config.opacity;

  ctx.stroke(underlayPath);

  ctx.restore();
}
