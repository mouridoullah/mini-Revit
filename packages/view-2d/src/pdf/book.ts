import {
  computeSectionScene,
  type BimDocument,
  type BimState,
  type Level,
  type SectionCut,
} from '@tabax/core';
import { PdfWriter } from './PdfWriter.js';
import { renderCoverPage, type SheetEntry } from './render-cover-page.js';
import {
  calculateMetricsSheetCount,
  renderMetricsPage,
} from './render-metrics-page.js';
import { renderPlanPage } from './render-plan-page.js';
import { renderSectionPage } from './render-section-page.js';
import { PAPER_FORMATS, type PdfBookOptions } from './types.js';

/**
 * Génère le carnet de plans architectural multi-pages complet au format PDF 1.4 vectoriel pur.
 *
 * Principes stricts de conformité :
 * - Aucune dépendance externe ni filigrane
 * - Encodage Windows-1252 (WinAnsiEncoding) pour les caractères français et unités
 * - Table xref calculée en octets réels sur le flux binaire Uint8Array
 * - Cartouche architectural complet avec échelle graphique graduée et flèche Nord
 * - Enchaînement : Page de garde -> Plans d'étages -> Coupes & Élévations -> Synthèse Métrés
 */
export function generatePdfBook(
  doc: BimDocument | BimState,
  options: PdfBookOptions = {},
): Uint8Array {
  const state: BimState =
    'getState' in doc && typeof doc.getState === 'function' ? doc.getState() : (doc as BimState);
  const paperSize = options.paperSize ?? 'A4';
  const format = PAPER_FORMATS[paperSize] ?? PAPER_FORMATS.A4;

  const includeCover = options.includeCover !== false;
  const includePlans = options.includePlans !== false;
  const includeSections = options.includeSections !== false;
  const includeMetrics = options.includeMetrics !== false;

  // 1. Filtrage et tri des niveaux d'étages
  const allLevels: Level[] = Object.values(state.levels ?? {}).sort(
    (a, b) => a.elevation - b.elevation,
  );

  const selectedLevelIds = options.levelIds;
  const levelsToRender = selectedLevelIds
    ? allLevels.filter((lvl) => selectedLevelIds.includes(lvl.id))
    : allLevels;

  // 2. Coupes et élévations
  const cutsToRender: SectionCut[] = Object.values(state.sectionCuts ?? {});

  // 3. Calcul prévisionnel du nombre total de planches et construction du sommaire
  const sheetList: SheetEntry[] = [];
  let sheetCount = 0;

  if (includeCover) {
    sheetCount++;
    sheetList.push({
      sheetNumber: `PL-${String(sheetCount).padStart(2, '0')}`,
      title: 'Page de garde & Sommaire général',
      scale: '—',
    });
  }

  if (includePlans) {
    for (const lvl of levelsToRender) {
      sheetCount++;
      sheetList.push({
        sheetNumber: `PL-${String(sheetCount).padStart(2, '0')}`,
        title: `Plan d’Étage — ${lvl.name}`,
        scale: options.scale && options.scale !== 'auto' ? `1:${options.scale}` : 'Auto',
      });
    }
  }

  if (includeSections) {
    for (const cut of cutsToRender) {
      sheetCount++;
      const kindStr = cut.kind === 'elevation' ? 'Élévation' : 'Coupe';
      sheetList.push({
        sheetNumber: `PL-${String(sheetCount).padStart(2, '0')}`,
        title: `${kindStr} — ${cut.name} (${cut.label})`,
        scale: options.scale && options.scale !== 'auto' ? `1:${options.scale}` : 'Auto',
      });
    }
  }

  const metricsPageCount = includeMetrics
    ? calculateMetricsSheetCount(state, format)
    : 0;

  if (includeMetrics) {
    for (let m = 0; m < metricsPageCount; m++) {
      sheetCount++;
      const title =
        metricsPageCount === 1
          ? 'Synthèse des Métrés, Quantitatifs & Surfaces'
          : m === 0
            ? 'Synthèse des Métrés & Surfaces (Partie 1)'
            : `Tableau Détaillé des Pièces & Surfaces (Partie ${m + 1})`;
      sheetList.push({
        sheetNumber: `PL-${String(sheetCount).padStart(2, '0')}`,
        title,
        scale: '—',
      });
    }
  }

  const totalPages = Math.max(1, sheetCount);

  // 4. Instanciation du moteur PDF et composition des pages
  const writer = new PdfWriter();
  let currentSheetIndex = 1;

  // A. Page de garde & Sommaire
  if (includeCover) {
    const pageContent = writer.addPage(format.widthPt, format.heightPt);
    renderCoverPage(
      pageContent,
      state,
      format,
      options,
      currentSheetIndex++,
      totalPages,
      sheetList,
    );
  }

  // B. Planches Plans d'étages
  if (includePlans) {
    for (const lvl of levelsToRender) {
      const pageContent = writer.addPage(format.widthPt, format.heightPt);
      renderPlanPage(
        pageContent,
        state,
        lvl.id,
        format,
        options,
        currentSheetIndex++,
        totalPages,
      );
    }
  }

  // C. Planches Coupes & Élévations
  if (includeSections) {
    for (const cut of cutsToRender) {
      const pageContent = writer.addPage(format.widthPt, format.heightPt);
      const scene = computeSectionScene(state, cut);
      renderSectionPage(
        pageContent,
        scene,
        format,
        options,
        currentSheetIndex++,
        totalPages,
      );
    }
  }

  // D. Planche(s) Synthèse Métrés & Surfaces
  if (includeMetrics) {
    for (let m = 0; m < metricsPageCount; m++) {
      const pageContent = writer.addPage(format.widthPt, format.heightPt);
      renderMetricsPage(
        pageContent,
        state,
        format,
        options,
        currentSheetIndex++,
        totalPages,
        m,
        metricsPageCount,
      );
    }
  }

  // 5. Compilation du fichier binaire PDF 1.4
  return writer.compile();
}
