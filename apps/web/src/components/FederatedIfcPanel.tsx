import { useState, useMemo } from 'react';
import { Crosshair, FileBox, FolderOpen, X, Zap } from 'lucide-react';
import {
  type FederatedModel,
  type FederatedEntity,
  type FederatedClashCandidate,
} from '@tabax/core';

export interface FederatedModelOptions {
  visible: boolean;
  opacity: number;
  wireframe: boolean;
  offset: { x: number; y: number; z: number };
}

export interface FederatedIfcPanelProps {
  readonly embedded?: boolean;
  readonly models: readonly FederatedModel[];
  readonly options: ReadonlyMap<string, FederatedModelOptions>;
  readonly selectedEntity?: { modelId: string; entity: FederatedEntity } | null;
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
  readonly onSelectEntity?: (modelId: string, entity: FederatedEntity | null) => void;
  readonly onUpdateOptions?: (modelId: string, patch: Partial<FederatedModelOptions>) => void;
  readonly onUnloadModel?: (modelId: string) => void;
  readonly onFocusPoint?: (point: { x: number; y: number; z: number }) => void;
  readonly onTargetClash?: (clash: FederatedClashCandidate) => void;
  readonly onCheckClashes?: (modelId: string) => void;
  readonly clashCandidates?: readonly FederatedClashCandidate[];
}

/**
 * Panneau de Gestion, Coordination et Inspection des Maquettes IFC Fédérées (Sous-phase 9.5).
 * Permet la superposition non-destructive de modèles IFC externes, le recalage spatial (X/Y/Z),
 * l'ajustement visuel (opacité/wireframe), l'inspection sémantique en lecture seule
 * et la détection d'interférences avec le modèle natif (BVH).
 */
export function FederatedIfcPanel({
  embedded = false,
  models,
  options,
  selectedEntity,
  isCollapsed = false,
  onToggleCollapse,
  onSelectEntity,
  onUpdateOptions,
  onUnloadModel,
  onFocusPoint,
  onTargetClash,
  onCheckClashes,
  clashCandidates = [],
}: FederatedIfcPanelProps) {
  const [activeTab, setActiveTab] = useState<'models' | 'inspector' | 'clashes'>('models');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const activeModel = useMemo(() => {
    if (selectedModelId) {
      return models.find((m) => m.id === selectedModelId) ?? models[0];
    }
    return models[0];
  }, [models, selectedModelId]);

  if (isCollapsed) return null;

  return (
    <aside
      data-testid="federated-ifc-panel"
      style={{
        position: embedded ? 'relative' : 'absolute',
        top: embedded ? undefined : '56px',
        right: embedded ? undefined : '12px',
        width: embedded ? '100%' : '420px',
        height: embedded ? '100%' : undefined,
        maxHeight: embedded ? 'none' : 'calc(100vh - 120px)',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: embedded ? 0 : '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: embedded ? 'auto' : 50,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* 1. En-tête */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-canvas-chrome)',
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileBox size={16} strokeWidth={1.75} />
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Maquettes Fédérées IFC</h2>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '9999px',
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              fontWeight: 500,
            }}
          >
            {models.length}
          </span>
        </div>
        <button
          type="button"
          data-testid="close-federated-panel-btn"
          onClick={onToggleCollapse}
          title="Fermer le panneau"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* 2. Onglets de Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-elevated)',
        }}
      >
        <button
          type="button"
          data-testid="tab-models-btn"
          onClick={() => setActiveTab('models')}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: activeTab === 'models' ? 600 : 500,
            color: activeTab === 'models' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            border: 'none',
            borderBottom: activeTab === 'models' ? '2px solid var(--accent-primary)' : 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Maquettes ({models.length})
        </button>
        <button
          type="button"
          data-testid="tab-inspector-btn"
          onClick={() => setActiveTab('inspector')}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: activeTab === 'inspector' ? 600 : 500,
            color: activeTab === 'inspector' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            border: 'none',
            borderBottom: activeTab === 'inspector' ? '2px solid var(--accent-primary)' : 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Inspecteur {selectedEntity ? '●' : ''}
        </button>
        <button
          type="button"
          data-testid="tab-clashes-btn"
          onClick={() => setActiveTab('clashes')}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: activeTab === 'clashes' ? 600 : 500,
            color: activeTab === 'clashes' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            border: 'none',
            borderBottom: activeTab === 'clashes' ? '2px solid var(--accent-primary)' : 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Conflits ({clashCandidates.length})
        </button>
      </div>

      {/* 3. Contenu de l'onglet */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', maxHeight: '520px' }}>
        {models.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
              <FolderOpen size={24} strokeWidth={1.75} />
            </p>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>Aucune maquette IFC chargée</p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              Chargez un fichier .ifc en lecture seule via la barre d'outils pour coordonner avec
              votre modèle natif.
            </p>
          </div>
        ) : (
          <>
            {/* Onglet 1 : Gestion des Maquettes */}
            {activeTab === 'models' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {models.map((model) => {
                  const modelOpts = options.get(model.id) ?? {
                    visible: true,
                    opacity: 0.35,
                    wireframe: false,
                    offset: { x: 0, y: 0, z: 0 },
                  };

                  return (
                    <div
                      key={model.id}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-surface)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {model.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {model.schema} • {model.units.length} • {model.entityCount} entités
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid={`unload-model-btn-${model.id}`}
                          onClick={() => onUnloadModel?.(model.id)}
                          title="Décharger cette maquette"
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--status-hard)',
                            border: '1px solid var(--border-strong)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Décharger
                        </button>
                      </div>

                      {/* Toggles Visibilité & Wireframe */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={modelOpts.visible}
                            onChange={(e) =>
                              onUpdateOptions?.(model.id, { visible: e.target.checked })
                            }
                          />
                          Afficher
                        </label>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={modelOpts.wireframe}
                            onChange={(e) =>
                              onUpdateOptions?.(model.id, { wireframe: e.target.checked })
                            }
                          />
                          Mode Filaire
                        </label>
                      </div>

                      {/* Curseur Opacité */}
                      <div style={{ marginBottom: '10px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            marginBottom: '4px',
                          }}
                        >
                          <span>Opacité</span>
                          <span>{Math.round(modelOpts.opacity * 100)} %</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="1.0"
                          step="0.05"
                          value={modelOpts.opacity}
                          onChange={(e) =>
                            onUpdateOptions?.(model.id, { opacity: parseFloat(e.target.value) })
                          }
                          style={{ width: '100%', cursor: 'pointer' }}
                        />
                      </div>

                      {/* Recalage spatial X/Y/Z */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Recalage spatial (mm)
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '6px',
                          }}
                        >
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            dX:
                            <input
                              type="number"
                              value={modelOpts.offset.x}
                              onChange={(e) =>
                                onUpdateOptions?.(model.id, {
                                  offset: {
                                    ...modelOpts.offset,
                                    x: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                padding: '3px 4px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: '3px',
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                fontVariantNumeric: 'tabular-nums',
                                colorScheme: 'dark',
                              }}
                            />
                          </label>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            dY:
                            <input
                              type="number"
                              value={modelOpts.offset.y}
                              onChange={(e) =>
                                onUpdateOptions?.(model.id, {
                                  offset: {
                                    ...modelOpts.offset,
                                    y: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                padding: '3px 4px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: '3px',
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                fontVariantNumeric: 'tabular-nums',
                                colorScheme: 'dark',
                              }}
                            />
                          </label>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            dZ:
                            <input
                              type="number"
                              value={modelOpts.offset.z}
                              onChange={(e) =>
                                onUpdateOptions?.(model.id, {
                                  offset: {
                                    ...modelOpts.offset,
                                    z: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                padding: '3px 4px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: '3px',
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                fontVariantNumeric: 'tabular-nums',
                                colorScheme: 'dark',
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Bouton détection de clashs avec ce modèle */}
                      <button
                        type="button"
                        data-testid={`check-clash-btn-${model.id}`}
                        onClick={() => {
                          setSelectedModelId(model.id);
                          onCheckClashes?.(model.id);
                          setActiveTab('clashes');
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        <Zap size={14} strokeWidth={1.75} /> Analyser les Conflits (Natif ↔ {model.name})
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Onglet 2 : Inspecteur Sémantique IFC */}
            {activeTab === 'inspector' && (
              <div>
                {selectedEntity ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      style={{
                        padding: '10px',
                        backgroundColor: 'var(--bg-elevated)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                          color: 'var(--accent-primary)',
                          backgroundColor: 'var(--bg-surface)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {selectedEntity.entity.ifcType}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          #{selectedEntity.entity.expressId}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '4px',
                        }}
                      >
                        {selectedEntity.entity.name ?? 'Élément sans nom'}
                      </div>
                      {selectedEntity.entity.globalId && (
                        <div
                          style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}
                        >
                          GlobalId : {selectedEntity.entity.globalId}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        data-testid="focus-entity-btn"
                        onClick={() => {
                          const box = selectedEntity.entity.aabb;
                          onFocusPoint?.({
                            x: (box.min.x + box.max.x) / 2,
                            y: (box.min.y + box.max.y) / 2,
                            z: (box.min.z + box.max.z) / 2,
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: '12px',
                          backgroundColor: 'var(--accent-primary)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        <Crosshair size={14} strokeWidth={1.75} /> Cibler 3D
                      </button>
                      <button
                        type="button"
                        data-testid="clear-selection-entity-btn"
                        onClick={() => onSelectEntity?.(selectedEntity.modelId, null)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Effacer
                      </button>
                    </div>

                    {/* PropertySets */}
                    <div style={{ marginTop: '8px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '6px',
                        }}
                      >
                        Jeux de Propriétés ({selectedEntity.entity.propertySets?.length ?? 0})
                      </div>
                      {selectedEntity.entity.propertySets &&
                      selectedEntity.entity.propertySets.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {selectedEntity.entity.propertySets.map((ps, idx) => (
                            <details
                              key={idx}
                              open
                              style={{
                                padding: '6px 8px',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-surface)',
                                fontSize: '11px',
                              }}
                            >
                              <summary
                                style={{ fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}
                              >
                                {ps.name}
                              </summary>
                              <div
                                style={{
                                  marginTop: '6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '3px',
                                }}
                              >
                                {Object.entries(ps.properties).map(([k, v]) => (
                                  <div
                                    key={k}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    <span style={{ fontWeight: 500 }}>{k} :</span>
                                    <span>{v !== null ? String(v) : '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Aucun PropertySet associé à cette entité.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                    }}
                  >
                    Cliquez sur un objet de la maquette IFC dans la scène 3D pour inspecter ses
                    propriétés.
                  </div>
                )}
              </div>
            )}

            {/* Onglet 3 : Conflits Inter-Maquettes */}
            {activeTab === 'clashes' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Interférences Spatiales BVH
                  </div>
                  {activeModel && (
                    <button
                      type="button"
                      data-testid="recheck-clashes-btn"
                      onClick={() => onCheckClashes?.(activeModel.id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Actualiser
                    </button>
                  )}
                </div>

                {clashCandidates.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                    }}
                  >
                    ✓ Aucune interférence spatiale détectée entre le modèle natif et la maquette
                    fédérée.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {clashCandidates.map((clash, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--status-hard)',
                          backgroundColor: 'var(--bg-surface)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--status-hard)' }}>
                            {clash.nativeCategory} #{clash.nativeId} <Zap size={12} strokeWidth={1.75} /> {clash.ifcType} #
                            {clash.expressId}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Pénétration est. : {clash.penetrationEstimateMm} mm
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onTargetClash) onTargetClash(clash);
                            else onFocusPoint?.(clash.point);
                          }}
                          title="Cibler dans la vue 3D"
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            backgroundColor: 'var(--status-hard)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Cibler
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
