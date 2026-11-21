import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  FolderTree,
  Layers,
  Plus,
  Ruler,
} from 'lucide-react';
import type { FederatedModel, Level, MepSystem } from '@mini-bim/core';
import styles from './Cockpit.module.css';

export function ProjectBrowser({
  levels,
  activeLevelId,
  onSelectLevel,
  onAddLevel,
  underlayEnabled,
  onToggleUnderlay,
  hasUnderlayLevel,
  models,
  visibility,
  onToggleModel,
  onLoadIfc,
  onMetrics,
  systems = [],
  collapsed,
  onToggleCollapsed,
}: {
  levels: readonly Level[];
  activeLevelId: string;
  onSelectLevel: (id: string) => void;
  onAddLevel: () => void;
  underlayEnabled: boolean;
  onToggleUnderlay: (enabled: boolean) => void;
  hasUnderlayLevel: boolean;
  models: readonly FederatedModel[];
  visibility: ReadonlyMap<string, boolean>;
  onToggleModel: (id: string) => void;
  onLoadIfc: () => void;
  onMetrics: () => void;
  systems?: readonly MepSystem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const ordered = [...levels].sort((a, b) => a.elevation - b.elevation);
  return (
    <aside
      className={`${styles.browser} ${collapsed ? styles.browserCollapsed : ''}`}
      data-testid="project-browser"
    >
      <div className={styles.browserHeader}>
        {!collapsed && <span>Projet</span>}
        <button
          className={styles.browserRow}
          style={{ width: 'auto' }}
          aria-label={collapsed ? 'Ouvrir Project Browser' : 'Réduire Project Browser'}
          onClick={onToggleCollapsed}
        >
          <FolderTree size={16} />
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      {!collapsed && (
        <>
          <section className={styles.browserSection}>
            <div className={styles.sectionTitle}>
              <span>Niveaux</span>
              <button
                className={styles.browserRow}
                style={{ width: 'auto', minHeight: 22 }}
                title="Ajouter un étage"
                onClick={onAddLevel}
              >
                <Plus size={14} />
              </button>
            </div>
            {ordered.map((level) => (
              <button
                key={level.id}
                data-testid={`project-level-${level.id}`}
                className={`${styles.browserRow} ${activeLevelId === level.id ? styles.browserActive : ''}`}
                onClick={() => onSelectLevel(level.id)}
              >
                <Layers size={14} />
                <span>{level.name}</span>
                <span className={styles.subtle}>
                  {level.elevation >= 0 ? '+' : ''}{level.elevation} mm
                </span>
              </button>
            ))}
            <button
              className={styles.browserRow}
              disabled={!hasUnderlayLevel}
              onClick={() => onToggleUnderlay(!underlayEnabled)}
            >
              {underlayEnabled && hasUnderlayLevel ? (
                <CheckCircle2 size={14} />
              ) : (
                <Circle size={14} />
              )}{' '}
              Underlay (N-1)
            </button>
          </section>
          <section className={styles.browserSection}>
            <div className={styles.sectionTitle}>Systèmes MEP</div>
            {systems.length === 0 ? (
              <div className={styles.subtle}>Aucun système actif</div>
            ) : (
              systems.map((system) => (
                <div key={system.id} className={styles.browserRow}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: system.color ?? 'var(--accent-primary)',
                    }}
                  />
                  <span>{system.name}</span>
                  <span className={styles.subtle}>{system.elementIds.length}</span>
                </div>
              ))
            )}
          </section>
          <section className={styles.browserSection}>
            <div className={styles.sectionTitle}>
              <span>Maquettes IFC Réf</span>
              <button
                className={styles.browserRow}
                style={{ width: 'auto', minHeight: 22 }}
                title="Charger une maquette IFC"
                onClick={onLoadIfc}
              >
                <Plus size={14} />
              </button>
            </div>
            {models.length === 0 ? (
              <div className={styles.subtle}>Aucune maquette chargée</div>
            ) : (
              models.map((model) => (
                <button
                  key={model.id}
                  className={styles.browserRow}
                  onClick={() => onToggleModel(model.id)}
                >
                  {visibility.get(model.id) ? <Eye size={14} /> : <EyeOff size={14} />}
                  <span>{model.name}</span>
                  <span className={styles.subtle}>{model.entityCount}</span>
                </button>
              ))
            )}
          </section>
          <section className={styles.browserSection}>
            <div className={styles.sectionTitle}>Quantitatifs</div>
            <button
              className={styles.browserRow}
              data-testid="metrics-toggle-btn"
              onClick={onMetrics}
            >
              <Ruler size={14} /> Ouvrir les métrés
            </button>
          </section>
        </>
      )}
    </aside>
  );
}
