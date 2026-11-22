import type { SectionScene } from '@mini-bim/core';
import { generateHatchLines } from '../dxf/hatch.js';
import type { PdfPageContent } from './PdfWriter.js';
import {
  drawPageFrame,
  drawTitleBlock,
  getDrawingViewportBox,
} from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

/**
 * Rendu vectoriel pur d'une planche de coupe ou élévation dans le carnet PDF.
 */
export function renderSectionPage(
  content: PdfPageContent,
  scene: SectionScene,
  format: PageFormatDef,
  options: PdfBookOptions,
  sheetIndex: number,
  totalPages: number,
): void {
  const viewport = getDrawingViewportBox(format);

  // 1. Dimensions du modèle de coupe en mm
  const cutLenMm = Math.max(1000, scene.cutLength);
  const zSpanMm = Math.max(1500, scene.bounds.zMax - scene.bounds.zMin);
  const zMidMm = (scene.bounds.zMin + scene.bounds.zMax) / 2;
  const sMidMm = cutLenMm / 2;

  // 2. Détermination de l'échelle architecturale
  let scaleRatio: number = 100;
  let isAuto = false;

  if (!options.scale || options.scale === 'auto') {
    isAuto = true;
    const fitScaleX = (cutLenMm * 1.35) / viewport.widthMm;
    const fitScaleY = (zSpanMm * 1.35) / viewport.heightMm;
    const fitScale = Math.max(fitScaleX, fitScaleY);

    if (fitScale <= 50) scaleRatio = 50;
    else if (fitScale <= 100) scaleRatio = 100;
    else if (fitScale <= 200) scaleRatio = 200;
    else scaleRatio = Math.ceil(fitScale / 50) * 50;
  } else {
    scaleRatio = options.scale;
  }

  const mmPerWorldMm = 1 / scaleRatio;
  const ptPerWorldMm = mmPerWorldMm * MM_TO_PT;

  const viewCenterXPt = viewport.xMinPt + viewport.widthPt / 2;
  const viewCenterYPt = viewport.yMinPt + viewport.heightPt / 2;

  // Fonctions de projection : s -> X pt, z -> Y pt
  const toPdfX = (s: number): number => viewCenterXPt + (s - sMidMm) * ptPerWorldMm;
  const toPdfY = (z: number): number => viewCenterYPt + (z - zMidMm) * ptPerWorldMm;

  // 3. Clipping strict de la fenêtre de dessin
  content.save();
  content.clipRect(viewport.xMinPt, viewport.yMinPt, viewport.widthPt, viewport.heightPt);

  // ---------------------------------------------------------------------------
  // A. Ligne de sol Z = 0
  // ---------------------------------------------------------------------------
  const groundS1 = -1500;
  const groundS2 = cutLenMm + 1500;
  const groundYPt = toPdfY(0);

  content.line(toPdfX(groundS1), groundYPt, toPdfX(groundS2), groundYPt, {
    strokeColor: [0.15, 0.2, 0.25],
    lineWidth: 1.0,
  });

  // Hachures symboliques de terrain sous le sol (tous les 4 mm papier)
  const groundStartPt = toPdfX(groundS1);
  const groundEndPt = toPdfX(groundS2);
  const hatchStepPt = 4 * MM_TO_PT;
  const hatchLenPt = 3.5 * MM_TO_PT;

  for (let gx = groundStartPt; gx <= groundEndPt; gx += hatchStepPt) {
    content.line(gx, groundYPt, gx - hatchLenPt, groundYPt - hatchLenPt, {
      strokeColor: [0.4, 0.45, 0.5],
      lineWidth: 0.35,
    });
  }

  // ---------------------------------------------------------------------------
  // B. Lignes de niveaux altimétriques
  // ---------------------------------------------------------------------------
  for (const lvl of scene.levels) {
    const yLvlPt = toPdfY(lvl.elevation);
    const startXPt = toPdfX(-1200);
    const endXPt = toPdfX(cutLenMm + 1000);

    // Ligne mixte tiret-point
    content.line(startXPt, yLvlPt, endXPt, yLvlPt, {
      strokeColor: [0.55, 0.35, 0.6],
      lineWidth: 0.5,
      lineDash: [6, 2, 1, 2],
    });

    // Triangle altimétrique (pointe en bas sur la ligne)
    const triTipX = startXPt;
    const triTipY = yLvlPt;
    const triW = 3 * MM_TO_PT;
    const triH = 2.5 * MM_TO_PT;

    content.polyline(
      [
        { x: triTipX, y: triTipY },
        { x: triTipX - triW / 2, y: triTipY + triH },
        { x: triTipX + triW / 2, y: triTipY + triH },
      ],
      {
        fillColor: [0.55, 0.35, 0.6],
        strokeColor: [0.55, 0.35, 0.6],
        lineWidth: 0.4,
        close: true,
      },
    );

    // Libellé de niveau
    const sign = lvl.elevation >= 0 ? '+' : '';
    const label = `${lvl.name} (${sign}${(lvl.elevation / 1000).toFixed(2)} m)`;
    content.text(label, startXPt - 4, yLvlPt + 1, {
      font: 'bold',
      size: 6.5,
      align: 'right',
      color: [0.35, 0.2, 0.4],
    });
  }

  // ---------------------------------------------------------------------------
  // C. Éléments projetés en arrière-plan (traits fins)
  // ---------------------------------------------------------------------------
  for (const item of scene.projectedItems) {
    const isMep =
      item.category === 'pipe' ||
      item.category === 'duct' ||
      item.category === 'cableTray';

    if (item.polygon && item.polygon.length >= 2) {
      const pts = item.polygon.map((p) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
      content.polyline(pts, {
        fillColor: isMep ? [0.9, 0.95, 1] : [0.96, 0.96, 0.97],
        strokeColor: isMep ? [0.15, 0.45, 0.75] : [0.45, 0.5, 0.55],
        lineWidth: isMep ? 0.6 : 0.4,
        close: true,
      });
    }

    if (item.lines) {
      for (const [p1, p2] of item.lines) {
        content.line(toPdfX(p1.x), toPdfY(p1.y), toPdfX(p2.x), toPdfY(p2.y), {
          strokeColor: [0.5, 0.55, 0.6],
          lineWidth: 0.35,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // D. Éléments coupés au premier plan (traits forts + poché + hachures 45°)
  // ---------------------------------------------------------------------------
  for (const item of scene.cutItems) {
    const isMep =
      item.category === 'pipe' ||
      item.category === 'duct' ||
      item.category === 'cableTray';

    if (item.polygon && item.polygon.length >= 2) {
      const pts = item.polygon.map((p) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));

      content.polyline(pts, {
        fillColor: isMep ? [0.1, 0.45, 0.85] : [0.88, 0.88, 0.9],
        strokeColor: isMep ? [0.05, 0.25, 0.55] : [0.12, 0.15, 0.22],
        lineWidth: isMep ? 0.8 : 1.1,
        close: true,
      });

      if (!isMep && item.polygon.length >= 3) {
        const spacingMm = options.hatchSpacing ?? 200;
        const hatches = generateHatchLines(item.polygon, {
          angleDeg: 45,
          spacing: spacingMm,
        });
        for (const [p1, p2] of hatches) {
          content.line(toPdfX(p1.x), toPdfY(p1.y), toPdfX(p2.x), toPdfY(p2.y), {
            strokeColor: [0.65, 0.65, 0.7],
            lineWidth: 0.35,
          });
        }
      }
    }
  }

  content.restore(); // Fin du clipping

  // 4. Cadre et Cartouche
  drawPageFrame(content, format);

  const kindLabel = scene.kind === 'elevation' ? 'ÉLÉVATION' : 'COUPE';
  const scaleText = isAuto ? `Auto (1:${scaleRatio})` : `1:${scaleRatio}`;

  drawTitleBlock(content, format, {
    projectTitle: options.projectTitle ?? 'PROJET MINI-BIM',
    sheetTitle: `${scene.cutName.toUpperCase()} - ${kindLabel}`,
    sheetNumber: `PL-${String(sheetIndex).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
    scaleLabel: scaleText,
    scaleRatio,
    date: options.date ?? new Date().toLocaleDateString('fr-FR'),
    author: options.author ?? 'Mini-BIM Engine',
    revision: options.revision ?? 'INDICE 0',
    showNorthArrow: false, // Pas de flèche Nord en coupe
  });
}
