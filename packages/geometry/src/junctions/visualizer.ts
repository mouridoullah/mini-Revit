import { type JunctionSolution } from './types.js';

export interface SvgExportOptions {
  readonly width?: number;
  readonly height?: number;
  readonly padding?: number; // mm
  readonly showAxes?: boolean;
  readonly showLabels?: boolean;
}

const WALL_COLORS = [
  { fill: 'rgba(59, 130, 246, 0.35)', stroke: '#1d4ed8' }, // Bleu
  { fill: 'rgba(16, 185, 129, 0.35)', stroke: '#047857' }, // Vert
  { fill: 'rgba(245, 158, 11, 0.35)', stroke: '#b45309' }, // Ambre
  { fill: 'rgba(139, 92, 246, 0.35)', stroke: '#6d28d9' }, // Violet
  { fill: 'rgba(236, 72, 153, 0.35)', stroke: '#be185d' }, // Rose
  { fill: 'rgba(20, 184, 166, 0.35)', stroke: '#0f766e' }, // Teal
];

/**
 * Génère un document SVG vectoriel visualisant avec précision la résolution d'une jonction de murs.
 *
 * Représente graphiquement :
 * - Les polygones finaux résolus avec remplissages distincts par mur.
 * - Les axes nominaux de référence des murs (en pointillés).
 * - Les points de jonction (en rouge).
 * - Les étiquettes d'identifiants et de surfaces nettes.
 */
export function exportJunctionsSvg(
  solution: JunctionSolution,
  options: SvgExportOptions = {},
): string {
  const padding = options.padding ?? 300;
  const showAxes = options.showAxes ?? true;
  const showLabels = options.showLabels ?? true;

  if (solution.walls.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">Aucun mur</text></svg>`;
  }

  // Calcul de la bounding box globale
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of solution.walls) {
    for (const v of w.polygon) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    if (w.start.x < minX) minX = w.start.x;
    if (w.start.y < minY) minY = w.start.y;
    if (w.start.x > maxX) maxX = w.start.x;
    if (w.start.y > maxY) maxY = w.start.y;
    if (w.end.x < minX) minX = w.end.x;
    if (w.end.y < minY) minY = w.end.y;
    if (w.end.x > maxX) maxX = w.end.x;
    if (w.end.y > maxY) maxY = w.end.y;
  }

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const viewBoxWidth = maxX - minX;
  const viewBoxHeight = maxY - minY;

  // Inversion de l'axe Y : Y_svg = maxY - Y_monde + minY
  const toSvgY = (y: number) => maxY - y + minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${viewBoxWidth} ${viewBoxHeight}" style="background-color: #f8fafc; font-family: monospace;">\n`;

  // 1. Polygones résolus
  svg += `  <g id="resolved-walls">\n`;
  solution.walls.forEach((w, idx) => {
    const col = WALL_COLORS[idx % WALL_COLORS.length] ?? {
      fill: 'rgba(59, 130, 246, 0.35)',
      stroke: '#1d4ed8',
    };
    const pointsStr = w.polygon.map((p) => `${p.x},${toSvgY(p.y)}`).join(' ');
    svg += `    <!-- Mur ${w.id} (Surface: ${(w.area / 1e6).toFixed(3)} m²) -->\n`;
    svg += `    <polygon points="${pointsStr}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="4" stroke-linejoin="round" />\n`;

    // Dessin des sommets
    w.polygon.forEach((p) => {
      svg += `    <circle cx="${p.x}" cy="${toSvgY(p.y)}" r="5" fill="${col.stroke}" />\n`;
    });
  });
  svg += `  </g>\n`;

  // 2. Axes nominaux
  if (showAxes) {
    svg += `  <g id="wall-axes" stroke="#475569" stroke-width="2" stroke-dasharray="8,6">\n`;
    solution.walls.forEach((w) => {
      svg += `    <line x1="${w.start.x}" y1="${toSvgY(w.start.y)}" x2="${w.end.x}" y2="${toSvgY(w.end.y)}" />\n`;
      svg += `    <circle cx="${w.start.x}" cy="${toSvgY(w.start.y)}" r="4" fill="#475569" />\n`;
      svg += `    <circle cx="${w.end.x}" cy="${toSvgY(w.end.y)}" r="4" fill="#475569" />\n`;
    });
    svg += `  </g>\n`;
  }

  // 3. Points de jonction
  svg += `  <g id="junction-markers">\n`;
  solution.junctions.forEach((j) => {
    svg += `    <circle cx="${j.point.x}" cy="${toSvgY(j.point.y)}" r="8" fill="none" stroke="#ef4444" stroke-width="3" />\n`;
    svg += `    <circle cx="${j.point.x}" cy="${toSvgY(j.point.y)}" r="2" fill="#ef4444" />\n`;
  });
  svg += `  </g>\n`;

  // 4. Étiquettes
  if (showLabels) {
    svg += `  <g id="labels" font-size="28" fill="#1e293b">\n`;
    solution.walls.forEach((w) => {
      const midX = (w.start.x + w.end.x) / 2;
      const midY = (w.start.y + w.end.y) / 2;
      svg += `    <text x="${midX}" y="${toSvgY(midY)}" text-anchor="middle" font-weight="bold">${w.id} (${(w.area / 1e6).toFixed(2)} m²)</text>\n`;
    });
    solution.junctions.forEach((j) => {
      svg += `    <text x="${j.point.x + 15}" y="${toSvgY(j.point.y) - 15}" fill="#ef4444" font-weight="bold">${j.type}</text>\n`;
    });
    svg += `  </g>\n`;
  }

  svg += `</svg>`;
  return svg;
}
