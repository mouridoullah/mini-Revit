import type { SectionScene } from '@tabax/core';

export interface SectionRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
  readonly scale?: number; // Pixels par mm
  readonly offset?: { readonly x: number; readonly y: number };
  readonly showLevels?: boolean;
  readonly showHatch?: boolean;
  readonly backgroundColor?: string;
}

/**
 * Dessine un motif de hachures architecturales standard à l'intérieur d'un tracé Canvas.
 */
function applyHatchPattern(
  ctx: CanvasRenderingContext2D,
  hatchType: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): void {
  ctx.save();
  ctx.clip();

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 0.75;

  if (hatchType === 'masonry') {
    // Hachures obliques simples à 45°
    const step = 8;
    const diagLen = maxX - minX + (maxY - minY);
    for (let d = -diagLen; d <= diagLen; d += step) {
      ctx.beginPath();
      ctx.moveTo(minX + d, minY);
      ctx.lineTo(minX + d + (maxY - minY), maxY);
      ctx.stroke();
    }
  } else if (hatchType === 'concrete') {
    // Piqueté béton (petits points et triangles discrets)
    const step = 14;
    for (let x = minX; x <= maxX; x += step) {
      for (let y = minY; y <= maxY; y += step) {
        ctx.beginPath();
        ctx.arc(x + ((y * 7) % 5), y + ((x * 3) % 5), 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (hatchType === 'insulation') {
    // Hachures croisées isolant
    const step = 6;
    for (let d = -(maxY - minY); d <= maxX - minX; d += step) {
      ctx.beginPath();
      ctx.moveTo(minX + d, minY);
      ctx.lineTo(minX + d + (maxY - minY), maxY);
      ctx.moveTo(minX + d + (maxY - minY), minY);
      ctx.lineTo(minX + d, maxY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Dessine la scène de coupe ou d'élévation sur un contexte Canvas 2D.
 */
export function renderSectionView(
  ctx: CanvasRenderingContext2D,
  scene: SectionScene,
  options: SectionRenderOptions,
): void {
  const width = options.width;
  const height = options.height;
  const padding = options.padding ?? 50;
  const showLevels = options.showLevels ?? true;
  const showHatch = options.showHatch ?? true;
  const bgColor = options.backgroundColor ?? '#ffffff';

  // 1. Fond
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Calcul du cadrage (mapping s, z -> canvasX, canvasY)
  const cutLen = Math.max(100, scene.cutLength);
  const zSpan = Math.max(500, scene.bounds.zMax - scene.bounds.zMin);

  const availW = Math.max(50, width - padding * 2);
  const availH = Math.max(50, height - padding * 2);

  const fitScale = Math.min(availW / cutLen, availH / zSpan);
  const scale = options.scale ?? fitScale;

  const offX = options.offset?.x ?? (padding + (availW - cutLen * scale) / 2);
  const offY =
    options.offset?.y ?? (height - padding - (availH - zSpan * scale) / 2);

  const toX = (s: number) => offX + s * scale;
  const toY = (z: number) => offY - (z - scene.bounds.zMin) * scale;

  // 3. Ligne de sol / référence basse
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(toX(-500), toY(0));
  ctx.lineTo(toX(scene.cutLength + 500), toY(0));
  ctx.stroke();

  // 4. Éléments projetés en arrière-plan (traits fins)
  for (const item of scene.projectedItems) {
    if (item.polygon.length < 3) continue;

    ctx.save();
    ctx.beginPath();
    const p0 = item.polygon[0];
    if (p0) {
      ctx.moveTo(toX(p0.x), toY(p0.y));
      for (let i = 1; i < item.polygon.length; i++) {
        const p = item.polygon[i];
        if (p) ctx.lineTo(toX(p.x), toY(p.y));
      }
      ctx.closePath();

      ctx.fillStyle = item.style?.fill ?? 'rgba(241, 245, 249, 0.5)';
      ctx.fill();

      ctx.strokeStyle = item.style?.stroke ?? '#94a3b8';
      ctx.lineWidth = item.style?.strokeWidth ?? 1;
      ctx.stroke();
    }

    if (item.lines) {
      ctx.strokeStyle = item.style?.stroke ?? '#64748b';
      ctx.lineWidth = item.style?.strokeWidth ?? 1;
      for (const [l1, l2] of item.lines) {
        ctx.beginPath();
        ctx.moveTo(toX(l1.x), toY(l1.y));
        ctx.lineTo(toX(l2.x), toY(l2.y));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 5. Éléments coupés au plan d=0 (traits forts et pochés)
  for (const item of scene.cutItems) {
    if (item.polygon.length < 3) continue;

    ctx.save();
    ctx.beginPath();
    const p0 = item.polygon[0];
    if (p0) {
      let minPxX = Infinity;
      let maxPxX = -Infinity;
      let minPxY = Infinity;
      let maxPxY = -Infinity;

      ctx.moveTo(toX(p0.x), toY(p0.y));
      for (let i = 0; i < item.polygon.length; i++) {
        const p = item.polygon[i];
        if (p) {
          const px = toX(p.x);
          const py = toY(p.y);
          if (i > 0) ctx.lineTo(px, py);
          if (px < minPxX) minPxX = px;
          if (px > maxPxX) maxPxX = px;
          if (py < minPxY) minPxY = py;
          if (py > maxPxY) maxPxY = py;
        }
      }
      ctx.closePath();

      // Remplissage fond poché
      ctx.fillStyle = item.style?.fill ?? '#cbd5e1';
      ctx.fill();

      // Hachures optionnelles
      if (showHatch && item.style?.hatch && item.style.hatch !== 'solid') {
        applyHatchPattern(ctx, item.style.hatch, minPxX, maxPxX, minPxY, maxPxY);
      }

      // Contour fort
      ctx.strokeStyle = item.style?.stroke ?? '#0f172a';
      ctx.lineWidth = item.style?.strokeWidth ?? 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Lignes de niveaux et cotes altimétriques
  if (showLevels) {
    ctx.save();
    ctx.font = '11px sans-serif';

    for (const lvl of scene.levels) {
      const yLvl = toY(lvl.elevation);
      const xStart = toX(0) - 30;
      const xEnd = toX(scene.cutLength) + 50;

      // Trait pointillé de niveau
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xStart, yLvl);
      ctx.lineTo(xEnd, yLvl);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cible altimétrique (triangle pointant vers le bas)
      const targetX = xStart - 8;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(targetX - 5, yLvl - 6);
      ctx.lineTo(targetX + 5, yLvl - 6);
      ctx.lineTo(targetX, yLvl);
      ctx.closePath();
      ctx.fill();

      // Libellé altimétrique
      const elevM = (lvl.elevation / 1000).toFixed(2);
      const labelText = `${lvl.name}  ${lvl.elevation >= 0 ? '+' : ''}${elevM} m`;
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, targetX - 8, yLvl);
    }
    ctx.restore();
  }

  // 6.b Cotations architecturales verticales (ADR-069)
  if (scene.dimensions && scene.dimensions.length > 0) {
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.strokeStyle = '#334155';
    ctx.fillStyle = '#1e293b';
    ctx.lineWidth = 1;

    for (const dim of scene.dimensions) {
      if (dim.kind === 'level_marker') continue; // Déjà géré par les lignes de niveaux

      const xDim = toX(dim.s);
      const y1 = toY(dim.z1);
      const y2 = toY(dim.z2);

      // Ligne de cote verticale
      ctx.beginPath();
      ctx.moveTo(xDim, y1);
      ctx.lineTo(xDim, y2);
      ctx.stroke();

      // Ticks à 45° aux extrémités
      const tick = 4;
      ctx.beginPath();
      ctx.moveTo(xDim - tick, y1 + tick);
      ctx.lineTo(xDim + tick, y1 - tick);
      ctx.moveTo(xDim - tick, y2 + tick);
      ctx.lineTo(xDim + tick, y2 - tick);
      ctx.stroke();

      // Lignes de rappel horizontales vers le bâtiment
      if (dim.isExterior) {
        const xAttOrigin = toX(0);
        ctx.save();
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(xAttOrigin, y1);
        ctx.lineTo(xDim, y1);
        ctx.moveTo(xAttOrigin, y2);
        ctx.lineTo(xDim, y2);
        ctx.stroke();
        ctx.restore();
      }

      // Texte de cotation
      const yMid = (y1 + y2) / 2;
      const text = dim.label ? `${dim.label} ${dim.formattedValue}` : dim.formattedValue;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, xDim - 6, yMid);
    }
    ctx.restore();
  }

  // 7. Cartouche / En-tête de coupe
  ctx.save();
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const kindLabel = scene.kind === 'elevation' ? 'ÉLÉVATION' : 'COUPE';
  const title = `${kindLabel} ${scene.cutLabel}-${scene.cutLabel}' : ${scene.cutName.toUpperCase()}`;
  ctx.fillText(title, padding, 16);
  ctx.restore();

  ctx.restore();
}
