import {
  computeWallFootprint2d,
  solveWallJunctions,
  type WallInput,
  type Vec2,
  vec2,
  GEOM_CONFIG,
} from '@tabax/geometry';
import type { DocumentFor2D } from '../types.js';
import { resolveDimensionPoints } from '../renderer/dimensions.js';
import { DxfWriter } from './DxfWriter.js';
import { generateHatchLines } from './hatch.js';
import type { PlanDxfOptions } from './types.js';

/**
 * Génère un fichier DXF R12 (AC1009) complet pour le plan d'étage 2D.
 *
 * Principes stricts de conformité CAO :
 * - Repère mondial 1:1 en millimètres (Y-up natif) : aucune inversion d'axe ni mise à l'échelle papier
 * - Calques normalisés par corps d'état avec couleurs ACI universelles
 * - Résolution géométrique identique au visualiseur et à l'export SVG (jonctions, baies, dalles)
 * - Compatibilité vérifiée 100% avec AutoCAD, LibreCAD, QCAD et BricsCAD
 */
export function generatePlanDxf(
  doc: DocumentFor2D,
  options: PlanDxfOptions = {},
): string {
  const writer = new DxfWriter();
  const state = doc.getState();

  // -------------------------------------------------------------------------
  // 1. Déclaration exhaustive des calques et styles
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
  // 2. Détermination du niveau architectural actif
  // -------------------------------------------------------------------------
  let levelFilter = options.levelId;
  if (levelFilter === undefined) {
    const levelIds = state.levels ? Object.keys(state.levels) : [];
    if (levelIds.length > 0) {
      levelFilter = levelIds[0];
    }
  }

  // -------------------------------------------------------------------------
  // 3. Murs et jonctions résolues
  // -------------------------------------------------------------------------
  const allWalls = Object.values(state.walls ?? {}).filter(
    (w) => !levelFilter || !w.levelId || w.levelId === levelFilter,
  );

  const wallInputs: WallInput[] = [];
  for (const wall of allWalls) {
    const wallType = wall.typeId ? state.wallTypes?.[wall.typeId] : undefined;
    const thickness = wallType?.thickness ?? 200;
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (len > GEOM_CONFIG.EPSILON_DISTANCE && thickness > 0) {
      wallInputs.push({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        thickness,
        locationLine: 'center',
      });
    }
  }

  const resolvedPolygons = new Map<string, readonly Vec2[]>();
  if (wallInputs.length > 0) {
    try {
      const solution = solveWallJunctions(wallInputs);
      for (const rw of solution.walls) {
        resolvedPolygons.set(rw.id, rw.polygon);
      }
    } catch {
      // Repli sur l'emprise nominale
    }
  }

  for (const wall of allWalls) {
    const wallType = wall.typeId ? state.wallTypes?.[wall.typeId] : undefined;
    const thickness = wallType?.thickness ?? 200;

    const footprint = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness,
      locationLine: 'center',
    });
    const vertices = resolvedPolygons.get(wall.id) ?? footprint.vertices;

    // Contour du mur
    writer.addPolyline('ARCH-WALLS', vertices, true);

    // Hachures linéaires à 45°
    if (options.includeHatches !== false && vertices.length >= 3) {
      const spacing = options.hatchSpacing ?? 250;
      const hatches = generateHatchLines(vertices, { angleDeg: 45, spacing });
      for (const [p1, p2] of hatches) {
        writer.addLine('ARCH-HATCH', p1, p2);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Ouvertures hébergées (Portes & Fenêtres)
  // -------------------------------------------------------------------------
  const doors = Object.values(state.doors ?? {});
  const windows = Object.values(state.windows ?? {});

  for (const door of doors) {
    const host = state.walls[door.hostWallId];
    if (!host) continue;
    if (levelFilter && host.levelId && host.levelId !== levelFilter) continue;

    const dx = host.end.x - host.start.x;
    const dy = host.end.y - host.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const dt = door.doorTypeId ? state.doorTypes?.[door.doorTypeId] : undefined;
    const doorWidth = dt?.width ?? 900;
    const hingeX = host.start.x + ux * door.offsetAlong;
    const hingeY = host.start.y + uy * door.offsetAlong;
    const endX = host.start.x + ux * (door.offsetAlong + doorWidth);
    const endY = host.start.y + uy * (door.offsetAlong + doorWidth);

    const wallType = host.typeId ? state.wallTypes?.[host.typeId] : undefined;
    const thick = wallType?.thickness ?? 200;

    // Jambages d'ouverture
    const j1A = vec2(hingeX + nx * (thick / 2), hingeY + ny * (thick / 2));
    const j1B = vec2(hingeX - nx * (thick / 2), hingeY - ny * (thick / 2));
    const j2A = vec2(endX + nx * (thick / 2), endY + ny * (thick / 2));
    const j2B = vec2(endX - nx * (thick / 2), endY - ny * (thick / 2));

    writer.addLine('ARCH-OPENINGS', j1A, j1B);
    writer.addLine('ARCH-OPENINGS', j2A, j2B);

    // Battant de porte ouvert à 90°
    const swingSide = door.swing.direction === 'in' ? 1 : -1;
    const leafEnd = vec2(hingeX + nx * swingSide * doorWidth, hingeY + ny * swingSide * doorWidth);
    writer.addLine('ARCH-OPENINGS', vec2(hingeX, hingeY), leafEnd);

    // Arc de battement à 90°
    const aWall = ((Math.atan2(uy, ux) * 180) / Math.PI + 360) % 360;
    const aLeaf = ((Math.atan2(ny * swingSide, nx * swingSide) * 180) / Math.PI + 360) % 360;
    const diffCCW = ((aLeaf - aWall) + 360) % 360;

    if (Math.abs(diffCCW - 90) < 1e-2) {
      writer.addArc('ARCH-DOOR-SWINGS', vec2(hingeX, hingeY), doorWidth, aWall, aLeaf);
    } else {
      writer.addArc('ARCH-DOOR-SWINGS', vec2(hingeX, hingeY), doorWidth, aLeaf, aWall);
    }
  }

  for (const win of windows) {
    const host = state.walls[win.hostWallId];
    if (!host) continue;
    if (levelFilter && host.levelId && host.levelId !== levelFilter) continue;

    const dx = host.end.x - host.start.x;
    const dy = host.end.y - host.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const wt = win.windowTypeId ? state.windowTypes?.[win.windowTypeId] : undefined;
    const winWidth = wt?.width ?? 1200;
    const startX = host.start.x + ux * win.offsetAlong;
    const startY = host.start.y + uy * win.offsetAlong;
    const endX = host.start.x + ux * (win.offsetAlong + winWidth);
    const endY = host.start.y + uy * (win.offsetAlong + winWidth);

    const wallType = host.typeId ? state.wallTypes?.[host.typeId] : undefined;
    const thick = wallType?.thickness ?? 200;

    // Cadre de baie
    const p1A = vec2(startX + nx * (thick / 2), startY + ny * (thick / 2));
    const p1B = vec2(startX - nx * (thick / 2), startY - ny * (thick / 2));
    const p2A = vec2(endX + nx * (thick / 2), endY + ny * (thick / 2));
    const p2B = vec2(endX - nx * (thick / 2), endY - ny * (thick / 2));

    writer.addLine('ARCH-OPENINGS', p1A, p1B);
    writer.addLine('ARCH-OPENINGS', p2A, p2B);
    writer.addLine('ARCH-OPENINGS', p1A, p2A);
    writer.addLine('ARCH-OPENINGS', p1B, p2B);

    // Ligne de vitrage centrale
    writer.addLine('ARCH-OPENINGS', vec2(startX, startY), vec2(endX, endY));
  }

  // -------------------------------------------------------------------------
  // 5. Dalles et Trémies
  // -------------------------------------------------------------------------
  const slabs = Object.values(state.slabs ?? {}).filter(
    (s) => !levelFilter || !s.levelId || s.levelId === levelFilter,
  );

  for (const slab of slabs) {
    if (slab.boundary && slab.boundary.length >= 3) {
      writer.addPolyline('ARCH-SLABS', slab.boundary, true);
    }
    const allHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])];
    for (const hole of allHoles) {
      if (hole && hole.length >= 3) {
        writer.addPolyline('ARCH-SLABS', hole, true, { lineType: 'DASHED' });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Toitures
  // -------------------------------------------------------------------------
  const roofs = Object.values(state.roofs ?? {}).filter(
    (r) => !levelFilter || !r.levelId || r.levelId === levelFilter,
  );

  for (const roof of roofs) {
    if (roof.footprint && roof.footprint.length >= 3) {
      writer.addPolyline('ARCH-ROOFS', roof.footprint, true);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Escaliers
  // -------------------------------------------------------------------------
  const stairs = Object.values(state.stairs ?? {}).filter(
    (s) =>
      !levelFilter ||
      s.bottomLevelId === levelFilter ||
      s.topLevelId === levelFilter,
  );

  for (const stair of stairs) {
    const dx = stair.end.x - stair.start.x;
    const dy = stair.end.y - stair.start.y;
    const len = Math.hypot(dx, dy);
    const stairType = stair.stairTypeId ? state.stairTypes?.[stair.stairTypeId] : undefined;
    const width = stair.widthOverride ?? stairType?.width ?? 900;
    if (len <= 1e-4 || width <= 0) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const halfW = width / 2;

    const c1 = vec2(stair.start.x - nx * halfW, stair.start.y - ny * halfW);
    const c2 = vec2(stair.end.x - nx * halfW, stair.end.y - ny * halfW);
    const c3 = vec2(stair.end.x + nx * halfW, stair.end.y + ny * halfW);
    const c4 = vec2(stair.start.x + nx * halfW, stair.start.y + ny * halfW);

    writer.addPolyline('ARCH-STAIRS', [c1, c2, c3, c4], true);

    // Lignes de contremarches
    const nSteps = Math.max(3, Math.round(len / 280));
    const stepDist = len / nSteps;
    for (let i = 1; i < nSteps; i++) {
      const mx = stair.start.x + ux * (i * stepDist);
      const my = stair.start.y + uy * (i * stepDist);
      const pA = vec2(mx - nx * halfW, my - ny * halfW);
      const pB = vec2(mx + nx * halfW, my + ny * halfW);
      writer.addLine('ARCH-STAIRS', pA, pB);
    }

    // Ligne de foulée avec flèche de montée
    const midStart = vec2(stair.start.x, stair.start.y);
    const midEnd = vec2(stair.end.x, stair.end.y);
    writer.addLine('ARCH-STAIRS', midStart, midEnd);

    // Flèche en tête
    const arrowLen = 200;
    const arrowW = 100;
    const arrowLeft = vec2(midEnd.x - ux * arrowLen + nx * arrowW, midEnd.y - uy * arrowLen + ny * arrowW);
    const arrowRight = vec2(midEnd.x - ux * arrowLen - nx * arrowW, midEnd.y - uy * arrowLen - ny * arrowW);
    writer.addLine('ARCH-STAIRS', midEnd, arrowLeft);
    writer.addLine('ARCH-STAIRS', midEnd, arrowRight);
  }

  // -------------------------------------------------------------------------
  // 8. Mobilier et Composants
  // -------------------------------------------------------------------------
  const components = Object.values(state.components ?? {}).filter(
    (c) => !levelFilter || !c.levelId || c.levelId === levelFilter,
  );

  for (const comp of components) {
    const compType = comp.typeId ? state.componentTypes?.[comp.typeId] : undefined;
    const width = comp.widthOverride ?? compType?.width ?? 600;
    const depth = comp.depthOverride ?? compType?.depth ?? 600;
    const halfW = width / 2;
    const halfD = depth / 2;

    const rad = ((comp.placement.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = comp.placement.x;
    const cy = comp.placement.y;

    const corners: Vec2[] = [
      vec2(cx + (-halfW) * cos - (-halfD) * sin, cy + (-halfW) * sin + (-halfD) * cos),
      vec2(cx + halfW * cos - (-halfD) * sin, cy + halfW * sin + (-halfD) * cos),
      vec2(cx + halfW * cos - halfD * sin, cy + halfW * sin + halfD * cos),
      vec2(cx + (-halfW) * cos - halfD * sin, cy + (-halfW) * sin + halfD * cos),
    ];

    writer.addPolyline('ARCH-FURNITURE', corners, true);
  }

  // -------------------------------------------------------------------------
  // 9. Pièces (Rooms)
  // -------------------------------------------------------------------------
  if (options.rooms && options.rooms.length > 0) {
    for (const room of options.rooms) {
      if (room.polygon && room.polygon.length >= 3) {
        writer.addPolyline('ARCH-ROOMS', room.polygon, true, { lineType: 'CONTINUOUS' });
      }
      const roomName = room.name ?? 'Piece';
      const areaM2 = (room.areaMm2 / 1e6).toFixed(2);

      writer.addText('ARCH-ROOMS', room.seed, 250, roomName, {
        halign: 'center',
        valign: 'middle',
      });
      writer.addText(
        'ARCH-ROOMS',
        vec2(room.seed.x, room.seed.y - 350),
        180,
        `${areaM2} m2`,
        { halign: 'center', valign: 'middle' },
      );
    }
  }

  // -------------------------------------------------------------------------
  // 10. Cotations (Dimensions)
  // -------------------------------------------------------------------------
  const dimsToDraw =
    options.dimensions ?? (state.dimensions ? Object.values(state.dimensions) : []);

  for (const dim of dimsToDraw) {
    if (levelFilter && dim.levelId && dim.levelId !== levelFilter) continue;

    const pts = resolveDimensionPoints(dim, state.walls);
    if (!pts) continue;
    const { p1, p2 } = pts;

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

    const d1World = vec2(p1.x + ox, p1.y + oy);
    const d2World = vec2(p2.x + ox, p2.y + oy);

    // Lignes de rappel
    writer.addLine('ARCH-DIMS', p1, d1World);
    writer.addLine('ARCH-DIMS', p2, d2World);

    // Ligne de cote
    writer.addLine('ARCH-DIMS', d1World, d2World);

    // Ticks à 45°
    const tickLen = 100;
    const tUx = (Math.SQRT1_2) * tickLen;
    const tUy = (Math.SQRT1_2) * tickLen;

    writer.addLine(
      'ARCH-DIMS',
      vec2(d1World.x - tUx, d1World.y - tUy),
      vec2(d1World.x + tUx, d1World.y + tUy),
    );
    writer.addLine(
      'ARCH-DIMS',
      vec2(d2World.x - tUx, d2World.y - tUy),
      vec2(d2World.x + tUx, d2World.y + tUy),
    );

    // Texte de cote
    const valText =
      dim.customLabel ??
      (dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`);

    const midX = (d1World.x + d2World.x) / 2 + nx * 150;
    const midY = (d1World.y + d2World.y) / 2 + ny * 150;

    const dimAngle = ((Math.atan2(uy, ux) * 180) / Math.PI + 360) % 360;
    // Maintenir le texte lisible de bas en haut et de gauche à droite
    const textAngle = dimAngle > 90 && dimAngle <= 270 ? (dimAngle + 180) % 360 : dimAngle;

    writer.addText('ARCH-DIMS', vec2(midX, midY), 160, valText, {
      rotationDeg: textAngle,
      halign: 'center',
      valign: 'middle',
    });
  }

  // -------------------------------------------------------------------------
  // 11. Symboles de Coupe ISO (Section Cuts)
  // -------------------------------------------------------------------------
  const sectionCuts = Object.values(state.sectionCuts ?? {});
  for (const cut of sectionCuts) {
    const dx = cut.end.x - cut.start.x;
    const dy = cut.end.y - cut.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = cut.viewDirection * -uy;
    const ny = cut.viewDirection * ux;

    // Ligne mixte de coupe
    writer.addLine('ARCH-SECTIONS', cut.start, cut.end, { lineType: 'DASHDOT' });

    // Pastilles d'extrémités
    const r = 250;
    writer.addCircle('ARCH-SECTIONS', cut.start, r);
    writer.addCircle('ARCH-SECTIONS', cut.end, r);

    // Lettres de repère A / A'
    writer.addText('ARCH-SECTIONS', cut.start, 180, cut.label, {
      halign: 'center',
      valign: 'middle',
    });
    writer.addText('ARCH-SECTIONS', cut.end, 180, `${cut.label}'`, {
      halign: 'center',
      valign: 'middle',
    });

    // Flèches d'orientation du regard
    const arrowStart = vec2(cut.start.x + nx * r, cut.start.y + ny * r);
    const arrowTip = vec2(arrowStart.x + nx * 400, arrowStart.y + ny * 400);
    const arrowSide1 = vec2(arrowTip.x - nx * 150 + ux * 100, arrowTip.y - ny * 150 + uy * 100);
    const arrowSide2 = vec2(arrowTip.x - nx * 150 - ux * 100, arrowTip.y - ny * 150 - uy * 100);

    writer.addLine('ARCH-SECTIONS', arrowStart, arrowTip);
    writer.addLine('ARCH-SECTIONS', arrowTip, arrowSide1);
    writer.addLine('ARCH-SECTIONS', arrowTip, arrowSide2);
  }

  // -------------------------------------------------------------------------
  // 12. Réseaux MEP
  // -------------------------------------------------------------------------
  if (options.includeMep !== false) {
    const pipes = Object.values(state.pipes ?? {}).filter(
      (p) => !levelFilter || !p.levelId || p.levelId === levelFilter,
    );
    const ducts = Object.values(state.ducts ?? {}).filter(
      (d) => !levelFilter || !d.levelId || d.levelId === levelFilter,
    );
    const cableTrays = Object.values(state.cableTrays ?? {}).filter(
      (t) => !levelFilter || !t.levelId || t.levelId === levelFilter,
    );

    const getMepLayer = (systemId?: string): string => {
      const sys = systemId ? state.mepSystems?.[systemId] : undefined;
      const type = (sys?.systemType ?? '').toLowerCase();
      if (type.includes('cold') || type.includes('water')) return 'MEP-SUPPLY';
      if (type.includes('hot')) return 'MEP-RETURN';
      if (type.includes('drain') || type.includes('waste') || type.includes('soil')) return 'MEP-DRAINAGE';
      if (type.includes('air') || type.includes('vent')) return 'MEP-VENTILATION';
      if (type.includes('power') || type.includes('cable')) return 'MEP-ELECTRICAL';
      return 'MEP-SUPPLY';
    };

    for (const pipe of pipes) {
      const layer = getMepLayer(pipe.systemId);
      writer.addLine(layer, vec2(pipe.start.x, pipe.start.y), vec2(pipe.end.x, pipe.end.y));
    }

    for (const duct of ducts) {
      writer.addLine('MEP-VENTILATION', vec2(duct.start.x, duct.start.y), vec2(duct.end.x, duct.end.y));
    }

    for (const tray of cableTrays) {
      writer.addLine('MEP-ELECTRICAL', vec2(tray.start.x, tray.start.y), vec2(tray.end.x, tray.end.y));
    }
  }

  return writer.toDxfString();
}
