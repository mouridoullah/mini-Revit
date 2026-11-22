import type { Vec2 } from '@mini-bim/geometry';
import type { Transform2D } from '../transform.js';
import type { SectionCutFor2D } from '../types.js';

/**
 * Dessine les symboles de coupe normalisés ISO sur le plan 2D (ADR-063).
 *
 * Conforme aux normes graphiques d'architecture :
 * - Trait mixte fort (tiret-point) le long du segment
 * - Pastilles d'extrémités avec libellé de coupe (ex: "A", "B")
 * - Flèches directionnelles indiquant le sens d'observation
 * - Zone de profondeur ombrée lors de la sélection
 */
export function drawSectionCuts(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  cuts: readonly SectionCutFor2D[],
  selectedIds?: ReadonlySet<string> | undefined,
): void {
  if (cuts.length === 0) return;

  for (const cut of cuts) {
    const isSelected = selectedIds ? selectedIds.has(cut.id) : false;

    const sStart = transform.worldToScreen(cut.start);
    const sEnd = transform.worldToScreen(cut.end);

    const dx = cut.end.x - cut.start.x;
    const dy = cut.end.y - cut.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    // Normale vers la profondeur d > 0 : n = viewDirection * (-uy, ux)
    const nx = cut.viewDirection * -uy;
    const ny = cut.viewDirection * ux;

    ctx.save();

    // 1. Zone de profondeur (si sélectionné)
    if (isSelected && cut.depth > 0) {
      const p3 = {
        x: cut.end.x + cut.depth * nx,
        y: cut.end.y + cut.depth * ny,
      };
      const p4 = {
        x: cut.start.x + cut.depth * nx,
        y: cut.start.y + cut.depth * ny,
      };

      const s3 = transform.worldToScreen(p3);
      const s4 = transform.worldToScreen(p4);

      ctx.beginPath();
      ctx.moveTo(sStart.x, sStart.y);
      ctx.lineTo(sEnd.x, sEnd.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();

      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.fill();

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Ligne de coupe principale (trait mixte fort)
    const color = isSelected ? '#2563eb' : '#0f172a';
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2.5 : 2;
    ctx.setLineDash([12, 4, 3, 4]); // Trait mixte ISO

    ctx.beginPath();
    ctx.moveTo(sStart.x, sStart.y);
    ctx.lineTo(sEnd.x, sEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Pastilles et flèches d'extrémités
    const drawEndMarker = (pt: Vec2, isStart: boolean) => {
      const radiusPx = 11;

      // Cercle de pastille
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Texte du label
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = isStart ? cut.label : `${cut.label}'`;
      ctx.fillText(text, pt.x, pt.y);

      // Flèche d'observation
      // Normale écran (attention au repère Y-down de l'écran)
      // En écran : start -> end donne le vecteur écran su = (sEnd - sStart)
      const sdx = sEnd.x - sStart.x;
      const sdy = sEnd.y - sStart.y;
      const slen = Math.hypot(sdx, sdy);
      if (slen > 1e-4) {
        // En screen Y-down, le sens de rotation 2D s'inverse par rapport au Z-up
        // nScreen = viewDirection * (sdy, -sdx) / slen
        const snx = (cut.viewDirection * sdy) / slen;
        const sny = (cut.viewDirection * -sdx) / slen;

        const arrowBaseDist = radiusPx + 2;
        const arrowTipDist = arrowBaseDist + 12;
        const arrowWingWidth = 6;

        const tipX = pt.x + arrowTipDist * snx;
        const tipY = pt.y + arrowTipDist * sny;
        const baseX = pt.x + arrowBaseDist * snx;
        const baseY = pt.y + arrowBaseDist * sny;

        const perpX = -sny;
        const perpY = snx;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + arrowWingWidth * perpX, baseY + arrowWingWidth * perpY);
        ctx.lineTo(baseX - arrowWingWidth * perpX, baseY - arrowWingWidth * perpY);
        ctx.closePath();
        ctx.fill();
      }
    };

    drawEndMarker(sStart, true);
    drawEndMarker(sEnd, false);

    ctx.restore();
  }
}
