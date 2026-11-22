/**
 * Encodage et génération de GUIDs conformes au standard IFC (ISO 10303-21 / ISO 16739 buildingSMART).
 *
 * Un GUID IFC (IfcGloballyUniqueId) est la représentation compacte en base64 de 22 caractères
 * d'un UUID 128 bits selon la spécification officielle buildingSMART :
 * 1. Génération de 16 octets (dérivés de manière déterministe depuis un seed ou hash 128-bit).
 * 2. Préfixage de 2 octets nuls [0, 0] pour alignement sur 18 octets (144 bits).
 * 3. Encodage base64 standard (24 caractères) dont les 2 premiers caractères d'alignement ('AA') sont omis.
 * 4. Transcodage vers l'alphabet IFC buildingSMART :
 *    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"
 *
 * Propriété fondamentale : le 1er caractère est obligatoirement dans '0', '1', '2', '3'.
 */

// GUIDs déterministes conformes ISO 10303-21 / ISO 16739 buildingSMART

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
 * Calcule un hachage 128-bit déterministe à partir d'une chaîne arbitraire.
 */
export function hashStringTo16Bytes(str: string): Uint8Array {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x41c64e6d;
  let h4 = 0x9e3779b9;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x5bd1e995);
    h2 = Math.imul(h2 ^ (code >> 8), 0x27d4eb2f);
    h3 = Math.imul(h3 ^ code, 0x165667b1);
    h4 = Math.imul(h4 ^ (code + i), 0xd6e8feb8);
  }

  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;

  h2 ^= h2 >>> 16;
  h2 = Math.imul(h2, 0xc2b2ae35);
  h2 ^= h2 >>> 13;

  h3 ^= h3 >>> 16;
  h3 = Math.imul(h3, 0x7feb352d);
  h3 ^= h3 >>> 13;

  h4 ^= h4 >>> 16;
  h4 = Math.imul(h4, 0x846ca68b);
  h4 ^= h4 >>> 13;

  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, h1 >>> 0, false);
  view.setUint32(4, h2 >>> 0, false);
  view.setUint32(8, h3 >>> 0, false);
  view.setUint32(12, h4 >>> 0, false);
  return bytes;
}

let deterministicFallbackSequence = 0;

/**
 * Réinitialise le compteur de séquence déterministe pour les tests.
 */
export function resetDeterministicIfcGuidSequence(): void {
  deterministicFallbackSequence = 0;
}

/**
 * Génère un GUID IFC officiel conforme buildingSMART (22 caractères).
 * Si une chaîne de graine (seed) est fournie, la génération est 100% déterministe
 * et préserve la reproductibilité octet par octet des exports IFC.
 *
 * Même si aucun argument n'est fourni, une dérivation déterministe basée sur une séquence
 * stable remplace tout aléa (ADR-071) afin de garantir la stricte reproductibilité.
 *
 * @param source Graine textuelle (ex: identifiant ULID d'élément) ou octets 128-bit.
 */
export function createIfcGuid(source?: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof source === 'string') {
    bytes = hashStringTo16Bytes(source);
  } else if (source instanceof Uint8Array) {
    bytes = new Uint8Array(source);
  } else {
    // Dérivation déterministe par séquence (zéro Math.random)
    deterministicFallbackSequence++;
    bytes = hashStringTo16Bytes(`fallback-guid-seq-${deterministicFallbackSequence}`);
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
