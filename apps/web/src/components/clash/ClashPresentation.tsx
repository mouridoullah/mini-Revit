/**
 * ClashPresentation
 *
 * Composant de présentation réutilisable pour la coordination des conflits BIM (ADR-071, ADR-072).
 * Unifie les filtres, la table des interférences et la fiche détaillée d'inspection
 * entre ClashPanel (panneau rétractable) et ClashWorkspace (cockpit plein écran).
 */

import { useState, useMemo } from 'react';
import { Camera, MapPin, Search, X } from 'lucide-react';
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
  readonly onFocusPoint?: ((point: { readonly x: number; readonly y: number; readonly z: number }) => void) | undefined;
  readonly onLocate2D?: ((point: { readonly x: number; readonly y: number }, levelId?: string) => void) | undefined;
  readonly onSelectClash?: ((clash: ClashResult) => void) | undefined;
  readonly onSelectLevel?: ((levelId: string) => void) | undefined;
  readonly layout: 'dock' | 'workspace';
  readonly extraFilters?: React.ReactNode | undefined;
  readonly hasAnalyzed?: boolean | undefined;
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
  hasAnalyzed = true,
}: ClashPresentationProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | ClashSeverity>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const match =
          c.elementA.toLowerCase().includes(q) ||
          c.elementB.toLowerCase().includes(q) ||
          c.categoryA.toLowerCase().includes(q) ||
          c.categoryB.toLowerCase().includes(q) ||
          c.disciplineA.toLowerCase().includes(q) ||
          c.disciplineB.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [clashes, severityFilter, disciplineFilter, searchQuery]);

  const handleRowClick = (clash: ClashResult) => {
    onSelectClashId(clash.id);
    onSelectClash?.(clash);
    if (layout === 'workspace') {
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
      {hasAnalyzed && (
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
              data-testid={isDock ? 'severity-filter' : 'workspace-severity-filter'}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | ClashSeverity)}
              style={{
                padding: '3px 6px',
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
              data-testid={isDock ? 'discipline-filter' : 'workspace-discipline-filter'}
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value as DisciplineFilter)}
              style={{
                padding: '3px 6px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-canvas)',
                color: 'var(--text-primary)',
                fontSize: '11px',
              }}
            >
              <option value="all">Toutes disciplines</option>
              <option value="mep-structure">MEP ↔ Structure</option>
              <option value="mep-architecture">MEP ↔ Architecture</option>
              <option value="mep-mep">MEP ↔ MEP</option>
            </select>
          </label>

          {!isDock && (
            <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                type="text"
                data-testid="workspace-search-input"
                placeholder="Filtrer par nom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '4px 8px 4px 26px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-canvas)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '11px',
                }}
              />
            </div>
          )}

          {extraFilters}
        </div>
      )}

      {/* 2. Tableau des conflits */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-card)',
          minHeight: '120px',
        }}
      >
        {!hasAnalyzed ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}
          >
            Cliquez sur <strong>Analyser</strong> pour lancer la détection des conflits sur le
            modèle actif.
          </div>
        ) : filteredClashes.length === 0 ? (
          <div
            data-testid="no-clashes-msg"
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--accent-success, #10b981)',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {clashes.length === 0
              ? 'Aucun conflit détecté pour ces critères.'
              : 'Aucun conflit ne correspond aux filtres actifs.'}
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
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Pénétration</th>
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
                      backgroundColor: isSelected ? 'var(--bg-active, rgba(37,99,235,0.15))' : 'transparent',
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
                      <div style={{ fontWeight: 600 }}>{c.elementA}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.categoryA} ({c.disciplineA})</div>
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{c.elementB}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.categoryB} ({c.disciplineB})</div>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
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
            padding: '12px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: `${getSeverityColor(selectedClash.severity)}22`,
                  color: getSeverityColor(selectedClash.severity),
                  textTransform: 'uppercase',
                }}
              >
                {formatSeverityLabel(selectedClash.severity)}
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Pénétration : {Math.round(selectedClash.penetrationDepthMm)} mm
              </span>
            </div>
            {isDock && (
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
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isDock ? '1fr' : '1fr 1fr', gap: '8px' }}>
            <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)' }}>
              <div style={{ fontWeight: 600, color: '#3b82f6' }}>Élément A : {selectedElementInfo.infoA.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '2px' }}>
                Catégorie : {selectedElementInfo.infoA.category} ({selectedElementInfo.infoA.discipline})
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Étage : {selectedElementInfo.infoA.levelName}</div>
            </div>
            <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)' }}>
              <div style={{ fontWeight: 600, color: '#10b981' }}>Élément B : {selectedElementInfo.infoB.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '2px' }}>
                Catégorie : {selectedElementInfo.infoB.category} ({selectedElementInfo.infoB.discipline})
              </div>
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
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-canvas)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                flex: 1,
              }}
            >
              <Camera size={13} /> {isDock ? 'Cibler 3D' : 'Centrer la Caméra 3D'}
            </button>
            <button
              type="button"
              data-testid={isDock ? 'locate-2d-plan-btn' : 'workspace-locate-2d-btn'}
              onClick={handleLocate2D}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                flex: 1,
              }}
            >
              <MapPin size={13} /> {isDock ? 'Localiser 2D' : 'Localiser sur le Plan 2D'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
