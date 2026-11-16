/**
 * Encodage et génération de GUIDs conformes au standard IFC (ISO 10303-21 / ISO 16739 buildingSMART).
 *
 * Un GUID IFC (IfcGloballyUniqueId) est la représentation compacte en base64 de 22 caractères
 * d'un UUID 128 bits selon la spécification officielle buildingSMART :
 * 1. Génération de 16 octets aléatoires (UUID v4 RFC 4122).
 * 2. Préfixage de 2 octets nuls [0, 0] pour alignement sur 18 octets (144 bits).
 * 3. Encodage base64 standard (24 caractères) dont les 2 premiers caractères d'alignement ('AA') sont omis.
 * 4. Transcodage vers l'alphabet IFC buildingSMART :
 *    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"
 *
 * Propriété fondamentale : le 1er caractère est obligatoirement dans '0', '1', '2', '3'.
 */

const STD_BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const IFC_BASE64_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

const B64_TO_IFC_MAP: Record<string, string> = {};
for (let i = 0; i < 64; i++) {
  const stdChar = STD_BASE64_ALPHABET[i];
  const ifcChar = IFC_BASE64_ALPHABET[i];
  if (stdChar && ifcChar) {
    B64_TO_IFC_MAP[stdChar] = ifcChar;
  }
}

/**
 * Génère un GUID IFC officiel conforme buildingSMART (22 caractères).
 * @param customBytes Octets 128-bit optionnels pour tests déterministes.
 */
export function createIfcGuid(customBytes?: Uint8Array): string {
  const bytes = customBytes ? new Uint8Array(customBytes) : new Uint8Array(16);
  if (!customBytes) {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
  }

  // Bits UUID v4 (RFC 4122)
  const b6 = bytes[6] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x40; // Version 4
  const b8 = bytes[8] ?? 0;
  bytes[8] = (b8 & 0x3f) | 0x80; // Variant RFC 4122

  // 18 octets : 2 octets nuls + 16 octets UUID
  const raw18 = new Uint8Array(18);
  raw18.set(bytes, 2);

  // Conversion en base64
  let b64 = '';
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(raw18).toString('base64');
  } else {
    let binary = '';
    for (let i = 0; i < raw18.length; i++) {
      binary += String.fromCharCode(raw18[i] ?? 0);
    }
    b64 = btoa(binary);
  }

  // Transcodage vers l'alphabet IFC en sautant les 2 premiers caractères 'AA'
  let ifcGuid = '';
  for (let i = 2; i < 24; i++) {
    const char = b64[i];
    ifcGuid += (char && B64_TO_IFC_MAP[char]) ?? '0';
  }

  return ifcGuid;
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
