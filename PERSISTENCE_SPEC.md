# SPÉCIFICATION TECHNIQUE DE PERSISTANCE ET FORMAT DE DONNÉES (PERSISTENCE_SPEC)

**Projet :** Mini-BIM (`mini-Revit`)  
**Version du format :** Schema Version 2 (v2)  
**Date d'homologation :** Novembre 2026  
**Statut :** Spécification de Référence — Schéma v2 Consolidé (ADR-042, ADR-051)

---

## 1. Vue d'Ensemble et Principes Architecturaux

La persistance de Mini-BIM repose sur une séparation stricte entre **l'état architectural sémantique** et **les représentations graphiques dérivées** (ADR-001, ADR-007).

### Principes Directeurs Fondamentaux :

1. **Source de Vérité Unique et Pure :** Seules les données architecturales conceptuelles sont sérialisées.
2. **Zéro Donnée Géométrique Dérivée :** Aucun maillage 3D, liste de sommets/faces, coordonnées de texture, ou primitives Canvas 2D ne sont stockés. Toutes les géométries sont recalculées à la demande par les moteurs de rendu.
3. **Déterminisme et Égalité Bit-à-Bit (Round-Trip Idempotence) :** L'export d'un document suivi de son import immédiat et ré-export produit une chaîne JSON strictement identique caractère par caractère (`doc.toJSON(true) === importedDoc.toJSON(true)`).
4. **Migration ascendante transparente :** Tout fichier de schéma v1 est automatiquement migré en mémoire vers le schéma v2 via `migrateV1ToV2` (ADR-042).
5. **Sauvegarde automatique locale :** Gestionnaire `AutoSaveManager` persistant l'état dans IndexedDB (`mini-bim-autosave`) avec détection de salissure (ADR-051).

---

## 2. Structure du Schéma JSON (BimState v2)

Le fichier projet (extension recommandée `.mbim.json` ou `.json`) est encodé en UTF-8 et structuré comme suit :

```json
{
  "schemaVersion": 2,
  "units": "mm",
  "levels": { ... },
  "wallTypes": { ... },
  "slabTypes": { ... },
  "doorTypes": { ... },
  "windowTypes": { ... },
  "stairTypes": { ... },
  "roofTypes": { ... },
  "componentTypes": { ... },
  "walls": { ... },
  "slabs": { ... },
  "doors": { ... },
  "windows": { ... },
  "rooms": { ... },
  "dimensions": { ... },
  "stairs": { ... },
  "roofs": { ... },
  "roofOpenings": { ... },
  "components": { ... }
}
```

### 2.1 Migration v1 vers v2 (`migrateV1ToV2`)
Lorsqu'un payload contenant `"schemaVersion": 1` est détecté par `BimDocument.fromJSON` :
- Les dimensions des portes et fenêtres (anciennement stockées directement sur l'occurrence) sont extraites pour synthétiser des `DoorType` et `WindowType` dédupliqués.
- Les orientations d'ouverture `flipHand`/`flipFacing` sont converties en `swing: { side, direction }`.
- Les collections v2 manquantes (`slabs`, `stairs`, `roofs`, `components`, etc.) sont initialisées à `{}`.
- Le document résultant est estampillé `"schemaVersion": 2`.

| Champ           | Type                       | Contraintes & Règles de Validation                                                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `number` (entier)          | Doit être strictement égal à `1`. Tout entier différent déclenche `UNSUPPORTED_SCHEMA_VERSION`.                           |
| `units`         | `string`                   | Doit être strictement égal à `'mm'`. Toute autre valeur déclenche `INVALID_UNITS`.                                        |
| `levels`        | `Record<string, Level>`    | Dictionnaire d'entités de niveau. Chaque clé doit être identique au champ `id` de l'entité.                               |
| `wallTypes`     | `Record<string, WallType>` | Dictionnaire de types de murs. Chaque clé doit être identique au champ `id` de l'entité. `thickness > 0` et `height > 0`. |
| `walls`         | `Record<string, Wall>`     | Dictionnaire d'instances de murs. Chaque clé doit correspondre au champ `id`. `category === 'wall'`.                      |

---

## 3. Matrice Exhaustive des Codes d'Erreur (`BimValidationError`)

La désérialisation (`BimDocument.fromJSON` dans `serialization.ts` et `importFromFile` dans `jsonIO.ts`) applique une chaîne exhaustive de contrôles d'intégrité ordonnés, levant des exceptions typées `BimValidationError` contenant un code invariable et un message explicite :

|   N°   | Code d'Erreur Typé           |  Module Émetteur   | Condition Déclenchante                                                                          | Message d'Explication                                                               |
| :----: | ---------------------------- | :----------------: | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **1**  | `INVALID_JSON`               | `serialization.ts` | Syntaxe JSON invalide (accolades orphelines, virgule erronée, troncature).                      | `Failed to parse JSON string: <détail syntaxique>`                                  |
| **2**  | `MALFORMED_STATE`            | `serialization.ts` | Racine du document non-objet (valeur primitive, tableau ou `null`).                             | `BIM document state must be a JSON object.`                                         |
| **3**  | `UNSUPPORTED_SCHEMA_VERSION` | `serialization.ts` | `schemaVersion !== 1` (version future non rétrocompatible ou manquante).                        | `Unsupported schemaVersion: expected 1, got <v>.`                                   |
| **4**  | `INVALID_UNITS`              | `serialization.ts` | Système de mesure `units !== 'mm'` (ex. 'm', 'inch').                                           | `Unsupported measurement units: expected "mm", got "<units>".`                      |
| **5**  | `MISSING_REQUIRED_FIELDS`    | `serialization.ts` | Dictionnaire racine `levels`, `wallTypes` ou `walls` absent ou de type invalide.                | `Missing or invalid "<collection>" dictionary.`                                     |
| **6**  | `MALFORMED_LEVEL`            | `serialization.ts` | Entrée de niveau corrompue, clé $\ne$ `id`, `name` vide ou `elevation` non-finie.               | `Level dictionary key "<k>" does not match internal id "<i>"` ou champs manquants.  |
| **7**  | `MALFORMED_WALL_TYPE`        | `serialization.ts` | Type de mur invalide, clé $\ne$ `id`, `thickness <= 0` ou `height <= 0`.                        | `WallType dictionary key "<k>" does not match internal id` ou dimensions invalides. |
| **8**  | `MALFORMED_WALL`             | `serialization.ts` | Instance de mur invalide, clé $\ne$ `id`, `category !== 'wall'` ou coordonnées non-finies.      | `Wall "<id>" has non-finite start or end coordinates.`                              |
| **9**  | `UNKNOWN_WALL_TYPE`          | `serialization.ts` | Intégrité référentielle rompue : `wall.typeId` n'existe pas dans `wallTypes`.                   | `Wall "<id>" references non-existent WallType ID: "<typeId>".`                      |
| **10** | `UNKNOWN_LEVEL`              | `serialization.ts` | Intégrité référentielle rompue : `wall.levelId` n'existe pas dans `levels`.                     | `Wall "<id>" references non-existent Level ID: "<levelId>".`                        |
| **11** | `INVALID_WALL_LENGTH`        | `serialization.ts` | Longueur euclidienne du mur nulle ou inférieure au seuil numérique ($L \le 10^{-4}\text{ mm}$). | `Wall "<id>" has non-positive length (<len> mm).`                                   |
| **12** | `FILE_READ_ERROR`            |    `jsonIO.ts`     | Échec I/O navigateur lors de la lecture asynchrone du Blob/File (`file.text()`).                | `Impossible de lire le fichier: <détail système>`                                   |

---

## 4. Architecture d'Entrées / Sorties Web (`jsonIO.ts`)

Le module `apps/web/src/persistence/jsonIO.ts` isole l'infrastructure d'I/O du navigateur :

### 4.1 Export Fichier (`exportToFile`)

- Sérialise `doc` via `doc.toJSON(true)`.
- Instancie un `Blob` MIME `application/json;charset=utf-8`.
- Crée une URL d'objet éphémère via `URL.createObjectURL(blob)`.
- Injecte un élément temporaire `<a download="project.mbim.json" style="display:none">` dans le DOM.
- Déclenche programmatiquement l'événement `click()`.
- Nettoie immédiatement le lien du DOM et révoque l'URL via `URL.revokeObjectURL(url)`.

### 4.2 Import Fichier (`importFromFile`)

- Asynchrone : lit le fichier utilisateur via l'API standard `file.text()`.
- Valide et désérialise le contenu via `BimDocument.fromJSON(text)`.
- Encapsule les erreurs d'accès fichier sous le code `FILE_READ_ERROR`.
- Transmet la nouvelle instance `BimDocument` validée au callback applicatif.

---

## 5. Remplacement Documentaire et Préservation WebGL (`ADR-027`)

Lorsqu'un nouveau document est importé dans l'application :

1. **Purge des Outils & Sélections :** `activeTool.reset()`, `selectedIds = []`, `drawingLength = null`.
2. **Mise à jour Contextuelle Réactive :** Appel de `setDocument(newDoc)` sur `BimDocumentContext`.
3. **Conservation du Contexte WebGL :** Les canvas 2D et 3D ne sont **jamais démontés**. Les contrôleurs `View2D` et `Scene3D` reçoivent le nouveau document via leur méthode `setDocument(newDoc)` et exécutent un recalcul immédiat de l'affichage avec `zoomToFit(60)`.
4. **Bandeau d'Erreur Non-Bloquant :** En cas d'échec d'import (fichier corrompu ou incompatibilité), un composant `<aside data-testid="error-banner">` affiche l'erreur en rouge sans perturber le projet actif en cours.
