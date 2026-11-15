import { useEffect, useRef } from 'react';
import { type BimDocument, type BimState, detectRooms } from '@mini-bim/core';
import { View2D, type DetectedRoomFor2D } from '@mini-bim/view-2d';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';
import { type Tool, type ToolContext, type ToolEvent } from '../tools/types.js';
import { convertPointerEvent, convertKeyEvent } from '../tools/toolGlue.js';

function resolveActiveLevelId(state: BimState, propId?: string | null): string {
  if (propId && state.levels[propId]) {
    return propId;
  }
  return Object.keys(state.levels)[0] ?? '';
}

export interface Viewport2DProps {
  readonly tool?: Tool;
  readonly selection?: readonly string[];
  readonly onSelectionChanged?: (ids: readonly string[]) => void;
  readonly onDrawingLengthChange?: (length: number | null) => void;
  readonly onErrorChange?: (error: string | null) => void;
  readonly activeLevelId?: string;
  readonly underlayLevelId?: string | null;
  readonly snapToUnderlay?: boolean;
}

/**
 * Wrapper React du visualiseur en plan 2D impératif.
 * Règle d'or 3 : Instanciation unique dans useEffect, jamais recréé à chaque render.
 * Délègue les interactions aux machines à états de Tools (SelectTool, WallTool, SlabTool).
 */
export function Viewport2D({
  tool,
  selection,
  onSelectionChanged,
  onDrawingLengthChange,
  onErrorChange,
  activeLevelId: activeLevelIdProp,
  underlayLevelId: underlayLevelIdProp,
  snapToUnderlay: snapToUnderlayProp = true,
}: Viewport2DProps = {}) {
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
      enableInternalSelection: !tool,
    });
    viewRef.current = view;

    view.setDocument(doc);
    view.zoomToFit(60);

    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  const lastDocRef = useRef<BimDocument>(doc);

  // Synchronisation du document quand doc est remplacé (ex: import JSON)
  useEffect(() => {
    if (lastDocRef.current !== doc && viewRef.current) {
      lastDocRef.current = doc;
      viewRef.current.setDocument(doc);
      viewRef.current.zoomToFit(60);
    }
  }, [doc]);

  // Synchronisation de la sélection externe (partagée 2D ↔ 3D)
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.setSelection(selection ?? []);
    }
  }, [selection]);

  // Synchronisation activeLevelId
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.setActiveLevelId(activeLevelIdProp ?? null);
      viewRef.current.invalidateUnderlayCache();
    }
  }, [activeLevelIdProp]);

  // Synchronisation underlayLevelId
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.setUnderlayLevelId(underlayLevelIdProp ?? null);
      viewRef.current.invalidateUnderlayCache();
    }
  }, [underlayLevelIdProp]);

  // Invalidation réactive de l'underlay cache sur doc.subscribe (S1-2)
  useEffect(() => {
    const unsubscribe = doc.subscribe((changedIds: readonly string[]) => {
      if (viewRef.current) {
        viewRef.current.invalidateUnderlayCache(changedIds);
      }
    });
    return unsubscribe;
  }, [doc]);

  // Mise à jour sur notification d'état documentaire et rafraîchissement des pièces et dalles
  useEffect(() => {
    if (viewRef.current) {
      const docState = doc.getState();
      const currentLevelId = resolveActiveLevelId(docState, activeLevelIdProp);
      if (currentLevelId) {
        const detected = detectRooms(docState, currentLevelId);
        const roomsFor2D: DetectedRoomFor2D[] = detected.map((d) => {
          const roomEntity = d.existingRoomId ? docState.rooms[d.existingRoomId] : undefined;
          const roomObj: DetectedRoomFor2D = {
            polygon: d.polygon,
            areaMm2: d.areaMm2,
            perimeterMm: d.perimeterMm,
            seed: d.seed,
            ...(d.existingRoomId ? { id: d.existingRoomId } : {}),
            ...(roomEntity?.name
              ? { name: roomEntity.name }
              : d.existingRoomId
                ? { name: 'Pièce' }
                : {}),
            ...(d.holes ? { holes: d.holes } : {}),
          };
          return roomObj;
        });
        viewRef.current.setRooms(roomsFor2D);
      }
      if (docState.slabs) {
        const slabsFor2D = Object.values(docState.slabs).filter(
          (sl) => !currentLevelId || sl.levelId === currentLevelId,
        );
        viewRef.current.setSlabs(slabsFor2D);
      }
      if (docState.dimensions) {
        viewRef.current.setDimensions(Object.values(docState.dimensions));
      }
      viewRef.current.render(doc);
    }
  }, [state, doc, activeLevelIdProp]);

  // Adaptation responsive de la taille du canvas
  useResizeObserver(containerRef, (width, height) => {
    if (viewRef.current) {
      viewRef.current.resize(width, height);
    }
  });

  // Gestion des interactions déléguées au Tool actif
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tool) return;

    const handlePointer = (e: PointerEvent) => {
      const view = viewRef.current;
      if (!view) return;

      if (e.type === 'pointerdown') {
        try {
          canvas.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
      }

      const toolEvent = convertPointerEvent(e, canvas);
      const docState = doc.getState();
      const currentLevelId = resolveActiveLevelId(docState, activeLevelIdProp);
      const activeWallTypeId = Object.keys(docState.wallTypes)[0] ?? '';
      const activeSlabTypeId = Object.keys(docState.slabTypes ?? {})[0] ?? '';
      const ctx: ToolContext = {
        doc,
        transform: view.getTransform(),
        activeLevelId: currentLevelId,
        activeWallTypeId,
        activeSlabTypeId,
        underlayLevelId: underlayLevelIdProp ?? null,
        snapToUnderlay: snapToUnderlayProp,
      };

      const output = tool.handle(toolEvent, ctx);

      if (output.kind === 'command') {
        view.setPreview(null);
        try {
          doc.execute(output.command);
          onErrorChange?.(null);
        } catch (err) {
          onErrorChange?.(err instanceof Error ? err.message : String(err));
        }
        onDrawingLengthChange?.(null);
      } else if (output.kind === 'preview') {
        view.setPreview(output.preview);
        if (output.preview && output.preview.kind === 'line') {
          const dx = output.preview.end.x - output.preview.start.x;
          const dy = output.preview.end.y - output.preview.start.y;
          onDrawingLengthChange?.(Math.hypot(dx, dy));
        } else {
          onDrawingLengthChange?.(null);
        }
      } else if (output.kind === 'selectionChanged') {
        view.setSelection(output.ids);
        onSelectionChanged?.(output.ids);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }
      const view = viewRef.current;
      if (!view) return;

      const toolEvent = convertKeyEvent(e);
      if (!toolEvent) return;

      const docState = doc.getState();
      const activeLevelId = resolveActiveLevelId(docState, activeLevelIdProp);
      const activeWallTypeId = Object.keys(docState.wallTypes)[0] ?? '';
      const activeSlabTypeId = Object.keys(docState.slabTypes ?? {})[0] ?? '';
      const ctx: ToolContext = {
        doc,
        transform: view.getTransform(),
        activeLevelId,
        activeWallTypeId,
        activeSlabTypeId,
        underlayLevelId: underlayLevelIdProp ?? null,
        snapToUnderlay: snapToUnderlayProp,
      };

      const output = tool.handle(toolEvent, ctx);

      if (output.kind === 'command') {
        view.setPreview(null);
        try {
          doc.execute(output.command);
          onErrorChange?.(null);
        } catch (err) {
          onErrorChange?.(err instanceof Error ? err.message : String(err));
        }
        onDrawingLengthChange?.(null);
      } else if (output.kind === 'preview') {
        view.setPreview(output.preview);
        onDrawingLengthChange?.(null);
      } else if (output.kind === 'selectionChanged') {
        view.setSelection(output.ids);
        onSelectionChanged?.(output.ids);
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const rect = canvas.getBoundingClientRect();
      const docState = doc.getState();
      const currentLevelId = resolveActiveLevelId(docState, activeLevelIdProp);
      const activeWallTypeId = Object.keys(docState.wallTypes)[0] ?? '';
      const activeSlabTypeId = Object.keys(docState.slabTypes ?? {})[0] ?? '';
      const ctx: ToolContext = {
        doc,
        transform: view.getTransform(),
        activeLevelId: currentLevelId,
        activeWallTypeId,
        activeSlabTypeId,
        underlayLevelId: underlayLevelIdProp ?? null,
        snapToUnderlay: snapToUnderlayProp,
      };

      const toolEvent: ToolEvent = {
        type: 'dblclick',
        screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      };

      const output = tool.handle(toolEvent, ctx);
      if (output.kind === 'command') {
        view.setPreview(null);
        try {
          doc.execute(output.command);
          onErrorChange?.(null);
        } catch (err) {
          onErrorChange?.(err instanceof Error ? err.message : String(err));
        }
        onDrawingLengthChange?.(null);
      }
    };

    canvas.addEventListener('pointerdown', handlePointer);
    canvas.addEventListener('pointermove', handlePointer);
    canvas.addEventListener('pointerup', handlePointer);
    canvas.addEventListener('dblclick', handleDblClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointer);
      canvas.removeEventListener('pointermove', handlePointer);
      canvas.removeEventListener('pointerup', handlePointer);
      canvas.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('keydown', handleKeyDown);
      tool.reset();
      viewRef.current?.setPreview(null);
      onDrawingLengthChange?.(null);
    };
  }, [tool, doc, onDrawingLengthChange, onSelectionChanged, activeLevelIdProp]);

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
          cursor: tool?.kind === 'wall' ? 'crosshair' : 'default',
        }}
      />
    </div>
  );
}
