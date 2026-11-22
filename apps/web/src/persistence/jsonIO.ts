import { BimDocument, BimValidationError } from '@tabax/core';

/**
 * Sérialise un BimDocument en chaîne JSON standard indentée (pretty-printed).
 *
 * @param doc Document architectural à sérialiser
 * @param pretty Indentation lisible (défaut: true)
 * @returns Chaîne JSON conforme au schéma BimState v1
 */
export function exportToJSON(doc: BimDocument, pretty = true): string {
  return doc.toJSON(pretty);
}

/**
 * Déclenche le téléchargement côté client du document sous forme de fichier JSON.
 *
 * @param doc Document architectural à exporter
 * @param filename Nom du fichier cible (par défaut: 'project.mbim.json')
 */
export function exportToFile(doc: BimDocument, filename = 'project.mbim.json'): void {
  const jsonContent = exportToJSON(doc, true);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Désérialise et valide rigoureusement un fichier JSON sélectionné par l'utilisateur.
 *
 * @param file Fichier Blob/File issu d'un input file
 * @returns Promesse résolue avec l'instance BimDocument validée
 * @throws {BimValidationError} Si le JSON est malformé, l'unité invalide ou la version de schéma non supportée
 */
export async function importFromFile(file: File): Promise<BimDocument> {
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    throw new BimValidationError(
      'FILE_READ_ERROR',
      `Impossible de lire le fichier: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return BimDocument.fromJSON(text);
}
