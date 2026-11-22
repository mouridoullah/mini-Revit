import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type BimDocument, computeLevelMetrics, type LevelMetrics } from '@tabax/core';

export interface MetricsPanelProps {
  readonly doc: BimDocument;
  readonly activeLevelId?: string | null;
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
}

/**
 * Génère le contenu au format CSV des métrés avec unités explicites dans les en-têtes et colonnes.
 */
export function generateMetricsCsv(metrics: LevelMetrics, _levelName: string): string {
  const lines: string[] = [];
  // En-tête avec unités explicites
  lines.push('Catégorie,Élément,Quantité,Unité');

  // 1. Murs
  lines.push(`Murs,Linéaire total,${metrics.totals.wallLinearM.toFixed(3)},m`);
  lines.push(`Murs,Surface nette totale,${metrics.totals.wallNetAreaM2.toFixed(3)},m²`);
  lines.push(`Murs,Volume total,${metrics.totals.wallVolumeM3.toFixed(3)},m³`);

  // 2. Portes
  lines.push(`Portes,Nombre total,${metrics.totals.doorCount},u`);
  let totalDoorAreaMm2 = 0;
  for (const w of metrics.walls) {
    totalDoorAreaMm2 += w.openings.doorAreaMm2 ?? 0;
  }
  const totalDoorAreaM2 = Number((totalDoorAreaMm2 / 1e6).toFixed(3));
  lines.push(`Portes,Surface totale,${totalDoorAreaM2},m²`);

  // 3. Fenêtres
  lines.push(`Fenêtres,Nombre total,${metrics.totals.windowCount},u`);
  let totalWindowAreaMm2 = 0;
  for (const w of metrics.walls) {
    totalWindowAreaMm2 += w.openings.windowAreaMm2 ?? 0;
  }
  const totalWindowAreaM2 = Number((totalWindowAreaMm2 / 1e6).toFixed(3));
  lines.push(`Fenêtres,Surface totale,${totalWindowAreaM2},m²`);

  // 4. Pièces
  lines.push(`Pièces,Surface utile totale,${metrics.totals.roomAreaM2.toFixed(3)},m²`);
  for (const room of metrics.rooms) {
    const areaM2 = (room.areaMm2 / 1e6).toFixed(2);
    const perimM = (room.perimeterMm / 1000).toFixed(2);
    const volM3 = (room.volumeMm3 / 1e9).toFixed(2);
    lines.push(`Pièces,${room.name} (Surface),${areaM2},m²`);
    lines.push(`Pièces,${room.name} (Périmètre),${perimM},m`);
    lines.push(`Pièces,${room.name} (Volume),${volM3},m³`);
  }

  return lines.join('\n');
}

/**
 * Déclenche le téléchargement d'un fichier texte / CSV dans le navigateur.
 */
export function downloadCsvFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Panneau de tableau de métrés et de surfaces quantitatives en temps réel.
 * Règle d'or : recalcul à la demande avec debouncing de 200ms sur mutations.
 */
export function MetricsPanel({
  doc,
  activeLevelId,
  isCollapsed: externalCollapsed,
  onToggleCollapse,
}: MetricsPanelProps) {
  const [revision, setRevision] = useState(0);

  // Abonnement réactif aux mutations documentaires (undo, redo, commandes)
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      setRevision((r) => r + 1);
    });
    return unsubscribe;
  }, [doc]);

  const state = doc.getState();
  const levels = useMemo(() => Object.values(state.levels), [state.levels]);

  const [selectedLevelId, setSelectedLevelId] = useState<string>(() => {
    return activeLevelId && state.levels[activeLevelId]
      ? activeLevelId
      : levels[0]?.id ?? '';
  });

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
  const isCollapsed = externalCollapsed ?? internalCollapsed;

  const handleToggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  // Synchroniser avec activeLevelId si passé en prop
  useEffect(() => {
    if (activeLevelId && state.levels[activeLevelId]) {
      setSelectedLevelId(activeLevelId);
    }
  }, [activeLevelId, state.levels]);

  // Synchroniser le selectedLevelId si la liste des niveaux change
  useEffect(() => {
    if (levels.length > 0 && (!selectedLevelId || !state.levels[selectedLevelId])) {
      setSelectedLevelId(levels[0]?.id ?? '');
    }
  }, [levels, selectedLevelId, state.levels]);

  // Calcul réactif des métrés avec debouncing de 200 ms
  const [metrics, setMetrics] = useState<LevelMetrics | null>(() => {
    const lvlId = selectedLevelId || levels[0]?.id;
    return lvlId ? computeLevelMetrics(doc.getState(), lvlId) : null;
  });

  useEffect(() => {
    const lvlId = selectedLevelId || levels[0]?.id;
    if (!lvlId) {
      setMetrics(null);
      return;
    }

    const timer = setTimeout(() => {
      const result = computeLevelMetrics(doc.getState(), lvlId);
      setMetrics(result);
    }, 200);

    return () => clearTimeout(timer);
  }, [doc, state, selectedLevelId, levels, revision]);

  const activeLevelName = state.levels[selectedLevelId]?.name ?? 'Niveau';

  const handleExportCsv = useCallback(() => {
    if (!metrics) return;
    const csvContent = generateMetricsCsv(metrics, activeLevelName);
    downloadCsvFile(csvContent, `metres_${activeLevelName.replace(/\s+/g, '_')}.csv`);
  }, [metrics, activeLevelName]);

  return (
    <aside
      data-testid="metrics-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        boxShadow: '0 -2px 6px rgba(0,0,0,0.06)',
        transition: 'height 0.2s ease',
        height: isCollapsed ? '36px' : '220px',
        overflow: 'hidden',
        zIndex: 20,
      }}
    >
      {/* Barre d'en-tête du panneau */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          backgroundColor: 'var(--bg-elevated)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            data-testid="toggle-metrics-panel-btn"
            onClick={handleToggle}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>Tableau de Métrés & Surfaces</span>
          </button>

          {!isCollapsed && levels.length > 1 && (
            <label
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Niveau :
              <select
                data-testid="level-select"
                value={selectedLevelId}
                onChange={(e) => setSelectedLevelId(e.target.value)}
                style={{
                  fontSize: '12px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  colorScheme: 'dark',
                }}
              >
                {levels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name} ({lvl.elevation} mm)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!isCollapsed && (
          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            disabled={!metrics}
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: metrics ? 'pointer' : 'not-allowed',
              opacity: metrics ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Exporter CSV
          </button>
        )}
      </div>

      {/* Corps du tableau */}
      {!isCollapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {metrics ? (
            <table
              data-testid="metrics-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '4px 8px' }}>Catégorie</th>
                  <th style={{ padding: '4px 8px' }}>Élément</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Quantité</th>
                  <th style={{ padding: '4px 8px' }}>Unité</th>
                </tr>
              </thead>
              <tbody>
                {/* Section Murs */}
                <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 600 }}>
                  <td style={{ padding: '4px 8px' }}>Murs</td>
                  <td style={{ padding: '4px 8px' }}>Linéaire total</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.wallLinearM.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>m</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px' }}>Murs</td>
                  <td style={{ padding: '4px 8px' }}>Surface nette totale</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.wallNetAreaM2.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>m²</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px' }}>Murs</td>
                  <td style={{ padding: '4px 8px' }}>Volume total</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.wallVolumeM3.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>m³</td>
                </tr>

                {/* Section Portes & Fenêtres */}
                <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 600 }}>
                  <td style={{ padding: '4px 8px' }}>Ouvertures</td>
                  <td style={{ padding: '4px 8px' }}>Portes</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.doorCount}
                  </td>
                  <td style={{ padding: '4px 8px' }}>u</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px' }}>Ouvertures</td>
                  <td style={{ padding: '4px 8px' }}>Fenêtres</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.windowCount}
                  </td>
                  <td style={{ padding: '4px 8px' }}>u</td>
                </tr>

                {/* Section Pièces */}
                <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 600 }}>
                  <td style={{ padding: '4px 8px' }}>Pièces</td>
                  <td style={{ padding: '4px 8px' }}>Surface utile totale</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {metrics.totals.roomAreaM2.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>m²</td>
                </tr>
                {metrics.rooms.map((room) => (
                  <tr key={room.roomId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}>Pièce</td>
                    <td style={{ padding: '4px 8px' }}>{room.name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500 }}>
                      {(room.areaMm2 / 1e6).toFixed(2)}
                    </td>
                    <td style={{ padding: '4px 8px' }}>m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#9ca3af', fontStyle: 'italic', padding: '8px' }}>
              Aucun niveau sélectionné ou données non disponibles.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
