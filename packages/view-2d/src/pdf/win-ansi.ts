/**
 * Table de correspondance Windows-1252 pour les polices Type 1 standard PDF (/WinAnsiEncoding).
 * Permet un rendu irréprochable des accents français, unités (m², m³) et symboles techniques.
 */
const WIN_1252_SPECIAL_MAP: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
  'Ø': 0xd8,
  'ø': 0xf8,
};

/**
 * Encode une chaîne de caractères Unicode en octets Windows-1252.
 */
export function encodeWinAnsi(text: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!char) continue;
    const code = char.charCodeAt(0);
    const mapped = WIN_1252_SPECIAL_MAP[char];

    if (code <= 0x7f) {
      bytes.push(code);
    } else if (mapped !== undefined) {
      bytes.push(mapped);
    } else if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code);
    } else {
      // Replis standards pour caractères typographiques
      if (char === '’' || char === '`') bytes.push(0x27); // '
      else if (char === '“' || char === '”') bytes.push(0x22); // "
      else if (char === '–' || char === '—') bytes.push(0x2d); // -
      else bytes.push(0x3f); // '?'
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Échappe les caractères réservés PDF ('\', '(', ')') dans un flux d'octets Windows-1252.
 */
export function escapePdfStringBytes(rawBytes: Uint8Array): Uint8Array {
  const escaped: number[] = [];

  for (let i = 0; i < rawBytes.length; i++) {
    const b = rawBytes[i];
    if (b === undefined) continue;
    if (b === 0x5c || b === 0x28 || b === 0x29) {
      // '\', '(', ')'
      escaped.push(0x5c); // Ajout de l'antislash
    }
    escaped.push(b);
  }

  return new Uint8Array(escaped);
}

/**
 * Encode une chaîne de texte directement en séquence d'octets d'un littéral PDF "(...)".
 */
export function encodePdfLiteralString(text: string): Uint8Array {
  const encoded = encodeWinAnsi(text);
  const escaped = escapePdfStringBytes(encoded);

  const result = new Uint8Array(escaped.length + 2);
  result[0] = 0x28; // '('
  result.set(escaped, 1);
  result[result.length - 1] = 0x29; // ')'

  return result;
}
