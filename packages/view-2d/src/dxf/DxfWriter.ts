import type { Vec2 } from '@mini-bim/geometry';

/**
 * Définition d'un calque DXF R12.
 */
export interface DxfLayerDef {
  readonly name: string;
  readonly color: number; // ACI 1-255 (7 = Blanc/Noir, 8 = Gris, 1 = Rouge, 3 = Vert, etc.)
  readonly lineType?: string | undefined; // Défaut: 'CONTINUOUS'
  readonly flags?: number | undefined; // Défaut: 0
}

/**
 * Définition d'un type de ligne DXF R12.
 */
export interface DxfLineTypeDef {
  readonly name: string;
  readonly description: string;
  readonly elements: readonly number[]; // e.g. [350, -150]
}

export interface DxfTextOptions {
  readonly rotationDeg?: number | undefined;
  readonly halign?: 'left' | 'center' | 'right' | undefined;
  readonly valign?: 'baseline' | 'bottom' | 'middle' | 'top' | undefined;
  readonly style?: string | undefined;
}

export interface DxfEntityOptions {
  readonly lineType?: string | undefined;
  readonly color?: number | undefined;
}

/**
 * Types de lignes CAO normalisés intégrés par défaut.
 */
export const STANDARD_LINE_TYPES: readonly DxfLineTypeDef[] = [
  {
    name: 'CONTINUOUS',
    description: 'Solid line',
    elements: [],
  },
  {
    name: 'DASHED',
    description: 'Dashed __ __ __ __',
    elements: [350, -150],
  },
  {
    name: 'DASHDOT',
    description: 'Dash dot __ . __ .',
    elements: [400, -100, 0, -100],
  },
  {
    name: 'DIVIDE',
    description: 'Divide __ . . __ . .',
    elements: [400, -100, 0, -100, 0, -100],
  },
  {
    name: 'HIDDEN',
    description: 'Hidden _ _ _ _',
    elements: [200, -100],
  },
];

/**
 * Nettoie et normalise les chaînes de texte pour compatibilité DXF R12 universelle.
 * Remplace les symboles techniques par les séquences d'échappement AutoCAD :
 * - Ø -> %%c
 * - ° -> %%d
 * - ± -> %%p
 * - m² -> m2
 */
export function cleanDxfText(raw: string): string {
  return raw
    .replace(/Ø|ø/g, '%%c')
    .replace(/°/g, '%%d')
    .replace(/±/g, '%%p')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Formatage standard d'un groupe DXF (code groupe entier sur 3 caractères, suivi de la valeur et CRLF).
 */
function formatGroup(code: number, value: string | number): string {
  const codeStr = code.toString().padStart(3, ' ');
  return `${codeStr}\r\n${value}\r\n`;
}

function formatNumber(val: number): string {
  if (!Number.isFinite(val) || Math.abs(val) < 1e-5) {
    return '0.000';
  }
  return val.toFixed(3);
}

/**
 * Sérialiseur DXF R12 (AC1009) pur TypeScript, sans aucune dépendance externe.
 *
 * Conforme aux exigences strictes de parité CAO :
 * - Repère monde 1:1 en millimètres (Y-up)
 * - Déclaration exhaustive des calques et types de lignes dans TABLES
 * - Fin de ligne CRLF (\r\n) et nombre pair strict de lignes
 * - Calcul dynamique des limites $EXTMIN et $EXTMAX pour cadrage immédiat
 */
export class DxfWriter {
  private readonly layers: Map<string, DxfLayerDef> = new Map();
  private readonly lineTypes: Map<string, DxfLineTypeDef> = new Map();
  private readonly entitiesBuffer: string[] = [];

  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  public constructor() {
    // Enregistrement des types de lignes standards
    for (const lt of STANDARD_LINE_TYPES) {
      this.lineTypes.set(lt.name.toUpperCase(), lt);
    }
    // Calque 0 obligatoire dans tout fichier DXF
    this.addLayer({ name: '0', color: 7, lineType: 'CONTINUOUS' });
  }

  /**
   * Déclare un calque dans la table LAYER.
   */
  public addLayer(layer: DxfLayerDef): this {
    const upperName = layer.name.toUpperCase();
    const ltype = layer.lineType ? layer.lineType.toUpperCase() : 'CONTINUOUS';
    if (!this.lineTypes.has(ltype)) {
      this.lineTypes.set(ltype, {
        name: ltype,
        description: `${ltype} line`,
        elements: [],
      });
    }
    this.layers.set(upperName, {
      name: upperName,
      color: layer.color,
      lineType: ltype,
      flags: layer.flags ?? 0,
    });
    return this;
  }

  /**
   * Met à jour la boîte englobante globale du modèle pour $EXTMIN / $EXTMAX.
   */
  private updateBounds(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
  }

  /**
   * Assure qu'un calque est déclaré dans la table LAYER (garantie d'intégrité référentielle).
   */
  private ensureLayer(name: string): string {
    const upper = name.toUpperCase();
    if (!this.layers.has(upper)) {
      this.addLayer({ name: upper, color: 7, lineType: 'CONTINUOUS' });
    }
    return upper;
  }

  /**
   * Ajoute une entité LINE.
   */
  public addLine(
    layerName: string,
    start: Vec2,
    end: Vec2,
    options: DxfEntityOptions = {},
  ): this {
    const layer = this.ensureLayer(layerName);
    this.updateBounds(start.x, start.y);
    this.updateBounds(end.x, end.y);

    let s = '';
    s += formatGroup(0, 'LINE');
    s += formatGroup(8, layer);
    if (options.lineType) {
      const lt = options.lineType.toUpperCase();
      this.ensureLineType(lt);
      s += formatGroup(6, lt);
    }
    if (options.color !== undefined) {
      s += formatGroup(62, options.color);
    }
    s += formatGroup(10, formatNumber(start.x));
    s += formatGroup(20, formatNumber(start.y));
    s += formatGroup(30, '0.000');
    s += formatGroup(11, formatNumber(end.x));
    s += formatGroup(21, formatNumber(end.y));
    s += formatGroup(31, '0.000');

    this.entitiesBuffer.push(s);
    return this;
  }

  /**
   * Ajoute une entité POLYLINE avec sommets VERTEX et terminaison SEQEND (R12).
   */
  public addPolyline(
    layerName: string,
    vertices: readonly Vec2[],
    closed: boolean = true,
    options: DxfEntityOptions = {},
  ): this {
    if (vertices.length < 2) return this;
    const layer = this.ensureLayer(layerName);

    for (const v of vertices) {
      this.updateBounds(v.x, v.y);
    }

    let s = '';
    s += formatGroup(0, 'POLYLINE');
    s += formatGroup(8, layer);
    if (options.lineType) {
      const lt = options.lineType.toUpperCase();
      this.ensureLineType(lt);
      s += formatGroup(6, lt);
    }
    if (options.color !== undefined) {
      s += formatGroup(62, options.color);
    }
    s += formatGroup(66, 1); // Les sommets suivent
    s += formatGroup(70, closed ? 1 : 0); // 1 = fermé, 0 = ouvert
    s += formatGroup(10, '0.000');
    s += formatGroup(20, '0.000');
    s += formatGroup(30, '0.000');

    for (const v of vertices) {
      s += formatGroup(0, 'VERTEX');
      s += formatGroup(8, layer);
      s += formatGroup(10, formatNumber(v.x));
      s += formatGroup(20, formatNumber(v.y));
      s += formatGroup(30, '0.000');
    }

    s += formatGroup(0, 'SEQEND');
    s += formatGroup(8, layer);

    this.entitiesBuffer.push(s);
    return this;
  }

  /**
   * Ajoute une entité CIRCLE.
   */
  public addCircle(
    layerName: string,
    center: Vec2,
    radius: number,
    options: DxfEntityOptions = {},
  ): this {
    if (radius <= 0) return this;
    const layer = this.ensureLayer(layerName);

    this.updateBounds(center.x - radius, center.y - radius);
    this.updateBounds(center.x + radius, center.y + radius);

    let s = '';
    s += formatGroup(0, 'CIRCLE');
    s += formatGroup(8, layer);
    if (options.lineType) {
      const lt = options.lineType.toUpperCase();
      this.ensureLineType(lt);
      s += formatGroup(6, lt);
    }
    if (options.color !== undefined) {
      s += formatGroup(62, options.color);
    }
    s += formatGroup(10, formatNumber(center.x));
    s += formatGroup(20, formatNumber(center.y));
    s += formatGroup(30, '0.000');
    s += formatGroup(40, formatNumber(radius));

    this.entitiesBuffer.push(s);
    return this;
  }

  /**
   * Ajoute une entité ARC (angles en degrés, trigonométriques 0-360°).
   */
  public addArc(
    layerName: string,
    center: Vec2,
    radius: number,
    startAngleDeg: number,
    endAngleDeg: number,
    options: DxfEntityOptions = {},
  ): this {
    if (radius <= 0) return this;
    const layer = this.ensureLayer(layerName);

    this.updateBounds(center.x - radius, center.y - radius);
    this.updateBounds(center.x + radius, center.y + radius);

    const normStart = ((startAngleDeg % 360) + 360) % 360;
    const normEnd = ((endAngleDeg % 360) + 360) % 360;

    let s = '';
    s += formatGroup(0, 'ARC');
    s += formatGroup(8, layer);
    if (options.lineType) {
      const lt = options.lineType.toUpperCase();
      this.ensureLineType(lt);
      s += formatGroup(6, lt);
    }
    if (options.color !== undefined) {
      s += formatGroup(62, options.color);
    }
    s += formatGroup(10, formatNumber(center.x));
    s += formatGroup(20, formatNumber(center.y));
    s += formatGroup(30, '0.000');
    s += formatGroup(40, formatNumber(radius));
    s += formatGroup(50, formatNumber(normStart));
    s += formatGroup(51, formatNumber(normEnd));

    this.entitiesBuffer.push(s);
    return this;
  }

  /**
   * Ajoute une entité TEXT.
   */
  public addText(
    layerName: string,
    point: Vec2,
    height: number,
    text: string,
    options: DxfTextOptions = {},
  ): this {
    const cleaned = cleanDxfText(text);
    if (cleaned.length === 0 || height <= 0) return this;
    const layer = this.ensureLayer(layerName);

    this.updateBounds(point.x, point.y);

    let halignCode = 0; // 0 = Left
    if (options.halign === 'center') halignCode = 1;
    else if (options.halign === 'right') halignCode = 2;

    let valignCode = 0; // 0 = Baseline
    if (options.valign === 'bottom') valignCode = 1;
    else if (options.valign === 'middle') valignCode = 2;
    else if (options.valign === 'top') valignCode = 3;

    let s = '';
    s += formatGroup(0, 'TEXT');
    s += formatGroup(8, layer);
    s += formatGroup(10, formatNumber(point.x));
    s += formatGroup(20, formatNumber(point.y));
    s += formatGroup(30, '0.000');
    s += formatGroup(40, formatNumber(height));
    s += formatGroup(1, cleaned);

    if (options.rotationDeg && Math.abs(options.rotationDeg) > 1e-4) {
      s += formatGroup(50, formatNumber(((options.rotationDeg % 360) + 360) % 360));
    }

    s += formatGroup(7, options.style ?? 'STANDARD');

    if (halignCode !== 0 || valignCode !== 0) {
      s += formatGroup(72, halignCode);
      s += formatGroup(11, formatNumber(point.x));
      s += formatGroup(21, formatNumber(point.y));
      s += formatGroup(31, '0.000');
      s += formatGroup(73, valignCode);
    }

    this.entitiesBuffer.push(s);
    return this;
  }

  private ensureLineType(name: string): void {
    const upper = name.toUpperCase();
    if (!this.lineTypes.has(upper)) {
      this.lineTypes.set(upper, {
        name: upper,
        description: `${upper} line`,
        elements: [],
      });
    }
  }

  /**
   * Compile l'intégralité du document DXF R12 en chaîne ASCII normalisée CRLF.
   */
  public toDxfString(): string {
    const extMinX = Number.isFinite(this.minX) ? this.minX - 500 : 0;
    const extMinY = Number.isFinite(this.minY) ? this.minY - 500 : 0;
    const extMaxX = Number.isFinite(this.maxX) ? this.maxX + 500 : 10000;
    const extMaxY = Number.isFinite(this.maxY) ? this.maxY + 500 : 10000;

    let out = '';

    // =========================================================================
    // 1. SECTION HEADER
    // =========================================================================
    out += formatGroup(0, 'SECTION');
    out += formatGroup(2, 'HEADER');

    out += formatGroup(9, '$ACADVER');
    out += formatGroup(1, 'AC1009'); // Strictement DXF R12

    out += formatGroup(9, '$MEASUREMENT');
    out += formatGroup(70, 1); // 1 = Métrique (mm)

    out += formatGroup(9, '$EXTMIN');
    out += formatGroup(10, formatNumber(extMinX));
    out += formatGroup(20, formatNumber(extMinY));
    out += formatGroup(30, '0.000');

    out += formatGroup(9, '$EXTMAX');
    out += formatGroup(10, formatNumber(extMaxX));
    out += formatGroup(20, formatNumber(extMaxY));
    out += formatGroup(30, '0.000');

    out += formatGroup(0, 'ENDSEC');

    // =========================================================================
    // 2. SECTION TABLES
    // =========================================================================
    out += formatGroup(0, 'SECTION');
    out += formatGroup(2, 'TABLES');

    // Table VPORT
    out += formatGroup(0, 'TABLE');
    out += formatGroup(2, 'VPORT');
    out += formatGroup(70, 0);
    out += formatGroup(0, 'ENDTAB');

    // Table LTYPE
    out += formatGroup(0, 'TABLE');
    out += formatGroup(2, 'LTYPE');
    out += formatGroup(70, this.lineTypes.size);

    for (const lt of this.lineTypes.values()) {
      out += formatGroup(0, 'LTYPE');
      out += formatGroup(2, lt.name);
      out += formatGroup(70, 0);
      out += formatGroup(3, lt.description);
      out += formatGroup(72, 65); // 'A' alignment
      out += formatGroup(73, lt.elements.length);
      const totalLen = lt.elements.reduce((acc, el) => acc + Math.abs(el), 0);
      out += formatGroup(40, formatNumber(totalLen));
      for (const el of lt.elements) {
        out += formatGroup(49, formatNumber(el));
      }
    }
    out += formatGroup(0, 'ENDTAB');

    // Table LAYER
    out += formatGroup(0, 'TABLE');
    out += formatGroup(2, 'LAYER');
    out += formatGroup(70, this.layers.size);

    for (const layer of this.layers.values()) {
      out += formatGroup(0, 'LAYER');
      out += formatGroup(2, layer.name);
      out += formatGroup(70, layer.flags ?? 0);
      out += formatGroup(62, layer.color);
      out += formatGroup(6, layer.lineType ?? 'CONTINUOUS');
    }
    out += formatGroup(0, 'ENDTAB');

    // Table STYLE
    out += formatGroup(0, 'TABLE');
    out += formatGroup(2, 'STYLE');
    out += formatGroup(70, 1);
    out += formatGroup(0, 'STYLE');
    out += formatGroup(2, 'STANDARD');
    out += formatGroup(70, 0);
    out += formatGroup(40, '0.000'); // Hauteur variable
    out += formatGroup(41, '1.000'); // Facteur largeur
    out += formatGroup(50, '0.000');
    out += formatGroup(71, 0);
    out += formatGroup(42, '200.000');
    out += formatGroup(3, 'txt');
    out += formatGroup(4, '');
    out += formatGroup(0, 'ENDTAB');

    out += formatGroup(0, 'ENDSEC');

    // =========================================================================
    // 3. SECTION BLOCKS
    // =========================================================================
    out += formatGroup(0, 'SECTION');
    out += formatGroup(2, 'BLOCKS');
    out += formatGroup(0, 'ENDSEC');

    // =========================================================================
    // 4. SECTION ENTITIES
    // =========================================================================
    out += formatGroup(0, 'SECTION');
    out += formatGroup(2, 'ENTITIES');

    for (const ent of this.entitiesBuffer) {
      out += ent;
    }

    out += formatGroup(0, 'ENDSEC');

    // =========================================================================
    // 5. FIN DE FICHIER (EOF)
    // =========================================================================
    out += formatGroup(0, 'EOF');

    return out;
  }
}
