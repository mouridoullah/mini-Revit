import {
  computeLevelMetrics,
  type BimState,
  type CableTray,
  type Duct,
  type Level,
  type LevelMetrics,
  type MepSystem,
  type Pipe,
} from '@mini-bim/core';
import type { PdfPageContent } from './PdfWriter.js';
import { drawPageFrame, drawTitleBlock } from './cartouche.js';
import { MM_TO_PT, type PageFormatDef, type PdfBookOptions } from './types.js';

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
): void {
  // 1. Cadre de planche
  drawPageFrame(content, format);

  const marginMm = 15;
  const leftXPt = marginMm * MM_TO_PT;
  const topYPt = (format.heightMm - marginMm) * MM_TO_PT;

  // 2. Titre de section
  content.text('SYNTHÈSE TECHNIQUE : MÉTRÉS, QUANTITATIFS & TABLEAU DES SURFACES', leftXPt, topYPt - 6 * MM_TO_PT, {
    font: 'bold',
    size: 13,
    color: [0.08, 0.15, 0.28],
  });

  // 3. Calcul des métrés par niveau
  const levels: Level[] = Object.values(state.levels ?? {}).sort(
    (a, b) => a.elevation - b.elevation,
  );

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

  // ---------------------------------------------------------------------------
  // Tableau 1 : Récapitulatif par niveau
  // ---------------------------------------------------------------------------
  const t1YPt = topYPt - 16 * MM_TO_PT;
  const t1RowHeightPt = 6.5 * MM_TO_PT;
  const t1HeaderHeightPt = 7.5 * MM_TO_PT;

  content.text('1. RÉCAPITULATIF PAR NIVEAU ARCHITECTURAL', leftXPt, t1YPt, {
    font: 'bold',
    size: 8.5,
    color: [0.1, 0.45, 0.85],
  });

  const t1TableY = t1YPt - 4 * MM_TO_PT;
  const t1Cols = [
    { title: 'NIVEAU', w: 42 * MM_TO_PT, align: 'left' as const },
    { title: 'ALTIMÉTRIE', w: 28 * MM_TO_PT, align: 'right' as const },
    { title: 'LINÉAIRE MURS', w: 32 * MM_TO_PT, align: 'right' as const },
    { title: 'SURF. NETTE MURS', w: 36 * MM_TO_PT, align: 'right' as const },
    { title: 'VOLUME MURS', w: 30 * MM_TO_PT, align: 'right' as const },
    { title: 'PORTES', w: 22 * MM_TO_PT, align: 'right' as const },
    { title: 'FENÊTRES', w: 22 * MM_TO_PT, align: 'right' as const },
    { title: 'SURF. HABITABLE', w: 38 * MM_TO_PT, align: 'right' as const },
  ];

  const t1TotalWidth = t1Cols.reduce((acc, c) => acc + c.w, 0);

  // En-tête T1
  content.rect(leftXPt, t1TableY - t1HeaderHeightPt, t1TotalWidth, t1HeaderHeightPt, {
    fillColor: [0.9, 0.94, 0.98],
    strokeColor: [0.75, 0.82, 0.9],
    lineWidth: 0.5,
  });

  let curColX = leftXPt;
  for (const col of t1Cols) {
    const textX = col.align === 'right' ? curColX + col.w - 3 * MM_TO_PT : curColX + 3 * MM_TO_PT;
    content.text(col.title, textX, t1TableY - t1HeaderHeightPt + 2.5 * MM_TO_PT, {
      font: 'bold',
      size: 6.5,
      align: col.align,
      color: [0.1, 0.2, 0.35],
    });
    curColX += col.w;
  }

  // Lignes T1
  let curT1Y = t1TableY - t1HeaderHeightPt;
  for (let i = 0; i < levelMetricsList.length; i++) {
    const item = levelMetricsList[i];
    if (!item) continue;
    const lm = item.lm;
    curT1Y -= t1RowHeightPt;

    if (i % 2 === 1) {
      content.rect(leftXPt, curT1Y, t1TotalWidth, t1RowHeightPt, {
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
  curT1Y -= t1RowHeightPt;
  content.rect(leftXPt, curT1Y, t1TotalWidth, t1RowHeightPt, {
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

  // ---------------------------------------------------------------------------
  // Tableau 2 : Détail des Pièces & Surfaces (Habitables / Utiles)
  // ---------------------------------------------------------------------------
  const t2YPt = curT1Y - 10 * MM_TO_PT;
  content.text('2. TABLEAU DÉTAILLÉ DES PIÈCES ET SURFACES', leftXPt, t2YPt, {
    font: 'bold',
    size: 8.5,
    color: [0.1, 0.45, 0.85],
  });

  const t2Cols = [
    { title: 'PIÈCE', w: 50 * MM_TO_PT, align: 'left' as const },
    { title: 'NIVEAU', w: 35 * MM_TO_PT, align: 'left' as const },
    { title: 'SURFACE HABITABLE', w: 38 * MM_TO_PT, align: 'right' as const },
    { title: 'PÉRIMÈTRE', w: 30 * MM_TO_PT, align: 'right' as const },
  ];
  const t2TotalWidth = t2Cols.reduce((acc, c) => acc + c.w, 0);

  const allRooms: { name: string; levelName: string; areaM2: number; perimeterM: number }[] = [];
  for (const item of levelMetricsList) {
    for (const rm of item.lm.rooms) {
      allRooms.push({
        name: rm.name,
        levelName: item.levelName,
        areaM2: rm.areaMm2 / 1e6,
        perimeterM: rm.perimeterMm / 1000,
      });
    }
  }

  const t2TableY = t2YPt - 4 * MM_TO_PT;
  content.rect(leftXPt, t2TableY - t1HeaderHeightPt, t2TotalWidth, t1HeaderHeightPt, {
    fillColor: [0.9, 0.94, 0.98],
    strokeColor: [0.75, 0.82, 0.9],
    lineWidth: 0.5,
  });

  let t2cx = leftXPt;
  for (const col of t2Cols) {
    const textX = col.align === 'right' ? t2cx + col.w - 3 * MM_TO_PT : t2cx + 3 * MM_TO_PT;
    content.text(col.title, textX, t2TableY - t1HeaderHeightPt + 2.5 * MM_TO_PT, {
      font: 'bold',
      size: 6.5,
      align: col.align,
      color: [0.1, 0.2, 0.35],
    });
    t2cx += col.w;
  }

  let curT2Y = t2TableY - t1HeaderHeightPt;
  const maxRoomsToShow = Math.min(allRooms.length, 12);
  for (let i = 0; i < maxRoomsToShow; i++) {
    const rm = allRooms[i];
    if (!rm) continue;
    curT2Y -= t1RowHeightPt;

    if (i % 2 === 1) {
      content.rect(leftXPt, curT2Y, t2TotalWidth, t1RowHeightPt, {
        fillColor: [0.98, 0.98, 0.99],
      });
    }

    const row = [
      rm.name,
      rm.levelName,
      `${rm.areaM2.toFixed(2)} m²`,
      `${rm.perimeterM.toFixed(1)} m`,
    ];

    let cx = leftXPt;
    for (let c = 0; c < t2Cols.length; c++) {
      const col = t2Cols[c];
      const val = row[c];
      if (!col || val === undefined) continue;
      const textX = col.align === 'right' ? cx + col.w - 3 * MM_TO_PT : cx + 3 * MM_TO_PT;
      content.text(val, textX, curT2Y + 2 * MM_TO_PT, {
        size: 7,
        align: col.align,
        color: [0.15, 0.2, 0.3],
      });
      cx += col.w;
    }
  }

  // ---------------------------------------------------------------------------
  // Tableau 3 : Réseaux Techniques MEP (disposé à droite du tableau 2)
  // ---------------------------------------------------------------------------
  const t3XPt = leftXPt + t2TotalWidth + 12 * MM_TO_PT;
  const t3Cols = [
    { title: 'SYSTÈME MEP', w: 42 * MM_TO_PT, align: 'left' as const },
    { title: 'DOMAINE', w: 32 * MM_TO_PT, align: 'left' as const },
    { title: 'LINÉAIRE TOTAL', w: 30 * MM_TO_PT, align: 'right' as const },
  ];
  const t3TotalWidth = t3Cols.reduce((acc, c) => acc + c.w, 0);

  content.text('3. RÉSEAUX TECHNIQUES MEP', t3XPt, t2YPt, {
    font: 'bold',
    size: 8.5,
    color: [0.1, 0.45, 0.85],
  });

  content.rect(t3XPt, t2TableY - t1HeaderHeightPt, t3TotalWidth, t1HeaderHeightPt, {
    fillColor: [0.9, 0.94, 0.98],
    strokeColor: [0.75, 0.82, 0.9],
    lineWidth: 0.5,
  });

  let t3cx = t3XPt;
  for (const col of t3Cols) {
    const textX = col.align === 'right' ? t3cx + col.w - 3 * MM_TO_PT : t3cx + 3 * MM_TO_PT;
    content.text(col.title, textX, t2TableY - t1HeaderHeightPt + 2.5 * MM_TO_PT, {
      font: 'bold',
      size: 6.5,
      align: col.align,
      color: [0.1, 0.2, 0.35],
    });
    t3cx += col.w;
  }

  // Calcul du linéaire par système MEP
  const mepSystems: MepSystem[] = Object.values(state.mepSystems ?? {});
  const pipes: Pipe[] = Object.values(state.pipes ?? {});
  const ducts: Duct[] = Object.values(state.ducts ?? {});
  const cableTrays: CableTray[] = Object.values(state.cableTrays ?? {});

  let curT3Y = t2TableY - t1HeaderHeightPt;
  for (let i = 0; i < mepSystems.length; i++) {
    const sys = mepSystems[i];
    if (!sys) continue;
    curT3Y -= t1RowHeightPt;

    // Calcul de la longueur totale du système
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
      content.rect(t3XPt, curT3Y, t3TotalWidth, t1RowHeightPt, {
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

  // 4. Cartouche architectural
  drawTitleBlock(content, format, {
    projectTitle: options.projectTitle ?? 'PROJET MINI-BIM',
    sheetTitle: 'SYNTHÈSE MÉTRÉS & SURFACES',
    sheetNumber: `PL-${String(sheetIndex).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
    scaleLabel: 'N/A',
    date: options.date ?? new Date().toLocaleDateString('fr-FR'),
    author: options.author ?? 'Mini-BIM Engine',
    revision: options.revision ?? 'INDICE 0',
    showNorthArrow: false,
  });
}
