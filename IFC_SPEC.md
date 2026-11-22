# Spécification Technique : Export IFC4 (ISO 10303-21 STEP) — Mini-BIM

**Statut :** Spécification de Référence  
**Date :** 2026-11-14  
**Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)  
**Package d'implémentation :** `@tabax/core` (`packages/core/src/ifc/`)

---

## 1. Objectifs et Norme Industrielle

Mini-BIM implémente un exportateur IFC natif pur TypeScript conforme à la norme internationale **ISO 10303-21** (STEP Physical File format) et au schéma officiel **IFC4 (Industry Foundation Classes 4)** de buildingSMART.

### Principes Directeurs

1. **Local-First & Zero-Setup :** L'exportateur ne nécessite aucun binaire externe, aucun environnement Python et aucun module WebAssembly. Il s'exécute directement dans le navigateur ou dans Node.js.
2. **Qualité de Modélisation Solide :** Les murs sont représentés par des solides extrudés (`IfcExtrudedAreaSolid`), et les réservations sont découpées via des entités d'ouverture explicites (`IfcOpeningElement`).
3. **Hiérarchie Spatiale Réglementaire :** Le fichier organise strictement les données de la racine jusqu'aux composants de détail :
   $$\text{IfcProject} \longrightarrow \text{IfcSite} \longrightarrow \text{IfcBuilding} \longrightarrow \text{IfcBuildingStorey} \longrightarrow \text{Elements}$$

---

## 2. Dictionnaire des Classes et Relations IFC4

| Entité IFC4                         | Rôle Architectural                                | Implémentation Mini-BIM                                                                        |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `IfcProject`                        | Racine du projet                                  | Nom du projet, contexte géométrique 3D, système d'unités                                       |
| `IfcSite`                           | Terrain / Emplacement                             | Site par défaut rattaché au projet via `IfcRelAggregates`                                      |
| `IfcBuilding`                       | Bâtiment principal                                | Bâtiment rattaché au site                                                                      |
| `IfcBuildingStorey`                 | Étage / Niveau architectural                      | Un étage par `Level` de `state.levels` (élévation en Z)                                        |
| `IfcWall`                           | Mur architectural porteur ou séparatif            | Géométrie extrudée avec profil fermé (`IfcArbitraryClosedProfileDef`)                          |
| `IfcSlab`                           | Dalle structurelle / Plancher horizontal          | Solide extrudé ou profil avec trémies (`IfcArbitraryProfileDefWithVoids`), prédéfini `.FLOOR.` |
| `IfcOpeningElement`                 | Réservation / Trémie pour baie                    | Volume de vide géométrique englobant la largeur, hauteur et épaisseur                          |
| `IfcRelVoidsElement`                | Relation Mur $\leftrightarrow$ Réservation        | Déclare formellement le perçage du mur hôte                                                    |
| `IfcDoor`                           | Porte architecturale battante                     | Menuiserie hébergée, dimensions, type de ferrage (`SINGLE_SWING`)                              |
| `IfcWindow`                         | Fenêtre architecturale                            | Châssis vitré hébergé, dimensions, hauteur d'allège                                            |
| `IfcRelFillsElement`                | Relation Réservation $\leftrightarrow$ Menuiserie | Déclare que la porte/fenêtre remplit la réservation                                            |
| `IfcSpace`                          | Pièce / Espace intérieur                          | Espace 3D basé sur le polygone détecté, hauteur de niveau                                      |
| `IfcQuantityArea`                   | Quantité de surface                               | `NetFloorArea` (surface utile nette en m²)                                                     |
| `IfcQuantityVolume`                 | Quantité de volume                                | `NetVolume` (volume utile en m³)                                                               |
| `IfcElementQuantity`                | Jeu de quantités d'espace                         | `Qto_SpaceBaseQuantities`                                                                      |
| `IfcRelDefinesByProperties`         | Relation Espace $\leftrightarrow$ Quantités       | Rapproche les métrés certifiés à l'entité `IfcSpace`                                           |
| `IfcRelContainedInSpatialStructure` | Rattachement d'étage                              | Associe murs et espaces à leur `IfcBuildingStorey` respectif                                   |

---

## 3. Structure d'un Fichier Exporté

Un fichier généré par Mini-BIM est structuré comme suit :

```step
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('mini-bim-model.ifc','2026-11-14T22:30:00Z',('Mini-BIM Architect'),('Mini-BIM Team'),'Mini-BIM IFC4 Generator','Mini-BIM','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPERSON($,'Mini-BIM Architect',$,$,$,$,$,$);
#2=IFCORGANIZATION($,'Mini-BIM Team',$,$,$);
#3=IFCPERSONANDORGANIZATION(#1,#2,$);
#4=IFCAPPLICATION(#2,'1.0.0','Mini-BIM','mini-bim');
#5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1763160000);
#6=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#7=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#9=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#10=IFCUNITASSIGNMENT((#6,#7,#8,#9));
...
#100=IFCWALL('2O2Fr$t95BwnAdNVERRW$w',#5,'wall_south',$,'Wall',#50,#90,$,$);
#101=IFCOPENINGELEMENT('3K3Gr$u84AxnBeMUDSSX$x',#5,'Opening_door_demo',$,$,#60,#95,$,.OPENING.);
#102=IFCRELVOIDSELEMENT('1A1Ar$t95BwnAdNVERRW$1',#5,$,$,#100,#101);
#103=IFCDOOR('4L4Hr$v95BwnAdNVERRW$y',#5,'door_demo',$,'Door',#60,#95,$,2100.00,900.00,.DOOR.,.SINGLE_SWING_RIGHT.,$);
#104=IFCRELFILLSELEMENT('2B2Br$t95BwnAdNVERRW$2',#5,$,$,#101,#103);
#105=IFCSLAB('5M5Ir$w95BwnAdNVERRW$z',#5,'slab_demo_ground',$,'Slab',#70,#110,$,.FLOOR.);
#106=IFCROOF('6N6Jr$x95BwnAdNVERRW$a',#5,'roof_main',$,'Roof',#80,#120,$,.GABLE_ROOF.);
#107=IFCSLAB('7O7Kr$y95BwnAdNVERRW$b',#5,'roof_main_slope_1',$,'Roof Slope 1',#82,#122,$,.ROOF.);
#108=IFCSLAB('8P8Lr$z95BwnAdNVERRW$c',#5,'roof_main_slope_2',$,'Roof Slope 2',#84,#124,$,.ROOF.);
#109=IFCRELAGGREGATES('9Q9Mr$095BwnAdNVERRW$d',#5,$,$,#106,(#107,#108));
#110=IFCRELCONTAINEDINSPATIALSTRUCTURE('0R0Nr$195BwnAdNVERRW$e',#5,$,$,(#106),#40);
...
ENDSEC;
END-ISO-10303-21;
```

---

## 4. Spécification Toitures IFC4 (`IFCROOF` — Phase 7 / ADR-053)

Conformément à la norme ISO 16739 :
1. **Entité conteneur spatial :**
   `IFCROOF` instanciée avec `PredefinedType = .GABLE_ROOF.` (toiture 2 pans) ou `.FLAT_ROOF.` (toiture terrasse).
2. **Décomposition en versants (`IFCSLAB`) :**
   Chaque versant de toiture inclinée est exporté sous forme d'un solide extrudé `IFCSLAB` avec `PredefinedType = .ROOF.`.
3. **Relations d'agrégation et de confinement :**
   - `IFCRELAGGREGATES` lie l'`IFCROOF` conteneur aux versants `IFCSLAB` composants.
   - `IFCRELCONTAINEDINSPATIALSTRUCTURE` rattache l'`IFCROOF` au niveau `IFCBUILDINGSTOREY` correspondant.

---

## 5. Validation et Compatibilité

L'export IFC a été validé selon les critères :

- Validité syntaxique ISO 10303-21 (délimiteurs de blocs `HEADER`, `DATA`, `ENDSEC`, points-virgules finaux, format des réels).
- GUIDs de 22 caractères encodés selon la table de conversion standard `0-9A-Za-z_$`.
- Conformité de chargement sous le parser standard `web-ifc` (`T-IFC-ROOF-01..04`).


> [!NOTE]
> **Déterminisme des GUIDs IFC (Note Phase 6) :**
> Les GUIDs IFC sont générés de manière aléatoire et unique à chaque export (`Math.random()`). Ils ne sont pas stables entre deux exports consécutifs. Pour un futur round-trip stable (import/re-export IFC), il conviendra de dériver le GUID de l'identifiant interne de l'élément (via un hash déterministe ou compression d'un UUID déterministe). À implémenter lors de l'introduction de l'import IFC.
