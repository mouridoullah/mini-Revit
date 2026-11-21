import { useRef, useState, type ReactNode } from 'react';
import { Columns2, Moon, PanelLeft, PanelRight, Sun, ZoomIn } from 'lucide-react';
import styles from './Cockpit.module.css';

export type ViewMode = '2d' | 'split' | '3d';
export function SplitViewport({
  twoD,
  threeD,
  levelName,
  onZoomFit,
  onZoomFit3D,
  isWhiteMode = false,
  onToggleWhiteMode,
}: {
  twoD: ReactNode;
  threeD: ReactNode;
  levelName: string;
  onZoomFit?: () => void;
  onZoomFit3D?: () => void;
  isWhiteMode?: boolean;
  onToggleWhiteMode?: () => void;
}) {
  const [mode, setMode] = useState<ViewMode>('split');
  const [ratio, setRatio] = useState(50);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    setRatio(Math.min(80, Math.max(20, ((event.clientX - rect.left) / rect.width) * 100)));
  };
  return (
    <div
      ref={root}
      className={styles.workspace}
      data-testid="split-viewport"
      onPointerMove={resize}
      onPointerUp={() => {
        drag.current = false;
      }}
      onPointerCancel={() => {
        drag.current = false;
      }}
    >
      <div className={styles.layoutControls} aria-label="Disposition des vues">
        {(
          [
            ['2d', PanelLeft, '2D'],
            ['split', Columns2, '2D | 3D'],
            ['3d', PanelRight, '3D'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            data-testid={`layout-${value}-btn`}
            aria-pressed={mode === value}
            className={`${styles.layoutButton} ${mode === value ? styles.layoutActive : ''}`}
            onClick={() => setMode(value)}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
        {onToggleWhiteMode && (
          <button
            type="button"
            data-testid="viewport-3d-background-toggle"
            aria-label={
              isWhiteMode ? 'Activer le thème sombre de la vue 3D' : 'Activer le thème clair de la vue 3D'
            }
            aria-pressed={isWhiteMode}
            title={isWhiteMode ? 'Thème sombre 3D' : 'Thème clair 3D'}
            className={`${styles.layoutButton} ${styles.layoutThemeButton} ${isWhiteMode ? styles.layoutActive : ''}`}
            onClick={onToggleWhiteMode}
          >
            {isWhiteMode ? (
              <Moon size={16} strokeWidth={1.75} />
            ) : (
              <Sun size={16} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
      {(mode === '2d' || mode === 'split') && (
        <section
          className={styles.viewportFrame}
          style={{ flex: mode === 'split' ? `0 0 calc(${ratio}% - 2.5px)` : '1 1 100%' }}
        >
          <div className={`${styles.viewportLabel} ${styles.viewport2dLabel}`}>
            Plan 2D — {levelName}
          </div>
          {twoD}
          <button
            type="button"
            data-testid="zoom-fit-btn"
            className={styles.zoomFit}
            onClick={onZoomFit}
          >
            <ZoomIn size={14} strokeWidth={1.75} /> Zoom Fit
          </button>
        </section>
      )}
      {mode === 'split' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner les vues"
          data-testid="viewport-splitter"
          tabIndex={0}
          className={styles.split}
          onPointerDown={(event) => {
            drag.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onDoubleClick={() => setRatio(50)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setRatio((r) => Math.max(20, r - 2));
            if (event.key === 'ArrowRight') setRatio((r) => Math.min(80, r + 2));
          }}
        />
      )}
      {(mode === '3d' || mode === 'split') && (
        <section
          className={`${styles.viewportFrame} ${styles.viewportFrame3d}`}
          style={{ flex: mode === 'split' ? `0 0 calc(${100 - ratio}% - 2.5px)` : '1 1 100%' }}
        >
          <div className={styles.viewportLabel}>Vue 3D — Studio</div>
          {threeD}
          <button
            type="button"
            data-testid="zoom-fit-3d-btn"
            className={styles.zoomFit}
            onClick={onZoomFit3D}
          >
            <ZoomIn size={14} strokeWidth={1.75} /> Zoom Fit
          </button>
        </section>
      )}
    </div>
  );
}
