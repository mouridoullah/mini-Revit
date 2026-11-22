/**
 * Tests unitaires du composant FederatedIfcPanel (Sous-phase 9.5).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FederatedIfcPanel, type FederatedModelOptions } from './FederatedIfcPanel.js';
import { type FederatedModel, type FederatedEntity } from '@tabax/core';

describe('Composant FederatedIfcPanel (apps/web/src/components/FederatedIfcPanel.tsx)', () => {
  const sampleEntity: FederatedEntity = {
    expressId: 42,
    globalId: '2pLfZM1ofDwxr2zh7k$Qwr',
    ifcType: 'IfcWall',
    name: 'Mur Porteur Façade Sud',
    modelId: 'fed_mod_01',
    aabb: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 4000, y: 200, z: 2800 },
    },
    propertySets: [
      {
        name: 'BaseQuantities',
        properties: {
          Length: 4000,
          Height: 2800,
          Width: 200,
        },
      },
    ],
  };

  const sampleModel: FederatedModel = {
    id: 'fed_mod_01',
    name: 'Structure Béton Externe.ifc',
    schema: 'IFC4',
    units: { length: 'MILLIMETRE', scaleToMm: 1.0 },
    globalAABB: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10000, y: 8000, z: 3000 },
    },
    entities: { 42: sampleEntity },
    meshes: [],
    entityCount: 1,
  };

  const sampleOptions = new Map<string, FederatedModelOptions>([
    [
      'fed_mod_01',
      {
        visible: true,
        opacity: 0.35,
        wireframe: false,
        offset: { x: 0, y: 0, z: 0 },
      },
    ],
  ]);

  it('T-FED-UI-01 : Affiche le message vide lorsqu’aucune maquette n’est chargée', () => {
    render(<FederatedIfcPanel models={[]} options={new Map()} isCollapsed={false} />);

    expect(screen.getByText('Aucune maquette IFC chargée')).toBeDefined();
    expect(screen.getByText(/Chargez un fichier \.ifc en lecture seule/)).toBeDefined();
  });

  it('T-FED-UI-02 : Affiche les métadonnées et permet le contrôle de visibilité et d’opacité', () => {
    const handleUpdateOptions = vi.fn();
    const handleUnload = vi.fn();

    render(
      <FederatedIfcPanel
        models={[sampleModel]}
        options={sampleOptions}
        isCollapsed={false}
        onUpdateOptions={handleUpdateOptions}
        onUnloadModel={handleUnload}
      />,
    );

    expect(screen.getByText('Structure Béton Externe.ifc')).toBeDefined();
    expect(screen.getByText(/IFC4 • MILLIMETRE • 1 entités/)).toBeDefined();

    // 1. Toggle visibilité
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!); // Afficher
    expect(handleUpdateOptions).toHaveBeenCalledWith('fed_mod_01', { visible: false });

    // 2. Curseur opacité
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.6' } });
    expect(handleUpdateOptions).toHaveBeenCalledWith('fed_mod_01', { opacity: 0.6 });

    // 3. Décharger
    const unloadBtn = screen.getByTestId('unload-model-btn-fed_mod_01');
    fireEvent.click(unloadBtn);
    expect(handleUnload).toHaveBeenCalledWith('fed_mod_01');
  });

  it('T-FED-UI-03 : Inspecteur affiche le type IFC, GlobalId et PropertySets de l’entité sélectionnée', () => {
    const handleFocus = vi.fn();

    render(
      <FederatedIfcPanel
        models={[sampleModel]}
        options={sampleOptions}
        selectedEntity={{ modelId: 'fed_mod_01', entity: sampleEntity }}
        isCollapsed={false}
        onFocusPoint={handleFocus}
      />,
    );

    // Basculer sur l'onglet Inspecteur
    const inspectorTab = screen.getByTestId('tab-inspector-btn');
    fireEvent.click(inspectorTab);

    expect(screen.getByText('IfcWall')).toBeDefined();
    expect(screen.getByText('Mur Porteur Façade Sud')).toBeDefined();
    expect(screen.getByText(/GlobalId : 2pLfZM1ofDwxr2zh7k\$Qwr/)).toBeDefined();
    expect(screen.getByText('BaseQuantities')).toBeDefined();
    expect(screen.getByText('Length :')).toBeDefined();
    expect(screen.getByText('4000')).toBeDefined();

    // Bouton de ciblage
    const focusBtn = screen.getByTestId('focus-entity-btn');
    fireEvent.click(focusBtn);
    expect(handleFocus).toHaveBeenCalledWith({ x: 2000, y: 100, z: 1400 });
  });

  it('T-FED-UI-04 : L’onglet Conflits affiche les interférences spatiales BVH', () => {
    const handleFocus = vi.fn();
    const handleTargetClash = vi.fn();

    render(
      <FederatedIfcPanel
        models={[sampleModel]}
        options={sampleOptions}
        isCollapsed={false}
        onFocusPoint={handleFocus}
        onTargetClash={handleTargetClash}
        clashCandidates={[
          {
            modelId: 'fed_mod_01',
            expressId: 42,
            ifcType: 'IfcWall',
            nativeId: 'pipe_san_01',
            nativeCategory: 'pipe',
            intersectionBox: {
              min: { x: 1950, y: -50, z: 1150 },
              max: { x: 2050, y: 50, z: 1250 },
            },
            point: { x: 2000, y: 0, z: 1200 },
            penetrationEstimateMm: 100,
            status: 'CANDIDATE',
          },
        ]}
      />,
    );

    // Basculer sur l'onglet Conflits
    const clashesTab = screen.getByTestId('tab-clashes-btn');
    fireEvent.click(clashesTab);

    expect(screen.getByText(/pipe #pipe_san_01/)).toBeDefined();
    expect(screen.getByText(/Pénétration est\. : 100 mm/)).toBeDefined();

    const ciblerBtn = screen.getByText('Cibler');
    fireEvent.click(ciblerBtn);
    expect(handleTargetClash).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'fed_mod_01', expressId: 42, nativeId: 'pipe_san_01' }),
    );
    expect(handleFocus).not.toHaveBeenCalled();
  });
});
