import { describe, it, expect } from 'vitest';
import { generatePlanSvg } from './svg-exporter.js';
import { vec2 } from '@mini-bim/geometry';
import { type DocumentFor2D } from './types.js';

describe('Générateur de Plans SVG Imprimables (packages/view-2d/svg-exporter)', () => {
  const sampleDoc: DocumentFor2D = {
    getState: () => ({
      walls: {
        w_south: {
          id: 'w_south',
          start: vec2(0, 0),
          end: vec2(6000, 0),
          typeId: 'wt_200',
        },
        w_north: {
          id: 'w_north',
          start: vec2(0, 4000),
          end: vec2(6000, 4000),
          typeId: 'wt_200',
        },
        w_west: {
          id: 'w_west',
          start: vec2(0, 0),
          end: vec2(0, 4000),
          typeId: 'wt_200',
        },
        w_east: {
          id: 'w_east',
          start: vec2(6000, 0),
          end: vec2(6000, 4000),
          typeId: 'wt_200',
        },
      },
      wallTypes: {
        wt_200: { thickness: 200 },
      },
      doorTypes: {
        'door-type-900x2100': {
          id: 'door-type-900x2100',
          name: 'Porte 900x2100',
          width: 900,
          height: 2100,
        },
      },
      windowTypes: {
        'window-type-1200x1400': {
          id: 'window-type-1200x1400',
          name: 'Fenêtre 1200x1400',
          width: 1200,
          height: 1400,
          defaultSillHeight: 900,
        },
      },
      doors: {
        door_01: {
          id: 'door_01',
          hostWallId: 'w_south',
          offsetAlong: 2000,
          doorTypeId: 'door-type-900x2100',
          swing: { side: 'right', direction: 'in' },
        },
      },
      windows: {
        win_01: {
          id: 'win_01',
          hostWallId: 'w_north',
          offsetAlong: 1500,
          windowTypeId: 'window-type-1200x1400',
        },
      },
      dimensions: {
        dim_south: {
          id: 'dim_south',
          type: 'linear',
          references: ['w_south'],
          offset: -600,
          value: 6000,
        },
      },
    }),
  };

  it('génère un document XML SVG valide avec en-tête et structure de calques', () => {
    const svg = generatePlanSvg(sampleDoc, {
      title: 'Plan RDC',
      project: 'Maison Individuelle',
      author: 'Cabinet Atelier BIM',
      scale: 100,
      paperSize: 'A4',
    });

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('height="210mm"');
    expect(svg).toContain('viewBox="0 0 1123 794"');
    expect(svg).toContain('</svg>');

    // Calques normalisés
    expect(svg).toContain('<g id="rooms">');
    expect(svg).toContain('<g id="walls">');
    expect(svg).toContain('<g id="openings">');
    expect(svg).toContain('<g id="dimensions">');
    expect(svg).toContain('<g id="border-and-cartouche">');
  });

  it('contient les murs, portes, fenêtres et cotations', () => {
    const svg = generatePlanSvg(sampleDoc);

    // Murs
    expect(svg).toContain('id="w_south"');
    expect(svg).toContain('id="w_north"');

    // Menuiseries (porte avec arc de battement et fenêtre avec ligne bleue)
    expect(svg).toContain('<polygon points='); // poché évidé pour baie
    expect(svg).toContain('stroke="#3b82f6"'); // vitrage fenêtre
    expect(svg).toContain('stroke-dasharray="3,2"'); // arc battement porte

    // Cotation 6.00 m
    expect(svg).toContain('6.00 m');
  });

  it('affiche les pièces avec poché pastel et libellé de surface en m²', () => {
    const svg = generatePlanSvg(sampleDoc, {
      rooms: [
        {
          id: 'room_salon',
          name: 'Grand Séjour',
          polygon: [vec2(200, 200), vec2(5800, 200), vec2(5800, 3800), vec2(200, 3800)],
          areaMm2: 20160000,
          seed: vec2(3000, 2000),
        },
      ],
    });

    expect(svg).toContain('Grand Séjour');
    expect(svg).toContain('20.16 m²');
    expect(svg).toContain('fill="rgba(219, 234, 254, 0.45)"');
  });

  it('génère un cartouche complet avec métadonnées conformes', () => {
    const svg = generatePlanSvg(sampleDoc, {
      title: 'Plan de Masse et Distribution',
      project: 'Villa Méditerranée',
      author: 'Jean Prouvé Architecte',
      scale: 50,
      paperSize: 'A3',
      date: '15/11/2026',
    });

    expect(svg).toContain('Villa Méditerranée');
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('Plan de Masse et Distribution');
    expect(svg).toContain('ÉCHELLE : 1:50');
    expect(svg).toContain('FORMAT : A3');
    expect(svg).toContain('AUTEUR : Jean Prouvé Architecte');
    expect(svg).toContain('DATE : 15/11/2026');
  });
});
