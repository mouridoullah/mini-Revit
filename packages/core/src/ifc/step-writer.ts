/**
 * Écriture de fichiers STEP ISO 10303-21 pour IFC4.
 * Conforme à ISO 10303-21 / ISO 16739 buildingSMART.
 */

/**
 * Échappe une chaîne pour le format STEP ISO 10303-21 :
 * - Doublement des apostrophes simples (' -> '')
 * - Doublement des antislashs (\ -> \\)
 * - Caractères hors ASCII imprimable (code < 32 ou > 126) encodés au standard ISO 10303-21:
 *   format UTF-16 hexadécimal \X2\HHHH\X0\
 */
export function escapeStepString(str: string): string {
  if (!str) return '';
  let result = '';
  let inNonAscii = false;
  let nonAsciiBuffer = '';

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // ASCII imprimable : 32 à 126, sauf apostrophe (39) et antislash (92)
    if (code >= 32 && code <= 126) {
      if (inNonAscii) {
        result += `\\X2\\${nonAsciiBuffer}\\X0\\`;
        inNonAscii = false;
        nonAsciiBuffer = '';
      }
      if (code === 39) {
        result += "''";
      } else if (code === 92) {
        result += '\\\\';
      } else {
        result += str[i];
      }
    } else {
      inNonAscii = true;
      nonAsciiBuffer += code.toString(16).toUpperCase().padStart(4, '0');
    }
  }

  if (inNonAscii) {
    result += `\\X2\\${nonAsciiBuffer}\\X0\\`;
  }

  return result;
}

/**
 * Alias de compatibilité pour escapeStepString.
 */
export const escapeIfcString = escapeStepString;

/**
 * Constructeur séquentiel de fichier STEP ISO 10303-21 pour IFC4.
 */
export class StepWriter {
  private idCounter = 0;
  private readonly lines: string[] = [];

  public nextId(): number {
    return ++this.idCounter;
  }

  public add(entity: string): number {
    const id = ++this.idCounter;
    this.lines.push(`#${id}=${entity};`);
    return id;
  }

  public toString(header: string): string {
    return [
      'ISO-10303-21;',
      'HEADER;',
      header,
      'ENDSEC;',
      'DATA;',
      ...this.lines,
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n');
  }
}
