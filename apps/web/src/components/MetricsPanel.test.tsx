import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BimDocument, Commands } from '@mini-bim/core';
import { MetricsPanel, generateMetricsCsv } from './MetricsPanel.js';
import { createDemoDocument } from '../demo/demoDocument.js';

describe('Composant <MetricsPanel /> (Tableau de Métrés & Surfaces)', () => {
  let doc: BimDocument;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    doc = createDemoDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche les bonnes valeurs pour le projet de démo (4 murs, 1 porte, 1 fenêtre, 1 pièce)', () => {
    render(<MetricsPanel doc={doc} />);

    // Avancer le debounce de 200 ms
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const panel = screen.getByTestId('metrics-panel');
    expect(panel).toBeDefined();

    const table = screen.getByTestId('metrics-table');
    expect(table).toBeDefined();

    // 4 murs d'axe 6m × 4m = 20 m linéaires (6 + 4 + 6 + 4)
    expect(screen.getByText('Linéaire total')).toBeDefined();
    expect(screen.getByText('20.00')).toBeDefined();

    // 1 porte et 1 fenêtre
    expect(screen.getByText('Portes')).toBeDefined();
    expect(screen.getByText('Fenêtres')).toBeDefined();

    // 1 pièce : Séjour (22.04 m²)
    expect(screen.getByText('Séjour')).toBeDefined();
    expect(screen.getAllByText('22.04').length).toBeGreaterThanOrEqual(1);
  });

  it('affiche les unités explicites (m, m², m³, u) dans les colonnes du tableau', () => {
    render(<MetricsPanel doc={doc} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Unités dans les colonnes
    expect(screen.getAllByText('m²').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('m³').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('u').length).toBeGreaterThanOrEqual(2);
  });

  it('permet de replier et déplier le panneau via le bouton de bascule', () => {
    render(<MetricsPanel doc={doc} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const toggleBtn = screen.getByTestId('toggle-metrics-panel-btn');
    expect(screen.getByTestId('metrics-table')).toBeDefined();

    // Replier
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('metrics-table')).toBeNull();

    // Déplier
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('metrics-table')).toBeDefined();
  });

  it('permet de filtrer par niveau lorsque plusieurs niveaux sont présents', () => {
    // Ajouter un second niveau au document
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_etage1',
        name: 'Étage 1',
        elevation: 2800,
      }),
    );

    render(<MetricsPanel doc={doc} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const select = screen.getByTestId('level-select') as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.options.length).toBe(2);

    // Basculer vers Étage 1 (aucun mur -> 0.00 m)
    fireEvent.change(select, { target: { value: 'lvl_etage1' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('recalcule réactivement les métrés avec debouncing de 200ms lors d une modification du document', () => {
    const { rerender } = render(<MetricsPanel doc={doc} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Valeur initiale linéaire = 20.00 m
    expect(screen.getByText('20.00')).toBeDefined();

    // Ajout d'un 5ème mur de 5m
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0] ?? '';
    const levelId = Object.keys(state.levels)[0] ?? '';

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_extra',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 1000 },
        end: { x: 5000, y: 1000 },
      }),
    );

    rerender(<MetricsPanel doc={doc} />);

    // Avant expiration du debounce (100 ms) : toujours 20.00 m
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('20.00')).toBeDefined();

    // Après expiration du debounce (250 ms) : nouveau linéaire = 25.00 m
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText('25.00')).toBeDefined();
  });

  it('generateMetricsCsv produit un CSV rigoureux avec en-têtes et unités explicites', () => {
    const levelMetrics = {
      levelId: 'lvl_0',
      walls: [
        {
          wallId: 'w1',
          grossAreaMm2: 16800000,
          netAreaMm2: 13230000,
          lengthMm: 6000,
          volumeMm3: 2646000000,
          openings: {
            doorIds: ['d1'],
            windowIds: ['win1'],
            totalOpeningAreaMm2: 3570000,
          },
        },
      ],
      rooms: [
        {
          roomId: 'room_1',
          name: 'Séjour',
          areaMm2: 10640000,
          perimeterMm: 13200,
          volumeMm3: 29792000000,
        },
      ],
      totals: {
        wallLinearM: 6.0,
        wallNetAreaM2: 13.23,
        wallVolumeM3: 2.646,
        doorCount: 1,
        windowCount: 1,
        roomAreaM2: 10.64,
      },
    };

    const csv = generateMetricsCsv(levelMetrics, 'Rez-de-chaussée');

    // 1. En-tête strict avec colonnes Catégorie, Élément, Quantité, Unité
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Catégorie,Élément,Quantité,Unité');

    // 2. Lignes avec unités explicites
    expect(csv).toContain('Murs,Linéaire total,6.000,m');
    expect(csv).toContain('Murs,Surface nette totale,13.230,m²');
    expect(csv).toContain('Murs,Volume total,2.646,m³');
    expect(csv).toContain('Portes,Nombre total,1,u');
    expect(csv).toContain('Fenêtres,Nombre total,1,u');
    expect(csv).toContain('Pièces,Surface utile totale,10.640,m²');
    expect(csv).toContain('Pièces,Séjour (Surface),10.64,m²');
    expect(csv).toContain('Pièces,Séjour (Périmètre),13.20,m');
    expect(csv).toContain('Pièces,Séjour (Volume),29.79,m³');
  });

  it('le bouton Exporter CSV déclenche le téléchargement du fichier CSV', () => {
    render(<MetricsPanel doc={doc} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const exportBtn = screen.getByTestId('export-csv-btn');
    expect(exportBtn).toBeDefined();

    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');

    fireEvent.click(exportBtn);

    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
