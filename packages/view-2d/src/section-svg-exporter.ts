import type { SectionScene } from '@mini-bim/core';

export interface SectionSvgOptions {
  /** Échelle architecturale normalisée : 50 (1:50), 100 (1:100) ou 200 (1:200). Défaut : 100 */
  readonly scale?: 50 | 100 | 200;
  /** Format de papier normalisé (orientation paysage). Défaut : 'A4' */
  readonly paperSize?: 'A4' | 'A3';
  readonly title?: string;
  readonly project?: string;
  readonly author?: string;
  readonly date?: string;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Génère un fichier vectoriel SVG autonome pour l'impression ou l'archivage d'une coupe / élévation (ADR-063).
 */
export function generateSectionSvg(scene: SectionScene, options: SectionSvgOptions = {}): string {
  const scaleRatio = options.scale ?? 100;
  const paper = options.paperSize ?? 'A4';
  const title = options.title ?? scene.cutName;
  const project = options.project ?? 'Projet Mini-BIM';
  const author = options.author ?? 'Mini-BIM CAD Engine';
  const date = options.date ?? new Date().toLocaleDateString('fr-FR');

  // Dimensions papier en mm (paysage)
  const [paperWidthMm, paperHeightMm] = paper === 'A3' ? [420, 297] : [297, 210];

  // Zone utile d'impression (marges de 10 mm)
  const marginMm = 10;
  const printWidthMm = paperWidthMm - 2 * marginMm;
  const printHeightMm = paperHeightMm - 2 * marginMm - 20; // 20 mm réservés pour le cartouche

  // Conversion 1 mm maquette = 1 / scaleRatio mm papier
  const sceneWidthOnPaper = scene.cutLength / scaleRatio;
  const zSpan = Math.max(1000, scene.bounds.zMax - scene.bounds.zMin);
  const sceneHeightOnPaper = zSpan / scaleRatio;

  // Facteur d'échelle automatique pour ajuster à la feuille si la maquette déborde
  let autoZoom = 1;
  if (sceneWidthOnPaper > printWidthMm || sceneHeightOnPaper > printHeightMm) {
    autoZoom = Math.min(printWidthMm / sceneWidthOnPaper, printHeightMm / sceneHeightOnPaper) * 0.95;
  }

  const mmPerStateMm = (1 / scaleRatio) * autoZoom;

  // Centrage de la scène dans la zone utile
  const originX = marginMm + (printWidthMm - scene.cutLength * mmPerStateMm) / 2;
  const originY =
    marginMm +
    printHeightMm -
    (printHeightMm - zSpan * mmPerStateMm) / 2 +
    scene.bounds.zMin * mmPerStateMm;

  const toSvgX = (s: number) => (originX + s * mmPerStateMm).toFixed(2);
  const toSvgY = (z: number) => (originY - z * mmPerStateMm).toFixed(2);

  const parts: string[] = [];

  // En-tête SVG
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${paperWidthMm} ${paperHeightMm}" width="${paperWidthMm}mm" height="${paperHeightMm}mm" style="background:#ffffff;font-family:sans-serif;">`,
  );

  // Définitions des motifs de hachures
  parts.push(`  <defs>
    <pattern id="hatch-masonry" width="3" height="3" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="3" stroke="#475569" stroke-width="0.3" />
    </pattern>
    <pattern id="hatch-concrete" width="4" height="4" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.25" fill="#475569" />
      <circle cx="3" cy="3" r="0.25" fill="#475569" />
    </pattern>
    <pattern id="hatch-insulation" width="3" height="3" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="3" stroke="#92400e" stroke-width="0.25" />
      <line x1="0" y1="0" x2="3" y2="0" stroke="#92400e" stroke-width="0.25" />
    </pattern>
  </defs>`);

  // Cadre de feuille et zone utile
  parts.push(`  <!-- Cadre et Cartouche -->`);
  parts.push(
    `  <rect x="${marginMm}" y="${marginMm}" width="${printWidthMm}" height="${paperHeightMm - 2 * marginMm}" fill="none" stroke="#0f172a" stroke-width="0.4" />`,
  );

  // Ligne de sol
  parts.push(`  <!-- Ligne de référence sol -->`);
  const solStartX = (originX - 10).toFixed(2);
  const solEndX = (originX + scene.cutLength * mmPerStateMm + 10).toFixed(2);
  const solY = toSvgY(0);
  parts.push(
    `  <line x1="${solStartX}" y1="${solY}" x2="${solEndX}" y2="${solY}" stroke="#0f172a" stroke-width="0.6" stroke-dasharray="6,2" />`,
  );

  // Éléments projetés en arrière-plan
  parts.push(`  <!-- Éléments projetés en arrière-plan -->`);
  parts.push(`  <g id="projected-items" stroke="#94a3b8" stroke-width="0.25" fill="#f8fafc">`);
  for (const item of scene.projectedItems) {
    if (item.polygon.length < 3) continue;
    const pts = item.polygon.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ');
    const fill = item.style?.fill ?? '#f1f5f9';
    const stroke = item.style?.stroke ?? '#94a3b8';
    parts.push(
      `    <polygon points="${pts}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" />`,
    );

    if (item.lines) {
      for (const [l1, l2] of item.lines) {
        parts.push(
          `    <line x1="${toSvgX(l1.x)}" y1="${toSvgY(l1.y)}" x2="${toSvgX(l2.x)}" y2="${toSvgY(l2.y)}" stroke="${escapeXml(stroke)}" stroke-width="0.25" />`,
        );
      }
    }
  }
  parts.push(`  </g>`);

  // Éléments coupés au premier plan
  parts.push(`  <!-- Éléments coupés (pochés) -->`);
  parts.push(`  <g id="cut-items" stroke="#0f172a" stroke-width="0.5">`);
  for (const item of scene.cutItems) {
    if (item.polygon.length < 3) continue;
    const pts = item.polygon.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ');

    let fillAttr = item.style?.fill ?? '#cbd5e1';
    if (item.style?.hatch === 'masonry') fillAttr = 'url(#hatch-masonry)';
    else if (item.style?.hatch === 'concrete') fillAttr = 'url(#hatch-concrete)';
    else if (item.style?.hatch === 'insulation') fillAttr = 'url(#hatch-insulation)';

    parts.push(`    <polygon points="${pts}" fill="${fillAttr}" />`);
  }
  parts.push(`  </g>`);

  // Lignes de niveaux et cotes altimétriques
  parts.push(`  <!-- Niveaux altimétriques -->`);
  parts.push(`  <g id="levels" font-size="2.6" fill="#1e293b">`);
  for (const lvl of scene.levels) {
    const yLvl = toSvgY(lvl.elevation);
    const xStart = (originX - 5).toFixed(2);
    const xEnd = (originX + scene.cutLength * mmPerStateMm + 15).toFixed(2);

    parts.push(
      `    <line x1="${xStart}" y1="${yLvl}" x2="${xEnd}" y2="${yLvl}" stroke="#94a3b8" stroke-width="0.2" stroke-dasharray="2,2" />`,
    );

    // Symbole cible altimétrique
    const targetX = originX - 3;
    parts.push(
      `    <polygon points="${(targetX - 1.5).toFixed(2)},${(Number(yLvl) - 1.5).toFixed(2)} ${(targetX + 1.5).toFixed(2)},${(Number(yLvl) - 1.5).toFixed(2)} ${targetX.toFixed(2)},${yLvl}" fill="#0f172a" />`,
    );

    const elevM = (lvl.elevation / 1000).toFixed(2);
    const label = `${escapeXml(lvl.name)} ${lvl.elevation >= 0 ? '+' : ''}${elevM} m`;
    parts.push(
      `    <text x="${(originX - 6).toFixed(2)}" y="${(Number(yLvl) + 0.9).toFixed(2)}" text-anchor="end">${label}</text>`,
    );
  }
  parts.push(`  </g>`);

  // Cartouche réglementaire en bas à droite
  const cartoucheW = 90;
  const cartoucheH = 18;
  const cartoucheX = paperWidthMm - marginMm - cartoucheW;
  const cartoucheY = paperHeightMm - marginMm - cartoucheH;

  parts.push(`  <!-- Cartouche normalisé -->`);
  parts.push(`  <g id="cartouche" transform="translate(${cartoucheX}, ${cartoucheY})">
    <rect width="${cartoucheW}" height="${cartoucheH}" fill="#f8fafc" stroke="#0f172a" stroke-width="0.3" />
    <text x="3" y="4.5" font-size="3" font-weight="bold" fill="#0f172a">${escapeXml(project)}</text>
    <text x="3" y="9" font-size="2.8" font-weight="bold" fill="#2563eb">COUPE ${escapeXml(scene.cutLabel)}-${escapeXml(scene.cutLabel)}' : ${escapeXml(title)}</text>
    <text x="3" y="13.5" font-size="2.2" fill="#64748b">Échelle 1:${scaleRatio} | Format ${paper} | Date : ${escapeXml(date)}</text>
    <text x="3" y="16.5" font-size="2" fill="#94a3b8">Auteur : ${escapeXml(author)}</text>
  </g>`);

  parts.push(`</svg>`);

  return parts.join('\n');
}
