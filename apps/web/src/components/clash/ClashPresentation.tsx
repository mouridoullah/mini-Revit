/**
 * ClashPresentation
 *
 * Composant de présentation réutilisable pour la coordination des conflits BIM (ADR-071, ADR-072).
 * Unifie les filtres, la table des interférences et la fiche détaillée d'inspection
 * entre ClashPanel (panneau rétractable) et ClashWorkspace (cockpit plein écran).
 */

import { useState, useMemo } from 'react';
import { Camera, MapPin, X } from 'lucide-react';
import type { BimDocument, ClashResult, ClashSeverity } from '@tabax/core';
import {
  type DisciplineFilter,
  getElementInfo,
  formatSeverityLabel,
  getSeverityColor,
} from './clashUtils.js';

export interface ClashPresentationProps {
  readonly doc: BimDocument;
  readonly clashes: readonly ClashResult[];
  readonly selectedClashId: string | null;
  readonly onSelectClashId: (clashId: string | null) => void;
  readonly onFocusPoint?: (point: { readonly x: number; readonly y: number; readonly z: number }) => void;
  readonly onLocate2D?: (point: { readonly x: number; readonly y: number }, levelId?: string) => void;
  readonly onSelectClash?: (clash: ClashResult) => void;
  readonly onSelectLevel?: (levelId: string) => void;
  readonly layout: 'dock' | 'workspace';
  readonly extraFilters?: React.ReactNode;
}

export function ClashPresentation({
  doc,
  clashes,
  selectedClashId,
  onSelectClashId,
  onFocusPoint,
  onLocate2D,
  onSelectClash,
  onSelectLevel,
  layout,
  extraFilters,
}: ClashPresentationProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | ClashSeverity>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');

  const selectedClash = useMemo(
    () => clashes.find((c) => c.id === selectedClashId) ?? null,
    [clashes, selectedClashId],
  );

  const selectedElementInfo = useMemo(() => {
    if (!selectedClash) return null;
    const state = doc.getState();
    return {
      infoA: getElementInfo(state, selectedClash.elementA),
      infoB: getElementInfo(state, selectedClash.elementB),
    };
  }, [doc, selectedClash]);

  const filteredClashes = useMemo(() => {
    return clashes.filter((c) => {
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
      if (disciplineFilter !== 'all') {
        const discA = c.disciplineA;
        const discB = c.disciplineB;
        if (disciplineFilter === 'mep-structure') {
          const match =
            (discA === 'mep' && discB === 'structure') ||
            (discA === 'structure' && discB === 'mep');
          if (!match) return false;
        } else if (disciplineFilter === 'mep-architecture') {
          const match =
            (discA === 'mep' && discB === 'architecture') ||
            (discA === 'architecture' && discB === 'mep');
          if (!match) return false;
        } else if (disciplineFilter === 'mep-mep') {
          if (discA !== 'mep' || discB !== 'mep') return false;
        }
      }
      return true;
    });
  }, [clashes, severityFilter, disciplineFilter]);

  const handleRowClick = (clash: ClashResult) => {
    onSelectClashId(clash.id);
    onSelectClash?.(clash);
    if (layout === 'dock') {
      const state = doc.getState();
      const levelId =
        state.walls[clash.elementA]?.levelId ??
        state.pipes?.[clash.elementA]?.levelId ??
        state.ducts?.[clash.elementA]?.levelId ??
        state.cableTrays?.[clash.elementA]?.levelId ??
        state.slabs?.[clash.elementA]?.levelId;
      if (levelId && onSelectLevel) {
        onSelectLevel(levelId);
      }
      onFocusPoint?.(clash.point);
    }
  };

  const handleFocus3D = () => {
    if (!selectedClash) return;
    onFocusPoint?.(selectedClash.point);
  };

  const handleLocate2D = () => {
    if (!selectedClash || !selectedElementInfo) return;
    const levelId = selectedElementInfo.infoA.levelId ?? selectedElementInfo.infoB.levelId;
    if (levelId && onSelectLevel) {
      onSelectLevel(levelId);
    }
    onLocate2D?.({ x: selectedClash.point.x, y: selectedClash.point.y }, levelId);
  };

  const isDock = layout === 'dock';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
      {/* 1. Barre de filtres */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: '11px',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>Sévérité :</span>
          <select
            data-testid="severity-filter"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | ClashSeverity)}
            style={{
              padding: '2px 4px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-canvas)',
              color: 'var(--text-primary)',
              fontSize: '11px',
            }}
          >
            <option value="all">Toutes ({clashes.length})</option>
            <option value="hard">
              Hard clash ({clashes.filter((c) => c.severity === 'hard').length})
            </option>
            <option value="clearance">
              Gabarit / Clearance ({clashes.filter((c) => c.severity === 'clearance').length})
            </option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>Discipline :</span>
          <select
            data-testid="discipline-filter"
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value as DisciplineFilter)}
            style={{
              padding: '2px 4px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-canvas)',
              color: 'var(--text-primary)',
              fontSize: '11px',
            }}
          >
            <option value="all">Toutes</option>
            <option value="mep-structure">MEP vs Structure</option>
            <option value="mep-architecture">MEP vs Architecture</option>
            <option value="mep-mep">MEP vs MEP</option>
          </select>
        </label>

        {extraFilters}
      </div>

      {/* 2. Tableau des conflits */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        {filteredClashes.length === 0 ? (
          <div
            data-testid="no-clashes-msg"
            style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}
          >
            Aucun conflit ne correspond aux filtres actifs.
          </div>
        ) : (
          <table
            data-testid="clash-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '11px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                }}
              >
                <th style={{ padding: '6px 8px' }}>Type</th>
                <th style={{ padding: '6px 8px' }}>Élément A</th>
                <th style={{ padding: '6px 8px' }}>Élément B</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Distance</th>
              </tr>
            </thead>
            <tbody>
              {filteredClashes.map((c) => {
                const isSelected = c.id === selectedClashId;
                const rowTestId = isDock ? `clash-row-${c.id}` : `workspace-clash-row-${c.id}`;
                return (
                  <tr
                    key={c.id}
                    data-testid={rowTestId}
                    onClick={() => handleRowClick(c)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '6px 8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: `${getSeverityColor(c.severity)}22`,
                          color: getSeverityColor(c.severity),
                        }}
                      >
                        {formatSeverityLabel(c.severity)}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.elementA}
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.elementB}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(c.penetrationDepthMm)} mm
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Fiche détaillée d'inspection (quand un conflit est sélectionné) */}
      {selectedClash && selectedElementInfo && (
        <div
          data-testid={isDock ? 'clash-detail-card' : 'workspace-clash-detail'}
          style={{
            padding: '10px',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-card)',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Fiche Conflit : {formatSeverityLabel(selectedClash.severity)}
            </span>
            <button
              type="button"
              data-testid="close-clash-detail-btn"
              onClick={() => onSelectClashId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isDock ? '1fr' : '1fr 1fr', gap: '8px' }}>
            <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Élément A : {selectedElementInfo.infoA.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Catégorie : {selectedElementInfo.infoA.category}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Étage : {selectedElementInfo.infoA.levelName}</div>
            </div>
            <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Élément B : {selectedElementInfo.infoB.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Catégorie : {selectedElementInfo.infoB.category}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Étage : {selectedElementInfo.infoB.levelName}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              data-testid={isDock ? 'center-3d-cam-btn' : 'workspace-center-3d-btn'}
              onClick={handleFocus3D}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-canvas)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              <Camera size={13} /> Cibler 3D
            </button>
            <button
              type="button"
              data-testid={isDock ? 'locate-2d-plan-btn' : 'workspace-locate-2d-btn'}
              onClick={handleLocate2D}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-canvas)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              <MapPin size={13} /> Localiser 2D
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
