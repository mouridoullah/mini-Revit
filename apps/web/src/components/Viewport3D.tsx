import { useEffect, useRef } from 'react';
import {
  Scene3D,
  createWallMeshWithOpenings,
  createOpeningPlaceholder,
  createDoorPlaceholderMaterial,
  createWindowPlaceholderMaterial,
  createSlabMesh,
  createStairMesh,
  solveWallJunctions,
  type WallInput,
  type OpeningGeometryParams,
} from '@mini-bim/view-3d';
import { computeStairShaft } from '@mini-bim/core';
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
  const { state } = useBimDocument();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const renderedElementIdsRef = useRef<Set<string>>(new Set());
  const doorMaterialRef = useRef<ReturnType<typeof createDoorPlaceholderMaterial> | null>(null);
  const windowMaterialRef = useRef<ReturnType<typeof createWindowPlaceholderMaterial> | null>(null);

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

    const currentElementIds = new Set([
      ...Object.keys(state.walls),
      ...Object.keys(doors),
      ...Object.keys(windows),
      ...Object.keys(slabs),
      ...Object.keys(stairs),
    ]);

    // 1. Suppression des maillages d'éléments supprimés (murs ou ouvertures en cascade)
    for (const id of renderedElementIdsRef.current) {
      if (!currentElementIds.has(id)) {
        scene.removeMesh(id);
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
      const wallType = state.wallTypes[wall.typeId];
      if (!wallType) continue;

      const level = state.levels[wall.levelId];
      const elevation = level?.elevation ?? 0;

      // Rassembler toutes les ouvertures hébergées par ce mur
      const wallDoors = Object.values(doors).filter((d) => d.hostWallId === wall.id);
      const wallWindows = Object.values(windows).filter((w) => w.hostWallId === wall.id);

      const openingParams: OpeningGeometryParams[] = [
        ...wallDoors.map((d) => {
          const dt = state.doorTypes?.[d.doorTypeId];
          const w = dt?.width ?? 900;
          const h = dt?.height ?? 2100;
          return {
            id: d.id,
            kind: 'door' as const,
            offsetAlong: d.offsetAlong,
            width: w,
            height: h,
            sillHeight: 0,
          };
        }),
        ...wallWindows.map((w) => {
          const wt = state.windowTypes?.[w.windowTypeId];
          const width = wt?.width ?? 1200;
          const height = wt?.height ?? 1400;
          return {
            id: w.id,
            kind: 'window' as const,
            offsetAlong: w.offsetAlong,
            width,
            height,
            sillHeight: w.sillHeight,
          };
        }),
      ];

      // Générer les tronçons solides découpés (murs percés 2.5D avec jonctions résolues)
      const resolvedPoly = resolvedPolygonsByWallId.get(wall.id);
      const pieces = createWallMeshWithOpenings({
        wall,
        wallType,
        openings: openingParams,
        elevation,
        ...(resolvedPoly ? { polygon: resolvedPoly } : {}),
      });

      // Remplacement atomique de l'ensemble des tronçons solides du mur (ancien maillage libéré)
      scene.updateMeshBatch(wall.id, pieces);
    }

    // 3. Placeholders 3D des portes (boîte bois)
    const doorMat = doorMaterialRef.current ?? undefined;
    for (const door of Object.values(doors)) {
      const hostWall = state.walls[door.hostWallId];
      if (!hostWall) continue;
      const level = state.levels[hostWall.levelId];
      const elevation = level?.elevation ?? 0;

      const dt = state.doorTypes?.[door.doorTypeId];
      const doorWidth = dt?.width ?? 900;
      const doorHeight = dt?.height ?? 2100;

      const placeholder = createOpeningPlaceholder(
        {
          id: door.id,
          kind: 'door',
          offsetAlong: door.offsetAlong,
          width: doorWidth,
          height: doorHeight,
          sillHeight: 0,
        },
        hostWall,
        elevation,
      );
      scene.updateMesh(placeholder, doorMat);
    }

    // 4. Placeholders 3D des fenêtres (boîte vitrée translucide)
    const winMat = windowMaterialRef.current ?? undefined;
    for (const win of Object.values(windows)) {
      const hostWall = state.walls[win.hostWallId];
      if (!hostWall) continue;
      const level = state.levels[hostWall.levelId];
      const elevation = level?.elevation ?? 0;

      const wt = state.windowTypes?.[win.windowTypeId];
      const winWidth = wt?.width ?? 1200;
      const winHeight = wt?.height ?? 1400;

      const placeholder = createOpeningPlaceholder(
        {
          id: win.id,
          kind: 'window',
          offsetAlong: win.offsetAlong,
          width: winWidth,
          height: winHeight,
          sillHeight: win.sillHeight,
        },
        hostWall,
        elevation,
      );
      scene.updateMesh(placeholder, winMat);
    }

    // 5. Placeholders et maillages 3D des dalles structurelles (avec trémies)
    for (const slab of Object.values(slabs)) {
      const slabType = state.slabTypes?.[slab.slabTypeId];
      if (!slabType) continue;

      const level = state.levels[slab.levelId];
      const elevation = level?.elevation ?? 0;

      // Dériver dynamiquement les trémies d'escaliers arrivant sur ce niveau (ADR-048 D5)
      const stairShafts: { x: number; y: number }[][] = [];
      for (const st of Object.values(stairs)) {
        if (st.topLevelId === slab.levelId) {
          stairShafts.push(computeStairShaft(st, state) as unknown as { x: number; y: number }[]);
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

    renderedElementIdsRef.current = currentElementIds;

    // Ré-appliquer la surbrillance sur les maillages recréés/mis à jour
    if (selection && selection.length > 0) {
      scene.setHighlight(selection);
    } else {
      scene.render();
    }
  }, [state, selection]);

  // Synchronisation de la surbrillance (partagée 2D ↔ 3D)
  useEffect(() => {
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
