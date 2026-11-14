/**
 * Encodage et génération de GUIDs conformes au standard IFC (ISO 10303-21).
 * Un GUID IFC est une chaîne de 22 caractères encodée en base64 spécifique (0-9, A-Z, a-z, _, $).
 */

const IFC_BASE64_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

export function createIfcGuid(): string {
  let guid = '';
  for (let i = 0; i < 22; i++) {
    const idx = Math.floor(Math.random() * 64);
    guid += IFC_BASE64_CHARS[idx];
  }
  return guid;
}

/**
 * Échappe une chaîne pour le format STEP ISO 10303-21.
 * - Les apostrophes simples sont doublées (' -> '')
 * - Les antislashs sont doublés (\ -> \\)
 */
export function escapeIfcString(str: string): string {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "''");
}
