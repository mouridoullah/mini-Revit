import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Search, X, Zap } from 'lucide-react';
import {
  type BimDocument,
  type BimState,
  type ClashResult,
  type ClashSeverity,
  detectClashes,
} from '@tabax/core';

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

export type DisciplineFilter = 'all' | 'mep-structure' | 'mep-architecture' | 'mep-mep';

interface ElementInfo {
  readonly name: string;
  readonly category: string;
  readonly discipline: string;
  readonly levelName: string;
  readonly levelId?: string | undefined;
}

function getElementInfo(state: BimState, id: string): ElementInfo {
  // Murs
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
  // Dalles
  if (state.slabs?.[id]) {
    const s = state.slabs[id];
    const lvlName = (s && state.levels[s.levelId]?.name) ?? s?.levelId ?? 'N/A';
    const typeName = (s && state.slabTypes?.[s.slabTypeId]?.name) ?? s?.slabTypeId ?? 'Dalle';
    return {
      name: `Dalle (${typeName})`,
      category: 'Dalle horizontale',
      discipline: 'Structure',
      levelName: lvlName,
      levelId: s?.levelId,
    };
  }
  // Tuyaux
  if (state.pipes?.[id]) {
    const p = state.pipes[id];
    const lvlName = (p?.levelId && state.levels[p.levelId]?.name) ?? p?.levelId ?? 'N/A';
    const sysName = (p?.systemId && state.mepSystems?.[p.systemId]?.name) ?? p?.systemId ?? 'MEP';
    return {
      name: `Tuyau Ø${p?.diameter ?? 0} mm (${sysName})`,
      category: 'Canalisation hydronique / plomberie',
      discipline: 'MEP',
      levelName: lvlName,
      levelId: p?.levelId,
    };
  }
  // Gaines
  if (state.ducts?.[id]) {
    const d = state.ducts[id];
    const lvlName = (d?.levelId && state.levels[d.levelId]?.name) ?? d?.levelId ?? 'N/A';
    const sysName = (d?.systemId && state.mepSystems?.[d.systemId]?.name) ?? d?.systemId ?? 'MEP';
    const dimStr = d?.shape === 'round' ? `Ø${d.diameter} mm` : `${d?.width}x${d?.height} mm`;
    return {
      name: `Gaine ${dimStr} (${sysName})`,
      category: 'Conduit aéraulique',
      discipline: 'MEP',
      levelName: lvlName,
      levelId: d?.levelId,
    };
  }
  // Chemins de câbles
  if (state.cableTrays?.[id]) {
    const ct = state.cableTrays[id];
    const lvlName = (ct?.levelId && state.levels[ct.levelId]?.name) ?? ct?.levelId ?? 'N/A';
    const sysName = (ct?.systemId && state.mepSystems?.[ct.systemId]?.name) ?? ct?.systemId ?? 'Électrique';
    return {
      name: `Chemin de câbles ${ct?.width}x${ct?.height} mm (${sysName})`,
      category: 'Cheminement CFO/CFA',
      discipline: 'MEP',
      levelName: lvlName,
      levelId: ct?.levelId,
    };
  }
  // Raccords MEP
  if (state.mepFittings?.[id]) {
    const f = state.mepFittings[id];
    const lvlName = (f?.levelId && state.levels[f.levelId]?.name) ?? f?.levelId ?? 'N/A';
    return {
      name: `Raccord MEP (${f?.fittingType ?? 'raccord'})`,
      category: 'Raccord réseau',
      discipline: 'MEP',
      levelName: lvlName,
      levelId: f?.levelId,
    };
  }
  // Équipements MEP
  if (state.mepEquipments?.[id]) {
    const eq = state.mepEquipments[id];
    const lvlName = (eq?.levelId && state.levels[eq.levelId]?.name) ?? eq?.levelId ?? 'N/A';
    return {
      name: `Équipement (${eq?.name ?? eq?.family ?? 'équipement'})`,
      category: 'Équipement technique',
      discipline: 'MEP',
      levelName: lvlName,
      levelId: eq?.levelId,
    };
  }
  // Portes & Fenêtres
  if (state.doors?.[id]) {
    const d = state.doors[id];
    const hostWall = d ? state.walls[d.hostWallId] : undefined;
    const lvlName = hostWall ? ((hostWall && state.levels[hostWall.levelId]?.name) ?? hostWall.levelId) : 'N/A';
    return {
      name: 'Porte',
      category: 'Ouverture / Menuiserie',
      discipline: 'Architecture',
      levelName: lvlName,
      levelId: hostWall?.levelId,
    };
  }
  if (state.windows?.[id]) {
    const win = state.windows[id];
    const hostWall = win ? state.walls[win.hostWallId] : undefined;
    const lvlName = hostWall ? ((hostWall && state.levels[hostWall.levelId]?.name) ?? hostWall.levelId) : 'N/A';
    return {
      name: 'Fenêtre',
      category: 'Ouverture / Menuiserie',
      discipline: 'Architecture',
      levelName: lvlName,
      levelId: hostWall?.levelId,
    };
  }
  // Escaliers & Toitures
  if (state.stairs?.[id]) {
    const s = state.stairs[id];
    const lvlId = s?.bottomLevelId;
    const lvlName = (lvlId && state.levels[lvlId]?.name) ?? lvlId ?? 'N/A';
    return {
      name: 'Escalier',
      category: 'Circulation verticale',
      discipline: 'Structure / Architecture',
      levelName: lvlName,
      levelId: lvlId,
    };
  }
  if (state.roofs?.[id]) {
    const r = state.roofs[id];
    const lvlName = (r && state.levels[r.levelId]?.name) ?? r?.levelId ?? 'N/A';
    return {
      name: `Toiture (${r?.name ?? 'standard'})`,
      category: 'Couverture',
      discipline: 'Architecture',
      levelName: lvlName,
      levelId: r?.levelId,
    };
  }

  return {
    name: id,
    category: 'Entité BIM',
    discipline: 'Général',
    levelName: 'Non défini',
    levelId: undefined,
  };
}

/**
 * Panneau de Détection et d'Inspection des Conflits Géométriques BIM (Phase 9.4).
 * Permet l'analyse broad-phase/narrow-phase à la demande, le filtrage par sévérité/discipline,
 * la sélection croisée d'éléments et le cadrage orbital 3D automatique.
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
  const [severityFilter, setSeverityFilter] = useState<'all' | ClashSeverity>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);

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
            overflow: 'hidden',
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
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
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
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
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
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-canvas-chrome)',
              minHeight: '160px',
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
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: 'var(--accent-success)',
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
                  <tr style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', textAlign: 'left' }}>
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
                          backgroundColor: isSelected ? 'var(--bg-card)' : 'transparent',
                          borderTop: '1px solid var(--border-subtle)',
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
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.categoryA} ({c.elementA}) ↔ {c.categoryB} ({c.elementB})
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                            {c.disciplineA} ↔ {c.disciplineB}
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {Math.round(c.penetrationDepthMm)} mm
                        </td>
                        <td
                          style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}
                        >
                          ({Math.round(c.point.x)}, {Math.round(c.point.y)}, {Math.round(c.point.z)}
                          )
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
              data-testid="clash-detail-card"
              style={{
                padding: '10px 12px',
                backgroundColor: 'var(--bg-card)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '11px',
              }}
            >
              {/* En-tête de la fiche */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: selectedClash.severity === 'hard' ? '#ef4444' : '#f59e0b',
                      color: selectedClash.severity === 'hard' ? '#ffffff' : '#111827',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {selectedClash.severity === 'hard' ? 'Collision physique (Hard)' : 'Défaut de garde (Clearance)'}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Pénétration : {Math.round(selectedClash.penetrationDepthMm)} mm
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="close-clash-detail-btn"
                  onClick={() => setSelectedClashId(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Fermer la fiche d'inspection"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Cartes descriptives des deux éléments */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: embedded ? 'column' : 'row',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-canvas-chrome)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#2563eb', fontWeight: 700 }}>
                    Élément A • {selectedElementInfo.infoA.discipline}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '11px', marginTop: '2px', color: 'var(--text-primary)' }}>
                    {selectedElementInfo.infoA.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedElementInfo.infoA.category}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Niveau : {selectedElementInfo.infoA.levelName}
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-canvas-chrome)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#059669', fontWeight: 700 }}>
                    Élément B • {selectedElementInfo.infoB.discipline}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '11px', marginTop: '2px', color: 'var(--text-primary)' }}>
                    {selectedElementInfo.infoB.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedElementInfo.infoB.category}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Niveau : {selectedElementInfo.infoB.levelName}
                  </div>
                </div>
              </div>

              {/* Point 3D et Navigation */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '4px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '10px' }}>
                  Impact : X={Math.round(selectedClash.point.x)} Y={Math.round(selectedClash.point.y)} Z={Math.round(selectedClash.point.z)} mm
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(selectedElementInfo.infoA.levelId ?? selectedElementInfo.infoB.levelId) && (onLocate2D || onSelectLevel) && (
                    <button
                      type="button"
                      data-testid="locate-2d-plan-btn"
                      onClick={() => {
                        const lvl = selectedElementInfo.infoA.levelId ?? selectedElementInfo.infoB.levelId;
                        if (onLocate2D) {
                          onLocate2D(selectedClash.point, lvl);
                        } else if (lvl && onSelectLevel) {
                          onSelectLevel(lvl);
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Plan 2D
                    </button>
                  )}
                  {onFocusPoint && (
                    <button
                      type="button"
                      data-testid="center-3d-cam-btn"
                      onClick={() => onFocusPoint(selectedClash.point)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#4b5563',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Centrer 3D
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
