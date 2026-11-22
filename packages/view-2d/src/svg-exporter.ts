import type { DocumentFor2D, DetectedRoomFor2D, DimensionFor2D } from './types.js';
import { computePlanScene } from './plan-scene/computePlanScene.js';

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
 * - S'appuie sur le modèle intermédiaire PlanScene pour garantir la cohérence absolue avec DXF et PDF
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
  const project = options.project ?? 'Projet Tabax';
  const author = options.author ?? 'Tabax Architect';
  const dateStr = options.date ?? new Date().toLocaleDateString('fr-FR');

  // Dimensions papier en mm (Landscape)
  // 1 mm papier = 3.779527559 pixels à 96 DPI
  const PX_PER_MM_PAPER = 3.779527559;
  const paperWidthMm = paper === 'A3' ? 420 : 297;
  const paperHeightMm = paper === 'A3' ? 297 : 210;

  const widthPx = Math.round(paperWidthMm * PX_PER_MM_PAPER);
  const heightPx = Math.round(paperHeightMm * PX_PER_MM_PAPER);

  // Échelle du modèle vers le papier :
  const pxPerMmModel = (1 / scaleRatio) * PX_PER_MM_PAPER;

  // Calcul du modèle intermédiaire unifié
  const scene = computePlanScene(doc, {
    levelId: options.levelId,
    includeHatches: false,
    rooms: options.rooms,
    dimensions: options.dimensions,
  });

  const modelCenterX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const modelCenterY = (scene.bounds.minY + scene.bounds.maxY) / 2;

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
  const roomLabelSvgParts: string[] = [];
  const wallSvgParts: string[] = [];
  const openingSvgParts: string[] = [];
  const dimSvgParts: string[] = [];

  // 1. Couche Pièces (Rooms - Fonds pochés pastel)
  for (const room of scene.rooms) {
    if (room.polygon.length < 3) continue;
    const ptsStr = room.polygon
      .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
      .join(' ');

    roomSvgParts.push(
      `    <polygon points="${ptsStr}" fill="rgba(219, 234, 254, 0.45)" stroke="none" />`,
    );

    // Étiquette de pièce avec cartouche de lisibilité semi-transparent blanc
    const seedX = toSvgX(room.labelPosition.x);
    const seedY = toSvgY(room.labelPosition.y);
    const roomName = escapeXml(room.name ?? 'Pièce');
    const areaM2 = room.areaM2.toFixed(2);
    const areaText = `${areaM2} m²`;

    const nameLen = roomName.length * 6.5;
    const areaLen = areaText.length * 6;
    const maxLen = Math.max(nameLen, areaLen);
    const boxW = maxLen + 14;
    const boxH = 28;
    const boxX = seedX - boxW / 2;
    const boxY = seedY - 15;

    roomLabelSvgParts.push(
      `    <rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="3" ry="3" fill="rgba(255, 255, 255, 0.85)" stroke="#cbd5e1" stroke-width="0.5" />`,
    );
    roomLabelSvgParts.push(
      `    <text x="${seedX.toFixed(2)}" y="${(seedY - 4).toFixed(2)}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${roomName}</text>`,
    );
    roomLabelSvgParts.push(
      `    <text x="${seedX.toFixed(2)}" y="${(seedY + 8).toFixed(2)}" font-family="Arial, sans-serif" font-size="10" fill="#2563eb" text-anchor="middle">${areaText}</text>`,
    );
  }

  // 2. Couche Murs (Walls)
  for (const wall of scene.walls) {
    const ptsStr = wall.footprint
      .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
      .join(' ');

    wallSvgParts.push(
      `    <polygon id="${escapeXml(wall.id)}" points="${ptsStr}" fill="#d1d5db" stroke="#111827" stroke-width="1.5" stroke-linejoin="round" />`,
    );

    // 3. Couche Ouvertures sur ce mur
    for (const op of wall.openings) {
      if (op.kind === 'door') {
        const cutPts = [op.jamb1[0], op.jamb2[0], op.jamb2[1], op.jamb1[1]]
          .map((p) => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`)
          .join(' ');
        openingSvgParts.push(`    <polygon points="${cutPts}" fill="#ffffff" stroke="none" />`);

        if (op.arc && op.leafLine) {
          const sHingeX = toSvgX(op.arc.center.x);
          const sHingeY = toSvgY(op.arc.center.y);
          const sLeafX = toSvgX(op.leafLine[1].x);
          const sLeafY = toSvgY(op.leafLine[1].y);
          const radiusPx = op.arc.radius * pxPerMmModel;
          openingSvgParts.push(
            `    <path d="M ${sHingeX.toFixed(2)} ${sHingeY.toFixed(2)} L ${sLeafX.toFixed(2)} ${sLeafY.toFixed(2)} A ${radiusPx.toFixed(2)} ${radiusPx.toFixed(2)} 0 0 1 ${sHingeX.toFixed(2)} ${(sHingeY - radiusPx).toFixed(2)} Z" fill="rgba(243, 244, 246, 0.5)" stroke="#111827" stroke-width="1" stroke-dasharray="3,2" />`,
          );
        }
      } else if (op.kind === 'window') {
        if (op.glassLine) {
          const sStartX = toSvgX(op.glassLine[0].x);
          const sStartY = toSvgY(op.glassLine[0].y);
          const sEndX = toSvgX(op.glassLine[1].x);
          const sEndY = toSvgY(op.glassLine[1].y);
          openingSvgParts.push(
            `    <line x1="${sStartX.toFixed(2)}" y1="${sStartY.toFixed(2)}" x2="${sEndX.toFixed(2)}" y2="${sEndY.toFixed(2)}" stroke="#3b82f6" stroke-width="2" />`,
          );
        }
      }
    }
  }

  // 4. Couche Cotations (Dimensions)
  for (const dim of scene.dimensions) {
    const sp1X = toSvgX(dim.witness1[0].x);
    const sp1Y = toSvgY(dim.witness1[0].y);
    const sd1X = toSvgX(dim.witness1[1].x);
    const sd1Y = toSvgY(dim.witness1[1].y);

    const sp2X = toSvgX(dim.witness2[0].x);
    const sp2Y = toSvgY(dim.witness2[0].y);
    const sd2X = toSvgX(dim.witness2[1].x);
    const sd2Y = toSvgY(dim.witness2[1].y);

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
    const valText = dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`;
    const midX = (sd1X + sd2X) / 2;
    const midY = (sd1Y + sd2Y) / 2;

    dimSvgParts.push(
      `    <text x="${midX.toFixed(2)}" y="${(midY - 4).toFixed(2)}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#111827" text-anchor="middle">${escapeXml(valText)}</text>`,
    );
  }

  // 5. Cadre de feuille et Cartouche architectural réglementaire
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
    ...(roomLabelSvgParts.length > 0
      ? [`  <g id="room-labels">\n${roomLabelSvgParts.join('\n')}\n  </g>`]
      : []),
    cartoucheSvg,
    `</svg>`,
  ].join('\n');
}
