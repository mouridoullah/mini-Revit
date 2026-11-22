import type { PdfPageContent } from './PdfWriter.js';
import { MM_TO_PT, type DrawingViewportBox, type PageFormatDef } from './types.js';

export interface TitleBlockInfo {
  readonly projectTitle: string;
  readonly sheetTitle: string;
  readonly sheetNumber: string; // e.g. "PL-01 / 06"
  readonly scaleLabel: string; // e.g. "1:100" ou "Auto (1:125)"
  readonly scaleRatio?: number | undefined; // pour l'échelle graphique (ex: 100)
  readonly date: string;
  readonly author: string;
  readonly revision: string;
  readonly showNorthArrow?: boolean | undefined;
}

/**
 * Calcule la boîte englobante de la zone de dessin utile protégée par clipping.
 */
export function getDrawingViewportBox(format: PageFormatDef): DrawingViewportBox {
  const marginMm = 12;
  const bottomZoneHeightMm = 44; // Zone réservée pour le cartouche et notes en bas

  const xMinMm = marginMm;
  const yMinMm = marginMm + bottomZoneHeightMm;
  const widthMm = format.widthMm - 2 * marginMm;
  const heightMm = format.heightMm - marginMm - yMinMm;

  return {
    xMinMm,
    yMinMm,
    widthMm,
    heightMm,
    xMinPt: xMinMm * MM_TO_PT,
    yMinPt: yMinMm * MM_TO_PT,
    widthPt: widthMm * MM_TO_PT,
    heightPt: heightMm * MM_TO_PT,
  };
}

/**
 * Trace le cadre normalisé de la planche (marge 10 mm).
 */
export function drawPageFrame(content: PdfPageContent, format: PageFormatDef): void {
  const marginMm = 10;
  const x = marginMm * MM_TO_PT;
  const y = marginMm * MM_TO_PT;
  const w = (format.widthMm - 2 * marginMm) * MM_TO_PT;
  const h = (format.heightMm - 2 * marginMm) * MM_TO_PT;

  // Cadre extérieur fort
  content.rect(x, y, w, h, {
    strokeColor: [0.08, 0.12, 0.2], // #141f33
    lineWidth: 1.2,
  });

  // Filet intérieur fin à 1.5 mm
  const offsetPt = 1.5 * MM_TO_PT;
  content.rect(x + offsetPt, y + offsetPt, w - 2 * offsetPt, h - 2 * offsetPt, {
    strokeColor: [0.3, 0.35, 0.45],
    lineWidth: 0.4,
  });
}

/**
 * Trace l'échelle graphique graduée (bar scale) avec segments alternés noir / blanc.
 */
export function drawGraphicScale(
  content: PdfPageContent,
  xPt: number,
  yPt: number,
  scaleRatio: number,
  maxMeters: number = 5,
): void {
  if (scaleRatio <= 0) return;

  // 1 mètre dans la réalité = (1000 / scaleRatio) mm papier
  const meterWidthPt = (1000 / scaleRatio) * MM_TO_PT;
  const barHeightPt = 2.5 * MM_TO_PT;

  let curX = xPt;

  // Segment 0 à 1m (noir)
  content.rect(curX, yPt, meterWidthPt, barHeightPt, {
    fillColor: [0.1, 0.1, 0.1],
    strokeColor: [0.1, 0.1, 0.1],
    lineWidth: 0.5,
  });
  content.text('0', curX, yPt + barHeightPt + 3, { size: 6, align: 'center' });
  curX += meterWidthPt;

  // Segment 1m à 2m (blanc)
  content.rect(curX, yPt, meterWidthPt, barHeightPt, {
    fillColor: [1, 1, 1],
    strokeColor: [0.1, 0.1, 0.1],
    lineWidth: 0.5,
  });
  content.text('1m', curX, yPt + barHeightPt + 3, { size: 6, align: 'center' });
  curX += meterWidthPt;

  // Segment 2m à 5m (noir)
  const remainingMeters = Math.max(1, maxMeters - 2);
  const remainingWidthPt = remainingMeters * meterWidthPt;
  content.rect(curX, yPt, remainingWidthPt, barHeightPt, {
    fillColor: [0.1, 0.1, 0.1],
    strokeColor: [0.1, 0.1, 0.1],
    lineWidth: 0.5,
  });
  content.text('2m', curX, yPt + barHeightPt + 3, { size: 6, align: 'center' });
  content.text(`${maxMeters}m`, curX + remainingWidthPt, yPt + barHeightPt + 3, {
    size: 6,
    align: 'center',
  });
}

/**
 * Trace la flèche Nord architecturale stylisée.
 */
export function drawNorthArrow(
  content: PdfPageContent,
  cxPt: number,
  cyPt: number,
  radiusPt: number = 10 * MM_TO_PT,
): void {
  content.save();

  // Cercle de contour
  content.circle(cxPt, cyPt, radiusPt, {
    strokeColor: [0.2, 0.25, 0.35],
    lineWidth: 0.6,
  });

  // Aiguille Nord : flèche pointant vers le haut (+Y)
  const tipY = cyPt + radiusPt * 0.85;
  const baseY = cyPt - radiusPt * 0.65;
  const wingX = radiusPt * 0.35;

  // Demi-flèche gauche (noire)
  content.polyline(
    [
      { x: cxPt, y: tipY },
      { x: cxPt - wingX, y: baseY },
      { x: cxPt, y: cyPt },
    ],
    {
      fillColor: [0.1, 0.15, 0.25],
      strokeColor: [0.1, 0.15, 0.25],
      lineWidth: 0.5,
      close: true,
    },
  );

  // Demi-flèche droite (blanche)
  content.polyline(
    [
      { x: cxPt, y: tipY },
      { x: cxPt + wingX, y: baseY },
      { x: cxPt, y: cyPt },
    ],
    {
      fillColor: [1, 1, 1],
      strokeColor: [0.1, 0.15, 0.25],
      lineWidth: 0.5,
      close: true,
    },
  );

  // Lettre 'N' au sommet
  content.text('N', cxPt, tipY + 2, {
    font: 'bold',
    size: 7.5,
    align: 'center',
    color: [0.1, 0.15, 0.25],
  });

  content.restore();
}

/**
 * Trace le cartouche architectural en bas à droite de la planche.
 */
export function drawTitleBlock(
  content: PdfPageContent,
  format: PageFormatDef,
  info: TitleBlockInfo,
): void {
  const marginMm = 10;
  const tbWidthMm = 155;
  const tbHeightMm = 40;

  const xPt = (format.widthMm - marginMm - tbWidthMm) * MM_TO_PT;
  const yPt = marginMm * MM_TO_PT;
  const wPt = tbWidthMm * MM_TO_PT;
  const hPt = tbHeightMm * MM_TO_PT;

  // 1. Fond blanc opaque pour masquer tout tracé sous-jacent
  content.rect(xPt, yPt, wPt, hPt, {
    fillColor: [1, 1, 1],
    strokeColor: [0.08, 0.12, 0.2],
    lineWidth: 1.0,
  });

  // 2. Grille de subdivisions internes
  const row1Y = yPt + hPt - 12 * MM_TO_PT;
  const row2Y = yPt + 14 * MM_TO_PT;

  // Lignes horizontales
  content.line(xPt, row1Y, xPt + wPt, row1Y, {
    strokeColor: [0.3, 0.35, 0.45],
    lineWidth: 0.5,
  });
  content.line(xPt, row2Y, xPt + wPt, row2Y, {
    strokeColor: [0.3, 0.35, 0.45],
    lineWidth: 0.5,
  });

  // Colonne séparatrice droite pour Numéro de Planche (40 mm de large)
  const colSheetX = xPt + wPt - 42 * MM_TO_PT;
  content.line(colSheetX, yPt, colSheetX, row1Y, {
    strokeColor: [0.3, 0.35, 0.45],
    lineWidth: 0.5,
  });

  // Ligne verticale milieu zone d'échelle
  const colScaleX = xPt + 48 * MM_TO_PT;
  content.line(colScaleX, yPt, colScaleX, row2Y, {
    strokeColor: [0.4, 0.45, 0.55],
    lineWidth: 0.3,
  });

  // 3. Contenu textuel - En-tête Projet
  content.text(info.projectTitle.toUpperCase(), xPt + 4 * MM_TO_PT, yPt + hPt - 8.5 * MM_TO_PT, {
    font: 'bold',
    size: 9.5,
    color: [0.05, 0.1, 0.2],
  });
  content.text('TABAX BIM & ENGINEERING', xPt + wPt - 4 * MM_TO_PT, yPt + hPt - 8.5 * MM_TO_PT, {
    size: 7,
    align: 'right',
    color: [0.4, 0.45, 0.55],
  });

  // 4. Intitulé de la Planche (Zone centrale gauche)
  content.text('PLANCHE :', xPt + 4 * MM_TO_PT, row1Y - 4.5 * MM_TO_PT, {
    size: 6.5,
    color: [0.4, 0.45, 0.55],
  });
  content.text(info.sheetTitle, xPt + 4 * MM_TO_PT, row1Y - 10 * MM_TO_PT, {
    font: 'bold',
    size: 11,
    color: [0.05, 0.1, 0.2],
  });

  // 5. Zone métrologique basse (Échelle, Date, Auteur)
  content.text('ÉCHELLE', xPt + 4 * MM_TO_PT, row2Y - 4 * MM_TO_PT, {
    size: 6,
    color: [0.4, 0.45, 0.55],
  });
  content.text(info.scaleLabel, xPt + 4 * MM_TO_PT, row2Y - 10 * MM_TO_PT, {
    font: 'bold',
    size: 9,
    color: [0.05, 0.1, 0.2],
  });

  content.text('DATE / ÉMISSION', colScaleX + 4 * MM_TO_PT, row2Y - 4 * MM_TO_PT, {
    size: 6,
    color: [0.4, 0.45, 0.55],
  });
  content.text(`${info.date} | ${info.revision}`, colScaleX + 4 * MM_TO_PT, row2Y - 10 * MM_TO_PT, {
    size: 7.5,
    color: [0.1, 0.15, 0.25],
  });

  // 6. Numéro de Planche (Zone droite)
  content.text('FEUILLET', colSheetX + 4 * MM_TO_PT, row1Y - 4.5 * MM_TO_PT, {
    size: 6.5,
    color: [0.4, 0.45, 0.55],
  });
  content.text(info.sheetNumber, colSheetX + 21 * MM_TO_PT, row1Y - 12 * MM_TO_PT, {
    font: 'bold',
    size: 13,
    align: 'center',
    color: [0.08, 0.35, 0.8], // Bleu ingénierie
  });

  // Auteur
  content.text(info.author, colSheetX + 21 * MM_TO_PT, yPt + 4 * MM_TO_PT, {
    size: 6.5,
    align: 'center',
    color: [0.4, 0.45, 0.55],
  });

  // 7. Échelle graphique (disposée à gauche du cartouche)
  if (info.scaleRatio && info.scaleRatio > 0) {
    const scaleX = xPt - 65 * MM_TO_PT;
    const scaleY = yPt + 4 * MM_TO_PT;
    drawGraphicScale(content, scaleX, scaleY, info.scaleRatio, 5);
  }

  // 8. Flèche Nord (disposée à gauche de l'échelle graphique)
  if (info.showNorthArrow !== false) {
    const northX = xPt - 80 * MM_TO_PT;
    const northY = yPt + 14 * MM_TO_PT;
    drawNorthArrow(content, northX, northY, 7 * MM_TO_PT);
  }
}
