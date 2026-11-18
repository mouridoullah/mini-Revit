import {
  computeWallFootprint2d,
  vec2,
  solveWallJunctions,
  type WallInput,
  type Vec2,
  GEOM_CONFIG,
} from '@mini-bim/geometry';
import { type Transform2D } from './transform.js';
import {
  DEFAULT_COMPONENT_RENDER_CONFIG,
  drawComponents,
} from './components-2d.js';
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
  type RoomDiagnosticFor2D,
  type DimensionFor2D,
  type DimensionRenderConfig,
  type SlabFor2D,
  type SlabTypeFor2D,
  type SlabRenderConfig,
  type StairFor2D,
  type StairTypeFor2D,
  type StairRenderConfig,
  type RoofFor2D,
  type RoofTypeFor2D,
  type RoofOpeningFor2D,
  type RoofRenderConfig,
  type UnderlayRenderConfig,
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

export const DEFAULT_UNDERLAY_RENDER_CONFIG: UnderlayRenderConfig = Object.freeze({
  strokeColor: '#9ca3af',
  lineDash: [4, 4],
  opacity: 0.5,
});

export const DEFAULT_STAIR_RENDER_CONFIG: StairRenderConfig = Object.freeze({
  fillColor: 'rgba(249, 250, 251, 0.75)',
  strokeColor: '#374151',
  strokeWidth: 1.5,
  stepLineColor: '#4b5563',
  walklineColor: '#2563eb',
  walklineWidth: 1.5,
  selectedStrokeColor: '#2563eb',
  selectedStrokeWidth: 2.5,
});

export const DEFAULT_ROOF_RENDER_CONFIG: RoofRenderConfig = Object.freeze({
  fillColor: 'rgba(254, 243, 199, 0.4)', // Ambre très pâle translucide
  strokeColor: '#92400e', // Contour ambre/terre cuite
  strokeWidth: 1.5,
  ridgeColor: '#78350f', // Faîtage brun sombre marqué
  ridgeWidth: 2.5,
  ridgeDash: [],
  overhangStrokeColor: '#b45309', // Débord en tiret fin
  overhangDash: [4, 4],
  openingStrokeColor: '#92400e',
  selectedStrokeColor: '#2563eb',
  selectedStrokeWidth: 3,
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
  stair: DEFAULT_STAIR_RENDER_CONFIG,
  roof: DEFAULT_ROOF_RENDER_CONFIG,
  underlay: DEFAULT_UNDERLAY_RENDER_CONFIG,
  room: DEFAULT_ROOM_RENDER_CONFIG,
  dimension: DEFAULT_DIMENSION_RENDER_CONFIG,
  component: DEFAULT_COMPONENT_RENDER_CONFIG,
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

  const first = screenPoints[0]!;

  ctx.save();

  // 2. Poché architectural (Remplissage)
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < screenPoints.length; i++) {
    const pt = screenPoints[i]!;
    ctx.lineTo(pt.x, pt.y);
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
  const wallInputs: WallInput[] = [];
  const levelWalls: WallFor2D[] = [];

  for (const wall of Object.values(walls)) {
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

function getRidgeAxisPoints(
  ridgeAxis: { readonly start: Vec2; readonly end: Vec2 } | readonly [Vec2, Vec2] | undefined,
): readonly [Vec2, Vec2] | undefined {
  if (!ridgeAxis) return undefined;
  if ('start' in ridgeAxis && 'end' in ridgeAxis) {
    return [ridgeAxis.start, ridgeAxis.end];
  }
  if (Array.isArray(ridgeAxis) && ridgeAxis.length >= 2 && ridgeAxis[0] && ridgeAxis[1]) {
    return [ridgeAxis[0], ridgeAxis[1]];
  }
  return undefined;
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
  } else if (preview.kind === 'stair') {
    const dx = preview.end.x - preview.start.x;
    const dy = preview.end.y - preview.start.y;
    const len = Math.hypot(dx, dy);
    const width = preview.width ?? 900;
    if (len > 1e-4) {
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const halfW = width / 2;

      const c1 = transform.worldToScreen({
        x: preview.start.x - nx * halfW,
        y: preview.start.y - ny * halfW,
      });
      const c2 = transform.worldToScreen({
        x: preview.end.x - nx * halfW,
        y: preview.end.y - ny * halfW,
      });
      const c3 = transform.worldToScreen({
        x: preview.end.x + nx * halfW,
        y: preview.end.y + ny * halfW,
      });
      const c4 = transform.worldToScreen({
        x: preview.start.x + nx * halfW,
        y: preview.start.y + ny * halfW,
      });

      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const sStart = transform.worldToScreen(preview.start);
      const sEnd = transform.worldToScreen(preview.end);
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.moveTo(sStart.x, sStart.y);
      ctx.lineTo(sEnd.x, sEnd.y);
      ctx.stroke();

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(sStart.x, sStart.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sEnd.x, sEnd.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (preview.kind === 'roof') {
    if (preview.footprint.length > 0) {
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(254, 243, 199, 0.25)';
      const firstPt = preview.footprint[0];
      if (firstPt) {
        const p0 = transform.worldToScreen(firstPt);
        ctx.moveTo(p0.x, p0.y);
      }
      for (let i = 1; i < preview.footprint.length; i++) {
        const pt = preview.footprint[i];
        if (pt) {
          const pi = transform.worldToScreen(pt);
          ctx.lineTo(pi.x, pi.y);
        }
      }
      if (preview.footprint.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      for (const p of preview.footprint) {
        const sp = transform.worldToScreen(p);
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      const ridgePoints = getRidgeAxisPoints(preview.ridgeAxis);
      if (ridgePoints) {
        const r0 = transform.worldToScreen(ridgePoints[0]);
        const r1 = transform.worldToScreen(ridgePoints[1]);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2.5;
        ctx.moveTo(r0.x, r0.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.stroke();
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
 * Dessine les diagnostics visuels des pièces (brèches de fuite en tiret rouge, alertes).
 */
export function drawRoomDiagnostics(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  diagnostics: readonly RoomDiagnosticFor2D[],
): void {
  if (diagnostics.length === 0) return;

  ctx.save();

  for (const diag of diagnostics) {
    if (diag.kind === 'unclosed_boundary' && diag.leakGap) {
      const p1 = transform.worldToScreen(diag.leakGap.start);
      const p2 = transform.worldToScreen(diag.leakGap.end);

      // 1. Ligne en tireté rouge vif entre les deux extrémités de la brèche
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // 2. Pastilles aux extrémités
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
      ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // 3. Badge d'alerte avec la taille de la fuite au centre du gap
      const midScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const badgeText = `⚠️ Fuite : ${diag.leakGap.distanceMm} mm`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = typeof ctx.measureText === 'function' ? ctx.measureText(badgeText).width : badgeText.length * 7;
      const padX = 6;
      const padY = 3;

      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(
          midScreen.x - textWidth / 2 - padX,
          midScreen.y - 12 - padY,
          textWidth + padX * 2,
          16 + padY,
          4,
        );
        ctx.fill();
      } else {
        ctx.fillRect(
          midScreen.x - textWidth / 2 - padX,
          midScreen.y - 12 - padY,
          textWidth + padX * 2,
          16 + padY,
        );
      }

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, midScreen.x, midScreen.y - 4);
    }

    // Badge d'état au niveau du seed de la pièce non enclose
    const seedScreen = transform.worldToScreen(diag.seed);
    const label =
      diag.kind === 'redundant'
        ? `⚠️ ${diag.roomName} (Redondant)`
        : `⚠️ ${diag.roomName} (Non clos)`;
    const bgCol =
      diag.kind === 'redundant'
        ? 'rgba(245, 158, 11, 0.9)'
        : 'rgba(239, 68, 68, 0.85)';

    ctx.font = 'bold 11px sans-serif';
    const labelWidth = typeof ctx.measureText === 'function' ? ctx.measureText(label).width : label.length * 7;
    const pX = 6;
    const pY = 3;

    ctx.fillStyle = bgCol;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(
        seedScreen.x - labelWidth / 2 - pX,
        seedScreen.y - 8 - pY,
        labelWidth + pX * 2,
        16 + pY,
        4,
      );
      ctx.fill();
    } else {
      ctx.fillRect(
        seedScreen.x - labelWidth / 2 - pX,
        seedScreen.y - 8 - pY,
        labelWidth + pX * 2,
        16 + pY,
      );
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, seedScreen.x, seedScreen.y);
  }

  ctx.restore();
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

/**
 * Dessine un escalier droit paramétrique en vue en plan 2D (ADR-048).
 * Représente l'emprise rectangulaire, les nez de marches et la ligne de foulée
 * axiale avec cercle d'ancrage en pied et flèche orientée en tête.
 */
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
): void {
  const stairList = Array.isArray(stairs) ? stairs : Object.values(stairs);
  for (const stair of stairList) {
    if (levelFilter && stair.bottomLevelId && stair.bottomLevelId !== levelFilter) {
      continue;
    }
    const stairType = stair.stairTypeId ? stairTypes[stair.stairTypeId] : undefined;
    const isSelected = selectedIds.has(stair.id);
    drawStair(ctx, transform, stair, stairType, isSelected, config);
  }
}

/**
 * Calcule l'offset extérieur d'un polygone 2D pour le tracé du débord de toiture.
 */
export function offsetPolygonSimple(poly: readonly Vec2[], distanceMm: number): Vec2[] {
  if (poly.length < 3 || Math.abs(distanceMm) < 1e-4) return [...poly];
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    if (!p1 || !p2) continue;
    area += (p2.x - p1.x) * (p2.y + p1.y);
  }
  const isCCW = area < 0;
  const sign = isCCW ? 1 : -1;

  const shiftedLines: { p: Vec2; d: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    const nx = (dy / len) * sign;
    const ny = (-dx / len) * sign;
    shiftedLines.push({
      p: vec2(p1.x + nx * distanceMm, p1.y + ny * distanceMm),
      d: vec2(dx / len, dy / len),
    });
  }

  const m = shiftedLines.length;
  if (m < 3) return [...poly];

  const result: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const prev = shiftedLines[(i - 1 + m) % m];
    const cur = shiftedLines[i];
    if (!prev || !cur) continue;
    const det = prev.d.x * cur.d.y - prev.d.y * cur.d.x;
    if (Math.abs(det) < 1e-6) {
      result.push(cur.p);
    } else {
      const dx = cur.p.x - prev.p.x;
      const dy = cur.p.y - prev.p.y;
      const t1 = (dx * cur.d.y - dy * cur.d.x) / det;
      result.push(vec2(prev.p.x + t1 * prev.d.x, prev.p.y + t1 * prev.d.y));
    }
  }
  return result;
}

/**
 * Dessine une toiture en vue en plan 2D (ADR-053).
 * Trace l'empreinte, le débord, le faîtage en trait fort et les réservations d'ouvertures.
 */
export function drawRoof(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  roof: RoofFor2D,
  roofType?: RoofTypeFor2D,
  roofOpenings: readonly RoofOpeningFor2D[] = [],
  isSelected: boolean = false,
  config: RoofRenderConfig = DEFAULT_ROOF_RENDER_CONFIG,
): void {
  if (!roof.footprint || roof.footprint.length < 3) return;

  ctx.save();

  const screenFootprint = roof.footprint.map((p) => transform.worldToScreen(p));
  const overhang =
    roof.overhangOverride ??
    (roofType && roofType.family === 'gable' ? roofType.overhangMm : 0) ??
    0;

  let screenOverhang: Vec2[] | null = null;
  if (overhang > 0) {
    const expanded = offsetPolygonSimple(roof.footprint, overhang);
    if (expanded.length >= 3) {
      screenOverhang = expanded.map((p) => transform.worldToScreen(p));
    }
  }

  const outerPoly = screenOverhang ?? screenFootprint;

  // Calcul des ouvertures (skylights)
  const screenOpenings: Vec2[][] = [];
  for (const op of roofOpenings) {
    if (op.roofId && op.roofId !== roof.id) continue;
    const p0 = transform.worldToScreen(vec2(op.offsetU, op.offsetV));
    const p1 = transform.worldToScreen(vec2(op.offsetU + op.width, op.offsetV));
    const p2 = transform.worldToScreen(vec2(op.offsetU + op.width, op.offsetV + op.height));
    const p3 = transform.worldToScreen(vec2(op.offsetU, op.offsetV + op.height));
    screenOpenings.push([p0, p1, p2, p3]);
  }

  // 1. Poché translucide avec évidement des ouvertures
  ctx.beginPath();
  let isFirstOuter = true;
  for (const pt of outerPoly) {
    if (isFirstOuter) {
      ctx.moveTo(pt.x, pt.y);
      isFirstOuter = false;
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.closePath();

  for (const opPts of screenOpenings) {
    let isFirstOp = true;
    for (const pt of opPts) {
      if (isFirstOp) {
        ctx.moveTo(pt.x, pt.y);
        isFirstOp = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.closePath();
  }

  ctx.fillStyle = config.fillColor;
  ctx.fill('evenodd');

  // 2. Contour de débord ou d'empreinte
  ctx.beginPath();
  let isFirstContour = true;
  for (const pt of outerPoly) {
    if (isFirstContour) {
      ctx.moveTo(pt.x, pt.y);
      isFirstContour = false;
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.closePath();
  ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
  ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;
  if (screenOverhang) {
    ctx.setLineDash(config.overhangDash ?? [4, 4]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();

  // Si débord, tracer aussi l'empreinte murale intérieure
  if (screenOverhang) {
    ctx.beginPath();
    let isFirstFootprint = true;
    for (const pt of screenFootprint) {
      if (isFirstFootprint) {
        ctx.moveTo(pt.x, pt.y);
        isFirstFootprint = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.closePath();
    ctx.setLineDash([]);
    ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 3. Faîtage (ridgeAxis) en trait fort
  const ridgePoints = getRidgeAxisPoints(roof.ridgeAxis);
  if (ridgePoints) {
    const rStart = transform.worldToScreen(ridgePoints[0]);
    const rEnd = transform.worldToScreen(ridgePoints[1]);
    ctx.beginPath();
    ctx.moveTo(rStart.x, rStart.y);
    ctx.lineTo(rEnd.x, rEnd.y);
    ctx.strokeStyle = isSelected ? config.selectedStrokeColor : config.ridgeColor;
    ctx.lineWidth = isSelected ? config.selectedStrokeWidth : config.ridgeWidth;
    ctx.setLineDash(config.ridgeDash ?? []);
    ctx.stroke();
  }

  // 4. Ouvertures (skylights) : contour et croix de réservation
  for (const opPts of screenOpenings) {
    ctx.beginPath();
    let isFirstSkylight = true;
    for (const pt of opPts) {
      if (isFirstSkylight) {
        ctx.moveTo(pt.x, pt.y);
        isFirstSkylight = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.closePath();
    ctx.strokeStyle = config.openingStrokeColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();

    const p0 = opPts[0];
    const p1 = opPts[1];
    const p2 = opPts[2];
    const p3 = opPts[3];
    if (p0 && p1 && p2 && p3) {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Dessine l'ensemble des toitures du document associées au niveau actif.
 */
export function drawRoofs(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  roofs: Record<string, RoofFor2D> | readonly RoofFor2D[],
  roofTypes: Record<string, RoofTypeFor2D> = {},
  roofOpenings: Record<string, RoofOpeningFor2D> | readonly RoofOpeningFor2D[] = [],
  selectedIds: ReadonlySet<string> = new Set(),
  config: RoofRenderConfig = DEFAULT_ROOF_RENDER_CONFIG,
  levelFilter?: string | null,
): void {
  const roofList = Array.isArray(roofs) ? roofs : Object.values(roofs);
  const openingList = Array.isArray(roofOpenings) ? roofOpenings : Object.values(roofOpenings);

  for (const roof of roofList) {
    if (levelFilter && roof.levelId && roof.levelId !== levelFilter) {
      continue;
    }
    const roofType = roof.roofTypeId ? roofTypes[roof.roofTypeId] : undefined;
    const isSelected = selectedIds.has(roof.id);
    const relatedOpenings = openingList.filter((op) => op.roofId === roof.id);
    drawRoof(ctx, transform, roof, roofType, relatedOpenings, isSelected, config);
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
  underlayPath?: Path2D | null,
  roofs?: readonly RoofFor2D[],
  roomDiagnostics?: readonly RoomDiagnosticFor2D[],
): void {
  const mergedConfig: View2DRenderConfig = {
    backgroundColor: config.backgroundColor ?? DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
    showAxes: config.showAxes ?? DEFAULT_VIEW2D_RENDER_CONFIG.showAxes,
    grid: { ...DEFAULT_GRID_CONFIG, ...config.grid },
    wall: { ...DEFAULT_WALL_RENDER_CONFIG, ...config.wall },
    slab: { ...DEFAULT_SLAB_RENDER_CONFIG, ...config.slab },
    stair: { ...DEFAULT_STAIR_RENDER_CONFIG, ...config.stair },
    roof: { ...DEFAULT_ROOF_RENDER_CONFIG, ...config.roof },
    underlay: { ...DEFAULT_UNDERLAY_RENDER_CONFIG, ...config.underlay },
    room: { ...DEFAULT_ROOM_RENDER_CONFIG, ...config.room },
    dimension: { ...DEFAULT_DIMENSION_RENDER_CONFIG, ...config.dimension },
    component: { ...DEFAULT_COMPONENT_RENDER_CONFIG, ...config.component },
  };

  // 1. Nettoyage de l'arrière-plan
  clearCanvas(ctx, transform.viewportWidth, transform.viewportHeight, mergedConfig.backgroundColor);

  // 2. Grille de repérage et axes
  drawGrid(ctx, transform, mergedConfig.grid, mergedConfig.showAxes);

  // 2b. Vue fantôme (Underlay) du niveau inférieur
  if (underlayPath) {
    drawUnderlay(ctx, transform, underlayPath, mergedConfig.underlay);
  }

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

  // 3b. Escaliers droits paramétriques
  if (state.stairs && Object.keys(state.stairs).length > 0) {
    drawStairs(
      ctx,
      transform,
      state.stairs,
      state.stairTypes ?? {},
      selectedIds,
      mergedConfig.stair,
      levelFilter,
    );
  }

  // 3c. Toitures (Toits plats et toits 2 pans avec faîtage et débords)
  const effectiveRoofs: readonly RoofFor2D[] =
    roofs ?? (state.roofs ? Object.values(state.roofs) : []);
  if (effectiveRoofs.length > 0) {
    drawRoofs(
      ctx,
      transform,
      effectiveRoofs,
      state.roofTypes ?? {},
      state.roofOpenings ?? {},
      selectedIds,
      mergedConfig.roof,
      levelFilter,
    );
  }

  // 4. Pièces closes (poché pastel de fond et libellés)
  if (rooms && rooms.length > 0) {
    drawRooms(ctx, transform, rooms, mergedConfig.room);
  }

  // 4b. Composants d'aménagement et mobilier
  if (state.components && Object.keys(state.components).length > 0) {
    drawComponents(
      ctx,
      transform,
      state.components,
      state.componentTypes ?? {},
      selectedIds,
      mergedConfig.component,
      levelFilter,
    );
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

  // 6b. Diagnostics visuels des pièces (fuites, brèches, alertes)
  if (roomDiagnostics && roomDiagnostics.length > 0) {
    drawRoomDiagnostics(ctx, transform, roomDiagnostics);
  }

  // 7. Forme de prévisualisation interactive (rubber-band)
  if (preview) {
    drawPreview(ctx, transform, preview);
  }
}
