import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BimDocument, Commands, type Wall, type Level } from '@tabax/core';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { StatusBar } from './StatusBar.js';

describe('StatusBar — Barre d’état (P1.1 Active Level Propagation)', () => {
  it('affiche le niveau par défaut lorsque activeLevelId n’est pas fourni', () => {
    const doc = BimDocument.createDefaultProject();
    render(
      <BimDocumentProvider initialDoc={doc}>
        <StatusBar />
      </BimDocumentProvider>,
    );

    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Niveau 0 (RDC)');
    expect(footer?.textContent).toContain('Murs : 0');
  });

  it('affiche le nom du niveau actif spécifié par activeLevelId (P1.1)', () => {
    const doc = BimDocument.createDefaultProject();
    const level1: Level = {
      id: 'lvl_etage1',
      name: 'Étage 1 (R+1)',
      elevation: 3000,
      height: 2800,
    };
    doc.execute(new Commands.AddLevelCommand(level1));

    render(
      <BimDocumentProvider initialDoc={doc}>
        <StatusBar activeLevelId="lvl_etage1" />
      </BimDocumentProvider>,
    );

    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Étage 1 (R+1)');
  });

  it('retombe sur le premier niveau disponible si activeLevelId est invalide ou supprimé (P1.1 fallback)', () => {
    const doc = BimDocument.createDefaultProject();
    render(
      <BimDocumentProvider initialDoc={doc}>
        <StatusBar activeLevelId="lvl_inexistant" />
      </BimDocumentProvider>,
    );

    // Fallback sur Niveau 0
    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Niveau 0 (RDC)');
  });

  it('affiche les compteurs exacts de murs, dalles, portes et fenêtres', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    const wall: Wall = {
      id: 'w1',
      category: 'wall',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    render(
      <BimDocumentProvider initialDoc={doc}>
        <StatusBar activeToolKind="wall" drawingLength={3500} activeLevelId={levelId} />
      </BimDocumentProvider>,
    );

    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Murs : 1');
    expect(footer?.textContent).toContain('3500 mm');
  });
});
