import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createComplexVillaDocument,
  type BimState,
} from '@mini-bim/core';
import { describe, expect, it } from 'vitest';
import {
  generatePdfBook,
  PdfWriter,
  encodeWinAnsi,
  escapePdfStringBytes,
  encodePdfLiteralString,
  PAPER_FORMATS,
} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validateur syntaxique et structurel strict d'un binaire PDF 1.4 généré par Mini-BIM.
 */
export function parseAndValidatePdf14(bytes: Uint8Array): {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly pageCount: number;
  readonly objectCount: number;
  readonly mediaBoxes: readonly string[];
} {
  const errors: string[] = [];
  const textDecoder = new TextDecoder('latin1');
  const fullText = textDecoder.decode(bytes);

  // 1. Signature d'en-tête %PDF-1.4
  if (!fullText.startsWith('%PDF-1.4')) {
    errors.push(`En-tête invalide: "${fullText.substring(0, 15)}" (attendu: %PDF-1.4)`);
  }

  // 2. Terminaison %%EOF
  const trimmedEnd = fullText.trimEnd();
  if (!trimmedEnd.endsWith('%%EOF')) {
    errors.push('Fichier non terminé par %%EOF');
  }

  // 3. Absence absolue de NaN, undefined, Infinity
  const forbiddenPatterns = ['NaN', 'undefined', 'Infinity'];
  for (const pat of forbiddenPatterns) {
    if (fullText.includes(pat)) {
      errors.push(`Présence de valeur corrompue "${pat}" dans le flux PDF`);
    }
  }

  // 4. Localisation de startxref et validation stricte de la table xref
  const startXrefIdx = fullText.lastIndexOf('startxref');
  let objectCount = 0;
  if (startXrefIdx === -1) {
    errors.push('Mot-clé startxref introuvable');
  } else {
    const afterStartXref = fullText.substring(startXrefIdx + 9).trim();
    const eofIdx = afterStartXref.indexOf('%%EOF');
    const offsetStr = eofIdx !== -1 ? afterStartXref.substring(0, eofIdx).trim() : afterStartXref;
    const xrefOffset = parseInt(offsetStr, 10);

    if (isNaN(xrefOffset) || xrefOffset <= 0 || xrefOffset >= bytes.length) {
      errors.push(`Offset xref invalide: ${offsetStr}`);
    } else {
      const xrefText = fullText.substring(xrefOffset);
      if (!xrefText.startsWith('xref')) {
        errors.push(`Table xref introuvable à l'offset ${xrefOffset} (trouvé: "${xrefText.substring(0, 10)}")`);
      } else {
        // Parsing de la table xref
        const lines = xrefText.split(/\r?\n/);
        // lines[0] = 'xref'
        // lines[1] = '0 N'
        if (lines.length > 2) {
          const headerParts = lines[1]?.trim().split(/\s+/);
          const startObj = parseInt(headerParts?.[0] ?? '', 10);
          const totalObjs = parseInt(headerParts?.[1] ?? '', 10);

          if (startObj !== 0 || isNaN(totalObjs) || totalObjs <= 0) {
            errors.push(`En-tête de section xref invalide: "${lines[1]}"`);
          } else {
            objectCount = totalObjs;
            // Pour chaque entrée d'objet, vérifier le pointage exact de l'offset
            // lines[0] = 'xref', lines[1] = '0 N', lines[2] = objet 0, lines[2 + i] = objet i
            for (let i = 1; i < totalObjs; i++) {
              const entryLine = lines[2 + i]?.trim();
              if (!entryLine) continue;
              const [offStr, , type] = entryLine.split(/\s+/);
              if (type === 'n') {
                const objOffset = parseInt(offStr ?? '', 10);
                if (isNaN(objOffset) || objOffset <= 0 || objOffset >= bytes.length) {
                  errors.push(`Entrée xref ${i} offset invalide: ${offStr}`);
                } else {
                  // Vérifier que bytes à objOffset commence bien par "${i} 0 obj"
                  const targetPrefix = `${i} 0 obj`;
                  const actualPrefix = textDecoder.decode(bytes.subarray(objOffset, objOffset + targetPrefix.length + 5));
                  if (!actualPrefix.startsWith(targetPrefix)) {
                    errors.push(
                      `Désalignement xref pour l'objet ${i}: pointé à ${objOffset}, trouvé "${actualPrefix.substring(0, 15)}" (attendu: "${targetPrefix}")`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 5. Décompte des pages et extraction des MediaBox
  const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 0;

  const mediaBoxes: string[] = [];
  const mediaBoxRegex = /\/MediaBox\s*\[\s*([\d.\s]+)\]/g;
  let mbMatch;
  while ((mbMatch = mediaBoxRegex.exec(fullText)) !== null) {
    if (mbMatch[1]) {
      mediaBoxes.push(mbMatch[1].trim());
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    pageCount,
    objectCount,
    mediaBoxes,
  };
}

describe('Saison 3 — Lot 3.B : Moteur de Mise en Page & Carnet de Plans PDF Multi-Pages (ADR-065)', () => {
  describe('1. Encodage Windows-1252 / WinAnsi & Chaînes PDF', () => {
    it('encode fidèlement le texte ASCII standard', () => {
      const bytes = encodeWinAnsi('Mini-BIM CAD Engine 2026');
      expect(bytes.length).toBe(24);
      expect(bytes[0]).toBe(77); // 'M'
    });

    it('encode correctement les caractères accentués français en Windows-1252 mono-octet', () => {
      const text = 'Étage RDC, pièce aérée & façade crépie à côté du séjour';
      const bytes = encodeWinAnsi(text);
      expect(bytes.length).toBe(text.length); // Mono-octet strict
      expect(bytes[0]).toBe(0xc9); // 'É' (Windows-1252: 201 / 0xC9)
      expect(bytes[text.indexOf('è')]).toBe(0xe8); // 'è' (0xE8)
      expect(bytes[text.indexOf('à')]).toBe(0xe0); // 'à' (0xE0)
      expect(bytes[text.indexOf('ç')]).toBe(0xe7); // 'ç' (0xE7)
    });

    it('encode les symboles techniques et typographiques clés (€, ’, °, ±, ², ³, Ø)', () => {
      const bytes = encodeWinAnsi('150 € - 34.50 m² - 12 m³ - Pente 45° - Ø50 ±1 mm');
      expect(bytes[bytes.indexOf(0x80)]).toBe(0x80); // '€'
      expect(bytes[bytes.indexOf(0xb2)]).toBe(0xb2); // '²'
      expect(bytes[bytes.indexOf(0xb3)]).toBe(0xb3); // '³'
      expect(bytes[bytes.indexOf(0xb0)]).toBe(0xb0); // '°'
      expect(bytes[bytes.indexOf(0xd8)]).toBe(0xd8); // 'Ø'
      expect(bytes[bytes.indexOf(0xb1)]).toBe(0xb1); // '±'
    });

    it('échappe proprement les caractères syntaxiques PDF (\\, (, ))', () => {
      const raw = encodeWinAnsi('Coupe (A-A\\B)');
      const escaped = escapePdfStringBytes(raw);
      const textDecoder = new TextDecoder('latin1');
      expect(textDecoder.decode(escaped)).toBe('Coupe \\(A-A\\\\B\\)');
    });

    it('génère un littéral chaîne PDF délimité par des parenthèses', () => {
      const literal = encodePdfLiteralString('Salon (15 m²)');
      const textDecoder = new TextDecoder('latin1');
      expect(textDecoder.decode(literal)).toBe('(Salon \\(15 m\xb2\\))');
    });
  });

  describe('2. Primitives vectorielles du moteur PdfWriter', () => {
    it('génère un fichier PDF 1.4 monopage minimal parfaitement conforme', () => {
      const writer = new PdfWriter();
      const page = writer.addPage(PAPER_FORMATS.A4.widthPt, PAPER_FORMATS.A4.heightPt);

      // Tracé de formes vectorielles
      page.rect(50, 50, 200, 100, {
        fillColor: [0.9, 0.95, 1],
        strokeColor: [0.1, 0.3, 0.7],
        lineWidth: 1.5,
      });

      page.circle(300, 100, 40, {
        fillColor: [1, 0.9, 0.8],
        strokeColor: [0.8, 0.2, 0.1],
        lineWidth: 1,
      });

      page.arc(450, 100, 50, 0, Math.PI / 2, {
        strokeColor: [0.2, 0.6, 0.2],
        lineWidth: 1.2,
      });

      page.line(50, 200, 500, 200, {
        strokeColor: [0.3, 0.3, 0.3],
        lineWidth: 0.8,
        lineDash: [4, 2],
      });

      page.text('Projet Résidence Émeraude (A4)', 50, 230, {
        font: 'bold',
        size: 14,
        color: [0.05, 0.15, 0.3],
      });

      const pdfBytes = writer.compile();
      const report = parseAndValidatePdf14(pdfBytes);
      if (!report.isValid) {
        console.error('Test report errors:', report.errors);
      }

      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.pageCount).toBe(1);
      expect(report.mediaBoxes).toHaveLength(1);
      expect(report.mediaBoxes[0]).toBe('0 0 841.89 595.28');
    });

    it('génère un document PDF multipage avec dimensions conformes A3 Paysage', () => {
      const writer = new PdfWriter();
      writer.addPage(PAPER_FORMATS.A3.widthPt, PAPER_FORMATS.A3.heightPt);
      writer.addPage(PAPER_FORMATS.A3.widthPt, PAPER_FORMATS.A3.heightPt);

      const pdfBytes = writer.compile();
      const report = parseAndValidatePdf14(pdfBytes);
      if (!report.isValid) {
        console.error('Test report errors:', report.errors);
      }

      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.pageCount).toBe(2);
      expect(report.mediaBoxes[0]).toBe('0 0 1190.55 841.89');
      expect(report.mediaBoxes[1]).toBe('0 0 1190.55 841.89');
    });
  });

  describe('3. Génération du Carnet de Plans PDF sur Document Synthétique', () => {
    function createSyntheticState(): BimState {
      return {
        levels: {
          lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0 },
        },
        wallTypes: {
          'wt-ext': { id: 'wt-ext', name: 'Mur Extérieur 200', thickness: 200 },
        },
        slabTypes: {
          'st-std': { id: 'st-std', name: 'Dalle 200', thickness: 200 },
        },
        doorTypes: {
          'dt-std': { id: 'dt-std', name: 'Porte 900', width: 900, height: 2100 },
        },
        windowTypes: {
          'wt-std': { id: 'wt-std', name: 'Fenêtre 1200', width: 1200, height: 1400 },
        },
        walls: {
          w1: { id: 'w1', levelId: 'lvl_0', typeId: 'wt-ext', start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
          w2: { id: 'w2', levelId: 'lvl_0', typeId: 'wt-ext', start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } },
          w3: { id: 'w3', levelId: 'lvl_0', typeId: 'wt-ext', start: { x: 5000, y: 4000 }, end: { x: 0, y: 4000 } },
          w4: { id: 'w4', levelId: 'lvl_0', typeId: 'wt-ext', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 } },
        },
        doors: {
          d1: { id: 'd1', hostWallId: 'w1', doorTypeId: 'dt-std', offsetAlong: 1500, swing: { side: 'right', direction: 'in' } },
        },
        windows: {
          win1: { id: 'win1', hostWallId: 'w3', windowTypeId: 'wt-std', offsetAlong: 1500, sillHeight: 900 },
        },
        slabs: {
          slab1: {
            id: 'slab1',
            levelId: 'lvl_0',
            slabTypeId: 'st-std',
            thickness: 200,
            boundary: [
              { x: -200, y: -200 },
              { x: 5200, y: -200 },
              { x: 5200, y: 4200 },
              { x: -200, y: 4200 },
            ],
          },
        },
        rooms: {
          room1: {
            id: 'room1',
            category: 'room',
            levelId: 'lvl_0',
            name: 'Séjour Traversant',
            seed: { x: 2500, y: 2000 },
            area: 20.0,
          },
        },
        sectionCuts: {
          cut_A: {
            id: 'cut_A',
            category: 'sectionCut',
            name: "Coupe A-A'",
            label: 'A',
            kind: 'section',
            start: { x: 2500, y: -1000 },
            end: { x: 2500, y: 5000 },
            viewDirection: 1,
            depth: 5000,
            zMin: -500,
            zMax: 3500,
          },
        },
        pipes: {},
        ducts: {},
        cableTrays: {},
        mepSystems: {},
        stairs: {},
        roofs: {},
        dimensions: {},
        components: {},
        openings: {},
        materials: {},
      } as unknown as BimState;
    }

    it('génère un carnet complet à 4 planches ordonnées (Garde + Plan + Coupe + Métrés)', () => {
      const state = createSyntheticState();
      const pdfBytes = generatePdfBook(state, {
        projectTitle: 'Pavillon Individuel Test',
        author: 'Cabinet Architecte BIM',
        revision: 'INDICE A',
        scale: 100,
      });

      const report = parseAndValidatePdf14(pdfBytes);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      // 1 garde + 1 plan (lvl_0) + 1 coupe (cut_A) + 1 synthèse métrés = 4 planches
      expect(report.pageCount).toBe(4);
      expect(pdfBytes.length).toBeGreaterThan(15000);
    });

    it('respecte les options de filtrage des planches (includeCover: false, includeSections: false)', () => {
      const state = createSyntheticState();
      const pdfBytes = generatePdfBook(state, {
        includeCover: false,
        includeSections: false,
      });

      const report = parseAndValidatePdf14(pdfBytes);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      // Seulement Plan RDC (1) + Métrés (1) = 2 planches
      expect(report.pageCount).toBe(2);
    });

    it('prend en compte l’échelle forcée 1:50 et 1:200 sans déborder', () => {
      const state = createSyntheticState();
      const pdfBytes50 = generatePdfBook(state, { scale: 50 });
      const report50 = parseAndValidatePdf14(pdfBytes50);
      expect(report50.isValid).toBe(true);

      const pdfBytes200 = generatePdfBook(state, { scale: 200 });
      const report200 = parseAndValidatePdf14(pdfBytes200);
      expect(report200.isValid).toBe(true);
    });
  });

  describe('4. Qualification sur Maquette Réelle « Villa Complexe »', () => {
    it('génère le carnet de plans vectoriel complet sur la Villa Complexe', () => {
      const villaDoc = createComplexVillaDocument();
      const pdfBytes = generatePdfBook(villaDoc, {
        projectTitle: 'Villa Contemporaine R+1',
        paperSize: 'A4',
        scale: 'auto',
      });

      const report = parseAndValidatePdf14(pdfBytes);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      // Villa a 2 niveaux (RDC et R+1), donc au moins 1 garde + 2 plans + 1 métrés = 4 planches
      expect(report.pageCount).toBeGreaterThanOrEqual(4);
      expect(pdfBytes.length).toBeGreaterThan(25000);
    });
  });

  describe('5. Qualification sur Maquette Étalon « Immeuble R+4 Complet » (ADR-014)', () => {
    it('génère un carnet PDF multi-pages sur les 6 niveaux, coupes et métrés de l’Immeuble R+4', () => {
      const r4JsonPath = path.resolve(
        __dirname,
        '../../../../apps/web/public/demo-immeuble-r4.json',
      );

      if (!fs.existsSync(r4JsonPath)) {
        console.warn('Fichier demo-immeuble-r4.json introuvable, test ignoré.');
        return;
      }

      const rawJson = fs.readFileSync(r4JsonPath, 'utf8');
      const state = JSON.parse(rawJson) as BimState;

      // Ajouter une coupe SectionCut si non présente
      const stateWithCut: BimState = {
        ...state,
        sectionCuts: {
          ...state.sectionCuts,
          cut_transverse: {
            id: 'cut_transverse',
            category: 'sectionCut',
            name: "Coupe A-A' Transversale",
            label: 'A',
            kind: 'section',
            start: { x: 5000, y: -2000 },
            end: { x: 5000, y: 15000 },
            viewDirection: 1,
            depth: 8000,
            zMin: -3500,
            zMax: 22000,
          },
        },
      };

      const pdfBytes = generatePdfBook(stateWithCut, {
        projectTitle: 'Immeuble R+4 Graphite Engineering',
        paperSize: 'A3', // Format grand livrable A3
        scale: 100,
        author: 'Graphite Engineering Team',
        revision: 'INDICE B',
      });

      const report = parseAndValidatePdf14(pdfBytes);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);

      // 6 niveaux (RDC à Attique) + 1 Garde + 1 Coupe + 1 Métrés (2 colonnes) = exactement 9 planches
      expect(report.pageCount).toBe(9);
      // Taille substantielle vectorielle (> 45 Ko)
      expect(pdfBytes.length).toBeGreaterThan(45000);

      // Vérifier le format A3
      for (const mb of report.mediaBoxes) {
        expect(mb).toBe('0 0 1190.55 841.89');
      }

      // Vérifier que 100% des 36 pièces de l'Immeuble R+4 sont présentes dans le document
      const pdfText = new TextDecoder('latin1').decode(pdfBytes);
      const roomNames = Object.values(state.rooms ?? {}).map((r) => r.name);
      expect(roomNames.length).toBe(36);
      for (const name of roomNames) {
        expect(pdfText.includes(name)).toBe(true);
      }
    });

    it('déclenche une pagination automatique multi-pages sur les métrés de l’Immeuble R+4 au format A4', () => {
      const r4JsonPath = path.resolve(
        __dirname,
        '../../../../apps/web/public/demo-immeuble-r4.json',
      );
      if (!fs.existsSync(r4JsonPath)) return;

      const rawJson = fs.readFileSync(r4JsonPath, 'utf8');
      const state = JSON.parse(rawJson) as BimState;

      const pdfBytes = generatePdfBook(state, {
        projectTitle: 'Immeuble R+4 A4 Pagination',
        paperSize: 'A4',
        scale: 'auto',
      });

      const report = parseAndValidatePdf14(pdfBytes);
      expect(report.isValid).toBe(true);
      expect(report.errors).toEqual([]);
      // 1 Garde + 6 Plans + 3 Métrés (10 + 24 + 2) = 10 planches
      expect(report.pageCount).toBe(10);
    });
  });
});
