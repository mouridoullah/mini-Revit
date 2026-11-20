import { useState } from 'react';
import type { ComponentType, ComponentFamily } from '@mini-bim/core';

export interface ComponentRibbonProps {
  readonly componentTypes: Record<string, ComponentType>;
  readonly activeComponentTypeId: string;
  readonly onSelectComponentType: (typeId: string) => void;
  readonly onRotate?: () => void;
}

const FAMILY_TABS: readonly { readonly key: 'all' | ComponentFamily; readonly label: string }[] = [
  { key: 'all', label: 'Tous (15)' },
  { key: 'sanitary', label: 'Sanitaires' },
  { key: 'kitchen', label: 'Cuisine' },
  { key: 'furniture', label: 'Mobilier' },
  { key: 'glazing', label: 'Menuiseries' },
];

export function ComponentRibbon({
  componentTypes,
  activeComponentTypeId,
  onSelectComponentType,
  onRotate,
}: ComponentRibbonProps) {
  const [selectedFamily, setSelectedFamily] = useState<'all' | ComponentFamily>('all');

  const typesList = Object.values(componentTypes);
  const filteredTypes =
    selectedFamily === 'all'
      ? typesList
      : typesList.filter((ct) => ct.family === selectedFamily);

  const activeType = componentTypes[activeComponentTypeId];

  return (
    <div
      data-testid="component-ribbon"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '6px 16px',
        gap: '6px',
        color: '#f8fafc',
        userSelect: 'none',
      }}
    >
      {/* 1. Onglets des familles architecturales */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {FAMILY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-testid={`family-tab-${tab.key}`}
              onClick={() => setSelectedFamily(tab.key)}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: selectedFamily === tab.key ? 600 : 400,
                borderRadius: '4px',
                backgroundColor: selectedFamily === tab.key ? '#3b82f6' : '#334155',
                color: selectedFamily === tab.key ? '#ffffff' : '#cbd5e1',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#94a3b8' }}>
          <span><b>Espace</b> : Pivoter 90°</span>
          {onRotate && (
            <button
              type="button"
              data-testid="component-rotate-btn"
              onClick={onRotate}
              style={{
                padding: '3px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#475569',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ↻ Pivoter 90°
            </button>
          )}
          {activeType && (
            <span style={{ color: '#38bdf8' }}>
              Format : {activeType.width} × {activeType.depth} × {activeType.height} mm
            </span>
          )}
        </div>
      </div>

      {/* 2. Galerie horizontale des composants */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {filteredTypes.map((ct) => {
          const isSelected = ct.id === activeComponentTypeId;
          return (
            <button
              key={ct.id}
              type="button"
              data-testid={`component-item-${ct.id}`}
              onClick={() => onSelectComponentType(ct.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                backgroundColor: isSelected ? '#2563eb' : '#0f172a',
                color: isSelected ? '#ffffff' : '#e2e8f0',
                border: isSelected ? '1px solid #60a5fa' : '1px solid #334155',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontWeight: 500 }}>{ct.name}</span>
              <span style={{ fontSize: '10px', opacity: 0.75 }}>
                {ct.width}×{ct.depth}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
