import type {
  BimState,
  CableTray,
  Dimension,
  Door,
  Duct,
  Pipe,
  Room,
  SectionCut,
  Slab,
  Stair,
  Wall,
  Window,
} from '@tabax/core';
import {
  computeWallFootprint2d,
  solveWallJunctions,
  type WallInput,
  type Vec2,
  vec2,
  GEOM_CONFIG,
} from '@tabax/geometry';
import { generateHatchLines } from '../dxf/hatch.js';
import { resolveDimensionPoints } from '../renderer/dimensions.js';
import type { DimensionFor2D, WallFor2D } from '../types.js';
import type { PdfPageContent } from './PdfWriter.js';
import {
  drawPageFrame,
  drawTitleBlock,
  getDrawingViewportBox,
} from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

/**
 * Rendu vectoriel pur d'une planche de plan d'étage dans le carnet PDF.
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

  // 1. Filtrage des entités de ce niveau
  const walls: Wall[] = Object.values(state.walls ?? {}).filter(
    (w) => !w.levelId || w.levelId === levelId,
  );

  // 2. Calcul de la boîte englobante pour cadrage automatique
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }

  // Prise en compte des dalles si disponibles
  const slabs: Slab[] = Object.values(state.slabs ?? {}).filter(
    (s) => !s.levelId || s.levelId === levelId,
  );
  for (const s of slabs) {
    if (s.boundary) {
      for (const p of s.boundary) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
  }

  const hasGeometry = Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX;
  const worldWidthMm = hasGeometry ? maxX - minX : 10000;
  const worldHeightMm = hasGeometry ? maxY - minY : 8000;
  const worldCenterX = hasGeometry ? (minX + maxX) / 2 : 0;
  const worldCenterY = hasGeometry ? (minY + maxY) / 2 : 0;

  // 3. Détermination de l'échelle architecturale
  let scaleRatio: number = 100;
  let isAuto = false;

  if (!options.scale || options.scale === 'auto') {
    isAuto = true;
    // Marge de sécurité 25%
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

  // Centre de la vue dans la zone de dessin
  const viewCenterXPt = viewport.xMinPt + viewport.widthPt / 2;
  const viewCenterYPt = viewport.yMinPt + viewport.heightPt / 2;

  // Fonction de projection globale monde -> points PDF
  const toPdfX = (wx: number): number => viewCenterXPt + (wx - worldCenterX) * ptPerWorldMm;
  const toPdfY = (wy: number): number => viewCenterYPt + (wy - worldCenterY) * ptPerWorldMm;

  // 4. Clipping strict de la fenêtre de dessin
  content.save();
  content.clipRect(viewport.xMinPt, viewport.yMinPt, viewport.widthPt, viewport.heightPt);

  // ---------------------------------------------------------------------------
  // A. Tracé des dalles et trémies
  // ---------------------------------------------------------------------------
  for (const slab of slabs) {
    if (slab.boundary && slab.boundary.length >= 3) {
      const pts = slab.boundary.map((p: Vec2) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
      content.polyline(pts, {
        strokeColor: [0.35, 0.45, 0.4],
        lineWidth: 0.5,
        close: true,
      });
    }
    const allHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])];
    for (const hole of allHoles) {
      if (hole && hole.length >= 3) {
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
  const wallInputs: WallInput[] = [];
  for (const wall of walls) {
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
      // Repli nominal
    }
  }

  for (const wall of walls) {
    const wallType = wall.typeId ? state.wallTypes?.[wall.typeId] : undefined;
    const thickness = wallType?.thickness ?? 200;
    const footprint = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness,
      locationLine: 'center',
    });
    const vertices = resolvedPolygons.get(wall.id) ?? footprint.vertices;

    if (vertices.length >= 3) {
      const pts = vertices.map((p) => ({ x: toPdfX(p.x), y: toPdfY(p.y) }));
      // Poché gris clair + contour net
      content.polyline(pts, {
        fillColor: [0.88, 0.88, 0.9],
        strokeColor: [0.12, 0.15, 0.22],
        lineWidth: 1.1,
        close: true,
      });

      // Hachures 45°
      const spacingMm = options.hatchSpacing ?? 250;
      const hatches = generateHatchLines(vertices, { angleDeg: 45, spacing: spacingMm });
      for (const [p1, p2] of hatches) {
        content.line(toPdfX(p1.x), toPdfY(p1.y), toPdfX(p2.x), toPdfY(p2.y), {
          strokeColor: [0.65, 0.65, 0.7],
          lineWidth: 0.35,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // C. Ouvertures : Portes (battants & arcs 90°) & Fenêtres
  // ---------------------------------------------------------------------------
  const doors: Door[] = Object.values(state.doors ?? {}).filter((d) => {
    const h = state.walls?.[d.hostWallId];
    return h && (!h.levelId || h.levelId === levelId);
  });

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

    const dt = door.doorTypeId ? state.doorTypes?.[door.doorTypeId] : undefined;
    const doorWidth = dt?.width ?? 900;
    const wallType = host.typeId ? state.wallTypes?.[host.typeId] : undefined;
    const thick = wallType?.thickness ?? 200;

    const hingeX = host.start.x + ux * door.offsetAlong;
    const hingeY = host.start.y + uy * door.offsetAlong;
    const endX = host.start.x + ux * (door.offsetAlong + doorWidth);
    const endY = host.start.y + uy * (door.offsetAlong + doorWidth);

    // Jambages
    content.line(
      toPdfX(hingeX + nx * (thick / 2)),
      toPdfY(hingeY + ny * (thick / 2)),
      toPdfX(hingeX - nx * (thick / 2)),
      toPdfY(hingeY - ny * (thick / 2)),
      { strokeColor: [0.12, 0.15, 0.22], lineWidth: 0.7 },
    );
    content.line(
      toPdfX(endX + nx * (thick / 2)),
      toPdfY(endY + ny * (thick / 2)),
      toPdfX(endX - nx * (thick / 2)),
      toPdfY(endY - ny * (thick / 2)),
      { strokeColor: [0.12, 0.15, 0.22], lineWidth: 0.7 },
    );

    // Battant de porte ouvert à 90°
    const swingSide = door.swing?.direction === 'in' ? 1 : -1;
    const leafEndX = hingeX + nx * swingSide * doorWidth;
    const leafEndY = hingeY + ny * swingSide * doorWidth;
    content.line(toPdfX(hingeX), toPdfY(hingeY), toPdfX(leafEndX), toPdfY(leafEndY), {
      strokeColor: [0.2, 0.25, 0.35],
      lineWidth: 0.8,
    });

    // Arc de battement à 90°
    const rPt = doorWidth * ptPerWorldMm;
    const aWall = Math.atan2(uy, ux);
    const aLeaf = Math.atan2(ny * swingSide, nx * swingSide);
    content.arc(toPdfX(hingeX), toPdfY(hingeY), rPt, aWall, aLeaf, {
      strokeColor: [0.4, 0.45, 0.55],
      lineWidth: 0.45,
      lineDash: [2.5, 1.5],
    });
  }

  const windows: Window[] = Object.values(state.windows ?? {}).filter((w) => {
    const h = state.walls?.[w.hostWallId];
    return h && (!h.levelId || h.levelId === levelId);
  });

  for (const win of windows) {
    const host = state.walls[win.hostWallId];
    if (!host) continue;

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
    const wallType = host.typeId ? state.wallTypes?.[host.typeId] : undefined;
    const thick = wallType?.thickness ?? 200;

    const startX = host.start.x + ux * win.offsetAlong;
    const startY = host.start.y + uy * win.offsetAlong;
    const endX = host.start.x + ux * (win.offsetAlong + winWidth);
    const endY = host.start.y + uy * (win.offsetAlong + winWidth);

    const p1A = vec2(startX + nx * (thick / 2), startY + ny * (thick / 2));
    const p1B = vec2(startX - nx * (thick / 2), startY - ny * (thick / 2));
    const p2A = vec2(endX + nx * (thick / 2), endY + ny * (thick / 2));
    const p2B = vec2(endX - nx * (thick / 2), endY - ny * (thick / 2));

    // Cadre de baie
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

    // Ligne centrale de vitrage
    content.line(toPdfX(startX), toPdfY(startY), toPdfX(endX), toPdfY(endY), {
      strokeColor: [0.15, 0.45, 0.8],
      lineWidth: 0.9,
    });
  }

  // ---------------------------------------------------------------------------
  // D. Escaliers
  // ---------------------------------------------------------------------------
  const stairs: Stair[] = Object.values(state.stairs ?? {}).filter(
    (s) => s.bottomLevelId === levelId || s.topLevelId === levelId,
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

    content.polyline(
      [
        { x: toPdfX(c1.x), y: toPdfY(c1.y) },
        { x: toPdfX(c2.x), y: toPdfY(c2.y) },
        { x: toPdfX(c3.x), y: toPdfY(c3.y) },
        { x: toPdfX(c4.x), y: toPdfY(c4.y) },
      ],
      {
        fillColor: [0.97, 0.97, 0.97],
        strokeColor: [0.15, 0.15, 0.2],
        lineWidth: 0.8,
        close: true,
      },
    );

    // Contremarches
    const nSteps = Math.max(3, Math.round(len / 280));
    const stepDist = len / nSteps;
    for (let i = 1; i < nSteps; i++) {
      const mx = stair.start.x + ux * (i * stepDist);
      const my = stair.start.y + uy * (i * stepDist);
      const pA = vec2(mx - nx * halfW, my - ny * halfW);
      const pB = vec2(mx + nx * halfW, my + ny * halfW);
      content.line(toPdfX(pA.x), toPdfY(pA.y), toPdfX(pB.x), toPdfY(pB.y), {
        strokeColor: [0.35, 0.35, 0.4],
        lineWidth: 0.4,
      });
    }

    // Ligne de foulée avec flèche
    content.line(
      toPdfX(stair.start.x),
      toPdfY(stair.start.y),
      toPdfX(stair.end.x),
      toPdfY(stair.end.y),
      { strokeColor: [0.1, 0.1, 0.1], lineWidth: 0.6 },
    );
  }

  // ---------------------------------------------------------------------------
  // E. Réseaux MEP
  // ---------------------------------------------------------------------------
  const getMepColor = (systemId?: string): [number, number, number] => {
    const sys = systemId ? state.mepSystems?.[systemId] : undefined;
    const type = (sys?.systemType ?? '').toLowerCase();
    if (type.includes('cold') || type.includes('water')) return [0.1, 0.4, 0.85]; // Bleu
    if (type.includes('hot')) return [0.85, 0.15, 0.15]; // Rouge
    if (type.includes('drain') || type.includes('waste')) return [0.35, 0.55, 0.25]; // Vert
    if (type.includes('air') || type.includes('vent')) return [0.1, 0.65, 0.75]; // Cyan
    if (type.includes('power') || type.includes('cable')) return [0.9, 0.65, 0.1]; // Jaune
    return [0.1, 0.4, 0.85];
  };

  const pipes: Pipe[] = Object.values(state.pipes ?? {}).filter(
    (p) => !p.levelId || p.levelId === levelId,
  );
  for (const pipe of pipes) {
    const col = getMepColor(pipe.systemId);
    content.line(toPdfX(pipe.start.x), toPdfY(pipe.start.y), toPdfX(pipe.end.x), toPdfY(pipe.end.y), {
      strokeColor: col,
      lineWidth: 1.2,
    });
  }

  const ducts: Duct[] = Object.values(state.ducts ?? {}).filter(
    (d) => !d.levelId || d.levelId === levelId,
  );
  for (const duct of ducts) {
    content.line(toPdfX(duct.start.x), toPdfY(duct.start.y), toPdfX(duct.end.x), toPdfY(duct.end.y), {
      strokeColor: [0.1, 0.65, 0.75],
      lineWidth: 1.4,
    });
  }

  const cableTrays: CableTray[] = Object.values(state.cableTrays ?? {}).filter(
    (t) => !t.levelId || t.levelId === levelId,
  );
  for (const tray of cableTrays) {
    content.line(toPdfX(tray.start.x), toPdfY(tray.start.y), toPdfX(tray.end.x), toPdfY(tray.end.y), {
      strokeColor: [0.9, 0.65, 0.1],
      lineWidth: 1.1,
    });
  }

  // ---------------------------------------------------------------------------
  // F. Cotations (Dimensions)
  // ---------------------------------------------------------------------------
  const dims: Dimension[] = Object.values(state.dimensions ?? {}).filter(
    (d) => !d.levelId || d.levelId === levelId,
  );

  for (const dim of dims) {
    const pts = resolveDimensionPoints(
      dim as unknown as DimensionFor2D,
      (state.walls ?? {}) as unknown as Record<string, WallFor2D>,
    );
    if (!pts) continue;
    const { p1, p2 } = pts;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const nx = -dy / len;
    const ny = dx / len;
    const ox = nx * (dim.offset ?? 600);
    const oy = ny * (dim.offset ?? 600);

    const d1 = vec2(p1.x + ox, p1.y + oy);
    const d2 = vec2(p2.x + ox, p2.y + oy);

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

    // Texte de cote
    const valText =
      dim.customLabel ??
      (dim.value >= 1000 ? `${(dim.value / 1000).toFixed(2)} m` : `${Math.round(dim.value)} mm`);
    const midX = toPdfX((d1.x + d2.x) / 2) + nx * 5;
    const midY = toPdfY((d1.y + d2.y) / 2) + ny * 5;

    content.text(valText, midX, midY, {
      size: 6.5,
      align: 'center',
      color: [0.4, 0.1, 0.4],
    });
  }

  // ---------------------------------------------------------------------------
  // G. Symboles de coupe ISO
  // ---------------------------------------------------------------------------
  const cuts: SectionCut[] = Object.values(state.sectionCuts ?? {});
  for (const cut of cuts) {
    const dx = cut.end.x - cut.start.x;
    const dy = cut.end.y - cut.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    // Ligne mixte tiret-point
    content.line(
      toPdfX(cut.start.x),
      toPdfY(cut.start.y),
      toPdfX(cut.end.x),
      toPdfY(cut.end.y),
      {
        strokeColor: [0.7, 0.15, 0.5],
        lineWidth: 0.9,
        lineDash: [6, 2, 1, 2],
      },
    );

    // Pastilles d'extrémités
    const rPt = 4 * MM_TO_PT;
    content.circle(toPdfX(cut.start.x), toPdfY(cut.start.y), rPt, {
      fillColor: [1, 1, 1],
      strokeColor: [0.7, 0.15, 0.5],
      lineWidth: 0.8,
    });
    content.circle(toPdfX(cut.end.x), toPdfY(cut.end.y), rPt, {
      fillColor: [1, 1, 1],
      strokeColor: [0.7, 0.15, 0.5],
      lineWidth: 0.8,
    });

    content.text(cut.label, toPdfX(cut.start.x), toPdfY(cut.start.y) - 2.5, {
      font: 'bold',
      size: 7.5,
      align: 'center',
      color: [0.7, 0.15, 0.5],
    });
    content.text(`${cut.label}'`, toPdfX(cut.end.x), toPdfY(cut.end.y) - 2.5, {
      font: 'bold',
      size: 7.5,
      align: 'center',
      color: [0.7, 0.15, 0.5],
    });
  }

  // ---------------------------------------------------------------------------
  // H. Pièces (Rooms) — Libellés sur cartouche de fond blanc opaque
  // ---------------------------------------------------------------------------
  const rooms: Room[] = Object.values(state.rooms ?? {}).filter(
    (r) => !r.levelId || r.levelId === levelId,
  );

  for (const room of rooms) {
    const rxPt = toPdfX(room.seed.x);
    const ryPt = toPdfY(room.seed.y);

    const roomName = room.name ?? 'Pièce';
    const areaM2 = room.area ? room.area.toFixed(2) : undefined;
    const badgeW = 48;
    const badgeH = areaM2 ? 22 : 14;

    // Cartouche blanc de protection
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

  // 5. Cadre de planche & Cartouche architectural
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
