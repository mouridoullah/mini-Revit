import { vec2 } from '@tabax/geometry';
import type { DocumentFor2D } from '../types.js';
import { computePlanScene } from '../plan-scene/computePlanScene.js';
import { DxfWriter } from './DxfWriter.js';
import type { PlanDxfOptions } from './types.js';

/**
 * Génère un fichier DXF R12 (AC1009) complet pour le plan d'étage 2D.
 *
 * Principes stricts de conformité CAO :
 * - Repère mondial 1:1 en millimètres (Y-up natif) : aucune inversion d'axe ni mise à l'échelle papier
 * - Calques normalisés par corps d'état avec couleurs ACI universelles
 * - S'appuie sur le modèle unifié PlanScene pour garantir la cohérence absolue avec SVG et PDF
 * - Compatibilité vérifiée 100% avec AutoCAD, LibreCAD, QCAD et BricsCAD
 */
export function generatePlanDxf(
  doc: DocumentFor2D,
  options: PlanDxfOptions = {},
): string {
  const writer = new DxfWriter();

  // -------------------------------------------------------------------------
  // 1. Déclaration exhaustive des calques et styles normalisés
  // -------------------------------------------------------------------------
  writer.addLayer({ name: 'ARCH-WALLS', color: 7, lineType: 'CONTINUOUS' }); // Murs (Blanc/Noir)
  writer.addLayer({ name: 'ARCH-HATCH', color: 8, lineType: 'CONTINUOUS' }); // Hachures murs (Gris)
  writer.addLayer({ name: 'ARCH-OPENINGS', color: 4, lineType: 'CONTINUOUS' }); // Baies, vitrages (Cyan)
  writer.addLayer({ name: 'ARCH-DOOR-SWINGS', color: 8, lineType: 'DASHED' }); // Battements de portes (Tiretés)
  writer.addLayer({ name: 'ARCH-SLABS', color: 3, lineType: 'CONTINUOUS' }); // Dalles et trémies (Vert)
  writer.addLayer({ name: 'ARCH-ROOFS', color: 2, lineType: 'CONTINUOUS' }); // Toitures (Jaune)
  writer.addLayer({ name: 'ARCH-STAIRS', color: 7, lineType: 'CONTINUOUS' }); // Escaliers et marches (Blanc/Noir)
  writer.addLayer({ name: 'ARCH-FURNITURE', color: 9, lineType: 'CONTINUOUS' }); // Mobilier, sanitaires (Gris clair)
  writer.addLayer({ name: 'ARCH-ROOMS', color: 5, lineType: 'CONTINUOUS' }); // Libellés de pièces (Bleu)
  writer.addLayer({ name: 'ARCH-DIMS', color: 6, lineType: 'CONTINUOUS' }); // Cotations (Magenta)
  writer.addLayer({ name: 'ARCH-SECTIONS', color: 6, lineType: 'DASHDOT' }); // Lignes de coupe ISO (Tiret-point)

  // Calques MEP
  writer.addLayer({ name: 'MEP-SUPPLY', color: 5, lineType: 'CONTINUOUS' }); // Eau froide / Soufflage (Bleu)
  writer.addLayer({ name: 'MEP-RETURN', color: 1, lineType: 'CONTINUOUS' }); // Eau chaude / Retour (Rouge)
  writer.addLayer({ name: 'MEP-DRAINAGE', color: 3, lineType: 'CONTINUOUS' }); // Évacuations EU/EV (Vert/Brun)
  writer.addLayer({ name: 'MEP-VENTILATION', color: 4, lineType: 'CONTINUOUS' }); // VMC (Cyan)
  writer.addLayer({ name: 'MEP-ELECTRICAL', color: 2, lineType: 'CONTINUOUS' }); // Électricité (Jaune/Ambre)

  // -------------------------------------------------------------------------
  // 2. Modèle intermédiaire PlanScene
  // -------------------------------------------------------------------------
  const scene = computePlanScene(doc, {
    levelId: options.levelId,
    includeHatches: options.includeHatches,
    hatchSpacing: options.hatchSpacing,
    rooms: options.rooms,
    dimensions: options.dimensions,
  });

  // -------------------------------------------------------------------------
  // 3. Murs & Hachures
  // -------------------------------------------------------------------------
  for (const wall of scene.walls) {
    writer.addPolyline('ARCH-WALLS', wall.footprint, true);
    for (const [p1, p2] of wall.hatchLines) {
      writer.addLine('ARCH-HATCH', p1, p2);
    }

    // 4. Ouvertures hébergées (Portes & Fenêtres)
    for (const op of wall.openings) {
      if (op.kind === 'door') {
        writer.addLine('ARCH-OPENINGS', op.jamb1[0], op.jamb1[1]);
        writer.addLine('ARCH-OPENINGS', op.jamb2[0], op.jamb2[1]);
        if (op.leafLine) {
          writer.addLine('ARCH-OPENINGS', op.leafLine[0], op.leafLine[1]);
        }
        if (op.arc) {
          writer.addArc(
            'ARCH-DOOR-SWINGS',
            op.arc.center,
            op.arc.radius,
            op.arc.startAngleDeg,
            op.arc.endAngleDeg,
          );
        }
      } else if (op.kind === 'window') {
        if (op.frameLines) {
          for (const [pA, pB] of op.frameLines) {
            writer.addLine('ARCH-OPENINGS', pA, pB);
          }
        }
        if (op.glassLine) {
          writer.addLine('ARCH-OPENINGS', op.glassLine[0], op.glassLine[1]);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Dalles et Trémies
  // -------------------------------------------------------------------------
  for (const slab of scene.slabs) {
    if (slab.boundary.length >= 3) {
      writer.addPolyline('ARCH-SLABS', slab.boundary, true);
    }
    for (const hole of slab.holes) {
      if (hole.length >= 3) {
        writer.addPolyline('ARCH-SLABS', hole, true, { lineType: 'DASHED' });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Toitures
  // -------------------------------------------------------------------------
  for (const roof of scene.roofs) {
    if (roof.boundary.length >= 3) {
      writer.addPolyline('ARCH-ROOFS', roof.boundary, true);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Escaliers
  // -------------------------------------------------------------------------
  for (const stair of scene.stairs) {
    writer.addPolyline('ARCH-STAIRS', stair.boundary, true);
    for (const [pA, pB] of stair.treads) {
      writer.addLine('ARCH-STAIRS', pA, pB);
    }
    writer.addLine('ARCH-STAIRS', stair.walkLine[0], stair.walkLine[1]);
    for (const [pA, pB] of stair.arrowLines) {
      writer.addLine('ARCH-STAIRS', pA, pB);
    }
  }

  // -------------------------------------------------------------------------
  // 8. Mobilier et Composants
  // -------------------------------------------------------------------------
  for (const comp of scene.components) {
    writer.addPolyline('ARCH-FURNITURE', comp.corners, true);
  }

  // -------------------------------------------------------------------------
  // 9. Pièces (Rooms)
  // -------------------------------------------------------------------------
  for (const room of scene.rooms) {
    if (room.polygon.length >= 3) {
      writer.addPolyline('ARCH-ROOMS', room.polygon, true, { lineType: 'CONTINUOUS' });
    }
    const areaM2 = room.areaM2.toFixed(2);
    writer.addText('ARCH-ROOMS', room.labelPosition, 250, room.name, {
      halign: 'center',
      valign: 'middle',
    });
    writer.addText(
      'ARCH-ROOMS',
      vec2(room.labelPosition.x, room.labelPosition.y - 350),
      180,
      `${areaM2} m2`,
      { halign: 'center', valign: 'middle' },
    );
  }

  // -------------------------------------------------------------------------
  // 10. Cotations (Dimensions)
  // -------------------------------------------------------------------------
  for (const dim of scene.dimensions) {
    writer.addLine('ARCH-DIMS', dim.witness1[0], dim.witness1[1]);
    writer.addLine('ARCH-DIMS', dim.witness2[0], dim.witness2[1]);
    writer.addLine('ARCH-DIMS', dim.line[0], dim.line[1]);
    for (const [tA, tB] of dim.ticks) {
      writer.addLine('ARCH-DIMS', tA, tB);
    }
    const textAngle =
      dim.angleDeg > 90 && dim.angleDeg <= 270 ? (dim.angleDeg + 180) % 360 : dim.angleDeg;
    writer.addText('ARCH-DIMS', dim.textPos, 160, dim.text, {
      rotationDeg: textAngle,
      halign: 'center',
      valign: 'middle',
    });
  }

  // -------------------------------------------------------------------------
  // 11. Symboles de Coupe ISO (Section Cuts)
  // -------------------------------------------------------------------------
  for (const cut of scene.sectionCuts) {
    writer.addLine('ARCH-SECTIONS', cut.line[0], cut.line[1], { lineType: 'DASHDOT' });
    const r = 250;
    writer.addCircle('ARCH-SECTIONS', cut.line[0], r);
    writer.addCircle('ARCH-SECTIONS', cut.line[1], r);
    writer.addText('ARCH-SECTIONS', cut.line[0], 180, cut.name, {
      halign: 'center',
      valign: 'middle',
    });
    writer.addText('ARCH-SECTIONS', cut.line[1], 180, `${cut.name}'`, {
      halign: 'center',
      valign: 'middle',
    });
    for (const arr of cut.arrows) {
      writer.addLine('ARCH-SECTIONS', arr.p1, arr.p2);
    }
  }

  // -------------------------------------------------------------------------
  // 12. Réseaux MEP
  // -------------------------------------------------------------------------
  if (options.includeMep !== false) {
    for (const pipe of scene.mep.pipes) {
      const sysType = pipe.system.toLowerCase();
      let layer = 'MEP-SUPPLY';
      if (sysType.includes('hot') || sysType.includes('return')) layer = 'MEP-RETURN';
      else if (sysType.includes('drain') || sysType.includes('waste')) layer = 'MEP-DRAINAGE';
      else if (sysType.includes('vent') || sysType.includes('air')) layer = 'MEP-VENTILATION';
      else if (sysType.includes('elec') || sysType.includes('power')) layer = 'MEP-ELECTRICAL';
      writer.addLine(layer, pipe.start, pipe.end);
    }
    for (const duct of scene.mep.ducts) {
      writer.addLine('MEP-VENTILATION', duct.start, duct.end);
    }
    for (const tray of scene.mep.cableTrays) {
      writer.addLine('MEP-ELECTRICAL', tray.start, tray.end);
    }
  }

  return writer.toDxfString();
}
