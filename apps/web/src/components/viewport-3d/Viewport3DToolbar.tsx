import type { RenderMode } from '@tabax/view-3d';

export interface Viewport3DToolbarProps {
  readonly renderMode: RenderMode;
  readonly onModeChange: (mode: RenderMode) => void;
  readonly sunHour: number;
  readonly onSunHourChange: (hour: number) => void;
  readonly showEdges: boolean;
  readonly onToggleEdges: () => void;
}

/**
 * Barre de contrôles graphiques PBR / Modes de rendu du Viewport 3D (ADR-072).
 * Rendu compact sans emoji.
 */
export function Viewport3DToolbar({
  renderMode,
  onModeChange,
  sunHour,
  onSunHourChange,
  showEdges,
  onToggleEdges,
}: Viewport3DToolbarProps) {
  return (
    <div
      data-testid="viewport-3d-toolbar"
      style={{
        position: 'absolute',
        top: 48,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        backgroundColor: 'rgba(27, 30, 36, 0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-subtle, #2d323e)',
        borderRadius: 6,
        zIndex: 4,
        color: 'var(--text-primary, #f3f4f6)',
        fontSize: 11,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        {(
          [
            ['technique', 'Technique'],
            ['ecorche', 'Écorché Coupe'],
            ['realiste', 'Réaliste PBR'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            data-testid={`render-mode-${mode}`}
            onClick={() => onModeChange(mode)}
            style={{
              padding: '3px 8px',
              border: 'none',
              borderRadius: 4,
              backgroundColor: renderMode === mode ? 'var(--accent-primary, #3b82f6)' : 'transparent',
              color: renderMode === mode ? '#ffffff' : 'var(--text-secondary, #9ca3af)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: renderMode === mode ? 600 : 400,
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {renderMode === 'realiste' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderLeft: '1px solid var(--border-subtle, #2d323e)',
            paddingLeft: 6,
            marginLeft: 2,
          }}
        >
          <span style={{ color: 'var(--text-muted, #6b7280)', fontSize: 10 }}>Soleil</span>
          <input
            type="range"
            min={6}
            max={20}
            step={0.5}
            value={sunHour}
            data-testid="sun-hour-slider"
            onChange={(e) => onSunHourChange(parseFloat(e.target.value))}
            style={{ width: 60, height: 4, cursor: 'pointer' }}
            title={`Heure solaire : ${Math.floor(sunHour)}h${Math.round((sunHour % 1) * 60).toString().padStart(2, '0')}`}
          />
          <span style={{ minWidth: 26, fontSize: 10, color: 'var(--text-secondary, #9ca3af)' }}>
            {Math.floor(sunHour)}h
          </span>
        </div>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderLeft: '1px solid var(--border-subtle, #2d323e)',
          paddingLeft: 6,
          marginLeft: 2,
          cursor: 'pointer',
          fontSize: 10,
          color: 'var(--text-secondary, #9ca3af)',
        }}
      >
        <input
          type="checkbox"
          checked={showEdges}
          data-testid="toggle-edges-checkbox"
          onChange={onToggleEdges}
          style={{ cursor: 'pointer', margin: 0 }}
        />
        Arêtes fines
      </label>
    </div>
  );
}
