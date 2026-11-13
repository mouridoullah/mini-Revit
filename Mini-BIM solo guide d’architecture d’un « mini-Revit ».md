# Mini-BIM solo : guide d’architecture d’un « mini-Revit »

_Guide technique pragmatique — TypeScript · React · Three.js · SQLite/PostgreSQL_

**Idée directrice.** Un logiciel BIM n’est pas un logiciel de dessin 3D : c’est une **base de données d’objets paramétriques** (murs, portes, pièces…) dont la **géométrie est dérivée** des paramètres, et dont les **vues** (plan, 3D, coupe, tableaux) sont des projections du même modèle. Si tu ne retiens qu’une chose : _le modèle est la source de vérité, la géométrie n’est qu’un cache_. Tout ce guide en découle.

## 1. Vision produit

### 1.1 Le plus petit « mini-Revit » crédible

**Périmètre : un éditeur de maison individuelle R+1 (murs droits), dans le navigateur, local-first.** Concrètement :

- **Niveaux** (RDC, R+1, toiture) avec altitudes modifiables
- **Murs paramétriques** : axe (2 points), épaisseur, hauteur, type (composition en couches), jonctions propres
- **Ouvertures hébergées** : portes et fenêtres attachées à un mur, qui le découpent
- **Dalles** et **toit** simple (2 pans, ou toit plat)
- **Pièces** détectées automatiquement (nom, surface, périmètre)
- **Deux vues synchronisées** : plan 2D éditable + vue 3D orbitale
- **Tableau de quantités** en direct (surfaces de murs, ouvertures, pièces, volumes)
- **Undo/redo**, sauvegarde locale, export JSON et IFC minimal

**Test de crédibilité** : je déplace un mur dans le plan → la porte qu’il porte suit, les murs voisins se raccordent, la pièce se recalcule, le tableau des surfaces change, la 3D se met à jour, le tout en moins de 50 ms. Cette _propagation paramétrique_ est l’essence du BIM. Sans elle, tu as un SketchUp au rabais.

**Critique.** Ne commence surtout pas par un « modeleur 3D libre » (extruder des volumes à la souris). C’est la pente naturelle du développeur solo, et c’est la voie du jouet : sans sémantique (mur, pièce, niveau), il n’y a ni métrés, ni IFC, ni pièces automatiques.

### 1.2 Ce qui donne immédiatement l’impression d’un vrai logiciel BIM

1. **Jonctions de murs propres** (angles en onglet, T et croix résolus) : rien ne trahit un amateur comme des murs qui se chevauchent.
2. **Portes et fenêtres qui découpent réellement le mur** et le suivent quand on le déplace.
3. **Plan 2D + 3D synchronisés** sur le même modèle, avec sélection partagée.
4. **Pièces automatiques** avec surface affichée au centre de chaque pièce.
5. **Tableau de métrés** qui se met à jour en direct.
6. **Panneau de propriétés Type / Instance** : modifier le _type_ « Cloison 70 » change tous les murs de ce type.
7. **Niveaux** : changer l’altitude du R+1 déplace tout ce qui y est rattaché.
8. **Coupe dynamique (section box)** pour « ouvrir » le bâtiment.
9. **Undo/redo irréprochable** et sélection avec accrochages (snapping) fluides.
10. **Rendu soigné** : arêtes noires fines, ombres douces, matériaux sobres. 70 % de l’effet « pro » vient du look, pas de la géométrie.

### 1.3 À exclure au début

| À exclure                                | Pourquoi                                                              | Alternative réaliste                                                            |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Éditeur de familles complet              | Revient à écrire un second logiciel (esquisse paramétrique + solveur) | Types codés en TypeScript : schéma de paramètres + fonction `generate(params)`  |
| Solveur de contraintes général           | Projet de recherche (D-Cubed existe pour cette raison)                | Contraintes ciblées codées en dur (hébergement, attache au niveau, accrochages) |
| Murs courbes, formes libres, NURBS       | Booléens B-rep, tolérances, robustesse : cauchemar                    | Murs droits d’abord ; arcs approximés en segments en V1                         |
| MEP, structure, calcul thermique         | Domaines entiers, chacun un produit                                   | Catégories « générique » ; métrés seulement                                     |
| Collaboration temps réel                 | Conflits, verrouillage, historique distribué                          | Local-first, export/import de projets, journal d’opérations préparé             |
| Import IFC/DWG/RVT                       | Formats immenses, cas limites infinis                                 | Export IFC minimal ; import via `web-ifc` en V1 si utile                        |
| Cotation automatique, hachures complexes | Beaucoup de règles de dessin                                          | Cotes manuelles simples en SVG                                                  |
| Plugins / API publique                   | Fige ton modèle trop tôt                                              | Interne d’abord ; stabiliser le schéma avant d’ouvrir                           |
| Rendu photoréaliste                      | Hors sujet                                                            | Three.js standard + ombres + SSAO                                               |

## 2. Décomposition de Revit

Revit représente des millions de lignes de code sur 20 ans. Ce qui compte pour toi : comprendre **quelles couches existent** et **quelle version minimale** de chacune est réaliste. Pour chaque sous-système : rôle, complexité (de 1 à 5, _version complète_ → _version solo_), dépendances et moment idéal.

### 2.1 Moteur géométrique

**Rôle.** Opérations sur formes : extrusion, offset de polygones, intersections, booléens (soustraire une ouverture d’un mur), triangulation, mesures. Revit utilise un noyau B-rep industriel (courbes et surfaces exactes, tolérances).

**Complexité** : 5 → 2. Si tu te limites à des **polygones 2D + extrusions verticales**, c’est faisable. Le B-rep généraliste est hors de portée.

**Dépend de** : rien (fondation). **Quand** : minimal dès le jour 1. Ne réécris jamais toi-même les booléens polygonaux : utilise Clipper2 (WASM), `earcut` pour trianguler, et `manifold-3d` (WASM) si un jour tu veux des booléens 3D robustes.

### 2.2 Modèle de données BIM

**Rôle.** Éléments typés (catégorie, type, instance), paramètres, relations (hôte, niveau, limites de pièce), identifiants stables, historique. C’est le **vrai cœur** du logiciel.

**Complexité** : 4 → 3. Le volume est faible, mais les erreurs de conception coûtent très cher plus tard.

**Dépend de** : rien ; tout dépend de lui. **Quand** : jour 1, et sois méticuleux. Sépare dès le départ _Type_ et _Instance_, utilise des IDs stables (ULID/UUID), des unités uniques (mm), et des relations explicites.

### 2.3 Rendu 3D

**Rôle.** Afficher les éléments, sélection (picking), caméras, arêtes, ombres, coupes, performances.

**Complexité** : 3 → 2 (3 si tu vises 10 000 murs). **Dépend de** : géométrie dérivée. **Quand** : jour 1-2. Three.js suffit largement. Le look « architectural » vient des arêtes (`EdgesGeometry`) et d’un éclairage hémisphérique + une lumière directionnelle.

### 2.4 Gestion des contraintes

**Rôle.** Relations qui survivent aux modifications : porte à X mm du bord du mur, mur attaché à un niveau, alignement, égalité, verrouillage, cotes pilotantes. Revit combine hébergement, contraintes d’esquisse et un solveur.

**Complexité** : 5 → 2. **Dépend de** : modèle + graphe de régénération. **Quand** : après le MVP 2 semaines. **Piège** : ne pars jamais sur un solveur de contraintes 2D général ; code les 5 ou 6 contraintes dont tu as réellement besoin.

### 2.5 Système de familles

**Rôle.** Définir des objets paramétriques réutilisables (porte 900×2100, fenêtre à 2 vantaux) : paramètres, géométrie générée, variantes (types), instances. Revit propose un éditeur de familles complet avec formules.

**Complexité** : 5 → 2. **Dépend de** : modèle, géométrie. **Quand** : la _séparation Type/Instance_ dès le jour 1 ; un catalogue de types codés au week-end 2 ; jamais d’éditeur visuel avant la V1 (et probablement jamais).

### 2.6 Niveaux et étages

**Rôle.** Un _Level_ est un **plan de référence d’altitude** ; les éléments y sont rattachés avec un décalage de base et une hauteur (ou un niveau supérieur). Une _dalle_ (Floor) est un élément distinct, rattaché à un niveau.

**Complexité** : 2 → 2. **Dépend de** : modèle. **Quand** : jour 2 ou week-end 1. Très bon ratio impact/effort.

### 2.7 Génération des vues

**Rôle.** Plans (coupe horizontale à \~1,2 m au-dessus du niveau), coupes, élévations, vues 3D, avec filtres de visibilité, échelles, hachures de coupe.

**Complexité** : 4 → 3. **Dépend de** : géométrie, niveaux. **Quand** : un plan 2D **dérivé directement du modèle** (pas de vraie coupe 3D) dès le week-end 1 ; les coupes réelles (plan de clipping + contour 2D) dans le MVP 2 mois.

### 2.8 Cotation

**Rôle.** Cotes associées à des références d’éléments, qui se mettent à jour automatiquement.

**Complexité** : 3 → 2 (manuelle) ; 5 pour la cotation automatique. **Dépend de** : vues 2D, références stables, accrochages. **Quand** : MVP 2 mois, en SVG.

### 2.9 Export IFC

**Rôle.** Interopérabilité : `IfcWall`, `IfcOpeningElement`, `IfcRelVoidsElement`, `IfcBuildingStorey`, placements locaux, géométrie `IfcExtrudedAreaSolid`.

**Complexité** : 3 pour un export minimal ; 5 pour un import robuste. **Dépend de** : modèle stabilisé. **Quand** : MVP 2 mois. **Astuce pour toi** : exporte ton JSON vers un petit service **Python + IfcOpenShell**, tu gagnes des semaines.

### 2.10 Collaboration

**Rôle.** Plusieurs utilisateurs sur un modèle : worksets, modèle central, synchronisation, conflits.

**Complexité** : 5 → 3. **Dépend de** : IDs stables et journal d’opérations. **Quand** : V1, au mieux. **Préparation gratuite** : fais passer toutes les modifications par des commandes sérialisables dès le jour 1 (tu obtiens aussi undo/redo, audit et sync future).

**Ordre de construction conseillé** : Modèle → Géométrie 2D → Rendu → Niveaux → Hébergement (portes) → Régénération → Pièces/Métrés → Vues → Cotation → IFC → Collaboration.

## 3. Architecture logicielle

### 3.1 Principes directeurs

1. **Modèle = source de vérité ; géométrie = cache dérivé.** On ne stocke jamais de maillage dans le fichier de projet.
2. **Toute modification est une commande** (transaction atomique, annulable, sérialisable).
3. **Moteur BIM en TypeScript pur** : aucune dépendance à React, Three.js ou au DOM. Testable en Node, exécutable dans un Web Worker, réutilisable côté serveur.
4. **Régénération incrémentale** : seuls les éléments « sales » et leurs dépendants sont recalculés.
5. **Local-first** : le navigateur fonctionne sans serveur ; le serveur arrive en phase 2.
6. **Une seule unité interne (millimètres, float64)**, conversion en mètres uniquement à l’entrée de Three.js.

### 3.2 Diagramme d’architecture

```
┌───────────────────────── NAVIGATEUR ──────────────────────────┐
│                                                               │
│  UI REACT  (arbre projet · propriétés · tableaux · outils)    │
│        │ intentions utilisateur            ▲ état dérivé      │
│        ▼                                   │                  │
│  COUCHE APPLICATION                                           │
│  Tools · Command Bus · Undo/Redo · Sélection · Snapping       │
│        │ commandes (transactions)                             │
│        ▼                                                      │
│  MOTEUR BIM (TypeScript pur, sans DOM)          ┌───────────┐ │
│  Document · Types/Instances · Niveaux           │ VIEWPORTS │ │
│  Graphe de dépendances · Régénération  ────────▶│ 3D Three  │ │
│  Pièces · Quantités · Contraintes ciblées       │ 2D Plan   │ │
│        │ éléments « sales »                     └───────────┘ │
│        ▼                                                      │
│  NOYAU GÉOMÉTRIQUE (TS, puis WASM si besoin)                  │
│  polygones 2D · offset · booléens · extrusion · triangulation │
│                                                               │
│  PERSISTANCE LOCALE : SQLite (WASM + OPFS)                    │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS (à partir du MVP 2 mois)
┌───────────────────────────▼───────────────────────────────────┐
│ SERVEUR : API · PostgreSQL · snapshots + journal d’opérations │
│ Export IFC (Python / IfcOpenShell) · jobs · authentification  │
└───────────────────────────────────────────────────────────────┘
```

### 3.3 Détail par couche

**Frontend (React + TypeScript).** React ne gère que l’interface (arbre, propriétés, tableaux, barre d’outils). **Les viewports ne sont pas des composants React qui se re-rendent** : ce sont des objets impératifs (`Viewport3D`, `ViewportPlan`) montés dans un `<canvas>`, qui s’abonnent au moteur. État UI léger avec Zustand ; état du modèle **hors** de React.

**Couche application.** Outils (`WallTool`, `DoorTool`, `SelectTool`) sous forme de machines à états : ils lisent les événements souris, calculent les accrochages, et émettent des commandes. Un `CommandBus` applique, journalise, gère undo/redo.

**Modèle métier / moteur BIM.** `BimDocument` (dictionnaires d’éléments par ID), `Element`, `ElementType`, `Level`. Un **graphe de dépendances** (la porte dépend de son mur, le mur de son niveau et de ses voisins, la pièce des murs qui la bordent) alimente la régénération. Les calculs de pièces et de quantités vivent ici.

**Moteur géométrique.** Fonctions pures `(paramètres) → géométrie` : `wallFootprint`, `miterJoin`, `extrude`, `subtractOpening`, `triangulate`. TypeScript d’abord ; WASM seulement pour Clipper2/manifold (bibliothèques existantes), **pas** pour réécrire ton code en Rust par principe.

**Rendu 3D.** Three.js, un `Mesh` par élément (puis instanciation/fusion par matériau pour la performance), `LineSegments` pour les arêtes, `BVH` pour le picking, `clippingPlanes` pour les coupes.

**Stockage.** Local : SQLite WASM sur OPFS (ou simple fichier JSON au début). Serveur : PostgreSQL avec snapshots et journal d’opérations.

**Backend (plus tard).** Fastify (Node) ou FastAPI (Python, très bien pour toi et pour IfcOpenShell) : authentification, projets, snapshots, export IFC. Pas de microservices.

### 3.4 Flux d’une modification

```
Souris → Tool → Command → Document.apply() → ChangeSet {créés, modifiés, supprimés}
      → Graphe de dépendances → ensemble « sale » → Régénération (géométrie, pièces, quantités)
      → Viewports.patch(éléments modifiés) → UI (tableaux, propriétés)
```

Pour l’undo/redo, le plus économique est de ne **pas** écrire de `invert()` à la main : utilise **Immer** (`produceWithPatches`), qui donne patches et patches inverses gratuitement, et sérialisables dans le journal d’opérations.

```ts
interface Command {
  name: string;
  run(draft: BimState): void; // mutation sur un brouillon Immer
}

function execute(doc: BimDocument, cmd: Command) {
  const [next, patches, inverse] = produceWithPatches(doc.state, cmd.run);
  doc.history.push({ cmd: cmd.name, patches, inverse });
  doc.state = next;
  const dirty = doc.graph.expand(changedIds(patches)); // + dépendants
  regenerate(doc, dirty); // géométrie, pièces, métrés
  doc.emit('changed', dirty);
}
```

### 3.5 Structure du dépôt (monorepo pnpm)

```
mini-bim/
  packages/
    core/        # modèle, commandes, graphe, régénération (TS pur)
    geometry/    # maths 2D/3D, jonctions, ouvertures, pièces
    ifc/         # export IFC
  apps/
    web/         # React + Three.js + outils
    server/      # Fastify ou FastAPI (phase 2)
```

**Règle d’or** : `core` et `geometry` n’importent jamais `three` ni `react`. Si cette règle tient, tu pourras tout tester sans navigateur et ton architecture restera propre.

## 4. Modèle de données

### 4.1 Concepts à bien distinguer

- **Level ≠ Floor.** Un _Level_ est un plan de référence (altitude, nom). Un _Floor_ est une **dalle** (élément avec un contour et une épaisseur) posée sur un niveau.
- **Catégorie / Type / Instance.** Catégorie : « Mur ». Type : « Cloison BA13 70 mm » (composition en couches). Instance : ce mur-ci, de A à B, 2,70 m de haut. Les paramètres du type sont partagés ; ceux de l’instance les surchargent.
- **Room est un élément dérivé.** On stocke un point de repère (_seed_) ; le contour et la surface sont recalculés (cache).
- **Unités** : millimètres (float64), axe Z vertical (convention BIM). Three.js est Y-up : conversion unique à l’affichage.

### 4.2 Diagramme UML simplifié

```
Project 1───* Level
Project 1───* Material
Project 1───* ElementType   (WallType, DoorType, WindowType, FloorType, RoofType)
Level   1───* Element

ElementType 1───* Layer (materialId, thickness)      -- composition d’un mur
Element (id, category, typeId, levelId, params{}, hostId?)
 ├─ Wall     (start, end, baseOffset, height, justification)
 ├─ Opening  (hostWallId, offsetAlong, sillHeight)    -- abstrait
 │    ├─ Door
 │    └─ Window
 ├─ Floor    (boundary: Polygon, thickness)            -- dalle
 ├─ Roof     (footprint: Polygon, slope, ridgeAngle, overhang)
 └─ Room     (seed: Point, name)  → dérivé : boundary, area, bounding walls

Door/Window *───1 Wall (hôte) ;  Wall *───1 WallType ;  Layer *───1 Material
```

### 4.3 Schéma relationnel (SQLite, portable vers PostgreSQL)

Choix hybride : une table `element` commune (relations, niveau, hôte, surcharges JSON) + des tables spécialisées pour les colonnes typées et indexables.

```sql
CREATE TABLE project (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'mm', schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE material (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL, color TEXT, density_kg_m3 REAL,
  cost_per_m3 REAL, cut_pattern TEXT          -- hachure en coupe
);
CREATE TABLE level (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL, elevation REAL NOT NULL,  -- mm
  UNIQUE (project_id, name)
);
CREATE TABLE element_type (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
  category TEXT NOT NULL CHECK (category IN ('wall','door','window','floor','roof')),
  name TEXT NOT NULL,
  params TEXT NOT NULL                          -- JSON : couches, largeur, hauteur...
);
CREATE TABLE element (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  category TEXT NOT NULL,
  type_id TEXT REFERENCES element_type(id),
  level_id TEXT REFERENCES level(id),
  host_id TEXT REFERENCES element(id) ON DELETE CASCADE,  -- porte → mur
  params TEXT NOT NULL DEFAULT '{}',            -- JSON : surcharges d’instance
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE wall (
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  x1 REAL NOT NULL, y1 REAL NOT NULL, x2 REAL NOT NULL, y2 REAL NOT NULL,
  base_offset REAL NOT NULL DEFAULT 0, height REAL NOT NULL,
  justification TEXT NOT NULL DEFAULT 'center'
);
CREATE TABLE opening (                           -- portes ET fenêtres
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  offset_along REAL NOT NULL,                    -- mm depuis le début du mur
  sill_height REAL NOT NULL DEFAULT 0
);
CREATE TABLE floor_slab (
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  boundary TEXT NOT NULL,                        -- JSON [[x,y],...]
  thickness REAL NOT NULL
);
CREATE TABLE roof (
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  footprint TEXT NOT NULL, slope_deg REAL NOT NULL,
  ridge_angle_deg REAL NOT NULL DEFAULT 0, overhang REAL NOT NULL DEFAULT 0
);
CREATE TABLE room (
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  name TEXT, number TEXT, seed_x REAL NOT NULL, seed_y REAL NOT NULL,
  area_m2 REAL, boundary TEXT                    -- caches recalculables
);
CREATE TABLE op_log (                            -- undo persistant, audit, sync future
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL, ts TEXT NOT NULL, patch TEXT NOT NULL
);
CREATE INDEX idx_element_level ON element(project_id, level_id, category);
CREATE INDEX idx_element_host  ON element(host_id);
```

**Notes de DBA.** (1) Sur PostgreSQL, passe `params` en `JSONB` (index GIN possible) et envisage **PostGIS** (colonne `geometry` + index GiST) pour les requêtes spatiales côté serveur. (2) Les colonnes `area_m2` et `boundary` de `room` sont des **caches** : ne leur fais jamais confiance sans régénération. (3) Les identifiants sont des ULID : triables dans le temps, générables hors-ligne sans collision.

### 4.4 Structure JSON interne (en mémoire et fichier de projet)

À plat, indexé par ID (jamais d’arbres imbriqués : cela simplifie patches, undo, sync et références).

```json
{
  "schema": 1,
  "unit": "mm",
  "levels": {
    "lv_0": { "name": "RDC", "elevation": 0 },
    "lv_1": { "name": "R+1", "elevation": 2800 }
  },
  "materials": {
    "mat_brick": { "name": "Brique", "color": "#b5651d", "density": 1800 },
    "mat_plaster": { "name": "Plâtre", "color": "#f2efe9", "density": 900 }
  },
  "types": {
    "wt_ext_30": {
      "category": "wall",
      "name": "Mur extérieur 300",
      "layers": [
        { "material": "mat_plaster", "thickness": 15 },
        { "material": "mat_brick", "thickness": 270 },
        { "material": "mat_plaster", "thickness": 15 }
      ]
    },
    "dt_900": { "category": "door", "name": "Porte 900×2100", "width": 900, "height": 2100 }
  },
  "elements": {
    "w_01": {
      "category": "wall",
      "type": "wt_ext_30",
      "level": "lv_0",
      "start": [0, 0],
      "end": [6000, 0],
      "height": 2800,
      "baseOffset": 0,
      "justification": "center"
    },
    "d_01": {
      "category": "door",
      "type": "dt_900",
      "level": "lv_0",
      "host": "w_01",
      "offsetAlong": 1500,
      "sillHeight": 0
    },
    "r_01": {
      "category": "room",
      "level": "lv_0",
      "seed": [2500, 2000],
      "name": "Séjour"
    }
  }
}
```

Le fichier ne contient **que** les paramètres. Surfaces, contours de pièces et maillages sont recalculés à l’ouverture. C’est ce qui rend le format stable, léger et diffable (Git-friendly).

## 5. Géométrie : mathématiques et algorithmes

**Conventions.** Plan XY en millimètres, Z vertical. Un point et un vecteur sont `{x, y}`. Produit scalaire `dot(a,b) = ax·bx + ay·by`. Produit vectoriel 2D (un scalaire) `cross(a,b) = ax·by − ay·bx`. Normale gauche d’un vecteur `d` : `n = (−dy, dx)` (rotation de +90°). Les polygones sont orientés **anti-horaire (CCW)** ; le signe de l’aire signée `½·Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)` donne l’orientation.

### 5.1 Représenter un mur

Un mur est un **axe + des paramètres**, jamais un maillage :

```ts
interface Wall {
  id: string;
  a: Vec2;
  b: Vec2; // axe (mm)
  thickness: number;
  height: number;
  baseZ: number;
  locationLine: 'center' | 'left' | 'right';
}
```

Grandeurs dérivées : longueur `L = |B − A|`, direction `d = (B − A)/L`, normale `n = (−dy, dx)`. La **ligne de repère** (location line) décide où l’axe se situe dans l’épaisseur. Soit `c` le décalage du centre du corps par rapport à l’axe : `c = 0` (center), `−t/2` (left), `+t/2` (right). Les deux faces du mur sont les droites parallèles à l’axe aux décalages `sMinus = c − t/2` et `sPlus = c + t/2` le long de `n`.

Emprise rectangulaire de base (CCW) : `A + n·sMinus`, `B + n·sMinus`, `B + n·sPlus`, `A + n·sPlus`.

**Murs multicouches** : on subdivise `[sMinus, sPlus]` en bandes (une par couche) ; chaque bande a sa propre emprise et donc son propre maillage, regroupé par matériau. Convention : la couche 0 est du côté `+n` (extérieur par défaut).

### 5.2 Générer un mesh Three.js depuis un mur

Pipeline : `Wall → emprise 2D (jonctions) → tranches (ouvertures) → extrusion → BufferGeometry`.

Pour un polygone **convexe** (c’est le cas de l’emprise d’un mur : un trapèze entre deux droites parallèles, et de ses tranches), l’extrusion est triviale : triangulation en éventail pour le dessus et le dessous, un quad par arête pour les flancs. Pas besoin d’`earcut` ici (il servira pour les dalles, toits et pièces, polygones quelconques).

```ts
class MeshBuilder {
  pos: number[] = [];
  idx: number[] = [];
  addVerts(vs: number[][]) {
    const base = this.pos.length / 3;
    vs.forEach((v) => this.pos.push(v[0], v[1], v[2]));
    return base;
  }
  tri(base: number, a: number, b: number, c: number) {
    this.idx.push(base + a, base + b, base + c);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function extrudeConvex(poly: Vec2[], z0: number, z1: number, m: MeshBuilder) {
  const n = poly.length; // poly en CCW
  const top = m.addVerts(poly.map((p) => [p.x, p.y, z1]));
  const bot = m.addVerts(poly.map((p) => [p.x, p.y, z0]));
  for (let i = 1; i < n - 1; i++) {
    m.tri(top, 0, i, i + 1); // normale +Z
    m.tri(bot, 0, i + 1, i); // normale −Z
  }
  for (let i = 0; i < n; i++) {
    // flancs : sommets dupliqués
    const a = poly[i],
      b = poly[(i + 1) % n]; // → normales franches
    const q = m.addVerts([
      [a.x, a.y, z0],
      [b.x, b.y, z0],
      [b.x, b.y, z1],
      [a.x, a.y, z1],
    ]);
    m.tri(q, 0, 1, 2);
    m.tri(q, 0, 2, 3); // normale vers l’extérieur
  }
}
```

**Vérification du sens des flancs.** Pour une arête `a → b` d’un polygone CCW, le vecteur `(b−a) × ẑ = (dy, −dx)` pointe vers l’extérieur ; le triangle `(a_bas, b_bas, b_haut)` a exactement cette normale. Si ton maillage apparaît « à l’envers », c’est presque toujours une emprise en CW : teste le signe de l’aire et inverse.

**Z-up → Y-up sans toucher aux sommets.** Mets tout le modèle sous un groupe racine :

```ts
const modelRoot = new THREE.Group();
modelRoot.rotation.x = -Math.PI / 2; // (x, y, z) → (x, z, −y) : rotation propre, pas de miroir
modelRoot.scale.setScalar(0.001); // mm → m
scene.add(modelRoot);
```

Pour le look architectural : `new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMaterial)` (seuil de 25° : les arêtes coplanaires entre tranches voisines n’apparaissent pas).

### 5.3 Gérer les ouvertures (sans booléens 3D)

**Méthode recommandée pour un développeur solo : la découpe en tranches.** Une ouverture est un intervalle `[u0, u1]` le long de l’axe (`u = dot(P − A, d)`) et une plage verticale `[sill, sill + H]`. On découpe l’emprise du mur par des plans verticaux perpendiculaires à l’axe, puis :

- entre deux ouvertures : tranche **pleine hauteur** ;
- sous une fenêtre (`sill > 0`) : tranche de `z0` à `z0 + sill` (allège) ;
- au-dessus d’une porte ou d’une fenêtre : tranche de `sill + H` jusqu’en haut (linteau).

Le découpage d’un polygone convexe par un demi-plan est l’algorithme de **Sutherland–Hodgman** (quelques lignes) :

```ts
// Garde la partie { p : dot(p − o, n) ≥ 0 } d’un polygone convexe
function clipHalfPlane(poly: Vec2[], o: Vec2, n: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = dot(sub(a, o), n),
      db = dot(sub(b, o), n);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) out.push(lerp(a, b, da / (da - db))); // intersection
  }
  return out;
}

// Tranche u ∈ [u0, u1] le long de l’axe du mur
function slice(poly: Vec2[], w: Wall, u0: number, u1: number): Vec2[] {
  const d = dirOf(w);
  const p = clipHalfPlane(poly, add(w.a, mul(d, u0)), d);
  return clipHalfPlane(p, add(w.a, mul(d, u1)), mul(d, -1));
}

function wallPieces(footprint: Vec2[], w: Wall, ops: Op[]) {
  // Op = {u0,u1,sill,top}
  const z0 = w.baseZ,
    z1 = w.baseZ + w.height,
    BIG = 1e7;
  const out: { poly: Vec2[]; z0: number; z1: number }[] = [];
  let cursor = -BIG; // la 1re tranche déborde sur les jonctions
  for (const o of [...ops].sort((p, q) => p.u0 - q.u0)) {
    if (o.u0 > cursor) out.push({ poly: slice(footprint, w, cursor, o.u0), z0, z1 });
    if (o.sill > 0) out.push({ poly: slice(footprint, w, o.u0, o.u1), z0, z1: z0 + o.sill });
    if (o.top < w.height) out.push({ poly: slice(footprint, w, o.u0, o.u1), z0: z0 + o.top, z1 });
    cursor = Math.max(cursor, o.u1);
  }
  out.push({ poly: slice(footprint, w, cursor, BIG), z0, z1 });
  return out.filter((p) => p.poly.length >= 3 && Math.abs(area(p.poly)) > 1);
}
```

Cette méthode fonctionne avec des murs en onglet, sans aucune librairie de booléens, et reste très rapide. La **validation** (ouverture dans le mur, pas de chevauchement, `top ≤ hauteur`) se fait dans la _commande_, pas dans la géométrie.

**Limites.** Ouvertures non rectangulaires (arcs, œils-de-bœuf) : impossible par tranches. Alternative : `manifold-3d` (WASM), qui soustrait un solide d’ouverture du solide mur de façon robuste ; à réserver à la V1.

**Géométrie de la porte elle-même** : cadre + vantail = quelques boîtes générées depuis `(width, height, frameDepth)`, positionnées dans le repère du mur : origine `A + d·offset`, axes `(d, n, ẑ)`.

### 5.4 Gérer les intersections (jonctions de murs)

**Idée.** Les jonctions ne modifient pas le _modèle_ (l’axe reste A→B) ; elles modifient seulement l’**emprise dérivée** des extrémités. On construit un graphe : un **nœud** = point où plusieurs extrémités coïncident (fusion à tolérance, p. ex. 1 mm, grâce à l’accrochage).

**Cas par degré du nœud :**

1. **Degré 1** : bout libre, coupe droite (`node ± n·offset`).
2. **Degré 2 (angle)** : **onglet**. Les deux arêtes qui se font face se coupent en un point.
3. **Degré 2 colinéaire** : arêtes parallèles → pas d’intersection → coupe droite.
4. **Degré ≥ 3 sans paire colinéaire (Y, croix à 4 branches)** : algorithme de l’étoile ci-dessous.
5. **T** (une paire colinéaire + une branche) : le mur traversant **ne bouge pas** (coupe droite des deux côtés) ; la branche vient **buter** sur sa face : ses deux coins d’extrémité sont l’intersection de ses arêtes avec la droite de la face du mur traversant.
6. **Croix** (deux murs qui se traversent) : coupe-les à l’intersection lors du tracé (le tool insère un nœud), tu retombes sur une étoile à 4 branches.

**Intersection de deux droites** `P + t·r` et `Q + u·s` : en prenant le produit vectoriel avec `s`, on obtient `t = cross(Q − P, s) / cross(r, s)`. Si `|cross(r, s)|` est quasi nul, les droites sont parallèles.

```ts
function intersect(p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null {
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null; // parallèles
  return add(p, mul(r, cross(sub(q, p), s) / den));
}
```

**Algorithme de l’étoile.** À un nœud, chaque mur incident `k` part avec une direction `dₖ` (sortante). On trie les murs par angle croissant (`Math.atan2`). Pour chaque mur, `left` et `right` sont les décalages signés de ses deux arêtes le long de la normale gauche `nₖ = (−dₖy, dₖx)` : au départ du mur, `left = sPlus`, `right = sMinus` ; à son extrémité, `left = −sMinus`, `right = −sPlus` (car la direction sortante est inversée). Le coin entre le mur `k` et son voisin suivant `k+1` est l’intersection de l’**arête gauche de k** et de l’**arête droite de k+1** :

```ts
function nodeCorners(node: Vec2, inc: Incident[]) {
  // inc trié par angle CCW
  const m = inc.length;
  const left: Vec2[] = [],
    right: Vec2[] = [];
  inc.forEach((w, k) => {
    // coupe droite par défaut
    left[k] = add(node, mul(perp(w.d), w.left));
    right[k] = add(node, mul(perp(w.d), w.right));
  });
  if (m < 2) return { left, right };
  for (let k = 0; k < m; k++) {
    const A = inc[k],
      j = (k + 1) % m,
      B = inc[j];
    const c = intersect(left[k], A.d, right[j], B.d);
    const lim = 4 * Math.max(Math.abs(A.left), Math.abs(B.right)); // limite d’onglet
    if (c && dist(c, node) <= lim) {
      left[k] = c;
      right[j] = c;
    } // sinon : coupe droite
  }
  return { left, right };
}
```

**Emprise finale d’un mur** de nœud de départ `A` et de nœud d’arrivée `B` (CCW) : `[R_A, L_B, R_B, L_A]`, avec `R_A` le coin droit au nœud A (côté `−n`), `L_B` le coin gauche _vu depuis B_ (côté `−n` globalement), etc.

**Limite d’onglet (miter limit).** La longueur d’un onglet vaut `(t/2) / sin(θ/2)` : quand l’angle `θ` entre deux murs devient très aigu, le coin « explose ». Au-delà de \~4× la demi-épaisseur (≈ 29°), on retombe sur une coupe droite.

**Bonus pour la vue 2D.** L’**union** des emprises de tous les murs d’un niveau (voir 5.5) donne le poché parfait d’un plan, sans traitement de jonctions, puisque les chevauchements disparaissent.

### 5.5 Générer automatiquement les pièces

Idée centrale : **une pièce est un trou dans l’union des murs.**

1. Prendre les emprises (rectangulaires et non découpées par les portes : en plan, une porte ne coupe pas la pièce) de tous les murs d’un niveau.
2. **Arrondir** les coordonnées à la grille de 1 mm (évite les micro-fissures numériques).
3. Calculer leur **union** (`polygon-clipping`, JavaScript pur, ou Clipper2 en WASM). Le résultat est un _MultiPolygon_ `[[extérieur, trou1, trou2…], …]`.
4. Chaque **trou** est une zone fermée : c’est une pièce candidate.
5. Associer les pièces au _seed_ de chaque `Room` existant par un test point-dans-polygone ; créer automatiquement une pièce pour les trous sans seed (position d’étiquette : pôle d’inaccessibilité, `polylabel`).
6. Filtrer les trous de moins de 0,02 m² (artefacts).

```ts
import polygonClipping from 'polygon-clipping';

const snap = (p: Vec2): [number, number] => [Math.round(p.x), Math.round(p.y)];
const polys = footprints.map((f) => [f.map(snap)]); // Polygon = [anneau]
const union = polygonClipping.union(polys[0], ...polys.slice(1)); // MultiPolygon

const rooms: [number, number][][] = [];
for (const poly of union)
  for (const hole of poly.slice(1))
    // anneaux intérieurs
    if (Math.abs(signedArea(hole)) > 20_000) rooms.push(hole); // > 0,02 m²

function signedArea(r: [number, number][]) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i],
      [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2; // mm² ; /1e6 → m²
}

function pointInPolygon(p: Vec2, r: [number, number][]) {
  // lancer de rayon
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
```

**Grandeurs.** Aire = formule du lacet (ci-dessus) ; périmètre = somme des longueurs d’arêtes ; centroïde `Cx = Σ(xᵢ+xᵢ₊₁)(xᵢyᵢ₊₁−xᵢ₊₁yᵢ) / (6A)` (idem pour `Cy`) ; volume = aire × hauteur sous plafond. Le mesh d’une pièce (sol coloré translucide) vient de `earcut`.

**Cas particuliers.** (1) _Îlot_ (poteau dans une pièce) : il apparaît comme un polygone séparé de l’union, à l’intérieur du trou ; la pièce vaut `trou − îlots` (`polygonClipping.difference`). (2) _Espace ouvert_ (cuisine ouverte sur séjour) : aucun trou ne se forme ; offre une **ligne de séparation de pièces** (mur virtuel d’épaisseur 1 mm, hauteur 0) comme dans Revit. (3) _Pièce non fermée_ : l’union ne produit pas de trou, donc pas de pièce ; affiche un avertissement et surligne l’endroit de la fuite.

### 5.6 Les pièges de robustesse (à lire avant d’écrire une ligne)

- **Toujours arrondir** à une grille (1 mm) avant tout booléen. La géométrie flottante _sans_ tolérance est la première cause de pièces fantômes.
- **Tolérances nommées** : `SNAP = 1 mm`, `PARALLEL = 1e-9`, `MIN_AREA = 20 000 mm²`. Pas de `1e-6` éparpillés dans le code.
- **Mélanger les unités** (mm, m, cm) est le bug n°1 des logiciels CAD.
- **Orientation** : normalise l’orientation des polygones à l’entrée de chaque fonction.
- **Tests** : la géométrie est le seul endroit où les tests unitaires sont obligatoires (cas : onglet à 90°, 45°, 10°, T, croix, mur de longueur nulle, porte sur un coin).

## 6. Roadmap

Calibrage réaliste : un week-end solo ≈ 12 à 16 heures utiles. « 2 jours » = un week-end, « 2 semaines » = 2 à 3 week-ends plus quelques soirées, « 2 mois » ≈ 8 week-ends.

### 6.1 MVP de 2 jours : « je dessine des murs en 3D »

**Fonctionnalités.** Vue 3D (OrbitControls, grille, éclairage), outil Mur (clic–clic avec accrochage grille), murs extrudés avec épaisseur et hauteur, sélection, panneau de propriétés (épaisseur, hauteur), undo/redo, sauvegarde/chargement JSON.

**Architecture.** Vite + React + TypeScript ; `core` (document + commandes + Immer) ; un seul viewport Three.js ; pas de base de données, pas de serveur.

**Difficultés.** Picking, accrochage (snap), conventions de repère (Z-up → Y-up), éviter de laisser fuir la logique métier dans React.

**Pièges.** Stocker des `Mesh` dans l’état React ; muter le modèle directement (adieu undo) ; commencer par un joli rendu avant d’avoir le modèle de commandes.

### 6.2 MVP de 2 semaines : « ça ressemble à un mini-Revit »

**Fonctionnalités.** Niveaux ; jonctions de murs (onglet, T, croix) ; portes et fenêtres hébergées ; types de murs (couches) et catalogue de types de portes/fenêtres ; dalles ; **plan 2D** synchronisé avec la 3D ; **pièces automatiques** avec surfaces ; **tableau de métrés** en direct ; persistance SQLite (WASM + OPFS) ou JSON.

**Architecture.** Package `geometry` testé ; graphe de dépendances et **régénération incrémentale** (`ChangeSet` → éléments sales) ; viewports comme objets impératifs abonnés au moteur.

**Difficultés.** Jonctions (T, angles aigus) ; faire suivre la porte quand le mur bouge ; stabilité des pièces ; synchroniser la sélection entre 2D et 3D.

**Pièges.** Tolérances numériques ; sur-ingénierie du graphe de dépendances (une table `dépendants[id]` recalculée à chaque commande suffit au début) ; vouloir gérer les murs courbes.

### 6.3 MVP de 2 mois : « je peux montrer ça »

**Fonctionnalités.** Toit à deux pans (ou plat) ; escalier droit simple (volée paramétrique) ; **section box** et coupe dynamique ; vues de coupe 2D ; cotation manuelle (SVG) ; nomenclatures exportables (CSV/Excel) ; **export IFC minimal** ; copier/coller et multi-sélection ; serveur (API, PostgreSQL, snapshots, `op_log`, authentification) ; Web Worker de régénération ; BVH et instanciation.

**Architecture.** Régénération dans un Worker (messages = `ChangeSet`) ; schéma versionné avec **migrations** ; serveur Fastify ou FastAPI ; IFC via un service Python.

**Difficultés.** Le toit (le _straight skeleton_ est un piège) ; les coupes 2D (contours + hachures) ; IFC (placements, relations) ; migrations de schéma.

**Pièges.** Le toit « général » (limite-toi à un toit à deux pans défini par un faîtage et une pente) ; viser la conformité IFC complète ; ajouter des fonctions au lieu de consolider ; ne pas versionner le schéma avant d’avoir des utilisateurs.

### 6.4 Version 1.0 : « produit utilisable »

**Fonctionnalités.** Collaboration asynchrone (versions, branches de snapshots) puis co-édition par propriété (Yjs au niveau des paramètres, verrouillage optimiste par élément) ; import IFC en lecture seule comme **référence** (web-ifc) ; familles paramétriques décrites en JSON/DSL (catalogue extensible) ; murs courbes (arcs approximés en polylignes) ; feuilles de mise en page et export PDF/SVG ; historique et restauration ; tests de bout en bout et documentation.

**Architecture.** Schéma stable avec compatibilité ascendante ; API publique minimale ; budget de performance mesuré en CI (temps de régénération, FPS) ; observabilité (erreurs, temps).

**Difficultés.** Co-édition sans corruption du modèle ; fiabilité des fichiers (jamais de perte de données) ; performance sur de gros projets.

**Pièges.** Promettre l’interopérabilité Revit/RVT (impossible, format fermé) ; figer le schéma trop tôt ou le changer sans migration ; confondre « temps réel » et « utile » : la co-édition asynchrone suffit souvent largement.

## 7. Choix techniques

### 7.1 Three.js vs Babylon.js

| Critère                        | Three.js                                                                             | Babylon.js                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Philosophie                    | Bibliothèque de rendu bas niveau : tu assembles                                      | Moteur complet : inspecteur, GUI, gizmos, picking intégrés |
| TypeScript                     | Bons types (`@types/three`)                                                          | Écrit en TypeScript, très bonne expérience développeur     |
| Écosystème BIM                 | Très riche : That Open Company (`web-ifc`, `@thatopen/components`), `three-mesh-bvh` | Plus mince côté IFC/BIM                                    |
| Outils d’édition               | À construire (TransformControls existe)                                              | Nombreux gizmos prêts à l’emploi                           |
| Taille du bundle               | Léger si tree-shaké                                                                  | Plus volumineux                                            |
| Ressources, exemples, réponses | Immenses                                                                             | Très bonnes, plus compactes                                |
| Contrôle fin du rendu          | Maximal                                                                              | Bon, avec plus d’abstractions                              |
| WebGPU                         | Rendu WebGPU disponible                                                              | Support WebGPU précoce                                     |

**Choix d’un solo : Three.js + `three-mesh-bvh`.** Raison principale : l’écosystème BIM (web-ifc, viewers open source à lire) et la masse de ressources. Ce que tu perds : des gizmos prêts. **Critique honnête** : Babylon est un choix défendable pour livrer vite un viewer, mais son avantage s’évapore dans un logiciel BIM, car les outils métier (mur, accrochage, porte hébergée) sont de toute façon à écrire. Quant à **React Three Fiber**, évite-le pour le viewport principal : son modèle déclaratif souffre de mises à jour massives et fréquentes ; garde React pour l’interface.

### 7.2 SQLite vs PostgreSQL

| Critère                       | SQLite                                            | PostgreSQL                         |
| ----------------------------- | ------------------------------------------------- | ---------------------------------- |
| Déploiement                   | Dans le navigateur (WASM + OPFS) ou fichier local | Serveur à opérer                   |
| Fichier de projet portable    | Oui : un fichier = un projet                      | Non : export nécessaire            |
| Hors-ligne / local-first      | Natif                                             | Impossible sans réplication        |
| Concurrence multi-utilisateur | Un seul écrivain                                  | Excellente                         |
| JSON                          | JSON1 (stocké en texte)                           | JSONB indexable (GIN)              |
| Spatial                       | Module R\*Tree intégré                            | PostGIS (très puissant)            |
| Migrations, outillage         | Simples                                           | Mature                             |
| Coût au MVP                   | Nul                                               | Serveur, authentification, latence |

**Choix d’un solo : SQLite d’abord (phases 1 et 2), PostgreSQL au moment du serveur (phase 3), avec le même schéma.** **Critique à destination d’un DBA** : tu seras tenté de commencer par PostgreSQL, que tu maîtrises. Résiste : la base n’est pas l’ensemble de travail (le modèle vit en mémoire) ; la placer derrière le réseau ajoute latence et complexité à chaque édition, sans bénéfice utilisateur au MVP. Côté navigateur, SQLite WASM tourne dans un Worker ; le VFS `opfs-sahpool` évite d’exiger les en-têtes COOP/COEP (à vérifier selon la version de la bibliothèque).

### 7.3 Stockage JSON vs relationnel

| Critère                               | JSON (document)         | Relationnel                  |
| ------------------------------------- | ----------------------- | ---------------------------- |
| Souplesse du schéma                   | Élevée                  | Migrations à écrire          |
| Requêtes (métrés, filtres, jointures) | À coder en JavaScript   | SQL natif                    |
| Intégrité référentielle               | À valider soi-même      | Clés étrangères, contraintes |
| Diff, Git, débogage                   | Excellent (texte)       | Moyen                        |
| Écritures partielles                  | Réécriture ou patchs    | `UPDATE` ciblé               |
| Synchronisation / collaboration       | Snapshots + patchs      | Plus délicate                |
| Passage à l’échelle                   | Bon jusqu’à quelques Mo | Très bon                     |

**Choix d’un solo : un hybride.** À l’exécution, le modèle est du **JSON normalisé en mémoire** (dictionnaires par ID). À la persistance : phase 1 = snapshot JSON ; phase 2 = tables SQLite avec colonnes typées + colonne `params` JSON (schéma de la section 4.3). **Règle** : tout ce qu’on filtre, agrège ou joint devient une colonne ; tout ce qui varie d’un type d’objet à l’autre reste en JSON.

### 7.4 Pile recommandée

- **Outillage** : pnpm, Vite, TypeScript strict, Vitest, ESLint.
- **UI** : React, Zustand, un composant de panneaux (dock) simple.
- **3D** : Three.js, `three-mesh-bvh`, `EdgesGeometry`.
- **Modèle** : Immer (patchs + undo), ULID pour les IDs.
- **Géométrie** : `earcut`, `polygon-clipping` (puis Clipper2 WASM), `rbush`, `polylabel`, `manifold-3d` (V1, si besoin).
- **Persistance** : JSON d’abord, puis SQLite WASM ; plus tard PostgreSQL.
- **Serveur** : Fastify ou FastAPI ; IfcOpenShell pour l’IFC ; `web-ifc` côté navigateur.

## 8. Performances : 100, 1 000 et 10 000 murs

### 8.1 Où est le vrai goulot ?

Un mur avec 2 ouvertures donne environ 5 tranches × 12 triangles = 60 triangles par couche ; avec 3 couches, \~180. **10 000 murs ≈ 1,8 million de triangles** : un GPU récent l’absorbe. Les vrais goulots sont ailleurs : les **appels de dessin** (un par mesh), le **CPU** (régénération, picking, parcours du graphe de scène) et la **mémoire / le ramasse-miettes**. Règle d’or : mesure d’abord (`renderer.info`, onglet Performance de Chrome, un générateur de projet synthétique de N murs).

### 8.2 Stratégie par échelle

| Échelle         | Rendu                                                       | Picking                                              | Régénération                                             | À ne pas faire                                                              |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| **100 murs**    | Un mesh par mur et par couche                               | Raycast brut                                         | Tout recalculer à chaque commande, c’est acceptable      | Optimiser prématurément                                                     |
| **1 000 murs**  | Fusion par (niveau, matériau) en _chunks_                   | BVH sur les chunks, `rbush` en plan                  | Incrémentale (éléments sales uniquement)                 | Un mesh par mur : 3 000 draw calls                                          |
| **10 000 murs** | Chunks spatiaux (\~20 m) + instanciation des familles + LOD | BVH par chunk + `rbush` ; tableau triangle → élément | Web Worker, buffers transférables, throttling du glisser | Tout sur le thread principal ; recalculer les pièces à chaque `pointermove` |

### 8.3 Index spatiaux : à quoi sert chacun

- **Grille uniforme (spatial hash)** : on divise le plan en cellules de taille fixe ; insertion et requête en O(1) amorti. Imbattable pour des objets de taille similaire (des murs). Mauvaise si la densité est très hétérogène.
- **Quadtree (2D)** : le plan est subdivisé récursivement en 4 quadrants jusqu’à un seuil d’objets. Bien pour des densités variables, mais les objets qui chevauchent les frontières posent problème (ils sont dupliqués ou remontent dans les nœuds parents).
- **R-tree (`rbush`)** : arbre de rectangles englobants (AABB). **Le meilleur choix par défaut en plan** pour des murs (ils ont une étendue) : chargement en masse très rapide, insertion/suppression peu coûteuses, requêtes par rectangle ou par point en O(log n). Il sert au snapping, à la sélection par fenêtre et à la détection des voisins de jonction.
- **Octree (3D)** : la même idée en 3D (8 octants). Dans un bâtiment, qui est une pile de couches plates, un index **par niveau** (R-tree 2D) bat un octree : tu l’écarteras sans regret ; un octree se justifie pour de gros nuages de points ou des scènes réellement volumétriques.
- **BVH (hiérarchie de volumes englobants)** : arbre d’AABB construit sur des triangles ou des objets (coupe par médiane ou heuristique SAH, O(n log n)). Raycast en O(log n) ; mise à jour par _refit_ en O(n) si la topologie ne change pas, sinon reconstruction. **C’est l’outil du picking 3D.**

### 8.4 BVH en pratique avec three-mesh-bvh

```ts
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

chunk.geometry.computeBoundsTree(); // à refaire quand le chunk est « sale »
raycaster.firstHitOnly = true; // accélère nettement le picking
const hit = raycaster.intersectObjects(chunks, false)[0];
const elementId = chunk.userData.triOwner[hit.faceIndex]; // Uint32Array : triangle → élément
```

Le tableau `triOwner` (un entier par triangle) est la clé des meshes fusionnés : il permet de retrouver quel mur a été cliqué sans conserver un mesh par mur. Les chunks sont reconstruits quand un de leurs éléments change : un chunk de \~500 murs se régénère en quelques millisecondes.

### 8.5 Instanciation

Portes, fenêtres, poteaux, meubles : des centaines d’instances d’une même géométrie. `InstancedMesh` les dessine en **un appel** avec une matrice 4×4 par instance :

```ts
const doors = new THREE.InstancedMesh(doorGeometry, doorMaterial, instances.length);
instances.forEach((d, i) => doors.setMatrixAt(i, matrixOf(d))); // position + rotation + échelle
doors.instanceMatrix.needsUpdate = true;
```

Le raycast brut sur un `InstancedMesh` est linéaire : pour sélectionner une porte, passe plutôt par l’index `rbush` du plan (boîte englobante, puis test précis), ou par un picking par couleur d’ID sur un rendu hors écran.

### 8.6 Autres leviers, par ordre de rentabilité

1. **Rendu à la demande** : ne rends que si quelque chose a changé (pas de boucle à 60 images/s au repos).
2. **Visibilité par niveau** : n’affiche que le niveau actif et ceux du dessous ; masque les arêtes au loin (LOD simple).
3. **Frustum culling par chunk** : possible uniquement si les meshes sont découpés en chunks avec des boîtes englobantes.
4. **Régénération en Web Worker**, avec buffers transférables (`postMessage(buf, [buf])`) : zéro copie, aucun gel de l’interface.
5. **Aperçu pendant le glisser, commit au relâchement** : ne recalcule pas pièces et métrés à chaque `pointermove` ; débounce de 100 à 200 ms sur le niveau concerné.
6. **Mémoire** : `Float32Array` plats, pas d’objets Three par mur dans l’état React, appel systématique à `dispose()`.

**Budgets cibles** : image ≤ 16 ms ; commande → écran ≤ 50 ms ; ouverture d’un projet de 10 000 murs ≤ 3 s.

## 9. Fonctionnalités « wow » (classées par ratio impact / effort)

**Méthode.** Impact de 1 à 10 (effet sur un spectateur ou un utilisateur) ; effort en _soirées_ (1 soirée ≈ 3 h) ; ratio = impact ÷ effort. Ce sont mes estimations pour un développeur qui a déjà le socle (modèle, commandes, viewport) : elles sont subjectives, mais l’ordre est robuste.

| #   | Fonctionnalité                                                        | Impact | Effort | Ratio | Comment                                                                                      |
| --- | --------------------------------------------------------------------- | ------ | ------ | ----- | -------------------------------------------------------------------------------------------- |
| 1   | **Soleil et ombres** selon date, heure, latitude                      | 7      | 1      | 7,0   | `suncalc` donne azimut et hauteur ; pilote une `DirectionalLight`                            |
| 2   | **Vue éclatée des étages**                                            | 6      | 1      | 6,0   | Décale chaque niveau sur Z d’un facteur animé                                                |
| 3   | **Couleurs par type + légende**                                       | 6      | 1      | 6,0   | Matériaux par type, légende dérivée du catalogue                                             |
| 4   | **Look architectural** (arêtes, ombres douces, SSAO)                  | 9      | 2      | 4,5   | `EdgesGeometry`, éclairage hémisphérique, ombres en cascade                                  |
| 5   | **Coupe dynamique** (section box)                                     | 9      | 2      | 4,5   | `clippingPlanes` sur les matériaux ; capping en option                                       |
| 6   | **Panneau de propriétés Type / Instance**                             | 8      | 2      | 4,0   | Formulaire généré depuis le schéma de paramètres                                             |
| 7   | **Undo/redo**                                                         | 8      | 2      | 4,0   | Immer + commandes (déjà dans l’architecture)                                                 |
| 8   | **Calculs de surfaces et volumes**                                    | 8      | 2      | 4,0   | Murs nets (− ouvertures), dalles, pièces ; formule du lacet                                  |
| 9   | **Calque de fond** (image/PDF à l’échelle)                            | 8      | 2      | 4,0   | Plan texturé au sol, calibré par 2 points ; on retrace dessus                                |
| 10  | **Visite à la première personne**                                     | 7      | 2      | 3,5   | `PointerLockControls` + collisions via l’index 2D                                            |
| 11  | **Niveaux et visibilité**                                             | 7      | 2      | 3,5   | `Level` + niveau actif, gris des autres                                                      |
| 12  | **Estimation de coûts**                                               | 7      | 2      | 3,5   | Prix par matériau × quantités déjà calculées                                                 |
| 13  | **Maison à partir d’une description** (LLM → JSON validé → commandes) | 10     | 3      | 3,3   | Le modèle JSON + les commandes en font une fonction quasi gratuite ; valide par schéma (Zod) |
| 14  | **Accrochages intelligents** (extrémités, milieux, perpendiculaire)   | 8      | 3      | 2,7   | `rbush` + candidats triés par distance écran                                                 |
| 15  | **Tableau de métrés** + export CSV                                    | 8      | 3      | 2,7   | Agrégation par catégorie/type/niveau                                                         |
| 16  | **Portes et fenêtres hébergées**                                      | 9      | 4      | 2,3   | Tranches (section 5.3) + outil à fantôme                                                     |
| 17  | **Jonctions de murs en onglet**                                       | 8      | 4      | 2,0   | Algorithme de l’étoile (section 5.4)                                                         |
| 18  | **Pièces automatiques** + étiquettes de surface                       | 9      | 5      | 1,8   | Union des murs → trous (section 5.5)                                                         |
| 19  | **Plan 2D synchronisé** (poché, portes en arc)                        | 9      | 5      | 1,8   | Canvas 2D ou SVG ; poché = union des emprises                                                |
| 20  | **Export IFC minimal**                                                | 7      | 5      | 1,4   | JSON → service IfcOpenShell                                                                  |

**Lecture critique.** Un ratio faible n’est pas un synonyme de « à éviter » : les n° 16 à 19 sont les **fondations de la crédibilité BIM**, et sans eux les fonctions à fort ratio ne pèsent rien (un beau soleil sur des murs qui se chevauchent n’impressionne personne). Le bon ordre est donc : _socle (1 jour)_ → _quick wins à fort ratio (n° 1 à 9)_ → _fondations crédibles (n° 16 à 19)_ → _le reste_. Au-delà des 20 : variantes de projet (snapshots comparables) et partage par lien en lecture seule, très efficaces pour une démo publique.

## 10. Plan d’exécution concret

**Règles de survie en vibe coding.**

- Écris un fichier de contexte (`CLAUDE.md` ou `AGENTS.md`) à la racine : unités (mm), repère (Z-up), conventions de polygones (CCW), tolérances nommées, règle d’imports (`core` n’importe jamais `three` ni `react`), glossaire (Level ≠ Floor).
- **Une tâche par prompt**, un commit par tâche. Demande d’abord les tests, puis le code.
- **Jamais de code géométrique accepté sans test unitaire.** C’est là que l’IA se trompe de signe ou d’orientation sans que rien ne plante.
- Garde le dépôt exécutable à chaque commit ; si un prompt casse tout, `git reset` et reformule plutôt que de patcher des patchs.

### Soir 1 (3 à 4 h) : une maison en fil de fer… en 3D

1. Monorepo pnpm : `packages/core`, `packages/geometry`, `apps/web` (Vite + React + TS strict + Vitest).
2. Scène Three.js : grille, `OrbitControls`, lumière hémisphérique + directionnelle, groupe racine Z-up (section 5.2).
3. `core` : types (`Vec2`, `Wall`, `BimState`), `execute(cmd)` avec Immer.
4. `geometry` : `extrudeConvex` + emprise rectangulaire d’un mur ; 5 tests (aire, orientation, normales).
5. Charge 4 murs codés en dur en JSON et affiche-les.

**Critère de sortie** : une boîte de murs en 3D, orbitable, avec tests verts. Commit « socle ».

### Soir 2 (3 à 4 h) : dessiner, sélectionner, annuler

1. Outil Mur : raycast sur le plan Z = 0, accrochage à la grille (100 mm), mur fantôme pendant le tracé, commande `AddWall`.
2. Sélection par raycast ; surbrillance ; panneau de propriétés (épaisseur, hauteur) via `UpdateWall`.
3. Undo/redo (Ctrl+Z / Ctrl+Maj+Z) branché sur les patchs inverses.
4. Export/import JSON (téléchargement + chargement de fichier).

**Critère de sortie** : dessiner une maison de 4 murs, changer l’épaisseur, annuler, sauvegarder, recharger.

### Week-end 1 : « un vrai bâtiment »

**Samedi.**

- Jonctions d’angle (degré 2, onglet) avec ses tests (90°, 45°, 10°, parallèles).
- Niveaux : `Level`, niveau actif, murs attachés avec décalage, sélecteur de niveau.
- Types de murs (`WallType` : épaisseur, couleur, couches), catalogue de 3 types.

**Dimanche.**

- Portes et fenêtres hébergées : outil à fantôme qui survole un mur, `offsetAlong`, tranches (section 5.3), validation dans la commande.
- `ChangeSet` minimal et régénération incrémentale (seuls les murs sales et leurs portes).
- Auto-sauvegarde ; si le temps le permet, persistance SQLite WASM.

**Critère de sortie** : une maison R+1 avec portes et fenêtres, qui suit quand on déplace un mur, et dont tout s’annule proprement.

### Week-end 2 : « la démo qui impressionne »

**Samedi.**

- Plan 2D (Canvas 2D) : poché = union des emprises (section 5.5), arcs de portes, sélection synchronisée avec la 3D.
- Pièces automatiques : union → trous, étiquettes avec surface au centre (`polylabel`), nom éditable.

**Dimanche.**

- Tableau de métrés en direct (surfaces de murs nettes, ouvertures, pièces) + export CSV.
- Coupe dynamique (section box), arêtes et ombres, soleil par date/heure.
- Déploiement (Vercel, Netlify ou Cloudflare Pages), GIF de démo de 90 secondes : dessiner, poser des portes, voir les pièces, couper, lire les métrés.

**Critère de sortie** : tu déplaces un mur, la porte suit, la pièce se recalcule, le tableau change, la coupe révèle l’intérieur. C’est le test de crédibilité de la section 1.1.

### Checklist de décisions à graver dès le jour 1

1. Une seule unité interne : **millimètres**, float64.
2. Repère **Z-up** ; conversion unique vers Three.js (groupe racine).
3. IDs stables (**ULID**) et références par ID, jamais par pointeur.
4. **Toute modification passe par une commande** (Immer, patchs inverses).
5. La géométrie est **dérivée**, jamais stockée dans le fichier.
6. **Tolérances nommées** (`SNAP`, `PARALLEL`, `MIN_AREA`) et arrondi à la grille avant tout booléen.
7. `schema_version` dans le fichier dès la première sauvegarde.
8. `core` et `geometry` n’importent jamais `three` ni `react`.

**Dernière critique.** Le risque principal de ce projet n’est pas technique, c’est le **périmètre**. Si tu dois renoncer à quelque chose, renonce dans cet ordre : IFC, cotation, toit, escaliers, familles personnalisées. Ne renonce jamais à : propagation paramétrique, jonctions propres, ouvertures hébergées, undo/redo, métrés en direct. Ce sont eux qui font un BIM, et eux seuls rendent tout le reste crédible.

## 11. Extension : réseaux MEP (plomberie, désenfumage, électricité)

**Réponse courte.** Avec les sections 1 à 10 telles quelles, non : le MEP était exclu du périmètre initial (section 1.3). Mais l’architecture le supporte bien, parce qu’un réseau MEP est exactement ce que décrit l’idée directrice : des éléments paramétriques dont la géométrie est dérivée. Ce qui change, c’est que la **topologie** (qui est raccordé à quoi) devient une donnée de premier rang. Cette section l’ajoute comme **extension post-MVP** (après le MVP de 2 mois).

**Ce qu’il est raisonnable de viser : visualiser, coordonner, quantifier.** Ce qu’il vaut mieux ne pas promettre : _dimensionner_ et _justifier réglementairement_ (débits, pertes de charge, sections de câbles, conformité d’un désenfumage). Ces calculs engagent la responsabilité d’un bureau d’études et dépendent des normes locales : c’est hors périmètre d’un projet solo. Ton logiciel sera un excellent outil de **coordination 3D** ; pas un outil de calcul réglementaire.

### 11.1 Ce qui se réutilise, ce qu’il faut ajouter

| Réutilisé tel quel                               | À ajouter                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Modèle Type/Instance, niveaux, IDs stables       | **Connecteurs (ports)** et **graphe de réseau**                                   |
| Commandes, undo/redo, journal d’opérations       | **Systèmes** (eau froide, évacuation, désenfumage C1…) avec couleur et discipline |
| Régénération incrémentale, graphe de dépendances | **Balayage (sweep)** d’un profil le long d’un chemin                              |
| Chunks, BVH, `rbush`, instanciation (section 8)  | **Raccords** (coudes, tés, réductions) générés ou posés                           |
| Métrés, vues en coupe, export IFC                | **Pénétrations** automatiques dans murs et dalles                                 |
| Index spatial 2D/3D                              | **Détection de collisions** entre systèmes et avec la structure                   |

### 11.2 Modèle de données

Trois familles d’éléments :

- **Segments** : tuyau, gaine, chemin de câbles, câble. Deux extrémités 3D, un profil (rond `Ø` ou rectangulaire `l × h`), un système.
- **Raccords** : coude, té, réduction, vanne, clapet coupe-feu. Un point, une orientation, des ports.
- **Équipements et terminaux** : appareil sanitaire, ventilateur, bouche de désenfumage, tableau électrique, luminaire, prise. Un point, une orientation, des ports.

**Principe : les ports sont _dérivés_ du type**, comme le reste de la géométrie. Un segment a deux ports (`start`, `end`) calculés depuis ses extrémités ; un té a trois ports définis dans son type. On ne stocke que les **connexions** : des paires `(élément, port) ↔ (élément, port)`.

```
System 1───* Element(MEP)
Element(MEP)
 ├─ Segment   (start, end, profile{shape,size}, systemId)   -- tuyau, gaine, chemin de câbles
 ├─ Fitting   (kind, position, orientation, ports[])        -- coude, té, réduction, vanne
 └─ Terminal  (kind, position, orientation, ports[])        -- appareil, bouche, prise, luminaire
Connection (elementA.portA ↔ elementB.portB)                -- les arêtes du graphe
```

Schéma relationnel (extension du schéma 4.3 ; remplace aussi le `CHECK` sur `category` par une table de référence, plus facile à faire évoluer par migration) :

```sql
CREATE TABLE category (id TEXT PRIMARY KEY);          -- 'wall','door','pipeSegment','ductSegment'...

CREATE TABLE mep_system (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL, color TEXT,
  discipline TEXT NOT NULL CHECK (discipline IN ('plumbing','hvac','smoke','electrical'))
);
CREATE TABLE mep_segment (
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  system_id TEXT NOT NULL REFERENCES mep_system(id),
  x1 REAL NOT NULL, y1 REAL NOT NULL, z1 REAL NOT NULL,
  x2 REAL NOT NULL, y2 REAL NOT NULL, z2 REAL NOT NULL,
  shape TEXT NOT NULL CHECK (shape IN ('round','rect')),
  size_a REAL NOT NULL,                  -- Ø nominal ou largeur (mm)
  size_b REAL                            -- hauteur si rectangulaire
);
CREATE TABLE mep_node (                   -- raccords et équipements
  element_id TEXT PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE,
  system_id TEXT REFERENCES mep_system(id), kind TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, rot_deg REAL NOT NULL DEFAULT 0
);
CREATE TABLE mep_connection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_element TEXT NOT NULL REFERENCES element(id) ON DELETE CASCADE, a_port TEXT NOT NULL,
  b_element TEXT NOT NULL REFERENCES element(id) ON DELETE CASCADE, b_port TEXT NOT NULL,
  UNIQUE (a_element, a_port), UNIQUE (b_element, b_port)   -- un port = une connexion
);
```

Structure JSON interne :

```json
{
  "systems": {
    "sys_ef": { "name": "Eau froide", "discipline": "plumbing", "color": "#2f80ed" },
    "sys_ds": { "name": "Désenfumage C1", "discipline": "smoke", "color": "#f2994a" }
  },
  "elements": {
    "p_01": {
      "category": "pipeSegment",
      "system": "sys_ef",
      "level": "lv_0",
      "start": [1000, 500, 2400],
      "end": [4000, 500, 2400],
      "profile": { "shape": "round", "size": 32 }
    },
    "f_01": {
      "category": "pipeFitting",
      "kind": "elbow90",
      "system": "sys_ef",
      "position": [4000, 500, 2400],
      "rotation": 0
    },
    "d_01": {
      "category": "ductSegment",
      "system": "sys_ds",
      "level": "lv_0",
      "start": [0, 3000, 2600],
      "end": [6000, 3000, 2600],
      "profile": { "shape": "rect", "size": [400, 250] }
    }
  },
  "connections": [{ "a": ["p_01", "end"], "b": ["f_01", "in"] }]
}
```

### 11.3 Géométrie : balayage, coudes, pénétrations, collisions

**Segment rond droit : un cylindre instancié.** Le cylindre unité (rayon 1, hauteur 1, axe Y) est dessiné avec `InstancedMesh` ; chaque segment est une matrice : position = milieu `M = (P1 + P2)/2`, orientation = rotation qui amène l’axe `Y` sur `d = (P2 − P1)/L` (`quaternion.setFromUnitVectors(Y, d)`), échelle `(r, L, r)`. **10 000 segments = un seul appel de dessin** (section 8.5). Pour les gaines rectangulaires : même principe avec un cube unité et une base orthonormée `(d, u, v)` où `u = normalize(cross(Z, d))` (horizontale) et `v = cross(d, u)` ; si `d` est quasi vertical (`|d·Z| > 0,99`), prends `X` comme référence à la place de `Z`.

**Coudes arrondis.** Pour un sommet `V` où la direction passe de `d1` à `d2`, avec un rayon de courbure `R` (typiquement 1,5 × le diamètre) :

- angle de déviation `φ = acos(d1·d2)` ;
- longueur à retrancher de chaque côté : `T = R · tan(φ/2)` ;
- points de tangence : `P1 = V − d1·T` et `P2 = V + d2·T` ;
- normale du plan de courbure vers l’intérieur : `n = normalize(d2 − d1·(d1·d2))` ;
- centre : `C = P1 + n·R` ; points de l’arc : `C + R·(−n·cos α + d1·sin α)` pour `α ∈ [0, φ]`.

On échantillonne l’arc (8 à 12 points) et on balaie un cercle le long du chemin complet avec `THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, rayon, 12)`. Pour un premier rendu, une **sphère au sommet** (rayon du tuyau) fait illusion à bas coût.

**Pénétrations dans les murs : réutilise la section 5.3.** Pour chaque segment qui traverse un mur, calcule le point d’entrée et de sortie dans l’emprise (intersection segment/polygone 2D + test de hauteur) ; crée une **ouverture de type `penetration`** de la taille du manchon (profil + jeu). Les ouvertures rectangulaires sont gérées par tranches ; une réservation ronde est approchée par un carré au début (un vrai trou rond demande `manifold-3d`). Pour les dalles, même idée avec un trou dans le contour (`earcut` accepte les trous).

**Détection de collisions en deux phases.**

1. _Phase large_ : `rbush` en plan ou BVH sur les boîtes englobantes (élargies du jeu) ; ne garde que les paires dont les boîtes se touchent.
2. _Phase fine_ : distance minimale entre deux axes de segments, comparée à `r1 + r2 + jeu`.

```ts
// Distance minimale entre deux segments 3D (Ericson, Real-Time Collision Detection)
function segSegDist(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1),
    d2 = sub(q2, p2),
    r = sub(p1, p2);
  const a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r);
  let s = 0,
    t = 0;
  if (a < EPS && e < EPS) {
    /* deux points */
  } else if (a < EPS) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e < EPS) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2),
        den = a * e - b * b; // 0 si parallèles
      s = den > EPS ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return dist(add(p1, mul(d1, s)), add(p2, mul(d2, t)));
}
```

Pour un segment contre un mur : test du segment contre le prisme de l’emprise (clipping de Liang–Barsky/slab sur les tranches). Chaque collision détectée devient un objet `Clash` (deux éléments, point, distance) affiché par une sphère rouge et listé dans un panneau cliquable : c’est l’une des fonctions BIM les plus appréciées en vrai chantier.

### 11.4 Discipline par discipline : ce qui est réaliste

**Plomberie (eau froide/chaude, évacuation).**

- _Réaliste_ : tuyaux ronds, coudes, tés, vannes, appareils sanitaires (placeholders paramétriques), couleurs par système, longueurs par diamètre dans les métrés. Évacuation : **pente** = `Δz / L` le long d’un segment ; vérifier une pente minimale est trivial et très parlant visuellement.
- _Hors périmètre_ : dimensionnement des diamètres et des débits (réglementation, tables de calcul).

**Désenfumage.**

- _Réaliste_ : gaines rectangulaires ou rondes, ventilateurs, volets coupe-feu, bouches, exutoires ; colorer les **zones de désenfumage** en regroupant des pièces (tu as déjà les pièces) ; mesurer les longueurs de gaines et la surface de tôle.
- _Hors périmètre_ : calcul des débits d’extraction, surfaces libres, dimensionnement des cantons. C’est de l’ingénierie réglementaire (normes locales à valider avec un bureau d’études) : ne laisse jamais croire que le logiciel _prouve_ la conformité.

**Électricité.** Deux représentations distinctes, à ne pas confondre :

1. _Physique 3D_ : chemins de câbles, conduits, tableaux, prises, luminaires ; câbles = polylignes fines suivant les chemins ; longueurs de câble par circuit dans les métrés.
2. _Schématique_ : schéma unifilaire généré depuis le graphe de connexions (nœuds = tableaux, protections, circuits ; arêtes = liaisons) et dessiné en SVG avec une mise en page automatique en arbre. C’est un très bon _wow_, et c’est faisable parce que tu as déjà un graphe.

- _Hors périmètre_ : calcul de sections, chute de tension, sélectivité des protections (formules simples, mais responsabilité réglementaire).

### 11.5 Architecture : un registre de catégories

Bon test de ton architecture : **ajouter le MEP ne doit pas obliger à modifier `core`.** Pour cela, chaque catégorie s’enregistre dans un registre qui fournit sa génération géométrique, ses dépendances, ses quantités et sa classe IFC :

```ts
interface CategoryDef<P> {
  id: string; // 'wall', 'pipeSegment', 'ductSegment'...
  generate(el: Element<P>, ctx: GenContext): GeometryPart[];
  dependencies(el: Element<P>): string[]; // ex. un coude dépend de ses segments voisins
  quantities(el: Element<P>): Quantity[];
  ports?(el: Element<P>): Port[]; // MEP : points de raccordement dérivés
  ifcClass: string; // 'IfcWall', 'IfcPipeSegment', 'IfcDuctSegment'...
}
registerCategory(pipeSegmentDef);
registerCategory(ductSegmentDef);
```

Nouveau paquet `packages/mep` (réseaux, ports, sweep, clash) qui dépend de `core` et de `geometry`, jamais l’inverse. Classes IFC utiles : `IfcPipeSegment`, `IfcPipeFitting`, `IfcDuctSegment`, `IfcDuctFitting`, `IfcCableCarrierSegment`, `IfcCableSegment`, `IfcSanitaryTerminal`, `IfcAirTerminal`, `IfcFan`, `IfcValve`, et `IfcDistributionSystem` pour les systèmes.

### 11.6 Rendu et ergonomie

- **Couleur par système** avec une légende ; choisis une palette et documente-la, car les conventions de couleur varient selon les pays et les bureaux d’études.
- **Filtres de visibilité par système et par discipline** ; mode _isoler_ un système.
- **Mode rayons X** : murs semi-transparents, MEP opaques ; très impressionnant sur une démo.
- **Flèches d’écoulement animées** : un décalage de texture ou de motif sur les tubes, orienté par la direction du flux (un attribut `flow` sur les segments).
- **Coupe dynamique** (section box) qui révèle un système à l’intérieur d’un plafond.
- **Performance** : tout passe par l’instanciation et les chunks de la section 8 ; ne crée jamais un `Mesh` par tuyau.

### 11.7 Plan d’implémentation (après le MVP de 2 mois)

| Étape  | Durée           | Contenu                                                                                                                                      | Critère de sortie                                                              |
| ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **M1** | 1 week-end      | Systèmes et couleurs ; tuyaux ronds instanciés ; outil polyligne (clics dans l’espace) ; coudes arrondis ; panneau de visibilité par système | Je trace un réseau d’eau froide et je le vois en 3D, coloré                    |
| **M2** | 1 week-end      | Ports et connexions ; raccords automatiques (coude, té, réduction) ; équipements placeholders ; métrés (longueurs par diamètre)              | Le réseau est un graphe : je supprime un tuyau, les raccords se mettent à jour |
| **M3** | 1 week-end      | Gaines rectangulaires ; ventilateurs, volets, bouches ; chemins de câbles et câbles ; zones de désenfumage colorées                          | Désenfumage et électricité visibles dans le même bâtiment                      |
| **M4** | 1 week-end      | Pénétrations automatiques dans murs et dalles ; détection de collisions ; export IFC MEP                                                     | Un panneau de collisions cliquable ; les trous apparaissent dans les murs      |
| **M5** | 1 à 2 week-ends | Auto-routage (A\* sur grille 3D de 100 à 200 mm, coût par coude) ; schéma unifilaire ; vérification de pente                                 | Je relie deux équipements et le tracé se génère                                |

Total : **4 à 6 week-ends**, en plus du MVP de 2 mois. Les étapes M1 à M4 suffisent pour obtenir une démo de coordination MEP convaincante.

### 11.8 Pièges spécifiques au MEP

- **Les raccords font exploser la combinatoire.** Commence par un coude, un té et une réduction génériques, paramétrés par les diamètres ; pas de catalogue de fabricant.
- **Sans connexions explicites, ce n’est qu’un dessin.** Sans graphe, tu ne peux ni supprimer un tronçon proprement, ni compter, ni exporter un système.
- **Volume visuel.** Un étage de bureau contient vite des dizaines de milliers de segments : instanciation, chunks, filtres par système, LOD dès M1.
- **Réservations rondes.** L’approximation par un carré est suffisante pour une démo ; ne pars pas sur les booléens 3D avant M4.
- **Dérive de périmètre vers le calcul.** Chaque fois que tu es tenté d’ajouter un dimensionnement, pose-toi la question : _qui est responsable si ce résultat est faux ?_ Garde ces fonctions hors du cœur, en modules optionnels clairement marqués comme indicatifs.
