import { type ChangeEvent } from 'react';
import { type Level } from '@tabax/core';

export interface LevelSelectorProps {
  readonly levels: readonly Level[];
  readonly activeLevelId: string;
  readonly onSelectLevel: (levelId: string) => void;
}

/**
 * Sélecteur d'étage actif (Niveau de travail) pour l'application Mini-BIM.
 * Filtre les éléments du plan d'étage 2D et assigne les nouveaux éléments créés.
 *
 * Conforme à ADR-025 / ADR-046 : état éphémère d'interface utilisateur,
 * totalement découplé de la persistance documentaire BimDocument.
 */
export function LevelSelector({ levels, activeLevelId, onSelectLevel }: LevelSelectorProps) {
  // Trier les niveaux par élévation croissante
  const sortedLevels = [...levels].sort((a, b) => a.elevation - b.elevation);

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onSelectLevel(e.target.value);
  };

  return (
    <div
      data-testid="level-selector-container"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
      }}
    >
      <label
        htmlFor="level-select"
        style={{
          color: '#9ca3af',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        Étage :
      </label>
      <select
        id="level-select"
        data-testid="level-selector"
        value={activeLevelId}
        onChange={handleChange}
        style={{
          padding: '4px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          backgroundColor: '#374151',
          color: '#ffffff',
          border: '1px solid #4b5563',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {sortedLevels.map((lvl) => (
          <option key={lvl.id} value={lvl.id}>
            {lvl.name} ({lvl.elevation >= 0 ? `+${lvl.elevation}` : lvl.elevation} mm)
          </option>
        ))}
      </select>
    </div>
  );
}
