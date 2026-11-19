import { vec2, type Vec2 } from '@mini-bim/geometry';
import type { Transform2D } from '../transform.js';
import type {
  RoofFor2D,
  RoofTypeFor2D,
  RoofOpeningFor2D,
  RoofRenderConfig,
} from '../types.js';
import { DEFAULT_ROOF_RENDER_CONFIG } from './config.js';
import { getRidgeAxisPoints } from './preview.js';

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
  visibleRoofIds?: ReadonlySet<string> | null,
): void {
  const roofList = Array.isArray(roofs) ? roofs : Object.values(roofs);
  const openingList = Array.isArray(roofOpenings) ? roofOpenings : Object.values(roofOpenings);

  for (const roof of roofList) {
    if (visibleRoofIds && !visibleRoofIds.has(roof.id)) {
      continue;
    }
    if (levelFilter && roof.levelId && roof.levelId !== levelFilter) {
      continue;
    }
    const roofType = roof.roofTypeId ? roofTypes[roof.roofTypeId] : undefined;
    const isSelected = selectedIds.has(roof.id);
    const relatedOpenings = openingList.filter((op) => op.roofId === roof.id);
    drawRoof(ctx, transform, roof, roofType, relatedOpenings, isSelected, config);
  }
}
