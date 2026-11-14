import { useEffect, useRef } from 'react';
import { Scene3D, createWallMesh } from '@mini-bim/view-3d';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';

/**
 * Wrapper React du visualiseur 3D orbital Three.js impératif.
 * Règle d'or 3 : Instanciation unique dans useEffect, jamais recréé à chaque render.
 * Règle d'or 2 : Aucun import direct de @mini-bim/geometry (passe par view-3d).
 */
export function Viewport3D() {
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
    scene.render();
  }, [state]);

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
        Vue 3D (Z-up)
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
