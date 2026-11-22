import {
  computeLevelMetrics,
  type BimState,
  type CableTray,
  type Duct,
  type Level,
  type LevelMetrics,
  type MepSystem,
  type Pipe,
} from '@tabax/core';
import type { PdfPageContent } from './PdfWriter.js';
import { drawPageFrame, drawTitleBlock } from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

export interface RoomMetricItem {
  readonly name: string;
  readonly levelName: string;
  readonly areaM2: number;
  readonly perimeterM: number;
}

/**
 * Calcule le nombre de planches requises pour les métrés et surfaces selon le format papier et le volume de pièces.
 */
export function calculateMetricsSheetCount(state: BimState, format: PageFormatDef): number {
  const allRoomsCount = Object.keys(state.rooms ?? {}).length;
  const isA3 = format.widthMm >= 400;

  if (isA3) {
    // Sur A3 paysage (420 x 297 mm) :
    // Page 1 accueille Tableau 1 (Niveaux), Tableau 3 (MEP) et jusqu'à 40 pièces (2 colonnes de 20).
    if (allRoomsCount <= 40) return 1;
    // Les pages suivantes accueillent 2 colonnes de 32 pièces = 64 pièces par page.
    return 1 + Math.ceil((allRoomsCount - 40) / 64);
  } else {
    // Sur A4 paysage (297 x 210 mm) :
    // Page 1 accueille Tableau 1, Tableau 3 et jusqu'à 10 pièces.
    if (allRoomsCount <= 10) return 1;
    // Les pages suivantes accueillent jusqu'à 24 pièces.
    return 1 + Math.ceil((allRoomsCount - 10) / 24);
  }
}

/**
 * Extrait la liste ordonnée de toutes les pièces avec leurs métrés associés.
 */
function extractAllRooms(state: BimState, levels: Level[]): RoomMetricItem[] {
  const result: RoomMetricItem[] = [];
  for (const lvl of levels) {
    try {
      const lm = computeLevelMetrics(state, lvl.id);
      for (const rm of lm.rooms) {
        result.push({
          name: rm.name,
          levelName: lvl.name,
          areaM2: rm.areaMm2 / 1e6,
          perimeterM: rm.perimeterMm / 1000,
        });
      }
    } catch {
      // Ignorer si niveau vide
    }
  }
  return result;
}

/**
 * Rendu vectoriel d'une colonne de tableau de pièces.
 */
function drawRoomsTableColumn(
  content: PdfPageContent,
  rooms: RoomMetricItem[],
  startXPt: number,
  startYPt: number,
  cols: readonly { readonly title: string; readonly w: number; readonly align: 'left' | 'right' }[],
  rowHeightPt: number,
  headerHeightPt: number,
): void {
  const totalWidth = cols.reduce((acc, c) => acc + c.w, 0);

  // En-tête
  content.rect(startXPt, startYPt - headerHeightPt, totalWidth, headerHeightPt, {
    fillColor: [0.9, 0.94, 0.98],
    strokeColor: [0.75, 0.82, 0.9],
    lineWidth: 0.5,
  });

  let curX = startXPt;
  for (const col of cols) {
    const textX = col.align === 'right' ? curX + col.w - 3 * MM_TO_PT : curX + 3 * MM_TO_PT;
    content.text(col.title, textX, startYPt - headerHeightPt + 2.5 * MM_TO_PT, {
      font: 'bold',
      size: 6.5,
      align: col.align,
      color: [0.1, 0.2, 0.35],
    });
    curX += col.w;
  }

  // Lignes
  let curY = startYPt - headerHeightPt;
  for (let i = 0; i < rooms.length; i++) {
    const rm = rooms[i];
    if (!rm) continue;
    curY -= rowHeightPt;

    if (i % 2 === 1) {
      content.rect(startXPt, curY, totalWidth, rowHeightPt, {
        fillColor: [0.98, 0.98, 0.99],
      });
    }

    const row = [
      rm.name,
      rm.levelName,
      `${rm.areaM2.toFixed(2)} m²`,
      `${rm.perimeterM.toFixed(1)} m`,
    ];

    let cx = startXPt;
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const val = row[c];
      if (!col || val === undefined) continue;
      const textX = col.align === 'right' ? cx + col.w - 3 * MM_TO_PT : cx + 3 * MM_TO_PT;
      content.text(val, textX, curY + 2 * MM_TO_PT, {
        size: 7,
        align: col.align,
        color: [0.15, 0.2, 0.3],
      });
      cx += col.w;
    }
  }
}

/**
 * Rendu vectoriel de la planche de synthèse des métrés et surfaces dans le carnet PDF.
 */
export function renderMetricsPage(
  content: PdfPageContent,
  state: BimState,
  format: PageFormatDef,
  options: PdfBookOptions,
  sheetIndex: number,
  totalPages: number,
  metricsPageIndex = 0,
  totalMetricsPages = 1,
): void {
  // 1. Cadre de planche
  drawPageFrame(content, format);

  const marginMm = 15;
  const leftXPt = marginMm * MM_TO_PT;
  const topYPt = (format.heightMm - marginMm) * MM_TO_PT;
  const isA3 = format.widthMm >= 400;

  const levels: Level[] = Object.values(state.levels ?? {}).sort(
    (a, b) => a.elevation - b.elevation,
  );
  const allRooms = extractAllRooms(state, levels);

  const rowHeightPt = 6.5 * MM_TO_PT;
  const headerHeightPt = 7.5 * MM_TO_PT;

  const t2Cols = [
    { title: 'PIÈCE', w: (isA3 ? 48 : 42) * MM_TO_PT, align: 'left' as const },
    { title: 'NIVEAU', w: (isA3 ? 34 : 30) * MM_TO_PT, align: 'left' as const },
    { title: 'SURFACE HABITABLE', w: (isA3 ? 36 : 32) * MM_TO_PT, align: 'right' as const },
    { title: 'PÉRIMÈTRE', w: (isA3 ? 28 : 24) * MM_TO_PT, align: 'right' as const },
  ];

  // ===========================================================================
  // CAS A : Planche principale (metricsPageIndex === 0)
  // ===========================================================================
  if (metricsPageIndex === 0) {
    const mainTitle =
      totalMetricsPages > 1
        ? `SYNTHÈSE TECHNIQUE : MÉTRÉS, QUANTITATIFS & TABLEAU DES SURFACES (1 / ${totalMetricsPages})`
        : 'SYNTHÈSE TECHNIQUE : MÉTRÉS, QUANTITATIFS & TABLEAU DES SURFACES';

    content.text(mainTitle, leftXPt, topYPt - 6 * MM_TO_PT, {
      font: 'bold',
      size: 13,
      color: [0.08, 0.15, 0.28],
    });

    interface LevelMetricsItem {
      readonly lm: LevelMetrics;
      readonly levelName: string;
      readonly elevation: number;
    }

    const levelMetricsList: LevelMetricsItem[] = [];
    let grandTotalWallLinearM = 0;
    let grandTotalWallNetAreaM2 = 0;
    let grandTotalWallVolumeM3 = 0;
    let grandTotalDoorCount = 0;
    let grandTotalWindowCount = 0;
    let grandTotalRoomAreaM2 = 0;

    for (const lvl of levels) {
      try {
        const lm = computeLevelMetrics(state, lvl.id);
        levelMetricsList.push({
          lm,
          levelName: lvl.name,
          elevation: lvl.elevation,
        });
        grandTotalWallLinearM += lm.totals.wallLinearM;
        grandTotalWallNetAreaM2 += lm.totals.wallNetAreaM2;
        grandTotalWallVolumeM3 += lm.totals.wallVolumeM3;
        grandTotalDoorCount += lm.totals.doorCount;
        grandTotalWindowCount += lm.totals.windowCount;
        grandTotalRoomAreaM2 += lm.totals.roomAreaM2;
      } catch {
        // Ignorer les erreurs éventuelles sur niveau vide
      }
    }

    // -------------------------------------------------------------------------
    // Tableau 1 : Récapitulatif par niveau
    // -------------------------------------------------------------------------
    const t1YPt = topYPt - 16 * MM_TO_PT;

    content.text('1. RÉCAPITULATIF PAR NIVEAU ARCHITECTURAL', leftXPt, t1YPt, {
      font: 'bold',
      size: 8.5,
      color: [0.1, 0.45, 0.85],
    });

    const t1TableY = t1YPt - 4 * MM_TO_PT;
    const t1Cols = [
      { title: 'NIVEAU', w: 42 * MM_TO_PT, align: 'left' as const },
      { title: 'ALTIMÉTRIE', w: 26 * MM_TO_PT, align: 'right' as const },
      { title: 'LINÉAIRE MURS', w: 30 * MM_TO_PT, align: 'right' as const },
      { title: 'SURF. NETTE MURS', w: 34 * MM_TO_PT, align: 'right' as const },
      { title: 'VOLUME MURS', w: 28 * MM_TO_PT, align: 'right' as const },
      { title: 'PORTES', w: 20 * MM_TO_PT, align: 'right' as const },
      { title: 'FENÊTRES', w: 20 * MM_TO_PT, align: 'right' as const },
      { title: 'SURF. HABITABLE', w: 36 * MM_TO_PT, align: 'right' as const },
    ];
    const t1TotalWidth = t1Cols.reduce((acc, c) => acc + c.w, 0);

    // En-tête T1
    content.rect(leftXPt, t1TableY - headerHeightPt, t1TotalWidth, headerHeightPt, {
      fillColor: [0.9, 0.94, 0.98],
      strokeColor: [0.75, 0.82, 0.9],
      lineWidth: 0.5,
    });

    let curColX = leftXPt;
    for (const col of t1Cols) {
      const textX = col.align === 'right' ? curColX + col.w - 3 * MM_TO_PT : curColX + 3 * MM_TO_PT;
      content.text(col.title, textX, t1TableY - headerHeightPt + 2.5 * MM_TO_PT, {
        font: 'bold',
        size: 6.5,
        align: col.align,
        color: [0.1, 0.2, 0.35],
      });
      curColX += col.w;
    }

    // Lignes T1
    let curT1Y = t1TableY - headerHeightPt;
    for (let i = 0; i < levelMetricsList.length; i++) {
      const item = levelMetricsList[i];
      if (!item) continue;
      const lm = item.lm;
      curT1Y -= rowHeightPt;

      if (i % 2 === 1) {
        content.rect(leftXPt, curT1Y, t1TotalWidth, rowHeightPt, {
          fillColor: [0.98, 0.98, 0.99],
        });
      }

      const rowData = [
        item.levelName,
        `${(item.elevation / 1000).toFixed(2)} m`,
        `${lm.totals.wallLinearM.toFixed(1)} m`,
        `${lm.totals.wallNetAreaM2.toFixed(1)} m²`,
        `${lm.totals.wallVolumeM3.toFixed(2)} m³`,
        `${lm.totals.doorCount}`,
        `${lm.totals.windowCount}`,
        lm.totals.roomAreaM2 > 0 ? `${lm.totals.roomAreaM2.toFixed(1)} m²` : '—',
      ];

      let cx = leftXPt;
      for (let c = 0; c < t1Cols.length; c++) {
        const col = t1Cols[c];
        const val = rowData[c];
        if (!col || val === undefined) continue;
        const textX = col.align === 'right' ? cx + col.w - 3 * MM_TO_PT : cx + 3 * MM_TO_PT;
        content.text(val, textX, curT1Y + 2 * MM_TO_PT, {
          size: 7,
          align: col.align,
          color: [0.15, 0.2, 0.3],
        });
        cx += col.w;
      }
    }

    // Ligne de Total T1
    curT1Y -= rowHeightPt;
    content.rect(leftXPt, curT1Y, t1TotalWidth, rowHeightPt, {
      fillColor: [0.88, 0.92, 0.97],
      strokeColor: [0.7, 0.78, 0.88],
      lineWidth: 0.6,
    });

    const totalsData = [
      'TOTAL GÉNÉRAL',
      '—',
      `${grandTotalWallLinearM.toFixed(1)} m`,
      `${grandTotalWallNetAreaM2.toFixed(1)} m²`,
      `${grandTotalWallVolumeM3.toFixed(2)} m³`,
      `${grandTotalDoorCount}`,
      `${grandTotalWindowCount}`,
      grandTotalRoomAreaM2 > 0 ? `${grandTotalRoomAreaM2.toFixed(1)} m²` : '—',
    ];

    let totX = leftXPt;
    for (let c = 0; c < t1Cols.length; c++) {
      const col = t1Cols[c];
      const val = totalsData[c];
      if (!col || val === undefined) continue;
      const textX = col.align === 'right' ? totX + col.w - 3 * MM_TO_PT : totX + 3 * MM_TO_PT;
      content.text(val, textX, curT1Y + 2 * MM_TO_PT, {
        font: 'bold',
        size: 7,
        align: col.align,
        color: [0.05, 0.15, 0.3],
      });
      totX += col.w;
    }

    // -------------------------------------------------------------------------
    // Tableau 3 : Réseaux Techniques MEP
    // -------------------------------------------------------------------------
    // Sur A3, disposé à droite du Tableau 1 au sommet
    // Sur A4, disposé sous le Tableau 1
    const t3XPt = isA3 ? leftXPt + t1TotalWidth + 12 * MM_TO_PT : leftXPt;
    const t3YPt = isA3 ? t1YPt : curT1Y - 10 * MM_TO_PT;

    const t3Cols = [
      { title: 'SYSTÈME MEP', w: (isA3 ? 44 : 40) * MM_TO_PT, align: 'left' as const },
      { title: 'DOMAINE', w: (isA3 ? 34 : 30) * MM_TO_PT, align: 'left' as const },
      { title: 'LINÉAIRE TOTAL', w: (isA3 ? 30 : 28) * MM_TO_PT, align: 'right' as const },
    ];
    const t3TotalWidth = t3Cols.reduce((acc, c) => acc + c.w, 0);

    content.text('3. RÉSEAUX TECHNIQUES MEP', t3XPt, t3YPt, {
      font: 'bold',
      size: 8.5,
      color: [0.1, 0.45, 0.85],
    });

    const t3TableY = t3YPt - 4 * MM_TO_PT;
    content.rect(t3XPt, t3TableY - headerHeightPt, t3TotalWidth, headerHeightPt, {
      fillColor: [0.9, 0.94, 0.98],
      strokeColor: [0.75, 0.82, 0.9],
      lineWidth: 0.5,
    });

    let t3cx = t3XPt;
    for (const col of t3Cols) {
      const textX = col.align === 'right' ? t3cx + col.w - 3 * MM_TO_PT : t3cx + 3 * MM_TO_PT;
      content.text(col.title, textX, t3TableY - headerHeightPt + 2.5 * MM_TO_PT, {
        font: 'bold',
        size: 6.5,
        align: col.align,
        color: [0.1, 0.2, 0.35],
      });
      t3cx += col.w;
    }

    const mepSystems: MepSystem[] = Object.values(state.mepSystems ?? {});
    const pipes: Pipe[] = Object.values(state.pipes ?? {});
    const ducts: Duct[] = Object.values(state.ducts ?? {});
    const cableTrays: CableTray[] = Object.values(state.cableTrays ?? {});

    let curT3Y = t3TableY - headerHeightPt;
    for (let i = 0; i < mepSystems.length; i++) {
      const sys = mepSystems[i];
      if (!sys) continue;
      curT3Y -= rowHeightPt;

      let lengthMm = 0;
      for (const p of pipes) {
        if (p.systemId === sys.id) {
          lengthMm += Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y, p.end.z - p.start.z);
        }
      }
      for (const d of ducts) {
        if (d.systemId === sys.id) {
          lengthMm += Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y, d.end.z - d.start.z);
        }
      }
      for (const t of cableTrays) {
        if (t.systemId === sys.id) {
          lengthMm += Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y, t.end.z - t.start.z);
        }
      }

      if (i % 2 === 1) {
        content.rect(t3XPt, curT3Y, t3TotalWidth, rowHeightPt, {
          fillColor: [0.98, 0.98, 0.99],
        });
      }

      const row = [
        sys.name ?? sys.id,
        sys.domain ?? 'CVC / Plomberie',
        `${(lengthMm / 1000).toFixed(1)} m`,
      ];

      let cx = t3XPt;
      for (let c = 0; c < t3Cols.length; c++) {
        const col = t3Cols[c];
        const val = row[c];
        if (!col || val === undefined) continue;
        const textX = col.align === 'right' ? cx + col.w - 3 * MM_TO_PT : cx + 3 * MM_TO_PT;
        content.text(val, textX, curT3Y + 2 * MM_TO_PT, {
          size: 7,
          align: col.align,
          color: [0.15, 0.2, 0.3],
        });
        cx += col.w;
      }
    }

    // -------------------------------------------------------------------------
    // Tableau 2 : Détail des Pièces & Surfaces
    // -------------------------------------------------------------------------
    const t2YPt = isA3
      ? Math.min(curT1Y, curT3Y) - 10 * MM_TO_PT
      : curT3Y - 10 * MM_TO_PT;

    content.text('2. TABLEAU DÉTAILLÉ DES PIÈCES ET SURFACES', leftXPt, t2YPt, {
      font: 'bold',
      size: 8.5,
      color: [0.1, 0.45, 0.85],
    });

    const page1RoomsCapacity = isA3 ? 40 : 10;
    const page1Rooms = allRooms.slice(0, page1RoomsCapacity);
    const t2TableY = t2YPt - 4 * MM_TO_PT;

    if (isA3 && page1Rooms.length > 18) {
      // Sur A3, division en 2 colonnes équilibrées
      const mid = Math.ceil(page1Rooms.length / 2);
      const col1Rooms = page1Rooms.slice(0, mid);
      const col2Rooms = page1Rooms.slice(mid);
      const col1Width = t2Cols.reduce((acc, c) => acc + c.w, 0);

      drawRoomsTableColumn(content, col1Rooms, leftXPt, t2TableY, t2Cols, rowHeightPt, headerHeightPt);
      drawRoomsTableColumn(
        content,
        col2Rooms,
        leftXPt + col1Width + 12 * MM_TO_PT,
        t2TableY,
        t2Cols,
        rowHeightPt,
        headerHeightPt,
      );
    } else {
      drawRoomsTableColumn(content, page1Rooms, leftXPt, t2TableY, t2Cols, rowHeightPt, headerHeightPt);
    }
  } else {
    // =========================================================================
    // CAS B : Planche de continuation (metricsPageIndex > 0)
    // =========================================================================
    const continuationTitle = `TABLEAU DÉTAILLÉ DES PIÈCES ET SURFACES (SUITE - PAGE ${metricsPageIndex + 1} / ${totalMetricsPages})`;
    content.text(continuationTitle, leftXPt, topYPt - 6 * MM_TO_PT, {
      font: 'bold',
      size: 13,
      color: [0.08, 0.15, 0.28],
    });

    const page1RoomsCapacity = isA3 ? 40 : 10;
    const subsequentCapacity = isA3 ? 64 : 24;
    const startIdx = page1RoomsCapacity + (metricsPageIndex - 1) * subsequentCapacity;
    const endIdx = startIdx + subsequentCapacity;
    const pageRooms = allRooms.slice(startIdx, endIdx);

    const t2TableY = topYPt - 16 * MM_TO_PT;

    if (isA3 && pageRooms.length > 32) {
      const mid = Math.ceil(pageRooms.length / 2);
      const col1Rooms = pageRooms.slice(0, mid);
      const col2Rooms = pageRooms.slice(mid);
      const col1Width = t2Cols.reduce((acc, c) => acc + c.w, 0);

      drawRoomsTableColumn(content, col1Rooms, leftXPt, t2TableY, t2Cols, rowHeightPt, headerHeightPt);
      drawRoomsTableColumn(
        content,
        col2Rooms,
        leftXPt + col1Width + 12 * MM_TO_PT,
        t2TableY,
        t2Cols,
        rowHeightPt,
        headerHeightPt,
      );
    } else {
      drawRoomsTableColumn(content, pageRooms, leftXPt, t2TableY, t2Cols, rowHeightPt, headerHeightPt);
    }
  }

  // 4. Cartouche architectural
  const sheetTitle =
    metricsPageIndex === 0
      ? 'SYNTHÈSE MÉTRÉS & SURFACES'
      : `SYNTHÈSE MÉTRÉS & SURFACES (${metricsPageIndex + 1})`;

  drawTitleBlock(content, format, {
    projectTitle: options.projectTitle ?? 'PROJET TABAX',
    sheetTitle,
    sheetNumber: `PL-${String(sheetIndex).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
    scaleLabel: 'N/A',
    date: options.date ?? new Date().toLocaleDateString('fr-FR'),
    author: options.author ?? 'Tabax Engine',
    revision: options.revision ?? 'INDICE 0',
    showNorthArrow: false,
  });
}
