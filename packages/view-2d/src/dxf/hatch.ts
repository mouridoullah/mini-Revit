import { type Vec2, vec2 } from '@tabax/geometry';
import { sliceSegmentWithPolygonWithHoles } from '@tabax/geometry';

export interface HatchOptions {
  /** Angle des hachures en degrés (défaut : 45°). */
  readonly angleDeg?: number | undefined;
  /** Espacement entre deux lignes de hachures en mm (défaut : 250 mm). */
  readonly spacing?: number | undefined;
  /** Trous éventuels dans le polygone (trémies, réservations). */
  readonly holes?: readonly (readonly Vec2[])[] | undefined;
}

/**
 * Génère des segments de hachures linéaires (LINE) découpés analytiquement
 * à l'intérieur d'un polygone 2D fermé avec trous éventuels.
 *
 * Compatible à 100% avec les spécifications DXF R12 (AC1009) sans nécessiter
 * l'entité complexe HATCH de R14/R2000.
 */
export function generateHatchLines(
  polygon: readonly Vec2[],
  options: HatchOptions = {},
): readonly (readonly [Vec2, Vec2])[] {
  if (polygon.length < 3) return [];

  const angleDeg = options.angleDeg ?? 45;
  const spacing = Math.max(20, options.spacing ?? 250);

  // 1. Calcul de la boîte englobante
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfDiag = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;

  // 2. Vecteurs directeurs de la trame
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;

  const result: (readonly [Vec2, Vec2])[] = [];

  // 3. Balayage perpendiculaire régulier
  const numSteps = Math.ceil((2 * halfDiag) / spacing);
  for (let i = 0; i <= numSteps; i++) {
    const offset = -halfDiag + i * spacing;
    const px = cx + nx * offset;
    const py = cy + ny * offset;

    const start = vec2(px - ux * halfDiag, py - uy * halfDiag);
    const end = vec2(px + ux * halfDiag, py + uy * halfDiag);

    const intervals = sliceSegmentWithPolygonWithHoles(
      start,
      end,
      polygon,
      options.holes,
    );

    for (const seg of intervals) {
      if (Math.hypot(seg.endPt.x - seg.startPt.x, seg.endPt.y - seg.startPt.y) >= 5) {
        result.push([seg.startPt, seg.endPt]);
      }
    }
  }

  return result;
}
