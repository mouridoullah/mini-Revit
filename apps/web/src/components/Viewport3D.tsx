import { useEffect, useRef } from 'react';
import { Scene3D, createWallMesh } from '@mini-bim/view-3d';
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
  const renderedWallIdsRef = useRef<Set<string>>(new Set());

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

    return () => {
      scene.dispose();
      sceneRef.current = null;
      renderedWallIdsRef.current.clear();
    };
  }, []); // Monté une seule fois

  // Synchronisation des maillages 3D lors des mutations de state
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentWallIds = new Set(Object.keys(state.walls));

    // 1. Suppression des maillages d'éléments supprimés
    for (const id of renderedWallIdsRef.current) {
      if (!currentWallIds.has(id)) {
        scene.removeMesh(id);
      }
    }

    // 2. Mise à jour ou ajout des murs courants
    for (const wall of Object.values(state.walls)) {
      const wallType = state.wallTypes[wall.typeId];
      if (!wallType) continue;

      const level = state.levels[wall.levelId];
      const elevation = level?.elevation ?? 0;

      const rawMesh = createWallMesh(wall, wallType, elevation);
      if (rawMesh) {
        if (renderedWallIdsRef.current.has(wall.id)) {
          scene.updateMesh(rawMesh);
        } else {
          scene.addMesh(rawMesh);
        }
      }
    }

    renderedWallIdsRef.current = currentWallIds;
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
