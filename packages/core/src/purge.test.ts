import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  Commands,
  type Door,
  type Window,
  type Wall,
  type Level,
} from './index.js';

describe('Phase 6.2a — Purge Définitive des Champs Transitoires V1', () => {
  it('T-PURGE-01 : Door ne contient plus kind?, width?, height?', () => {
    const door: Door = {
      id: 'door-purge-1',
      category: 'door',
      doorTypeId: 'door-type-900x2100',
      hostWallId: 'w1',
      offsetAlong: 500,
      swing: { side: 'left', direction: 'in' },
    };

    expect(door.category).toBe('door');
    expect(door.doorTypeId).toBe('door-type-900x2100');
    // Vérification à l'exécution : aucune propriété transitoire n'est présente
    expect('width' in door).toBe(false);
    expect('height' in door).toBe(false);
    expect('kind' in door).toBe(false);
  });

  it('T-PURGE-02 : Window ne contient plus kind?, width?, height?', () => {
    const win: Window = {
      id: 'win-purge-1',
      category: 'window',
      windowTypeId: 'window-type-1200x1400-s900',
      hostWallId: 'w1',
      offsetAlong: 1500,
      sillHeight: 900,
    };

    expect(win.category).toBe('window');
    expect(win.windowTypeId).toBe('window-type-1200x1400-s900');
    expect(win.sillHeight).toBe(900);
    expect('width' in win).toBe(false);
    expect('height' in win).toBe(false);
    expect('kind' in win).toBe(false);
  });

  it('T-PURGE-03 : AddDoorCommand et AddWindowCommand résolvent les dimensions depuis DoorType et WindowType', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const wallTypeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w-test-purge',
      category: 'wall',
      typeId: wallTypeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const door: Door = {
      id: 'd-test-purge',
      category: 'door',
      doorTypeId: 'door-type-900x2100',
      hostWallId: wall.id,
      offsetAlong: 1000,
      swing: { side: 'right', direction: 'in' },
    };
    doc.execute(new Commands.AddDoorCommand(door));

    const win: Window = {
      id: 'win-test-purge',
      category: 'window',
      windowTypeId: 'window-type-1200x1400-s900',
      hostWallId: wall.id,
      offsetAlong: 2500,
      sillHeight: 900,
    };
    doc.execute(new Commands.AddWindowCommand(win));

    const updatedState = doc.getState();
    const savedDoor = updatedState.doors['d-test-purge'];
    const savedWin = updatedState.windows['win-test-purge'];

    expect(savedDoor).toBeDefined();
    expect(savedWin).toBeDefined();

    // Résolution via les types
    const doorType = updatedState.doorTypes[savedDoor!.doorTypeId];
    const winType = updatedState.windowTypes[savedWin!.windowTypeId];

    expect(doorType?.width).toBe(900);
    expect(doorType?.height).toBe(2100);
    expect(winType?.width).toBe(1200);
    expect(winType?.height).toBe(1400);

    // Les instances n'ont pas les champs transitoires
    expect((savedDoor as unknown as Record<string, unknown>).width).toBeUndefined();
    expect((savedDoor as unknown as Record<string, unknown>).height).toBeUndefined();
    expect((savedWin as unknown as Record<string, unknown>).width).toBeUndefined();
    expect((savedWin as unknown as Record<string, unknown>).height).toBeUndefined();
  });

  it('T-PURGE-04 : Round-trip JSON préserve le modèle sans régénérer les champs transitoires', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const wallTypeId = Object.keys(state.wallTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w-rt',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd-rt',
        category: 'door',
        doorTypeId: 'door-type-900x2100',
        hostWallId: 'w-rt',
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const jsonStr = JSON.stringify(doc.getState());
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const doors = parsed.doors as Record<string, Record<string, unknown>>;
    expect(doors['d-rt']?.['width']).toBeUndefined();
    expect(doors['d-rt']?.['height']).toBeUndefined();
    expect(doors['d-rt']?.['kind']).toBeUndefined();
    expect(doors['d-rt']?.['doorTypeId']).toBe('door-type-900x2100');
  });

  it('T-PURGE-05 : UpdateDoorCommand déduplique les DoorTypes existants et ne pollue pas l instance', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const wallTypeId = Object.keys(state.wallTypes)[0]!;

    const defaultDoorTypeId = Object.keys(doc.getState().doorTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w-dedup',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd-dedup',
        category: 'door',
        doorTypeId: defaultDoorTypeId,
        hostWallId: 'w-dedup',
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    // Initial : 1 DoorType (default-door-type, 900x2100)
    const initialTypesCount = Object.keys(doc.getState().doorTypes).length;

    // 1. Mise à jour vers 900x2100 (type déjà existant) : doit réutiliser et ne pas dupliquer
    doc.execute(
      new Commands.UpdateDoorCommand(
        'd-dedup',
        { width: 900, height: 2100 } as unknown as Partial<Door>,
      ),
    );
    expect(Object.keys(doc.getState().doorTypes).length).toBe(initialTypesCount);
    expect(doc.getState().doors['d-dedup']?.doorTypeId).toBe(defaultDoorTypeId);
    expect('width' in (doc.getState().doors['d-dedup'] ?? {})).toBe(false);

    // 2. Mise à jour vers de nouvelles dimensions 1000x2150 : crée un type déterministe
    doc.execute(
      new Commands.UpdateDoorCommand(
        'd-dedup',
        { width: 1000, height: 2150 } as unknown as Partial<Door>,
      ),
    );
    expect(Object.keys(doc.getState().doorTypes).length).toBe(initialTypesCount + 1);
    expect(doc.getState().doors['d-dedup']?.doorTypeId).toBe('door-type-1000x2150');
    expect(doc.getState().doorTypes['door-type-1000x2150']?.width).toBe(1000);
    expect(doc.getState().doorTypes['door-type-1000x2150']?.height).toBe(2150);

    // 3. Ré-application de 1000x2150 : déduplication immédiate, aucun type supplémentaire
    doc.execute(
      new Commands.UpdateDoorCommand(
        'd-dedup',
        { width: 1000, height: 2150 } as unknown as Partial<Door>,
      ),
    );
    expect(Object.keys(doc.getState().doorTypes).length).toBe(initialTypesCount + 1);
  });
});
