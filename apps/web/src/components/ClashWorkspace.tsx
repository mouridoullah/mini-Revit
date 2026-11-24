import { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  Download,
  MapPin,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  type BimDocument,
  type BimState,
  type ClashResult,
  type ClashSeverity,
  detectClashes,
} from '@tabax/core';
import styles from './Cockpit.module.css';

export interface ClashWorkspaceProps {
  readonly doc: BimDocument;
  readonly clashes: readonly ClashResult[];
  readonly onClashesChanged: (clashes: readonly ClashResult[]) => void;
  readonly onSelectClash?: (clash: ClashResult) => void;
  readonly onFocusPoint3D: (point: { readonly x: number; readonly y: number; readonly z: number }) => void;
  readonly onLocate2D: (point: { readonly x: number; readonly y: number }, levelId?: string) => void;
  readonly viewport3D: ReactNode;
  readonly viewport2D: ReactNode;
  readonly onClose?: () => void;
}

export type DisciplineFilter = 'all' | 'mep-structure' | 'mep-architecture' | 'mep-mep';

interface ElementInfo {
  readonly name: string;
  readonly category: string;
  readonly discipline: string;
  readonly levelName: string;
  readonly levelId?: string | undefined;
}

function getElementInfo(state: BimState, id: string): ElementInfo {
  if (state.walls[id]) {
    const w = state.walls[id];
    const lvlName = (w && state.levels[w.levelId]?.name) ?? w?.levelId ?? 'N/A';
    const typeName = (w && state.wallTypes?.[w.typeId]?.name) ?? w?.typeId ?? 'Mur';
    return {
      name: `Mur (${typeName})`,
      category: 'Mur architectural',
      discipline: 'Architecture / Structure',
      levelName: lvlName,
      levelId: w?.levelId,
    };
  }
  if (state.slabs?.[id]) {
    const s = state.slabs[id];
    const lvlName = (s && state.levels[s.levelId]?.name) ?? s?.levelId ?? 'N/A';
    const typeName = (s && state.slabTypes?.[s.slabTypeId]?.name) ?? s?.slabTypeId ?? 'Dalle';
    return {
      name: `Dalle (${typeName})`,
      category: 'Plancher / Dalle béton',
      discipline: 'Structure',
      levelName: lvlName,
      levelId: s?.levelId,
    };
  }
  if (state.pipes?.[id]) {
    const p = state.pipes[id];
    const sys = p?.systemId ? state.mepSystems?.[p.systemId] : undefined;
    const sysName = sys?.name ?? sys?.id ?? 'Canalisation';
    return {
      name: `Tuyau Ø${p ? Math.round(p.diameter) : 0} mm (${sysName})`,
      category: 'Canalisation hydronique / plomberie',
      discipline: 'MEP (Fluides)',
      levelName: 'Niveau MEP',
    };
  }
  if (state.ducts?.[id]) {
    const d = state.ducts[id];
    const sys = d?.systemId ? state.mepSystems?.[d.systemId] : undefined;
    const sysName = sys?.name ?? sys?.id ?? 'Gaine aéraulique';
    return {
      name: `Gaine ${d ? `${Math.round(d.width ?? 0)}x${Math.round(d.height ?? 0)}` : ''} mm (${sysName})`,
      category: 'Gaine de ventilation / désenfumage',
      discipline: 'MEP (Aéraulique)',
      levelName: 'Niveau MEP',
    };
  }
  if (state.cableTrays?.[id]) {
    const t = state.cableTrays[id];
    const sys = t?.systemId ? state.mepSystems?.[t.systemId] : undefined;
    const sysName = sys?.name ?? sys?.id ?? 'Chemin de câbles';
    return {
      name: `Chemin de câbles ${t ? `${Math.round(t.width ?? 0)}x${Math.round(t.height ?? 0)}` : ''} mm (${sysName})`,
      category: 'Cheminement CFO / CFA',
      discipline: 'MEP (Électricité)',
      levelName: 'Niveau MEP',
    };
  }
  return {
    name: id,
    category: 'Composant générique',
    discipline: 'BIM / Coordination',
    levelName: 'N/A',
  };
}

export function ClashWorkspace({
  doc,
  clashes,
  onClashesChanged,
  onSelectClash,
  onFocusPoint3D,
  onLocate2D,
  viewport3D,
  viewport2D,
  onClose,
}: ClashWorkspaceProps) {
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | ClashSeverity>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rightViewMode, setRightViewMode] = useState<'3d' | '2d'>('3d');
  const [isDetecting, setIsDetecting] = useState(false);

  const handleRunDetection = useCallback(() => {
    setIsDetecting(true);
    try {
      const results = detectClashes(doc.getState());
      onClashesChanged(results);
      if (results.length > 0) {
        const first = results[0];
        if (first) {
          setSelectedClashId(first.id);
          onFocusPoint3D(first.point);
          onSelectClash?.(first);
        }
      } else {
        setSelectedClashId(null);
      }
    } finally {
      setIsDetecting(false);
    }
  }, [doc, onClashesChanged, onFocusPoint3D, onSelectClash]);

  const handleClear = useCallback(() => {
    onClashesChanged([]);
    setSelectedClashId(null);
  }, [onClashesChanged]);

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
        const query = searchQuery.toLowerCase();
        const matchesA = c.elementA.toLowerCase().includes(query) || c.categoryA.toLowerCase().includes(query);
        const matchesB = c.elementB.toLowerCase().includes(query) || c.categoryB.toLowerCase().includes(query);
        const matchesId = c.id.toLowerCase().includes(query);
        if (!matchesA && !matchesB && !matchesId) return false;
      }
      return true;
    });
  }, [clashes, severityFilter, disciplineFilter, searchQuery]);

  const hardCount = useMemo(() => clashes.filter((c) => c.severity === 'hard').length, [clashes]);
  const clearanceCount = useMemo(
    () => clashes.filter((c) => c.severity === 'clearance').length,
    [clashes],
  );

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
  }, [selectedClash, doc]);

  const handleSelectClash = (clash: ClashResult) => {
    setSelectedClashId(clash.id);
    onFocusPoint3D(clash.point);
    onSelectClash?.(clash);
  };

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
    link.download = `synthese-conflits-bim-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredClashes]);

  return (
    <div
      data-testid="clash-workspace"
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-canvas-chrome, #0b1120)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Volet Gauche : Centre de Contrôle & Coordination (Largeur 520px) */}
      <div
        data-testid="clash-panel"
        style={{
          width: '520px',
          flex: '0 0 520px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface, #111827)',
          overflow: 'hidden',
          zIndex: 3,
        }}
      >
        {/* En-tête Spacieux */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated, #1f2937)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary, #ffffff)',
                  letterSpacing: '-0.01em',
                }}
              >
                Coordination BIM & Conflits
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9ca3af)', marginTop: '2px' }}>
                Détection géométrique BVH/SAT & Tolérances
              </div>
            </div>
          </div>

          {/* Badges de synthèse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              data-testid="workspace-hard-badge"
              style={{
                padding: '3px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: hardCount > 0 ? '#ef4444' : '#374151',
                color: '#ffffff',
              }}
            >
              {hardCount} Hard
            </span>
            <span
              data-testid="workspace-clearance-badge"
              style={{
                padding: '3px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: clearanceCount > 0 ? '#f59e0b' : '#374151',
                color: '#ffffff',
              }}
            >
              {clearanceCount} Clearance
            </span>
            {onClose && (
              <button
                type="button"
                data-testid="close-clash-workspace-btn"
                onClick={onClose}
                title="Quitter l'espace dédié de coordination"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  marginLeft: '4px',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Barre d'actions & Outils */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: 'var(--bg-canvas-chrome, #111827)',
          }}
        >
          {/* Boutons d'analyse */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              data-testid="run-clash-btn"
              onClick={handleRunDetection}
              disabled={isDetecting}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
              }}
            >
              <RefreshCw size={14} className={isDetecting ? styles.spinIcon : undefined} />
              {isDetecting ? 'Analyse en cours...' : 'Lancer la détection des conflits'}
            </button>

            {clashes.length > 0 && (
              <>
                <button
                  type="button"
                  data-testid="workspace-clear-btn"
                  onClick={handleClear}
                  title="Effacer la liste des conflits"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  data-testid="workspace-export-csv-btn"
                  onClick={handleExportCsv}
                  title="Exporter le rapport d'interférences en CSV"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} />
                  CSV
                </button>
              </>
            )}
          </div>

          {/* Filtres & Recherche */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              data-testid="workspace-severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | ClashSeverity)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '11px',
              }}
            >
              <option value="all">Toutes sévérités</option>
              <option value="hard">Hard (Collisions physiques)</option>
              <option value="clearance">Clearance (Défauts de garde)</option>
            </select>

            <select
              data-testid="workspace-discipline-filter"
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value as DisciplineFilter)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '11px',
              }}
            >
              <option value="all">Toutes disciplines</option>
              <option value="mep-structure">MEP ↔ Structure</option>
              <option value="mep-architecture">MEP ↔ Architecture</option>
              <option value="mep-mep">MEP ↔ MEP</option>
            </select>
          </div>

          <div style={{ position: 'relative' }}>
            <Search
              size={14}
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
              placeholder="Filtrer par nom de réseau, tuyau, mur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px 6px 28px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '11px',
              }}
            />
          </div>
        </div>

        {/* Table / Liste des Conflits */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredClashes.length === 0 ? (
            <div
              data-testid="no-clashes-msg"
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px',
              }}
            >
              {clashes.length === 0 ? (
                <div>
                  <AlertTriangle size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <div>Aucune analyse de coordination active.</div>
                  <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
                    Cliquez sur "Lancer la détection" pour scanner les interférences.
                  </div>
                </div>
              ) : (
                <div>Aucun conflit ne correspond aux critères de filtre sélectionnés.</div>
              )}
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
                <tr
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border-subtle)',
                    textAlign: 'left',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <th style={{ padding: '8px 12px', width: '56px' }}>Type</th>
                  <th style={{ padding: '8px 10px' }}>Interférence</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>Pénétration</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', width: '85px' }}>Position</th>
                </tr>
              </thead>
              <tbody>
                {filteredClashes.map((c) => {
                  const isSelected = c.id === selectedClashId;
                  return (
                    <tr
                      key={c.id}
                      data-testid={`workspace-clash-row-${c.id}`}
                      onClick={() => handleSelectClash(c)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected
                          ? 'rgba(37, 99, 235, 0.18)'
                          : 'transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                        borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '9px',
                            fontWeight: 700,
                            backgroundColor: c.severity === 'hard' ? '#ef4444' : '#f59e0b',
                            color: '#ffffff',
                            textTransform: 'uppercase',
                          }}
                        >
                          {c.severity}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.elementA} ↔ {c.elementB}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {c.disciplineA} ↔ {c.disciplineB}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#f87171' }}>
                        {Math.round(c.penetrationDepthMm)} mm
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        Z={Math.round(c.point.z)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Fiche d'inspection détaillée du conflit sélectionné */}
        {selectedClash && selectedElementInfo && (
          <div
            data-testid="workspace-clash-detail"
            style={{
              padding: '14px 16px',
              borderTop: '2px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Titre & Sévérité */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: selectedClash.severity === 'hard' ? '#ef4444' : '#f59e0b',
                    color: '#ffffff',
                    textTransform: 'uppercase',
                  }}
                >
                  {selectedClash.severity === 'hard' ? 'Collision Physique' : 'Défaut de garde'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Pénétration : {Math.round(selectedClash.penetrationDepthMm)} mm
                </span>
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                X={Math.round(selectedClash.point.x)} Y={Math.round(selectedClash.point.y)} Z={Math.round(selectedClash.point.z)} mm
              </span>
            </div>

            {/* Cartes Éléments A et B */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>
                  Élément A • {selectedElementInfo.infoA.discipline}
                </div>
                <div style={{ fontWeight: 600, fontSize: '12px', marginTop: '3px', color: 'var(--text-primary)' }}>
                  {selectedElementInfo.infoA.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedElementInfo.infoA.category}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Niveau : {selectedElementInfo.infoA.levelName}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                  Élément B • {selectedElementInfo.infoB.discipline}
                </div>
                <div style={{ fontWeight: 600, fontSize: '12px', marginTop: '3px', color: 'var(--text-primary)' }}>
                  {selectedElementInfo.infoB.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedElementInfo.infoB.category}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Niveau : {selectedElementInfo.infoB.levelName}
                </div>
              </div>
            </div>

            {/* Boutons d'Action Réactifs */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
              <button
                type="button"
                data-testid="workspace-center-3d-btn"
                onClick={() => {
                  setRightViewMode('3d');
                  onFocusPoint3D(selectedClash.point);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: '#374151',
                  color: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <Camera size={14} />
                Centrer la Caméra 3D
              </button>

              <button
                type="button"
                data-testid="workspace-locate-2d-btn"
                onClick={() => {
                  const lvlId = selectedElementInfo.infoA.levelId ?? selectedElementInfo.infoB.levelId;
                  setRightViewMode('2d');
                  onLocate2D({ x: selectedClash.point.x, y: selectedClash.point.y }, lvlId);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <MapPin size={14} />
                Localiser sur le Plan 2D
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Volet Droit : Viewport Interactif Couplé (Flex 1) */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Barre de contrôle de la vue droite */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px',
            borderRadius: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            data-testid="workspace-switch-3d-btn"
            aria-pressed={rightViewMode === '3d'}
            onClick={() => setRightViewMode('3d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: rightViewMode === '3d' ? '#2563eb' : 'transparent',
              color: rightViewMode === '3d' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Vue 3D
          </button>
          <button
            type="button"
            data-testid="workspace-switch-2d-btn"
            aria-pressed={rightViewMode === '2d'}
            onClick={() => setRightViewMode('2d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: rightViewMode === '2d' ? '#2563eb' : 'transparent',
              color: rightViewMode === '2d' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Plan 2D
          </button>
        </div>

        {/* Viewport Effectif */}
        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
          {rightViewMode === '3d' ? viewport3D : viewport2D}
        </div>
      </div>
    </div>
  );
}
