import type { Transform2D } from '../transform.js';
import type {
  DetectedRoomFor2D,
  RoomRenderConfig,
  RoomDiagnosticFor2D,
} from '../types.js';
import { DEFAULT_ROOM_RENDER_CONFIG } from './config.js';

export function drawRooms(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  rooms: readonly DetectedRoomFor2D[],
  config: RoomRenderConfig = DEFAULT_ROOM_RENDER_CONFIG,
  visibleRoomIds?: ReadonlySet<string> | null,
): void {
  if (rooms.length === 0) return;

  for (const room of rooms) {
    if (visibleRoomIds && room.id && !visibleRoomIds.has(room.id)) continue;
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
