/**
 * Normalisation métrique des fichiers IFC externes vers le repère Mini-BIM (millimètres).
 * Conforme à ADR-003.
 */

import * as WebIFC from 'web-ifc';
import { type FederatedUnits } from './types.js';

/**
 * Analyse les unités de longueur déclarées dans le modèle IFC et calcule le facteur multiplicatif vers le millimètre.
 */
export function detectIfcUnits(ifcApi: WebIFC.IfcAPI, modelId: number): FederatedUnits {
  try {
    const siUnitIds = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSIUNIT);
    const count = siUnitIds.size();

    for (let i = 0; i < count; i++) {
      const lineId = siUnitIds.get(i);
      const unit = ifcApi.GetLine(modelId, lineId) as {
        UnitType?: { value?: string };
        Prefix?: { value?: string } | null;
        Name?: { value?: string };
      };

      if (unit && unit.UnitType && unit.UnitType.value === 'LENGTHUNIT') {
        const name = unit.Name?.value ?? 'METRE';
        const prefix = unit.Prefix?.value ?? null;

        if (name === 'METRE') {
          if (prefix === 'MILLI') {
            return { length: 'MILLIMETRE', scaleToMm: 1.0 };
          }
          if (prefix === 'CENTI') {
            return { length: 'CENTIMETRE', scaleToMm: 10.0 };
          }
          if (prefix === 'DECI') {
            return { length: 'DECIMETRE', scaleToMm: 100.0 };
          }
          if (prefix === 'KILO') {
            return { length: 'KILOMETRE', scaleToMm: 1000000.0 };
          }
          // Pas de préfixe = MÈTRE
          return { length: 'METRE', scaleToMm: 1000.0 };
        }

        if (name === 'FOOT') {
          return { length: 'FOOT', scaleToMm: 304.8 };
        }

        if (name === 'INCH') {
          return { length: 'INCH', scaleToMm: 25.4 };
        }
      }
    }
  } catch {
    // Si la lecture des lignes d'unités échoue, fallback sécurisé sur millimètres
  }

  return { length: 'MILLIMETRE', scaleToMm: 1.0 };
}
