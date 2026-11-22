# Spécification Technique : Export IFC4 (ISO 10303-21 STEP) — Tabax

**Statut :** Spécification de Référence  
**Date de Révision :** 2026-11-22 (Saison 3 - Étape 6 Volet B / ADR-071)  
**Package d'implémentation :** `@tabax/core` (`packages/core/src/ifc/`)

---

## 1. Objectifs et Norme Industrielle

Tabax implémente un exportateur IFC4 natif pur TypeScript conforme à la norme internationale **ISO 10303-21** (STEP Physical File format) et au schéma officiel **IFC4 (Industry Foundation Classes 4)** de buildingSMART.

### Principes Directeurs

1. **Local-First & Zéro Dépendance Lourde :** L'exportateur ne nécessite aucun binaire externe, aucun environnement Python et aucun module WebAssembly à l'écriture. Il s'exécute directement dans le navigateur ou dans Node.js.
2. **Qualité de Modélisation Solide & Fidélité 3D :**
   - Murs extrudés (`IfcExtrudedAreaSolid`) avec pignons biseautés sous toiture.
   - Réservations découpées via entités explicites (`IfcOpeningElement`, `IfcRelVoidsElement`).
   - Versants de toiture 3D inclinés avec normale spatiale orthogonale $N$ (`IfcAxis2Placement3D`).
   - Escaliers crénelés paramétriques avec profil complet marches/girons/paillasse (`IfcStairFlight`).
   - Réseaux techniques MEP natifs (`IfcPipeSegment`, `IfcDuctSegment`, `IfcCableCarrierSegment`, `IfcDistributionSystem`).
3. **Hiérarchie Spatiale Réglementaire :** Le fichier organise strictement les données de la racine jusqu'aux composants de détail :
   $$\text{IfcProject} \longrightarrow \text{IfcSite} \longrightarrow \text{IfcBuilding} \longrightarrow \text{IfcBuildingStorey} \longrightarrow \text{Elements}$$
4. **Déterminisme Binaire Absolu (ADR-071) :** Deux exports successifs d'un même état BIM produisent des fichiers IFC strictement identiques bit-à-bit (`ifc1 === ifc2`).

---

## 2. Dictionnaire des Classes et Relations IFC4

| Entité IFC4 | Rôle Métier | Implémentation Tabax |
| :--- | :--- | :--- |
| `IfcProject` | Racine du projet | Nom du projet, contexte géométrique 3D, unités métriques normalisées |
| `IfcSite` | Terrain / Emplacement | Site par défaut rattaché au projet via `IfcRelAggregates` |
| `IfcBuilding` | Bâtiment principal | Bâtiment rattaché au site |
| `IfcBuildingStorey` | Étage / Niveau architectural | Un étage par `Level` de `state.levels` (élévation en Z) |
| `IfcWall` | Mur porteur ou cloison | Géométrie extrudée avec profil fermé (`IfcArbitraryClosedProfileDef`) |
| `IfcSlab` | Dalle horizontale / Versant de toit | Plancher structurel (`.FLOOR.`) ou versant de toiture (`.ROOF.`) |
| `IfcOpeningElement` | Réservation / Baie / Trémie | Volume de vide géométrique englobant largeur, hauteur et épaisseur |
| `IfcRelVoidsElement` | Relation Mur/Dalle $\leftrightarrow$ Réservation | Déclare formellement le perçage de l'élément hôte |
| `IfcDoor` | Porte architecturale | Menuiserie hébergée, dimensions, type de ferrage |
| `IfcWindow` | Fenêtre architecturale | Châssis vitré hébergé, dimensions, hauteur d'allège |
| `IfcRelFillsElement` | Relation Réservation $\leftrightarrow$ Menuiserie | Déclare que la porte/fenêtre remplit la réservation |
| `IfcRoof` | Conteneur de toiture | Toiture à versants (`.GABLE_ROOF.`) ou terrasse (`.FLAT_ROOF.`) |
| `IfcStair` | Conteneur d'escalier | Escalier droit (`.STRAIGHT_RUN_STAIR.`) |
| `IfcStairFlight` | Volée d'escalier crénelée | Profil crémaillère $(u, z)$, contremarches, girons, paillasse |
| `IfcSpace` | Pièce / Espace intérieur | Volume basé sur le polygone détecté, hauteur sous plafond |
| `IfcPipeSegment` | Tuyauterie hydraulique | Tronçon rigide (`.RIGIDSEGMENT.`) avec `IfcCircleProfileDef` |
| `IfcDuctSegment` | Gaine aéraulique | Tronçon rigide (`.RIGIDSEGMENT.`) circulaire ou rectangulaire |
| `IfcCableCarrierSegment`| Chemin de câbles électrique | Profil en auge rectangulaire (`.CABLETRAYSEGMENT.`) |
| `IfcPipeFitting` | Raccord de plomberie | Coude, té, réduction, vanne hydraulique |
| `IfcDuctFitting` | Raccord aéraulique | Coude, dérivation, boîte de détente |
| `IfcCableCarrierFitting`| Raccord chemin de câbles | Coude ou jonction de chemin de câbles |
| `IfcDistributionFlowElement` | Équipement technique | Chaudière, CTA, pompe, armoire technique |
| `IfcDistributionSystem` | Système / Réseau technique | Regroupement logique fluide (`domestic_cold_water`, `supply_air`...) |
| `IfcRelAssignsToGroup` | Rattachement au système | Associe les tronçons et équipements à leur réseau |
| `IfcElementQuantity` | Jeu de quantités normalisé | `Qto_WallBaseQuantities`, `Qto_SlabBaseQuantities`, `Qto_SpaceBaseQuantities` |
| `IfcPropertySet` | Propriétés standardisées | `Pset_WallCommon`, `Pset_DoorCommon`, `Pset_WindowCommon` |
| `IfcRelDefinesByProperties` | Relation Élément $\leftrightarrow$ Pset/Qto | Attache les métrés et propriétés aux entités |
| `IfcRelAggregates` | Agrégation structurelle | Lie Project $\to$ Site $\to$ Building $\to$ Storeys, Roof $\to$ Slabs, Stair $\to$ Flight |
| `IfcRelContainedInSpatialStructure` | Rattachement d'étage | Associe les éléments physiques à leur niveau constructif |

---

## 3. Déterminisme des GUIDs & Échappement STEP ISO 10303-21 (ADR-071)

### Déterminisme Absolu des GUIDs

Tous les `GlobalId` de 22 caractères sont dérivés de manière 100% déterministe via un hachage stable 128-bit sans aucun `Math.random()` :
- Préfixe de rôle fonctionnel (ex: `wall:${id}`, `pipe:${id}`, `roof-slab:${roofId}:${slopeIndex}`).
- Transcodage conforme buildingSMART vers l'alphabet compact 64 caractères (`0-9A-Za-z_$`).
- Deux exports consécutifs du même état produisent des fichiers STEP strictement identiques au bit près.

### Échappement STEP ISO 10303-21

La sérialisation respecte strictement la norme ISO 10303-21 :
- Préservation directe des caractères ASCII imprimables 32 à 126 (hors `'` et `\`).
- Doublement systématique des apostrophes (`''`) et backslashes (`\\`).
- Encodage des caractères accentués et Unicode en séquences hexadécimales UTF-16 double-octet :
  $$\text{"Rez-de-chaussée"} \longrightarrow \text{'Rez-de-chauss\X2\00E9\X0\e'}$$
  $$\text{"Étage R+1"} \longrightarrow \text{'\X2\00C9\X0\tage R+1'}$$

---

## 4. Géométrie 3D des Versants de Toit et Escaliers Crénelés

### Toitures Inclinées (`IfcRoof` + `IfcSlab.ROOF.`)
Chaque versant de toiture calculé par `computeRoofSlopes` dispose de son propre repère tridimensionnel `IfcAxis2Placement3D` :
- `Axis = Normal (N)` : vecteur unitaire orthogonal au pan $(n_x, n_y, n_z)$ avec $n_z = \cos(\text{pente}) < 1$.
- `RefDirection = U` : vecteur unitaire horizontal le long de la ligne de faîtage / égout.
- Extrusion orthogonale exacte le long de $N$ sur l'épaisseur constructive `thickness` (extrusion solide `IfcExtrudedAreaSolid`).

### Escaliers Crénelés (`IfcStair` + `IfcStairFlight`)
Chaque volée droite est exportée avec son profil longitudinal réel en crémaillère $(u, z)$ :
- Contremarches verticales $h$, girons horizontaux $g$ et paillasse inclinée en sous-face.
- Extrusion latérale sur la largeur nominale $W$ de la volée.
- Renseignement direct des attributs IFC4 : `NumberOfRiser`, `NumberOfTreads`, `RiserHeight`, `TreadLength`.
- Découpage automatique des trémies de dalles d'étage (`computeStairShaft`) dans `IfcArbitraryProfileDefWithVoids`.

---

## 5. Validation Industrielle

Tabax valide systématiquement la conformité de ses exports IFC4 via le moteur officiel buildingSMART / WebAssembly **`web-ifc` (C++/WASM)** :
- Validation de la hiérarchie spatiale et relations d'agrégation.
- Validation des profils arbitraires avec trémies (`IfcArbitraryProfileDefWithVoids`).
- Validation des représentations solides SweptSolid des réseaux MEP.
- Validation de la géométrie inclinée 3D des toitures et des marches crénelées.
