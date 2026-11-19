/**
 * @mini-bim/web/components/MepRibbon
 *
 * Bandeau d'options contextuel pour la modélisation MEP (Sous-phase 9.3.2).
 * Sélection de catégorie, fluide/système, dimensions nominales et bascule Unifilaire/Bifilaire.
 */

import type { MepToolConfig } from '../tools/types.js';

export interface MepRibbonProps {
  readonly config: MepToolConfig;
  readonly onChangeConfig: (patch: Partial<MepToolConfig>) => void;
  readonly displayMode: 'single-line' | 'double-line';
  readonly onToggleDisplayMode: (mode: 'single-line' | 'double-line') => void;
}

const CATEGORY_ITEMS: readonly {
  readonly key: 'pipe' | 'duct-round' | 'duct-rect' | 'cableTray';
  readonly label: string;
  readonly category: 'pipe' | 'duct' | 'cableTray';
  readonly shape?: 'round' | 'rectangular';
}[] = [
  { key: 'pipe', label: 'Tuyau (Pipe)', category: 'pipe', shape: 'round' },
  { key: 'duct-round', label: 'Gaine Ronde', category: 'duct', shape: 'round' },
  { key: 'duct-rect', label: 'Gaine Rectangulaire', category: 'duct', shape: 'rectangular' },
  { key: 'cableTray', label: 'Chemin de Câbles', category: 'cableTray' },
];

const SYSTEM_OPTIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly domain: 'plumbing' | 'hvac' | 'hydronic' | 'electrical';
  readonly color: string;
}[] = [
  { id: 'domestic_cold_water', label: 'Eau Froide (EF)', domain: 'plumbing', color: '#2563eb' },
  { id: 'domestic_hot_water', label: 'Eau Chaude Sanitaire (ECS)', domain: 'plumbing', color: '#dc2626' },
  { id: 'hydronic_supply', label: 'Chauffage Aller', domain: 'hydronic', color: '#0891b2' },
  { id: 'hydronic_return', label: 'Chauffage Retour', domain: 'hydronic', color: '#be185d' },
  { id: 'supply_air', label: 'VMC Soufflage', domain: 'hvac', color: '#0284c7' },
  { id: 'return_air', label: 'VMC Reprise', domain: 'hvac', color: '#ea580c' },
  { id: 'power', label: 'Électricité (Fort)', domain: 'electrical', color: '#f59e0b' },
];

export function MepRibbon({
  config,
  onChangeConfig,
  displayMode,
  onToggleDisplayMode,
}: MepRibbonProps) {
  const currentCategoryKey =
    config.category === 'pipe'
      ? 'pipe'
      : config.category === 'cableTray'
        ? 'cableTray'
        : config.shape === 'round'
          ? 'duct-round'
          : 'duct-rect';

  const isRectangular = config.category === 'cableTray' || (config.category === 'duct' && config.shape === 'rectangular');

  return (
    <div
      data-testid="mep-ribbon"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '6px 16px',
        color: '#f8fafc',
        fontSize: '12px',
        userSelect: 'none',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      {/* 1. Sélecteur de catégorie MEP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontWeight: 600, color: '#94a3b8', marginRight: '4px' }}>Réseau :</span>
        {CATEGORY_ITEMS.map((item) => {
          const isActive = currentCategoryKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`mep-cat-${item.key}`}
              onClick={() => {
                onChangeConfig({
                  category: item.category,
                  ...(item.shape ? { shape: item.shape } : {}),
                });
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 400,
                backgroundColor: isActive ? '#3b82f6' : '#334155',
                color: isActive ? '#ffffff' : '#cbd5e1',
                border: isActive ? '1px solid #60a5fa' : '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 2. Sélecteur de fluide / système */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 600, color: '#94a3b8' }}>Système :</span>
        <select
          data-testid="mep-system-select"
          value={config.systemType ?? 'domestic_cold_water'}
          onChange={(e) => {
            const sys = SYSTEM_OPTIONS.find((s) => s.id === e.target.value);
            if (sys) {
              onChangeConfig({
                systemType: sys.id,
                domain: sys.domain,
              });
            }
          }}
          style={{
            padding: '3px 8px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #475569',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {SYSTEM_OPTIONS.map((sys) => (
            <option key={sys.id} value={sys.id}>
              {sys.label}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Dimensions nominales */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {!isRectangular ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Ø (mm) :</span>
            <input
              type="number"
              data-testid="mep-diameter-input"
              value={config.diameter ?? 50}
              min={10}
              max={1000}
              step={10}
              onChange={(e) => onChangeConfig({ diameter: Math.max(10, Number(e.target.value) || 50) })}
              style={{
                width: '60px',
                padding: '2px 6px',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '4px',
                fontSize: '11px',
              }}
            />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#94a3b8' }}>L (mm) :</span>
              <input
                type="number"
                data-testid="mep-width-input"
                value={config.width ?? 300}
                min={50}
                max={2000}
                step={25}
                onChange={(e) => onChangeConfig({ width: Math.max(50, Number(e.target.value) || 300) })}
                style={{
                  width: '60px',
                  padding: '2px 6px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#94a3b8' }}>H (mm) :</span>
              <input
                type="number"
                data-testid="mep-height-input"
                value={config.height ?? 200}
                min={30}
                max={1500}
                step={25}
                onChange={(e) => onChangeConfig({ height: Math.max(30, Number(e.target.value) || 200) })}
                style={{
                  width: '60px',
                  padding: '2px 6px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              />
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#94a3b8' }}>Élévation (mm) :</span>
          <input
            type="number"
            data-testid="mep-elevation-input"
            value={config.elevationOffsetMm ?? 2500}
            min={0}
            max={10000}
            step={100}
            onChange={(e) => onChangeConfig({ elevationOffsetMm: Number(e.target.value) || 2500 })}
            style={{
              width: '70px',
              padding: '2px 6px',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #475569',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          />
        </div>
      </div>

      {/* 4. Bascule Unifilaire / Bifilaire */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontWeight: 600, color: '#94a3b8' }}>Mode 2D :</span>
        <button
          type="button"
          data-testid="mep-mode-toggle"
          onClick={() => onToggleDisplayMode(displayMode === 'single-line' ? 'double-line' : 'single-line')}
          style={{
            padding: '3px 10px',
            backgroundColor: displayMode === 'double-line' ? '#0284c7' : '#334155',
            color: '#f8fafc',
            border: '1px solid #475569',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {displayMode === 'single-line' ? 'Unifilaire' : 'Bifilaire'}
        </button>
      </div>
    </div>
  );
}
