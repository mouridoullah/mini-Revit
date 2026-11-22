import { useEffect, useRef, useState, useMemo } from 'react';
import { computeSectionScene } from '@tabax/core';
import { renderSectionView, generateSectionSvg, generateSectionDxf } from '@tabax/view-2d';
import { Download, Scissors, Eye, EyeOff, ZoomIn, ZoomOut, Maximize2, Building2 } from 'lucide-react';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { useResizeObserver } from '../hooks/useResizeObserver.js';

export interface SectionViewportProps {
  readonly sectionCutId: string | null;
  readonly is3dSynchroEnabled?: boolean;
  readonly onToggle3dSynchro?: () => void;
}

export function SectionViewport({
  sectionCutId,
  is3dSynchroEnabled = false,
  onToggle3dSynchro,
}: SectionViewportProps) {
  const { state } = useBimDocument();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useResizeObserver(containerRef, (width, height) => {
    setDimensions({ width, height });
  });

  const sectionCut = useMemo(() => {
    if (!sectionCutId || !state.sectionCuts) return null;
    return state.sectionCuts[sectionCutId] ?? null;
  }, [sectionCutId, state.sectionCuts]);

  const scene = useMemo(() => {
    if (!sectionCut) return null;
    return computeSectionScene(state, sectionCut);
  }, [state, sectionCut]);

  // Rendu Canvas 2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = dimensions.width > 0 ? dimensions.width : 800;
    const height = dimensions.height > 0 ? dimensions.height : 600;

    canvas.width = width;
    canvas.height = height;

    const cutLen = Math.max(100, scene.cutLength);
    const sMin = scene.bounds.sMin ?? 0;
    const sMax = scene.bounds.sMax ?? cutLen;
    const sSpan = Math.max(100, sMax - sMin);
    const zSpan = Math.max(500, scene.bounds.zMax - scene.bounds.zMin);
    const padding = 60;
    const availW = Math.max(50, width - padding * 2);
    const availH = Math.max(50, height - padding * 2);
    const baseFitScale = Math.min(availW / sSpan, availH / zSpan);
    const scale = baseFitScale * zoomFactor;

    const baseOffX = padding + (availW - sSpan * scale) / 2 - sMin * scale;
    const baseOffY = height - padding - (availH - zSpan * scale) / 2;

    const renderOptions = {
      width,
      height,
      padding: 60,
      showLevels: true,
      showHatch: true,
      backgroundColor: '#1e293b',
      scale,
      offset: {
        x: baseOffX + panOffset.x,
        y: baseOffY + panOffset.y,
      },
    };

    renderSectionView(ctx, scene, renderOptions);
  }, [scene, dimensions, zoomFactor, panOffset]);

  const handleExportSvg = () => {
    if (!scene) return;
    try {
      const svgContent = generateSectionSvg(scene, {
        paperSize: 'A4',
        scale: 100,
        project: 'Tabax Project',
      });
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${scene.cutName.replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[SectionViewport] Export SVG failed:', err);
    }
  };

  const handleExportDxf = () => {
    if (!scene) return;
    try {
      const dxfContent = generateSectionDxf(scene, {
        projectTitle: 'Tabax Project',
        includeHatches: true,
      });
      const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${scene.cutName.replace(/[^a-zA-Z0-9_-]/g, '_')}.dxf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[SectionViewport] Export DXF failed:', err);
    }
  };

  const handleZoomIn = () => {
    setZoomFactor((z) => Math.min(10, Math.round(z * 1.25 * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomFactor((z) => Math.max(0.1, Math.round((z / 1.25) * 100) / 100));
  };

  const handleZoomFit = () => {
    setZoomFactor(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoomFactor((z) => Math.min(10, Math.max(0.1, Math.round(z * factor * 100) / 100)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragStartRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  if (!sectionCut || !scene) {
    return (
      <div
        ref={containerRef}
        data-testid="section-viewport-empty"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e293b',
          color: 'var(--text-secondary)',
          gap: '12px',
          userSelect: 'none',
        }}
      >
        <Scissors size={32} opacity={0.4} />
        <div style={{ fontSize: '13px', fontWeight: 500 }}>Aucune coupe active</div>
        <div style={{ fontSize: '11px', opacity: 0.7 }}>
          Sélectionnez une coupe dans le navigateur de projet ou tracez-en une avec l&apos;outil Coupe (X).
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="section-viewport"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1e293b',
      }}
    >
      {/* Barre d'outils de coupe supérieure */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 280,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {sectionCut.kind === 'elevation' ? (
            <Building2 size={15} color="var(--accent-primary)" />
          ) : (
            <Scissors size={15} color="var(--accent-primary)" />
          )}
          <strong data-testid="section-active-title">{sectionCut.name}</strong>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-elevated)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
            }}
          >
            Repère {sectionCut.label}
          </span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-elevated)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
            }}
          >
            Profondeur {sectionCut.depth} mm
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onToggle3dSynchro && (
            <button
              type="button"
              data-testid="toggle-3d-synchro-btn"
              onClick={onToggle3dSynchro}
              title={
                is3dSynchroEnabled
                  ? 'Désactiver le plan de coupe 3D synchronisé'
                  : 'Activer le plan de coupe 3D synchronisé'
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: is3dSynchroEnabled ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                color: is3dSynchroEnabled ? '#ffffff' : 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              {is3dSynchroEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
              Synchro 3D
            </button>
          )}

          <button
            type="button"
            data-testid="export-section-svg-btn"
            onClick={handleExportSvg}
            title="Exporter la coupe en SVG vectoriel normalisé"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            SVG
          </button>

          <button
            type="button"
            data-testid="export-section-dxf-btn"
            onClick={handleExportDxf}
            title="Exporter la coupe en DXF R12 1:1"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            DXF
          </button>

          {/* Contrôles de Zoom et Cadrage */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              padding: '2px 4px',
            }}
          >
            <button
              type="button"
              data-testid="zoom-out-section-btn"
              onClick={handleZoomOut}
              title="Zoom Arrière"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <ZoomOut size={13} />
            </button>
            <span
              data-testid="zoom-level-text"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                minWidth: '38px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                userSelect: 'none',
              }}
            >
              {Math.round(zoomFactor * 100)}%
            </span>
            <button
              type="button"
              data-testid="zoom-in-section-btn"
              onClick={handleZoomIn}
              title="Zoom Avant"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              data-testid="zoom-fit-section-btn"
              onClick={handleZoomFit}
              title="Ajuster la vue à la coupe (Cadrer)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                marginLeft: '3px',
                fontSize: '11px',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-canvas-chrome)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              <Maximize2 size={12} />
              Cadrer
            </button>
          </div>
        </div>
      </div>

      {/* Canvas 2D de rendu de coupe avec support Zoom Molette & Pan Glisser */}
      <canvas
        ref={canvasRef}
        data-testid="section-canvas"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
