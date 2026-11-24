/**
 * clashUtils — Utilitaires partagés pour la détection et la coordination des conflits (ClashPanel & ClashWorkspace)
 */

import type { BimState, ClashResult, ClashSeverity } from '@tabax/core';

export type DisciplineFilter = 'all' | 'mep-structure' | 'mep-architecture' | 'mep-mep';

export interface ElementInfo {
  readonly name: string;
  readonly category: string;
  readonly discipline: string;
  readonly levelName: string;
  readonly levelId?: string | undefined;
}

/**
 * Formate le libellé d'affichage de la sévérité d'un conflit.
 */
export function formatSeverityLabel(severity: ClashSeverity): string {
  return severity === 'hard' ? 'Hard' : 'Clearance';
}

/**
 * Retourne la couleur hexadécimale associée à la sévérité d'un conflit.
 */
export function getSeverityColor(severity: ClashSeverity): string {
  return severity === 'hard' ? '#ef4444' : '#f59e0b';
}

/**
 * Extrait les métadonnées d'affichage d'un élément du modèle BIM pour les fiches d'inspection de clash.
 */
export function getElementInfo(state: BimState, id: string): ElementInfo {
  // Murs
  if (state.walls[id]) {
    const w = state.walls[id];
    const lvlName = (w && state.levels[w.levelId]?.name) ?? w?.levelId ?? 'N/A';
    const typeName = (w && state.wallTypes?.[w.typeId]?.name) ?? w?.typeId ?? 'Mur';
    return {
      name: `Mur (${typeName})`,
      category: 'Mur architectural',
      discipline: 'Architecture / Structure',
      levelName: lvlName,
      levelId: w?.levelId,
    };
  }
  // Dalles
  if (state.slabs?.[id]) {
    const s = state.slabs[id];
    const lvlName = (s && state.levels[s.levelId]?.name) ?? s?.levelId ?? 'N/A';
    const typeName = (s && state.slabTypes?.[s.slabTypeId]?.name) ?? s?.slabTypeId ?? 'Dalle';
    return {
      name: `Dalle (${typeName})`,
      category: 'Plancher / Dalle béton',
      discipline: 'Structure',
      levelName: lvlName,
      levelId: s?.levelId,
    };
  }
  // Tuyaux
  if (state.pipes?.[id]) {
    const p = state.pipes[id];
    const lvlName = (p?.levelId && state.levels[p.levelId]?.name) ?? p?.levelId ?? 'N/A';
    const sys = p?.systemId ? state.mepSystems?.[p.systemId] : undefined;
    const sysName = sys?.name ?? p?.systemId ?? 'Canalisation';
    return {
      name: `Tuyau Ø${p ? Math.round(p.diameter) : 0} mm (${sysName})`,
      category: 'Canalisation hydronique / plomberie',
      discipline: 'MEP (Fluides)',
      levelName: lvlName,
      levelId: p?.levelId,
    };
  }
  // Gaines
  if (state.ducts?.[id]) {
    const d = state.ducts[id];
    const lvlName = (d?.levelId && state.levels[d.levelId]?.name) ?? d?.levelId ?? 'N/A';
    const sys = d?.systemId ? state.mepSystems?.[d.systemId] : undefined;
    const sysName = sys?.name ?? d?.systemId ?? 'Gaine';
    const dimStr = d?.shape === 'round' ? `Ø${d.diameter} mm` : `${d ? Math.round(d.width ?? 0) : 0}x${d ? Math.round(d.height ?? 0) : 0} mm`;
    return {
      name: `Gaine ${dimStr} (${sysName})`,
      category: 'Gaine de ventilation / désenfumage',
      discipline: 'MEP (Aéraulique)',
      levelName: lvlName,
      levelId: d?.levelId,
    };
  }
  // Chemins de câbles
  if (state.cableTrays?.[id]) {
    const ct = state.cableTrays[id];
    const lvlName = (ct?.levelId && state.levels[ct.levelId]?.name) ?? ct?.levelId ?? 'N/A';
    const sys = ct?.systemId ? state.mepSystems?.[ct.systemId] : undefined;
    const sysName = sys?.name ?? ct?.systemId ?? 'Câbles';
    return {
      name: `Chemin de câbles ${ct ? Math.round(ct.width ?? 0) : 0}x${ct ? Math.round(ct.height ?? 0) : 0} mm (${sysName})`,
      category: 'Cheminement CFO / CFA',
      discipline: 'MEP (Électricité)',
      levelName: lvlName,
      levelId: ct?.levelId,
    };
  }
  // Toitures
  if (state.roofs?.[id]) {
    const r = state.roofs[id];
    const lvlName = (r?.levelId && state.levels[r.levelId]?.name) ?? r?.levelId ?? 'N/A';
    const rType = r?.roofTypeId ? state.roofTypes?.[r.roofTypeId] : undefined;
    const typeLabel = rType ? (rType.family === 'gable' ? '2 pans' : 'plate') : 'standard';
    return {
      name: `Toiture (${typeLabel})`,
      category: 'Couverture / Toiture',
      discipline: 'Architecture / Enveloppe',
      levelName: lvlName,
      levelId: r?.levelId,
    };
  }
  // Escaliers
  if (state.stairs?.[id]) {
    const st = state.stairs[id];
    const lvlId = st?.bottomLevelId;
    const lvlName = (lvlId && state.levels[lvlId]?.name) ?? lvlId ?? 'N/A';
    return {
      name: 'Escalier droit',
      category: 'Circulation verticale',
      discipline: 'Architecture',
      levelName: lvlName,
      levelId: lvlId,
    };
  }
  // Composants / Mobilier
  if (state.components?.[id]) {
    const comp = state.components[id];
    const cType = comp?.typeId ? state.componentTypes?.[comp.typeId] : undefined;
    const lvlName = (comp?.levelId && state.levels[comp.levelId]?.name) ?? comp?.levelId ?? 'N/A';
    return {
      name: cType?.name ?? comp?.typeId ?? 'Composant',
      category: cType?.subType ?? 'Mobilier / Équipement',
      discipline: 'Second-œuvre',
      levelName: lvlName,
      levelId: comp?.levelId,
    };
  }

  return {
    name: id,
    category: 'Élément IFC / Autre',
    discipline: 'Autre',
    levelName: 'N/A',
  };
}

/**
 * Filtre les conflits par sévérité, discipline et recherche textuelle.
 */
export function filterClashes(
  clashes: readonly ClashResult[],
  severityFilter: 'all' | ClashSeverity,
  disciplineFilter: DisciplineFilter,
  state: BimState,
  searchQuery = '',
): ClashResult[] {
  const query = searchQuery.trim().toLowerCase();

  return clashes.filter((c) => {
    if (severityFilter !== 'all' && c.severity !== severityFilter) {
      return false;
    }

    if (disciplineFilter !== 'all') {
      const isMepA = Boolean(
        state.pipes?.[c.elementA] || state.ducts?.[c.elementA] || state.cableTrays?.[c.elementA],
      );
      const isMepB = Boolean(
        state.pipes?.[c.elementB] || state.ducts?.[c.elementB] || state.cableTrays?.[c.elementB],
      );
      const isStructA = Boolean(state.walls[c.elementA] || state.slabs?.[c.elementA]);
      const isStructB = Boolean(state.walls[c.elementB] || state.slabs?.[c.elementB]);

      if (disciplineFilter === 'mep-mep' && (!isMepA || !isMepB)) {
        return false;
      }
      if (
        disciplineFilter === 'mep-structure' &&
        !((isMepA && isStructB) || (isMepB && isStructA))
      ) {
        return false;
      }
      if (disciplineFilter === 'mep-architecture' && (!isMepA && !isMepB)) {
        return false;
      }
    }

    if (query) {
      const infoA = getElementInfo(state, c.elementA);
      const infoB = getElementInfo(state, c.elementB);
      const text = `${c.elementA} ${c.elementB} ${infoA.name} ${infoB.name} ${infoA.category} ${infoB.category}`.toLowerCase();
      if (!text.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Exporte la liste des conflits en fichier CSV conforme UTF-8.
 */
export function exportClashesToCsv(clashes: readonly ClashResult[], state: BimState): void {
  const headers = [
    'ID Conflit',
    'Sévérité',
    'Profondeur (mm)',
    'Élément A - ID',
    'Élément A - Nom',
    'Élément A - Discipline',
    'Élément A - Niveau',
    'Élément B - ID',
    'Élément B - Nom',
    'Élément B - Discipline',
    'Élément B - Niveau',
    'Impact X (mm)',
    'Impact Y (mm)',
    'Impact Z (mm)',
  ];

  const rows = clashes.map((c) => {
    const infoA = getElementInfo(state, c.elementA);
    const infoB = getElementInfo(state, c.elementB);
    return [
      `"${c.id}"`,
      `"${c.severity.toUpperCase()}"`,
      Math.round(c.penetrationDepthMm),
      `"${c.elementA}"`,
      `"${infoA.name.replace(/"/g, '""')}"`,
      `"${infoA.discipline}"`,
      `"${infoA.levelName}"`,
      `"${c.elementB}"`,
      `"${infoB.name.replace(/"/g, '""')}"`,
      `"${infoB.discipline}"`,
      `"${infoB.levelName}"`,
      Math.round(c.point.x),
      Math.round(c.point.y),
      Math.round(c.point.z),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rapport-conflits-bim-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
