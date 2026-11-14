# SPÉCIFICATION TECHNIQUE DE PERSISTANCE ET FORMAT DE DONNÉES (PERSISTENCE_SPEC)

**Projet :** Mini-BIM (Solo Architecture Guide)  
**Version du format :** Schema Version 1 (v1)  
**Date d'homologation :** 14 novembre 2026  
**Statut :** Spécification de Référence — Phase 2.4

---

## 1. Vue d'Ensemble et Principes Architecturaux

La persistance de Mini-BIM repose sur une séparation stricte entre **l'état architectural sémantique** et **les représentations graphiques dérivées** (ADR-001, ADR-007).

### Principes Directeurs Fondamentaux :

1. **Source de Vérité Unique et Pure :** Seules les données architecturales conceptuelles (niveaux, types de murs, instances de murs et leurs connexions sémantiques) sont sérialisées.
2. **Zéro Donnée Géométrique Dérivée :** Aucun maillage 3D, liste de sommets/faces, coordonnées de texture, ou primitives Canvas 2D ne sont stockés dans le fichier de projet. Toutes les géométries sont recalculées à la demande par le moteur lors du chargement.
3. **Déterminisme et Égalité Bit-à-Bit (Round-Trip Idempotence) :** L'export d'un document suivi de son import immédiat et ré-export produit une chaîne JSON strictement identique caractère par caractère (`doc.toJSON(true) === importedDoc.toJSON(true)`).
4. **Validation Stricte et Isolation des Pannes :** Tout fichier malformé ou incohérent est rejeté dès la phase de parsing avec une exception typée `BimValidationError`, préservant intact le projet en cours de modification dans l'application.

---

## 2. Structure du Schéma JSON (BimState v1)

Le fichier projet (extension recommandée `.mbim.json` ou `.json`) est encodé en UTF-8 et structuré comme suit :

```json
{
  "schemaVersion": 1,
  "units": "mm",
  "levels": {
    "01JB0000000000000000000001": {
      "id": "01JB0000000000000000000001",
      "name": "Niveau 0 (RDC)",
      "elevation": 0
    }
  },
  "wallTypes": {
    "01JB0000000000000000000002": {
      "id": "01JB0000000000000000000002",
      "name": "Générique - 200mm",
      "thickness": 200,
      "height": 2800
    }
  },
  "walls": {
    "01JB0000000000000000000003": {
      "id": "01JB0000000000000000000003",
      "category": "wall",
      "typeId": "01JB0000000000000000000002",
      "levelId": "01JB0000000000000000000001",
      "start": { "x": 0, "y": 0 },
      "end": { "x": 6000, "y": 0 }
    }
  }
}
```

### Spécification des Champs :

| Champ           | Type                       | Contraintes & Règles de Validation                                                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `number` (entier)          | Doit être strictement égal à `1`. Tout entier différent déclenche `UNSUPPORTED_SCHEMA_VERSION`.                           |
| `units`         | `string`                   | Doit être strictement égal à `'mm'`. Toute autre valeur déclenche `INVALID_UNITS`.                                        |
| `levels`        | `Record<string, Level>`    | Dictionnaire d'entités de niveau. Chaque clé doit être identique au champ `id` de l'entité.                               |
| `wallTypes`     | `Record<string, WallType>` | Dictionnaire de types de murs. Chaque clé doit être identique au champ `id` de l'entité. `thickness > 0` et `height > 0`. |
| `walls`         | `Record<string, Wall>`     | Dictionnaire d'instances de murs. Chaque clé doit correspondre au champ `id`. `category === 'wall'`.                      |

---

## 3. Matrice de Validation et Codes d'Erreur (`BimValidationError`)

La méthode `BimDocument.fromJSON(jsonString)` applique une suite exhaustive de vérifications ordonnées :

| Étape de Contrôle                    | Condition de Rejet                                                 | Code d'Erreur Typé           | Message d'Explication                                         |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| **1. Parsing JSON Syntaxique**       | Syntaxe JSON invalide (accolades non fermées, virgules orphelines) | `INVALID_JSON`               | `Failed to parse JSON string: <détail>`                       |
| **2. Structure Racine**              | Payload non-objet, tableau ou `null`                               | `INVALID_PAYLOAD`            | `Serialized payload must be a non-null object.`               |
| **3. Version de Schéma**             | `schemaVersion !== 1`                                              | `UNSUPPORTED_SCHEMA_VERSION` | `Unsupported schema version: <v>. Supported: 1.`              |
| **4. Système d'Unités**              | `units !== 'mm'`                                                   | `INVALID_UNITS`              | `Unsupported units: "<units>". Only "mm" is supported.`       |
| **5. Dictionnaires Requis**          | Clés `levels`, `wallTypes` ou `walls` absentes ou non-objets       | `MISSING_COLLECTION`         | `Payload missing required collections.`                       |
| **6. Clés de Dictionnaire**          | Clé du dictionnaire $\ne$ `element.id`                             | `ID_MISMATCH`                | `Dictionary key "<k>" does not match entity id "<i>".`        |
| **7. Intégrité Référentielle Level** | `wall.levelId` absent de `levels`                                  | `UNKNOWN_LEVEL`              | `Wall "<id>" refers to non-existent Level ID: "<levelId>".`   |
| **8. Intégrité Référentielle Type**  | `wall.typeId` absent de `wallTypes`                                | `UNKNOWN_WALL_TYPE`          | `Wall "<id>" refers to non-existent WallType ID: "<typeId>".` |
| **9. Validité Géométrique Mur**      | Coordonnées non-finies ($NaN$, $\pm\infty$) ou longueur $L = 0$    | `INVALID_WALL_GEOMETRY`      | `Wall has zero length or invalid coordinates.`                |

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
