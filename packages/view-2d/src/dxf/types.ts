import type { DetectedRoomFor2D, DimensionFor2D } from '../types.js';

export interface PlanDxfOptions {
  /** Filtre de niveau architectural (levelId). Si non renseigné ou null, premier niveau actif. */
  readonly levelId?: string | null | undefined;
  /** Pièces détectées avec polygones et métadonnées. */
  readonly rooms?: readonly DetectedRoomFor2D[] | undefined;
  /** Cotations 2D explicites (si non renseigné, utilise doc.getState().dimensions). */
  readonly dimensions?: readonly DimensionFor2D[] | undefined;
  /** Inclure les hachures linéaires dans les murs coupés (défaut : true). */
  readonly includeHatches?: boolean | undefined;
  /** Espacement des hachures de murs en mm (défaut : 250 mm). */
  readonly hatchSpacing?: number | undefined;
  /** Inclure les réseaux MEP du niveau (défaut : true). */
  readonly includeMep?: boolean | undefined;
}

export interface SectionDxfOptions {
  /** Inclure les hachures linéaires des éléments coupés (défaut : true). */
  readonly includeHatches?: boolean | undefined;
  /** Espacement des hachures en mm (défaut : 200 mm). */
  readonly hatchSpacing?: number | undefined;
  /** Titre ou libellé du projet. */
  readonly projectTitle?: string | undefined;
}
