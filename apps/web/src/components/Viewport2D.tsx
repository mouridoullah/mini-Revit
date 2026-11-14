import { useEffect, useRef } from 'react';
import { View2D } from '@mini-bim/view-2d';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';

/**
 * Wrapper React du visualiseur en plan 2D impératif.
 * Règle d'or 3 : Instanciation unique dans useEffect, jamais recréé à chaque render.
 */
export function Viewport2D() {
  const { doc, state } = useBimDocument();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View2D | null>(null);

  // Instanciation impérative unique
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;

    const view = new View2D(canvas, {
      transform: {
        viewportWidth: width,
        viewportHeight: height,
        scale: 0.05,
      },
    });
    viewRef.current = view;

    view.setDocument(doc);
    view.zoomToFit(60);

    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, [doc]);

  // Mise à jour sur notification d'état documentaire
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.render(doc);
    }
  }, [state, doc]);

  // Adaptation responsive de la taille du canvas
  useResizeObserver(containerRef, (width, height) => {
    if (viewRef.current) {
      viewRef.current.resize(width, height);
    }
  });

  return (
    <div
      ref={containerRef}
      data-testid="viewport-2d-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
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
        Plan 2D (Y-up)
      </div>
      <canvas
        ref={canvasRef}
        data-testid="viewport-2d-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
