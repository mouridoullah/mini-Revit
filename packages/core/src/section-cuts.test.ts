import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  AddSectionCutCommand,
  UpdateSectionCutCommand,
  DeleteSectionCutCommand,
  validateSectionCut,
  checkSectionCutViolations,
  BimValidationError,
  type SectionCut,
} from './index.js';
import { vec2 } from '@mini-bim/geometry';

describe('Saison 3 — Lot 2.A : Modèle & Commandes SectionCut (ADR-063)', () => {
  const validCut: SectionCut = {
    id: 'cut_test_01',
    category: 'sectionCut',
    name: "Coupe transversale A-A'",
    label: 'A',
    kind: 'section',
    start: vec2(0, 5000),
    end: vec2(10000, 5000),
    viewDirection: 1,
    depth: 8000,
  };

  it('valide un SectionCut conforme sans violation', () => {
    const violations = checkSectionCutViolations(validCut);
    expect(violations).toHaveLength(0);
    expect(() => validateSectionCut(validCut)).not.toThrow();
  });

  it('détecte les violations pour des paramètres invalides', () => {
    // Trop court (< 100 mm)
    const tooShort: SectionCut = {
      ...validCut,
      id: 'cut_short',
      start: vec2(0, 0),
      end: vec2(50, 0),
    };
    expect(checkSectionCutViolations(tooShort).some((v) => v.code === 'SECTION_CUT_TOO_SHORT')).toBe(
      true,
    );
    expect(() => validateSectionCut(tooShort)).toThrow(BimValidationError);

    // Direction invalide
    const badDir = { ...validCut, viewDirection: 0 as unknown as 1 };
    expect(
      checkSectionCutViolations(badDir).some((v) => v.code === 'SECTION_CUT_INVALID_VIEW_DIRECTION'),
    ).toBe(true);

    // Profondeur invalide (< 10 mm)
    const badDepth = { ...validCut, depth: 5 };
    expect(
      checkSectionCutViolations(badDepth).some((v) => v.code === 'SECTION_CUT_INVALID_DEPTH'),
    ).toBe(true);

    // zMin >= zMax
    const badZ = { ...validCut, zMin: 5000, zMax: 2000 };
    expect(
      checkSectionCutViolations(badZ).some((v) => v.code === 'SECTION_CUT_INVALID_Z_RANGE'),
    ).toBe(true);
  });

  it('exécute AddSectionCutCommand, UpdateSectionCutCommand et DeleteSectionCutCommand avec Undo/Redo', () => {
    const doc = new BimDocument();

    // 1. Ajout
    doc.execute(new AddSectionCutCommand(validCut));
    expect(doc.getState().sectionCuts?.[validCut.id]).toBeDefined();
    expect(doc.getState().sectionCuts?.[validCut.id]?.name).toBe("Coupe transversale A-A'");

    // 2. Mise à jour
    doc.execute(
      new UpdateSectionCutCommand(validCut.id, {
        depth: 12000,
        name: 'Coupe A modifiée',
      }),
    );
    expect(doc.getState().sectionCuts?.[validCut.id]?.depth).toBe(12000);
    expect(doc.getState().sectionCuts?.[validCut.id]?.name).toBe('Coupe A modifiée');

    // 3. Undo
    doc.undo();
    expect(doc.getState().sectionCuts?.[validCut.id]?.depth).toBe(8000);
    expect(doc.getState().sectionCuts?.[validCut.id]?.name).toBe("Coupe transversale A-A'");

    // 4. Redo
    doc.redo();
    expect(doc.getState().sectionCuts?.[validCut.id]?.depth).toBe(12000);

    // 5. Suppression
    doc.execute(new DeleteSectionCutCommand(validCut.id));
    expect(doc.getState().sectionCuts?.[validCut.id]).toBeUndefined();

    // 6. Undo suppression
    doc.undo();
    expect(doc.getState().sectionCuts?.[validCut.id]).toBeDefined();
  });
});
