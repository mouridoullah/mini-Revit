import { vec2 } from '@mini-bim/geometry';
import type { SectionScene } from '@mini-bim/core';
import { DxfWriter } from './DxfWriter.js';
import { generateHatchLines } from './hatch.js';
import type { SectionDxfOptions } from './types.js';

/**
 * Génère un fichier DXF R12 (AC1009) complet pour une vue en coupe ou en élévation 2D.
 *
 * Principes stricts de conformité CAO :
 * - Repère mondial 1:1 en millimètres (Y-up natif) : X = s (abscisse le long de la coupe), Y = z (altimétrie Z)
 * - Aucune inversion d'axe Y ni échelle papier en ModelSpace
 * - Calques normalisés : SECTION-CUT, SECTION-HATCH, SECTION-PROJ, SECTION-LEVELS, SECTION-MEP-*, SECTION-ANNOTATIONS
 * - Exactitude géométrique stricte et hachures linéaires LINE pour compatibilité R12 universelle
 */
export function generateSectionDxf(
  scene: SectionScene,
  options: SectionDxfOptions = {},
): string {
  const writer = new DxfWriter();

  // -------------------------------------------------------------------------
  // 1. Déclaration exhaustive des calques et styles
  // -------------------------------------------------------------------------
  writer.addLayer({ name: 'SECTION-CUT', color: 7, lineType: 'CONTINUOUS' }); // Éléments coupés (Blanc/Noir, fort)
  writer.addLayer({ name: 'SECTION-HATCH', color: 8, lineType: 'CONTINUOUS' }); // Hachures des éléments coupés (Gris)
  writer.addLayer({ name: 'SECTION-PROJ', color: 9, lineType: 'CONTINUOUS' }); // Arêtes projetées arrière-plan (Gris clair)
  writer.addLayer({ name: 'SECTION-LEVELS', color: 6, lineType: 'DASHDOT' }); // Lignes d'étages et niveaux (Magenta)
  writer.addLayer({ name: 'SECTION-GROUND', color: 8, lineType: 'DASHED' }); // Ligne de référence sol Z=0 (Gris tireté)
  writer.addLayer({ name: 'SECTION-MEP-CUT', color: 4, lineType: 'CONTINUOUS' }); // Réseaux MEP coupés (Cyan)
  writer.addLayer({ name: 'SECTION-MEP-PROJ', color: 5, lineType: 'CONTINUOUS' }); // Réseaux MEP projetés (Bleu)
  writer.addLayer({ name: 'SECTION-ANNOTATIONS', color: 7, lineType: 'CONTINUOUS' }); // Titres et étiquettes (Blanc/Noir)

  // -------------------------------------------------------------------------
  // 2. Ligne de référence du sol (Z = 0)
  // -------------------------------------------------------------------------
  const sStartGround = -1500;
  const sEndGround = scene.cutLength + 1500;
  writer.addLine(
    'SECTION-GROUND',
    vec2(sStartGround, 0),
    vec2(sEndGround, 0),
  );

  // -------------------------------------------------------------------------
  // 3. Niveaux et repères altimétriques
  // -------------------------------------------------------------------------
  for (const lvl of scene.levels) {
    const sLineStart = -1500;
    const sLineEnd = scene.cutLength + 1000;

    // Ligne de niveau mixte tiret-point
    writer.addLine(
      'SECTION-LEVELS',
      vec2(sLineStart, lvl.elevation),
      vec2(sLineEnd, lvl.elevation),
      { lineType: 'DASHDOT' },
    );

    // Symbole altimétrique : triangle pointe en bas à l'altitude exacte
    const triTip = vec2(sLineStart, lvl.elevation);
    const triLeft = vec2(sLineStart - 180, lvl.elevation + 140);
    const triRight = vec2(sLineStart + 180, lvl.elevation + 140);
    writer.addPolyline('SECTION-LEVELS', [triTip, triLeft, triRight], true);

    // Texte du niveau : "N0_RDC (+0.00 m)"
    const sign = lvl.elevation >= 0 ? '+' : '';
    const elevationM = `${sign}${(lvl.elevation / 1000).toFixed(2)} m`;
    const labelText = `${lvl.name} (${elevationM})`;

    writer.addText(
      'SECTION-LEVELS',
      vec2(sLineStart - 250, lvl.elevation + 40),
      180,
      labelText,
      {
        halign: 'right',
        valign: 'baseline',
      },
    );
  }

  // -------------------------------------------------------------------------
  // 4. Éléments projetés en arrière-plan (traits fins)
  // -------------------------------------------------------------------------
  for (const item of scene.projectedItems) {
    const isMep =
      item.category === 'pipe' ||
      item.category === 'duct' ||
      item.category === 'cableTray';
    const layer = isMep ? 'SECTION-MEP-PROJ' : 'SECTION-PROJ';

    // Contours de faces projetées
    if (item.polygon && item.polygon.length >= 2) {
      writer.addPolyline(layer, item.polygon, true);
    }

    // Lignes de détail internes (ex: battants, subdivisions de fenêtres, marches)
    if (item.lines) {
      for (const [p1, p2] of item.lines) {
        writer.addLine(layer, p1, p2);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Éléments coupés au premier plan (traits forts + hachures)
  // -------------------------------------------------------------------------
  for (const item of scene.cutItems) {
    const isMep =
      item.category === 'pipe' ||
      item.category === 'duct' ||
      item.category === 'cableTray';
    const layer = isMep ? 'SECTION-MEP-CUT' : 'SECTION-CUT';

    // Contour de la tranche coupée
    if (item.polygon && item.polygon.length >= 2) {
      writer.addPolyline(layer, item.polygon, true);

      // Hachures linéaires de coupe à 45°
      if (options.includeHatches !== false && item.polygon.length >= 3) {
        const spacing = options.hatchSpacing ?? 200;
        const hatches = generateHatchLines(item.polygon, {
          angleDeg: 45,
          spacing,
        });
        for (const [p1, p2] of hatches) {
          writer.addLine('SECTION-HATCH', p1, p2);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Titre et annotations cartouche
  // -------------------------------------------------------------------------
  const titleZ = (scene.bounds.zMin ?? 0) - 500;
  const kindLabel = scene.kind === 'elevation' ? 'ELEVATION' : 'COUPE';
  const fullTitle = `${scene.cutName} - ${kindLabel} (${scene.cutLabel})`;

  writer.addText(
    'SECTION-ANNOTATIONS',
    vec2(0, titleZ),
    280,
    fullTitle,
    { halign: 'left', valign: 'top' },
  );

  const subTitle = options.projectTitle
    ? `${options.projectTitle} - Echelle 1:1 (ModelSpace mm)`
    : 'Echelle 1:1 (ModelSpace mm)';

  writer.addText(
    'SECTION-ANNOTATIONS',
    vec2(0, titleZ - 380),
    180,
    subTitle,
    { halign: 'left', valign: 'top' },
  );

  return writer.toDxfString();
}
