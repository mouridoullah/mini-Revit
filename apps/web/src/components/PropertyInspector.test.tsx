import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BimDocument, Commands, type Wall, type Slab, type Level } from '@mini-bim/core';
import { PropertyInspector } from './PropertyInspector.js';

describe('PropertyInspector — Panneau latéral d’inspection et d’édition BIM (Milestone 6.1b-2)', () => {
  let doc: BimDocument;
  let level0Id: string;
  let level1Id: string;
  let wallTypeId: string;
  let slabTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    level0Id = Object.keys(state.levels)[0]!;
    wallTypeId = Object.keys(state.wallTypes)[0]!;
    slabTypeId = Object.keys(state.slabTypes ?? {})[0]!;

    // Ajouter un niveau supérieur R+1 (alt: 3000)
    const level1: Level = {
      id: 'lvl-r1',
      name: 'R+1',
      elevation: 3000,
    };
    doc.execute(new Commands.AddLevelCommand(level1));
    level1Id = level1.id;
  });

  it('T-INSPECT-01 : états d’affichage (vide, multiple, rétracté)', () => {
    const { rerender } = render(<PropertyInspector doc={doc} selectedIds={[]} />);
    expect(screen.getByTestId('inspector-no-selection')).toBeDefined();

    // Sélection multiple
    rerender(<PropertyInspector doc={doc} selectedIds={['id1', 'id2']} />);
    expect(screen.getByTestId('inspector-multi-selection')).toBeDefined();
    expect(screen.getByTestId('inspector-multi-selection').textContent).toContain('2 éléments');

    // Panneau rétracté
    rerender(<PropertyInspector doc={doc} selectedIds={[]} isCollapsed={true} />);
    expect(screen.getByTestId('property-inspector-collapsed')).toBeDefined();
  });

  it('T-INSPECT-02 : inspection d’un Mur (type, bascule Auto/Fixe, baseOffset)', () => {
    const wall: Wall = {
      id: 'w-inspect',
      category: 'wall',
      typeId: wallTypeId,
      levelId: level0Id,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    render(<PropertyInspector doc={doc} selectedIds={['w-inspect']} />);

    expect(screen.getByTestId('inspector-wall-panel')).toBeDefined();
    expect(screen.getByTestId('wall-id').textContent).toBe('w-inspect');

    // Mode initial : Auto
    expect(screen.queryByTestId('wall-height-input')).toBeNull();

    // Basculer en mode Fixe
    const fixeBtn = screen.getByTestId('wall-height-mode-fixe');
    fireEvent.click(fixeBtn);

    // Le champ de hauteur libre doit maintenant être visible
    const heightInput = screen.getByTestId('wall-height-input') as HTMLInputElement;
    expect(heightInput).toBeDefined();

    // Modifier la hauteur à 3200 mm
    fireEvent.change(heightInput, { target: { value: '3200' } });
    fireEvent.blur(heightInput);

    expect(doc.getState().walls['w-inspect']?.heightOverride).toBe(3200);
  });

  it('T-INSPECT-03 : avertissement non-bloquant de pénétration dans la dalle supérieure', () => {
    // Ajouter une dalle sur R+1 couvrant le mur
    const slab: Slab = {
      id: 'slab-r1',
      category: 'slab',
      levelId: level1Id,
      slabTypeId,
      boundary: [
        { x: -500, y: -500 },
        { x: 5000, y: -500 },
        { x: 5000, y: 2000 },
        { x: -500, y: 2000 },
      ],
    };
    doc.execute(new Commands.AddSlabCommand(slab));

    // Mur avec heightOverride de 3500 mm (dépasse l'arase inférieure de la dalle à 3000 - 200 = 2800 mm)
    const tallWall: Wall = {
      id: 'w-tall',
      category: 'wall',
      typeId: wallTypeId,
      levelId: level0Id,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      heightOverride: 3500,
    };
    doc.execute(new Commands.AddWallCommand(tallWall));

    render(<PropertyInspector doc={doc} selectedIds={['w-tall']} />);

    const warning = screen.getByTestId('wall-penetration-warning');
    expect(warning).toBeDefined();
    expect(warning.textContent).toContain('Pénétration dans la dalle supérieure');
  });

  it('T-INSPECT-04 : inspection et édition d’une Dalle et de son SlabType', () => {
    const slab: Slab = {
      id: 'slab-test',
      category: 'slab',
      name: 'Plancher RDC',
      levelId: level0Id,
      slabTypeId,
      boundary: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
    };
    doc.execute(new Commands.AddSlabCommand(slab));

    render(<PropertyInspector doc={doc} selectedIds={['slab-test']} />);

    expect(screen.getByTestId('inspector-slab-panel')).toBeDefined();
    expect(screen.getByTestId('slab-thickness-display').textContent).toContain('200 mm');

    // Modifier le nom de la dalle
    const nameInput = screen.getByTestId('slab-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dalle Principale' } });
    fireEvent.blur(nameInput);
    expect(doc.getState().slabs?.[slab.id]?.name).toBe('Dalle Principale');

    // Modifier l'épaisseur du type de dalle (250 mm)
    const thicknessInput = screen.getByTestId('slab-type-thickness-input') as HTMLInputElement;
    fireEvent.change(thicknessInput, { target: { value: '250' } });
    fireEvent.blur(thicknessInput);
    expect(doc.getState().slabTypes?.[slabTypeId]?.thickness).toBe(250);
  });

  it('T-INSPECT-05 : inspection d’un Niveau et ajustement de storyHeight', () => {
    render(<PropertyInspector doc={doc} selectedIds={[level0Id]} />);

    expect(screen.getByTestId('inspector-level-panel')).toBeDefined();
    const storyInput = screen.getByTestId('level-story-height-input') as HTMLInputElement;
    expect(storyInput).toBeDefined();
    expect(storyInput.value).toBe('3000'); // Distance entre RDC (0) et R+1 (3000)

    // Ajuster storyHeight à 3200 mm
    fireEvent.change(storyInput, { target: { value: '3200' } });
    fireEvent.blur(storyInput);

    // R+1 doit maintenant être à 3200 mm
    expect(doc.getState().levels[level1Id]?.elevation).toBe(3200);
  });

  // Escaliers paramétriques (ADR-048 / Phase 6.4)
  it('T-STAIR-INSP-01 : inspection d’un Escalier (nom, type, dénivelée, marches, contremarche, giron)', () => {
    const stairId = 'stair-test';
    const stairTypeId = Object.keys(doc.getState().stairTypes ?? {})[0]!;

    doc.execute(
      new Commands.AddStairCommand({
        id: stairId,
        category: 'stair',
        stairTypeId,
        bottomLevelId: level0Id,
        topLevelId: level1Id,
        start: { x: 0, y: 0 },
        end: { x: 4845, y: 0 },
        name: 'Escalier RDC',
      }),
    );

    render(<PropertyInspector doc={doc} selectedIds={[stairId]} />);

    expect(screen.getByTestId('inspector-stair-panel')).toBeDefined();
    expect(screen.getByTestId('stair-id').textContent).toBe(stairId);
    expect(screen.getByTestId('stair-rise-display').textContent).toContain('3000 mm');
    expect(screen.getByTestId('stair-steps-display').textContent).toContain('17');
    expect(screen.getByTestId('stair-riser-display').textContent).toContain('176.5 mm');
    expect(screen.getByTestId('stair-tread-display').textContent).toContain('285.0 mm');
  });

  it('T-STAIR-INSP-02 : Badge Blondel Conforme (Vert) pour pas de foulée optimal', () => {
    const stairId = 'stair-blondel-green';
    const stairTypeId = Object.keys(doc.getState().stairTypes ?? {})[0]!;

    // ΔZ = 3000, L = 4845 -> N = 17, h = 176.47, g = 285.0 -> 2h + g = 637.94 mm (Conforme Confort)
    doc.execute(
      new Commands.AddStairCommand({
        id: stairId,
        category: 'stair',
        stairTypeId,
        bottomLevelId: level0Id,
        topLevelId: level1Id,
        start: { x: 0, y: 0 },
        end: { x: 4845, y: 0 },
      }),
    );

    render(<PropertyInspector doc={doc} selectedIds={[stairId]} />);

    const badge = screen.getByTestId('stair-blondel-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Conforme (Confort)');
    expect(badge.textContent).toContain('2h + g = 638 mm');
  });

  it('T-STAIR-INSP-03 : Inversion du sens de montée permute start et end', () => {
    const stairId = 'stair-invert';
    const stairTypeId = Object.keys(doc.getState().stairTypes ?? {})[0]!;

    doc.execute(
      new Commands.AddStairCommand({
        id: stairId,
        category: 'stair',
        stairTypeId,
        bottomLevelId: level0Id,
        topLevelId: level1Id,
        start: { x: 100, y: 200 },
        end: { x: 4500, y: 200 },
      }),
    );

    render(<PropertyInspector doc={doc} selectedIds={[stairId]} />);

    const invertBtn = screen.getByTestId('stair-invert-direction-btn');
    fireEvent.click(invertBtn);

    const updatedStair = doc.getState().stairs?.[stairId];
    expect(updatedStair?.start).toEqual({ x: 4500, y: 200 });
    expect(updatedStair?.end).toEqual({ x: 100, y: 200 });
  });

  it('T-STAIR-INSP-04 : Avertissement de sécurité et badge rouge/jaune si hors confort/sécurité', () => {
    const stairId = 'stair-steep';
    const stairTypeId = Object.keys(doc.getState().stairTypes ?? {})[0]!;

    // Escalier très court : L = 1000 mm pour ΔZ = 3000 mm -> g = 58.8 mm, 2h + g = 411.8 mm (< 560 mm)
    doc.execute(
      new Commands.AddStairCommand({
        id: stairId,
        category: 'stair',
        stairTypeId,
        bottomLevelId: level0Id,
        topLevelId: level1Id,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      }),
    );

    render(<PropertyInspector doc={doc} selectedIds={[stairId]} />);

    const badge = screen.getByTestId('stair-blondel-badge');
    expect(badge.textContent).toContain('Hors Sécurité');

    const warnings = screen.getByTestId('stair-warnings');
    expect(warnings).toBeDefined();
    expect(warnings.textContent).toContain('STAIR_BLONDEL_OUT_OF_SAFETY');
  });

  it('T-INSPECT-07 : actualisation réactive immédiate sur modification documentaire externe ou undo/redo (P1.2)', () => {
    const wall: Wall = {
      id: 'w-reactive',
      category: 'wall',
      typeId: wallTypeId,
      levelId: level0Id,
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
      baseOffset: 100,
    };
    doc.execute(new Commands.AddWallCommand(wall));

    render(<PropertyInspector doc={doc} selectedIds={['w-reactive']} />);

    const baseOffsetInput = screen.getByTestId('wall-base-offset-input') as HTMLInputElement;
    expect(baseOffsetInput.value).toBe('100');

    // Modification externe via une commande (ex: outil, script, etc.)
    act(() => {
      doc.execute(new Commands.UpdateWallCommand('w-reactive', { baseOffset: 250 }));
    });
    expect(baseOffsetInput.value).toBe('250');

    // Undo externe -> retour à 100
    act(() => {
      doc.undo();
    });
    expect(baseOffsetInput.value).toBe('100');

    // Redo externe -> retour à 250
    act(() => {
      doc.redo();
    });
    expect(baseOffsetInput.value).toBe('250');
  });
});
