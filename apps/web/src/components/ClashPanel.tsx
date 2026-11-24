import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Search, Zap } from 'lucide-react';
import {
  type BimDocument,
  type ClashResult,
  detectClashes,
} from '@tabax/core';
import { exportClashesToCsv } from './clash/clashUtils.js';
import { ClashPresentation } from './clash/ClashPresentation.js';

export interface ClashPanelProps {
  readonly doc: BimDocument;
  readonly embedded?: boolean;
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
  readonly onSelectClash?: (clash: ClashResult) => void;
  readonly onClashesChanged?: (clashes: readonly ClashResult[]) => void;
  readonly onSelectLevel?: (levelId: string) => void;
  readonly onFocusPoint?: (point: { readonly x: number; readonly y: number; readonly z: number }) => void;
  readonly onLocate2D?: (point: { readonly x: number; readonly y: number }, levelId?: string) => void;
  readonly onOpenDedicatedView?: () => void;
}

/**
 * Panneau de Détection et d'Inspection des Conflits Géométriques BIM (Phase 9.4 / ADR-071).
 * Délègue les filtres, le tableau et la fiche d'inspection à ClashPresentation.
 */
export function ClashPanel({
  doc,
  embedded = false,
  isCollapsed = true,
  onToggleCollapse,
  onSelectClash,
  onClashesChanged,
  onSelectLevel,
  onFocusPoint,
  onLocate2D,
  onOpenDedicatedView,
}: ClashPanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);
  const [clashes, setClashes] = useState<readonly ClashResult[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);

  const collapsed = onToggleCollapse ? isCollapsed : internalCollapsed;
  const toggleCollapse = onToggleCollapse ?? (() => setInternalCollapsed((prev) => !prev));

  const handleRunDetection = useCallback(() => {
    const results = detectClashes(doc.getState());
    setClashes(results);
    setHasAnalyzed(true);
    setSelectedClashId(null);
    onClashesChanged?.(results);
  }, [doc, onClashesChanged]);

  const handleClear = useCallback(() => {
    setClashes([]);
    setHasAnalyzed(false);
    setSelectedClashId(null);
    onClashesChanged?.([]);
  }, [onClashesChanged]);

  const hardCount = useMemo(() => clashes.filter((c) => c.severity === 'hard').length, [clashes]);
  const clearanceCount = useMemo(
    () => clashes.filter((c) => c.severity === 'clearance').length,
    [clashes],
  );

  const handleExportCsv = useCallback(() => {
    exportClashesToCsv(clashes, doc.getState());
  }, [clashes, doc]);

  return (
    <div
      data-testid="clash-panel"
      style={{
        position: embedded ? 'relative' : 'fixed',
        left: embedded ? undefined : '20px',
        bottom: embedded ? undefined : '36px',
        width: embedded ? '100%' : '520px',
        height: embedded && !collapsed ? '100%' : undefined,
        maxHeight: embedded ? 'none' : collapsed ? '44px' : '460px',
        backgroundColor: 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderRadius: embedded ? 0 : '8px 8px 0 0',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.35)',
        zIndex: embedded ? 'auto' : 40,
        display: 'flex',
        flexDirection: 'column',
        transition: 'max-height 0.25s ease-in-out',
        border: '1px solid var(--border-subtle)',
        borderBottom: embedded ? '1px solid var(--border-subtle)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* En-tête cliquable */}
      <div
        data-testid="clash-panel-header"
        onClick={toggleCollapse}
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          backgroundColor: 'var(--bg-canvas-chrome)',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={16} strokeWidth={1.75} />
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Détection des Conflits</span>
          {hasAnalyzed && (
            <div style={{ display: 'flex', gap: '6px', marginLeft: '6px' }}>
              <span
                data-testid="hard-clash-badge"
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}
              >
                {hardCount} Hard
              </span>
              <span
                data-testid="clearance-clash-badge"
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#111827',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}
              >
                {clearanceCount} Clearance
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {collapsed ? 'Déplier' : 'Réduire'}
          </span>
        </div>
      </div>

      {/* Contenu déployé */}
      {!collapsed && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px',
            gap: '10px',
          }}
        >
          {/* Raccourci vers l'Espace Dédié Conflits */}
          {onOpenDedicatedView && (
            <button
              type="button"
              data-testid="open-dedicated-clash-workspace-btn"
              onClick={onOpenDedicatedView}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Maximize2 size={13} />
              Ouvrir l'Espace Coordination Plein Écran
            </button>
          )}

          {/* Barre d'actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                data-testid="run-clash-btn"
                onClick={handleRunDetection}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Search size={14} strokeWidth={1.75} /> Analyser
              </button>

              {hasAnalyzed && (
                <button
                  type="button"
                  data-testid="clear-clash-btn"
                  onClick={handleClear}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#4b5563',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Effacer
                </button>
              )}

              {clashes.length > 0 && (
                <button
                  type="button"
                  data-testid="export-clash-csv-btn"
                  onClick={handleExportCsv}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {/* Présentation unifiée (Tableau, filtres, fiche détaillée) */}
          <ClashPresentation
            layout="dock"
            doc={doc}
            clashes={clashes}
            selectedClashId={selectedClashId}
            onSelectClashId={setSelectedClashId}
            onSelectClash={onSelectClash}
            onSelectLevel={onSelectLevel}
            onFocusPoint={onFocusPoint}
            onLocate2D={onLocate2D}
            hasAnalyzed={hasAnalyzed}
          />
        </div>
      )}
    </div>
  );
}
