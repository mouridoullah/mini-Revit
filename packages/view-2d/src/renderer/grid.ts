import { vec2 } from '@tabax/geometry';
import type { Transform2D } from '../transform.js';
import type { GridConfig } from '../types.js';
import { DEFAULT_GRID_CONFIG } from './config.js';

/**
 * Efface le canvas avec la couleur d'arrière-plan configurée.
 */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor: string,
): void {
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Dessine la grille de repérage et les axes cartésiens en coordonnées monde.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  config: GridConfig = DEFAULT_GRID_CONFIG,
  showAxes: boolean = true,
): void {
  if (!config.show) return;

  const bounds = transform.getVisibleWorldBounds();
  const scale = transform.scale;

  // Détermination de l'espacement effectif pour éviter la saturation à fort dézoom
  const minorPixelSpacing = config.minorStepMm * scale;
  const majorPixelSpacing = config.majorStepMm * scale;

  const drawMinor = minorPixelSpacing >= config.minPixelSpacing;
  const drawMajor = majorPixelSpacing >= config.minPixelSpacing;

  // Alignement sur les pas de grille
  const startXMinor = Math.floor(bounds.min.x / config.minorStepMm) * config.minorStepMm;
  const endXMinor = Math.ceil(bounds.max.x / config.minorStepMm) * config.minorStepMm;
  const startYMinor = Math.floor(bounds.min.y / config.minorStepMm) * config.minorStepMm;
  const endYMinor = Math.ceil(bounds.max.y / config.minorStepMm) * config.minorStepMm;

  const startXMajor = Math.floor(bounds.min.x / config.majorStepMm) * config.majorStepMm;
  const endXMajor = Math.ceil(bounds.max.x / config.majorStepMm) * config.majorStepMm;
  const startYMajor = Math.floor(bounds.min.y / config.majorStepMm) * config.majorStepMm;
  const endYMajor = Math.ceil(bounds.max.y / config.majorStepMm) * config.majorStepMm;

  ctx.save();

  // 1. Tracé de la grille secondaire (mineure)
  if (drawMinor) {
    ctx.beginPath();
    ctx.strokeStyle = config.minorColor;
    ctx.lineWidth = 1;

    for (let x = startXMinor; x <= endXMinor; x += config.minorStepMm) {
      if (Math.abs(x % config.majorStepMm) < 1e-4) continue; // Laisser la place aux majeures
      const sTop = transform.worldToScreen(vec2(x, bounds.max.y));
      const sBottom = transform.worldToScreen(vec2(x, bounds.min.y));
      ctx.moveTo(sTop.x, sTop.y);
      ctx.lineTo(sBottom.x, sBottom.y);
    }

    for (let y = startYMinor; y <= endYMinor; y += config.minorStepMm) {
      if (Math.abs(y % config.majorStepMm) < 1e-4) continue;
      const sLeft = transform.worldToScreen(vec2(bounds.min.x, y));
      const sRight = transform.worldToScreen(vec2(bounds.max.x, y));
      ctx.moveTo(sLeft.x, sLeft.y);
      ctx.lineTo(sRight.x, sRight.y);
    }

    ctx.stroke();
  }

  // 2. Tracé de la grille principale (majeure)
  if (drawMajor) {
    ctx.beginPath();
    ctx.strokeStyle = config.majorColor;
    ctx.lineWidth = 1;

    for (let x = startXMajor; x <= endXMajor; x += config.majorStepMm) {
      if (showAxes && Math.abs(x) < 1e-4) continue; // Réservé pour l'axe Y
      const sTop = transform.worldToScreen(vec2(x, bounds.max.y));
      const sBottom = transform.worldToScreen(vec2(x, bounds.min.y));
      ctx.moveTo(sTop.x, sTop.y);
      ctx.lineTo(sBottom.x, sBottom.y);
    }

    for (let y = startYMajor; y <= endYMajor; y += config.majorStepMm) {
      if (showAxes && Math.abs(y) < 1e-4) continue; // Réservé pour l'axe X
      const sLeft = transform.worldToScreen(vec2(bounds.min.x, y));
      const sRight = transform.worldToScreen(vec2(bounds.max.x, y));
      ctx.moveTo(sLeft.x, sLeft.y);
      ctx.lineTo(sRight.x, sRight.y);
    }

    ctx.stroke();
  }

  // 3. Tracé des axes cartésiens (X = 0 et Y = 0)
  if (showAxes) {
    // Axe X (Y = 0) - Rouge
    if (bounds.min.y <= 0 && bounds.max.y >= 0) {
      const pLeft = transform.worldToScreen(vec2(bounds.min.x, 0));
      const pRight = transform.worldToScreen(vec2(bounds.max.x, 0));
      ctx.beginPath();
      ctx.strokeStyle = config.axisColorX;
      ctx.lineWidth = 1.5;
      ctx.moveTo(pLeft.x, pLeft.y);
      ctx.lineTo(pRight.x, pRight.y);
      ctx.stroke();
    }

    // Axe Y (X = 0) - Vert
    if (bounds.min.x <= 0 && bounds.max.x >= 0) {
      const pTop = transform.worldToScreen(vec2(0, bounds.max.y));
      const pBottom = transform.worldToScreen(vec2(0, bounds.min.y));
      ctx.beginPath();
      ctx.strokeStyle = config.axisColorY;
      ctx.lineWidth = 1.5;
      ctx.moveTo(pTop.x, pTop.y);
      ctx.lineTo(pBottom.x, pBottom.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
