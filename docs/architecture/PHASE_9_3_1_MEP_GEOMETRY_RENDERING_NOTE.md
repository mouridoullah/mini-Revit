# Note d'Architecture Préalable — Phase 9.3.1
## Géométrie Fondamentale et Rendu Graphique MEP 2D & 3D

**Projet :** Mini-BIM (`mini-Revit`)  
**Phase :** 9.3.1 — Géométrie Fondamentale & Rendu MEP 2D/3D (`feat/phase-9-3-1-mep-geometry-rendering`)  
**Date :** Novembre 2026  
**Auteurs :** Ingénieur Principal & Architecte Logiciel  
**Statut :** Cadrage Validé — Conception Géométrique & Graphique  

---

## 1. Périmètre Strict & Frontières Contractuelles

La Phase 9.3 a été découpée en trois sous-phases séquentielles indépendantes pour garantir la maîtrise de la complexité :
1. **Sous-phase 9.3.1 (Périmètre courant) :** Géométrie fondamentale, génération des maillages 3D, projection 2D symbolique unifilaire et bifilaire, repérage des ports ouverts/connectés, indexation spatiale `SpatialGrid2D`, filtrage par niveau et qualification métrologique.
2. **Sous-phase 9.3.2 :** Outils interactifs MEP (`MepTool`, accrochage/snap magnétique aux ports, prévisualisations en cours de tracé, `MepInspector.tsx`, Undo/Redo interactif).
3. **Sous-phase 9.3.3 :** Routage géométrique automatique (génération automatique des coudes 45°/90°, tés, réductions, respect des orientations de ports).

### Garde-fous et interdictions strictes pour la 9.3.1 :
- **Strictement proscrit :**
  - Aucun outil interactif de tracé en direct (`MepTool`) ni accrochage souris.
  - Aucun routage automatique de cheminement ni insertion automatique de raccords.
  - Aucune détection de collisions 3D (réservée à la Phase 9.4).
  - Aucun calcul hydraulique ou aéraulique (pertes de charge, débits, vitesses).
  - Aucun import IFC MEP.

---

## 2. Modèle Géométrique 3D MEP (`packages/view-3d/src/mesh-generator/mep.ts`)

Conformément à la modularisation engagée en Phase préparatoire (ADR-057), la génération géométrique 3D s'effectue dans un module autonome dédié `mep.ts` et réexporté via la façade `packages/view-3d/src/mesh-generator.ts`.

### 2.1 Tuyauteries (`Pipe`)
- **Topologie :** Cylindre solide extrudé entre le point de départ `start` ($P_0$) et le point d'arrivée `end` ($P_1$).
- **Vecteur directeur :** $\vec{d} = P_1 - P_0$, longueur $L = \|\vec{d}\|$.
- **Repère local orthogonal :** Construction de deux vecteurs unitaires normaux $\vec{u}$ et $\vec{v}$ tels que $(\vec{u}, \vec{v}, \hat{d})$ forme un trièdre orthonormé direct.
- **Discrétisation angulaire :** Anneau de $N$ sommets ($N = 12$ ou $16$ selon diamètre pour optimiser le budget mémoire/triangles tout en conservant une rotondité parfaite).
- **Sommets & Normales :**
  - Base de départ : $P_0 + r (\cos \theta \vec{u} + \sin \theta \vec{v})$ avec normale latérale $\cos \theta \vec{u} + \sin \theta \vec{v}$.
  - Base d'arrivée : $P_1 + r (\cos \theta \vec{u} + \sin \theta \vec{v})$ avec normale latérale identique.
  - Embouts fermés optionnels avec normales axiales $-\hat{d}$ et $+\hat{d}$.

### 2.2 Gaines de Ventilation (`Duct`)
- **Gaine circulaire (`shape === 'round'`) :** Même algorithme d'extrusion cylindrique que la tuyauterie avec rayon $R = \text{diameter} / 2$.
- **Gaine rectangulaire (`shape === 'rectangular'`) :** Extrusion prismatique droite à section rectangulaire ($\text{width} \times \text{height}$) le long de l'axe directeur. Orientation locale alignée avec le plan horizontal Z ou l'axe du conduit.

### 2.3 Chemins de Câbles (`CableTray`)
- **Structure physique :** Profilé en U ouvert sur le dessus pour permettre le cheminement des câbles.
- **Composants géométriques :**
  1. Semelle de fondation horizontale (dalle d'épaisseur 2 mm, largeur `width`).
  2. Deux ailes latérales verticales de rive (hauteur `height`, épaisseur 2 mm).
  3. Barreaux transversaux (échelons type échelle à câbles) espacés régulièrement (ex: tous les 300 mm).

### 2.4 Raccords Réseau (`MepFitting`)
- **Coude (`elbow`) :** Segment torique courbé à 90° ou 45° raccordant l'axe d'entrée et l'axe de sortie avec un rayon de courbure standard ($R_c = 1.5 \times D$).
- **Té de dérivation (`tee`) :** Cylindre/prisme principal reliant les deux ports alignés + manchon cylindrique/prismatique perpendiculaire vers le piquage.
- **Croix (`cross`) :** Cylindre principal + deux manchons opposés perpendiculaires.
- **Réduction / Transition (`transition`) :** Cône tronqué reliant deux diamètres distincts ou pyramide tronquée reliant deux sections rectangulaires.
- **Bouchon (`cap`) :** Disque ou plaque de fermeture terminale.

### 2.5 Équipements Techniques (`MepEquipment`)
- **Enveloppe 3D :** Parallélépipède rectangle orienté d'encombrement $\text{width} \times \text{depth} \times \text{height}$ centré sur `position` et orienté d'un angle $\theta_z$ autour de l'axe vertical Z.
- **Pastilles de ports :** Chaque port défini sur l'équipement génère un disque ou rectangle contrasté situé sur la face correspondante avec sa normale unitaire sortante $\vec{n}_{port}$.

---

## 3. Représentation Graphique en Plan 2D (`packages/view-2d/src/renderer/mep.ts`)

### 3.1 Codes Couleurs Normalisés par Système
Conformément aux normes graphiques d'ingénierie CVC / Plomberie / Électricité :

| Domaine | Type de Système | Code Hexadécimal | Désignation usuelle |
| :--- | :--- | :--- | :--- |
| **Plumbing** | `domestic_cold_water` | `#2563eb` (Bleu cobalt) | Eau Froide Sanitaire (EF) |
| **Plumbing** | `domestic_hot_water` | `#dc2626` (Rouge vif) | Eau Chaude Sanitaire (ECS) |
| **Plumbing** | `drainage_waste` | `#78716c` (Gris chaud) | Eaux Usées Ménagères (EU) |
| **Plumbing** | `drainage_soil` | `#44403c` (Brun sombre) | Eaux Vannes Noires (EV) |
| **HVAC** | `supply_air` | `#0284c7` (Cyan azur) | Air Soufflé / Air Neuf |
| **HVAC** | `return_air` | `#ea580c` (Orange ambré) | Air Repris |
| **HVAC** | `exhaust_air` | `#65a30d` (Vert chartreuse) | Air Rejeté / Vicié |
| **Hydronic** | `hydronic_supply` | `#0891b2` (Turquoise foncé) | Départ Chauffage / Climatisation |
| **Hydronic** | `hydronic_return` | `#be185d` (Rose carmin) | Retour Chauffage / Climatisation |
| **Electrical** | `power` / `telecom` | `#f59e0b` (Ambre soutenu) | Chemin de câbles / CFO / CFA |

### 3.2 Modes de Tracé : Unifilaire vs Bifilaire
- **Mode Unifilaire (`single-line`) :**
  - Utilisé à moyenne/petite échelle (plans d'ensemble 1:100, 1:200).
  - Tracé de l'axe central continu du conduit avec la couleur du système.
  - Épaisseur de trait standardisée ou indexée sur le diamètre nominal.
- **Mode Bifilaire (`double-line`) :**
  - Utilisé à grande échelle (détails 1:50, 1:20).
  - Tracé des deux génératrices extérieures délimitant le gabarit réel du conduit ($r = D/2$ de part et d'autre de l'axe).
  - Tracé d'un axe central fin en trait pointillé (`lineDash: [4, 4]`).
  - Pour les chemins de câbles : tracé des rives latérales + barreaux transversaux.

### 3.3 Pastilles Visuelles de Ports : Libres vs Raccordés
- **Port libre (non connecté) :** Petit anneau évidé (cercle de rayon 4 px, contour couleur du système, centre blanc ou translucide) signalant immédiatement à l'utilisateur que l'extrémité est ouverte et prête pour un futur raccordement.
- **Port connecté (associé à un `Connector`) :** Joint invisible ou discret (point plein minuscule 2 px) pour ne pas encombrer le dessin technique.

---

## 4. Indexation Spatiale & Culling (`packages/view-2d/src/spatial/`)

### 4.1 Calcul d'AABB 2D
Chaque élément MEP est projeté sur le plan horizontal XY pour obtenir son rectangle englobant $AABB = [X_{min}, Y_{min}, X_{max}, Y_{max}]$ :
- **`Pipe` / `Duct` / `CableTray` :**
  $X_{min} = \min(start.x, end.x) - r$, $X_{max} = \max(start.x, end.x) + r$,
  $Y_{min} = \min(start.y, end.y) - r$, $Y_{max} = \max(start.y, end.y) + r$.
- **`MepFitting` :** Boîte englobante de l'ensemble de ses ports $+ 50\text{ mm}$ de garde.
- **`MepEquipment` :** Boîte englobante du rectangle tourné de dimensions $(\text{width}, \text{depth})$ centré en $(position.x, position.y)$.

### 4.2 Insertion dans `SpatialGrid2D`
Les éléments sont insérés avec leur `levelId` respectif sous la catégorie correspondante (`pipe`, `duct`, `cableTray`, `mepFitting`, `mepEquipment`).
La requête spatiale de vue en plan (`SpatialGrid2D.queryIds`) filtre instantanément par `effectiveLevelId` et emprise de vue (Frustum Culling), assurant une élimination $\mathcal{O}(1)$ des éléments hors champ.

---

## 5. Exigences de Qualification & Rigueur Métrologique

1. **Rigueur sur les métriques :**
   - Toujours distinguer le temps d'exécution pur en mémoire (ms) du framerate du navigateur (FPS).
   - Distinguer les entrées de cellules explorées des identifiants uniques candidats.
   - Ne pas affirmer une garantie 60 FPS inconditionnelle à 10 000 entités ($P_{95} = 25.64\text{ ms}$).
2. **Couverture de tests :**
   - Matrice complète CRUD MEP (Pipe, Duct, CableTray, Fitting, Equipment $\times$ Add, Update, Delete, Undo/Redo).
   - Génération géométrique 3D pour les 5 catégories d'éléments.
   - Projection graphique 2D unifilaire / bifilaire, codes couleurs et pastilles de ports.
   - Indexation et filtrage par niveau sans régression.
