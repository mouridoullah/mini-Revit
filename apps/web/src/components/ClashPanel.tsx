import { useState, useMemo, useCallback } from 'react';
import {
  type BimDocument,
  type ClashResult,
  type ClashSeverity,
  detectClashes,
} from '@mini-bim/core';

export interface ClashPanelProps {
  readonly doc: BimDocument;
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
  readonly onSelectClash?: (clash: ClashResult) => void;
  readonly onClashesChanged?: (clashes: readonly ClashResult[]) => void;
}

export type DisciplineFilter = 'all' | 'mep-structure' | 'mep-architecture' | 'mep-mep';

/**
 * Panneau de Détection et d'Inspection des Conflits Géométriques BIM (Phase 9.4).
 * Permet l'analyse broad-phase/narrow-phase à la demande, le filtrage par sévérité/discipline,
 * la sélection croisée d'éléments et le cadrage orbital 3D automatique.
 */
export function ClashPanel({
  doc,
  isCollapsed = true,
  onToggleCollapse,
  onSelectClash,
  onClashesChanged,
}: ClashPanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);
  const [clashes, setClashes] = useState<readonly ClashResult[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | ClashSeverity>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);

  const collapsed = onToggleCollapse ? isCollapsed : internalCollapsed;
  const toggleCollapse = onToggleCollapse ?? (() => setInternalCollapsed((prev) => !prev));

  // Synchronise le repli interne si la prop isCollapsed change
  if (onToggleCollapse === undefined && internalCollapsed !== isCollapsed) {
    // Si la prop externe a changé sans handler, adopter la prop
    // ou synchroniser via useEffect
  }

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

  // Filtrage combiné par sévérité et discipline
  const filteredClashes = useMemo(() => {
    return clashes.filter((c) => {
      if (severityFilter !== 'all' && c.severity !== severityFilter) {
        return false;
      }
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

  const hardCount = useMemo(() => clashes.filter((c) => c.severity === 'hard').length, [clashes]);
  const clearanceCount = useMemo(
    () => clashes.filter((c) => c.severity === 'clearance').length,
    [clashes],
  );

  const handleExportCsv = useCallback(() => {
    const lines = [
      'ID,Sévérité,Discipline A,Élément A,Catégorie A,Discipline B,Élément B,Catégorie B,Pénétration (mm),X (mm),Y (mm),Z (mm)',
    ];
    for (const c of filteredClashes) {
      lines.push(
        `"${c.id}","${c.severity}","${c.disciplineA}","${c.elementA}","${c.categoryA}","${c.disciplineB}","${c.elementB}","${c.categoryB}",${Math.round(c.penetrationDepthMm)},${Math.round(c.point.x)},${Math.round(c.point.y)},${Math.round(c.point.z)}`,
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-conflits-bim-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredClashes]);

  return (
    <div
      data-testid="clash-panel"
      style={{
        position: 'fixed',
        left: '20px',
        bottom: '36px',
        width: '520px',
        maxHeight: collapsed ? '44px' : '460px',
        backgroundColor: '#1f2937',
        color: '#f3f4f6',
        borderRadius: '8px 8px 0 0',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.35)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        transition: 'max-height 0.25s ease-in-out',
        border: '1px solid #374151',
        borderBottom: 'none',
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
          backgroundColor: '#111827',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid #374151',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>⚡</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>
            Détection des Conflits
          </span>
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
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {collapsed ? '▲ Déplier' : '▼ Réduire'}
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
            overflow: 'hidden',
            padding: '12px',
            gap: '10px',
          }}
        >
          {/* Barre d'actions et filtres */}
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
                <span>🔍</span> Analyser
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

              {filteredClashes.length > 0 && (
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

            {hasAnalyzed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                <select
                  data-testid="severity-filter"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as 'all' | ClashSeverity)}
                  style={{
                    padding: '4px 6px',
                    backgroundColor: '#374151',
                    color: '#f9fafb',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    outline: 'none',
                  }}
                >
                  <option value="all">Toutes sévérités</option>
                  <option value="hard">Hard clashes</option>
                  <option value="clearance">Clearances</option>
                </select>

                <select
                  data-testid="discipline-filter"
                  value={disciplineFilter}
                  onChange={(e) => setDisciplineFilter(e.target.value as DisciplineFilter)}
                  style={{
                    padding: '4px 6px',
                    backgroundColor: '#374151',
                    color: '#f9fafb',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    outline: 'none',
                  }}
                >
                  <option value="all">Toutes disciplines</option>
                  <option value="mep-structure">MEP ↔ Structure</option>
                  <option value="mep-architecture">MEP ↔ Architecture</option>
                  <option value="mep-mep">MEP ↔ MEP</option>
                </select>
              </div>
            )}
          </div>

          {/* Tableau / Liste de résultats */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: '4px',
              border: '1px solid #374151',
              backgroundColor: '#111827',
              minHeight: '160px',
            }}
          >
            {!hasAnalyzed ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '12px',
                }}
              >
                Cliquez sur <strong>Analyser</strong> pour lancer la détection des conflits sur le modèle actif.
              </div>
            ) : filteredClashes.length === 0 ? (
              <div
                data-testid="no-clashes-msg"
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                ✓ Aucun conflit détecté pour ces critères.
              </div>
            ) : (
              <table
                data-testid="clash-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '11px',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#1f2937', color: '#9ca3af', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>Interférence</th>
                    <th style={{ padding: '6px 8px' }}>Pénétration</th>
                    <th style={{ padding: '6px 8px' }}>Coordonnées (X, Y, Z)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClashes.map((c) => {
                    const isSelected = selectedClashId === c.id;
                    const isHard = c.severity === 'hard';
                    return (
                      <tr
                        key={c.id}
                        data-testid={`clash-row-${c.id}`}
                        onClick={() => {
                          setSelectedClashId(c.id);
                          onSelectClash?.(c);
                        }}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected
                            ? '#374151'
                            : 'transparent',
                          borderTop: '1px solid #1f2937',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <td style={{ padding: '6px 8px' }}>
                          <span
                            style={{
                              backgroundColor: isHard ? '#ef4444' : '#f59e0b',
                              color: isHard ? '#ffffff' : '#111827',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {c.severity}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ fontWeight: 600, color: '#f3f4f6' }}>
                            {c.categoryA} ({c.elementA}) ↔ {c.categoryB} ({c.elementB})
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '10px' }}>
                            {c.disciplineA} ↔ {c.disciplineB}
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#e5e7eb', fontWeight: 600 }}>
                          {Math.round(c.penetrationDepthMm)} mm
                        </td>
                        <td style={{ padding: '6px 8px', color: '#9ca3af', fontFamily: 'monospace' }}>
                          ({Math.round(c.point.x)}, {Math.round(c.point.y)}, {Math.round(c.point.z)})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
