import { useEffect, useRef } from 'react';
import {
  Scene3D,
  createWallMeshWithOpenings,
  createOpeningPlaceholder,
  createDoorPlaceholderMaterial,
  createWindowPlaceholderMaterial,
  type OpeningGeometryParams,
} from '@mini-bim/view-3d';
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

    const currentElementIds = new Set([
      ...Object.keys(state.walls),
      ...Object.keys(doors),
      ...Object.keys(windows),
    ]);

    // 1. Suppression des maillages d'éléments supprimés (murs ou ouvertures en cascade)
    for (const id of renderedElementIdsRef.current) {
      if (!currentElementIds.has(id)) {
        scene.removeMesh(id);
      }
    }

    // 2. Mise à jour ou ajout des murs percés de leurs ouvertures
    for (const wall of Object.values(state.walls)) {
      const wallType = state.wallTypes[wall.typeId];
      if (!wallType) continue;

      const level = state.levels[wall.levelId];
      const elevation = level?.elevation ?? 0;

      // Rassembler toutes les ouvertures hébergées par ce mur
      const wallDoors = Object.values(doors).filter((d) => d.hostWallId === wall.id);
      const wallWindows = Object.values(windows).filter((w) => w.hostWallId === wall.id);

      const openingParams: OpeningGeometryParams[] = [
        ...wallDoors.map((d) => ({
          id: d.id,
          kind: 'door' as const,
          offsetAlong: d.offsetAlong,
          width: d.width,
          height: d.height,
          sillHeight: 0,
        })),
        ...wallWindows.map((w) => ({
          id: w.id,
          kind: 'window' as const,
          offsetAlong: w.offsetAlong,
          width: w.width,
          height: w.height,
          sillHeight: w.sillHeight,
        })),
      ];

      // Générer les tronçons solides découpés (murs percés 2.5D)
      const pieces = createWallMeshWithOpenings({
        wall,
        wallType,
        openings: openingParams,
        elevation,
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

      const placeholder = createOpeningPlaceholder(
        {
          id: door.id,
          kind: 'door',
          offsetAlong: door.offsetAlong,
          width: door.width,
          height: door.height,
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

      const placeholder = createOpeningPlaceholder(
        {
          id: win.id,
          kind: 'window',
          offsetAlong: win.offsetAlong,
          width: win.width,
          height: win.height,
          sillHeight: win.sillHeight,
        },
        hostWall,
        elevation,
      );
      scene.updateMesh(placeholder, winMat);
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
