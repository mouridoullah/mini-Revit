import { useEffect, useRef } from 'react';
import {
  Scene3D,
  createWallMeshWithOpenings,
  createOpeningPlaceholder,
  createDoorPlaceholderMaterial,
  createWindowPlaceholderMaterial,
  createSlabMesh,
  createStairMesh,
  createRoofMesh,
  createComponentMesh,
  solveWallJunctions,
  type WallInput,
  type OpeningGeometryParams,
} from '@mini-bim/view-3d';
import { computeStairShaft, resolveWallGeometry } from '@mini-bim/core';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';

export interface Viewport3DProps {
  readonly selection?: readonly string[];
  readonly onSelectionChanged?: (ids: readonly string[]) => void;
}

/**
 * Wrapper React du visualiseur 3D orbital Three.js impératif.
 * Règle d'or 3 : Instanciation unique dans useEffect, jamais recréé à chaque render.
 * Règle d'or 2 : Aucun import direct de @mini-bim/geometry (passe par view-3d).
 */
export function Viewport3D({ selection, onSelectionChanged }: Viewport3DProps = {}) {
  const { state, lastChangedIds } = useBimDocument();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const renderedElementIdsRef = useRef<Set<string>>(new Set());
  const doorMaterialRef = useRef<ReturnType<typeof createDoorPlaceholderMaterial> | null>(null);
  const windowMaterialRef = useRef<ReturnType<typeof createWindowPlaceholderMaterial> | null>(null);
  const selectionRef = useRef<readonly string[] | undefined>(selection);

  // Instanciation impérative unique
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new Scene3D(canvas, {
      width,
      height,
      background: 0xf4f3ef, // Beige architectural
      gridSize: 20000,
    });
    sceneRef.current = scene;

    doorMaterialRef.current = createDoorPlaceholderMaterial();
    windowMaterialRef.current = createWindowPlaceholderMaterial();

    return () => {
      scene.dispose();
      sceneRef.current = null;
      renderedElementIdsRef.current.clear();
      doorMaterialRef.current?.dispose();
      windowMaterialRef.current?.dispose();
    };
  }, []); // Monté une seule fois

  // Synchronisation des maillages 3D (murs percés et placeholders d'ouvertures) lors des mutations de state
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const doors = state.doors ?? {};
    const windows = state.windows ?? {};
    const slabs = state.slabs ?? {};
    const stairs = state.stairs ?? {};
    const roofs = state.roofs ?? {};
    const components = state.components ?? {};

    const currentElementIds = new Set([
      ...Object.keys(state.walls),
      ...Object.keys(doors),
      ...Object.keys(windows),
      ...Object.keys(slabs),
      ...Object.keys(stairs),
      ...Object.keys(roofs),
      ...Object.keys(components),
    ]);

    // 1. Suppression des maillages d'éléments supprimés (murs ou ouvertures en cascade)
    for (const id of renderedElementIdsRef.current) {
      if (!currentElementIds.has(id)) {
        scene.removeMesh(id);
      }
    }

    // Calcul différentiel du dirty set incrémental (ADR-019 / Audit P1.6)
    const isIncremental = lastChangedIds !== undefined && renderedElementIdsRef.current.size > 0;
    const dirtyElementIds = new Set<string>();

    if (isIncremental) {
      for (const id of lastChangedIds) {
        dirtyElementIds.add(id);
        const wall = state.walls[id];
        if (wall) {
          // Voisins topologiques du mur modifié sur le même niveau
          for (const otherWall of Object.values(state.walls)) {
            if (otherWall.levelId === wall.levelId && otherWall.id !== wall.id) {
              if (
                Math.hypot(otherWall.start.x - wall.start.x, otherWall.start.y - wall.start.y) < 50 ||
                Math.hypot(otherWall.start.x - wall.end.x, otherWall.start.y - wall.end.y) < 50 ||
                Math.hypot(otherWall.end.x - wall.start.x, otherWall.end.y - wall.end.y) < 50 ||
                Math.hypot(otherWall.end.x - wall.end.x, otherWall.end.y - wall.end.y) < 50
              ) {
                dirtyElementIds.add(otherWall.id);
              }
            }
          }
        }
        const door = doors[id];
        if (door) dirtyElementIds.add(door.hostWallId);
        const win = windows[id];
        if (win) dirtyElementIds.add(win.hostWallId);
        const comp = components[id];
        if (comp?.placement?.hostWallId) dirtyElementIds.add(comp.placement.hostWallId);

        // Si un niveau a été modifié, tous ses éléments sont sales
        if (state.levels[id]) {
          for (const w of Object.values(state.walls)) if (w.levelId === id) dirtyElementIds.add(w.id);
          for (const s of Object.values(slabs)) if (s.levelId === id) dirtyElementIds.add(s.id);
          for (const st of Object.values(stairs)) if (st.bottomLevelId === id || st.topLevelId === id) dirtyElementIds.add(st.id);
          for (const r of Object.values(roofs)) if (r.levelId === id) dirtyElementIds.add(r.id);
          for (const c of Object.values(components)) if (c.levelId === id) dirtyElementIds.add(c.id);
        }
        // Si un type est modifié, toutes ses instances sont sales
        if (state.wallTypes[id]) {
          for (const w of Object.values(state.walls)) if (w.typeId === id) dirtyElementIds.add(w.id);
        }
        if (state.slabTypes?.[id]) {
          for (const s of Object.values(slabs)) if (s.slabTypeId === id) dirtyElementIds.add(s.id);
        }
        if (state.doorTypes?.[id]) {
          for (const d of Object.values(doors)) if (d.doorTypeId === id) dirtyElementIds.add(d.id);
        }
        if (state.windowTypes?.[id]) {
          for (const w of Object.values(windows)) if (w.windowTypeId === id) dirtyElementIds.add(w.id);
        }
        if (state.stairTypes?.[id]) {
          for (const st of Object.values(stairs)) if (st.stairTypeId === id) dirtyElementIds.add(st.id);
        }
        if (state.roofTypes?.[id]) {
          for (const r of Object.values(roofs)) if (r.roofTypeId === id) dirtyElementIds.add(r.id);
        }
        if (state.componentTypes?.[id]) {
          for (const c of Object.values(components)) if (c.typeId === id) dirtyElementIds.add(c.id);
        }
      }
    }

    // 2. Résolution des jonctions de murs par niveau (L, T, X) pour maillage net sans superposition
    const wallsByLevel = new Map<string, (typeof state.walls)[string][]>();
    for (const wall of Object.values(state.walls)) {
      const list = wallsByLevel.get(wall.levelId) ?? [];
      list.push(wall);
      wallsByLevel.set(wall.levelId, list);
    }

    const resolvedPolygonsByWallId = new Map<string, readonly { readonly x: number; readonly y: number }[]>();
    for (const [, levelWalls] of wallsByLevel) {
      if (isIncremental && !levelWalls.some((w) => dirtyElementIds.has(w.id))) {
        continue;
      }
      const wallInputs: WallInput[] = [];
      for (const w of levelWalls) {
        const wt = state.wallTypes[w.typeId];
        if (!wt) continue;
        const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        if (len > 0.001 && wt.thickness > 0) {
          wallInputs.push({
            id: w.id,
            start: w.start,
            end: w.end,
            thickness: wt.thickness,
            locationLine: 'center',
          });
        }
      }
      if (wallInputs.length > 0) {
        try {
          const solution = solveWallJunctions(wallInputs);
          for (const rw of solution.walls) {
            resolvedPolygonsByWallId.set(rw.id, rw.polygon);
          }
        } catch {
          // Fallback gracieux sur l'emprise nominale
        }
      }
    }

    // 2b. Mise à jour ou ajout des murs percés de leurs ouvertures
    for (const wall of Object.values(state.walls)) {
      if (isIncremental && !dirtyElementIds.has(wall.id)) continue;
      const wallType = state.wallTypes[wall.typeId];
      if (!wallType) continue;

      const resolved = resolveWallGeometry(wall, state);

      const openingParams: OpeningGeometryParams[] = resolved.openings.map((op) => ({
        id: op.id,
        kind: op.kind,
        offsetAlong: op.offsetAlong,
        width: op.width,
        height: op.height,
        sillHeight: op.sillHeight,
      }));

      // Générer les tronçons solides découpés (murs percés 2.5D avec jonctions résolues)
      const resolvedPoly = resolvedPolygonsByWallId.get(wall.id);
      const pieces = createWallMeshWithOpenings({
        wall,
        wallType,
        openings: openingParams,
        elevation: resolved.zBase,
        height: resolved.height,
        topProfile: resolved.topProfile,
        ...(resolvedPoly ? { polygon: resolvedPoly } : {}),
      });

      // Remplacement atomique de l'ensemble des tronçons solides du mur (ancien maillage libéré)
      scene.updateMeshBatch(wall.id, pieces);
    }

    // 3. Placeholders 3D des portes (boîte bois)
    const doorMat = doorMaterialRef.current ?? undefined;
    for (const door of Object.values(doors)) {
      if (isIncremental && !dirtyElementIds.has(door.id) && !dirtyElementIds.has(door.hostWallId)) continue;
      const hostWall = state.walls[door.hostWallId];
      if (!hostWall) continue;
      const resolvedHost = resolveWallGeometry(hostWall, state);
      const resolvedDoor = resolvedHost.openings.find((o) => o.id === door.id);
      if (!resolvedDoor) continue;

      const placeholder = createOpeningPlaceholder(
        {
          id: door.id,
          kind: 'door',
          offsetAlong: resolvedDoor.offsetAlong,
          width: resolvedDoor.width,
          height: resolvedDoor.height,
          sillHeight: resolvedDoor.sillHeight,
        },
        hostWall,
        resolvedHost.zBase,
      );
      const m = scene.updateMesh(placeholder, doorMat, { ownsMaterial: false, isSharedMaterial: true });
      m.userData.ownsMaterial = false;
      m.userData.isSharedMaterial = true;
    }

    // 4. Placeholders 3D des fenêtres (boîte vitrée translucide)
    const winMat = windowMaterialRef.current ?? undefined;
    for (const win of Object.values(windows)) {
      if (isIncremental && !dirtyElementIds.has(win.id) && !dirtyElementIds.has(win.hostWallId)) continue;
      const hostWall = state.walls[win.hostWallId];
      if (!hostWall) continue;
      const resolvedHost = resolveWallGeometry(hostWall, state);
      const resolvedWin = resolvedHost.openings.find((o) => o.id === win.id);
      if (!resolvedWin) continue;

      const placeholder = createOpeningPlaceholder(
        {
          id: win.id,
          kind: 'window',
          offsetAlong: resolvedWin.offsetAlong,
          width: resolvedWin.width,
          height: resolvedWin.height,
          sillHeight: resolvedWin.sillHeight,
        },
        hostWall,
        resolvedHost.zBase,
      );
      const m = scene.updateMesh(placeholder, winMat, { ownsMaterial: false, isSharedMaterial: true });
      m.userData.ownsMaterial = false;
      m.userData.isSharedMaterial = true;
    }

    // 5. Placeholders et maillages 3D des dalles structurelles (avec trémies)
    for (const slab of Object.values(slabs)) {
      if (isIncremental && !dirtyElementIds.has(slab.id)) continue;
      const slabType = state.slabTypes?.[slab.slabTypeId];
      if (!slabType) continue;

      const level = state.levels[slab.levelId];
      const elevation = level?.elevation ?? 0;

      // Dériver dynamiquement les trémies d'escaliers arrivant sur ce niveau (ADR-048 D5 & S2-5)
      const stairShafts: { x: number; y: number }[][] = [];
      for (const st of Object.values(stairs)) {
        if (st.topLevelId === slab.levelId) {
          const shaft = computeStairShaft(st, state, {
            useHeadroomCutoff: true,
            slabThickness: slabType.thickness,
          });
          stairShafts.push([...shaft]);
        }
      }

      const slabMesh = createSlabMesh(
        {
          id: slab.id,
          boundary: slab.boundary,
          holes: slab.holes,
          openings: [...(slab.openings ?? []), ...stairShafts],
          baseOffset: slab.baseOffset,
        },
        slabType,
        elevation,
      );

      if (slabMesh) {
        scene.updateSlabMesh(slab.id, slabMesh);
      }
    }

    // 6. Maillages 3D des escaliers paramétriques (maillage crénelé ADR-048 D4)
    for (const stair of Object.values(stairs)) {
      if (isIncremental && !dirtyElementIds.has(stair.id)) continue;
      const stairType = state.stairTypes?.[stair.stairTypeId];
      const bottomLevel = state.levels[stair.bottomLevelId];
      const topLevel = state.levels[stair.topLevelId];
      const bottomElevation = bottomLevel?.elevation ?? 0;
      const topElevation = topLevel?.elevation ?? bottomElevation + 2800;

      const stairMesh = createStairMesh(
        {
          id: stair.id,
          start: stair.start,
          end: stair.end,
          widthOverride: stair.widthOverride,
          bottomElevation,
          topElevation,
        },
        stairType ? { width: stairType.width } : undefined,
      );

      if (stairMesh) {
        scene.updateStairMesh(stair.id, stairMesh);
      }
    }

    // 7. Maillages 3D des toitures (plates et 2 pans, ADR-053)
    for (const roof of Object.values(roofs)) {
      if (isIncremental && !dirtyElementIds.has(roof.id)) continue;
      const roofType = state.roofTypes?.[roof.roofTypeId];
      if (!roofType) continue;

      const level = state.levels[roof.levelId];
      const elevation = level?.elevation ?? 0;

      const roofOpenings = Object.values(state.roofOpenings ?? {}).filter(
        (op) => op.roofId === roof.id,
      );

      const roofMesh = createRoofMesh(
        {
          id: roof.id,
          footprint: roof.footprint,
          ridgeAxis: roof.ridgeAxis,
          slopeOverrideDeg: roof.slopeOverrideDeg,
          overhangOverride: roof.overhangOverrideMm,
          baseOffset: roof.baseOffset,
          elevation,
          openings: roofOpenings.map((op) => ({
            offsetU: op.offsetU,
            offsetV: op.offsetV,
            width: op.width,
            height: op.height,
          })),
        },
        roofType,
      );

      if (roofMesh) {
        scene.updateRoofMesh(roof.id, roofMesh);
      }
    }

    // 8. Maillages 3D des composants architecturaux et mobilier (Phase 8)
    for (const comp of Object.values(components)) {
      if (isIncremental && !dirtyElementIds.has(comp.id)) continue;
      const compType = state.componentTypes?.[comp.typeId];
      if (!compType) continue;

      const level = state.levels[comp.levelId];
      const elevation = level?.elevation ?? 0;

      const compMesh = createComponentMesh(comp, compType, elevation);
      if (compMesh) {
        scene.updateComponentMesh(comp.id, compMesh, compType.family);
      }
    }

    renderedElementIdsRef.current = currentElementIds;

    // Ré-appliquer la surbrillance sur les maillages recréés/mis à jour
    const currentSelection = selectionRef.current;
    if (currentSelection && currentSelection.length > 0) {
      scene.setHighlight(currentSelection);
    } else {
      scene.render();
    }
  }, [state, lastChangedIds]);

  // Synchronisation de la surbrillance (partagée 2D ↔ 3D)
  useEffect(() => {
    selectionRef.current = selection;
    if (sceneRef.current) {
      sceneRef.current.setHighlight(selection ?? []);
    }
  }, [selection]);

  // Écouteur de picking 3D (clic stationnaire raycast)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onSelectionChanged) return;

    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const scene = sceneRef.current;
      if (!scene) return;

      // Filtrer les glissements de caméra (rotation OrbitControls > 5px)
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist >= 5) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      const hitId = scene.raycast(screenX, screenY);
      if (hitId) {
        onSelectionChanged([hitId]);
      } else {
        onSelectionChanged([]);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onSelectionChanged]);

  // Adaptation responsive de la taille du canvas
  useResizeObserver(containerRef, (width, height) => {
    if (sceneRef.current) {
      sceneRef.current.resize(width, height);
    }
  });

  return (
    <div
      ref={containerRef}
      data-testid="viewport-3d-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#f4f3ef',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#374151',
          border: '1px solid #e5e7eb',
          pointerEvents: 'none',
        }}
      >
        Vue 3D Orbitale (Z-up)
      </div>
      <canvas
        ref={canvasRef}
        data-testid="viewport-3d-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
