import { useEffect, useRef, useState } from 'react';
import {
  Scene3D,
  type RenderMode,
  createDoorPlaceholderMaterial,
  createWindowPlaceholderMaterial,
  solveWallJunctions,
  type WallInput,
  type ClashOverlayItem,
  type FederatedModelVisual,
} from '@tabax/view-3d';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';
import { Viewport3DToolbar } from './viewport-3d/Viewport3DToolbar.js';
import { syncMepElements } from './viewport-3d/syncMepElements.js';
import { syncArchitecturalComponents } from './viewport-3d/syncArchitecturalComponents.js';
import { syncArchitecturalOpenings } from './viewport-3d/syncArchitecturalOpenings.js';
import { syncArchitecturalStructure } from './viewport-3d/syncArchitecturalStructure.js';

export interface Viewport3DProps {
  readonly isWhiteMode?: boolean;
  readonly onZoomFitReady?: (zoomToFit: () => void) => void;
  readonly selection?: readonly string[];
  readonly onSelectionChanged?: (ids: readonly string[]) => void;
  readonly clashes?: readonly ClashOverlayItem[];
  readonly focusPoint?: { readonly x: number; readonly y: number; readonly z: number; readonly triggerId?: number } | null;
  readonly federatedModels?: readonly FederatedModelVisual[];
  readonly federatedSelection?: { readonly modelId: string; readonly expressId: number } | null;
  readonly onSelectFederatedEntity?: (modelId: string | null, expressId: number | null) => void;
  readonly activeSectionCut?: {
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly viewDirection: 1 | -1;
  } | null;
}

/**
 * Wrapper React du visualiseur 3D orbital Three.js impératif.
 * Règle d'or 3 : Instanciation unique dans useEffect, jamais recréé à chaque render.
 * Règle d'or 2 : Aucun import direct de @tabax/geometry (passe par view-3d).
 */
export function Viewport3D({
  isWhiteMode = false,
  onZoomFitReady,
  selection,
  onSelectionChanged,
  clashes,
  focusPoint,
  federatedModels,
  federatedSelection,
  onSelectFederatedEntity,
  activeSectionCut,
}: Viewport3DProps = {}) {
  const { state, lastChangedIds } = useBimDocument();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const renderedElementIdsRef = useRef<Set<string>>(new Set());
  const renderedFedModelIdsRef = useRef<Set<string>>(new Set());
  const doorMaterialRef = useRef<ReturnType<typeof createDoorPlaceholderMaterial> | null>(null);
  const windowMaterialRef = useRef<ReturnType<typeof createWindowPlaceholderMaterial> | null>(null);
  const selectionRef = useRef<readonly string[] | undefined>(selection);

  const [renderMode, setRenderMode] = useState<RenderMode>('technique');
  const prevRenderModeRef = useRef<RenderMode>(renderMode);
  const [sunHour, setSunHour] = useState<number>(14);
  const [showEdges, setShowEdges] = useState<boolean>(true);

  const handleModeChange = (mode: RenderMode) => {
    setRenderMode(mode);
    sceneRef.current?.setRenderMode(mode);
  };

  const handleSunHourChange = (hour: number) => {
    setSunHour(hour);
    sceneRef.current?.setSunHour(hour);
  };

  const handleToggleEdges = () => {
    const next = !showEdges;
    setShowEdges(next);
    if (sceneRef.current) {
      const scene = sceneRef.current.getScene();
      scene.traverse((obj) => {
        if (obj.name.endsWith('-architectural-edges') || obj.name.endsWith('-mep-edges')) {
          obj.visible = next;
        }
      });
      sceneRef.current.render();
    }
  };

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
      background: 0x262a33,
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

  useEffect(() => {
    onZoomFitReady?.(() => {
      sceneRef.current?.zoomToFit();
    });
  }, [onZoomFitReady]);

  useEffect(() => {
    sceneRef.current?.setBackground(
      isWhiteMode ? 0xffffff : 0x262a33,
      isWhiteMode ? [0xd1d5db, 0xe5e7eb] : [0x566070, 0x3a404c],
    );
  }, [isWhiteMode]);

  // Synchronisation des maillages 3D (murs percés et placeholders d'ouvertures) lors des mutations de state
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    scene.batchUpdate(() => {
      const doors = state.doors ?? {};
    const windows = state.windows ?? {};
    const slabs = state.slabs ?? {};
    const stairs = state.stairs ?? {};
    const roofs = state.roofs ?? {};
    const components = state.components ?? {};
    const pipes = state.pipes ?? {};
    const ducts = state.ducts ?? {};
    const cableTrays = state.cableTrays ?? {};
    const mepFittings = state.mepFittings ?? {};
    const mepEquipments = state.mepEquipments ?? {};

    const currentElementIds = new Set([
      ...Object.keys(state.walls),
      ...Object.keys(doors),
      ...Object.keys(windows),
      ...Object.keys(slabs),
      ...Object.keys(stairs),
      ...Object.keys(roofs),
      ...Object.keys(components),
      ...Object.keys(pipes),
      ...Object.keys(ducts),
      ...Object.keys(cableTrays),
      ...Object.keys(mepFittings),
      ...Object.keys(mepEquipments),
    ]);

    // 1. Suppression des maillages d'éléments supprimés (murs ou ouvertures en cascade)
    for (const id of renderedElementIdsRef.current) {
      if (!currentElementIds.has(id)) {
        scene.removeMesh(id);
      }
    }

    // Calcul différentiel du dirty set incrémental (ADR-019 / Audit P1.6)
    const isModeChanged = prevRenderModeRef.current !== renderMode;
    prevRenderModeRef.current = renderMode;
    const isIncremental = !isModeChanged && lastChangedIds !== undefined && renderedElementIdsRef.current.size > 0;
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
                Math.hypot(otherWall.start.x - wall.start.x, otherWall.start.y - wall.start.y) <
                  50 ||
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
          for (const w of Object.values(state.walls))
            if (w.levelId === id) dirtyElementIds.add(w.id);
          for (const s of Object.values(slabs)) if (s.levelId === id) dirtyElementIds.add(s.id);
          for (const st of Object.values(stairs))
            if (st.bottomLevelId === id || st.topLevelId === id) dirtyElementIds.add(st.id);
          for (const r of Object.values(roofs)) if (r.levelId === id) dirtyElementIds.add(r.id);
          for (const c of Object.values(components))
            if (c.levelId === id) dirtyElementIds.add(c.id);
          for (const p of Object.values(pipes)) if (p.levelId === id) dirtyElementIds.add(p.id);
          for (const d of Object.values(ducts)) if (d.levelId === id) dirtyElementIds.add(d.id);
          for (const ct of Object.values(cableTrays))
            if (ct.levelId === id) dirtyElementIds.add(ct.id);
          for (const ft of Object.values(mepFittings))
            if (ft.levelId === id) dirtyElementIds.add(ft.id);
          for (const eq of Object.values(mepEquipments))
            if (eq.levelId === id) dirtyElementIds.add(eq.id);
        }
        // Si un système MEP est modifié, tous ses éléments sont sales
        if (state.mepSystems?.[id]) {
          for (const elId of state.mepSystems[id]?.elementIds ?? []) {
            dirtyElementIds.add(elId);
          }
        }
        // Si un type est modifié, toutes ses instances sont sales
        if (state.wallTypes[id]) {
          for (const w of Object.values(state.walls))
            if (w.typeId === id) dirtyElementIds.add(w.id);
        }
        if (state.slabTypes?.[id]) {
          for (const s of Object.values(slabs)) if (s.slabTypeId === id) dirtyElementIds.add(s.id);
        }
        if (state.doorTypes?.[id]) {
          for (const d of Object.values(doors)) if (d.doorTypeId === id) dirtyElementIds.add(d.id);
        }
        if (state.windowTypes?.[id]) {
          for (const w of Object.values(windows))
            if (w.windowTypeId === id) dirtyElementIds.add(w.id);
        }
        if (state.stairTypes?.[id]) {
          for (const st of Object.values(stairs))
            if (st.stairTypeId === id) dirtyElementIds.add(st.id);
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

    const resolvedPolygonsByWallId = new Map<
      string,
      readonly { readonly x: number; readonly y: number }[]
    >();
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

    // 2. Murs, dalles, escaliers, toitures (LOD 350 en mode réaliste, maillages monolithiques en mode technique)
    syncArchitecturalStructure(scene, state, dirtyElementIds, isIncremental, {
      renderMode,
      resolvedPolygonsByWallId,
    });

    // 3. Menuiseries architecturales LOD 350 / LOD 200 (portes et fenêtres)
    const openingDetail = renderMode === 'realiste' ? 'lod350' : 'lod200';
    syncArchitecturalOpenings(scene, state, dirtyElementIds, isIncremental, {
      detailLevel: openingDetail,
      doorMaterial: doorMaterialRef.current ?? undefined,
      windowMaterial: windowMaterialRef.current ?? undefined,
    });

    // 4. Maillages 3D des composants architecturaux et mobilier LOD 350
    syncArchitecturalComponents(scene, state, dirtyElementIds, isIncremental);

    // 5. Maillages 3D des réseaux techniques MEP (Sous-phase 9.3.2)
    syncMepElements(scene, state, dirtyElementIds, isIncremental);

      renderedElementIdsRef.current = currentElementIds;

      // Ré-appliquer la surbrillance sur les maillages recréés/mis à jour
      const currentSelection = selectionRef.current;
      if (currentSelection && currentSelection.length > 0) {
        scene.setHighlight(currentSelection);
      }
    });
  }, [state, lastChangedIds, renderMode]);

  // Synchronisation de la surbrillance (partagée 2D ↔ 3D)
  useEffect(() => {
    selectionRef.current = selection;
    if (sceneRef.current) {
      sceneRef.current.setHighlight(selection ?? []);
    }
  }, [selection]);

  // Synchronisation du plan de coupe 3D (ADR-063)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (activeSectionCut) {
      scene.setSectionCutFrom2D(
        activeSectionCut.start,
        activeSectionCut.end,
        activeSectionCut.viewDirection,
      );
    } else {
      scene.setSectionCutPlane(null);
    }
  }, [activeSectionCut]);

  // Synchronisation des superpositions visuelles des conflits 3D (Phase 9.4)
  useEffect(() => {
    if (!sceneRef.current) return;
    if (clashes && clashes.length > 0) {
      sceneRef.current.setClashOverlays(clashes);
    } else {
      sceneRef.current.clearClashOverlays();
    }
  }, [clashes]);

  // Centrage dynamique de la caméra 3D sur un point d'interférence
  useEffect(() => {
    if (!sceneRef.current || !focusPoint) return;
    sceneRef.current.focusOnPoint(focusPoint);
  }, [focusPoint]);

  // Synchronisation des maquettes IFC externes fédérées
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentFedIds = new Set(federatedModels?.map((m) => m.id) ?? []);

    // Suppression des modèles retirés
    for (const id of renderedFedModelIdsRef.current) {
      if (!currentFedIds.has(id)) {
        scene.removeFederatedModel(id);
      }
    }

    // Ajout / mise à jour
    if (federatedModels) {
      for (const model of federatedModels) {
        scene.addFederatedModel(model);
      }
    }

    renderedFedModelIdsRef.current = currentFedIds;
  }, [federatedModels]);

  useEffect(() => {
    sceneRef.current?.setFederatedSelection(
      federatedSelection?.modelId ?? null,
      federatedSelection?.expressId ?? null,
    );
  }, [federatedSelection]);

  // Écouteur de picking 3D (clic stationnaire raycast)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
        onSelectionChanged?.([hitId]);
        onSelectFederatedEntity?.(null, null);
      } else {
        const fedHit = scene.getFederatedEntityAt(e.clientX, e.clientY);
        if (fedHit) {
          onSelectFederatedEntity?.(fedHit.modelId, fedHit.expressId);
          onSelectionChanged?.([]);
        } else {
          onSelectionChanged?.([]);
          onSelectFederatedEntity?.(null, null);
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onSelectionChanged, onSelectFederatedEntity]);

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
        backgroundColor: isWhiteMode ? '#ffffff' : '#262a33',
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="viewport-3d-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {/* Barre de contrôle PBR / Modes de rendu (ADR-072) */}
      <Viewport3DToolbar
        renderMode={renderMode}
        onModeChange={handleModeChange}
        sunHour={sunHour}
        onSunHourChange={handleSunHourChange}
        showEdges={showEdges}
        onToggleEdges={handleToggleEdges}
      />
    </div>
  );
}
