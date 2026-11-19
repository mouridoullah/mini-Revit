import {
  type GridConfig,
  type WallRenderConfig,
  type View2DRenderConfig,
  type RoomRenderConfig,
  type DimensionRenderConfig,
  type SlabRenderConfig,
  type StairRenderConfig,
  type RoofRenderConfig,
  type UnderlayRenderConfig,
} from '../types.js';
import { DEFAULT_COMPONENT_RENDER_CONFIG } from '../components-2d.js';

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
