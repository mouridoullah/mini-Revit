import type { BimState } from '@tabax/core';
import type { Vec2 } from '@tabax/geometry';
import { computePlanScene } from '../plan-scene/computePlanScene.js';
import type { PdfPageContent } from './PdfWriter.js';
import {
  drawPageFrame,
  drawTitleBlock,
  getDrawingViewportBox,
} from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

/**
 * Rendu vectoriel pur d'une planche de plan d'étage dans le carnet PDF.
 *
 * Utilise le modèle intermédiaire PlanScene pour garantir une cohérence
 * géométrique absolue entre le visualiseur, l'export DXF et l'export PDF.
 */
export function renderPlanPage(
  content: PdfPageContent,
  state: BimState,
  levelId: string,
  format: PageFormatDef,
  options: PdfBookOptions,
  sheetIndex: number,
  totalPages: number,
): void {
  const level = state.levels?.[levelId];
  const levelName = level?.name ?? 'Étage';

  const viewport = getDrawingViewportBox(format);

  // 1. Calcul du modèle intermédiaire unifié
  const scene = computePlanScene(state, {
    levelId,
    includeHatches: true,
    hatchSpacing: options.hatchSpacing ?? 250,
  });

  const hasGeometry = scene.bounds.width > 1 && scene.bounds.height > 1;
  const worldWidthMm = hasGeometry ? scene.bounds.width : 10000;
  const worldHeightMm = hasGeometry ? scene.bounds.height : 8000;
  const worldCenterX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const worldCenterY = (scene.bounds.minY + scene.bounds.maxY) / 2;

  // 2. Détermination de l'échelle architecturale
  let scaleRatio: number = 100;
  let isAuto = false;

  if (!options.scale || options.scale === 'auto') {
    isAuto = true;
    const fitScaleX = (worldWidthMm * 1.25) / viewport.widthMm;
    const fitScaleY = (worldHeightMm * 1.25) / viewport.heightMm;
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

  const toPdfX = (wx: number): number => viewCenterXPt + (wx - worldCenterX) * ptPerWorldMm;
  const toPdfY = (wy: number): number => viewCenterYPt + (wy - worldCenterY) * ptPerWorldMm;

  // 3. Clipping strict de la fenêtre de dessin
  content.save();
  content.clipRect(viewport.xMinPt, viewport.yMinPt, viewport.widthPt, viewport.heightPt);

  // ---------------------------------------------------------------------------
  // A. Tracé des dalles et trémies
  // ---------------------------------------------------------------------------
  for (const slab of scene.slabs) {
    if (slab.boundary.length >= 3) {
      const pts = slab.boundary.map((p: Vec2) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
      content.polyline(pts, {
        strokeColor: [0.35, 0.45, 0.4],
        lineWidth: 0.5,
        close: true,
      });
    }
    for (const hole of slab.holes) {
      if (hole.length >= 3) {
        const pts = hole.map((p: Vec2) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
        content.polyline(pts, {
          strokeColor: [0.35, 0.45, 0.4],
          lineWidth: 0.5,
          lineDash: [3, 2],
          close: true,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // B. Tracé des murs et hachures 45°
  // ---------------------------------------------------------------------------
  for (const wall of scene.walls) {
    if (wall.footprint.length >= 3) {
      const pts = wall.footprint.map((p) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
      content.polyline(pts, {
        fillColor: [0.88, 0.88, 0.9],
        strokeColor: [0.12, 0.15, 0.22],
        lineWidth: 1.1,
        close: true,
      });

      for (const [p1, p2] of wall.hatchLines) {
        content.line(toPdfX(p1.x), toPdfY(p1.y), toPdfX(p2.x), toPdfY(p2.y), {
          strokeColor: [0.65, 0.65, 0.7],
          lineWidth: 0.35,
        });
      }
    }

    // -------------------------------------------------------------------------
    // C. Ouvertures hébergées (Portes & Fenêtres)
    // -------------------------------------------------------------------------
    for (const op of wall.openings) {
      if (op.kind === 'door') {
        // Jambages
        content.line(
          toPdfX(op.jamb1[0].x),
          toPdfY(op.jamb1[0].y),
          toPdfX(op.jamb1[1].x),
          toPdfY(op.jamb1[1].y),
          { strokeColor: [0.12, 0.15, 0.22], lineWidth: 0.7 },
        );
        content.line(
          toPdfX(op.jamb2[0].x),
          toPdfY(op.jamb2[0].y),
          toPdfX(op.jamb2[1].x),
          toPdfY(op.jamb2[1].y),
          { strokeColor: [0.12, 0.15, 0.22], lineWidth: 0.7 },
        );

        // Battant
        if (op.leafLine) {
          content.line(
            toPdfX(op.leafLine[0].x),
            toPdfY(op.leafLine[0].y),
            toPdfX(op.leafLine[1].x),
            toPdfY(op.leafLine[1].y),
            { strokeColor: [0.2, 0.25, 0.35], lineWidth: 0.8 },
          );
        }

        // Arc de cercle
        if (op.arc) {
          const rPt = op.arc.radius * ptPerWorldMm;
          const startRad = (op.arc.startAngleDeg * Math.PI) / 180;
          const endRad = (op.arc.endAngleDeg * Math.PI) / 180;
          content.arc(toPdfX(op.arc.center.x), toPdfY(op.arc.center.y), rPt, startRad, endRad, {
            strokeColor: [0.4, 0.45, 0.55],
            lineWidth: 0.45,
            lineDash: [2.5, 1.5],
          });
        }
      } else if (op.kind === 'window') {
        if (op.frameLines && op.frameLines.length >= 4) {
          const l0 = op.frameLines[0];
          const l1 = op.frameLines[1];
          if (l0 && l1) {
            const p1A = l0[0];
            const p2A = l1[0];
            const p2B = l1[1];
            const p1B = l0[1];
            content.polyline(
              [
                { x: toPdfX(p1A.x), y: toPdfY(p1A.y) },
                { x: toPdfX(p2A.x), y: toPdfY(p2A.y) },
                { x: toPdfX(p2B.x), y: toPdfY(p2B.y) },
                { x: toPdfX(p1B.x), y: toPdfY(p1B.y) },
              ],
              {
                fillColor: [0.95, 0.98, 1],
                strokeColor: [0.2, 0.35, 0.55],
                lineWidth: 0.6,
                close: true,
              },
            );
          }
        }

        if (op.glassLine) {
          content.line(
            toPdfX(op.glassLine[0].x),
            toPdfY(op.glassLine[0].y),
            toPdfX(op.glassLine[1].x),
            toPdfY(op.glassLine[1].y),
            { strokeColor: [0.15, 0.45, 0.8], lineWidth: 0.9 },
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // D. Escaliers
  // ---------------------------------------------------------------------------
  for (const stair of scene.stairs) {
    const pts = stair.boundary.map((p) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
    content.polyline(pts, {
      fillColor: [0.97, 0.97, 0.97],
      strokeColor: [0.15, 0.15, 0.2],
      lineWidth: 0.8,
      close: true,
    });

    for (const [pA, pB] of stair.treads) {
      content.line(toPdfX(pA.x), toPdfY(pA.y), toPdfX(pB.x), toPdfY(pB.y), {
        strokeColor: [0.35, 0.35, 0.4],
        lineWidth: 0.4,
      });
    }

    content.line(
      toPdfX(stair.walkLine[0].x),
      toPdfY(stair.walkLine[0].y),
      toPdfX(stair.walkLine[1].x),
      toPdfY(stair.walkLine[1].y),
      { strokeColor: [0.1, 0.1, 0.1], lineWidth: 0.6 },
    );

    for (const [pA, pB] of stair.arrowLines) {
      content.line(toPdfX(pA.x), toPdfY(pA.y), toPdfX(pB.x), toPdfY(pB.y), {
        strokeColor: [0.1, 0.1, 0.1],
        lineWidth: 0.6,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // E. Réseaux MEP
  // ---------------------------------------------------------------------------
  const getMepColor = (system: string): [number, number, number] => {
    const type = system.toLowerCase();
    if (type.includes('cold') || type.includes('water') || type.includes('supply')) return [0.1, 0.4, 0.85];
    if (type.includes('hot') || type.includes('return')) return [0.85, 0.15, 0.15];
    if (type.includes('drain') || type.includes('waste')) return [0.35, 0.55, 0.25];
    if (type.includes('air') || type.includes('vent')) return [0.1, 0.65, 0.75];
    if (type.includes('power') || type.includes('cable') || type.includes('elec')) return [0.9, 0.65, 0.1];
    return [0.1, 0.4, 0.85];
  };

  for (const pipe of scene.mep.pipes) {
    const col = getMepColor(pipe.system);
    content.line(toPdfX(pipe.start.x), toPdfY(pipe.start.y), toPdfX(pipe.end.x), toPdfY(pipe.end.y), {
      strokeColor: col,
      lineWidth: 1.2,
    });
  }

  for (const duct of scene.mep.ducts) {
    content.line(toPdfX(duct.start.x), toPdfY(duct.start.y), toPdfX(duct.end.x), toPdfY(duct.end.y), {
      strokeColor: [0.1, 0.65, 0.75],
      lineWidth: 1.4,
    });
  }

  for (const tray of scene.mep.cableTrays) {
    content.line(toPdfX(tray.start.x), toPdfY(tray.start.y), toPdfX(tray.end.x), toPdfY(tray.end.y), {
      strokeColor: [0.9, 0.65, 0.1],
      lineWidth: 1.1,
    });
  }

  // ---------------------------------------------------------------------------
  // F. Cotations (Dimensions)
  // ---------------------------------------------------------------------------
  for (const dim of scene.dimensions) {
    const d1 = dim.line[0];
    const d2 = dim.line[1];
    const p1 = dim.witness1[0];
    const p2 = dim.witness2[0];

    // Lignes de rappel
    content.line(toPdfX(p1.x), toPdfY(p1.y), toPdfX(d1.x), toPdfY(d1.y), {
      strokeColor: [0.55, 0.25, 0.55],
      lineWidth: 0.35,
    });
    content.line(toPdfX(p2.x), toPdfY(p2.y), toPdfX(d2.x), toPdfY(d2.y), {
      strokeColor: [0.55, 0.25, 0.55],
      lineWidth: 0.35,
    });

    // Ligne de cote
    content.line(toPdfX(d1.x), toPdfY(d1.y), toPdfX(d2.x), toPdfY(d2.y), {
      strokeColor: [0.55, 0.25, 0.55],
      lineWidth: 0.5,
    });

    // Ticks à 45°
    const tickLenPt = 3;
    content.line(
      toPdfX(d1.x) - tickLenPt,
      toPdfY(d1.y) - tickLenPt,
      toPdfX(d1.x) + tickLenPt,
      toPdfY(d1.y) + tickLenPt,
      { strokeColor: [0.55, 0.25, 0.55], lineWidth: 0.8 },
    );
    content.line(
      toPdfX(d2.x) - tickLenPt,
      toPdfY(d2.y) - tickLenPt,
      toPdfX(d2.x) + tickLenPt,
      toPdfY(d2.y) + tickLenPt,
      { strokeColor: [0.55, 0.25, 0.55], lineWidth: 0.8 },
    );

    // Texte de cote avec masque d'arrière-plan opaque
    const valText = dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`;
    content.text(valText, toPdfX(dim.textPos.x), toPdfY(dim.textPos.y), {
      size: 6.5,
      align: 'center',
      color: [0.4, 0.1, 0.4],
      backgroundBox: true,
      backgroundPadding: 2,
    });
  }

  // ---------------------------------------------------------------------------
  // G. Symboles de coupe ISO
  // ---------------------------------------------------------------------------
  for (const cut of scene.sectionCuts) {
    content.line(
      toPdfX(cut.line[0].x),
      toPdfY(cut.line[0].y),
      toPdfX(cut.line[1].x),
      toPdfY(cut.line[1].y),
      {
        strokeColor: [0.7, 0.15, 0.5],
        lineWidth: 0.9,
        lineDash: [6, 2, 1, 2],
      },
    );

    const rPt = 4 * MM_TO_PT;
    content.circle(toPdfX(cut.line[0].x), toPdfY(cut.line[0].y), rPt, {
      fillColor: [1, 1, 1],
      strokeColor: [0.7, 0.15, 0.5],
      lineWidth: 0.8,
    });
    content.circle(toPdfX(cut.line[1].x), toPdfY(cut.line[1].y), rPt, {
      fillColor: [1, 1, 1],
      strokeColor: [0.7, 0.15, 0.5],
      lineWidth: 0.8,
    });

    content.text(cut.name, toPdfX(cut.line[0].x), toPdfY(cut.line[0].y) - 2.5, {
      font: 'bold',
      size: 7.5,
      align: 'center',
      color: [0.7, 0.15, 0.5],
    });
    content.text(`${cut.name}'`, toPdfX(cut.line[1].x), toPdfY(cut.line[1].y) - 2.5, {
      font: 'bold',
      size: 7.5,
      align: 'center',
      color: [0.7, 0.15, 0.5],
    });
  }

  // ---------------------------------------------------------------------------
  // H. Pièces (Rooms)
  // ---------------------------------------------------------------------------
  for (const room of scene.rooms) {
    const rxPt = toPdfX(room.labelPosition.x);
    const ryPt = toPdfY(room.labelPosition.y);

    const roomName = room.name ?? 'Pièce';
    const areaM2 = room.areaM2 > 0 ? room.areaM2.toFixed(2) : undefined;
    const badgeW = 48;
    const badgeH = areaM2 ? 22 : 14;

    content.rect(rxPt - badgeW / 2, ryPt - badgeH / 2, badgeW, badgeH, {
      fillColor: [1, 1, 1],
      strokeColor: [0.3, 0.5, 0.8],
      lineWidth: 0.5,
    });

    content.text(roomName, rxPt, ryPt + (areaM2 ? 2 : -2.5), {
      font: 'bold',
      size: 7.5,
      align: 'center',
      color: [0.1, 0.2, 0.4],
    });

    if (areaM2) {
      content.text(`${areaM2} m²`, rxPt, ryPt - 7, {
        size: 6.5,
        align: 'center',
        color: [0.4, 0.45, 0.55],
      });
    }
  }

  content.restore(); // Fin du clipping

  // 4. Cadre de planche & Cartouche architectural
  drawPageFrame(content, format);

  const scaleText = isAuto ? `Auto (1:${scaleRatio})` : `1:${scaleRatio}`;
  drawTitleBlock(content, format, {
    projectTitle: options.projectTitle ?? 'PROJET TABAX',
    sheetTitle: `PLAN D'ÉTAGE - ${levelName.toUpperCase()}`,
    sheetNumber: `PL-${String(sheetIndex).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
    scaleLabel: scaleText,
    scaleRatio,
    date: options.date ?? new Date().toLocaleDateString('fr-FR'),
    author: options.author ?? 'Tabax Engine',
    revision: options.revision ?? 'INDICE 0',
    showNorthArrow: true,
  });
}
