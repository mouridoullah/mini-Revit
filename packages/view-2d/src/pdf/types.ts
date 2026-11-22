export const MM_TO_PT = 72 / 25.4; // ~2.83464567 pt par mm

export type PaperSize = 'A4' | 'A3';
export type ScaleOption = 50 | 100 | 200 | 'auto';

export interface PageFormatDef {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

export const PAPER_FORMATS: Record<PaperSize, PageFormatDef> = {
  A4: {
    widthMm: 297,
    heightMm: 210,
    widthPt: 297 * MM_TO_PT,
    heightPt: 210 * MM_TO_PT,
  },
  A3: {
    widthMm: 420,
    heightMm: 297,
    widthPt: 420 * MM_TO_PT,
    heightPt: 297 * MM_TO_PT,
  },
};

export interface PdfBookOptions {
  /** Format de planche : 'A4' (297x210 mm) ou 'A3' (420x297 mm) en mode Paysage. Défaut : 'A4' */
  readonly paperSize?: PaperSize | undefined;
  /** Échelle architecturale normalisée ou 'auto'. Défaut : 'auto' */
  readonly scale?: ScaleOption | undefined;
  /** Titre général du projet ou de l'opération */
  readonly projectTitle?: string | undefined;
  /** Intitulé du maître d'ouvrage ou client */
  readonly client?: string | undefined;
  /** Nom de l'auteur / bureau d'études */
  readonly author?: string | undefined;
  /** Date d'émission (défaut : date du jour) */
  readonly date?: string | undefined;
  /** Numéro d'indice / révision (défaut : 'INDICE 0') */
  readonly revision?: string | undefined;
  /** Inclure la page de garde et le sommaire des planches (défaut : true) */
  readonly includeCover?: boolean | undefined;
  /** Inclure les planches de plans d'étages (défaut : true) */
  readonly includePlans?: boolean | undefined;
  /** Inclure les planches de coupes et élévations (défaut : true) */
  readonly includeSections?: boolean | undefined;
  /** Inclure la planche de synthèse des métrés et surfaces (défaut : true) */
  readonly includeMetrics?: boolean | undefined;
  /** Filtrer les niveaux à inclure (défaut : tous les niveaux) */
  readonly levelIds?: readonly string[] | undefined;
  /** Espacement des hachures de coupe en mm (défaut : 250 mm) */
  readonly hatchSpacing?: number | undefined;
}

export interface DrawingViewportBox {
  readonly xMinPt: number;
  readonly yMinPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly xMinMm: number;
  readonly yMinMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}
