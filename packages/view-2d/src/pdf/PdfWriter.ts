import { encodePdfLiteralString } from './win-ansi.js';

export interface TextOptions {
  readonly font?: 'regular' | 'bold' | undefined;
  readonly size?: number | undefined; // en points (défaut : 10)
  readonly color?: readonly [number, number, number] | undefined; // RGB 0..1 (défaut : [0,0,0])
  readonly align?: 'left' | 'center' | 'right' | undefined;
  readonly rotationDeg?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly backgroundBox?: boolean | undefined;
  readonly backgroundPadding?: number | undefined;
}

export interface PathOptions {
  readonly strokeColor?: readonly [number, number, number] | undefined;
  readonly fillColor?: readonly [number, number, number] | undefined;
  readonly lineWidth?: number | undefined;
  readonly lineDash?: readonly number[] | undefined;
  readonly lineDashPhase?: number | undefined;
  readonly close?: boolean | undefined;
}

/**
 * Estimation de la largeur d'une chaîne en police Helvetica / Helvetica-Bold.
 */
export function estimateTextWidthPt(text: string, fontSizePt: number, isBold: boolean = false): number {
  let totalUnits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 32) {
      totalUnits += 278; // espace
    } else if (code >= 48 && code <= 57) {
      totalUnits += 556; // chiffres
    } else if (code >= 65 && code <= 90) {
      // Majuscules
      if (code === 73) totalUnits += 278; // I
      else if (code === 77 || code === 87) totalUnits += 833; // M, W
      else totalUnits += 667;
    } else if (code >= 97 && code <= 122) {
      // Minuscules
      if (code === 105 || code === 108) totalUnits += 222; // i, l
      else if (code === 109 || code === 119) totalUnits += 778; // m, w
      else if (code === 102 || code === 114 || code === 116) totalUnits += 333; // f, r, t
      else totalUnits += 500;
    } else if (code === 46 || code === 44 || code === 58 || code === 59) {
      totalUnits += 278; // .,:;
    } else {
      totalUnits += 556;
    }
  }
  const factor = isBold ? 1.05 : 1.0;
  return (totalUnits / 1000) * fontSizePt * factor;
}

/**
 * Tronque proprement une chaîne pour qu'elle tienne dans la largeur impartie.
 */
export function truncateText(text: string, maxWidthPt: number, fontSizePt: number, isBold: boolean = false): string {
  if (maxWidthPt <= 0 || estimateTextWidthPt(text, fontSizePt, isBold) <= maxWidthPt) {
    return text;
  }
  let current = text;
  const ellipsis = '...';
  while (current.length > 1 && estimateTextWidthPt(current + ellipsis, fontSizePt, isBold) > maxWidthPt) {
    current = current.slice(0, -1);
  }
  return current.length > 0 ? current + ellipsis : text;
}

/**
 * Constructeur de flux de commandes vectorielles d'une page PDF.
 */
export class PdfPageContent {
  private readonly chunks: Uint8Array[] = [];

  public appendAscii(str: string): void {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i) & 0xff;
    }
    this.chunks.push(buf);
  }

  public appendBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  public save(): this {
    this.appendAscii('q\n');
    return this;
  }

  public restore(): this {
    this.appendAscii('Q\n');
    return this;
  }

  public setLineWidth(w: number): this {
    const val = Number.isFinite(w) && w > 0 ? w.toFixed(2) : '1.00';
    this.appendAscii(`${val} w\n`);
    return this;
  }

  public setStrokeColor(r: number, g: number, b: number): this {
    this.appendAscii(
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG\n`,
    );
    return this;
  }

  public setFillColor(r: number, g: number, b: number): this {
    this.appendAscii(
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`,
    );
    return this;
  }

  public setLineDash(pattern: readonly number[], phase: number = 0): this {
    const patStr = pattern.map((p) => p.toFixed(1)).join(' ');
    this.appendAscii(`[${patStr}] ${phase.toFixed(1)} d\n`);
    return this;
  }

  public clipRect(x: number, y: number, w: number, h: number): this {
    this.appendAscii(
      `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re W n\n`,
    );
    return this;
  }

  public moveTo(x: number, y: number): this {
    this.appendAscii(`${x.toFixed(2)} ${y.toFixed(2)} m\n`);
    return this;
  }

  public lineTo(x: number, y: number): this {
    this.appendAscii(`${x.toFixed(2)} ${y.toFixed(2)} l\n`);
    return this;
  }

  public curveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): this {
    this.appendAscii(
      `${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} c\n`,
    );
    return this;
  }

  public closePath(): this {
    this.appendAscii('h\n');
    return this;
  }

  public stroke(): this {
    this.appendAscii('S\n');
    return this;
  }

  public fill(): this {
    this.appendAscii('f\n');
    return this;
  }

  public fillAndStroke(): this {
    this.appendAscii('B\n');
    return this;
  }

  /**
   * Tracé d'une ligne simple.
   */
  public line(x1: number, y1: number, x2: number, y2: number, options: PathOptions = {}): this {
    this.save();
    if (options.strokeColor) {
      this.setStrokeColor(options.strokeColor[0], options.strokeColor[1], options.strokeColor[2]);
    }
    if (options.lineWidth) {
      this.setLineWidth(options.lineWidth);
    }
    if (options.lineDash) {
      this.setLineDash(options.lineDash, options.lineDashPhase ?? 0);
    }
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
    this.stroke();
    this.restore();
    return this;
  }

  /**
   * Tracé d'un rectangle.
   */
  public rect(
    x: number,
    y: number,
    w: number,
    h: number,
    options: {
      strokeColor?: readonly [number, number, number] | undefined;
      fillColor?: readonly [number, number, number] | undefined;
      lineWidth?: number | undefined;
      lineDash?: readonly number[] | undefined;
    } = {},
  ): this {
    this.save();
    if (options.strokeColor) {
      this.setStrokeColor(options.strokeColor[0], options.strokeColor[1], options.strokeColor[2]);
    }
    if (options.fillColor) {
      this.setFillColor(options.fillColor[0], options.fillColor[1], options.fillColor[2]);
    }
    if (options.lineWidth) {
      this.setLineWidth(options.lineWidth);
    }
    if (options.lineDash) {
      this.setLineDash(options.lineDash, 0);
    }

    this.appendAscii(
      `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\n`,
    );

    if (options.fillColor && options.strokeColor) {
      this.fillAndStroke();
    } else if (options.fillColor) {
      this.fill();
    } else {
      this.stroke();
    }
    this.restore();
    return this;
  }

  /**
   * Tracé d'un cercle analytique via 4 courbes de Bézier cubiques.
   */
  public circle(
    cx: number,
    cy: number,
    r: number,
    options: {
      strokeColor?: readonly [number, number, number] | undefined;
      fillColor?: readonly [number, number, number] | undefined;
      lineWidth?: number | undefined;
    } = {},
  ): this {
    if (r <= 0) return this;
    const k = 0.55228475 * r;

    this.save();
    if (options.strokeColor) {
      this.setStrokeColor(options.strokeColor[0], options.strokeColor[1], options.strokeColor[2]);
    }
    if (options.fillColor) {
      this.setFillColor(options.fillColor[0], options.fillColor[1], options.fillColor[2]);
    }
    if (options.lineWidth) {
      this.setLineWidth(options.lineWidth);
    }

    this.moveTo(cx + r, cy);
    this.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
    this.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    this.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
    this.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    this.closePath();

    if (options.fillColor && options.strokeColor) {
      this.fillAndStroke();
    } else if (options.fillColor) {
      this.fill();
    } else {
      this.stroke();
    }
    this.restore();
    return this;
  }

  /**
   * Tracé d'un arc de cercle (angles en radians, CCW).
   */
  public arc(
    cx: number,
    cy: number,
    r: number,
    startAngleRad: number,
    endAngleRad: number,
    options: PathOptions = {},
  ): this {
    if (r <= 0) return this;
    // Normaliser l'intervalle angulaire en CCW
    let span = endAngleRad - startAngleRad;
    while (span < 0) span += 2 * Math.PI;
    if (span < 1e-4) return this;

    const segments = Math.max(1, Math.ceil(span / (Math.PI / 2)));
    const segAngle = span / segments;

    this.save();
    if (options.strokeColor) {
      this.setStrokeColor(options.strokeColor[0], options.strokeColor[1], options.strokeColor[2]);
    }
    if (options.lineWidth) {
      this.setLineWidth(options.lineWidth);
    }
    if (options.lineDash) {
      this.setLineDash(options.lineDash, options.lineDashPhase ?? 0);
    }

    const startX = cx + r * Math.cos(startAngleRad);
    const startY = cy + r * Math.sin(startAngleRad);
    this.moveTo(startX, startY);

    for (let i = 0; i < segments; i++) {
      const a1 = startAngleRad + i * segAngle;
      const a2 = a1 + segAngle;
      const alpha = Math.tan((a2 - a1) / 4) * (4 / 3);

      const p0x = cx + r * Math.cos(a1);
      const p0y = cy + r * Math.sin(a1);
      const p3x = cx + r * Math.cos(a2);
      const p3y = cy + r * Math.sin(a2);

      const p1x = p0x - alpha * r * Math.sin(a1);
      const p1y = p0y + alpha * r * Math.cos(a1);
      const p2x = p3x + alpha * r * Math.sin(a2);
      const p2y = p3y - alpha * r * Math.cos(a2);

      this.curveTo(p1x, p1y, p2x, p2y, p3x, p3y);
    }

    this.stroke();
    this.restore();
    return this;
  }

  /**
   * Tracé d'une polyligne ou d'un polygone.
   */
  public polyline(
    points: readonly { readonly x: number; readonly y: number }[],
    options: PathOptions = {},
  ): this {
    if (points.length < 2) return this;
    this.save();
    if (options.strokeColor) {
      this.setStrokeColor(options.strokeColor[0], options.strokeColor[1], options.strokeColor[2]);
    }
    if (options.fillColor) {
      this.setFillColor(options.fillColor[0], options.fillColor[1], options.fillColor[2]);
    }
    if (options.lineWidth) {
      this.setLineWidth(options.lineWidth);
    }
    if (options.lineDash) {
      this.setLineDash(options.lineDash, options.lineDashPhase ?? 0);
    }

    const p0 = points[0];
    if (!p0) return this;
    this.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p) {
        this.lineTo(p.x, p.y);
      }
    }

    if (options.close) {
      this.closePath();
    }

    if (options.fillColor && options.strokeColor) {
      this.fillAndStroke();
    } else if (options.fillColor) {
      this.fill();
    } else {
      this.stroke();
    }
    this.restore();
    return this;
  }

  /**
   * Tracé d'un texte typographique avec gestion d'alignement et rotation.
   */
  public text(str: string, x: number, y: number, options: TextOptions = {}): this {
    if (!str || str.trim().length === 0) return this;

    const fontTag = options.font === 'bold' ? '/F2' : '/F1';
    const size = options.size ?? 10;
    const isBold = options.font === 'bold';
    const align = options.align ?? 'left';

    let displayStr = str;
    if (options.maxWidth && options.maxWidth > 0) {
      displayStr = truncateText(str, options.maxWidth, size, isBold);
    }

    const textWidth = estimateTextWidthPt(displayStr, size, isBold);

    let effX = x;
    const effY = y;

    if (align !== 'left') {
      if (align === 'center') {
        effX -= textWidth / 2;
      } else if (align === 'right') {
        effX -= textWidth;
      }
    }

    // Fond opaque facultatif (pour les cotations traversant des lignes)
    if (options.backgroundBox) {
      const pad = options.backgroundPadding ?? 1.5;
      this.rect(effX - pad, effY - pad * 0.5, textWidth + pad * 2, size + pad, {
        fillColor: [1, 1, 1],
      });
    }

    const rad = ((options.rotationDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    this.save();
    this.appendAscii('BT\n');
    this.appendAscii(`${fontTag} ${size.toFixed(2)} Tf\n`);

    if (options.color) {
      this.setFillColor(options.color[0], options.color[1], options.color[2]);
    } else {
      this.setFillColor(0, 0, 0);
    }

    // Matrice de transformation texte : [cos, sin, -sin, cos, x, y]
    this.appendAscii(
      `${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${effX.toFixed(2)} ${effY.toFixed(2)} Tm\n`,
    );

    const literalBytes = encodePdfLiteralString(displayStr);
    this.appendBytes(literalBytes);
    this.appendAscii(' Tj\n');
    this.appendAscii('ET\n');
    this.restore();

    return this;
  }

  public toBytes(): Uint8Array {
    let totalLen = 0;
    for (const chunk of this.chunks) {
      totalLen += chunk.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

/**
 * Moteur de sérialisation PDF 1.4 pur TypeScript, zéro filigrane, zéro dépendance.
 */
export class PdfWriter {
  private readonly pages: {
    readonly widthPt: number;
    readonly heightPt: number;
    readonly content: PdfPageContent;
  }[] = [];

  public addPage(widthPt: number, heightPt: number): PdfPageContent {
    const content = new PdfPageContent();
    this.pages.push({ widthPt, heightPt, content });
    return content;
  }

  public compile(): Uint8Array {
    // Structure d'objets PDF 1.4 :
    // 1 0 obj : Catalog (/Type /Catalog /Pages 2 0 R)
    // 2 0 obj : Pages (/Type /Pages /Kids [ ... ] /Count N)
    // 3 0 obj : Font /F1 (/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding)
    // 4 0 obj : Font /F2 (/Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding)
    // Pour chaque page i (de 0 à N-1) :
    //   pageObjId = 5 + 2*i
    //   contentObjId = 6 + 2*i

    const pageCount = this.pages.length;
    const totalObjects = 4 + pageCount * 2;

    const chunks: Uint8Array[] = [];
    const offsets: number[] = new Array(totalObjects + 1).fill(0);

    let currentOffset = 0;

    const writeAscii = (str: string): void => {
      const buf = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0xff;
      }
      chunks.push(buf);
      currentOffset += buf.length;
    };

    const writeBytes = (bytes: Uint8Array): void => {
      chunks.push(bytes);
      currentOffset += bytes.length;
    };

    // 1. En-tête PDF 1.4 + Commentaire binaire
    writeAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // 2. Objet 1 : Catalog
    offsets[1] = currentOffset;
    writeAscii('1 0 obj\n<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>\nendobj\n');

    // 3. Objet 2 : Pages tree
    offsets[2] = currentOffset;
    const kidsStr = this.pages
      .map((_, i) => `${5 + 2 * i} 0 R`)
      .join(' ');
    writeAscii(`2 0 obj\n<<\n  /Type /Pages\n  /Kids [${kidsStr}]\n  /Count ${pageCount}\n>>\nendobj\n`);

    // 4. Objet 3 : Font /F1 (Helvetica)
    offsets[3] = currentOffset;
    writeAscii('3 0 obj\n<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>\nendobj\n');

    // 5. Objet 4 : Font /F2 (Helvetica-Bold)
    offsets[4] = currentOffset;
    writeAscii('4 0 obj\n<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>\nendobj\n');

    // 6. Pages et Content Streams
    for (let i = 0; i < pageCount; i++) {
      const page = this.pages[i];
      if (!page) continue;
      const pageObjId = 5 + 2 * i;
      const contentObjId = 6 + 2 * i;
      const contentBytes = page.content.toBytes();

      // Page Object
      offsets[pageObjId] = currentOffset;
      writeAscii(
        `${pageObjId} 0 obj\n<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 ${page.widthPt.toFixed(2)} ${page.heightPt.toFixed(2)}]\n  /Resources <<\n    /Font <<\n      /F1 3 0 R\n      /F2 4 0 R\n    >>\n    /ProcSet [/PDF /Text]\n  >>\n  /Contents ${contentObjId} 0 R\n>>\nendobj\n`,
      );

      // Content Stream Object
      offsets[contentObjId] = currentOffset;
      writeAscii(
        `${contentObjId} 0 obj\n<<\n  /Length ${contentBytes.length}\n>>\nstream\n`,
      );
      writeBytes(contentBytes);
      writeAscii('\nendstream\nendobj\n');
    }

    // 7. Table XREF (entrées de 20 octets strictes selon la norme ISO 32000-1)
    const xrefOffset = currentOffset;
    writeAscii(`xref\n0 ${totalObjects + 1}\n`);
    writeAscii('0000000000 65535 f \n');

    for (let id = 1; id <= totalObjects; id++) {
      const off = offsets[id] ?? 0;
      const offStr = off.toString().padStart(10, '0');
      writeAscii(`${offStr} 00000 n \n`);
    }

    // 8. Trailer & EOF
    writeAscii(`trailer\n<<\n  /Size ${totalObjects + 1}\n  /Root 1 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    // Assemblage final en un unique buffer d'octets
    let totalLen = 0;
    for (const c of chunks) {
      totalLen += c.length;
    }
    const finalBuffer = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      finalBuffer.set(c, pos);
      pos += c.length;
    }

    return finalBuffer;
  }
}
