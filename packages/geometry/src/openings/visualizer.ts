import { add, mul, normalize, sub } from '../vec2.js';
import { type SlicingWallInput, type SlicedWallResult } from './slice.js';
import { type OpeningInput } from './types.js';
import { MIN_OPENING_CLEARANCE } from './validate.js';

export interface SvgOpeningExportOptions {
  readonly padding?: number;
  readonly showClearanceZones?: boolean;
  readonly showSwings?: boolean;
  readonly showLabels?: boolean;
  readonly title?: string;
  readonly rejectionMessage?: string;
}

const PIECE_COLORS: Record<string, { fill: string; stroke: string; dash?: string }> = {
  full: { fill: 'rgba(59, 130, 246, 0.45)', stroke: '#1d4ed8' }, // Bleu solide
  sill: { fill: 'rgba(245, 158, 11, 0.35)', stroke: '#b45309', dash: '4,4' }, // Ambre allège
  lintel: { fill: 'rgba(139, 92, 246, 0.25)', stroke: '#6d28d9', dash: '6,4' }, // Violet linteau
  void: { fill: 'rgba(254, 242, 242, 0.7)', stroke: '#ef4444', dash: '8,4' }, // Rouge vide
};

/**
 * Génère un document SVG technique visualisant avec précision les ouvertures dans un mur
 * avec leurs pièces découpées, symboles de baies, arcs de débattement et gardes de sécurité.
 */
export function exportOpeningsSvg(
  wall: SlicingWallInput,
  openings: readonly OpeningInput[],
  slicedResult?: SlicedWallResult,
  options: SvgOpeningExportOptions = {},
): string {
  const padding = options.padding ?? 400;
  const showClearance = options.showClearanceZones ?? true;
  const showSwings = options.showSwings ?? true;
  const showLabels = options.showLabels ?? true;

  // Calcul de la Bounding Box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const v of wall.polygon) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  // Agrandir la bounding box pour les battements de portes
  const maxSwingRadius = Math.max(...openings.map((o) => o.width), 0);
  minX -= padding + maxSwingRadius;
  minY -= padding + maxSwingRadius;
  maxX += padding + maxSwingRadius;
  maxY += padding + maxSwingRadius;

  const width = maxX - minX;
  const height = maxY - minY;

  const toSvgY = (y: number) => maxY - y + minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" style="background-color: #f8fafc; font-family: monospace;">\n`;

  // Définition de motifs (hachures)
  svg += `  <defs>\n`;
  svg += `    <pattern id="clearance-hatch" width="20" height="20" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">\n`;
  svg += `      <line x1="0" y1="0" x2="0" y2="20" stroke="#f43f5e" stroke-width="3" opacity="0.4" />\n`;
  svg += `    </pattern>\n`;
  svg += `  </defs>\n`;

  // Titre
  if (options.title) {
    svg += `  <text x="${minX + 30}" y="${minY + 50}" font-size="28" font-weight="bold" fill="#0f172a">${options.title}</text>\n`;
  }

  const wallVec = sub(wall.end, wall.start);
  const wallLen = Math.hypot(wallVec.x, wallVec.y);
  const wallDir = normalize(wallVec);
  const wallNorm = { x: -wallDir.y, y: wallDir.x };

  // 1. Tranches de mur découpées (si fournies)
  if (slicedResult && slicedResult.pieces.length > 0) {
    svg += `  <g id="wall-pieces">\n`;
    for (const p of slicedResult.pieces) {
      if (p.role === 'lintel') continue; // En vue en plan de dessus, le linteau est masqué par le vide ou l'allège
      const col = PIECE_COLORS[p.role] ?? { fill: '#cbd5e1', stroke: '#475569' };
      const pts = p.poly2D.map((pt) => `${pt.x},${toSvgY(pt.y)}`).join(' ');
      const dashAttr = col.dash ? `stroke-dasharray="${col.dash}"` : '';
      svg += `    <!-- Piece ${p.id} (${p.role}) -->\n`;
      svg += `    <polygon points="${pts}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="3" ${dashAttr} />\n`;
    }
    svg += `  </g>\n`;
  } else {
    // Mur plein brut
    const pts = wall.polygon.map((pt) => `${pt.x},${toSvgY(pt.y)}`).join(' ');
    svg += `  <polygon points="${pts}" fill="rgba(59, 130, 246, 0.45)" stroke="#1d4ed8" stroke-width="4" />\n`;
  }

  // 2. Zones de garde de sécurité (Clearance) à chaque extrémité
  if (showClearance) {
    svg += `  <g id="clearance-zones">\n`;
    const drawClearance = (u0: number, u1: number) => {
      const p0 = add(wall.start, mul(wallDir, u0));
      const p1 = add(wall.start, mul(wallDir, u1));
      const halfT = wall.thickness / 2 + 10;
      const c1 = add(p0, mul(wallNorm, halfT));
      const c2 = add(p1, mul(wallNorm, halfT));
      const c3 = add(p1, mul(wallNorm, -halfT));
      const c4 = add(p0, mul(wallNorm, -halfT));
      const pts = [c1, c2, c3, c4].map((pt) => `${pt.x},${toSvgY(pt.y)}`).join(' ');
      svg += `    <polygon points="${pts}" fill="url(#clearance-hatch)" stroke="#f43f5e" stroke-width="2" stroke-dasharray="4,4" />\n`;
    };

    drawClearance(0, MIN_OPENING_CLEARANCE);
    drawClearance(wallLen - MIN_OPENING_CLEARANCE, wallLen);
    svg += `  </g>\n`;
  }

  // 3. Axe du mur
  svg += `  <line x1="${wall.start.x}" y1="${toSvgY(wall.start.y)}" x2="${wall.end.x}" y2="${toSvgY(wall.end.y)}" stroke="#64748b" stroke-width="2" stroke-dasharray="8,6" />\n`;

  // 4. Symboles architecturaux des ouvertures (Portes et Fenêtres)
  svg += `  <g id="openings-symbols">\n`;
  for (const op of openings) {
    const uStart = op.u - op.width / 2;
    const uEnd = op.u + op.width / 2;
    const pStartCenter = add(wall.start, mul(wallDir, uStart));
    const pEndCenter = add(wall.start, mul(wallDir, uEnd));

    if (op.kind === 'window') {
      // Vitrage architectural : double ligne centrale
      const halfGlassGap = 20;
      const g1Start = add(pStartCenter, mul(wallNorm, halfGlassGap));
      const g1End = add(pEndCenter, mul(wallNorm, halfGlassGap));
      const g2Start = add(pStartCenter, mul(wallNorm, -halfGlassGap));
      const g2End = add(pEndCenter, mul(wallNorm, -halfGlassGap));

      svg += `    <!-- Fenêtre ${op.id} -->\n`;
      svg += `    <line x1="${g1Start.x}" y1="${toSvgY(g1Start.y)}" x2="${g1End.x}" y2="${toSvgY(g1End.y)}" stroke="#0284c7" stroke-width="4" />\n`;
      svg += `    <line x1="${g2Start.x}" y1="${toSvgY(g2Start.y)}" x2="${g2End.x}" y2="${toSvgY(g2End.y)}" stroke="#0284c7" stroke-width="4" />\n`;

      if (showLabels) {
        const mid = add(wall.start, mul(wallDir, op.u));
        svg += `    <text x="${mid.x}" y="${toSvgY(mid.y) - 40}" text-anchor="middle" font-size="22" font-weight="bold" fill="#0369a1">${op.id} (${op.width}×${op.height})</text>\n`;
      }
    } else if (op.kind === 'door') {
      // Porte architecturale : battement à 90° et arc
      svg += `    <!-- Porte ${op.id} -->\n`;
      const hinge = pStartCenter; // Charnière
      const swingLen = op.width;
      const leafEnd = add(hinge, mul(wallNorm, swingLen));

      // Vantail ouvert à 90°
      svg += `    <line x1="${hinge.x}" y1="${toSvgY(hinge.y)}" x2="${leafEnd.x}" y2="${toSvgY(leafEnd.y)}" stroke="#0f172a" stroke-width="5" />\n`;

      // Arc de débattement 90°
      if (showSwings) {
        svg += `    <path d="M ${pEndCenter.x} ${toSvgY(pEndCenter.y)} A ${swingLen} ${swingLen} 0 0 1 ${leafEnd.x} ${toSvgY(leafEnd.y)}" fill="none" stroke="#64748b" stroke-width="3" stroke-dasharray="6,4" />\n`;
      }

      if (showLabels) {
        const mid = add(wall.start, mul(wallDir, op.u));
        svg += `    <text x="${mid.x}" y="${toSvgY(mid.y) + 40}" text-anchor="middle" font-size="22" font-weight="bold" fill="#0f172a">${op.id} (P. ${op.width}×${op.height})</text>\n`;
      }
    }
  }
  svg += `  </g>\n`;

  // 5. Message de rejet ou d'erreur éventuel
  if (options.rejectionMessage) {
    svg += `  <g id="rejection-banner">\n`;
    svg += `    <rect x="${minX + 20}" y="${maxY - 80}" width="${width - 40}" height="60" rx="8" fill="#fee2e2" stroke="#dc2626" stroke-width="2" />\n`;
    svg += `    <text x="${minX + 40}" y="${maxY - 42}" font-size="22" font-weight="bold" fill="#b91c1c">REJET : ${options.rejectionMessage}</text>\n`;
    svg += `  </g>\n`;
  }

  svg += `</svg>`;
  return svg;
}
