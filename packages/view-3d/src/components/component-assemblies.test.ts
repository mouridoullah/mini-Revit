import { describe, it, expect } from 'vitest';
import {
  createComponentAssembly,
  type ComponentMeshInput,
  type ComponentTypeMeshInput,
} from './index.js';

const CATALOG: readonly ComponentTypeMeshInput[] = [
  { subType: 'toilet', width: 360, depth: 540, height: 400 },
  { subType: 'sink', width: 800, depth: 500, height: 850 },
  { subType: 'shower', width: 900, depth: 900, height: 60 },
  { subType: 'bath', width: 1700, depth: 750, height: 550 },
  { subType: 'kitchen_base', width: 600, depth: 600, height: 850 },
  { subType: 'kitchen_wall', width: 600, depth: 350, height: 700, defaultElevationOffset: 1450 },
  { subType: 'sink_unit', width: 1200, depth: 600, height: 850 },
  { subType: 'appliance', width: 600, depth: 650, height: 1850 },
  { subType: 'appliance', width: 600, depth: 600, height: 850 },
  { subType: 'bed', width: 1600, depth: 2000, height: 500 },
  { subType: 'table', width: 1600, depth: 900, height: 750 },
  { subType: 'chair', width: 450, depth: 450, height: 850 },
  { subType: 'sofa', width: 2200, depth: 900, height: 800 },
  { subType: 'cabinet', width: 1500, depth: 600, height: 2100 },
  { subType: 'sliding_door', width: 2400, depth: 150, height: 2150 },
  { subType: 'french_window', width: 1400, depth: 150, height: 2150 },
];

describe('Architectural Component Assemblies LOD 350', () => {
  const dummyComp: ComponentMeshInput = {
    id: 'comp_lod350',
    placement: { x: 500, y: 500, rotation: Math.PI / 4 },
  };

  for (const ct of CATALOG) {
    it(`génère un assemblage LOD 350 multi-pièces pour "${ct.subType}" (H=${ct.height}mm)`, () => {
      const assembly = createComponentAssembly(dummyComp, ct, 0);

      expect(assembly).not.toBeNull();
      if (!assembly) return;

      expect(assembly.elementId).toBe('comp_lod350');
      expect(assembly.category).toBe('component');
      expect(assembly.parts.length).toBeGreaterThanOrEqual(1);

      // Vérifie chaque pièce de l'assemblage
      const materialRoles = new Set<string>();
      for (const part of assembly.parts) {
        expect(part.materialRole).toBeDefined();
        materialRoles.add(part.materialRole);

        const raw = part.rawData;
        expect(raw.positions.length).toBeGreaterThan(0);
        expect(raw.normals.length).toBe(raw.positions.length);
        expect(raw.indices.length).toBeGreaterThan(0);
        expect(raw.indices.length % 3).toBe(0);

        // Vérification de la normalité unitaire des normales (|n| = 1.0)
        for (let i = 0; i < raw.normals.length; i += 3) {
          const nx = raw.normals[i] ?? 0;
          const ny = raw.normals[i + 1] ?? 0;
          const nz = raw.normals[i + 2] ?? 0;
          const normLen = Math.hypot(nx, ny, nz);
          expect(normLen).toBeCloseTo(1, 1);
        }
      }

      // Au moins 2 matériaux distincts sur les équipements complexes (toilettes, vasques, cuisine, canapés, baies)
      if (['toilet', 'sink', 'shower', 'kitchen_base', 'sink_unit', 'appliance', 'bed', 'sofa', 'sliding_door'].includes(ct.subType)) {
        expect(materialRoles.size).toBeGreaterThanOrEqual(2);
      }
    });
  }
});
