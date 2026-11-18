import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createDefaultComponentTypes } from '@mini-bim/core';
import { ComponentRibbon } from './ComponentRibbon.js';

describe('ComponentRibbon (apps/web/src/components/ComponentRibbon.tsx — Phase 8.3)', () => {
  const componentTypes = createDefaultComponentTypes();

  it('monte le bandeau avec tous les composants et onglets de familles', () => {
    const onSelect = vi.fn();
    const onRotate = vi.fn();

    render(
      <ComponentRibbon
        componentTypes={componentTypes}
        activeComponentTypeId="ct_toilet_wall_hung"
        onSelectComponentType={onSelect}
        onRotate={onRotate}
      />,
    );

    expect(screen.getByTestId('component-ribbon')).toBeDefined();
    expect(screen.getByTestId('family-tab-all')).toBeDefined();
    expect(screen.getByTestId('family-tab-sanitary')).toBeDefined();
    expect(screen.getByTestId('family-tab-kitchen')).toBeDefined();
    expect(screen.getByTestId('family-tab-furniture')).toBeDefined();
    expect(screen.getByTestId('family-tab-glazing')).toBeDefined();

    // Filtre sur "Sanitaires"
    fireEvent.click(screen.getByTestId('family-tab-sanitary'));
    expect(screen.getByTestId('component-item-ct_toilet_wall_hung')).toBeDefined();

    // Clic sur un composant pour le sélectionner
    fireEvent.click(screen.getByTestId('component-item-ct_toilet_wall_hung'));
    expect(onSelect).toHaveBeenCalledWith('ct_toilet_wall_hung');

    // Clic sur bouton pivoter
    fireEvent.click(screen.getByTestId('component-rotate-btn'));
    expect(onRotate).toHaveBeenCalledTimes(1);
  });
});
