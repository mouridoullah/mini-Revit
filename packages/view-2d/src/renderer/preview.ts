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
  } else if (preview.kind === 'mep') {
    const sStart = transform.worldToScreen(preview.start);
    const sEnd = transform.worldToScreen(preview.end);
    const color = preview.color ?? '#2563eb';
    const isDoubleLine = preview.mode === 'double-line';

    const dx = preview.end.x - preview.start.x;
    const dy = preview.end.y - preview.start.y;
    const len = Math.hypot(dx, dy);

    if (len > 1e-3) {
      if (isDoubleLine) {
        const widthMm = preview.width ?? preview.diameter ?? 100;
        const halfW = widthMm / 2;
        const ux = -dy / len;
        const uy = dx / len;

        const p1 = transform.worldToScreen({ x: preview.start.x + ux * halfW, y: preview.start.y + uy * halfW });
        const p2 = transform.worldToScreen({ x: preview.end.x + ux * halfW, y: preview.end.y + uy * halfW });
        const p3 = transform.worldToScreen({ x: preview.end.x - ux * halfW, y: preview.end.y - uy * halfW });
        const p4 = transform.worldToScreen({ x: preview.start.x - ux * halfW, y: preview.start.y - uy * halfW });

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        // Axe central
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(sStart.x, sStart.y);
        ctx.lineTo(sEnd.x, sEnd.y);
        ctx.stroke();
      } else {
        // Mode unifilaire
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(sStart.x, sStart.y);
        ctx.lineTo(sEnd.x, sEnd.y);
        ctx.stroke();
      }
    }

    // Extrémité de départ
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sStart.x, sStart.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Extrémité courante
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sEnd.x, sEnd.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Indicateur de port snappé
    if (preview.snappedPort) {
      const snapScreen = transform.worldToScreen(preview.snappedPort.pos);
      const isCompat = preview.snappedPort.compatible;
      const haloColor = isCompat ? '#22c55e' : '#ef4444'; // Vert si compatible, rouge si incompatible

      ctx.save();
      // Halo
      ctx.strokeStyle = haloColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.fillStyle = isCompat ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.beginPath();
      ctx.arc(snapScreen.x, snapScreen.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Point central
      ctx.fillStyle = haloColor;
      ctx.beginPath();
      ctx.arc(snapScreen.x, snapScreen.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Croix rouge en cas d'incompatibilité
      if (!isCompat) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(snapScreen.x - 3, snapScreen.y - 3);
        ctx.lineTo(snapScreen.x + 3, snapScreen.y + 3);
        ctx.moveTo(snapScreen.x + 3, snapScreen.y - 3);
        ctx.lineTo(snapScreen.x - 3, snapScreen.y + 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
