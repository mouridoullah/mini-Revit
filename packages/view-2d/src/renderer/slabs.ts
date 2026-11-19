import type { Transform2D } from '../transform.js';
import type { SlabFor2D, SlabTypeFor2D, SlabRenderConfig } from '../types.js';
import { DEFAULT_SLAB_RENDER_CONFIG } from './config.js';

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
    const pt = screenOuter[i];
    if (!pt) continue;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();

  for (const hole of allHoles) {
    const screenHole = hole.map((p) => transform.worldToScreen(p));
    for (let i = 0; i < screenHole.length; i++) {
      const pt = screenHole[i];
      if (!pt) continue;
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
    const pt = screenOuter[i];
    if (!pt) continue;
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
      const pt = screenHole[i];
      if (!pt) continue;
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
  visibleSlabIds?: ReadonlySet<string> | null,
): void {
  const slabList = Array.isArray(slabs) ? slabs : Object.values(slabs);
  for (const slab of slabList) {
    if (visibleSlabIds && !visibleSlabIds.has(slab.id)) {
      continue;
    }
    if (levelFilter && slab.levelId && slab.levelId !== levelFilter) {
      continue;
    }
    const slabType = slab.slabTypeId ? slabTypes[slab.slabTypeId] : undefined;
    const isSelected = selectedIds.has(slab.id);
    drawSlab(ctx, transform, slab, slabType, isSelected, config);
  }
}
