import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
  Commands,
  type BimDocument,
  computeWallEffectiveHeight,
  computeStairGeometry,
  getLevelStoryHeight,
  getSortedLevels,
  setStoryHeight,
} from '@mini-bim/core';

export interface PropertyInspectorProps {
  readonly doc: BimDocument;
  readonly selectedIds: readonly string[];
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
}

interface DebouncedNumberInputProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly testId: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

function DebouncedNumberInput({
  label,
  value,
  testId,
  min,
  max,
  step = 10,
  unit = 'mm',
  disabled = false,
  onChange,
}: DebouncedNumberInputProps) {
  const [localVal, setLocalVal] = useState<string>(
    value !== undefined && !Number.isNaN(value) ? String(value) : '',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalVal(value !== undefined && !Number.isNaN(value) ? String(value) : '');
  }, [value]);

  const commit = (valStr: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const parsed = Number.parseFloat(valStr);
    if (!Number.isNaN(parsed) && parsed !== value) {
      onChange(parsed);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setLocalVal(nextStr);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      commit(nextStr);
    }, 200);
  };

  const handleBlur = () => {
    commit(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localVal);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          data-testid={testId}
          value={localVal}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
            outline: 'none',
          }}
        />
        {unit && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{unit}</span>}
      </div>
    </div>
  );
}

interface DebouncedTextInputProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly onChange: (value: string) => void;
}

function DebouncedTextInput({ label, value, testId, onChange }: DebouncedTextInputProps) {
  const [localVal, setLocalVal] = useState<string>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const commit = (valStr: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (valStr !== value) {
      onChange(valStr);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setLocalVal(nextStr);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      commit(nextStr);
    }, 200);
  };

  const handleBlur = () => {
    commit(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localVal);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>{label}</label>
      <input
        type="text"
        data-testid={testId}
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          padding: '5px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          backgroundColor: '#1f2937',
          color: '#f3f4f6',
          border: '1px solid #4b5563',
          outline: 'none',
        }}
      />
    </div>
  );
}

/**
 * Inspecteur de Propriétés BIM latéral droit (Milestone 6.1b-2 / ADR-046).
 *
 * Supporte l'édition bidirectionnelle temps-réel de tous les objets architecturaux :
 * - Wall : type, bascule hauteur Auto/Fixe, baseOffset, détection non-bloquante de pénétration de dalle.
 * - Slab : type, épaisseur, baseOffset.
 * - SlabType : épaisseur (50-500mm).
 * - Door : type, sens/côté d'ouverture, position offsetAlong.
 * - Window : type, allège sillHeight, position offsetAlong.
 * - Level : nom, élévation altimétrique, hauteur sous plafond storyHeight.
 *
 * Utilise un debouncing ergonomique de 200ms sur les entrées numériques pour
 * préserver la fluidité et l'historique transactionnel Immer (ADR-046 Point A).
 */
export function PropertyInspector({
  doc,
  selectedIds,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
}: PropertyInspectorProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((t) => t + 1);

  // Abonnement réactif aux mutations documentaires (undo, redo, modifications externes)
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      forceUpdate();
    });
    return unsubscribe;
  }, [doc]);

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const execute = (cmd: import('@mini-bim/core').Command) => {
    doc.execute(cmd);
    forceUpdate();
  };

  if (isCollapsed) {
    return (
      <aside
        data-testid="property-inspector-collapsed"
        style={{
          width: '36px',
          height: '100%',
          backgroundColor: '#111827',
          borderLeft: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '12px',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          data-testid="toggle-inspector-btn"
          onClick={toggle}
          title="Ouvrir l'inspecteur de propriétés"
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          ◀
        </button>
      </aside>
    );
  }

  const state = doc.getState();

  const renderContent = () => {
    if (selectedIds.length === 0) {
      return (
        <div
          data-testid="inspector-no-selection"
          style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}
        >
          Aucune sélection
        </div>
      );
    }

    if (selectedIds.length > 1) {
      return (
        <div
          data-testid="inspector-multi-selection"
          style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}
        >
          {selectedIds.length} éléments sélectionnés
        </div>
      );
    }

    const id = selectedIds[0];
    if (!id) return null;

    // 1. Mur
    const wall = state.walls[id];
    if (wall) {
      const isAuto = wall.heightOverride === undefined;
      const effectiveH = computeWallEffectiveHeight(wall, state);
      const wallType = state.wallTypes[wall.typeId];

      // Calcul de pénétration de dalle si mode Fixe
      let penetrationMm = 0;
      if (!isAuto && wall.heightOverride !== undefined) {
        const curLevel = state.levels[wall.levelId];
        const zBase = (curLevel?.elevation ?? 0) + (wall.baseOffset ?? 0);
        const zTop = zBase + wall.heightOverride;

        for (const sl of Object.values(state.slabs ?? {})) {
          const slLevel = state.levels[sl.levelId];
          if (slLevel && slLevel.elevation > (curLevel?.elevation ?? 0)) {
            const slType = state.slabTypes?.[sl.slabTypeId];
            if (slType) {
              const zInf = slLevel.elevation + (sl.baseOffset ?? 0) - slType.thickness;
              if (zTop > zInf) {
                penetrationMm = Math.max(penetrationMm, zTop - zInf);
              }
            }
          }
        }
      }

      return (
        <div data-testid="inspector-wall-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa', marginBottom: '12px' }}
          >
            Mur
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="wall-id">{wall.id}</span>
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Type de mur
            </label>
            <select
              data-testid="wall-type-select"
              value={wall.typeId}
              onChange={(e) => {
                execute(new Commands.UpdateWallCommand(wall.id, { typeId: e.target.value }));
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                outline: 'none',
              }}
            >
              {Object.values(state.wallTypes).map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name} ({wt.thickness}mm)
                </option>
              ))}
            </select>
          </div>

          {/* Mode Hauteur : Auto vs Fixe */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Mode de hauteur
            </label>
            <div data-testid="wall-height-mode-toggle" style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                data-testid="wall-height-mode-auto"
                onClick={() => {
                  if (!isAuto) {
                    execute(new Commands.UpdateWallCommand(wall.id, { heightOverride: undefined }));
                  }
                }}
                style={{
                  flex: 1,
                  padding: '5px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  backgroundColor: isAuto ? '#2563eb' : '#374151',
                  color: isAuto ? '#ffffff' : '#9ca3af',
                  border: isAuto ? '1px solid #3b82f6' : '1px solid #4b5563',
                  cursor: 'pointer',
                }}
              >
                Auto (Niveau/Dalle)
              </button>
              <button
                type="button"
                data-testid="wall-height-mode-fixe"
                onClick={() => {
                  if (isAuto) {
                    const fallbackH = effectiveH;
                    execute(new Commands.UpdateWallCommand(wall.id, { heightOverride: fallbackH }));
                  }
                }}
                style={{
                  flex: 1,
                  padding: '5px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  backgroundColor: !isAuto ? '#2563eb' : '#374151',
                  color: !isAuto ? '#ffffff' : '#9ca3af',
                  border: !isAuto ? '1px solid #3b82f6' : '1px solid #4b5563',
                  cursor: 'pointer',
                }}
              >
                Fixe (Libre)
              </button>
            </div>
          </div>

          {!isAuto ? (
            <DebouncedNumberInput
              testId="wall-height-input"
              label="Hauteur libre (heightOverride)"
              min={100}
              max={20000}
              value={wall.heightOverride}
              onChange={(h) => {
                execute(new Commands.UpdateWallCommand(wall.id, { heightOverride: h }));
              }}
            />
          ) : (
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
              Hauteur effective : <strong>{effectiveH} mm</strong>
            </div>
          )}

          {penetrationMm > 0 && (
            <div
              data-testid="wall-penetration-warning"
              style={{
                backgroundColor: '#78350f',
                color: '#fef3c7',
                padding: '6px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                marginBottom: '10px',
                border: '1px solid #d97706',
              }}
            >
              ⚠️ Pénétration dans la dalle supérieure (+{Math.round(penetrationMm)} mm)
            </div>
          )}

          <DebouncedNumberInput
            testId="wall-base-offset-input"
            label="Décalage inférieur (baseOffset)"
            value={wall.baseOffset ?? 0}
            onChange={(bo) => {
              execute(new Commands.UpdateWallCommand(wall.id, { baseOffset: bo }));
            }}
          />

          <div style={{ marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '10px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
              Sémantique BIM (IFC Pset_WallCommon)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', color: '#9ca3af' }}>Fonction porteuse (LoadBearing)</label>
                <select
                  data-testid="wall-load-bearing-select"
                  value={wall.loadBearing === undefined ? 'inherit' : wall.loadBearing ? 'true' : 'false'}
                  onChange={(e) => {
                    const val = e.target.value;
                    execute(
                      new Commands.UpdateWallCommand(wall.id, {
                        loadBearing: val === 'inherit' ? undefined : val === 'true',
                      }),
                    );
                  }}
                  style={{
                    padding: '4px 6px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    backgroundColor: '#1f2937',
                    color: '#f3f4f6',
                    border: '1px solid #4b5563',
                  }}
                >
                  <option value="inherit">
                    Hérité du type (
                    {wallType?.loadBearing !== undefined
                      ? wallType.loadBearing
                        ? 'Porteur'
                        : 'Non porteur'
                      : 'Non spécifié'}
                    )
                  </option>
                  <option value="true">Oui (Porteur)</option>
                  <option value="false">Non (Non porteur)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', color: '#9ca3af' }}>Position de façade (IsExternal)</label>
                <select
                  data-testid="wall-is-external-select"
                  value={wall.isExternal === undefined ? 'inherit' : wall.isExternal ? 'true' : 'false'}
                  onChange={(e) => {
                    const val = e.target.value;
                    execute(
                      new Commands.UpdateWallCommand(wall.id, {
                        isExternal: val === 'inherit' ? undefined : val === 'true',
                      }),
                    );
                  }}
                  style={{
                    padding: '4px 6px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    backgroundColor: '#1f2937',
                    color: '#f3f4f6',
                    border: '1px solid #4b5563',
                  }}
                >
                  <option value="inherit">
                    Hérité du type (
                    {wallType?.isExternal !== undefined
                      ? wallType.isExternal
                        ? 'Extérieur'
                        : 'Intérieur'
                      : 'Non spécifié'}
                    )
                  </option>
                  <option value="true">Oui (Extérieur)</option>
                  <option value="false">Non (Intérieur)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. Dalle
    const slab = state.slabs?.[id];
    if (slab) {
      const currentSlabType = state.slabTypes?.[slab.slabTypeId];

      return (
        <div data-testid="inspector-slab-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', marginBottom: '12px' }}
          >
            Dalle Structurelle
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="slab-id">{slab.id}</span>
          </div>

          <DebouncedTextInput
            testId="slab-name-input"
            label="Nom"
            value={slab.name ?? 'Dalle'}
            onChange={(name) => {
              execute(new Commands.UpdateSlabCommand(slab.id, { name }));
            }}
          />

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Type de dalle
            </label>
            <select
              data-testid="slab-type-select"
              value={slab.slabTypeId}
              onChange={(e) => {
                execute(new Commands.UpdateSlabCommand(slab.id, { slabTypeId: e.target.value }));
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                outline: 'none',
              }}
            >
              {Object.values(state.slabTypes ?? {}).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.thickness}mm)
                </option>
              ))}
            </select>
          </div>

          <div
            data-testid="slab-thickness-display"
            style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '10px' }}
          >
            Épaisseur : <strong>{currentSlabType?.thickness ?? 200} mm</strong>
          </div>

          <DebouncedNumberInput
            testId="slab-base-offset-input"
            label="Décalage vertical (baseOffset)"
            value={slab.baseOffset ?? 0}
            onChange={(bo) => {
              execute(new Commands.UpdateSlabCommand(slab.id, { baseOffset: bo }));
            }}
          />

          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Réservations / Trémies : {(slab.holes?.length ?? 0) + (slab.openings?.length ?? 0)}
          </div>

          {currentSlabType && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #374151' }}>
              <div
                style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}
              >
                Édition du Type ({currentSlabType.name})
              </div>
              <DebouncedNumberInput
                testId="slab-type-thickness-input"
                label="Épaisseur du type"
                min={50}
                max={500}
                value={currentSlabType.thickness}
                onChange={(th) => {
                  execute(
                    new Commands.UpdateSlabTypeCommand(currentSlabType.id, { thickness: th }),
                  );
                }}
              />
            </div>
          )}
        </div>
      );
    }

    // 3. Porte
    if (state.doors?.[id]) {
      const door = state.doors[id]!;
      return (
        <div data-testid="inspector-door-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}
          >
            Porte
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="door-id">{door.id}</span>
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Type de porte
            </label>
            <select
              data-testid="door-type-select"
              value={door.doorTypeId}
              onChange={(e) => {
                execute(new Commands.UpdateDoorCommand(door.id, { doorTypeId: e.target.value }));
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                outline: 'none',
              }}
            >
              {Object.values(state.doorTypes ?? {}).map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name} ({dt.width}×{dt.height}mm)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              type="button"
              data-testid="door-swing-side-toggle"
              onClick={() => {
                execute(
                  new Commands.UpdateDoorCommand(door.id, {
                    swing: {
                      ...door.swing,
                      side: door.swing.side === 'left' ? 'right' : 'left',
                    },
                  }),
                );
              }}
              style={{
                flex: 1,
                padding: '5px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#374151',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                cursor: 'pointer',
              }}
            >
              Côté : {door.swing.side === 'left' ? 'Gauche' : 'Droite'}
            </button>
            <button
              type="button"
              data-testid="door-swing-dir-toggle"
              onClick={() => {
                execute(
                  new Commands.UpdateDoorCommand(door.id, {
                    swing: {
                      ...door.swing,
                      direction: door.swing.direction === 'in' ? 'out' : 'in',
                    },
                  }),
                );
              }}
              style={{
                flex: 1,
                padding: '5px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#374151',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                cursor: 'pointer',
              }}
            >
              Sens : {door.swing.direction === 'in' ? 'Intérieur' : 'Extérieur'}
            </button>
          </div>

          <DebouncedNumberInput
            testId="door-offset-input"
            label="Position le long du mur (offsetAlong)"
            value={door.offsetAlong}
            onChange={(off) => {
              execute(new Commands.UpdateDoorCommand(door.id, { offsetAlong: off }));
            }}
          />
        </div>
      );
    }

    // 4. Fenêtre
    if (state.windows?.[id]) {
      const window = state.windows[id]!;
      return (
        <div data-testid="inspector-window-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8', marginBottom: '12px' }}
          >
            Fenêtre
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="window-id">{window.id}</span>
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Type de fenêtre
            </label>
            <select
              data-testid="window-type-select"
              value={window.windowTypeId}
              onChange={(e) => {
                execute(
                  new Commands.UpdateWindowCommand(window.id, { windowTypeId: e.target.value }),
                );
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                outline: 'none',
              }}
            >
              {Object.values(state.windowTypes ?? {}).map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name} ({wt.width}×{wt.height}mm)
                </option>
              ))}
            </select>
          </div>

          <DebouncedNumberInput
            testId="window-sill-height-input"
            label="Hauteur d’allège (sillHeight)"
            value={window.sillHeight}
            onChange={(sh) => {
              execute(new Commands.UpdateWindowCommand(window.id, { sillHeight: sh }));
            }}
          />

          <DebouncedNumberInput
            testId="window-offset-input"
            label="Position le long du mur (offsetAlong)"
            value={window.offsetAlong}
            onChange={(off) => {
              execute(new Commands.UpdateWindowCommand(window.id, { offsetAlong: off }));
            }}
          />
        </div>
      );
    }

    // 5. Niveau
    if (state.levels[id]) {
      const level = state.levels[id]!;
      const sortedLevels = getSortedLevels(state.levels);
      const levelIndex = sortedLevels.findIndex((l) => l.id === level.id);
      const storyH = getLevelStoryHeight(state, level.id);

      return (
        <div data-testid="inspector-level-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#a78bfa', marginBottom: '12px' }}
          >
            Niveau
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="level-id">{level.id}</span>
          </div>

          <DebouncedTextInput
            testId="level-name-input"
            label="Nom"
            value={level.name}
            onChange={(name) => {
              execute(new Commands.UpdateLevelCommand(level.id, { name }));
            }}
          />

          <DebouncedNumberInput
            testId="level-elevation-input"
            label="Élévation"
            value={level.elevation}
            onChange={(elevation) => {
              execute(new Commands.UpdateLevelCommand(level.id, { elevation }));
            }}
          />

          {storyH !== undefined && (
            <DebouncedNumberInput
              testId="level-story-height-input"
              label="Hauteur sous plafond (storyHeight)"
              min={100}
              max={10000}
              value={storyH}
              onChange={(sh) => {
                if (levelIndex >= 0) {
                  setStoryHeight(doc, levelIndex, sh);
                  forceUpdate();
                }
              }}
            />
          )}
        </div>
      );
    }

    // 6. Escalier droit paramétrique (ADR-048)
    if (state.stairs?.[id]) {
      const stair = state.stairs[id]!;
      const currentStairType = state.stairTypes?.[stair.stairTypeId];
      const bottomLevel = state.levels[stair.bottomLevelId];
      const topLevel = state.levels[stair.topLevelId];
      const geom = computeStairGeometry(stair, state);
      const blondel = 2 * geom.stepHeight + geom.stepDepth;

      // Blondel Badge (Vert / Jaune / Rouge selon D3)
      let badgeColor = '#10b981'; // Vert (confort)
      let badgeBg = 'rgba(16, 185, 129, 0.15)';
      let badgeLabel = 'Conforme (Confort)';

      if (blondel < 560 || blondel > 680) {
        badgeColor = '#ef4444'; // Rouge (sécurité)
        badgeBg = 'rgba(239, 68, 68, 0.15)';
        badgeLabel = 'Hors Sécurité';
      } else if (!geom.isCompliant) {
        badgeColor = '#f59e0b'; // Jaune (ergonomie)
        badgeBg = 'rgba(245, 158, 11, 0.15)';
        badgeLabel = 'Hors Confort';
      }

      return (
        <div data-testid="inspector-stair-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}
          >
            Escalier Droit Paramétrique
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            ID : <span data-testid="stair-id">{stair.id}</span>
          </div>

          <DebouncedTextInput
            testId="stair-name-input"
            label="Nom"
            value={stair.name ?? 'Escalier'}
            onChange={(name) => {
              execute(new Commands.UpdateStairCommand(stair.id, { name }));
            }}
          />

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
              Type d'escalier
            </label>
            <select
              data-testid="stair-type-select"
              value={stair.stairTypeId}
              onChange={(e) => {
                execute(new Commands.UpdateStairCommand(stair.id, { stairTypeId: e.target.value }));
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
                outline: 'none',
              }}
            >
              {Object.values(state.stairTypes ?? {}).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.width}mm)
                </option>
              ))}
            </select>
          </div>

          <DebouncedNumberInput
            testId="stair-width-input"
            label="Largeur de volée"
            value={stair.widthOverride ?? currentStairType?.width ?? 900}
            min={500}
            max={2000}
            step={50}
            onChange={(widthOverride) => {
              execute(new Commands.UpdateStairCommand(stair.id, { widthOverride }));
            }}
          />

          <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}>
            Niveaux : {bottomLevel?.name ?? 'Niveau bas'} → {topLevel?.name ?? 'Niveau haut'}
          </div>

          <div
            data-testid="stair-rise-display"
            style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
          >
            Dénivelée (ΔZ) : <strong>{Math.round(geom.totalRise)} mm</strong>
          </div>

          <div
            data-testid="stair-steps-display"
            style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
          >
            Nombre de marches (N) : <strong>{geom.numberOfSteps}</strong>
          </div>

          <div
            data-testid="stair-riser-display"
            style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
          >
            Contremarche (h) : <strong>{geom.stepHeight.toFixed(1)} mm</strong>
          </div>

          <div
            data-testid="stair-tread-display"
            style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '10px' }}
          >
            Giron (g) : <strong>{geom.stepDepth.toFixed(1)} mm</strong>
          </div>

          {/* Badge Blondel */}
          <div
            data-testid="stair-blondel-badge"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '4px',
              backgroundColor: badgeBg,
              border: `1px solid ${badgeColor}`,
              color: badgeColor,
              fontSize: '11px',
              fontWeight: 600,
              marginBottom: '12px',
            }}
          >
            <span>2h + g = {Math.round(blondel)} mm</span>
            <span>{badgeLabel}</span>
          </div>

          {geom.warnings.length > 0 && (
            <div
              data-testid="stair-warnings"
              style={{
                fontSize: '10px',
                color: '#f87171',
                marginBottom: '12px',
                lineHeight: '1.4',
              }}
            >
              {geom.warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          {/* Bouton Inverser le sens */}
          <button
            type="button"
            data-testid="stair-invert-direction-btn"
            onClick={() => {
              execute(new Commands.UpdateStairCommand(stair.id, { start: stair.end, end: stair.start }));
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              borderRadius: '4px',
              backgroundColor: '#374151',
              color: '#f3f4f6',
              border: '1px solid #4b5563',
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            ⇄ Inverser le sens de montée
          </button>
        </div>
      );
    }

    if (state.roofs?.[id]) {
      const roof = state.roofs[id];
      if (!roof) return null;
      const roofTypes = state.roofTypes ?? {};
      const currentRoofType = roofTypes[roof.roofTypeId];
      const isGable = currentRoofType?.family === 'gable';
      const level = state.levels[roof.levelId];

      return (
        <div data-testid="inspector-roof-panel">
          <div
            style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}
          >
            {isGable ? 'Toiture à 2 pans' : 'Toiture terrasse (Toit plat)'}
          </div>

          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>
            ID : <span data-testid="roof-id">{roof.id}</span>
          </div>

          <DebouncedTextInput
            testId="roof-name-input"
            label="Nom"
            value={roof.name ?? 'Toiture'}
            onChange={(name) => {
              execute(new Commands.UpdateRoofCommand(roof.id, { name }));
            }}
          />

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
          >
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Type de toiture</label>
            <select
              data-testid="roof-type-select"
              value={roof.roofTypeId}
              onChange={(e) => {
                execute(new Commands.UpdateRoofCommand(roof.id, { roofTypeId: e.target.value }));
              }}
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f9fafb',
                border: '1px solid #4b5563',
              }}
            >
              {Object.values(roofTypes).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} ({rt.family === 'gable' ? `${rt.slopeDeg}°` : `${rt.thickness}mm`})
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}>
            Niveau d'assise : {level?.name ?? 'Niveau 0'}
          </div>

          <DebouncedNumberInput
            testId="roof-base-offset-input"
            label="Décalage vertical (baseOffset mm)"
            value={roof.baseOffset ?? 0}
            step={50}
            onChange={(baseOffset) => {
              execute(new Commands.UpdateRoofCommand(roof.id, { baseOffset }));
            }}
          />

          {isGable && (
            <>
              <DebouncedNumberInput
                testId="roof-slope-input"
                label="Pente (°)"
                value={roof.slopeOverrideDeg ?? (currentRoofType && currentRoofType.family === 'gable' ? currentRoofType.slopeDeg : 35)}
                min={5}
                max={60}
                step={1}
                onChange={(slopeOverrideDeg) => {
                  execute(new Commands.UpdateRoofCommand(roof.id, { slopeOverrideDeg }));
                }}
              />

              <DebouncedNumberInput
                testId="roof-overhang-input"
                label="Débord de toiture (mm)"
                value={roof.overhangOverrideMm ?? (currentRoofType && currentRoofType.family === 'gable' ? (currentRoofType.overhangMm ?? 0) : 0)}
                min={0}
                max={2000}
                step={50}
                onChange={(overhangOverrideMm) => {
                  execute(new Commands.UpdateRoofCommand(roof.id, { overhangOverrideMm }));
                }}
              />
            </>
          )}

          <button
            type="button"
            data-testid="delete-roof-btn"
            onClick={() => {
              execute(new Commands.DeleteRoofCommand(roof.id));
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              borderRadius: '4px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              marginTop: '12px',
            }}
          >
            Supprimer la toiture
          </button>
        </div>
      );
    }

    return <div style={{ color: '#9ca3af', fontSize: '12px' }}>Élément sélectionné : {id}</div>;
  };

  return (
    <aside
      data-testid="property-inspector"
      style={{
        width: '280px',
        height: '100%',
        backgroundColor: '#111827',
        borderLeft: '1px solid #374151',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #374151',
          backgroundColor: '#1f2937',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6' }}>Propriétés</span>
        <button
          type="button"
          data-testid="toggle-inspector-btn"
          onClick={toggle}
          title="Réduire l'inspecteur"
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          ▶
        </button>
      </header>

      <div style={{ padding: '14px', flex: 1 }}>{renderContent()}</div>
    </aside>
  );
}
