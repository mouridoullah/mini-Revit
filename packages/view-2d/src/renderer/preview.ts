import type { Vec2 } from '@mini-bim/geometry';
import type { Transform2D } from '../transform.js';
import type { PreviewShape } from '../types.js';

export function getRidgeAxisPoints(
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
      const firstPt = preview.points[0];
      if (firstPt) {
        const p0 = transform.worldToScreen(firstPt);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < preview.points.length; i++) {
          const pt = preview.points[i];
          if (pt) {
            const pi = transform.worldToScreen(pt);
            ctx.lineTo(pi.x, pi.y);
          }
        }
        if (preview.points.length >= 3) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }

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
