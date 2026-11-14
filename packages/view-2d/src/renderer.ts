import { type Wall, type WallType, type BimDocument } from '@mini-bim/core';
import { computeWallFootprint2d, vec2 } from '@mini-bim/geometry';
import { type Transform2D } from './transform.js';
import {
  type GridConfig,
  type WallRenderConfig,
  type View2DRenderConfig,
  type PreviewShape,
} from './types.js';

/**
 * Configuration par défaut de la grille et des axes.
 */
export const DEFAULT_GRID_CONFIG: GridConfig = Object.freeze({
  show: true,
  majorStepMm: 1000, // 1 mètre
  minorStepMm: 100, // 10 centimètres
  majorColor: '#e5e7eb', // Gris clair intermédiaire
  minorColor: '#f3f4f6', // Gris très pâle
  axisColorX: '#ef4444', // Rouge pour l'axe X (Y = 0)
  axisColorY: '#10b981', // Vert pour l'axe Y (X = 0)
  minPixelSpacing: 10, // Au moins 10 pixels entre deux traits
});

/**
 * Configuration stylistique par défaut des murs (normes de dessin architectural).
 */
export const DEFAULT_WALL_RENDER_CONFIG: WallRenderConfig = Object.freeze({
  fillColor: '#d1d5db', // Poché architectural gris classique
  strokeColor: '#111827', // Contour d'arête vue/coupée noir soutenu
  strokeWidth: 2, // Trait fort
  centerlineColor: '#9ca3af', // Trait d'axe neutre
  centerlineWidth: 1, // Trait fin
  centerlineDash: [6, 4], // Pointillé alterné [tirets, espaces]
  selectedFillColor: '#bfdbfe', // Poché surbrillance bleu ciel
  selectedStrokeColor: '#2563eb', // Contour sélection bleu roi
  selectedStrokeWidth: 3, // Trait très marqué
});

/**
 * Configuration globale par défaut du rendu 2D.
 */
export const DEFAULT_VIEW2D_RENDER_CONFIG: View2DRenderConfig = Object.freeze({
  backgroundColor: '#ffffff',
  showAxes: true,
  grid: DEFAULT_GRID_CONFIG,
  wall: DEFAULT_WALL_RENDER_CONFIG,
});

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

/**
 * Dessine un mur architectural individuel avec poché, contour d'emprise et axe de référence.
 * Consomme obligatoirement l'algorithme `computeWallFootprint2d` de `@mini-bim/geometry`.
 */
export function drawWall(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  wall: Wall,
  wallType: WallType,
  isSelected: boolean = false,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
): void {
  // 1. Calcul de l'emprise 2D géométrique via le noyau mathématique pur
  const footprint = computeWallFootprint2d({
    start: wall.start,
    end: wall.end,
    thickness: wallType.thickness,
    locationLine: 'center',
  });

  const [v0, v1, v2, v3] = footprint.vertices;
  const s0 = transform.worldToScreen(v0);
  const s1 = transform.worldToScreen(v1);
  const s2 = transform.worldToScreen(v2);
  const s3 = transform.worldToScreen(v3);

  ctx.save();

  // 2. Poché architectural (Remplissage)
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  ctx.lineTo(s1.x, s1.y);
  ctx.lineTo(s2.x, s2.y);
  ctx.lineTo(s3.x, s3.y);
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
 * Dessine l'ensemble des murs du document dans le canvas.
 */
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  walls: Record<string, Wall>,
  wallTypes: Record<string, WallType>,
  selectedIds: ReadonlySet<string>,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  levelFilter?: string | null,
): void {
  for (const wall of Object.values(walls)) {
    if (levelFilter && wall.levelId !== levelFilter) {
      continue;
    }

    const wallType = wallTypes[wall.typeId];
    if (!wallType) {
      continue;
    }

    const isSelected = selectedIds.has(wall.id);
    drawWall(ctx, transform, wall, wallType, isSelected, config);
  }
}

/**
 * Dessine une forme géométrique de prévisualisation temporaire (ex: tracé élastique d'un mur).
 */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  preview: PreviewShape,
): void {
  ctx.save();
  if (preview.kind === 'line') {
    const sStart = transform.worldToScreen(preview.start);
    const sEnd = transform.worldToScreen(preview.end);

    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#2563eb'; // Bleu architectural contrasté
    ctx.lineWidth = 2;
    ctx.moveTo(sStart.x, sStart.y);
    ctx.lineTo(sEnd.x, sEnd.y);
    ctx.stroke();

    // Pastilles indicatrices aux extrémités du tracé
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(sStart.x, sStart.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sEnd.x, sEnd.y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (preview.kind === 'rect') {
    const sMin = transform.worldToScreen(preview.min);
    const sMax = transform.worldToScreen(preview.max);
    const left = Math.min(sMin.x, sMax.x);
    const top = Math.min(sMin.y, sMax.y);
    const width = Math.abs(sMax.x - sMin.x);
    const height = Math.abs(sMax.y - sMin.y);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
  }
  ctx.restore();
}

/**
 * Fonction pure orchestrant le cycle de rendu complet d'une vue en plan 2D.
 */
export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  doc: BimDocument,
  selectedIds: ReadonlySet<string> = new Set(),
  config: Partial<View2DRenderConfig> = {},
  levelFilter?: string | null,
  preview?: PreviewShape | null,
): void {
  const mergedConfig: View2DRenderConfig = {
    backgroundColor: config.backgroundColor ?? DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
    showAxes: config.showAxes ?? DEFAULT_VIEW2D_RENDER_CONFIG.showAxes,
    grid: { ...DEFAULT_GRID_CONFIG, ...config.grid },
    wall: { ...DEFAULT_WALL_RENDER_CONFIG, ...config.wall },
  };

  // 1. Nettoyage de l'arrière-plan
  clearCanvas(ctx, transform.viewportWidth, transform.viewportHeight, mergedConfig.backgroundColor);

  // 2. Grille de repérage et axes
  drawGrid(ctx, transform, mergedConfig.grid, mergedConfig.showAxes);

  // 3. Murs architecturaux
  const state = doc.getState();
  drawWalls(
    ctx,
    transform,
    state.walls,
    state.wallTypes,
    selectedIds,
    mergedConfig.wall,
    levelFilter,
  );

  // 4. Forme de prévisualisation interactive (rubber-band)
  if (preview) {
    drawPreview(ctx, transform, preview);
  }
}
