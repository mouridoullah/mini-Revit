import type { BimState, Room } from '@mini-bim/core';
import type { PdfPageContent } from './PdfWriter.js';
import { drawPageFrame, drawTitleBlock } from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

export interface SheetEntry {
  readonly sheetNumber: string;
  readonly title: string;
  readonly scale: string;
}

/**
 * Rendu vectoriel de la page de garde et table des matières du carnet PDF.
 */
export function renderCoverPage(
  content: PdfPageContent,
  state: BimState,
  format: PageFormatDef,
  options: PdfBookOptions,
  sheetIndex: number,
  totalPages: number,
  sheetList: readonly SheetEntry[],
): void {
  // 1. Cadre de planche normalisé
  drawPageFrame(content, format);

  const marginMm = 18;
  const leftXPt = marginMm * MM_TO_PT;
  const topYPt = (format.heightMm - marginMm) * MM_TO_PT;

  // 2. Grand en-tête architectural
  content.text('MINI-BIM CAD & GRAPHITE ENGINEERING', leftXPt, topYPt - 5 * MM_TO_PT, {
    font: 'bold',
    size: 9,
    color: [0.1, 0.45, 0.85],
  });

  const projectTitle = (options.projectTitle ?? 'PROJET MINI-BIM').toUpperCase();
  content.text(projectTitle, leftXPt, topYPt - 14 * MM_TO_PT, {
    font: 'bold',
    size: 20,
    color: [0.05, 0.1, 0.2],
  });

  content.text(
    'DOSSIER DE PLANS DE PERMIS & CARNET D’EXÉCUTION TECHNIQUE',
    leftXPt,
    topYPt - 21 * MM_TO_PT,
    {
      size: 10,
      color: [0.35, 0.4, 0.5],
    },
  );

  // Ligne de séparation
  content.line(
    leftXPt,
    topYPt - 25 * MM_TO_PT,
    (format.widthMm - marginMm) * MM_TO_PT,
    topYPt - 25 * MM_TO_PT,
    {
      strokeColor: [0.1, 0.45, 0.85],
      lineWidth: 1.5,
    },
  );

  // 3. Bloc de gauche : Synthèse Globale du Bâtiment
  const summaryBoxWidthPt = 85 * MM_TO_PT;
  const summaryBoxHeightPt = 110 * MM_TO_PT;
  const summaryYPt = topYPt - 32 * MM_TO_PT - summaryBoxHeightPt;

  content.rect(leftXPt, summaryYPt, summaryBoxWidthPt, summaryBoxHeightPt, {
    fillColor: [0.97, 0.98, 1.0],
    strokeColor: [0.75, 0.82, 0.92],
    lineWidth: 0.6,
  });

  // Titre du bloc synthèse
  content.text('SYNTHÈSE DU MODÈLE BIM', leftXPt + 5 * MM_TO_PT, summaryYPt + summaryBoxHeightPt - 7 * MM_TO_PT, {
    font: 'bold',
    size: 9.5,
    color: [0.08, 0.25, 0.55],
  });

  const levelsCount = Object.keys(state.levels ?? {}).length;
  const wallsCount = Object.keys(state.walls ?? {}).length;
  const doorsCount = Object.keys(state.doors ?? {}).length;
  const windowsCount = Object.keys(state.windows ?? {}).length;
  const slabsCount = Object.keys(state.slabs ?? {}).length;
  const roofsCount = Object.keys(state.roofs ?? {}).length;
  const stairsCount = Object.keys(state.stairs ?? {}).length;
  const cutsCount = Object.keys(state.sectionCuts ?? {}).length;

  let totalRoomAreaM2 = 0;
  const rooms: Room[] = Object.values(state.rooms ?? {});
  for (const r of rooms) {
    if (r.area) totalRoomAreaM2 += r.area;
  }

  const mepPipesCount = Object.keys(state.pipes ?? {}).length;
  const mepDuctsCount = Object.keys(state.ducts ?? {}).length;
  const mepTraysCount = Object.keys(state.cableTrays ?? {}).length;

  const stats = [
    { label: 'Niveaux d’étages', val: `${levelsCount}` },
    { label: 'Surface utile cumulée', val: totalRoomAreaM2 > 0 ? `${totalRoomAreaM2.toFixed(1)} m²` : '—' },
    { label: 'Murs modélisés', val: `${wallsCount}` },
    { label: 'Portes & Fenêtres', val: `${doorsCount + windowsCount}` },
    { label: 'Dalles / Planchers', val: `${slabsCount}` },
    { label: 'Toitures & Faîtages', val: `${roofsCount}` },
    { label: 'Escaliers & Trémies', val: `${stairsCount}` },
    { label: 'Coupes & Élévations', val: `${cutsCount}` },
    { label: 'Conduits & Gaines MEP', val: `${mepPipesCount + mepDuctsCount + mepTraysCount}` },
  ];

  let curStatY = summaryYPt + summaryBoxHeightPt - 16 * MM_TO_PT;
  for (const s of stats) {
    content.text(s.label, leftXPt + 5 * MM_TO_PT, curStatY, {
      size: 7.5,
      color: [0.3, 0.35, 0.45],
    });
    content.text(s.val, leftXPt + summaryBoxWidthPt - 5 * MM_TO_PT, curStatY, {
      font: 'bold',
      size: 8,
      align: 'right',
      color: [0.05, 0.1, 0.2],
    });
    curStatY -= 10 * MM_TO_PT;
  }

  // 4. Bloc de droite : Sommaire des Planches (Table of Sheets)
  const tableXPt = leftXPt + summaryBoxWidthPt + 10 * MM_TO_PT;
  const tableWidthPt = (format.widthMm - marginMm) * MM_TO_PT - tableXPt;
  const tableHeightPt = summaryBoxHeightPt;

  content.rect(tableXPt, summaryYPt, tableWidthPt, tableHeightPt, {
    fillColor: [1, 1, 1],
    strokeColor: [0.75, 0.82, 0.92],
    lineWidth: 0.6,
  });

  // En-tête de tableau
  const headerYPt = summaryYPt + tableHeightPt - 10 * MM_TO_PT;
  content.rect(tableXPt, headerYPt, tableWidthPt, 10 * MM_TO_PT, {
    fillColor: [0.92, 0.95, 0.98],
    strokeColor: [0.75, 0.82, 0.92],
    lineWidth: 0.6,
  });

  content.text('RÉF.', tableXPt + 4 * MM_TO_PT, headerYPt + 3 * MM_TO_PT, {
    font: 'bold',
    size: 7.5,
    color: [0.1, 0.2, 0.35],
  });
  content.text('DÉSIGNATION DE LA PLANCHE', tableXPt + 22 * MM_TO_PT, headerYPt + 3 * MM_TO_PT, {
    font: 'bold',
    size: 7.5,
    color: [0.1, 0.2, 0.35],
  });
  content.text('ÉCHELLE', tableXPt + tableWidthPt - 28 * MM_TO_PT, headerYPt + 3 * MM_TO_PT, {
    font: 'bold',
    size: 7.5,
    color: [0.1, 0.2, 0.35],
  });
  content.text('FORMAT', tableXPt + tableWidthPt - 4 * MM_TO_PT, headerYPt + 3 * MM_TO_PT, {
    font: 'bold',
    size: 7.5,
    align: 'right',
    color: [0.1, 0.2, 0.35],
  });

  // Lignes du sommaire
  const rowHeightPt = 8.5 * MM_TO_PT;
  let curRowY = headerYPt - rowHeightPt;

  for (let i = 0; i < sheetList.length; i++) {
    const entry = sheetList[i];
    if (!entry) continue;
    if (curRowY < summaryYPt + 4 * MM_TO_PT) break; // Ne pas déborder

    // Alternance de fond gris très clair
    if (i % 2 === 1) {
      content.rect(tableXPt, curRowY, tableWidthPt, rowHeightPt, {
        fillColor: [0.98, 0.98, 0.99],
      });
    }

    content.text(entry.sheetNumber, tableXPt + 4 * MM_TO_PT, curRowY + 2.5 * MM_TO_PT, {
      font: 'bold',
      size: 7.5,
      color: [0.1, 0.45, 0.85],
    });
    content.text(entry.title, tableXPt + 22 * MM_TO_PT, curRowY + 2.5 * MM_TO_PT, {
      size: 7.5,
      color: [0.1, 0.15, 0.25],
    });
    content.text(entry.scale, tableXPt + tableWidthPt - 28 * MM_TO_PT, curRowY + 2.5 * MM_TO_PT, {
      size: 7.5,
      color: [0.3, 0.35, 0.45],
    });
    content.text(`${format.widthMm === 420 ? 'A3' : 'A4'} Paysage`, tableXPt + tableWidthPt - 4 * MM_TO_PT, curRowY + 2.5 * MM_TO_PT, {
      size: 7.5,
      align: 'right',
      color: [0.3, 0.35, 0.45],
    });

    curRowY -= rowHeightPt;
  }

  // 5. Cartouche architectural
  drawTitleBlock(content, format, {
    projectTitle: options.projectTitle ?? 'PROJET MINI-BIM',
    sheetTitle: 'PAGE DE GARDE & SOMMAIRE',
    sheetNumber: `PL-${String(sheetIndex).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
    scaleLabel: 'N/A',
    date: options.date ?? new Date().toLocaleDateString('fr-FR'),
    author: options.author ?? 'Mini-BIM Engine',
    revision: options.revision ?? 'INDICE 0',
    showNorthArrow: false,
  });
}
