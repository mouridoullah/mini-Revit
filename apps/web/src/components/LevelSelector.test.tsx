import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LevelSelector } from './LevelSelector.js';
import { type Level } from '@mini-bim/core';

describe('LevelSelector — Sélecteur d’étage de travail (Phase 6.1b)', () => {
  const sampleLevels: readonly Level[] = [
    { id: 'lvl_rdc', name: 'RDC', elevation: 0 },
    { id: 'lvl_r1', name: 'R+1', elevation: 3000 },
    { id: 'lvl_sous_sol', name: 'Sous-sol', elevation: -2800 },
  ];

  it('T-LEVEL-SEL-01 : affiche tous les niveaux triés par élévation croissante', () => {
    render(<LevelSelector levels={sampleLevels} activeLevelId="lvl_rdc" onSelectLevel={vi.fn()} />);

    const select = screen.getByTestId('level-selector') as HTMLSelectElement;
    expect(select).toBeDefined();

    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options).toHaveLength(3);
    // Triés : Sous-sol (-2800), RDC (0), R+1 (3000)
    expect(options[0]?.value).toBe('lvl_sous_sol');
    expect(options[0]?.text).toContain('Sous-sol (-2800 mm)');
    expect(options[1]?.value).toBe('lvl_rdc');
    expect(options[1]?.text).toContain('RDC (+0 mm)');
    expect(options[2]?.value).toBe('lvl_r1');
    expect(options[2]?.text).toContain('R+1 (+3000 mm)');
  });

  it('T-LEVEL-SEL-02 : la sélection d’un autre niveau déclenche onSelectLevel avec son ID', () => {
    const handleSelect = vi.fn();
    render(
      <LevelSelector levels={sampleLevels} activeLevelId="lvl_rdc" onSelectLevel={handleSelect} />,
    );

    const select = screen.getByTestId('level-selector');
    fireEvent.change(select, { target: { value: 'lvl_r1' } });

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith('lvl_r1');
  });

  it('T-LEVEL-SEL-03 : affiche fidèlement la valeur activeLevelId passée en prop', () => {
    render(<LevelSelector levels={sampleLevels} activeLevelId="lvl_r1" onSelectLevel={vi.fn()} />);

    const select = screen.getByTestId('level-selector') as HTMLSelectElement;
    expect(select.value).toBe('lvl_r1');
  });
});
