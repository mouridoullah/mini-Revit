import { computeWallFootprint2d, type Vec2 } from '@mini-bim/geometry';
import { type DocumentFor2D, type DimensionFor2D, type DetectedRoomFor2D } from './types.js';

/**
 * Options d'exportation de plan vectoriel imprimable (SVG).
 */
export interface PlanSvgOptions {
  /** Échelle architecturale normalisée : 50 (1:50), 100 (1:100) ou 200 (1:200). Défaut : 100 */
  readonly scale?: 50 | 100 | 200;
  /** Format de papier normalisé (orientation paysage). Défaut : 'A4' */
  readonly paperSize?: 'A4' | 'A3';
  /** Titre de la feuille (ex: 'Plan du Rez-de-chaussée') */
  readonly title?: string;
  /** Nom du projet (ex: 'Résidence Les Érables') */
  readonly project?: string;
  /** Auteur ou agence d'architecture */
  readonly author?: string;
  /** Date d'émission */
  readonly date?: string;
  /** Filtre de niveau architectural (levelId) */
  readonly levelId?: string | null;
  /** Pièces avec polygones détectés à intégrer (poché pastel et étiquettes) */
  readonly rooms?: readonly DetectedRoomFor2D[];
  /** Cotations 2D explicites (si non renseigné, utilise doc.getState().dimensions) */
  readonly dimensions?: readonly DimensionFor2D[];
}

/**
 * Échappe une chaîne pour insertion sûre dans du XML/SVG.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Génère un document SVG vectoriel haute fidélité prêt pour l'impression à échelle normalisée.
 *
 * Conforme aux normes de dessin technique d'architecture :
 * - Poché et arêtes des murs coupés
 * - Baies et battements de portes à 90°
 * - Vitrages de fenêtres
 * - Poché pastel des pièces avec surfaces en m²
 * - Lignes de cote associatives avec traits obliques à 45°
 * - Cartouche architectural réglementaire (Titre, Échelle, Date, Auteur)
 */
export function generatePlanSvg(doc: DocumentFor2D, options: PlanSvgOptions = {}): string {
  const scaleRatio = options.scale ?? 100; // 1:100
  const paper = options.paperSize ?? 'A4';
  const title = options.title ?? 'Plan d’Étage';
  const project = options.project ?? 'Projet Mini-BIM';
  const author = options.author ?? 'Mini-BIM Architect';
  const dateStr = options.date ?? new Date().toLocaleDateString('fr-FR');
  const levelFilter = options.levelId;

  // Dimensions papier en mm (Landscape)
  // 1 mm papier = 3.779527559 pixels à 96 DPI
  const PX_PER_MM_PAPER = 3.779527559;
  const paperWidthMm = paper === 'A3' ? 420 : 297;
  const paperHeightMm = paper === 'A3' ? 297 : 210;

  const widthPx = Math.round(paperWidthMm * PX_PER_MM_PAPER);
  const heightPx = Math.round(paperHeightMm * PX_PER_MM_PAPER);

  // Échelle du modèle vers le papier :
  // À 1:100, 1000 mm modèle = 10 mm papier = 10 * 3.779527559 px
  const pxPerMmModel = (1 / scaleRatio) * PX_PER_MM_PAPER;

  const state = doc.getState();
  const allWalls = Object.values(state.walls).filter(
    (w) => !levelFilter || !w.levelId || w.levelId === levelFilter,
  );

  // Calcul de la boîte englobante du bâtiment
  let minX = 0;
  let minY = 0;
  let maxX = 6000;
  let maxY = 4000;

  if (allWalls.length > 0) {
    minX = Math.min(...allWalls.flatMap((w) => [w.start.x, w.end.x]));
    maxX = Math.max(...allWalls.flatMap((w) => [w.start.x, w.end.x]));
    minY = Math.min(...allWalls.flatMap((w) => [w.start.y, w.end.y]));
    maxY = Math.max(...allWalls.flatMap((w) => [w.start.y, w.end.y]));
  }

  const modelCenterX = (minX + maxX) / 2;
  const modelCenterY = (minY + maxY) / 2;

  // Le centre du plan architectural est positionné au centre de la zone utile (hors cartouche)
  const marginPx = 20 * PX_PER_MM_PAPER;
  const cartoucheHeightPx = 35 * PX_PER_MM_PAPER;
  const cartoucheWidthPx = 75 * PX_PER_MM_PAPER;

  const drawingAreaCenterX = widthPx / 2;
  const drawingAreaCenterY = (heightPx - marginPx - cartoucheHeightPx / 2) / 2;

  // Fonction de projection : Modèle (mm, Y-up) -> SVG (px, Y-down)
  const toSvgX = (xMm: number): number => {
    return drawingAreaCenterX + (xMm - modelCenterX) * pxPerMmModel;
  };

  const toSvgY = (yMm: number): number => {
    return drawingAreaCenterY - (yMm - modelCenterY) * pxPerMmModel;
  };

  // Collecte des SVG fragments
  const roomSvgParts: string[] = [];
  const wallSvgParts: string[] = [];
  const openingSvgParts: string[] = [];
  const dimSvgParts: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Couche Pièces (Rooms)
  // -------------------------------------------------------------------------
  if (options.rooms && options.rooms.length > 0) {
    for (const room of options.rooms) {
      if (room.polygon.length < 3) continue;
      const ptsStr = room.polygon
        .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
        .join(' ');

      roomSvgParts.push(
        `    <polygon points="${ptsStr}" fill="rgba(219, 234, 254, 0.45)" stroke="none" />`,
      );

      // Étiquette de pièce
      const seedX = toSvgX(room.seed.x);
      const seedY = toSvgY(room.seed.y);
      const roomName = escapeXml(room.name ?? 'Pièce');
      const areaM2 = (room.areaMm2 / 1e6).toFixed(2);

      roomSvgParts.push(
        `    <text x="${seedX.toFixed(2)}" y="${(seedY - 6).toFixed(2)}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${roomName}</text>`,
      );
      roomSvgParts.push(
        `    <text x="${seedX.toFixed(2)}" y="${(seedY + 8).toFixed(2)}" font-family="Arial, sans-serif" font-size="10" fill="#2563eb" text-anchor="middle">${areaM2} m²</text>`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. Couche Murs (Walls)
  // -------------------------------------------------------------------------
  for (const wall of allWalls) {
    const wallType = wall.typeId ? state.wallTypes[wall.typeId] : undefined;
    const thickness = wallType?.thickness ?? 200;

    const footprint = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness,
      locationLine: 'center',
    });
    const ptsStr = footprint.vertices
      .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
      .join(' ');

    wallSvgParts.push(
      `    <polygon id="${escapeXml(wall.id)}" points="${ptsStr}" fill="#d1d5db" stroke="#111827" stroke-width="1.5" stroke-linejoin="round" />`,
    );
  }

  // -------------------------------------------------------------------------
  // 3. Couche Ouvertures (Doors & Windows)
  // -------------------------------------------------------------------------
  const doors = Object.values(state.doors ?? {});
  const windows = Object.values(state.windows ?? {});

  for (const door of doors) {
    const host = state.walls[door.hostWallId];
    if (!host) continue;

    const dx = host.end.x - host.start.x;
    const dy = host.end.y - host.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    // Position de feuillure
    const dt = door.doorTypeId ? state.doorTypes?.[door.doorTypeId] : undefined;
    const doorWidth = dt?.width ?? 900;
    const hingeX = host.start.x + ux * door.offsetAlong;
    const hingeY = host.start.y + uy * door.offsetAlong;
    const endX = host.start.x + ux * (door.offsetAlong + doorWidth);
    const endY = host.start.y + uy * (door.offsetAlong + doorWidth);

    const sHingeX = toSvgX(hingeX);
    const sHingeY = toSvgY(hingeY);
    const sEndX = toSvgX(endX);
    const sEndY = toSvgY(endY);

    // Évidement blanc pour l'ouverture
    const wallType = host.typeId ? state.wallTypes[host.typeId] : undefined;
    const thick = (wallType?.thickness ?? 200) * 1.05;
    const cutP1 = { x: hingeX + nx * (thick / 2), y: hingeY + ny * (thick / 2) };
    const cutP2 = { x: endX + nx * (thick / 2), y: endY + ny * (thick / 2) };
    const cutP3 = { x: endX - nx * (thick / 2), y: endY - ny * (thick / 2) };
    const cutP4 = { x: hingeX - nx * (thick / 2), y: hingeY - ny * (thick / 2) };
    const cutPts = [cutP1, cutP2, cutP3, cutP4]
      .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
      .join(' ');

    openingSvgParts.push(`    <polygon points="${cutPts}" fill="#ffffff" stroke="none" />`);

    // Battement de porte à 90° (arc de cercle)
    const radiusPx = doorWidth * pxPerMmModel;
    const sweepFlag = door.swing.direction === 'in' ? 1 : 0;
    openingSvgParts.push(
      `    <path d="M ${sHingeX.toFixed(2)} ${sHingeY.toFixed(2)} L ${sEndX.toFixed(2)} ${sEndY.toFixed(2)} A ${radiusPx.toFixed(2)} ${radiusPx.toFixed(2)} 0 0 ${sweepFlag} ${sHingeX.toFixed(2)} ${(sHingeY - radiusPx).toFixed(2)} Z" fill="rgba(243, 244, 246, 0.5)" stroke="#111827" stroke-width="1" stroke-dasharray="3,2" />`,
    );
  }

  for (const win of windows) {
    const host = state.walls[win.hostWallId];
    if (!host) continue;

    const dx = host.end.x - host.start.x;
    const dy = host.end.y - host.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const wt = win.windowTypeId ? state.windowTypes?.[win.windowTypeId] : undefined;
    const winWidth = wt?.width ?? 1200;
    const startX = host.start.x + ux * win.offsetAlong;
    const startY = host.start.y + uy * win.offsetAlong;
    const endX = host.start.x + ux * (win.offsetAlong + winWidth);
    const endY = host.start.y + uy * (win.offsetAlong + winWidth);

    const sStartX = toSvgX(startX);
    const sStartY = toSvgY(startY);
    const sEndX = toSvgX(endX);
    const sEndY = toSvgY(endY);

    openingSvgParts.push(
      `    <line x1="${sStartX.toFixed(2)}" y1="${sStartY.toFixed(2)}" x2="${sEndX.toFixed(2)}" y2="${sEndY.toFixed(2)}" stroke="#3b82f6" stroke-width="2" />`,
    );
  }

  // -------------------------------------------------------------------------
  // 4. Couche Cotations (Dimensions)
  // -------------------------------------------------------------------------
  const dimsToDraw: readonly DimensionFor2D[] =
    options.dimensions ?? (state.dimensions ? Object.values(state.dimensions) : []);

  for (const dim of dimsToDraw) {
    if (levelFilter && dim.levelId && dim.levelId !== levelFilter) continue;

    let p1: Vec2 | null = null;
    let p2: Vec2 | null = null;

    const ref0 = dim.references[0];
    const ref1 = dim.references[1];

    if (dim.references.length === 1 && ref0) {
      const wall = state.walls[ref0];
      if (!wall) continue;
      p1 = wall.start;
      p2 = wall.end;
    } else if (dim.references.length >= 2 && ref0 && ref1) {
      const w1 = state.walls[ref0];
      const w2 = state.walls[ref1];
      if (!w1 || !w2) continue;
      p1 = { x: (w1.start.x + w1.end.x) / 2, y: (w1.start.y + w1.end.y) / 2 };
      p2 = { x: (w2.start.x + w2.end.x) / 2, y: (w2.start.y + w2.end.y) / 2 };
    }

    if (!p1 || !p2) continue;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const ox = nx * dim.offset;
    const oy = ny * dim.offset;

    const d1World = { x: p1.x + ox, y: p1.y + oy };
    const d2World = { x: p2.x + ox, y: p2.y + oy };

    const sp1X = toSvgX(p1.x);
    const sp1Y = toSvgY(p1.y);
    const sp2X = toSvgX(p2.x);
    const sp2Y = toSvgY(p2.y);
    const sd1X = toSvgX(d1World.x);
    const sd1Y = toSvgY(d1World.y);
    const sd2X = toSvgX(d2World.x);
    const sd2Y = toSvgY(d2World.y);

    // Lignes de rappel
    dimSvgParts.push(
      `    <line x1="${sp1X.toFixed(2)}" y1="${sp1Y.toFixed(2)}" x2="${sd1X.toFixed(2)}" y2="${sd1Y.toFixed(2)}" stroke="#1f2937" stroke-width="0.75" />`,
    );
    dimSvgParts.push(
      `    <line x1="${sp2X.toFixed(2)}" y1="${sp2Y.toFixed(2)}" x2="${sd2X.toFixed(2)}" y2="${sd2Y.toFixed(2)}" stroke="#1f2937" stroke-width="0.75" />`,
    );

    // Ligne de cote
    dimSvgParts.push(
      `    <line x1="${sd1X.toFixed(2)}" y1="${sd1Y.toFixed(2)}" x2="${sd2X.toFixed(2)}" y2="${sd2Y.toFixed(2)}" stroke="#1f2937" stroke-width="0.75" />`,
    );

    // Ticks à 45°
    dimSvgParts.push(
      `    <line x1="${(sd1X - 3).toFixed(2)}" y1="${(sd1Y + 3).toFixed(2)}" x2="${(sd1X + 3).toFixed(2)}" y2="${(sd1Y - 3).toFixed(2)}" stroke="#1f2937" stroke-width="1.2" />`,
    );
    dimSvgParts.push(
      `    <line x1="${(sd2X - 3).toFixed(2)}" y1="${(sd2Y + 3).toFixed(2)}" x2="${(sd2X + 3).toFixed(2)}" y2="${(sd2Y - 3).toFixed(2)}" stroke="#1f2937" stroke-width="1.2" />`,
    );

    // Valeur textuelle
    const valText =
      dim.customLabel ??
      (dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`);
    const midX = (sd1X + sd2X) / 2;
    const midY = (sd1Y + sd2Y) / 2;

    dimSvgParts.push(
      `    <text x="${midX.toFixed(2)}" y="${(midY - 4).toFixed(2)}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#111827" text-anchor="middle">${escapeXml(valText)}</text>`,
    );
  }

  // -------------------------------------------------------------------------
  // 5. Cadre de feuille et Cartouche architectural réglementaire
  // -------------------------------------------------------------------------
  const cadreMargin = marginPx;
  const cadreWidth = widthPx - 2 * cadreMargin;
  const cadreHeight = heightPx - 2 * cadreMargin;

  const cartX = widthPx - cadreMargin - cartoucheWidthPx;
  const cartY = heightPx - cadreMargin - cartoucheHeightPx;

  const cartoucheSvg = `
  <!-- Cadre extérieur et Cartouche réglementaire -->
  <g id="border-and-cartouche">
    <rect x="${cadreMargin.toFixed(2)}" y="${cadreMargin.toFixed(2)}" width="${cadreWidth.toFixed(2)}" height="${cadreHeight.toFixed(2)}" fill="none" stroke="#111827" stroke-width="1.5" />
    <rect x="${cartX.toFixed(2)}" y="${cartY.toFixed(2)}" width="${cartoucheWidthPx.toFixed(2)}" height="${cartoucheHeightPx.toFixed(2)}" fill="#ffffff" stroke="#111827" stroke-width="1.5" />
    <line x1="${cartX.toFixed(2)}" y1="${(cartY + 25).toFixed(2)}" x2="${(cartX + cartoucheWidthPx).toFixed(2)}" y2="${(cartY + 25).toFixed(2)}" stroke="#111827" stroke-width="0.75" />
    <line x1="${cartX.toFixed(2)}" y1="${(cartY + 50).toFixed(2)}" x2="${(cartX + cartoucheWidthPx).toFixed(2)}" y2="${(cartY + 50).toFixed(2)}" stroke="#111827" stroke-width="0.75" />
    <line x1="${cartX.toFixed(2)}" y1="${(cartY + 75).toFixed(2)}" x2="${(cartX + cartoucheWidthPx).toFixed(2)}" y2="${(cartY + 75).toFixed(2)}" stroke="#111827" stroke-width="0.75" />
    <line x1="${(cartX + 140).toFixed(2)}" y1="${(cartY + 50).toFixed(2)}" x2="${(cartX + 140).toFixed(2)}" y2="${(cartY + cartoucheHeightPx).toFixed(2)}" stroke="#111827" stroke-width="0.75" />

    <!-- Textes du cartouche -->
    <text x="${(cartX + 8).toFixed(2)}" y="${(cartY + 17).toFixed(2)}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#111827">${escapeXml(project)}</text>
    <text x="${(cartX + 8).toFixed(2)}" y="${(cartY + 41).toFixed(2)}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#2563eb">${escapeXml(title)}</text>
    <text x="${(cartX + 8).toFixed(2)}" y="${(cartY + 66).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" fill="#4b5563">ÉCHELLE : 1:${scaleRatio}</text>
    <text x="${(cartX + 148).toFixed(2)}" y="${(cartY + 66).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" fill="#4b5563">FORMAT : ${paper}</text>
    <text x="${(cartX + 8).toFixed(2)}" y="${(cartY + 92).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" fill="#4b5563">AUTEUR : ${escapeXml(author)}</text>
    <text x="${(cartX + 148).toFixed(2)}" y="${(cartY + 92).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" fill="#4b5563">DATE : ${escapeXml(dateStr)}</text>
  </g>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${paperWidthMm}mm" height="${paperHeightMm}mm" viewBox="0 0 ${widthPx} ${heightPx}" version="1.1">`,
    `  <rect width="100%" height="100%" fill="#ffffff" />`,
    `  <g id="rooms">\n${roomSvgParts.join('\n')}\n  </g>`,
    `  <g id="walls">\n${wallSvgParts.join('\n')}\n  </g>`,
    `  <g id="openings">\n${openingSvgParts.join('\n')}\n  </g>`,
    `  <g id="dimensions">\n${dimSvgParts.join('\n')}\n  </g>`,
    cartoucheSvg,
    `</svg>`,
  ].join('\n');
}
