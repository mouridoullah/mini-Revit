import { computeWallFootprint2d, vec2 } from '@mini-bim/geometry';
import { type Transform2D } from './transform.js';
import {
  type GridConfig,
  type WallRenderConfig,
  type View2DRenderConfig,
  type PreviewShape,
  type WallFor2D,
  type WallTypeFor2D,
  type DocumentFor2D,
  type DoorFor2D,
  type WindowFor2D,
  type OpeningFor2D,
  type DetectedRoomFor2D,
  type RoomRenderConfig,
  type DimensionFor2D,
  type DimensionRenderConfig,
  type SlabFor2D,
  type SlabTypeFor2D,
  type SlabRenderConfig,
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
 * Configuration stylistique par défaut des pièces architecturales en plan.
 */
export const DEFAULT_ROOM_RENDER_CONFIG: RoomRenderConfig = Object.freeze({
  fillColor: 'rgba(147, 197, 253, 0.25)', // Bleu pastel translucide
  textColor: '#1e3a8a', // Bleu marine
  subTextColor: '#2563eb', // Bleu primaire
  font: 'bold 12px sans-serif',
  subFont: '10px sans-serif',
});

/**
 * Configuration stylistique par défaut des cotations 2D.
 */
export const DEFAULT_DIMENSION_RENDER_CONFIG: DimensionRenderConfig = Object.freeze({
  lineColor: '#1f2937',
  textColor: '#111827',
  tickColor: '#1f2937',
  font: 'bold 11px sans-serif',
  lineWidth: 1,
  tickSize: 6,
});

export const DEFAULT_SLAB_RENDER_CONFIG: SlabRenderConfig = Object.freeze({
  fillColor: '#f3f4f6',
  strokeColor: '#374151',
  strokeWidth: 1,
  hatchColor: '#e5e7eb',
  hatchSpacing: 250,
  holeStrokeColor: '#374151',
  selectedStrokeColor: '#3b82f6',
  selectedStrokeWidth: 2,
});

/**
 * Configuration globale par défaut du rendu 2D.
 */
export const DEFAULT_VIEW2D_RENDER_CONFIG: View2DRenderConfig = Object.freeze({
  backgroundColor: '#ffffff',
  showAxes: true,
  grid: DEFAULT_GRID_CONFIG,
  wall: DEFAULT_WALL_RENDER_CONFIG,
  slab: DEFAULT_SLAB_RENDER_CONFIG,
  room: DEFAULT_ROOM_RENDER_CONFIG,
  dimension: DEFAULT_DIMENSION_RENDER_CONFIG,
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
  wall: WallFor2D,
  wallType: WallTypeFor2D,
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
  const dAny = door as unknown as Record<string, unknown>;
  const fallbackWidth = typeof dAny['width'] === 'number' ? (dAny['width'] as number) : 900;
  const doorWidth = customDoorWidth ?? fallbackWidth;
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
  const wAny = window as unknown as Record<string, unknown>;
  const fallbackWidth = typeof wAny['width'] === 'number' ? (wAny['width'] as number) : 1200;
  const winWidth = customWinWidth ?? fallbackWidth;
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
): void {
  for (const op of openings) {
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

/**
 * Dessine l'ensemble des murs du document dans le canvas.
 */
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  walls: Record<string, WallFor2D>,
  wallTypes: Record<string, WallTypeFor2D>,
  selectedIds: ReadonlySet<string>,
  config: WallRenderConfig = DEFAULT_WALL_RENDER_CONFIG,
  levelFilter?: string | null,
): void {
  for (const wall of Object.values(walls)) {
    if (levelFilter && wall.levelId && wall.levelId !== levelFilter) {
      continue;
    }

    const wallType = wall.typeId ? wallTypes[wall.typeId] : undefined;
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
  } else if (preview.kind === 'polygon') {
    if (preview.points.length > 0) {
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
      const p0 = transform.worldToScreen(preview.points[0]!);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < preview.points.length; i++) {
        const pi = transform.worldToScreen(preview.points[i]!);
        ctx.lineTo(pi.x, pi.y);
      }
      if (preview.points.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      // Pastilles indicatrices aux sommets
      ctx.fillStyle = '#2563eb';
      for (const p of preview.points) {
        const sp = transform.worldToScreen(p);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * Rendu des pièces détectées en vue en plan : poché architectural translucide et libellé central.
 */
export function drawRooms(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  rooms: readonly DetectedRoomFor2D[],
  config: RoomRenderConfig = DEFAULT_ROOM_RENDER_CONFIG,
): void {
  if (rooms.length === 0) return;

  for (const room of rooms) {
    if (room.polygon.length < 3) continue;

    ctx.save();
    ctx.beginPath();

    // 1. Remplissage du polygone extérieur
    const first = room.polygon[0];
    if (!first) {
      ctx.restore();
      continue;
    }
    const p0 = transform.worldToScreen(first);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < room.polygon.length; i++) {
      const p = room.polygon[i];
      if (!p) continue;
      const pt = transform.worldToScreen(p);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    // 2. Évidement des éventuels îlots / poteaux intérieurs
    if (room.holes && room.holes.length > 0) {
      for (const hole of room.holes) {
        if (hole.length < 3) continue;
        const h0Pt = hole[0];
        if (!h0Pt) continue;
        const h0 = transform.worldToScreen(h0Pt);
        ctx.moveTo(h0.x, h0.y);
        for (let j = 1; j < hole.length; j++) {
          const h = hole[j];
          if (!h) continue;
          const hPt = transform.worldToScreen(h);
          ctx.lineTo(hPt.x, hPt.y);
        }
        ctx.closePath();
      }
    }

    ctx.fillStyle = room.color ?? config.fillColor;
    ctx.fill('evenodd');

    // 3. Libellé textuel de la pièce (Nom + Surface en m²) au point de repère (seed)
    const screenSeed = transform.worldToScreen(room.seed);
    const roomName = room.name ?? 'Pièce';
    const areaM2 = (room.areaMm2 / 1e6).toFixed(2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = config.font;
    ctx.fillStyle = config.textColor;
    ctx.fillText(roomName, screenSeed.x, screenSeed.y - 7);

    ctx.font = config.subFont;
    ctx.fillStyle = config.subTextColor;
    ctx.fillText(`${areaM2} m²`, screenSeed.x, screenSeed.y + 7);

    ctx.restore();
  }
}

/**
 * Dessine les cotations linéaires 2D (lignes de rappel, ligne de cote, traits obliques 45° et valeur).
 */
export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  dimensions: readonly DimensionFor2D[],
  walls: Record<string, WallFor2D>,
  config: DimensionRenderConfig = DEFAULT_DIMENSION_RENDER_CONFIG,
  levelFilter?: string | null,
): void {
  if (dimensions.length === 0) return;

  ctx.save();
  ctx.lineWidth = config.lineWidth;
  ctx.strokeStyle = config.lineColor;
  ctx.fillStyle = config.textColor;
  ctx.font = config.font;

  for (const dim of dimensions) {
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

/**
 * Dessine une dalle horizontale 2D avec son poché béton, ses hachures diagonales,
 * son contour et ses réservations/trémies avec croix diagonale normalisée.
 */
export function drawSlab(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  slab: SlabFor2D,
  _slabType?: SlabTypeFor2D,
  isSelected: boolean = false,
  config: SlabRenderConfig = DEFAULT_SLAB_RENDER_CONFIG,
): void {
  if (!slab.boundary || slab.boundary.length < 3) return;

  const allHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])].filter(
    (h) => h && h.length >= 3,
  );

  ctx.save();

  // 1. Tracer le chemin extérieur + trous avec evenodd
  ctx.beginPath();
  const screenOuter = slab.boundary.map((p) => transform.worldToScreen(p));
  for (let i = 0; i < screenOuter.length; i++) {
    const pt = screenOuter[i]!;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();

  for (const hole of allHoles) {
    const screenHole = hole.map((p) => transform.worldToScreen(p));
    for (let i = 0; i < screenHole.length; i++) {
      const pt = screenHole[i]!;
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
  }

  // 2. Poché béton
  ctx.fillStyle = config.fillColor;
  ctx.fill('evenodd');

  // 3. Hachures béton à 45°
  ctx.save();
  ctx.clip('evenodd');

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of screenOuter) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const screenSpacing = Math.max(12, transform.worldDistanceToScreen(config.hatchSpacing));
  ctx.beginPath();
  ctx.strokeStyle = config.hatchColor;
  ctx.lineWidth = 1;

  const diagMin = minX + minY;
  const diagMax = maxX + maxY;
  const diagStep = screenSpacing * Math.SQRT2;

  for (let c = diagMin; c <= diagMax; c += diagStep) {
    ctx.moveTo(c - maxY, maxY);
    ctx.lineTo(maxX, c - maxX);
  }
  ctx.stroke();
  ctx.restore(); // Retire le clip de hachure

  // 4. Contour périphérique de la dalle
  ctx.beginPath();
  for (let i = 0; i < screenOuter.length; i++) {
    const pt = screenOuter[i]!;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;
  ctx.stroke();

  // 5. Trémies (Holes & Openings) : contour + croix de réservation
  for (const hole of allHoles) {
    const screenHole = hole.map((p) => transform.worldToScreen(p));
    ctx.beginPath();
    for (let i = 0; i < screenHole.length; i++) {
      const pt = screenHole[i]!;
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.strokeStyle = config.holeStrokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Croix de réservation diagonale
    let hMinX = Number.POSITIVE_INFINITY;
    let hMaxX = Number.NEGATIVE_INFINITY;
    let hMinY = Number.POSITIVE_INFINITY;
    let hMaxY = Number.NEGATIVE_INFINITY;
    for (const p of screenHole) {
      hMinX = Math.min(hMinX, p.x);
      hMaxX = Math.max(hMaxX, p.x);
      hMinY = Math.min(hMinY, p.y);
      hMaxY = Math.max(hMaxY, p.y);
    }

    ctx.beginPath();
    ctx.moveTo(hMinX, hMinY);
    ctx.lineTo(hMaxX, hMaxY);
    ctx.moveTo(hMinX, hMaxY);
    ctx.lineTo(hMaxX, hMinY);
    ctx.strokeStyle = config.holeStrokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Dessine l'ensemble des dalles du document associées au niveau actif.
 */
export function drawSlabs(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  slabs: Record<string, SlabFor2D> | readonly SlabFor2D[],
  slabTypes: Record<string, SlabTypeFor2D> = {},
  selectedIds: ReadonlySet<string> = new Set(),
  config: SlabRenderConfig = DEFAULT_SLAB_RENDER_CONFIG,
  levelFilter?: string | null,
): void {
  const slabList = Array.isArray(slabs) ? slabs : Object.values(slabs);
  for (const slab of slabList) {
    if (levelFilter && slab.levelId && slab.levelId !== levelFilter) {
      continue;
    }
    const slabType = slab.slabTypeId ? slabTypes[slab.slabTypeId] : undefined;
    const isSelected = selectedIds.has(slab.id);
    drawSlab(ctx, transform, slab, slabType, isSelected, config);
  }
}

/**
 * Fonction pure orchestrant le cycle de rendu complet d'une vue en plan 2D.
 */
export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  doc: DocumentFor2D,
  selectedIds: ReadonlySet<string> = new Set(),
  config: Partial<View2DRenderConfig> = {},
  levelFilter?: string | null,
  preview?: PreviewShape | null,
  openings?: readonly OpeningFor2D[],
  rooms?: readonly DetectedRoomFor2D[],
  dimensions?: readonly DimensionFor2D[],
  slabs?: readonly SlabFor2D[],
): void {
  const mergedConfig: View2DRenderConfig = {
    backgroundColor: config.backgroundColor ?? DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
    showAxes: config.showAxes ?? DEFAULT_VIEW2D_RENDER_CONFIG.showAxes,
    grid: { ...DEFAULT_GRID_CONFIG, ...config.grid },
    wall: { ...DEFAULT_WALL_RENDER_CONFIG, ...config.wall },
    slab: { ...DEFAULT_SLAB_RENDER_CONFIG, ...config.slab },
    room: { ...DEFAULT_ROOM_RENDER_CONFIG, ...config.room },
    dimension: { ...DEFAULT_DIMENSION_RENDER_CONFIG, ...config.dimension },
  };

  // 1. Nettoyage de l'arrière-plan
  clearCanvas(ctx, transform.viewportWidth, transform.viewportHeight, mergedConfig.backgroundColor);

  // 2. Grille de repérage et axes
  drawGrid(ctx, transform, mergedConfig.grid, mergedConfig.showAxes);

  // 3. Dalles horizontales (poché béton, hachures et trémies)
  const state = doc.getState();
  const effectiveSlabs: readonly SlabFor2D[] =
    slabs ?? (state.slabs ? Object.values(state.slabs) : []);
  if (effectiveSlabs.length > 0) {
    drawSlabs(
      ctx,
      transform,
      effectiveSlabs,
      state.slabTypes ?? {},
      selectedIds,
      mergedConfig.slab,
      levelFilter,
    );
  }

  // 4. Pièces closes (poché pastel de fond et libellés)
  if (rooms && rooms.length > 0) {
    drawRooms(ctx, transform, rooms, mergedConfig.room);
  }

  // 5. Murs architecturaux
  drawWalls(
    ctx,
    transform,
    state.walls,
    state.wallTypes,
    selectedIds,
    mergedConfig.wall,
    levelFilter,
  );

  // 5. Ouvertures architecturales (portes et fenêtres avec évidement du poché)
  let effectiveOpenings: readonly OpeningFor2D[] = openings ?? [];
  if (!openings) {
    const doors = state.doors
      ? Object.values(state.doors).map((d) => ({ ...d, kind: 'door' as const }))
      : [];
    const windows = state.windows
      ? Object.values(state.windows).map((w) => ({ ...w, kind: 'window' as const }))
      : [];
    effectiveOpenings = [...doors, ...windows];
  }

  if (effectiveOpenings.length > 0) {
    drawOpenings(
      ctx,
      transform,
      state.walls,
      state.wallTypes,
      effectiveOpenings,
      selectedIds,
      mergedConfig.wall,
      mergedConfig.backgroundColor,
      levelFilter,
      state.doorTypes,
      state.windowTypes,
    );
  }

  // 6. Cotations 2D associatives
  let effectiveDimensions: readonly DimensionFor2D[] = dimensions ?? [];
  if (!dimensions && state.dimensions) {
    effectiveDimensions = Object.values(state.dimensions);
  }

  if (effectiveDimensions.length > 0) {
    drawDimensions(
      ctx,
      transform,
      effectiveDimensions,
      state.walls,
      mergedConfig.dimension,
      levelFilter,
    );
  }

  // 7. Forme de prévisualisation interactive (rubber-band)
  if (preview) {
    drawPreview(ctx, transform, preview);
  }
}
