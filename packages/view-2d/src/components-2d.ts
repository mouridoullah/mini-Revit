import { vec2 } from '@tabax/geometry';
import type { Transform2D } from './transform.js';
import type { ComponentFor2D, ComponentTypeFor2D } from './types.js';

/**
 * Configuration de rendu 2D pour les composants d'aménagement et le mobilier (Phase 8).
 */
export interface ComponentRenderConfig {
  readonly strokeWidth: number;
  readonly defaultStrokeColor: string;
  readonly selectedStrokeColor: string;
  readonly selectedFillColor: string;
  readonly selectedGlowColor: string;
  readonly selectedGlowBlur: number;
  // Styles par famille
  readonly sanitaryFill: string;
  readonly sanitaryStroke: string;
  readonly kitchenFill: string;
  readonly kitchenStroke: string;
  readonly furnitureFill: string;
  readonly furnitureStroke: string;
  readonly glazingFill: string;
  readonly glazingStroke: string;
}

export const DEFAULT_COMPONENT_RENDER_CONFIG: ComponentRenderConfig = Object.freeze({
  strokeWidth: 1.5,
  defaultStrokeColor: '#1e293b',
  selectedStrokeColor: '#2563eb',
  selectedFillColor: 'rgba(37, 99, 235, 0.15)',
  selectedGlowColor: 'rgba(37, 99, 235, 0.4)',
  selectedGlowBlur: 6,
  sanitaryFill: '#f8fafc',
  sanitaryStroke: '#0f172a',
  kitchenFill: '#f1f5f9',
  kitchenStroke: '#334155',
  furnitureFill: '#fefce8',
  furnitureStroke: '#713f12',
  glazingFill: '#e0f2fe',
  glazingStroke: '#0369a1',
});

/**
 * Dessine la symbologie architecturale normalisée d'un composant dans son repère local centré en (0, 0).
 * Les coordonnées locales sont en millimètres : X dans [-width/2, width/2], Y dans [-depth/2, depth/2].
 */
export function drawComponentSymbol(
  ctx: CanvasRenderingContext2D,
  subType: string,
  width: number,
  depth: number,
  fillColor: string,
  strokeColor: string,
): void {
  const halfW = width / 2;
  const halfD = depth / 2;

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;

  switch (subType) {
    // -------------------------------------------------------------------------
    // 1. SANITAIRES
    // -------------------------------------------------------------------------
    case 'toilet': {
      // Réservoir arrière rectangulaire
      const tankDepth = Math.min(180, depth * 0.35);
      ctx.beginPath();
      ctx.rect(-halfW, halfD - tankDepth, width, tankDepth);
      ctx.fill();
      ctx.stroke();

      // Bouton de chasse au centre du réservoir
      ctx.beginPath();
      ctx.arc(0, halfD - tankDepth / 2, Math.min(20, halfW * 0.15), 0, Math.PI * 2);
      ctx.stroke();

      // Cuvette ovale arrondie à l'avant
      const bowlRadiusX = halfW * 0.85;
      const bowlDepth = depth - tankDepth;
      ctx.beginPath();
      ctx.ellipse(0, -halfD + bowlDepth / 2, bowlRadiusX, bowlDepth / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Lunette intérieure
      ctx.beginPath();
      ctx.ellipse(0, -halfD + bowlDepth / 2, bowlRadiusX * 0.7, (bowlDepth / 2) * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'sink': {
      // Meuble vasque rectangulaire
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Vasque encastrée ovale
      const basinW = halfW * 0.75;
      const basinD = halfD * 0.65;
      ctx.beginPath();
      ctx.ellipse(0, 0, basinW, basinD, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Bonde centrale
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Mitigeur arrière
      ctx.beginPath();
      ctx.arc(0, halfD * 0.7, 12, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'shower': {
      // Receveur carré/rectangulaire
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Diagonales du receveur
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfD);
      ctx.lineTo(halfW, halfD);
      ctx.moveTo(halfW, -halfD);
      ctx.lineTo(-halfW, halfD);
      ctx.stroke();

      // Bonde centrale
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(45, width * 0.06), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'bath': {
      // Tablier extérieur
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Cuve intérieure avec rebord invariant de 80 mm (Phase 8.5)
      const margin = 80;
      const innerW = width - 2 * margin;
      const innerD = depth - 2 * margin;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(10, innerW / 2), Math.max(10, innerD / 2), 0, 0, Math.PI * 2);
      ctx.stroke();

      // Bonde vers l'un des côtés
      ctx.beginPath();
      ctx.arc(-halfW + margin * 1.5, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    // -------------------------------------------------------------------------
    // 2. CUISINE
    // -------------------------------------------------------------------------
    case 'kitchen_base': {
      // Caisson meuble bas
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Ligne de façade avant et poignée
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfD + 40);
      ctx.lineTo(halfW, -halfD + 40);
      ctx.stroke();

      // Poignée
      ctx.beginPath();
      ctx.rect(-halfW * 0.3, -halfD + 10, width * 0.3, 15);
      ctx.stroke();
      break;
    }

    case 'kitchen_wall': {
      // Meuble haut : tracé en pointillés normalisé
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'sink_unit': {
      // Plan de travail
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Cuve(s)
      const bowlW = halfW * 0.8;
      const bowlD = halfD * 0.7;
      ctx.beginPath();
      ctx.rect(-halfW + 40, -bowlD / 2, bowlW, bowlD);
      ctx.stroke();

      // Égouttoir avec stries sur la moitié droite
      const drainX = 20;
      const drainW = halfW - 40;
      ctx.beginPath();
      ctx.rect(drainX, -bowlD / 2, drainW, bowlD);
      ctx.stroke();

      // Stries
      const numStripes = 5;
      const stripeStep = drainW / (numStripes + 1);
      ctx.beginPath();
      for (let i = 1; i <= numStripes; i++) {
        ctx.moveTo(drainX + i * stripeStep, -bowlD / 2 + 30);
        ctx.lineTo(drainX + i * stripeStep, bowlD / 2 - 30);
      }
      ctx.stroke();

      // Robinetterie
      ctx.beginPath();
      ctx.arc(-halfW + 40 + bowlW, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'appliance': {
      // Réfrigérateur ou électroménager
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Croix technique
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfD);
      ctx.lineTo(halfW, halfD);
      ctx.moveTo(halfW, -halfD);
      ctx.lineTo(-halfW, halfD);
      ctx.stroke();
      break;
    }

    // -------------------------------------------------------------------------
    // 3. MOBILIER
    // -------------------------------------------------------------------------
    case 'bed': {
      // Cadre de lit
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Tête de lit à l'arrière (Y positif)
      const headboardD = Math.min(80, depth * 0.05);
      ctx.beginPath();
      ctx.rect(-halfW, halfD - headboardD, width, headboardD);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fillColor;

      // Oreillers
      const pillowW = width > 1200 ? (width - 150) / 2 : width * 0.6;
      const pillowD = Math.min(400, depth * 0.22);
      const pillowY = halfD - headboardD - 40 - pillowD;

      if (width > 1200) {
        // Deux oreillers
        ctx.beginPath();
        ctx.rect(-halfW + 50, pillowY, pillowW, pillowD);
        ctx.rect(halfW - 50 - pillowW, pillowY, pillowW, pillowD);
        ctx.stroke();
      } else {
        // Un oreiller
        ctx.beginPath();
        ctx.rect(-pillowW / 2, pillowY, pillowW, pillowD);
        ctx.stroke();
      }

      // Rabat de couette
      const foldY = -halfD + depth * 0.45;
      ctx.beginPath();
      ctx.moveTo(-halfW, foldY);
      ctx.lineTo(halfW, foldY);
      ctx.stroke();
      break;
    }

    case 'table': {
      // Plateau de table
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // 4 pieds invariants aux dimensions fixes de 50 x 50 mm (Phase 8.5)
      const legSize = 50;
      ctx.beginPath();
      ctx.rect(-halfW + 20, -halfD + 20, legSize, legSize);
      ctx.rect(halfW - 20 - legSize, -halfD + 20, legSize, legSize);
      ctx.rect(-halfW + 20, halfD - 20 - legSize, legSize, legSize);
      ctx.rect(halfW - 20 - legSize, halfD - 20 - legSize, legSize, legSize);
      ctx.stroke();
      break;
    }

    case 'chair': {
      // Assise
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Dossier arrière
      const backrestD = Math.min(60, depth * 0.2);
      ctx.beginPath();
      ctx.rect(-halfW, halfD - backrestD, width, backrestD);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'sofa': {
      // Contour global
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Dossier arrière
      const backD = Math.min(180, depth * 0.25);
      ctx.beginPath();
      ctx.rect(-halfW, halfD - backD, width, backD);
      ctx.stroke();

      // Accoudoirs gauche et droite
      const armW = Math.min(180, width * 0.12);
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, armW, depth);
      ctx.rect(halfW - armW, -halfD, armW, depth);
      ctx.stroke();

      // Coussins d'assise (séparation en 2 ou 3)
      const seatW = width - 2 * armW;
      const numCushions = width > 1800 ? 3 : 2;
      const cushionW = seatW / numCushions;
      ctx.beginPath();
      for (let i = 1; i < numCushions; i++) {
        ctx.moveTo(-halfW + armW + i * cushionW, -halfD);
        ctx.lineTo(-halfW + armW + i * cushionW, halfD - backD);
      }
      ctx.stroke();
      break;
    }

    case 'cabinet': {
      // Armoire / Dressing
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Diagonale architecturale normalisée des dressings
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfD);
      ctx.lineTo(halfW, halfD);
      ctx.stroke();
      break;
    }

    // -------------------------------------------------------------------------
    // 4. MENUISERIES ENRICHIES
    // -------------------------------------------------------------------------
    case 'sliding_door': {
      // Baie coulissante : cadre et 2 vantaux décalés avec flèche
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Vantail 1 (gauche, décalé vers l'avant)
      const sashW = halfW + 40;
      const sashD = depth * 0.4;
      ctx.beginPath();
      ctx.rect(-halfW + 10, -halfD + 10, sashW, sashD);
      ctx.stroke();

      // Vantail 2 (droite, décalé vers l'arrière)
      ctx.beginPath();
      ctx.rect(-10, halfD - sashD - 10, sashW, sashD);
      ctx.stroke();

      // Flèche de coulissement
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.3, 0);
      ctx.lineTo(halfW * 0.3, 0);
      ctx.lineTo(halfW * 0.2, -15);
      ctx.moveTo(halfW * 0.3, 0);
      ctx.lineTo(halfW * 0.2, 15);
      ctx.stroke();
      break;
    }

    case 'french_window': {
      // Porte-fenêtre : cadre et deux battants ouverts
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();

      // Vantaux ouverts à 90 degrés
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfD);
      ctx.lineTo(-halfW, -halfD - halfW);
      ctx.moveTo(halfW, -halfD);
      ctx.lineTo(halfW, -halfD - halfW);
      ctx.stroke();

      // Arcs de débattement
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(-halfW, -halfD, halfW, 0, -Math.PI / 2, true);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(halfW, -halfD, halfW, Math.PI, -Math.PI / 2, false);
      ctx.stroke();
      ctx.restore();
      break;
    }

    default: {
      // Rectangle générique
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, width, depth);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
}

/**
 * Dessine l'ensemble des composants d'aménagement du niveau dans le canvas 2D.
 */
export function drawComponents(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  components: Record<string, ComponentFor2D>,
  componentTypes: Record<string, ComponentTypeFor2D>,
  selectedIds: ReadonlySet<string>,
  config: ComponentRenderConfig = DEFAULT_COMPONENT_RENDER_CONFIG,
  levelFilter?: string | null,
  visibleComponentIds?: ReadonlySet<string> | null,
): void {
  for (const comp of Object.values(components)) {
    if (visibleComponentIds && !visibleComponentIds.has(comp.id)) {
      continue;
    }
    if (levelFilter && comp.levelId !== levelFilter) {
      continue;
    }

    const type = componentTypes[comp.typeId];
    if (!type) continue;

    const isSelected = selectedIds.has(comp.id);

    // Détermination des couleurs selon la famille et la sélection
    let fillColor: string;
    let strokeColor: string;

    if (isSelected) {
      fillColor = config.selectedFillColor;
      strokeColor = config.selectedStrokeColor;
    } else {
      switch (type.family) {
        case 'sanitary':
          fillColor = config.sanitaryFill;
          strokeColor = config.sanitaryStroke;
          break;
        case 'kitchen':
          fillColor = config.kitchenFill;
          strokeColor = config.kitchenStroke;
          break;
        case 'furniture':
          fillColor = config.furnitureFill;
          strokeColor = config.furnitureStroke;
          break;
        case 'glazing':
          fillColor = config.glazingFill;
          strokeColor = config.glazingStroke;
          break;
        default:
          fillColor = '#f8fafc';
          strokeColor = config.defaultStrokeColor;
      }
    }

    // Coordonnées monde vers écran
    const screenCenter = transform.worldToScreen(vec2(comp.placement.x, comp.placement.y));
    const rotation = comp.placement.rotation ?? 0;
    const flipped = comp.placement.flipped ?? false;

    ctx.save();

    // Halo lumineux en cas de sélection
    if (isSelected) {
      ctx.shadowColor = config.selectedGlowColor;
      ctx.shadowBlur = config.selectedGlowBlur;
    }

    // Transformation géométrique 2D : translation, échelle, rotation, miroir
    ctx.translate(screenCenter.x, screenCenter.y);
    ctx.scale(transform.scale, -transform.scale); // Inversion Y pour repère cartésien architectural
    ctx.rotate(rotation);
    if (flipped) {
      ctx.scale(-1, 1);
    }

    const effWidth = comp.widthOverride ?? type.width;
    const effDepth = comp.depthOverride ?? type.depth;

    // Zone de dégagement ergonomique normalisée (Phase 8.4)
    const showClearance = comp.showClearanceZone || (isSelected && (type.clearanceDepth ?? 0) > 0);
    const clearance = type.clearanceDepth ?? 0;
    if (showClearance && clearance > 0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-effWidth / 2, -effDepth / 2 - clearance, effWidth, clearance);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Dessin de la symbologie normalisée
    drawComponentSymbol(ctx, type.subType, effWidth, effDepth, fillColor, strokeColor);

    ctx.restore();
  }
}
