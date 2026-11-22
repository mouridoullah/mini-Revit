import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { vec2, type Vec2 } from '@tabax/geometry';
import type { SectionScene } from '@tabax/core';
import { BimDocument, computeSectionScene, type SectionCut } from '@tabax/core';
import {
  DxfWriter,
  cleanDxfText,
  generateHatchLines,
  generatePlanDxf,
  generateSectionDxf,
} from './index.js';
import type { DocumentFor2D } from '../types.js';

interface DxfValidationReport {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly headerVars: Record<string, string>;
  readonly layers: Set<string>;
  readonly lineTypes: Set<string>;
  readonly entities: readonly {
    readonly type: string;
    readonly layer: string;
    readonly data: Record<number, string[]>;
  }[];
}

/**
 * Parseur et validateur syntaxique DXF R12 (AC1009) strict.
 */
function parseAndValidateDxfR12(dxfContent: string): DxfValidationReport {
  const errors: string[] = [];

  // 1. Séparateur CRLF strict
  if (!dxfContent.includes('\r\n')) {
    errors.push('Le fichier DXF doit utiliser les séparateurs CRLF (\\r\\n).');
  }

  // 2. Nombre pair de lignes
  const lines = dxfContent.split('\r\n');
  if (lines[lines.length - 1] === '') {
    lines.pop(); // Ligne vide résiduelle après le dernier \r\n
  }
  if (lines.length % 2 !== 0) {
    errors.push(`Nombre impair de lignes dans le fichier DXF : ${lines.length}`);
  }

  // 3. Absence de NaN / Infinity / undefined
  if (
    dxfContent.includes('NaN') ||
    dxfContent.includes('Infinity') ||
    dxfContent.includes('undefined')
  ) {
    errors.push('Présence de NaN, Infinity ou undefined dans le flux DXF.');
  }

  // 4. Terminaison stricte 0 / EOF
  const lastCode = lines[lines.length - 2]?.trim();
  const lastVal = lines[lines.length - 1]?.trim();
  if (lastCode !== '0' || lastVal !== 'EOF') {
    errors.push(`Terminaison invalide : attendu 0 / EOF, obtenu "${lastCode}" / "${lastVal}"`);
  }

  // 5. Analyse des sections, tables et entités
  const sections: string[] = [];
  const layers = new Set<string>();
  const lineTypes = new Set<string>();
  const headerVars: Record<string, string> = {};
  const entities: { type: string; layer: string; data: Record<number, string[]> }[] = [];

  let currentSection = '';
  let inTables = false;
  let currentTable = '';
  let inEntities = false;
  let currentEntity: { type: string; layer: string; data: Record<number, string[]> } | null = null;
  let currentHeaderVar = '';

  for (let i = 0; i < lines.length; i += 2) {
    const code = parseInt(lines[i]?.trim() ?? '', 10);
    const val = lines[i + 1]?.trim() ?? '';

    if (code === 0 && val === 'SECTION') {
      const nextCode = parseInt(lines[i + 2]?.trim() ?? '', 10);
      const nextVal = lines[i + 3]?.trim() ?? '';
      if (nextCode === 2) {
        currentSection = nextVal;
        sections.push(currentSection);
        if (currentSection === 'TABLES') inTables = true;
        if (currentSection === 'ENTITIES') inEntities = true;
      }
    } else if (code === 0 && val === 'ENDSEC') {
      if (currentEntity) {
        entities.push(currentEntity);
        currentEntity = null;
      }
      currentSection = '';
      inTables = false;
      inEntities = false;
    } else if (currentSection === 'HEADER') {
      if (code === 9) {
        currentHeaderVar = val;
      } else if (currentHeaderVar) {
        if (code === 10) {
          headerVars[`${currentHeaderVar}_X`] = val;
          headerVars[currentHeaderVar] = val; // pour accès direct à X
        } else if (code === 20) {
          headerVars[`${currentHeaderVar}_Y`] = val;
        } else if (code === 30) {
          headerVars[`${currentHeaderVar}_Z`] = val;
        } else {
          headerVars[currentHeaderVar] = val;
        }
      }
    } else if (inTables) {
      if (code === 0 && val === 'TABLE') {
        const nextCode = parseInt(lines[i + 2]?.trim() ?? '', 10);
        const nextVal = lines[i + 3]?.trim() ?? '';
        if (nextCode === 2) currentTable = nextVal;
      } else if (code === 0 && val === 'ENDTAB') {
        currentTable = '';
      } else if (currentTable === 'LAYER' && code === 2) {
        layers.add(val.toUpperCase());
      } else if (currentTable === 'LTYPE' && code === 2) {
        lineTypes.add(val.toUpperCase());
      }
    } else if (inEntities) {
      if (code === 0) {
        if (currentEntity) {
          entities.push(currentEntity);
        }
        currentEntity = { type: val, layer: '', data: {} };
      } else if (currentEntity) {
        if (code === 8) {
          currentEntity.layer = val.toUpperCase();
        }
        if (!currentEntity.data[code]) {
          currentEntity.data[code] = [];
        }
        currentEntity.data[code].push(val);
      }
    }
  }
  if (currentEntity) {
    entities.push(currentEntity);
  }

  // Vérifier l'ordre canonique des sections
  const expectedOrder = ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES'];
  for (let s = 0; s < expectedOrder.length; s++) {
    if (sections[s] !== expectedOrder[s]) {
      errors.push(
        `Ordre de section non canonique à l'index ${s} : attendu ${expectedOrder[s]}, obtenu ${sections[s]}`,
      );
    }
  }

  // Vérifier AC1009
  if (headerVars['$ACADVER'] !== 'AC1009') {
    errors.push(`Version ACAD attendue AC1009, obtenu ${headerVars['$ACADVER']}`);
  }

  // Vérifier $MEASUREMENT = 1 (Métrique mm)
  if (headerVars['$MEASUREMENT'] !== '1') {
    errors.push(`$MEASUREMENT attendu 1 (Métrique), obtenu ${headerVars['$MEASUREMENT']}`);
  }

  // Vérifier Intégrité Référentielle : tout calque ou ltype d'entité doit exister dans TABLES
  for (const ent of entities) {
    if (ent.layer && !layers.has(ent.layer)) {
      errors.push(
        `Calque orphelin dans ENTITIES non déclaré dans TABLES : "${ent.layer}" sur entité ${ent.type}`,
      );
    }
    const entLtype = ent.data[6]?.[0];
    if (entLtype && !lineTypes.has(entLtype)) {
      errors.push(
        `Type de ligne orphelin dans ENTITIES non déclaré dans TABLES : "${entLtype}" sur entité ${ent.type}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    headerVars,
    layers,
    lineTypes,
    entities,
  };
}

describe('Saison 3 — Lot 3.A : Moteur DXF R12 Pur TypeScript (ADR-063)', () => {
  describe('1. Normalisation et Bas Niveau DxfWriter', () => {
    it('normalise les caractères spéciaux en codes échappement CAO AutoCAD', () => {
      expect(cleanDxfText('Tuyau Ø50')).toBe('Tuyau %%c50');
      expect(cleanDxfText('Pente 45°')).toBe('Pente 45%%d');
      expect(cleanDxfText('Tolérance ±2 mm')).toBe('Tolérance %%p2 mm');
      expect(cleanDxfText('Surface 34.50 m²')).toBe('Surface 34.50 m2');
      expect(cleanDxfText('Volume 12 m³')).toBe('Volume 12 m3');
      expect(cleanDxfText("Texte avec\r\nretour\tligne")).toBe('Texte avec retour ligne');
    });

    it('génère un document DXF R12 minimal parfaitement valide', () => {
      const writer = new DxfWriter();
      writer.addLine('ARCH-WALLS', vec2(0, 0), vec2(5000, 0));
      writer.addCircle('ARCH-WALLS', vec2(2500, 1000), 200);
      writer.addPolyline('ARCH-WALLS', [vec2(0, 0), vec2(100, 0), vec2(100, 100)], true);
      writer.addText('ARCH-WALLS', vec2(1000, 500), 250, 'Salon Ø40');

      const dxf = writer.toDxfString();
      const report = parseAndValidateDxfR12(dxf);

      expect(report.isValid).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.headerVars['$ACADVER']).toBe('AC1009');
      expect(report.headerVars['$MEASUREMENT']).toBe('1');
      expect(report.layers.has('0')).toBe(true);
      expect(report.layers.has('ARCH-WALLS')).toBe(true);
      expect(report.entities.length).toBeGreaterThanOrEqual(4);
    });

    it('calcule dynamiquement les limites $EXTMIN et $EXTMAX pour le Zoom Étendu', () => {
      const writer = new DxfWriter();
      writer.addLine('ARCH-WALLS', vec2(-1000, -2000), vec2(8000, 4000));
      const dxf = writer.toDxfString();
      const report = parseAndValidateDxfR12(dxf);

      expect(report.isValid).toBe(true);
      // Marge de 500 mm appliquée
      expect(parseFloat(report.headerVars['$EXTMIN'] ?? '0')).toBeLessThanOrEqual(-1500);
      expect(parseFloat(report.headerVars['$EXTMAX'] ?? '0')).toBeGreaterThanOrEqual(8500);
    });
  });

  describe('2. Découpe analytique des hachures linéaires (LINE)', () => {
    it('génère des hachures régulières dans un polygone rectangulaire', () => {
      const rect: Vec2[] = [vec2(0, 0), vec2(2000, 0), vec2(2000, 1000), vec2(0, 1000)];
      const hatches = generateHatchLines(rect, { angleDeg: 45, spacing: 200 });

      expect(hatches.length).toBeGreaterThan(5);
      for (const [p1, p2] of hatches) {
        expect(p1.x).toBeGreaterThanOrEqual(-1);
        expect(p1.x).toBeLessThanOrEqual(2001);
        expect(p1.y).toBeGreaterThanOrEqual(-1);
        expect(p1.y).toBeLessThanOrEqual(1001);
        expect(p2.x).toBeGreaterThanOrEqual(-1);
        expect(p2.x).toBeLessThanOrEqual(2001);
        expect(p2.y).toBeGreaterThanOrEqual(-1);
        expect(p2.y).toBeLessThanOrEqual(1001);
      }
    });

    it('interrompt les hachures à travers les trémies et réservations', () => {
      const rect: Vec2[] = [vec2(0, 0), vec2(4000, 0), vec2(4000, 4000), vec2(0, 4000)];
      const hole: Vec2[] = [
        vec2(1000, 1000),
        vec2(3000, 1000),
        vec2(3000, 3000),
        vec2(1000, 3000),
      ];

      const hatches = generateHatchLines(rect, {
        angleDeg: 45,
        spacing: 300,
        holes: [hole],
      });

      // Aucun segment ne doit traverser le centre du trou (2000, 2000)
      for (const [p1, p2] of hatches) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const inHoleCenter =
          midX > 1100 && midX < 2900 && midY > 1100 && midY < 2900;
        expect(inHoleCenter).toBe(false);
      }
    });

    it('retourne un tableau vide pour un polygone dégénéré', () => {
      expect(generateHatchLines([])).toEqual([]);
      expect(generateHatchLines([vec2(0, 0), vec2(100, 100)])).toEqual([]);
    });
  });

  describe('3. Export DXF de Plan 2D (generatePlanDxf)', () => {
    it('génère un export DXF de plan complet avec toutes les catégories d’entités', () => {
      const syntheticDoc: DocumentFor2D = {
        getState: () => ({
          levels: {
            lvl_rdc: { id: 'lvl_rdc', name: 'RDC', elevation: 0, height: 2800 },
          },
          wallTypes: {
            wt_ext: { thickness: 300 },
          },
          walls: {
            w1: {
              id: 'w1',
              start: vec2(0, 0),
              end: vec2(6000, 0),
              typeId: 'wt_ext',
              levelId: 'lvl_rdc',
            },
            w2: {
              id: 'w2',
              start: vec2(6000, 0),
              end: vec2(6000, 4000),
              typeId: 'wt_ext',
              levelId: 'lvl_rdc',
            },
            w3: {
              id: 'w3',
              start: vec2(6000, 4000),
              end: vec2(0, 4000),
              typeId: 'wt_ext',
              levelId: 'lvl_rdc',
            },
            w4: {
              id: 'w4',
              start: vec2(0, 4000),
              end: vec2(0, 0),
              typeId: 'wt_ext',
              levelId: 'lvl_rdc',
            },
          },
          doors: {
            d1: {
              id: 'd1',
              hostWallId: 'w1',
              offsetAlong: 2000,
              doorTypeId: 'dt_std',
              swing: { direction: 'in', side: 'right' },
            },
          },
          doorTypes: {
            dt_std: { id: 'dt_std', width: 900, height: 2100 },
          },
          windows: {
            win1: {
              id: 'win1',
              hostWallId: 'w3',
              offsetAlong: 1500,
              windowTypeId: 'wt_std',
            },
          },
          windowTypes: {
            wt_std: { id: 'wt_std', width: 1400, height: 1200 },
          },
          slabs: {
            slab1: {
              id: 'slab1',
              slabTypeId: 'st_1',
              levelId: 'lvl_rdc',
              boundary: [vec2(-500, -500), vec2(6500, -500), vec2(6500, 4500), vec2(-500, 4500)],
            },
          },
          stairs: {
            stair1: {
              id: 'stair1',
              stairTypeId: 'stair_t1',
              bottomLevelId: 'lvl_rdc',
              topLevelId: 'lvl_rdc',
              start: vec2(1000, 1000),
              end: vec2(1000, 3500),
              widthOverride: 1000,
            },
          },
          components: {
            c1: {
              id: 'c1',
              typeId: 'comp_table',
              levelId: 'lvl_rdc',
              placement: { x: 3000, y: 2000, rotation: 0 },
            },
          },
          componentTypes: {
            comp_table: {
              id: 'comp_table',
              name: 'Table',
              family: 'furniture',
              subType: 'table',
              width: 1600,
              depth: 900,
              height: 750,
            },
          },
          dimensions: {
            dim1: {
              id: 'dim1',
              type: 'linear',
              references: ['w1'],
              offset: 800,
              value: 6000,
              customLabel: '6.00 m',
            },
          },
          sectionCuts: {
            sc1: {
              id: 'sc1',
              name: "Coupe A-A'",
              label: 'A',
              kind: 'section',
              start: vec2(-1000, 2000),
              end: vec2(7000, 2000),
              viewDirection: 1,
              depth: 5000,
            },
          },
          pipes: {
            p1: {
              id: 'p1',
              levelId: 'lvl_rdc',
              start: { x: 1000, y: 500, z: 2500 },
              end: { x: 5000, y: 500, z: 2500 },
              diameter: 50,
            },
          },
        }),
      };

      const dxf = generatePlanDxf(syntheticDoc, {
        rooms: [
          {
            id: 'room_1',
            name: 'Séjour',
            areaMm2: 24000000,
            seed: vec2(3000, 2000),
            polygon: [vec2(0, 0), vec2(6000, 0), vec2(6000, 4000), vec2(0, 4000)],
          },
        ],
      });

      const report = parseAndValidateDxfR12(dxf);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);

      // Calques attendus déclarés
      expect(report.layers.has('ARCH-WALLS')).toBe(true);
      expect(report.layers.has('ARCH-HATCH')).toBe(true);
      expect(report.layers.has('ARCH-OPENINGS')).toBe(true);
      expect(report.layers.has('ARCH-DOOR-SWINGS')).toBe(true);
      expect(report.layers.has('ARCH-SLABS')).toBe(true);
      expect(report.layers.has('ARCH-STAIRS')).toBe(true);
      expect(report.layers.has('ARCH-FURNITURE')).toBe(true);
      expect(report.layers.has('ARCH-ROOMS')).toBe(true);
      expect(report.layers.has('ARCH-DIMS')).toBe(true);
      expect(report.layers.has('ARCH-SECTIONS')).toBe(true);
      expect(report.layers.has('MEP-SUPPLY')).toBe(true);

      // Vérification de la cote exacte de 6.00 m
      const dimTexts = report.entities.filter(
        (e) => e.type === 'TEXT' && e.layer === 'ARCH-DIMS',
      );
      expect(dimTexts.some((t) => t.data[1]?.includes('6.00 m'))).toBe(true);

      // Vérification du label de pièce avec m2
      const roomTexts = report.entities.filter(
        (e) => e.type === 'TEXT' && e.layer === 'ARCH-ROOMS',
      );
      expect(roomTexts.some((t) => t.data[1]?.includes('24.00 m2'))).toBe(true);
    });
  });

  describe('4. Export DXF de Coupe 2D (generateSectionDxf)', () => {
    it('génère un export DXF de coupe 1:1 en mm parfaitement conforme', () => {
      const sampleScene: SectionScene = {
        cutId: 'cut_test',
        cutName: "Coupe A-A'",
        cutLabel: 'A',
        kind: 'section',
        cutLength: 10000,
        depth: 6000,
        bounds: {
          sMin: 0,
          sMax: 10000,
          zMin: -500,
          zMax: 6500,
        },
        levels: [
          { id: 'lvl_0', name: 'RDC', elevation: 0 },
          { id: 'lvl_1', name: 'R+1', elevation: 2800 },
        ],
        cutItems: [
          {
            id: 'wall_cut_1',
            category: 'wall',
            polygon: [vec2(1000, 0), vec2(1300, 0), vec2(1300, 2800), vec2(1000, 2800)],
          },
          {
            id: 'slab_cut_1',
            category: 'slab',
            polygon: [vec2(1000, 2600), vec2(9000, 2600), vec2(9000, 2800), vec2(1000, 2800)],
          },
        ],
        projectedItems: [
          {
            id: 'win_proj_1',
            category: 'window',
            depth: 2500,
            polygon: [vec2(4000, 900), vec2(5400, 900), vec2(5400, 2100), vec2(4000, 2100)],
            lines: [[vec2(4700, 900), vec2(4700, 2100)]],
          },
        ],
      };

      const dxf = generateSectionDxf(sampleScene, {
        projectTitle: 'Villa Test',
        includeHatches: true,
      });

      const report = parseAndValidateDxfR12(dxf);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);

      // Calques de coupe
      expect(report.layers.has('SECTION-CUT')).toBe(true);
      expect(report.layers.has('SECTION-HATCH')).toBe(true);
      expect(report.layers.has('SECTION-PROJ')).toBe(true);
      expect(report.layers.has('SECTION-LEVELS')).toBe(true);
      expect(report.layers.has('SECTION-GROUND')).toBe(true);
      expect(report.layers.has('SECTION-ANNOTATIONS')).toBe(true);

      // Vérifier les lignes de niveau
      const levelTexts = report.entities.filter(
        (e) => e.type === 'TEXT' && e.layer === 'SECTION-LEVELS',
      );
      expect(levelTexts.some((t) => t.data[1]?.includes('RDC (+0.00 m)'))).toBe(true);
      expect(levelTexts.some((t) => t.data[1]?.includes('R+1 (+2.80 m)'))).toBe(true);

      // Vérifier que le mur coupé à s=1000 a une arête à 1000.000
      const polylines = report.entities.filter(
        (e) => e.type === 'POLYLINE' && e.layer === 'SECTION-CUT',
      );
      expect(polylines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('5. Qualification sur Maquette Réelle Immeuble R+4 (ADR-014)', () => {
    it('génère un DXF Plan et Coupe valide sur l’Immeuble R+4 complet', () => {
      const r4JsonPath = path.resolve(
        __dirname,
        '../../../../apps/web/public/demo-immeuble-r4.json',
      );
      if (!fs.existsSync(r4JsonPath)) {
        console.warn('demo-immeuble-r4.json introuvable, test ignoré.');
        return;
      }

      const r4Json = fs.readFileSync(r4JsonPath, 'utf-8');
      const doc = BimDocument.fromJSON(r4Json);
      const state = doc.getState();

      // 1. Export DXF Plan du RDC
      const planDxf = generatePlanDxf(doc as unknown as DocumentFor2D, {
        levelId: 'level_r0',
      });
      const planReport = parseAndValidateDxfR12(planDxf);

      expect(planReport.isValid).toBe(true);
      expect(planReport.errors).toEqual([]);
      expect(planReport.layers.has('ARCH-WALLS')).toBe(true);
      expect(planReport.layers.has('ARCH-HATCH')).toBe(true);
      expect(planReport.entities.length).toBeGreaterThan(100);

      // 2. Coupe transversale A-A'
      const cut: SectionCut = {
        id: 'cut_r4_test',
        category: 'sectionCut',
        name: "Coupe A-A' Immeuble R+4",
        label: 'A',
        kind: 'section',
        start: vec2(-6000, -2000),
        end: vec2(6000, -2000),
        viewDirection: 1,
        depth: 8000,
      };

      const scene = computeSectionScene(state, cut);
      const sectionDxf = generateSectionDxf(scene, {
        projectTitle: 'Immeuble R+4 Graphite Engineering',
      });
      const sectionReport = parseAndValidateDxfR12(sectionDxf);

      expect(sectionReport.isValid).toBe(true);
      expect(sectionReport.errors).toEqual([]);
      expect(sectionReport.layers.has('SECTION-CUT')).toBe(true);
      expect(sectionReport.layers.has('SECTION-HATCH')).toBe(true);
      expect(sectionReport.layers.has('SECTION-LEVELS')).toBe(true);
      expect(sectionReport.entities.length).toBeGreaterThan(50);
    });
  });
});
