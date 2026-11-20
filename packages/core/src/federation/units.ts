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
    // 1. Détection prioritaire des unités basées sur conversion (IFCCONVERSIONBASEDUNIT)
    // Permet le support natif des fichiers impériaux (FOOT, INCH) ou non-SI
    const convUnitIds = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCCONVERSIONBASEDUNIT);
    for (let i = 0; i < convUnitIds.size(); i++) {
      const lineId = convUnitIds.get(i);
      const unit = ifcApi.GetLine(modelId, lineId) as {
        UnitType?: { value?: string };
        Name?: { value?: string };
        ConversionFactor?: { value?: number };
      };

      if (unit && unit.UnitType?.value === 'LENGTHUNIT') {
        const rawName = (unit.Name?.value ?? '').toUpperCase().trim();
        let scale = 1.0;
        let lengthName = 'CUSTOM';

        if (rawName.includes('FOOT') || rawName.includes('FEET') || rawName === 'FT') {
          lengthName = 'FOOT';
          scale = 304.8;
        } else if (rawName.includes('INCH') || rawName === 'IN') {
          lengthName = 'INCH';
          scale = 25.4;
        } else if (rawName.includes('YARD')) {
          lengthName = 'YARD';
          scale = 914.4;
        }

        // Si un facteur de conversion numérique est déclaré dans IFCMEASUREWITHUNIT
        if (unit.ConversionFactor?.value) {
          try {
            const factorLine = ifcApi.GetLine(modelId, unit.ConversionFactor.value) as {
              ValueComponent?: { value?: number };
              UnitComponent?: { value?: number };
            };
            const factorVal = factorLine.ValueComponent?.value;
            if (typeof factorVal === 'number' && factorVal > 0) {
              let baseScale = 1000.0; // Par défaut mètre
              if (factorLine.UnitComponent?.value) {
                const baseUnit = ifcApi.GetLine(modelId, factorLine.UnitComponent.value) as {
                  Prefix?: { value?: string } | null;
                  Name?: { value?: string };
                };
                if (baseUnit.Prefix?.value === 'MILLI') baseScale = 1.0;
                else if (baseUnit.Prefix?.value === 'CENTI') baseScale = 10.0;
              }
              scale = factorVal * baseScale;
            }
          } catch {
            // Continuer avec scale calculé par nom
          }
        }

        return { length: lengthName, scaleToMm: scale };
      }
    }

    // 2. Détection standard des unités SI (IFCSIUNIT)
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
