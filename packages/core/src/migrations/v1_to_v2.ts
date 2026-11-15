import {
  type BimState,
  type V1BimState,
  type Door,
  type Window,
  type DoorType,
  type WindowType,
  type SlabType,
  type Wall,
  type ElementId,
} from '../types.js';
import { BimValidationError } from '../rules.js';

/**
 * Migre un état documentaire V1 (ou schéma non versionné) vers le schéma V2 normalisé.
 *
 * Invariants architecturaux garantis (ADR-043 / ADR-045) :
 * 1. Zéro perte dimensionnelle : synthèse déterministe de familles (DoorType / WindowType)
 *    regroupant les instances aux cotes identiques.
 * 2. Préservation intégrale du volume de parois et réservations (à 1e-6 mm³ près).
 * 3. Mode automatique de hauteur de mur préservé par défaut (heightOverride n'est posé
 *    que si un niveau supérieur existe avec un écart différent de wallType.height).
 * 4. Rejet strict (Fail-Fast) sur données d'ouvertures malformées (MALFORMED_DOOR / MALFORMED_WINDOW).
 */
export function migrateSchemaV1toV2(v1State: V1BimState | BimState): BimState {
  if (!v1State || typeof v1State !== 'object') {
    throw new BimValidationError(
      'INVALID_DATA',
      'Impossible de migrer : état documentaire invalide ou null.',
    );
  }

  // Si le document est déjà en schéma v2, valider et retourner directement
  if (v1State.schemaVersion === 2) {
    const s2 = v1State as BimState;
    if (!s2.slabTypes || !s2.doorTypes || !s2.windowTypes || !s2.slabs) {
      throw new BimValidationError(
        'INVALID_SCHEMA_V2',
        'Document marqué schéma v2 mais incomplet (tables de types manquantes).',
      );
    }
    return s2;
  }

  // Validation des dictionnaires minimaux requis d'un document V1
  if (!v1State.levels || typeof v1State.levels !== 'object' || Array.isArray(v1State.levels)) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "levels" dictionary in v1 state.',
    );
  }
  if (
    !v1State.wallTypes ||
    typeof v1State.wallTypes !== 'object' ||
    Array.isArray(v1State.wallTypes)
  ) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "wallTypes" dictionary in v1 state.',
    );
  }
  if (!v1State.walls || typeof v1State.walls !== 'object' || Array.isArray(v1State.walls)) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "walls" dictionary in v1 state.',
    );
  }

  // 1. Initialiser le SlabType par défaut
  const defaultSlabType: SlabType = {
    id: 'default-slab-type',
    name: 'Dalle BA 200mm',
    thickness: 200,
  };
  const slabTypes: Record<ElementId, SlabType> = {
    [defaultSlabType.id]: defaultSlabType,
  };

  // 2. Extraire et synthétiser les familles de portes (DoorType)
  const doorTypes: Record<ElementId, DoorType> = {};
  const doorTypeMap = new Map<string, ElementId>(); // "w_h" -> doorTypeId
  const doors: Record<ElementId, Door> = {};

  if (v1State.doors) {
    for (const [doorId, rawDoor] of Object.entries(v1State.doors)) {
      const w = (rawDoor as { width?: number }).width;
      const h = (rawDoor as { height?: number }).height;

      if (w === undefined || typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
        throw new BimValidationError(
          'MALFORMED_DOOR',
          `Porte "${doorId}" invalide dans le fichier v1 : largeur incorrecte (${w}).`,
          { offendingIds: [doorId] },
        );
      }
      if (h === undefined || typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
        throw new BimValidationError(
          'MALFORMED_DOOR',
          `Porte "${doorId}" invalide dans le fichier v1 : hauteur incorrecte (${h}).`,
          { offendingIds: [doorId] },
        );
      }

      const key = `${w}_${h}`;
      let typeId = doorTypeMap.get(key);
      if (!typeId) {
        typeId = `door-type-${w}x${h}`;
        doorTypeMap.set(key, typeId);
        doorTypes[typeId] = {
          id: typeId,
          name: `Porte ${w}×${h} mm`,
          width: w,
          height: h,
        };
      }

      doors[doorId] = {
        id: rawDoor.id,
        category: 'door',
        ...(rawDoor.kind ? { kind: 'door' as const } : {}),
        doorTypeId: typeId,
        hostWallId: rawDoor.hostWallId,
        offsetAlong: rawDoor.offsetAlong,
        swing: rawDoor.swing,
      };
    }
  }

  // 3. Extraire et synthétiser les familles de fenêtres (WindowType)
  const windowTypes: Record<ElementId, WindowType> = {};
  const windowTypeMap = new Map<string, ElementId>(); // "w_h_sill" -> windowTypeId
  const windows: Record<ElementId, Window> = {};

  if (v1State.windows) {
    for (const [winId, rawWin] of Object.entries(v1State.windows)) {
      const w = (rawWin as { width?: number }).width;
      const h = (rawWin as { height?: number }).height;
      const sill = rawWin.sillHeight ?? 900;

      if (w === undefined || typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
        throw new BimValidationError(
          'MALFORMED_WINDOW',
          `Fenêtre "${winId}" invalide dans le fichier v1 : largeur incorrecte (${w}).`,
          { offendingIds: [winId] },
        );
      }
      if (h === undefined || typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
        throw new BimValidationError(
          'MALFORMED_WINDOW',
          `Fenêtre "${winId}" invalide dans le fichier v1 : hauteur incorrecte (${h}).`,
          { offendingIds: [winId] },
        );
      }

      const key = `${w}_${h}_${sill}`;
      let typeId = windowTypeMap.get(key);
      if (!typeId) {
        typeId = `window-type-${w}x${h}-s${sill}`;
        windowTypeMap.set(key, typeId);
        windowTypes[typeId] = {
          id: typeId,
          name: `Fenêtre ${w}×${h} mm`,
          width: w,
          height: h,
          defaultSillHeight: sill,
        };
      }

      windows[winId] = {
        id: rawWin.id,
        category: 'window',
        ...(rawWin.kind ? { kind: 'window' as const } : {}),
        windowTypeId: typeId,
        hostWallId: rawWin.hostWallId,
        offsetAlong: rawWin.offsetAlong,
        sillHeight: sill,
      };
    }
  }

  // 4. Murs : gestion conditionnelle de heightOverride (ADR-043 §2 / ADR-045 D3)
  const sortedLevels = Object.values(v1State.levels || {}).sort(
    (a, b) => a.elevation - b.elevation,
  );

  const walls: Record<ElementId, Wall> = {};
  if (v1State.walls) {
    for (const [wallId, rawWall] of Object.entries(v1State.walls)) {
      const currentLevel = v1State.levels?.[rawWall.levelId];
      const wallType = v1State.wallTypes?.[rawWall.typeId];

      let effectiveHeightOverride = rawWall.heightOverride;

      if (effectiveHeightOverride === undefined && currentLevel && wallType) {
        // Chercher le niveau immédiatement supérieur
        const higherLevels = sortedLevels.filter((lvl) => lvl.elevation > currentLevel.elevation);
        if (higherLevels.length > 0) {
          const nextLevel = higherLevels[0]!;
          const gap = nextLevel.elevation - currentLevel.elevation;
          // Si l'écart altimétrique diffère de la hauteur nominale du type, figer la hauteur
          if (gap !== wallType.height) {
            effectiveHeightOverride = wallType.height;
          }
        }
      }

      walls[wallId] = {
        ...rawWall,
        ...(effectiveHeightOverride !== undefined
          ? { heightOverride: effectiveHeightOverride }
          : {}),
      };
    }
  }

  return {
    schemaVersion: 2,
    units: v1State.units || 'mm',
    levels: { ...(v1State.levels || {}) },
    wallTypes: { ...(v1State.wallTypes || {}) },
    slabTypes,
    doorTypes,
    windowTypes,
    walls,
    slabs: {},
    doors,
    windows,
    rooms: { ...(v1State.rooms || {}) },
    dimensions: { ...(v1State.dimensions || {}) },
  };
}
