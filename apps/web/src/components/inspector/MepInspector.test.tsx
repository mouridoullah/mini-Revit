import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BimDocument,
  type Pipe,
  type Duct,
  type CableTray,
  UpdateMepElementCommand,
  DeleteMepElementCommand,
  AddPipeCommand,
  type BimState,
} from '@tabax/core';
import { MepInspector } from './MepInspector.js';
import { PropertyInspector } from '../PropertyInspector.js';

describe('MepInspector — Inspecteur de propriétés pour éléments techniques MEP (Sous-phase 9.3.2)', () => {
  const dummyState: BimState = {
    ...BimDocument.createDefaultProject().getState(),
    pipes: {
      'pipe-1': {
        id: 'pipe-1',
        category: 'pipe',
        name: 'Tuyau EF Principal',
        levelId: 'lvl_rdc',
        diameter: 50,
        start: { x: 0, y: 0, z: 2500 },
        end: { x: 2000, y: 0, z: 2500 },
        ports: [
          {
            id: 'port-1',
            elementId: 'pipe-1',
            domain: 'plumbing',
            systemType: 'domestic_cold_water',
            flowDirection: 'bidirectional',
            shape: 'round',
            diameter: 50,
            position: { x: 0, y: 0, z: 2500 },
            direction: { x: -1, y: 0, z: 0 },
          },
          {
            id: 'port-2',
            elementId: 'pipe-1',
            domain: 'plumbing',
            systemType: 'domestic_cold_water',
            flowDirection: 'bidirectional',
            shape: 'round',
            diameter: 50,
            position: { x: 2000, y: 0, z: 2500 },
            direction: { x: 1, y: 0, z: 0 },
          },
        ],
      } as Pipe,
    },
    ducts: {
      'duct-1': {
        id: 'duct-1',
        category: 'duct',
        name: 'Gaine Soufflage RDC',
        levelId: 'lvl_rdc',
        shape: 'rectangular',
        width: 400,
        height: 250,
        start: { x: 0, y: 1000, z: 2700 },
        end: { x: 3000, y: 1000, z: 2700 },
        ports: [
          {
            id: 'port-d1',
            elementId: 'duct-1',
            domain: 'hvac',
            systemType: 'supply_air',
            flowDirection: 'bidirectional',
            shape: 'rectangular',
            width: 400,
            height: 250,
            position: { x: 0, y: 1000, z: 2700 },
            direction: { x: -1, y: 0, z: 0 },
          },
          {
            id: 'port-d2',
            elementId: 'duct-1',
            domain: 'hvac',
            systemType: 'supply_air',
            flowDirection: 'bidirectional',
            shape: 'rectangular',
            width: 400,
            height: 250,
            position: { x: 3000, y: 1000, z: 2700 },
            direction: { x: 1, y: 0, z: 0 },
          },
        ],
      } as Duct,
    },
    cableTrays: {
      'ct-1': {
        id: 'ct-1',
        category: 'cableTray',
        name: 'CFO Principal',
        levelId: 'lvl_rdc',
        width: 200,
        height: 60,
        start: { x: 500, y: 0, z: 2800 },
        end: { x: 500, y: 4000, z: 2800 },
        ports: [
          {
            id: 'port-ct1',
            elementId: 'ct-1',
            domain: 'electrical',
            systemType: 'power',
            flowDirection: 'bidirectional',
            shape: 'rectangular',
            width: 200,
            height: 60,
            position: { x: 500, y: 0, z: 2800 },
            direction: { x: 0, y: -1, z: 0 },
          },
          {
            id: 'port-ct2',
            elementId: 'ct-1',
            domain: 'electrical',
            systemType: 'power',
            flowDirection: 'bidirectional',
            shape: 'rectangular',
            width: 200,
            height: 60,
            position: { x: 500, y: 4000, z: 2800 },
            direction: { x: 0, y: 1, z: 0 },
          },
        ],
      } as CableTray,
    },
    mepConnectors: {
      'conn-1': {
        id: 'conn-1',
        category: 'mepConnector',
        portAId: 'port-1',
        portBId: 'other-port',
      },
    },
  };

  it('T-MEP-INSP-01 : affiche les propriétés d’un tuyau (Pipe) avec son statut de ports', () => {
    const onExecute = vi.fn();
    render(<MepInspector elementId="pipe-1" state={dummyState} onExecute={onExecute} />);

    expect(screen.getByTestId('inspector-mep-panel')).toBeDefined();
    expect(screen.getByTestId('mep-id').textContent).toBe('pipe-1');
    expect(screen.getByText('Tuyauterie')).toBeDefined();
    expect(screen.getByTestId('mep-length').textContent).toContain('2000 mm');

    // Vérifier les statuts des ports (port-1 connecté, port-2 libre)
    const port0 = screen.getByTestId('mep-port-status-0');
    expect(port0.textContent).toContain('Connecté');
    const port1 = screen.getByTestId('mep-port-status-1');
    expect(port1.textContent).toContain('Libre (ouvert)');

    // Vérifier la présence du champ diamètre
    const diamInput = screen.getByTestId('mep-diameter-input') as HTMLInputElement;
    expect(diamInput.value).toBe('50');
  });

  it('T-MEP-INSP-02 : modification du diamètre d’un tuyau émet UpdateMepElementCommand', () => {
    const onExecute = vi.fn();
    render(<MepInspector elementId="pipe-1" state={dummyState} onExecute={onExecute} />);

    const diamInput = screen.getByTestId('mep-diameter-input') as HTMLInputElement;
    fireEvent.change(diamInput, { target: { value: '80' } });
    fireEvent.blur(diamInput);

    expect(onExecute).toHaveBeenCalledTimes(1);
    const cmd = onExecute.mock.calls[0]?.[0];
    expect(cmd).toBeInstanceOf(UpdateMepElementCommand);
    expect(cmd.elementId).toBe('pipe-1');
    expect(cmd.patch).toEqual({ diameter: 80 });
  });

  it('T-MEP-INSP-03 : inspection et modification d’une gaine rectangulaire (Duct)', () => {
    const onExecute = vi.fn();
    render(<MepInspector elementId="duct-1" state={dummyState} onExecute={onExecute} />);

    expect(screen.getByText('Gaine Aéraulique')).toBeDefined();
    const widthInput = screen.getByTestId('mep-width-input') as HTMLInputElement;
    const heightInput = screen.getByTestId('mep-height-input') as HTMLInputElement;

    expect(widthInput.value).toBe('400');
    expect(heightInput.value).toBe('250');

    fireEvent.change(widthInput, { target: { value: '500' } });
    fireEvent.blur(widthInput);

    expect(onExecute).toHaveBeenCalledWith(expect.any(UpdateMepElementCommand));
    const cmd = onExecute.mock.calls[0]?.[0];
    expect(cmd.elementId).toBe('duct-1');
    expect(cmd.patch).toEqual({ width: 500 });
  });

  it('T-MEP-INSP-04 : inspection et modification d’un chemin de câbles (CableTray)', () => {
    const onExecute = vi.fn();
    render(<MepInspector elementId="ct-1" state={dummyState} onExecute={onExecute} />);

    expect(screen.getByText('Chemin de Câbles')).toBeDefined();
    const heightInput = screen.getByTestId('mep-height-input') as HTMLInputElement;
    expect(heightInput.value).toBe('60');

    fireEvent.change(heightInput, { target: { value: '100' } });
    fireEvent.blur(heightInput);

    expect(onExecute).toHaveBeenCalledWith(expect.any(UpdateMepElementCommand));
    const cmd = onExecute.mock.calls[0]?.[0];
    expect(cmd.elementId).toBe('ct-1');
    expect(cmd.patch).toEqual({ height: 100 });
  });

  it('T-MEP-INSP-05 : le bouton Supprimer émet DeleteMepElementCommand', () => {
    const onExecute = vi.fn();
    render(<MepInspector elementId="pipe-1" state={dummyState} onExecute={onExecute} />);

    const delBtn = screen.getByTestId('mep-delete-btn');
    fireEvent.click(delBtn);

    expect(onExecute).toHaveBeenCalledTimes(1);
    const cmd = onExecute.mock.calls[0]?.[0];
    expect(cmd).toBeInstanceOf(DeleteMepElementCommand);
    expect(cmd.elementId).toBe('pipe-1');
  });

  it('T-MEP-INSP-06 : intégration dans PropertyInspector lorsqu’un élément MEP est sélectionné', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const pipe: Pipe = {
      id: 'pipe-integ',
      category: 'pipe',
      name: 'Tuyau Intégration',
      levelId,
      diameter: 65,
      start: { x: 100, y: 100, z: 2500 },
      end: { x: 2100, y: 100, z: 2500 },
      ports: [
        {
          id: 'port-i1',
          elementId: 'pipe-integ',
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          flowDirection: 'bidirectional',
          shape: 'round',
          diameter: 65,
          position: { x: 100, y: 100, z: 2500 },
          direction: { x: -1, y: 0, z: 0 },
        },
        {
          id: 'port-i2',
          elementId: 'pipe-integ',
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          flowDirection: 'bidirectional',
          shape: 'round',
          diameter: 65,
          position: { x: 2100, y: 100, z: 2500 },
          direction: { x: 1, y: 0, z: 0 },
        },
      ],
    };

    doc.execute(new AddPipeCommand(pipe));

    render(<PropertyInspector doc={doc} selectedIds={['pipe-integ']} />);

    expect(screen.getByTestId('inspector-mep-panel')).toBeDefined();
    expect(screen.getByTestId('mep-id').textContent).toBe('pipe-integ');

    // Cliquer sur le bouton supprimer
    const delBtn = screen.getByTestId('mep-delete-btn');
    fireEvent.click(delBtn);

    // L'élément doit être supprimé du doc
    expect(doc.getState().pipes?.['pipe-integ']).toBeUndefined();
  });
});
