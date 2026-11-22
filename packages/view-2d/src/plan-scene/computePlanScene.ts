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
import type {
  DocumentFor2D,
  StateFor2D,
  WallFor2D,
  DoorFor2D,
  WindowFor2D,
  SlabFor2D,
  StairFor2D,
  RoofFor2D,
  ComponentFor2D,
  PipeFor2D,
  DuctFor2D,
  CableTrayFor2D,
  SectionCutFor2D,
  DimensionFor2D,
  DetectedRoomFor2D,
} from '../types.js';
import type {
  ComputePlanSceneOptions,
  PlanBounds,
  PlanResolvedCableTray,
  PlanResolvedComponent,
  PlanResolvedDimension,
  PlanResolvedDuct,
  PlanResolvedMep,
  PlanResolvedOpening,
  PlanResolvedPipe,
  PlanResolvedRoof,
  PlanResolvedRoom,
  PlanResolvedSectionCut,
  PlanResolvedSlab,
  PlanResolvedStair,
  PlanResolvedWall,
  PlanScene,
} from './types.js';

type StateRoom = NonNullable<StateFor2D['rooms']>[string];

/**
 * Calcule la scène vectorielle 2D neutre (PlanScene) pour un étage donné.
 *
 * Résout une fois pour toutes :
 * - Le niveau architectural actif et son libellé
 * - L'emprise spatiale globale (AABB / Bounds)
 * - Les murs avec leurs jonctions (miters) et hachures 45°
 * - Les baies hébergées (portes avec battements 90°, fenêtres avec vitrages et feuillures)
 * - Les dalles avec leurs réservations/trémies
 * - Les escaliers avec contremarches, ligne de foulée et flèches de montée
 * - Les toitures et composants d'équipement
 * - Les pièces avec surfacique et étiquettes
 * - Les chaînes de cotations avec lignes de rappel et ticks à 45°
 * - Les coupes ISO 128-50 et réseaux techniques MEP
 */
export function computePlanScene(
  docOrState: DocumentFor2D | StateFor2D,
  options: ComputePlanSceneOptions = {},
): PlanScene {
  const state: StateFor2D =
    'getState' in docOrState && typeof docOrState.getState === 'function'
      ? docOrState.getState()
      : (docOrState as StateFor2D);

  // 1. Détermination du niveau architectural
  let levelFilter = options.levelId;
  if (levelFilter === undefined) {
    const levelIds = state.levels ? Object.keys(state.levels) : [];
    if (levelIds.length > 0) {
      levelFilter = levelIds[0];
    }
  }

  const levelName =
    (levelFilter && state.levels?.[levelFilter]?.name) ||
    (levelFilter ? `Niveau ${levelFilter}` : 'Plan d’Ensemble');

  // Boîte englobante
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  function updateBounds(x: number, y: number): void {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function updatePolyBounds(pts: readonly Vec2[]): void {
    for (const pt of pts) {
      updateBounds(pt.x, pt.y);
    }
  }

  // 2. Murs et Jonctions résolues
  const allWalls: WallFor2D[] = Object.values(state.walls ?? {}).filter(
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
      // Repli nominal
    }
  }

  // Dictionnaire des portes et fenêtres par mur hôte
  const allDoors: DoorFor2D[] = Object.values(state.doors ?? {});
  const allWindows: WindowFor2D[] = Object.values(state.windows ?? {});

  const doorsByWall = new Map<string, DoorFor2D[]>();
  for (const door of allDoors) {
    const list = doorsByWall.get(door.hostWallId) ?? [];
    list.push(door);
    doorsByWall.set(door.hostWallId, list);
  }

  const windowsByWall = new Map<string, WindowFor2D[]>();
  for (const win of allWindows) {
    const list = windowsByWall.get(win.hostWallId) ?? [];
    list.push(win);
    windowsByWall.set(win.hostWallId, list);
  }

  const resolvedWalls: PlanResolvedWall[] = [];

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
    updatePolyBounds(vertices);

    // Hachures 45°
    let hatchLines: readonly (readonly [Vec2, Vec2])[] = [];
    if (options.includeHatches !== false && vertices.length >= 3) {
      const spacing = options.hatchSpacing ?? 250;
      hatchLines = generateHatchLines(vertices, { angleDeg: 45, spacing });
    }

    // Résolution des ouvertures sur ce mur
    const resolvedOpenings: PlanResolvedOpening[] = [];
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);

    if (len > 1e-4) {
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;

      // Portes
      const doors = doorsByWall.get(wall.id) ?? [];
      for (const door of doors) {
        const dt = door.doorTypeId ? state.doorTypes?.[door.doorTypeId] : undefined;
        const doorWidth = dt?.width ?? door.width ?? 900;
        const hingeX = wall.start.x + ux * door.offsetAlong;
        const hingeY = wall.start.y + uy * door.offsetAlong;
        const endX = wall.start.x + ux * (door.offsetAlong + doorWidth);
        const endY = wall.start.y + uy * (door.offsetAlong + doorWidth);

        const j1A = vec2(hingeX + nx * (thickness / 2), hingeY + ny * (thickness / 2));
        const j1B = vec2(hingeX - nx * (thickness / 2), hingeY - ny * (thickness / 2));
        const j2A = vec2(endX + nx * (thickness / 2), endY + ny * (thickness / 2));
        const j2B = vec2(endX - nx * (thickness / 2), endY - ny * (thickness / 2));

        const swingSide = door.swing?.direction === 'in' ? 1 : -1;
        const leafEnd = vec2(
          hingeX + nx * swingSide * doorWidth,
          hingeY + ny * swingSide * doorWidth,
        );

        const aWall = ((Math.atan2(uy, ux) * 180) / Math.PI + 360) % 360;
        const aLeaf =
          ((Math.atan2(ny * swingSide, nx * swingSide) * 180) / Math.PI + 360) % 360;
        const diffCCW = (aLeaf - aWall + 360) % 360;

        let startAngleDeg = aLeaf;
        let endAngleDeg = aWall;
        if (Math.abs(diffCCW - 90) < 1e-2) {
          startAngleDeg = aWall;
          endAngleDeg = aLeaf;
        }

        updateBounds(hingeX, hingeY);
        updateBounds(endX, endY);
        updateBounds(leafEnd.x, leafEnd.y);

        resolvedOpenings.push({
          id: door.id,
          kind: 'door',
          wallId: wall.id,
          jamb1: [j1A, j1B],
          jamb2: [j2A, j2B],
          leafLine: [vec2(hingeX, hingeY), leafEnd],
          arc: {
            center: vec2(hingeX, hingeY),
            radius: doorWidth,
            startAngleDeg,
            endAngleDeg,
          },
        });
      }

      // Fenêtres
      const windows = windowsByWall.get(wall.id) ?? [];
      for (const win of windows) {
        const wt = win.windowTypeId ? state.windowTypes?.[win.windowTypeId] : undefined;
        const winWidth = wt?.width ?? win.width ?? 1200;
        const startX = wall.start.x + ux * win.offsetAlong;
        const startY = wall.start.y + uy * win.offsetAlong;
        const endX = wall.start.x + ux * (win.offsetAlong + winWidth);
        const endY = wall.start.y + uy * (win.offsetAlong + winWidth);

        const p1A = vec2(startX + nx * (thickness / 2), startY + ny * (thickness / 2));
        const p1B = vec2(startX - nx * (thickness / 2), startY - ny * (thickness / 2));
        const p2A = vec2(endX + nx * (thickness / 2), endY + ny * (thickness / 2));
        const p2B = vec2(endX - nx * (thickness / 2), endY - ny * (thickness / 2));

        updateBounds(startX, startY);
        updateBounds(endX, endY);

        resolvedOpenings.push({
          id: win.id,
          kind: 'window',
          wallId: wall.id,
          jamb1: [p1A, p1B],
          jamb2: [p2A, p2B],
          frameLines: [
            [p1A, p1B],
            [p2A, p2B],
            [p1A, p2A],
            [p1B, p2B],
          ],
          glassLine: [vec2(startX, startY), vec2(endX, endY)],
        });
      }
    }

    resolvedWalls.push({
      id: wall.id,
      levelId: wall.levelId ?? '',
      thickness,
      axis: { start: wall.start, end: wall.end },
      footprint: vertices,
      hatchLines,
      openings: resolvedOpenings,
    });
  }

  // 3. Dalles et Trémies
  const allSlabs: SlabFor2D[] = Object.values(state.slabs ?? {}).filter(
    (s) => !levelFilter || !s.levelId || s.levelId === levelFilter,
  );
  const resolvedSlabs: PlanResolvedSlab[] = [];

  for (const slab of allSlabs) {
    if (slab.boundary && slab.boundary.length >= 3) {
      updatePolyBounds(slab.boundary);
      const holes: Vec2[][] = [];
      const allHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])];
      for (const h of allHoles) {
        if (h && h.length >= 3) {
          holes.push(h as Vec2[]);
          updatePolyBounds(h);
        }
      }
      resolvedSlabs.push({
        id: slab.id,
        levelId: slab.levelId,
        boundary: slab.boundary,
        holes,
      });
    }
  }

  // 4. Toitures
  const allRoofs: RoofFor2D[] = Object.values(state.roofs ?? {}).filter(
    (r) => !levelFilter || !r.levelId || r.levelId === levelFilter,
  );
  const resolvedRoofs: PlanResolvedRoof[] = [];

  for (const roof of allRoofs) {
    if (roof.footprint && roof.footprint.length >= 3) {
      updatePolyBounds(roof.footprint);
      resolvedRoofs.push({
        id: roof.id,
        levelId: roof.levelId,
        boundary: roof.footprint,
      });
    }
  }

  // 5. Escaliers
  const allStairs: StairFor2D[] = Object.values(state.stairs ?? {}).filter(
    (s) =>
      !levelFilter ||
      s.bottomLevelId === levelFilter ||
      s.topLevelId === levelFilter,
  );
  const resolvedStairs: PlanResolvedStair[] = [];

  for (const stair of allStairs) {
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
    const boundary = [c1, c2, c3, c4];
    updatePolyBounds(boundary);

    // Contremarches
    const nSteps = Math.max(3, Math.round(len / 280));
    const stepDist = len / nSteps;
    const treads: (readonly [Vec2, Vec2])[] = [];
    for (let i = 1; i < nSteps; i++) {
      const mx = stair.start.x + ux * (i * stepDist);
      const my = stair.start.y + uy * (i * stepDist);
      treads.push([
        vec2(mx - nx * halfW, my - ny * halfW),
        vec2(mx + nx * halfW, my + ny * halfW),
      ]);
    }

    // Ligne de foulée et flèche de montée
    const midStart = vec2(stair.start.x, stair.start.y);
    const midEnd = vec2(stair.end.x, stair.end.y);
    const arrowLen = 200;
    const arrowW = 100;
    const arrowLeft = vec2(
      midEnd.x - ux * arrowLen + nx * arrowW,
      midEnd.y - uy * arrowLen + ny * arrowW,
    );
    const arrowRight = vec2(
      midEnd.x - ux * arrowLen - nx * arrowW,
      midEnd.y - uy * arrowLen - ny * arrowW,
    );

    resolvedStairs.push({
      id: stair.id,
      bottomLevelId: stair.bottomLevelId,
      topLevelId: stair.topLevelId,
      boundary,
      treads,
      walkLine: [midStart, midEnd],
      arrowLines: [
        [midEnd, arrowLeft],
        [midEnd, arrowRight],
      ],
    });
  }

  // 6. Composants / Mobilier
  const allComponents: ComponentFor2D[] = Object.values(state.components ?? {}).filter(
    (c) => !levelFilter || !c.levelId || c.levelId === levelFilter,
  );
  const resolvedComponents: PlanResolvedComponent[] = [];

  for (const comp of allComponents) {
    const compType = comp.typeId ? state.componentTypes?.[comp.typeId] : undefined;
    const width = comp.widthOverride ?? compType?.width ?? 600;
    const depth = comp.depthOverride ?? compType?.depth ?? 600;
    const halfW = width / 2;
    const halfD = depth / 2;

    const rad = ((comp.placement?.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = comp.placement?.x ?? 0;
    const cy = comp.placement?.y ?? 0;

    const corners: Vec2[] = [
      vec2(cx + (-halfW) * cos - (-halfD) * sin, cy + (-halfW) * sin + (-halfD) * cos),
      vec2(cx + halfW * cos - (-halfD) * sin, cy + halfW * sin + (-halfD) * cos),
      vec2(cx + halfW * cos - halfD * sin, cy + halfW * sin + halfD * cos),
      vec2(cx + (-halfW) * cos - halfD * sin, cy + (-halfW) * sin + halfD * cos),
    ];
    updatePolyBounds(corners);

    resolvedComponents.push({
      id: comp.id,
      name: compType?.name ?? 'Mobilier',
      levelId: comp.levelId,
      corners,
    });
  }

  // 7. Pièces (Rooms)
  const resolvedRooms: PlanResolvedRoom[] = [];
  const roomsSource: readonly (DetectedRoomFor2D | StateRoom)[] =
    options.rooms && options.rooms.length > 0
      ? options.rooms
      : Object.values(state.rooms ?? {}).filter(
          (r) => !levelFilter || !r.levelId || r.levelId === levelFilter,
        );

  for (const room of roomsSource) {
    const polygon: readonly Vec2[] = 'polygon' in room && Array.isArray(room.polygon)
      ? room.polygon
      : [];
    if (polygon.length >= 3) {
      updatePolyBounds(polygon);
    }
    const areaMm2 = 'areaMm2' in room && typeof room.areaMm2 === 'number'
      ? room.areaMm2
      : 0;
    const areaM2 = areaMm2 > 0 ? areaMm2 / 1e6 : 0;
    const labelPos = room.seed ?? (polygon[0] ? polygon[0] : vec2(0, 0));
    updateBounds(labelPos.x, labelPos.y);

    const roomLevelId = 'levelId' in room && typeof room.levelId === 'string'
      ? room.levelId
      : levelFilter ?? '';

    resolvedRooms.push({
      id: room.id ?? `room_${resolvedRooms.length + 1}`,
      name: room.name ?? 'Pièce',
      levelId: roomLevelId,
      areaMm2,
      areaM2,
      labelPosition: labelPos,
      polygon,
    });
  }

  // 8. Cotations
  const wallsMap: Record<string, WallFor2D> = {};
  for (const w of Object.values(state.walls ?? {})) {
    wallsMap[w.id] = w;
  }

  const dimensionsSource: readonly DimensionFor2D[] =
    options.dimensions && options.dimensions.length > 0
      ? options.dimensions
      : Object.values(state.dimensions ?? {}).filter(
          (d) => !levelFilter || !d.levelId || d.levelId === levelFilter,
        );

  const resolvedDimensions: PlanResolvedDimension[] = [];

  for (const dim of dimensionsSource) {
    const pts = resolveDimensionPoints(dim, wallsMap);
    if (!pts) continue;

    const dx = pts.p2.x - pts.p1.x;
    const dy = pts.p2.y - pts.p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const offsetDist = dim.offset ?? 500;
    const dim1X = pts.p1.x + nx * offsetDist;
    const dim1Y = pts.p1.y + ny * offsetDist;
    const dim2X = pts.p2.x + nx * offsetDist;
    const dim2Y = pts.p2.y + ny * offsetDist;

    // Lignes de rappel
    const extOvershoot = 150;
    const witness1: [Vec2, Vec2] = [
      vec2(pts.p1.x, pts.p1.y),
      vec2(dim1X + nx * (offsetDist >= 0 ? extOvershoot : -extOvershoot), dim1Y + ny * (offsetDist >= 0 ? extOvershoot : -extOvershoot)),
    ];
    const witness2: [Vec2, Vec2] = [
      vec2(pts.p2.x, pts.p2.y),
      vec2(dim2X + nx * (offsetDist >= 0 ? extOvershoot : -extOvershoot), dim2Y + ny * (offsetDist >= 0 ? extOvershoot : -extOvershoot)),
    ];

    // Ligne de cote
    const line: [Vec2, Vec2] = [vec2(dim1X, dim1Y), vec2(dim2X, dim2Y)];

    // Ticks à 45°
    const tickLen = 150;
    const tickUx = (ux + nx) / Math.SQRT2;
    const tickUy = (uy + ny) / Math.SQRT2;
    const t1A = vec2(dim1X - tickUx * (tickLen / 2), dim1Y - tickUy * (tickLen / 2));
    const t1B = vec2(dim1X + tickUx * (tickLen / 2), dim1Y + tickUy * (tickLen / 2));
    const t2A = vec2(dim2X - tickUx * (tickLen / 2), dim2Y - tickUy * (tickLen / 2));
    const t2B = vec2(dim2X + tickUx * (tickLen / 2), dim2Y + tickUy * (tickLen / 2));

    // Texte
    const textDist = 120;
    const midX = (dim1X + dim2X) / 2 + nx * (offsetDist >= 0 ? textDist : -textDist);
    const midY = (dim1Y + dim2Y) / 2 + ny * (offsetDist >= 0 ? textDist : -textDist);
    let angleDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (angleDeg > 90 || angleDeg < -90) {
      angleDeg = (angleDeg + 180) % 360;
    }

    const valMm = Math.round(dim.value ?? len);
    const text = dim.customLabel ?? `${valMm}`;

    updateBounds(dim1X, dim1Y);
    updateBounds(dim2X, dim2Y);

    resolvedDimensions.push({
      id: dim.id,
      levelId: dim.levelId ?? '',
      value: valMm,
      text,
      line,
      witness1,
      witness2,
      ticks: [
        [t1A, t1B],
        [t2A, t2B],
      ],
      textPos: vec2(midX, midY),
      angleDeg,
    });
  }

  // 9. Lignes de Coupe ISO
  const allSections: SectionCutFor2D[] = Object.values(state.sectionCuts ?? {});
  const resolvedSections: PlanResolvedSectionCut[] = [];

  for (const sc of allSections) {
    const dx = sc.end.x - sc.start.x;
    const dy = sc.end.y - sc.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const ux = dx / len;
    const uy = dy / len;
    const dir = sc.viewDirection ?? 1;
    const nx = -uy * dir;
    const ny = ux * dir;

    const overshoot = 500;
    const extStart = vec2(sc.start.x - ux * overshoot, sc.start.y - uy * overshoot);
    const extEnd = vec2(sc.end.x + ux * overshoot, sc.end.y + uy * overshoot);

    const arrowLen = 400;
    const arrowStartTip = vec2(extStart.x + nx * arrowLen, extStart.y + ny * arrowLen);
    const arrowEndTip = vec2(extEnd.x + nx * arrowLen, extEnd.y + ny * arrowLen);

    updateBounds(extStart.x, extStart.y);
    updateBounds(extEnd.x, extEnd.y);

    resolvedSections.push({
      id: sc.id,
      name: sc.name ?? 'Coupe',
      line: [sc.start, sc.end],
      extLine: [extStart, extEnd],
      arrows: [
        {
          p1: extStart,
          p2: arrowStartTip,
          textPos: vec2(extStart.x - ux * 200, extStart.y - uy * 200),
          text: sc.name ?? 'A',
        },
        {
          p1: extEnd,
          p2: arrowEndTip,
          textPos: vec2(extEnd.x + ux * 200, extEnd.y + uy * 200),
          text: sc.name ?? 'A',
        },
      ],
    });
  }

  // 10. Réseaux MEP
  const pipes: PlanResolvedPipe[] = [];
  for (const pipe of Object.values(state.pipes ?? {}) as PipeFor2D[]) {
    if (pipe.start && pipe.end) {
      updateBounds(pipe.start.x, pipe.start.y);
      updateBounds(pipe.end.x, pipe.end.y);
      pipes.push({
        id: pipe.id,
        system: pipe.systemId ?? 'supply',
        start: vec2(pipe.start.x, pipe.start.y),
        end: vec2(pipe.end.x, pipe.end.y),
        diameter: pipe.diameter ?? 50,
      });
    }
  }

  const ducts: PlanResolvedDuct[] = [];
  for (const duct of Object.values(state.ducts ?? {}) as DuctFor2D[]) {
    if (duct.start && duct.end) {
      updateBounds(duct.start.x, duct.start.y);
      updateBounds(duct.end.x, duct.end.y);
      ducts.push({
        id: duct.id,
        system: duct.systemId ?? 'ventilation',
        start: vec2(duct.start.x, duct.start.y),
        end: vec2(duct.end.x, duct.end.y),
        width: duct.width ?? 300,
        height: duct.height ?? 200,
      });
    }
  }

  const cableTrays: PlanResolvedCableTray[] = [];
  for (const tray of Object.values(state.cableTrays ?? {}) as CableTrayFor2D[]) {
    if (tray.start && tray.end) {
      updateBounds(tray.start.x, tray.start.y);
      updateBounds(tray.end.x, tray.end.y);
      cableTrays.push({
        id: tray.id,
        start: vec2(tray.start.x, tray.start.y),
        end: vec2(tray.end.x, tray.end.y),
        width: tray.width ?? 200,
        height: tray.height ?? 50,
      });
    }
  }

  const mep: PlanResolvedMep = {
    pipes,
    ducts,
    cableTrays,
  };

  // Bounds normalisés
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    minX = 0;
    maxX = 10000;
    minY = 0;
    maxY = 10000;
  }

  const bounds: PlanBounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };

  return {
    levelId: levelFilter ?? '',
    levelName,
    bounds,
    walls: resolvedWalls,
    slabs: resolvedSlabs,
    roofs: resolvedRoofs,
    stairs: resolvedStairs,
    components: resolvedComponents,
    rooms: resolvedRooms,
    dimensions: resolvedDimensions,
    sectionCuts: resolvedSections,
    mep,
  };
}
