# REGISTRE DES DÉCISIONS D'ARCHITECTURE (ADR) — MINI-BIM

**Statut global :** Registre Officiel de Décisions Techniques  
**Dernière mise à jour :** 22 novembre 2026

---

## Sommaire des ADRs

| Réf.        | Titre de la Décision                                                                           |    Statut    |    Date    |
| :---------- | :--------------------------------------------------------------------------------------------- | :----------: | :--------: |
| **ADR-001** | Modèle BIM comme Source de Vérité Unique (Géométrie = Cache Dérivé)                            | **Accepté**  | 13/11/2026 |
| **ADR-002** | Découplage Impératif des Moteurs de Vues (Canvas 2D / Three.js vs React)                       | **Accepté**  | 13/11/2026 |
| **ADR-003** | Standardisation des Unités et Repères Spatiaux (Millimètres Float64 & Z-Up)                    | **Accepté**  | 13/11/2026 |
| **ADR-004** | Découpe d'Ouvertures par Tranches 2.5D (Sutherland-Hodgman)                                    | **Accepté**  | 13/11/2026 |
| **ADR-005** | Résolution Topologique des Jonctions de Murs et Limites d'Onglet                               | **Accepté**  | 13/11/2026 |
| **ADR-006** | Gestion des Mutations et Undo/Redo par Command Pattern Typé                                    | **Accepté**  | 13/11/2026 |
| **ADR-007** | Stratégie de Persistance Hybride (JSON Versionné puis SQLite WASM/OPFS)                        | **Accepté**  | 13/11/2026 |
| **ADR-008** | Détection Hybride et Stabilité Sémantique des Pièces (Rooms)                                   | **Accepté**  | 13/11/2026 |
| **ADR-009** | Architecture d'Extensibilité pour les Réseaux MEP (Category Registry)                          | **Accepté**  | 13/11/2026 |
| **ADR-010** | Révision des Tolérances Numériques, Typage des Intersections et Rejet de l'Arrondi Prématuré   | **Accepté**  | 13/11/2026 |
| **ADR-011** | Moteur de Jonctions de Murs Déterministe (L, T, X, Colinéaire et Multi-branches)               | **Accepté**  | 13/11/2026 |
| **ADR-012** | Directives de Robustesse Topologique et Clôture des Jonctions (Audit Approfondi Phase 1)       | **Accepté**  | 13/11/2026 |
| **ADR-013** | Formalisation et Validation des Percements d'Ouvertures 2.5D (Phase 1.2)                       | **Accepté**  | 13/11/2026 |
| **ADR-014** | Gouvernance et Traçabilité des Métriques de Rapports (CI Verbatim)                             | **Accepté**  | 13/11/2026 |
| **ADR-015** | RawMeshData et Buffers Neutres pour Rendu 3D (sans dépendance Three.js)                        | **Accepté**  | 13/11/2026 |
| **ADR-016** | Stratégie Hybride de Triangulation 2D (Triangle Fan O(n) + Ear Clipping earcut)                | **Accepté**  | 13/11/2026 |
| **ADR-017** | Traitement des Interfaces de Contact Internes entre Pièces Adjacentes (Modular Solid Block)    | **Accepté**  | 13/11/2026 |
| **ADR-018** | Architecture Impérative de view-3d sans React, Rendu à la Demande et Backface Culling          | **Accepté**  | 13/11/2026 |
| **ADR-019** | Architecture du Noyau BIM — BimDocument, CommandBus et Undo/Redo via Immer                     | **Accepté**  | 13/11/2026 |
| **ADR-020** | Stratégie d'Identifiants Uniques — Adoption d'ULID pour le Noyau BIM                           | **Accepté**  | 13/11/2026 |
| **ADR-021** | Architecture Impérative de view-2d sans React, Émission de Command, Conversion Y-up/Y-down     | **Accepté**  | 13/11/2026 |
| **ADR-022** | Intégration React dans apps/web — Viewports Impératifs Isolés, Contexte Documentaire           | **Accepté**  | 13/11/2026 |
| **ADR-023** | Génération de Maillages 3D dans @mini-bim/view-3d via Interfaces Géométriques Neutres          | **Accepté**  | 14/11/2026 |
| **ADR-024** | Architecture des Outils Interactifs 2D (State Machines Pures, Snapping 45° et Pont DOM)        | **Accepté**  | 14/11/2026 |
| **ADR-025** | Sélection UI Partagée Bidirectionnelle (État Éphémère React vs Pureté Documentaire)            | **Accepté**  | 14/11/2026 |
| **ADR-026** | Picking 3D Déterministe via Raycasting, userData et Permutation de Matériau Partagé            | **Accepté**  | 14/11/2026 |
| **ADR-027** | Remplacement de BimDocument sans Recréation de Contexte Graphique (setDocument vs Re-Key)      | **Accepté**  | 14/11/2026 |
| **ADR-028** | Modèle Paramétrique 1D des Ouvertures Hébergées, Validation et Cascade Transactionnelle        | **Accepté**  | 14/11/2026 |
| **ADR-029** | Rendu 2D/3D Multi-Pièces des Murs Percés, Débattements Angulaires et Placeholders              | **Accepté**  | 14/11/2026 |
| **ADR-030** | Outils Interactifs pour Ouvertures et Déplacement de Murs (Machines à États Pures)             | **Accepté**  | 14/11/2026 |
| **ADR-031** | Détection des Pièces par Union Booléenne des Murs, Point d'Ancrage Seed et Polylabel           | **Accepté**  | 14/11/2026 |
| **ADR-032** | Cascade et Cycle de Vie des Rooms (Option B : Suppression en Cascade)                          | **Obsolète** | 14/11/2026 |
| **ADR-033** | Stratégie d'Exportation IFC — Générateur Natif TypeScript STEP ISO 10303-21                    | **Accepté**  | 14/11/2026 |
| **ADR-034** | Cotations 2D Associatives et Propagation Paramétrique Bidirectionnelle                         | **Accepté**  | 14/11/2026 |
| **ADR-035** | Architecture des Dalles Horizontales (`Slab`), Représentation Polygonale 2D et Extrusion 3D    | **Accepté**  | 15/11/2026 |
| **ADR-036** | Gestion du Multi-Niveaux, Altimétrie Paramétrique et Rendu Fantôme (`Underlay`)                | **Accepté**  | 15/11/2026 |
| **ADR-037** | Modèle Paramétrique d'Escalier (`Stair`) et Découpe Automatique de Trémie                      | **Accepté**  | 15/11/2026 |
| **ADR-038** | Relations Déclaratives Inter-Entités et Moteur de Cascade Générique (`RELATIONS_REGISTRY`)     | **Accepté**  | 15/11/2026 |
| **ADR-039** | Cycle de Vie Non-Destructif des Pièces (Statut Dérivé `Enclosed` / `Unenclosed`)               | **Accepté**  | 15/11/2026 |
| **ADR-040** | Contrainte Altimétrique Supérieure des Murs (`topConstraint`) et Sous-Face de Dalle            | **Accepté**  | 15/11/2026 |
| **ADR-041** | Architecture du Graphe de Dépendances Minimal (DAG) et Moteur de Propagation Générique         | **Accepté**  | 15/11/2026 |
| **ADR-042** | Généralisation du Modèle Type / Instance (`SlabType`, `DoorType`, `WindowType`)                | **Accepté**  | 15/11/2026 |
| **ADR-043** | Migration de Schéma Documentaire v2 et Préservation Intégrale des Familles                     | **Accepté**  | 15/11/2026 |
| **ADR-044** | Étirement Élastique des Murs, Résolution de Connectivité, Compensation des Baies et Garde-fous | **Accepté**  | 15/11/2026 |
| **ADR-045** | Modèle Dalles, SlabType, Migration de Schéma v1→v2 et Résolution des Trémies                   | **Accepté**  | 15/11/2026 |
| **ADR-046** | PropertyInspector Unifié, SlabTool Interactif, Rendu 2D/3D Dalles et LevelSelector             | **Accepté**  | 15/11/2026 |
| **ADR-047** | Purge des Champs Transitoires V1, Underlay Vectoriel Path2D et Snapping Inter-Niveaux          | **Accepté**  | 15/11/2026 |
| **ADR-048** | Escalier Paramétrique Droit, Formule de Blondel, Dérivation de Trémie et Rendering Crénelé    | **Accepté**  | 15/11/2026 |
| **ADR-049** | Résolveur Unique de Géométrie de Mur (`resolveWallGeometry` — S1-1 + S1-4)                     | **Accepté**  | 15/11/2026 |
| **ADR-050** | Unification des Données Dérivées, Invalidation de Cache & Matériaux Partagés (S1-2, S2-3, S2-5) | **Accepté**  | 15/11/2026 |
| **ADR-051** | Persistance Locale Automatique via IndexedDB & Sécurisation de Session (S2-8)                  | **Accepté**  | 15/11/2026 |
| **ADR-052** | Dépendance Contrôlée de view-2d vers core pour Fonctions Pures (Amendement ADR-021 & ADR-029)  | **Accepté**  | 15/11/2026 |
| **ADR-053** | Toitures (Plat & 2 Pans), Biseautage des Murs sous Toiture via topProfile et Trémies de Toit   | **Accepté**  | 15/11/2026 |
| **ADR-054** | Composants Architecturaux, Mobilier Paramétrique & Interopérabilité IFC4 (Phase 8)             | **Accepté**  | 18/11/2026 |
| **ADR-055** | Modularisation du Noyau, Propagation DAG des Composants Hébergés et Qualification Système       | **Accepté**  | 19/11/2026 |
| **ADR-056** | Modèle Sémantique MEP et Graphe Topologique de Réseau Découplé (Phase 9.2)                     | **Accepté**  | 19/11/2026 |
| **ADR-057** | Indexation Spatiale 2D et Modularisation des Générateurs Graphiques (Phase 9.3)                 | **Accepté**  | 19/11/2026 |
| **ADR-058** | Routage Géométrique Déterministe 3D et Insertion Paramétrique des Raccords MEP (Phase 9.3.3)    | **Accepté**  | 19/11/2026 |
| **ADR-059** | Moteur de Détection des Conflits 3D, Index Spatial BVH et Qualification Sémantique (Phase 9.4)  | **Accepté**  | 20/11/2026 |
| **ADR-060** | Modèle de Référence Fédéré IFC en Lecture Seule & Coordination Spatiale Inter-Maquettes (Phase 9.5) | **Accepté**  | 20/11/2026 |
| **ADR-061** | Design System Graphite Engineering, CSS Modules et Icônes Lucide | **Accepté**  | 20/11/2026 |
| **ADR-062** | Scalabilité du Noyau 10k — Indexation Paresseuse O(1), Partage Structurel CSG et DAG Incrémental Différentiel (Phase 10) | **Accepté**  | 21/11/2026 |
| **ADR-063** | Coupes 2D Dynamiques, Élévations de Façade, Plans de Coupe 3D et Export Vectoriel SVG Normalisé (Saison 3 - Étape 2) | **Accepté**  | 22/11/2026 |

---

## ADR-001 : Modèle BIM comme Source de Vérité Unique (Géométrie = Cache Dérivé)

### Contexte

Dans les logiciels de modélisation 3D génériques (SketchUp, Blender), la géométrie polygonale (arêtes, polygones, normales) constitue la donnée primaire. Dans un logiciel d'architecture BIM (Revit, Archicad), l'utilisateur manipule des entités conceptuelles (un mur d'un axe $A \to B$ avec une épaisseur, une hauteur et un type de matériau). Si la géométrie 3D devient la source de données, la sémantique architecturale se perd, rendant impossibles les métrés automatiques, la propagation des modifications et l'interopérabilité IFC.

### Décision

Le modèle BIM sémantique (dictionnaires d'entités typées en mémoire) est l'unique source de vérité.  
Les représentations géométriques 2D (tracés en plan) et 3D (maillages Three.js `BufferGeometry`) sont des **caches dérivés temporaires**, totalement destructibles et recalculés à la demande par le moteur de régénération. Aucun maillage 3D n'est jamais sauvegardé dans le fichier de projet.

### Justification & Avantages

- Fichiers de projet ultra-légers (quelques kilo-octets pour une maison entière).
- Fichiers entièrement diffables dans Git et compatibles avec des formats d'échange textuels clairs.
- Garantie d'absence de désynchronisation entre les vues 2D, les vues 3D et les tableaux de quantités.

### Alternatives Rejetées

- _Stockage des géométries 3D sérialisées (objets Three.js sérialisés) :_ Rejeté car source de désynchronisation fatale et gonflement inutile des fichiers.

---

## ADR-002 : Découplage Impératif des Moteurs de Vues (Canvas 2D / Three.js vs React)

### Contexte

L'interface utilisateur de Mini-BIM comprend des composants applicatifs riches (arborescence du projet, inspecteur de propriétés, tableaux de métrés dynamiques) et deux fenêtres de dessin intensives (vue en plan 2D et vue 3D). Utiliser un modèle déclaratif React complet (comme React Three Fiber pour la 3D ou des composants SVG React pour la 2D) pour les fenêtres graphiques entraîne des re-rendus massifs et des allocations mémoire excessives lors des manipulations continues à la souris (pointermove, glisser-déplacer).

### Décision

React est strictement confiné à l'interface applicative (UI chrome, panneaux, fenêtres de dialogue, tableaux).  
Les viewports graphiques (`Viewport2D` et `Viewport3D`) sont des classes TypeScript impératives instanciées une seule fois et montées sur un `<canvas>`. Ils s'abonnent directement aux événements de patch du moteur BIM (`doc.on('patch', ...)`), avec une boucle de rendu cadencée à la demande (on-demand rendering).

### Justification & Avantages

- Cadence d'affichage fluide garantie ($\ge 60$ FPS) sans aucune interférence avec le cycle de réconciliation de React.
- Absence d'allocations de ramasse-miettes (`garbage collection`) lors des déplacements de curseur.
- Contrôle fin des ressources graphiques Three.js (appel explicite à `dispose()` sur les géométries et matériaux obsolètes).

### Alternatives Rejetées

- _React Three Fiber (R3F) pour le viewport 3D :_ Rejeté pour le viewport d'édition principal en raison de la surcharge du reconciler déclaratif lors de mutations géométriques fréquentes.

---

## ADR-003 : Standardisation des Unités et Repères Spatiaux (Millimètres Float64 & Z-Up)

### Contexte

La coexistence d'unités multiples (mètres pour Three.js, millimètres pour la construction, centimètres pour certains composants) et de conventions de repères opposées (Z-up en BIM/IFC vs Y-up dans Three.js et WebGL) est la première cause de régressions dans les outils de CAO.

### Décision

1. Une seule unité interne universelle : **millimètres (`mm`)** en nombres flottants 64 bits (`float64`).
2. Repère mondial cartésien direct **Z-up** ($+X$ = Est, $+Y$ = Nord, $+Z$ = Zénith / Hauteur).
3. La conversion vers le repère Three.js ($Y$-up, mètres) est strictement isolée au niveau d'un nœud racine Three.js unique (`modelRoot`), configuré avec une rotation fixe $R_x(-\pi/2)$ et un facteur d'échelle uniforme $0,001$. Aucune coordonnée interne n'est convertie en mètres avant l'étape de rendu.

### Justification & Avantages

- Précision millimétrique exacte pour le bâtiment sans accumulation d'erreurs d'arrondi décimales.
- Alignement natif avec les schémas IFC (`IfcCartesianPoint` standardisé en mm pour les profils et le placement d'étages).
- Zéro coût de calcul sur le thread principal pour la conversion de repère.

---

## ADR-004 : Découpe d'Ouvertures par Tranches 2.5D (Sutherland-Hodgman)

### Contexte

L'insertion de portes et fenêtres nécessite de percer des trémies précises dans les murs porteurs. Les bibliothèques génériques de géométrie constructive solide (CSG) en 3D (ex: Three-CSG ou Manifold-3D) souffrent d'une grande lourdeur binaire (WASM de plusieurs mégaoctets), de lenteur relative et d'instabilités numériques fréquentes sur les faces coplanaires.

### Décision

Pour tous les murs droits verticaux, la soustraction des ouvertures rectangulaires s'effectue par **découpe en tranches verticales 2.5D** le long de l'axe du mur via l'algorithme d'écrêtage de Sutherland-Hodgman.  
Un mur percé de $N$ ouvertures est découpé en tranches pleines hauteurs, allèges (sous les fenêtres) et linteaux (au-dessus des portes/fenêtres).

### Justification & Avantages

- Algorithme ultra-robuste de moins de 50 lignes de code, déterministe et sans division flottante instable.
- Vitesse d'exécution quasi-instantanée ($< 0.1$ ms par mur percé).
- Triangulation directe en quadrilatères convexes sans recours à des bibliothèques externes lourdes.
- Possibilité d'introduire ultérieurement `manifold-3d` en Phase 6 uniquement pour les réservations complexes non rectangulaires (ex: traversées de gaines circulaires obliques).

---

## ADR-005 : Résolution Topologique des Jonctions de Murs et Limites d'Onglet

### Contexte

Lorsque plusieurs murs se rencontrent en un nœud (angles en L, aboutements en T, carrefours en croix), leurs emprises volumiques ne doivent ni se chevaucher (ce qui fausserait les métrés et produirait des artefacts graphiques de z-fighting) ni laisser de vide. L'algorithme en étoile proposé initialement échoue sur les murs colinéaires et les intersections en T.

### Décision

Mettre en place un **modèle topologique explicite de classification de nœuds** :

1. _Degré 1 :_ Bout libre avec coupe droite orthogonale.
2. _Degré 2 (Angle non plat) :_ Coupe en onglet (miter) avec intersection des arêtes de face. Une **limite d'onglet** (`MITER_LIMIT_RATIO = 4.0`) est appliquée : si l'angle est trop aigu ($< 29^\circ$), la pointe est automatiquement tronquée par un biseau orthogonal.
3. _Degré 2 (Colinéaire) :_ Murs continus sans coupure d'extrémité.
4. _Degré 3 (T-junction) :_ Le mur traversant est déclaré prioritaire et reste continu ; l'extrémité du mur secondaire incident est découpée pour venir buter exactement sur la face latérale du mur porteur.

### Justification & Avantages

- Rendu architectural impeccable des plans 2D et des solides 3D sans chevauchement.
- Respect strict des calculs de quantités de matériaux.
- Élimination des artefacts d'explosion géométrique sur les angles aigus.

---

## ADR-006 : Gestion des Mutations et Undo/Redo par Command Pattern Typé

### Contexte

L'utilisation de patchs JSON bruts non typés (Immer `produceWithPatches`) enregistrés sans discernement à chaque micro-action provoque une consommation mémoire incontrôlée, ne donne aucune sémantique métier à l'historique et rend complexe la validation d'invariants lors de l'annulation.

### Décision

Toute modification du modèle passe par une **classe de Commande transactionnelle typée** (`AddWallCommand`, `MoveWallCommand`, `InsertDoorCommand`, `DeleteElementCommand`).  
Chaque commande :

1. Valide les pré-conditions et invariants métier.
2. Produit un enregistrement de transaction contenant son delta inverse explicite.
3. S'enregistre dans une pile d'historique bornée (Undo/Redo Stack).
   Immer est utilisé comme outil technique interne dans les fonctions d'application de transition d'état, mais l'API de haut niveau reste strictement régie par le bus de commandes.

### Justification & Avantages

- Historique descriptif compréhensible pour l'utilisateur ("Annuler : Insertion Porte").
- Réversibilité atomique et déterministe garantie.
- Sérialisation aisée du journal d'opérations pour audit et collaboration future.

---

## ADR-007 : Stratégie de Persistance Hybride (JSON Versionné puis SQLite WASM/OPFS)

### Contexte

Un logiciel BIM a besoin d'une persistance fiable, portable et rapide. Introduire immédiatement un serveur de base de données distant (PostgreSQL) imposerait une latence réseau inacceptable lors de l'édition et une complexité d'infrastructure inutile au démarrage.

### Décision

1. **Étape 1 (MVP) :** Modèle normalisé en mémoire, persisté sous forme de fichier JSON unifié avec numéro de version de schéma explicite (`schema_version: 1`) et validation Zod au chargement.
2. **Étape 2 (Consolidation) :** Persistance locale transactionnelle via **SQLite compilé en WASM** exploitant l'OPFS (Origin Private File System) du navigateur. Le schéma SQLite utilise des colonnes typées pour les requêtes relationnelles et une colonne JSON pour les paramètres extensibles.
3. **Étape 3 (Serveur / Post-MVP) :** Réplication vers PostgreSQL utilisant le schéma relationnel identique défini pour SQLite.

### Justification & Avantages

- Démarrage immédiat sans friction d'infrastructure.
- Évolution sans rupture : le modèle de données SQLite est rigoureusement aligné sur le modèle JSON en mémoire.

---

## ADR-008 : Détection Hybride et Stabilité Sémantique des Pièces (Rooms)

### Contexte

La détection de pièces par simple union booléenne d'emprises de murs fait disparaître une pièce dès qu'un interstice de 1 mm apparaît (fuite de contour). De plus, une pièce ne doit pas perdre son nom, son numéro ou son identifiant lorsque l'utilisateur déplace légèrement une cloison.

### Décision

1. Une pièce est définie de manière persistante par son identité (`id`, `name`, `number`) et son point d'ancrage (`seedPoint`).
2. Lors de la régénération, les polygones de pièces sont recalculés à partir des limites fermées. Un test de point dans le polygone associe chaque contour reconstruit au `Room` correspondant à son `seedPoint`.
3. Si un interstice empêche la fermeture, le contour est marqué comme non étanche (`unclosed`), et un avertissement visuel surligne les arêtes ouvertes pour guider l'utilisateur.

### Justification & Avantages

- Stabilité des identifiants et des annotations de pièces lors de l'édition architecturale.
- Détection des erreurs de saisie pour l'architecte.

---

## ADR-009 : Extensibilité du Modèle pour les Réseaux MEP (Category Registry)

### Contexte

L'extension future du logiciel vers les réseaux techniques MEP (plomberie, ventilation, électricité) ne doit pas déstabiliser ni polluer le noyau architectural initial.

### Décision

Mettre en place dans `@mini-bim/core` un registre d'extensions par catégories (`CategoryDef`). Le noyau ne code en dur que les catégories architecturales de base (`wall`, `door`, `window`, `slab`, `roof`, `room`).  
Le futur module MEP (`@mini-bim/mep`) enregistrera ses propres catégories (`pipeSegment`, `ductSegment`, `mepFitting`) et définira ses algorithmes de balayage géométrique (`sweep`), ses connecteurs (ports) et ses classes IFC sans modification du code de base.

### Justification & Avantages

- Respect total du principe Ouvert/Fermé (Open/Closed Principle de SOLID).
- Isolation complète du code architectural et du code réseau.

---

## ADR-010 : Révision des Tolérances Numériques, Typage des Intersections et Rejet de l'Arrondi Prématuré

### Contexte

La conception initiale comportait trois écueils mathématiques :

1. Une proposition d'arrondi systématique des coordonnées à $1\text{ mm}$ avant les calculs booléens.
2. Une confusion potentielle entre le zéro calculatoire, la coïncidence géométrique continue et la tolérance de fusion topologique des murs.
3. Des résultats d'intersections représentés par des valeurs binaires ou des points optionnels (`Vec2 | null`), incapables de discriminer le parallélisme, la colinéarité sans contact, le contact en un sommet, le chevauchement sur un sous-segment et les cas dégénérés.

### Décision

1. **Rejet formel de l'arrondi systématique à 1 mm :** Le noyau géométrique `@mini-bim/geometry` calcule strictement en espace continu IEEE 754 float64. L'arrondi au millimètre est proscrit dans les calculs bas niveau car il introduit des distorsions d'épaisseur ($\approx +0.82\text{ mm}$ à $45^\circ$) et déplace les intersections de plusieurs centimètres sur les angles aigus.
2. **Pyramide des tolérances :**
   - $\text{EPSILON\_NUMERICAL} = 10^{-9}$ (déterminants, normalisation, zéro arithmétique).
   - $\text{EPSILON\_DISTANCE} = 10^{-4}\text{ mm}$ ($0.1\ \mu m$, seuil de coïncidence géométrique continue, situé $450\,000 \times$ au-dessus du bruit d'arrondi machine et $1\,000 \times$ plus fin que la tolérance de construction).
   - $\text{EPSILON\_COLLINEAR} = 10^{-6}\text{ rad}$ (tolérance angulaire).
   - $\text{VERTEX\_MERGE_TOLERANCE} = 1.0\text{ mm}$ : Confiné exclusivement à la couche topologique applicative (`@mini-bim/core`), strictement interdit dans `@mini-bim/geometry`.
3. **Typage discriminant exhaustif des intersections :**  
   Définition de `LineIntersectionResult` et `SegmentIntersectionResult` sous forme de tagged unions TypeScript représentant sans ambiguïté :
   - `point` (avec paramètres scalaires $t, u$)
   - `none` (disjoints)
   - `parallel` (droites parallèles non confondues)
   - `collinear` (droites confondues)
   - `overlap` (segments colinéaires avec sous-segment de chevauchement et intervalles $[t_{min}, t_{max}], [u_{min}, u_{max}]$)
   - `degenerate` (segments ou vecteurs directeurs de longueur nulle).
4. **Comportement déterministe sur les cas dégénérés :**  
   `normalize` sur un vecteur nul retourne `{ x: 0, y: 0 }` sans lancer d'exception et sans propager de `NaN` ou `Infinity`.

### Justification & Avantages

- Élimination des régressions géométriques silencieuses.
- Exhaustivité du traitement des cas limites à la compilation grâce au pattern matching sur les tagged unions.
- Stabilité mathématique prouvée des calculs d'emprise et d'intersection.

---

## ADR-011 : Moteur de Jonctions de Murs Déterministe (L, T, X, Colinéaire et Multi-branches)

### Contexte

Les logiciels de dessin 2D traditionnels se contentent souvent de superposer des polygones rectangulaires, créant des chevauchements de volumes (double comptage dans les métrés) ou des artefacts de rendu. Dans un logiciel BIM, les jonctions de murs doivent produire une géométrie continue, étanche et déterministe tout en préservant intacts les axes de référence paramétriques des éléments hôtes.

### Décision

1. **Découplage modulaire du moteur de jonctions :**  
   Organisation en sous-systèmes spécialisés (`topology`, `miter`, `t-junction`, `x-junction`, `collinear`, `multi`, `engine`).
2. **Règle de continuité et de priorité :**
   - **Jonction en T :** Le mur traversant conserve son emprise nominale sans être tronçonné. Le mur aboutant est biseauté sur la face réelle d'impact (intérieure ou extérieure, déterminée par le signe du produit scalaire $\vec{u}_{\text{approach}} \cdot \vec{n}_{\text{through}}$).
   - **Jonction en X :** Le mur prioritaire traverse l'intersection intact. Le mur secondaire est scindé en deux branches autonomes raccordées sur les faces opposées du mur prioritaire, éliminant tout doublon de volume.
   - **Jonction en L :** Raccordement par onglet miter partagé, avec contrôle de la limite d'onglet (`MITER_LIMIT_RATIO = 4.0`). Sur angle très aigu ($< 14.36^\circ$), troncature biseautée automatique.
   - **Jonctions multiples ($\ge 3$ branches) :** Algorithme radial CCW appariant le bord gauche d'un mur au bord droit de son voisin angulaire consécutif.
3. **Invariance et Déterminisme :**  
   Les résultats géométriques sont rigoureusement invariants par translation et rotation, et indépendants de l'ordre d'insertion des murs dans la liste.

### Justification & Avantages

- Conservation exacte des surfaces théoriques des pièces et des métrés de murs.
- Prévention du phénomène de z-fighting en 3D et des doubles pochés en 2D.
- Raccordement sans faille pour le futur calcul automatique des pièces fermées.

---

## ADR-012 : Directives de Robustesse Topologique et Clôture des Jonctions (Audit Approfondi Phase 1)

### Contexte

L'audit approfondi du moteur de jonctions de murs `@mini-bim/geometry` a validé 115 tests automatisés (orientation CCW, simplicité polygonale de Jordan, invariance par rotation/translation, coordonnées à 1 km). Cependant, l'examen analytique détaillé a mis en évidence trois situations géométriques limites nécessitant un traitement renforcé avant le passage aux percements 2.5D :

1. **Bevel Gap dans `solveLMiter` :** Sur angle très aigu avec biseau activé, la troncature indépendante des deux murs crée un vide géométrique triangulaire à l'angle extérieur car les murs ne partagent pas d'arête de biseau commune.
2. **Effondrement sur angle $0^\circ$ dans `engine.ts` :** Deux murs incidents de même direction au même nœud étaient envoyés dans le solveur d'onglet L, faisant converger les sommets sur le point de nœud par parallélisme des bords.
3. **Pincement au centre dans `multi.ts` :** Deux branches radialement consécutives séparées par $180^\circ$ provoquaient l'effondrement du sommet partagé sur le centre du nœud.

### Décision

1. **Adoption de la Recommandation B (Corrections ciblées préalables) :**  
   Le passage à la Phase 1.2 (percement d'ouvertures par Sutherland-Hodgman) est subordonné à la résolution de ces trois anomalies géométriques afin de garantir l'étanchéité absolue (watertightness) des contours avant toute opération booléenne de découpe.
2. **Règle de Clôture d'Onglet Étanche (Watertight Bisector Clamping) :**  
   Tout biseau d'onglet doit être borné par un plan de coupe bissecteur, les deux murs se rejoignant sur une arête de contact commune $\vec{V}_{\text{int}} \to \vec{M}_{\text{bisector}}$.
3. **Contrôle Strict des Angles Dégénérés :**  
   Les paires de murs présentant $\vec{d}_1 \cdot \vec{d}_2 \ge 1 - \text{EPSILON\_COLLINEAR}$ sont formellement isolées et traitées comme des superpositions colinéaires à élaguer selon la priorité.

### Justification & Avantages

- Élimine tout risque de génération de maillages non-manifold ou troués lors de l'extrusion 3D.
- Garantit que l'algorithme d'écrêtage 2.5D des ouvertures s'exécute sur des polygones de murs strictement convexes ou quasi-convexes continus.
- Consolide les fondations géométriques du Mini-BIM au niveau d'exigence des meilleurs moteurs CAO professionnels.

---

## ADR-013 : Formalisation et Validation des Percements d'Ouvertures 2.5D (Phase 1.2)

### Contexte

Dans la continuité d'ADR-004, l'implémentation effective du moteur de percements (`@mini-bim/geometry/openings`) requiert une formalisation stricte de la complexité algorithmique, des règles de validation déterministes et de la conservation volumique de matière lors du découpage de baies (portes et fenêtres) dans les murs résolus par le moteur de jonctions.

### Décision

1. **Complexité Nommée Explicite :**  
   Le partitionnement par tranches s'effectue en $\mathcal{O}(k \cdot m)$ où $k$ est le nombre d'ouvertures sur le mur hôte et $m$ est le nombre de sommets du polygone résolu du mur.
2. **Rejet des Moteurs Booléens 2D Génériques pour les Baies :**  
   L'utilisation de bibliothèques booléennes polygonales génériques (`polygon-clipping` / `Clipper2`) pour découper les baies est formellement rejetée pour le corps du mur. Une ouverture architecturale n'est pas un trou 2D dans une feuille plate : elle génère une allège, un vide réservé et un linteau. L'écrêtage par demi-plan perpendiculaire à l'axe (Sutherland-Hodgman) produit directement des quadrilatères et pentagones convexes continus, idéaux pour l'extrusion 3D sans triangulation complexe.
3. **Règles de Validation Strictes :**
   - Garde minimale de sécurité : $\text{MIN\_OPENING\_CLEARANCE} = 50.0\text{ mm}$ aux extrémités et entre baies contiguës.
   - Rejet immédiat de toute baie qui sévère le mur ($W \ge L$ ou $L < W + 2 \times \text{clearance}$) via le code d'erreur `SEVERS_WALL`.
   - Contrôle d'altitude : $Z_{\text{allège}} \ge 0$ et $Z_{\text{allège}} + H \le H_{\text{mur}}$ (`HEIGHT_EXCEEDS_WALL`).
4. **Conservation de Matière Déterministe :**  
   La somme des volumes extrudés des tranches pleines, des allèges et des linteaux est rigoureusement égale au volume théorique du mur diminué du volume des réservations de vides :
   $$\sum \text{Volume}(\text{solides}) \equiv \text{Volume}(\text{mur}) - \sum \text{Volume}(\text{vides}) \quad (\pm 10^{-6}\text{ mm}^3)$$

### Justification & Avantages

- Stabilité mathématique totale : pas de maillages troués, pas de dépendances WASM lourdes.
- Rapidité d'exécution instantanée ($< 0.05\text{ ms}$ par mur percé).
- Couplage parfait avec le moteur de jonctions étanche certifié en ADR-012.

---

## ADR-014 : Gouvernance et Traçabilité des Métriques de Rapports (CI Verbatim)

### Contexte

Les phases de fondation géométrique (Phase 1.1 et Phase 1.2) ont mis en évidence un risque méthodologique : la publication dans les rapports d'audit de chiffres (volumes, aires, nombres de tests) issus de scripts d'exploration ad-hoc (`node -e`) ou de brouillons préliminaires, créant des divergences apparentes avec le code de test réel exécuté par la CI.

### Décision

À compter de la validation de la Phase 1.2 et pour toutes les phases ultérieures du projet Mini-BIM :

1. **Règle Verbatim CI :**  
   Tout chiffre publié dans un rapport d'étape ou de clôture de phase (nombre de tests, $\Delta V$, volumes de vide, aires 2D, performances, décomptes statiques) **doit obligatoirement être extrait et copié verbatim** depuis :
   - La sortie brute de la suite de tests (`vitest run --reporter=verbose`),
   - Les assertions d'un test automatisé archivé dans le dépôt,
   - Un script d'analyse statique versionné dans le dépôt sous `packages/*/src/` ou `scripts/`.
2. **Statut des Scripts Ad-Hoc :**  
   Les one-liners ou scripts ad-hoc (ex. `node -e "..."`, commandes shell temporaires) sont formellement restreints à l'exploration locale durant le développement. **Aucun résultat issu d'un script ad-hoc non pérennisé ne peut figurer dans un rapport de certification.**
3. **Double Preuve Analytique Obligatoire :**  
   Toute propriété d'invariance ou de conservation (ex: partition de matière) doit comporter un test vérifiant la valeur absolue par rapport à une formule analytique indépendante, et non uniquement une auto-cohérence relative de partition.

### Conséquences

- Élimine toute ambiguïté sur la provenance des chiffres.
- Rapproche à 100% la documentation technique de la réalité testée par la CI.
- Garantit une confiance totale pour les audits de certification actuels et futurs.

---

## ADR-015 : RawMeshData et Buffers Neutres pour Rendu 3D (sans dépendance Three.js)

### Contexte

La Phase 1.3 nécessite de générer des maillages 3D polygonaux à partir des pièces extrudées 2.5D. L'architecture globale du projet impose une séparation stricte : le noyau de calcul géométrique `@mini-bim/geometry` ne doit pas dépendre des technologies de rendu graphique (Three.js, WebGL, React).

### Décision

1. **Format Neutre `RawMeshData` :**  
   Le package géométrique produit des structures de données brutes contenant des tableaux typés natifs (`Float32Array` pour les sommets et normales, `Uint32Array` pour les indices de triangles, AABB en millimètres).
2. **Indépendance Totale de l'UI :**  
   Aucun import de `three`, `react`, ou `react-dom` n'est autorisé dans `@mini-bim/geometry`. Le futur package `@mini-bim/view-3d` consommera directement ces typed arrays pour instancier des `THREE.BufferGeometry` via `BufferAttribute`.
3. **Normales Franches Déterministes :**  
   Pour le rendu architectural BIM sans artefacts de lissage sur les arêtes vives, les sommets partagés entre faces sont dupliqués afin d'attribuer des normales exactes orthogonales à chaque facette (+Z pour le dessus, -Z pour le dessous, et normale latérale extérieure pour chaque flanc).
4. **Agrégation Optimisée pour la Scène :**  
   Fourniture d'une fonction `buildWallMeshAggregated` fusionnant toutes les pièces d'un mur en un seul ensemble de buffers continus, réduisant les draw calls GPU à 1 par mur dans la vue 3D.

---

## ADR-016 : Stratégie Hybride de Triangulation 2D (Triangle Fan O(n) + Ear Clipping earcut)

### Contexte

L'extrusion de chaque `WallPiece` requiert la triangulation de ses faces supérieure et inférieure. Bien que 99% des découpes issues de jonctions et d'ouvertures orthogonales soient des polygones convexes (quadrilatères, pentagones, triangles), des géométries concaves (formes en L, retraits spécifiques) peuvent survenir lors de modélisations complexes.

### Décision

1. **Détection de Convexité en $\mathcal{O}(n)$ :**  
   Pour chaque polygone 2D propre orienté CCW, le signe des produits vectoriels 2D des arêtes consécutives est évalué. Si tous les virages conservent le même sens, le polygone est garanti convexe.
2. **Triangulation Convexe par Triangle Fan $\mathcal{O}(n)$ :**  
   Les polygones convexes sont décomposés en éventail depuis le premier sommet sans dépendance externe ni allocation dynamique complexe.
3. **Repli Sécurisé par Ear Clipping (_earcut_) :**  
   Pour les polygones concaves ou complexes, le moteur utilise la bibliothèque `earcut` (Mapbox), une référence industrielle ultra-testée, zéro-dépendance et purement algorithmique.
4. **Nettoyage Préalable Systématique :**  
   Avant triangulation, tout sommet consécutif dupliqué ($d < 10^{-4}\text{ mm}$) ou colinéaire intermédiaire est éliminé pour prévenir l'apparition de triangles dégénérés d'aire nulle.

---

## ADR-017 : Traitement des Interfaces de Contact Internes entre Pièces Adjacentes (Modular Solid Block Model vs B-Rep Welding)

### Contexte

La décomposition longitudinale 2.5D d'un mur comportant des ouvertures (portes, fenêtres) produit plusieurs sous-volumes contigus (`WallPiece` : tranches pleines, allèges sous baie, linteaux sur baie). Aux plans transversaux de transition $u = u_{\text{start}}$ ou $u = u_{\text{end}}$, deux pièces adjacentes partagent une face géométrique de contact rigoureusement coplanaire.

Deux options architecturales se présentent pour le maillage 3D :

- **Option (a) — Soudure topologique globale (B-Rep Welding) :** Supprimer les faces internes de contact et fusionner les sommets frontières pour former un solide unique multiplement connexe.
- **Option (b) — Modèle modulaire solide (Modular Solid Block Model) :** Conserver chaque `WallPiece` sous forme d'un solide fermé indépendant, étanche et 2-manifold (Euler $V - E + F = 2$), avec ses faces d'extrémité fermées, et laisser le GPU gérer l'affichage via le Backface Culling.

### Décision

1. **Adoption du modèle modulaire solide (Option b) :** Chaque tranche solide issue du découpage 2.5D est maillée comme un solide géométriquement et topologiquement complet.
2. **Élimination du Z-fighting par Backface Culling :** Les deux faces de contact coplanaires possèdent des normales unitaire extérieures strictement opposées ($\vec{n}_1 = -\vec{n}_2$). Pour toute caméra située à l'extérieur du mur, les deux faces internes sont orientées vers l'intérieur du mur assemblé (angles $\ge 90^\circ$ par rapport au vecteur de vue). En activant le Backface Culling standard côté rendu (`material.side = THREE.FrontSide` dans Three.js), le rasterizer GPU élimine systématiquement ces triangles avant l'étape de Z-buffer testing. Il n'y a donc aucun Z-fighting visuel sur les faces de contact internes.
3. **Avantages BIM fondamentaux :**
   - **Métrés et quantités par rôle :** Permet d'isoler immédiatement le volume de béton ou d'isolant d'une allège par rapport à un linteau ou une portion pleine sans recalcul booléen 3D.
   - **Multi-matériaux :** Autorise l'application ultérieure de matériaux distincts sur les sous-composants (ex. linteau préfabriqué vs maçonnerie courante).
   - **Robustesse et déterminisme $\mathcal{O}(N)$ :** Évite les opérations booléennes 3D d'union de maillages (_mesh boolean union_), notoirement instables, lentes et sensibles aux imprécisions flottantes.

### Conséquences

- Le maillage agrégé d'un mur avec baies est une union disjointe de solides étanches contigus.
- Lors de l'intégration dans Three.js (Phase 1.4), le matériau par défaut utilisera `THREE.FrontSide` (comportement standard dans Three.js).

---

## ADR-018 : Architecture Impérative de view-3d sans React, Rendu à la Demande et Backface Culling

### Contexte

Le package `@mini-bim/view-3d` introduit le moteur de rendu 3D Three.js dans Mini-BIM. Plusieurs choix structurants devaient être tranchés :

1. **Couplage ou découplage avec React :** Faut-il encapsuler la scène directement dans des composants React (type `@react-three/fiber` ou composant `<Viewport3D />`) dès le package de rendu ?
2. **Stratégie de rafraîchissement d'image :** Boucle continue 60 fps (`requestAnimationFrame`) comme dans un jeu vidéo, ou rendu événementiel à la demande ?
3. **Repère d'orientation spatial :** Repère Y-up natif de Three.js ou repère Z-up architectural ?
4. **Gestion du Z-fighting :** Rendu des deux faces (`DoubleSide`) ou élimination stricte (`FrontSide`) ?

### Décision

1. **Architecture Impérative Pure sans React :**  
   `@mini-bim/view-3d` n'importe ni `react` ni `react-dom`. Il expose des contrôleurs impératifs (`Scene3D`, `MeshAdapter`, `createDefaultMaterial`). Le composant React `<Viewport3D />` viendra se brancher par-dessus dans le package applicatif `apps/web` (Phase 2+). Cette séparation permet d'utiliser le visualiseur 3D dans des contextes découplés (workers, tests, scripts d'export, interfaces non-React).
2. **Rendu à la Demande (_Demand-Driven Rendering_) :**  
   Aucune boucle `requestAnimationFrame` continue n'est lancée dans le constructeur de `Scene3D`. Le rendu est déclenché exclusivement sur événement (`OrbitControls` `'change'`) ou sur mutation géométrique (`addMesh`, `updateMesh`, `removeMesh`, `resize`). Au repos, la consommation CPU/GPU est rigoureusement nulle.
3. **Repère Altimétrique Z-up Architectural :**  
   La caméra perspective est orientée avec `camera.up.set(0, 0, 1)`, et la grille de sol `GridHelper` est basculée sur le plan horizontal $XY$ ($Z = 0$), en stricte conformité avec les conventions BIM (Revit, Archicad, IFC).
4. **Backface Culling Stricte (`THREE.FrontSide`) :**  
   Les matériaux par défaut appliquent `side: THREE.FrontSide`. Conformément à l'ADR-017, cela élimine à la source le risque de Z-fighting sur les faces de contact transversales internes entre sous-volumes contigus d'un même mur.
5. **Nettoyage Explicite des Ressources GPU :**  
   `Scene3D.dispose()`, `removeMesh()` et `updateMesh()` détruisent explicitement les `BufferGeometry` via `geometry.dispose()` afin d'éviter toute fuite de VBOs WebGL.

### Conséquences

- Zéro surcharge mémoire ou processeur au repos.
- Parfaite testabilité unitaire headless (via mock ciblé de `WebGLRenderer`).
- Le composant React `<Viewport3D />` dans `apps/web` sera un simple wrapper de cycle de vie (`useEffect` montant `new Scene3D` et appelant `scene.dispose` au démontage).

---

## ADR-019 : Architecture du Noyau BIM — BimDocument, CommandBus et Undo/Redo via Immer

### Contexte

La gestion de l'état dans un logiciel de CAO/BIM paramétrique ne peut pas être déléguée à un gestionnaire d'état UI (React `useState`, Redux, ou Zustand). Un modèle BIM requiert :

- Des transactions atomiques réversibles (Undo / Redo).
- Une intégrité référentielle stricte (un mur ne peut orpheliner son niveau ou son type).
- Une notification granulaire des éléments modifiés (`changedIds`) pour éviter le recalcul inutile des maillages 3D.
- Une indépendance absolue envers le framework de rendu.

### Décision

1. **Noyau Métier Autonome (`@mini-bim/core`) :**  
   Le package `core` est le seul propriétaire de la structure documentaire. Il n'importe aucun composant React, Three.js, ou API DOM.
2. **État Immuable Normalisé (`BimState`) :**  
   L'état est structuré en dictionnaires indexés par `ElementId` (`levels`, `wallTypes`, `walls`), facilitant les accès en $\mathcal{O}(1)$.
3. **Command Pattern Exclusif :**  
   Toute modification est encapsulée dans une instance de `Command` (`AddWall`, `UpdateWall`, `DeleteWall`, etc.). La méthode `BimDocument.execute()` est le point d'entrée unique de mutation.
4. **Undo/Redo Différentiel par Patchs Immer :**  
   L'historique n'enregistre pas des copies intégrales de l'état (ce qui exploserait la mémoire sur un projet de plusieurs milliers d'éléments), mais les patchs différentiels RFC 6902 générés par `produceWithPatches` d'Immer. La complexité mémoire est $\mathcal{O}(k)$ où $k$ est le nombre d'éléments touchés par la transaction.
5. **Règles d'Invalidation d'Historique :**  
   Toute nouvelle commande vide immédiatement le `redoStack`. `undo()` applique les patchs inverses, `redo()` réapplique les patchs directs.

### Conséquences

- Séparation hermétique entre logique métier et vue.
- Annulation / rétablissement instantanés et déterministes.
- Émission d'événements ciblés (`subscribe`) permettant aux viewports de ne rafraîchir que les géométries affectées.

---

## ADR-020 : Stratégie d'Identifiants Uniques — Adoption d'ULID pour le Noyau BIM

### Contexte

Chaque entité du modèle architectural (niveaux, types de murs, instances de murs, ouvertures) nécessite un identifiant unique universel immuable (`ElementId`). Plusieurs approches ont été analysées :

- **Entiers auto-incrémentés :** Dépendants d'une base de données centralisée, collisions inévitables en modélisation déconnectée ou distribuée.
- **UUID v4 :** 36 caractères, chaîne longue, non triable chronologiquement.
- **ULID :** 26 caractères, encodage Base32 Crockford, triable temporellement, générable hors-ligne.
- **CUID2 :** Récent mais moins répandu dans les écosystèmes CAO/BIM.

### Décision

1. **Adoption d'ULID (Universally Unique Lexicographically Sortable Identifier) :**  
   Tous les identifiants générés par le système (`generateId()`) utilisent la spécification ULID.
2. **Propriétés Clés retenues pour Mini-BIM :**
   - **Triabilité temporelle :** Les 48 premiers bits encodent le timestamp Unix en millisecondes, assurant un ordre lexicographique naturel des éléments par date de création.
   - **Compacité et lisibilité :** 26 caractères Base32 Crockford (insensible à la casse, sans caractères ambigus comme `I`, `L`, `O`, `U`).
   - **Sécurité anti-collision :** 80 bits d'entropie cryptographique par milliseconde.
   - **Génération décentralisée :** Création immédiate côté client dans les outils interactifs (`WallTool`) sans appel réseau bloquant.

### Conséquences

- Stockage efficace en chaîne de caractères (`TEXT`) sous SQLite et PostgreSQL.
- Ordre de sérialisation JSON stable et prédictible.

---

## ADR-021 : Architecture Impérative de view-2d sans React, Émission de Command via Callback, Conversion Y-up vers Y-down

### Contexte

La vue en plan bidimensionnelle d'un logiciel de CAO/BIM requiert des performances graphiques optimales (rafraîchissement instantané sur grands projets), un rendu rigoureusement conforme aux normes de dessin d'architecture (poché de corps de mur, arêtes vues/coupées contrastées, axes de référence en traits pointillés) et un découplage total envers la couche de présentation d'interface web (React).

Deux problématiques géométriques et architecturales majeures se posent :

1. **Discordance des repères 2D :** Le monde architectural BIM (Revit, Archicad, IFC ISO 16739) est défini en millimètres selon un repère cartésien **Y-up** (l'axe $+X$ va vers l'Est, $+Y$ va vers le Nord, et $Z$ est l'élévation altimétrique). En revanche, l'API native standard HTML5 Canvas 2D utilise un repère écran en pixels **Y-down** (l'origine $(0,0)$ est au coin supérieur gauche et l'axe $Y$ descend vers le bas).
2. **Intégrité documentaire et source unique de vérité :** Conformément à l'ADR-001 et l'ADR-006 / ADR-019, le document `BimDocument` ne doit jamais être muté de manière sauvage ou concurrente par les vues.

### Décision

1. **Package Impératif Autonome (`@mini-bim/view-2d`) :**  
   Le package `view-2d` est exempt de toute dépendance vers React, Three.js ou des packages DOM additionnels. Il utilise exclusivement l'API standard `HTMLCanvasElement` et `CanvasRenderingContext2D`. L'intégration React (`<Viewport2D />`) est strictement réservée à l'application web (`apps/web`).
2. **RÈGLE D'OR : Non-Mutation Directe de `BimDocument` :**  
   La classe `View2D` ne mute JAMAIS directement `BimDocument`. Pour toute opération requérant une modification d'état (création, mise à jour, suppression), la vue émet des intentions de mutation sous forme d'instances typées de `Command` via le callback `onCommandRequested(cb)`. Seul le contrôleur hôte est décisionnaire pour appeler `doc.execute(command)`.
3. **Convention de Transformation 2D Inversible (`Transform2D`) :**  
   La conversion cartésienne est assurée par la classe `Transform2D` avec inversion rigoureuse de l'axe vertical :
   $$x_s = c_x + (x_w - x_0) \cdot s$$
   $$y_s = c_y - (y_w - y_0) \cdot s$$
   Et l'inversion exacte :
   $$x_w = x_0 + \frac{x_s - c_x}{s}$$
   $$y_w = y_0 - \frac{y_s - c_y}{s}$$
   La bijection est prouvée et validée par tests automatisés avec une erreur résiduelle absolue $\Delta < 10^{-9}\text{ mm}$.
4. **Rendu à la Demande (_Demand-Driven Rendering_) :**  
   À l'instar de `Scene3D` (ADR-018), aucune boucle `requestAnimationFrame` continue ne tourne au repos. Le canvas 2D n'est repeint que lors des notifications de mise à jour du document ou des interactions utilisateur (zoom molette, pan, clic de sélection).
5. **Consommation Neutre du Noyau Géométrique :**  
   Le calcul de l'emprise polygonale (poché) et des segments de contour/axe est systématiquement délégué à `computeWallFootprint2d` de `@mini-bim/geometry`.

### Conséquences

- Indépendance architecturale totale permettant l'exécution dans des contextes headless (Node/JSDOM avec mocks de contexte).
- Consommation CPU à 0% lorsque l'utilisateur ne manipule pas la vue.
- Traçabilité et auditabilité intégrales des mutations grâce à la centralisation par `CommandBus`.
- Précision géométrique et conformité visuelle absolue aux normes du dessin en plan architectural.

---

## ADR-022 : Intégration React dans apps/web — Viewports Impératifs Isolés, Contexte Documentaire et Isolation Géométrique Absolue

### Contexte

L'application web (`apps/web`) constitue l'interface graphique utilisateur (GUI) de Mini-BIM. Elle doit coordonner la visualisation synchronisée en double viewport (plan 2D et maquette orbitale 3D), la barre d'outils, la barre d'état et le document architectural central.

Trois contraintes architecturales et de performance critiques se posent :

1. **Règle d'or du cycle de vie des moteurs graphiques :** Ni Three.js (`Scene3D`) ni l'API Canvas 2D (`View2D`) ne doivent être réinstanciés ou détruits lors des cycles de réconciliation déclaratifs de React. Le coût d'instanciation WebGL et d'allocation des tampons mémoire GPU/CPU est prohibitif.
2. **Règle d'or de pureté de l'état React :** React doit gérer l'état UI déclaratif, mais ne doit jamais cloner ou encapsuler le document impératif `BimDocument` dans un `useState` (ce qui casserait les références, déclencherait des cascades de re-renders et corromprait l'arbre transactionnel d'Immer).
3. **Règle d'or d'isolation géométrique :** L'application web ne doit pas être couplée aux détails algorithmiques internes de `@mini-bim/geometry`.

### Décision

1. **Encapsulation Impérative Unique des Viewports (`useRef` + `useEffect`) :**
   Les instances de `View2D` et `Scene3D` sont créées exclusivement dans le callback d'un hook `useEffect(..., [])` de premier montage et persistées dans des `useRef`. Les re-renders React de `<Viewport2D />` et `<Viewport3D />` ne recréent jamais les contrôleurs graphiques.
2. **Nettoyage et Zéro Fuite Mémoire (`dispose()`) :**
   La fonction de retour (cleanup) du hook `useEffect` appelle systématiquement `dispose()` sur `View2D` et `Scene3D`, garantissant la libération des écouteurs d'événements, des géométries tampons GPU et des textures.
3. **Gestion du Document par Contexte Dédié (`BimDocumentProvider`) :**
   L'instance de `BimDocument` est stockée dans un `useRef` persistant au sein du `BimDocumentProvider`. Le hook `useState` ne stocke QUE la projection immuable `BimState` obtenue via `doc.getState()`. Un abonnement `doc.subscribe()` met à jour ce state React lors de chaque transaction métier.
4. **Interdiction Formelle d'Import Direct de `@mini-bim/geometry` :**
   `apps/web` n'a pas `@mini-bim/geometry` dans son `package.json`. Les calculs de tessellation 3D sont encapsulés et exportés par `@mini-bim/view-3d` (`createWallMesh`), et les calculs de projection/poché 2D sont gérés par `@mini-bim/view-2d`.
5. **Rendu à la Demande Réactif :**
   Les viewports écoutent les transitions d'état via React ou `subscribe` et ne redessinent leurs canvas respectifs que sur changement effectif du modèle, sans boucle d'animation continue.

### Conséquences

- Zéro fuite mémoire démontrée sur des cycles consécutifs de mount / unmount.
- Rendu fluide à 60 FPS lors des interactions sans surcoût de réconciliation React.
- Architecture modulaire respectant les frontières des couches logicielles.

---

## ADR-023 : Génération de Maillages 3D dans @mini-bim/view-3d via Interfaces Géométriques Neutres

### Contexte

L'application web (`apps/web`) doit afficher les murs du modèle BIM dans la scène Three.js (`Scene3D`). Conformément à la Règle d'or n°2, `apps/web` n'a pas le droit d'importer `@mini-bim/geometry` directement.

Une fonction utilitaire `createWallMesh` est nécessaire pour calculer l'emprise polygonale et extruder les sous-volumes en `RawMeshData`. Deux options architecturales s'opposaient :

- **Option A (Rejetée) :** `createWallMesh(wall: Wall, wallType: WallType, elevation: number)` avec import de types `@mini-bim/core`. Cette option introduirait une dépendance descendante de `view-3d` vers `core`, violant l'hermétisme posé en Phase 1.4 où `view-3d` ne dépend que de `geometry` et de `three`.
- **Option B (Adoptée) :** `createWallMesh(wall: WallGeometryParams, wallType: WallTypeGeometryParams, elevation: number)` avec des interfaces purement structurelles et neutres déclarées dans `packages/view-3d/src/mesh-generator.ts`.

### Décision

1. **Interfaces d'Entrée Structurelles et Neutres :**
   `view-3d` définit ses propres interfaces d'entrée pour la géométrie de mur :
   ```typescript
   export interface WallGeometryParams {
     readonly id: string;
     readonly start: { readonly x: number; readonly y: number };
     readonly end: { readonly x: number; readonly y: number };
   }

   export interface WallTypeGeometryParams {
     readonly thickness: number;
     readonly height: number;
   }
   ```
2. **Absence Totale de Dépendance vers `@mini-bim/core` :**
   `packages/view-3d/package.json` ne référence PAS `@mini-bim/core`. Le code de `mesh-generator.ts` n'importe aucun type ni symbole de `core`.
3. **Typage Structurel Naturel de TypeScript :**
   Les objets `Wall` et `WallType` de `@mini-bim/core` possédant structurellement ces champs (`id`, `start`, `end`, `thickness`, `height`), `apps/web` peut passer directement ses instances sans wrapper ni adaptateur verbeux.

### Conséquences & Limites Documentées pour la Phase 3

- **Préservation stricte de la hiérarchie des couches :** `geometry` $\rightarrow$ `view-3d` $\rightarrow$ `apps/web` (qui compose `core`, `view-2d` et `view-3d`).
- `view-3d` reste un package de rendu purement graphique indépendant de tout modèle métier BIM.
- **Note 1 — Footprint Isolé vs Junctions résolues :** `createWallMesh` utilise `computeWallFootprint2d` (footprint isolé, PAS junction-resolved). Les murs aux coins se chevauchent visuellement (z-fighting potentiel aux arêtes coplanaires). Sera résolu en Phase 3 avec `computeJunctions`.
- **Note 2 — Pièce unique (Full) :** `createWallMesh` traite une seule pièce (`role: 'full'`). Les ouvertures et le découpage multi-pièces (sill/lintel) viendront en Phase 3.
- **Note 3 — Identifiants de pièces :** `WallPiece.id === WallPiece.wallId === wall.id`. Acceptable en Phase 2.2 (1 pièce par mur). À enrichir en Phase 3 (IDs uniques par pièce dérivée).

---

## ADR-024 : Architecture des Outils Interactifs 2D (State Machines Pures, Snapping Angulaire 45° et Pont DOM Découplé)

### Contexte

La Phase 2.3 introduit la manipulation interactive directe du plan 2D par l'utilisateur via deux outils fondamentaux :

1. `SelectTool` : sélection d'éléments architecturaux au clic, gestion de la désélection (clic dans le vide, touche `Escape`).
2. `WallTool` : tracé interactif de murs par clic-glisser (`pointerdown` $\to$ `pointermove` $\to$ `pointerup` ou `Enter`), prévisualisation dynamique d'élastique (_rubber-band_), contrainte de longueur minimale ($L \ge 100\text{ mm}$), annulation par `Escape`, et aimantation angulaire à 45° lorsque la touche `Shift` est enfoncée.

Trois impératifs architecturaux guident la conception :

- **Hermétisme et testabilité maximale :** Les outils doivent pouvoir être testés unitairement à 100% sans nécessiter d'environnement DOM/JSDOM lourd, ni d'émulation de composants React ou de contextes Canvas WebGL/2D.
- **Précision trigonométrique absolue :** L'aimantation angulaire à 45° ne doit souffrir d'aucune imprécision de calcul flottant ($44.999^\circ$ ou $0.0000000000001$), afin d'éviter les murs microscopiquement obliques qui compromettraient les jointures en Phase 3.
- **Absence de fuite et respect du cycle de vie React :** Le basculement entre outils ou le démontage d'un viewport en plein tracé ne doit laisser aucun écouteur d'événement orphelin ni de résidu de prévisualisation graphique à l'écran.

### Décision

1. **Machines à États Pures et Typées (`Tool`) :**  
   Chaque outil est une classe TypeScript pure implémentant l'interface commune `Tool` :

   ```typescript
   export interface Tool {
     readonly kind: ToolKind;
     getState(): SelectToolState | WallToolState;
     handle(event: ToolEvent, ctx: ToolContext): ToolOutput;
     reset(): void;
   }
   ```

   Les entrées sont normalisées sous forme d'événements `ToolEvent` (`pointerdown`, `pointermove`, `pointerup`, `keydown`), et les transitions émettent des intentions fonctionnelles via `ToolOutput` (`command`, `selectionChanged`, `preview`, `noop`).
   **Règle d'or :** Zéro import de `react`, `three`, ou `@mini-bim/geometry` dans les classes de machines à états (`SelectTool`, `WallTool`, `snap`, `types`).

2. **Snapping Angulaire 45° Déterministe (`snapAngle45`) :**  
   Pour éliminer tout artefact d'arrondi trigonométrique flottant, `snapAngle45` utilise une table fixe de vecteurs directeurs unitaires précalculés pour les 8 secteurs de 45° :
   $$u_k \in \{(1, 0), (\tfrac{\sqrt{2}}{2}, \tfrac{\sqrt{2}}{2}), (0, 1), (-\tfrac{\sqrt{2}}{2}, \tfrac{\sqrt{2}}{2}), (-1, 0), (-\tfrac{\sqrt{2}}{2}, -\tfrac{\sqrt{2}}{2}), (0, -1), (\tfrac{\sqrt{2}}{2}, -\tfrac{\sqrt{2}}{2})\}$$
   L'index du secteur est déterminé par :
   $$k = \left\lfloor \frac{\theta + \frac{\pi}{8}}{\frac{\pi}{4}} \right\rfloor \pmod 8$$
   Les composantes horizontales et verticales sur les axes cardinaux sont exactement zéro ($y \equiv 0$ ou $x \equiv 0$), garantissant l'orthogonalité rigoureuse des murs dessinés.

3. **Longueur Minimale et Rejet des Micro-Murs :**  
   Une constante `MIN_WALL_LENGTH = 100` (100 mm) élimine silencieusement les clics parasites ou micro-glissements involontaires.

4. **Pont DOM Normalisé et Cycle de Vie React (`toolGlue` + `useActiveTool`) :**
   - `toolGlue.ts` convertit les `PointerEvent`s natifs en coordonnées locales précises par rapport au `getBoundingClientRect()` du canvas.
   - `useActiveTool.ts` instancie et conserve les outils via `useRef`, gère l'outil actif via `useState`, et réinitialise systématiquement l'état (`reset()`) de l'outil sortant lors d'un basculement.
   - Dans `<Viewport2D />`, l'option `enableInternalSelection: false` est passée à `View2D` pour confier l'autorité intégrale de sélection au `SelectTool`. Les écouteurs d'événements sont tous retirés lors du démontage ou du changement d'outil, et `view.setPreview(null)` est appelé pour garantir l'absence de résidu graphique.

### Conséquences

- Couverture de tests de 100% sur les outils avec tests unitaires ultrarapides en mémoire.
- Stabilité garantie lors des basculements d'outils et résilience prouvée en cas de démontage React pendant un tracé actif.
- Intégration transparente avec le double viewport : l'émission de la commande `AddWallCommand` met à jour automatiquement la vue 2D et la vue 3D orbitale.

---

## ADR-025 : Sélection UI Partagée Bidirectionnelle (État Éphémère React vs Pureté Documentaire)

### Contexte

Dans une application BIM double-vue (Plan 2D et 3D Orbitale), la sélection d'un élément par l'utilisateur doit être visualisée de manière cohérente et synchrone dans les deux espaces graphiques :

- Un clic sur un mur en plan 2D doit immédiatement afficher ce mur en surbrillance bleue dans la vue 3D.
- Réciproquement, un clic orbital dans la vue 3D doit surligner ce même mur dans le plan 2D.
- Une touche `Escape` ou un clic dans le vide doit vider la sélection simultanément dans les deux vues.

La question architecturale centrale est la localisation de la vérité de cette sélection :

- **Option A :** Stocker `selectedIds` dans le `BimDocument` (état persistant du document).
- **Option B :** Stocker `selectedIds` dans l'état UI React (`useState` au niveau `AppContent`) et le distribuer par props descendantes en flux unidirectionnel vers les wrappers de viewports.

### Décision

Nous adoptons l'**Option B** : la sélection est un **état d'interface éphémère pur**, hébergé dans `useState<readonly string[]>([])` au niveau du composant `AppContent`.

1. **Pureté du `BimDocument` :**  
   Le `BimDocument` et son historique transactionnel (`HistoryStack`) ne sont jamais pollués par des sélections. La sélection ne génère aucune `Command`, ne crée aucun patch Immer et n'affecte pas `canUndo()` / `canRedo()`.
2. **Distribution par Props Readonly :**  
   `selectedIds` est passé en prop `selection={selectedIds}` aux deux composants `<Viewport2D />` et `<Viewport3D />`.
3. **Remontée Découplée :**  
   Les viewports émettent les changements d'intention via `onSelectionChanged: (ids: readonly string[]) => void`. Quand l'utilisateur clique en 2D (via `SelectTool`) ou en 3D (via picking stationnaire), `AppContent` met à jour `selectedIds`, déclenchant la réconciliation et propageant l'état aux deux moteurs graphiques.

### Conséquences

- Annuler (`undo`) ou Rétablir (`redo`) n'altère pas l'historique avec des micro-sélections.
- L'export JSON sérialise un modèle architectural 100% propre, sans état d'interface temporaire.
- Testabilité complète du flux bidirectionnel en isolation et dans l'arbre d'intégration React.

---

## ADR-026 : Picking 3D Déterministe via Raycasting, userData et Permutation de Matériau Partagé

### Contexte

Dans `<Viewport3D />`, l'utilisateur interagit avec une scène Three.js orbitale contrôlée par `OrbitControls`. Deux défis techniques majeurs se présentent :

1. **Conflit d'Interaction avec OrbitControls :** Un geste de rotation ou de panoramique de la caméra 3D implique un clic-glisser (`pointerdown` $\to$ déplacement $\to$ `pointerup`). Si tout relâchement de souris déclenche un raycasting, chaque rotation de caméra risque de sélectionner ou désélectionner intempestivement un mur.
2. **Performance et Allocation GPU du Highlight :** Passer un mur en surbrillance (bleu vif `#2563eb`) ne doit ni muter le matériau par défaut global (ce qui bleuirait tous les murs), ni instancier un nouveau `THREE.MeshStandardMaterial` à chaque clic (ce qui fragmenterait la mémoire GPU et forcerait des recompilations de shaders).

### Décision

1. **Détection de Clic Stationnaire :**  
   `<Viewport3D />` capture les coordonnées du pointeur au `pointerdown`. Au `pointerup`, la distance euclidienne $\Delta = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$ est calculée.
   - Si $\Delta > 5\text{ px}$, le geste est qualifié de manipulation de caméra orbitale : le raycasting est ignoré.
   - Si $\Delta \le 5\text{ px}$, le geste est un clic stationnaire : le raycasting est exécuté.

2. **Association Sémantique via `userData.elementId` :**  
   Lors de l'enregistrement d'un maillage dans `Scene3D.addMesh(rawData)`, le contrôleur assigne `mesh.userData = { elementId: rawData.elementId, role: rawData.role }`.  
   **Règle d'invariance formelle :** Le picking 3D se base sur `RawMeshData.elementId`, qui doit correspondre strictement à un `wallId` de `BimState.walls`. Lorsque des ouvertures subdivisent un mur en tranches multiples (panneau plein, allège, linteau), chaque sous-maillage conserve `elementId === wall.id`, assurant que le clic sur n'importe quel composant géométrique du mur sélectionne l'entité architecturale parente.

3. **Raycasting Découplé (`Scene3D.raycast`) :**  
   `Scene3D` expose `raycast(screenX, screenY)` et `raycastNDC(ndcX, ndcY)` utilisant `THREE.Raycaster`. Les coordonnées écran du canvas sont converties en NDC (Normalized Device Coordinates $[-1, 1]$). Le premier objet intersecté portant `userData.elementId` renvoie cet identifiant (ou `null` en l'absence de hit).

4. **Permutation de Matériaux Uniques (`defaultMaterial` vs `highlightMaterial`) :**  
   `Scene3D` pré-instancie exactement deux matériaux à sa création :
   - `defaultMaterial` : `MeshStandardMaterial` neutre (`roughness: 0.8`, `emissive: 0x000000`).
   - `highlightMaterial` : `MeshStandardMaterial` lumineux (`emissive: 0x2563eb`, `emissiveIntensity: 0.5`).
     Lors de `setHighlight(ids)`, `Scene3D` itère sur ses maillages et affecte simplement par référence de pointeur :
     $$\text{mesh.material} = (\text{ids.has(id)}) \mathbin{?} \text{this.highlightMaterial} : \text{this.defaultMaterial}$$
     Zéro allocation d'objet Three.js, zéro shader re-link, mise à jour immédiate au `render()`.

### Conséquences

- Interaction fluide et naturelle : la caméra tourne librement sans sélection parasite.
- Zéro fuite mémoire GPU lors de sélections répétées.
- Synchronisation instantanée entre le picking 3D et le contour 2D.

---

## ADR-027 : Remplacement de BimDocument sans Recréation de Contexte Graphique (setDocument vs Re-Key)

### Contexte

Lors du chargement d'un nouveau projet (import de fichier JSON architectural), le `BimDocument` en cours d'utilisation dans `BimDocumentProvider` doit être remplacé par la nouvelle instance issue de `BimDocument.fromJSON(...)`.
Deux approches sont envisageables :

- **Approche 1 (Re-Key React) :** Changer la clé du composant racine `<App key={projectVersion} />`, forçant un démontage/remontage complet de toute l'arborescence DOM et React.
- **Approche 2 (Mutation Réactive Contrôlée `setDocument`) :** Conserver les conteneurs DOM et les instances existantes de `View2D` et `Scene3D`, en leur injectant le nouveau document via `setDocument(newDoc)` et en réinitialisant le cadrage via `zoomToFit(60)`.

### Risques de l'Approche 1 (Re-Key) :

La destruction et recréation immédiate d'éléments `<canvas>` WebGL provoque la perte du contexte WebGL (`webglcontextlost`), des flashs visuels blancs, des risques de fuites mémoires liées aux buffers Three.js mal libérés pendant le cycle de remontage, et une latence perceptible par l'utilisateur.

### Décision

Nous adoptons l'**Approche 2** :

1. `BimDocumentContext` expose une méthode `setDocument(newDoc: BimDocument): void`.
2. L'effet de `BimDocumentProvider` se réabonne à la nouvelle instance de document et met à jour l'état immuable `state`.
3. `<Viewport2D />` et `<Viewport3D />` détectent le changement d'identité de `doc` via un `useRef(lastDoc)` et exécutent de manière ordonnée :
   ```typescript
   view.setDocument(doc);
   view.zoomToFit(60);
   ```
4. Le contexte WebGL Three.js et le contexte Canvas 2D restent **vivants et stables**, préservant l'intégrité de la session graphique.
5. L'outil interactif en cours d'utilisation est purgé (`activeTool.reset()`) et la sélection remise à zéro pour éviter tout état fantôme hérité de l'ancien projet.

### Conséquences

- Transitions de fichiers instantanées et parfaitement fluides sans clignotement.
- Élimination des erreurs `webglcontextlost` et stabilité éprouvée sous Chrome et Firefox.
- Isolation complète : en cas d'erreur lors de l'import d'un fichier corrompu, le document en cours n'est pas remplacé et l'utilisateur reçoit un avertissement visuel immédiat.

---

## ADR-028 : Modèle Paramétrique 1D des Ouvertures Hébergées, Validation Métier et Suppression en Cascade Transactionnelle

### Contexte

Dans la modélisation BIM de référence (Autodesk Revit, ArchiCAD), les composants d'ouverture (portes et fenêtres) ne sont pas des solides autonomes positionnés dans l'espace euclidien absolu $(X, Y, Z)$. Ce sont des entités intrinsèquement **hébergées** (_hosted elements_) par un hôte porteur (`hostWallId`).

Trois questions architecturales majeures se posent pour Mini-BIM :

1. **Représentation spatiale de la position :** Doit-on mémoriser des coordonnées absolues $(X, Y)$ dans le monde, ou un paramètre scalaire relatif au mur hôte ?
2. **Cycle de vie du mur hôte :** Que doit-il se passer lorsqu'un utilisateur supprime un mur contenant des portes et fenêtres ? (Interdiction stricte, orphelins flottants, ou suppression en cascade ?)
3. **Réversibilité transactionnelle de l'annulation (Undo/Redo) :** Comment garantir qu'une annulation d'une suppression de mur restaure fidèlement le mur ainsi que toutes ses ouvertures hébergées, sans duplication de code ni fragilité impérative ?

### Décision

1. **Représentation Paramétrique 1D (`offsetAlong`) :**  
   Les portes (`Door`) et fenêtres (`Window`) héritent de `OpeningBase` et mémorisent :
   - `hostWallId: ElementId` : référence obligatoire vers le mur hôte.
   - `offsetAlong: number` : distance euclidienne scalaire (en millimètres) depuis le point d'origine du mur (`wall.start`) le long de son vecteur directeur.
   - `width: number`, `height: number`.
   - `swing: DoorSwing` (`side: 'left' | 'right'`, `direction: 'in' | 'out'`) pour les portes.
   - `sillHeight: number` (hauteur d'allège en mm) pour les fenêtres.

   **Bénéfice :** Aucun point de coordonnées monde n'est dupliqué. Si un mur est déplacé, pivoté ou allongé, l'ouverture conserve automatiquement son intégrité relationnelle sans nécessiter de calcul de synchronisation de coordonnées.

2. **Délégation de Validation Métier à `@mini-bim/geometry` :**  
   Pour respecter la séparation stricte des responsabilités et éviter toute duplication de code, `validateDoor` et `validateWindow` dans `@mini-bim/core` délèguent le contrôle géométrique à `validateOpenings` de `@mini-bim/geometry`.  
   Les règles vérifient :
   - L'existence du mur hôte (`UNKNOWN_HOST_WALL`).
   - La positivité des dimensions (`INVALID_OPENING_DIMENSIONS`).
   - Le confinement strict dans les bornes du mur $[0, L_{\text{wall}}]$ (`INVALID_OPENING_POSITION`).
   - La hauteur sous plafond : $\text{height} \le H$ pour une porte, $\text{sillHeight} + \text{height} \le H$ pour une fenêtre (`INVALID_OPENING_HEIGHT`).
   - Le non-chevauchement des intervalles 1D $[s_i, s_i + w_i]$ entre ouvertures d'un même mur (`OPENING_OVERLAP`).
   - Le respect du dégagement minimal `MIN_OPENING_CLEARANCE = 50\text{ mm}` aux extrémités et entre ouvertures (`INVALID_OPENING_CLEARANCE`).

3. **Suppression en Cascade Transactionnelle (`ON DELETE CASCADE`) :**  
   Un mur peut être supprimé même s'il héberge des ouvertures (`canDeleteWall` autorise la suppression). Dans `DeleteWallCommand.apply(draft)` :
   - Le mur est retiré de `draft.walls`.
   - Toutes les portes de `draft.doors` dont `hostWallId === this.wallId` sont supprimées.
   - Toutes les fenêtres de `draft.windows` dont `hostWallId === this.wallId` sont supprimées.
   - `getChangedIds()` retourne l'ensemble unifié : `[this.wallId, ...this.deletedOpeningIds]`.

4. **Restauration Intégrale via l'Algèbre de Patchs Immer :**  
   Puisque l'état est muté au sein de `produceWithPatches`, Immer enregistre des opérations `"op": "remove"` pour le mur et chaque ouverture hébergée, et produit les `"op": "add"` correspondants dans `inversePatches`.  
   Un simple appel à `doc.undo()` réapplique ces patchs inverses en une seule transaction atomique : le mur et toutes ses ouvertures réapparaissent instantanément avec leurs identifiants, cotes et battements d'origine sans aucune ligne de code de rollback impérative spécifique.

5. **Rétrocompatibilité Totale du Format JSON (`schemaVersion: 1`) :**  
   Le schéma de persistance v1 est préservé. Lors du chargement d'un fichier hérité (Phases 1 et 2 sans sections `doors`/`windows`), le désérialiseur initialise silencieusement `doors: {}` et `windows: {}`.

### Conséquences

- Modèle de données BIM robuste, fidèle aux standards de l'industrie (IFC `IfcRelFillsElement`, Revit Family Hosting).
- Cohérence relationnelle absolue : aucune ouverture orpheline ne peut exister dans le document.
- Prêt pour les phases suivantes : Phase 3.2 exploitera `offsetAlong`, `width`, `height`, `sillHeight` pour le découpage géométrique (`sliceWallWithOpenings`), et Phase 3.3 implémentera le placement interactif (`DoorTool`, `WindowTool`).

---

## ADR-029 : Pipeline 2.5D branché sur les viewports 2D/3D via paramètres neutres

- **Date :** 2026-11-14
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 3.2 (Mur percé 3D et rendu 2D des ouvertures)

### Problème

Comment connecter le pipeline géométrique de découpage d'ouvertures (`sliceWallWithOpenings`, `extrudeWallPiece`) et les tracés architecturaux 2D aux viewports (`view-2d` et `view-3d`) sans enfreindre les règles d'or d'architecture :

1. `packages/view-3d` et `packages/view-2d` ne doivent JAMAIS importer `@mini-bim/core` (découplage strict des couches de présentation).
2. `apps/web` ne doit JAMAIS importer `@mini-bim/geometry` directement (isolation de la géométrie pure).
3. Le picking 3D (raycast) sur n'importe quel morceau solide d'un mur percé doit retourner l'identifiant du mur hôte (`wall.id`), tandis que le clic sur une menuiserie doit retourner l'identifiant de l'ouverture (`opening.id`).
4. La vue 2D doit afficher les conventions de tracé architectural (évidement du poché, montants, vantail à 90°, arc de 90° en pointillé, vitrage parallèle double) avec exactitude géométrique sous l'inversion d'axe écran Y-up $\to$ Y-down.

### Décisions Prises

1. **Paramètres Neutres Structurels dans `view-3d` et `view-2d` :**
   - `view-3d` définit `OpeningGeometryParams` et `WallWithOpeningsParams` basés uniquement sur des primitives numériques et les vecteurs de `@mini-bim/geometry`.
   - `view-2d` définit `WallFor2D`, `DoorFor2D`, `WindowFor2D`, `DocumentFor2D`, `CommandLike`.
   - Dépendances directes : `view-3d` ne dépend que de `@mini-bim/geometry` et `three`. `view-2d` ne dépend que de `@mini-bim/geometry`. Zéro import de `@mini-bim/core` dans les sources `src/`.

2. **Génération 3D Multi-Pièces et Conservation Stricte de Volume :**
   - `createWallMeshWithOpenings(params)` invoque `sliceWallWithOpenings` et génère un ensemble de pièces solides extrudées (`RawMeshData[]`).
   - Tous les tronçons solides d'un mur percé conservent `RawMeshData.elementId = wall.id`.
   - Conservation du volume : $\sum V_i = V_{\text{plein}} - \sum V_{\text{baies}}$, vérifiée formellement via le théorème de divergence sur maillage triangulaire.

3. **Placeholders d'Ouvertures Dédiés :**
   - `createOpeningPlaceholder(params, wall, elevation)` génère une boîte orientée et centrée sur la baie avec `elementId = opening.id`.
   - Boîte de 50 mm avec matériau bois (`#8b5a2b`) pour les portes.
   - Boîte de 30 mm avec matériau vitrage translucide (`#90caf9`, opacité 0.5) pour les fenêtres.
   - Restauration des matériaux d'origine lors des désélections dans `Scene3D.setHighlight`.

4. **Tracé Architectural 2D et Normalisation d'Angle :**
   - Évidement préalable du poché (`backgroundColor`).
   - Calcul rigoureux de l'arc de débattement de 90° :
     $$\Delta\theta = \text{atan2}(\sin(\theta_{\text{open}} - \theta_{\text{closed}}), \cos(\theta_{\text{open}} - \theta_{\text{closed}}))$$
     `counterclockwise = deltaAngle < 0`. Garantit un arc parfait quelle que soit l'orientation du mur et le sens de battement (`in`/`out`, `left`/`right`).

### Conséquences

- Règle d'or d'architecture respectée à 100% : `core` n'est importé ni dans `view-2d/src`, ni dans `view-3d/src`.
- Le double viewport affiche instantanément les murs percés et les ouvertures cohérentes en 2D et en 3D.
- Base prête pour la Phase 3.3 (outils interactifs de placement `DoorTool` et `WindowTool`).

---

## ADR-030 : Outils interactifs pour ouvertures et déplacement de murs — Machines à états pures et propagation paramétrique

- **Date :** 2026-11-14
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 3.3 (Outils interactifs DoorTool, WindowTool, MoveWallTool, MoveOpeningTool et Test de Crédibilité du BIM)

### Problème

Comment permettre la modélisation et la manipulation interactive des portes, fenêtres et murs directement dans le viewport 2D tout en garantissant :

1. La pureté absolue des machines à états des Tools (zéro dépendance à React, Three.js, au DOM ou à `@mini-bim/geometry`).
2. L'invariant fondamental du BIM : « Le modèle est la source de vérité, la géométrie est un cache ». Lors du déplacement d'un mur hôte (`MoveWallTool`), les ouvertures hébergées ne doivent pas être altérées dans l'état documentaire (`offsetAlong` inchangé), mais leur représentation 2D et 3D doit suivre fidèlement et immédiatement le déplacement du mur hôte.
3. Le snapping déterministe aux pas architecturaux : 50 mm pour les ouvertures le long de leur mur, 10 mm pour les translations de murs.
4. L'exclusivité stricte de l'outil actif et la réinitialisation de tout outil sortant.

### Décisions Prises

1. **Machines à États Pures Découplées du DOM :**
   - `DoorTool`, `WindowTool`, `MoveWallTool`, et `MoveOpeningTool` implémentent l'interface pure `Tool`.
   - Les événements sont normalisés (`ToolEvent`) et les sorties sont immuables (`ToolOutput` : `command`, `preview`, `selectionChanged`, `noop`).
   - Zéro importation de `@mini-bim/geometry` dans les Tools : les calculs 2D de détection reposent exclusivement sur les fonctions exportées par `@mini-bim/view-2d` (`findWallAtScreen`, `findOpeningAtScreen`, `Transform2D`, `Vec2`).

2. **Invariant Paramétrique de Déplacement de Mur (`MoveWallTool`) :**
   - Lorsqu'un utilisateur translate un mur, `MoveWallTool` émet `UpdateWallCommand(wallId, { start, end })`.
   - Aucune commande ne modifie les ouvertures hébergées : dans `doc.getState().doors` et `doc.getState().windows`, chaque baie conserve son `offsetAlong` paramétrique d'origine.
   - Les viewports 2D et 3D régénèrent automatiquement les maillages solides percés et les placeholders 3D aux nouvelles coordonnées spatiales du mur hôte. C'est le test de crédibilité du BIM validé formellement.

3. **Aimantation Déterministe (`snapToStep`) et Banker's Rounding :**
   - Utilisation d'un algorithme d'arrondi au pair le plus proche (banker's rounding) pour éliminer les biais d'arrondi sur les valeurs médianes (ex: 105 mm avec un pas de 10 mm s'aimante fidèlement à 100 mm ; 2053 mm avec un pas de 50 mm s'aimante à 2050 mm).
   - Clamping strict aux gardes minimales de rive ($50 \text{ mm}$) pour prévenir tout débordement d'ouverture hors du mur hôte.

4. **Détection Découplée d'Ouvertures (`findOpeningAtScreen`) :**
   - Ajout et export dans `@mini-bim/view-2d` de la fonction pure `findOpeningAtScreen` calculant la projection orthogonale d'un point écran sur l'axe du mur hôte et testant l'intervalle $[offsetAlong - \epsilon, offsetAlong + width + \epsilon]$. Utilisée par `MoveOpeningTool`.

5. **Gestion Exclusive dans `useActiveTool` :**
   - `useActiveTool` instancie et référence de manière stable les 6 outils.
   - Tout appel à `setActiveToolKind(next)` invoque systématiquement `tool.reset()` sur l'outil sortant afin de purger les états transitoires (rubber-band, drag en cours) et effacer la prévisualisation.

### Conséquences

- Les 4 nouveaux outils sont testés unitairement en isolation totale sans navigateur ni DOM.
- Le test de crédibilité du BIM passe : déplacer un mur déplace automatiquement la porte et le trou 3D sans altérer `offsetAlong`.
- Total de 432 tests automatisés passant avec succès sur l'ensemble du monorepo.

---

## ADR-031 : Détection des Pièces par Union Booléenne des Murs, Point d'Ancrage Seed et Polylabel

- **Date :** 2026-11-14
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 4 (Détection automatique des pièces fermées, surfaces utiles et métriques spatiales)

### Problème

Dans un logiciel BIM, les pièces (_Rooms_) ne sont pas de simples rectangles statiques saisis par l'utilisateur. Elles doivent être détectées automatiquement lorsque des murs s'entourent pour former un espace clos, tout en respectant deux contraintes fondamentales :

1. **La pièce est un élément dérivé :** Conformément à l'ADR-001 et l'ADR-008, `BimDocument` ne doit jamais stocker de contours polygonaux. Si un mur est déplacé ou redimensionné, la pièce doit automatiquement voir son contour et sa surface recalculés sans risque de désynchronisation.
2. **La surface utile intérieure :** L'aire doit être strictement l'aire intérieure habitable (délimitée par les faces intérieures des murs hôtes), et non l'enveloppe brute extérieure.
3. **Stabilité sémantique :** Comment associer de manière déterministe le nom attribué par l'utilisateur ("Séjour", "Chambre") à l'espace géométrique recalculé lors des modifications documentaires ?

### Décisions Prises

1. **Représentation Dérivée Minimale (`Room`) :**  
   L'entité `Room` mémorise exclusivement :
   - `id: ElementId`
   - `category: 'room'`
   - `levelId: ElementId`
   - `seed: Vec2` (coordonnées 2D d'un point intérieur servant d'ancre sémantique)
   - `name: string`  
     Le polygone du contour, la surface en mm², le périmètre et le volume sont recalculés à la demande par le service `detectRooms(state, levelId)`.

2. **Détection par Union Booléenne (`polygon-clipping`) et Extraction des Vides :**
   - Les emprises au sol des murs du niveau sont unifiées via `polygon-clipping.union()`.
   - L'anneau extérieur de l'union correspond à l'enveloppe bâtie.
   - Les anneaux intérieurs (trous / _holes_) correspondent rigoureusement aux pièces fermées délimitées par les faces intérieures des murs.
   - Preuve arithmétique : pour 4 murs d'axe 4 m × 3 m avec épaisseur 200 mm, le trou intérieur mesure exactement $(4\,000 - 200) \times (3\,000 - 200) = 3\,800 \times 2\,800\text{ mm} \implies 10,64\text{ m}^2$ (strictement différent de l'enveloppe extérieure brute $13,44\text{ m}^2$).

3. **Positionnement Visuel Optimal via `polylabel` :**  
   Pour chaque vide détecté, l'algorithme du pôle d'inaccessibilité (`polylabel`) détermine le point intérieur le plus éloigné de tout obstacle/arête, garantissant un centrage idéal du libellé même pour des pièces concaves (en L ou U) ou comportant des poteaux intérieurs.

4. **Réconciliation Sémantique par Inclusion de Point :**  
   L'algorithme associe chaque entité `Room` existante au contour clos dans lequel tombe son point `seed` via l'algorithme de Ray-Casting (`isPointInPolygon`).

### Conséquences

- Invariant BIM respecté : zéro duplication géométrique dans le fichier documentaire.
- Exactitude spatiale : calcul de surface utile habitable rigoureux à 100%.
- Rendu 2D fluide avec poché pastel translucide et affichage des libellés (nom + surface).
- Dalle de sol 3D générée à la volée à l'élévation du niveau.

---

## ADR-032 : Cascade et Cycle de Vie des Rooms (Option B : Suppression en Cascade avec Réversibilité Immer)

- **Date :** 2026-11-14
- **Statut :** Obsolète (Amandé et remplacé par ADR-039 : Cycle de Vie Non-Destructif des Pièces)
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 4 (Gestion de la cohérence spatiale lors de la suppression de murs ou de niveaux) — Remplacé suite à l'audit critique d'alignement Revit/BIM (ADR-039).

### Problème

Que doit-il advenir d'une pièce (_Room_) lorsqu'un mur constitutif de sa fermeture est supprimé, rompant l'enceinte fermée ?
Trois options étaient envisageables :

- **Option A (Rejet strict) :** Interdire la suppression d'un mur tant qu'il borde une pièce déclarée. (UX rigide et frustrante pour l'architecte).
- **Option B (Suppression en cascade automatique) :** Supprimer automatiquement la pièce devenue non close lors de la suppression du mur, avec notification transactionnelle dans `getChangedIds()` et réversibilité totale via Undo/Redo.
- **Option C (État dégradé orphelin) :** Conserver la pièce dans le modèle avec un statut "non close" (surface 0 m²).

### Décisions Prises

1. **Adoption de l'Option B (Suppression en Cascade Transactionnelle) :**
   - Lorsqu'un mur est supprimé via `DeleteWallCommand`, l'union des murs du niveau est réévaluée.
   - Toute entité `Room` dont le `seed` ne se trouve plus à l'intérieur d'un espace fermé valide est supprimée du dictionnaire `state.rooms`.
   - `DeleteWallCommand.getChangedIds()` inclut l'identifiant du mur, les identifiants de toutes ses ouvertures hébergées et les identifiants de toutes les pièces supprimées en cascade.
   - **Réversibilité totale :** Le proxy Immer enregistre les patches inverses d'état. L'appel à `doc.undo()` restaure atomiquement le mur, ses baies et ses pièces sans perte d'information.

2. **Protection d'Intégrité des Niveaux :**  
   `canDeleteLevel(levelId, state)` interdit formellement la suppression d'un niveau si des entités `Room` y sont encore rattachées (`LEVEL_HAS_ATTACHED_ROOMS`), forçant la purge préalable des pièces ou le re-rattachement explicite.

### Conséquences

- Comportement BIM cohérent avec les standards de l'industrie (Revit supprime l'étiquette de pièce quand l'enceinte est détruite).
- La pile Undo/Redo préserve l'intégrité intégrale de l'état sans effet de bord ni état fantôme.
- Les métrés et totaux de surface du niveau s'ajustent instantanément de façon réactive.

---

## ADR-033 : Stratégie d'Exportation IFC — Générateur Natif TypeScript STEP ISO 10303-21

- **Date :** 2026-11-14
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 5 (Exportation IFC minimal et interopérabilité OpenBIM)

### Problème

Comment générer des fichiers IFC4 (Industry Foundation Classes) conformes à la norme ISO 10303-21 (STEP Physical File format) au sein de Mini-BIM ?
Trois options architecturales étaient envisageables :

1. **Option A (IfcOpenShell via sous-processus Python) :** Utiliser la bibliothèque de référence `ifcopenshell`. Problème critique : Python n'est pas installé sur l'environnement hôte Windows, et cette approche briserait le paradigme "zero-setup local-first" de l'application web.
2. **Option B (Générateur Natif Pur TypeScript dans `@mini-bim/core`) :** Implémenter un générateur STEP ISO 10303-21 strict directement dans le package `@mini-bim/core`.
3. **Option C (Module WebAssembly IFC.js / web-ifc) :** Embarquer un binaire WebAssembly lourd. Trop complexe et surdimensionné pour un export déclaratif de modèles paramétriques.

### Décisions Prises

Nous adoptons l'**Option B (Générateur Natif Pur TypeScript ISO 10303-21 STEP)** :

1. **Local-First et Zéro Dépendance :**  
   L'exportateur fonctionne instantanément côté client dans le navigateur ou dans Node.js/Vitest, sans runtime externe, sans sous-processus et sans compilation WASM.
2. **Conformité au Schéma IFC4 :**  
   Le fichier généré respecte rigoureusement la syntaxe STEP ISO 10303-21 :
   - En-tête normalisé : `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'), '2;1')`, `FILE_NAME`, `FILE_SCHEMA(('IFC4'))`.
   - Hiérarchie spatiale complète : `IfcProject` $\to$ `IfcSite` $\to$ `IfcBuilding` $\to$ `IfcBuildingStorey` reliés par `IfcRelAggregates`.
   - Modélisation solide des murs : `IfcWall` avec géométrie `IfcExtrudedAreaSolid` et profil `IfcArbitraryClosedProfileDef`.
   - Réservations et menuiseries conformes : `IfcOpeningElement` relié au mur par `IfcRelVoidsElement`, et rempli par `IfcDoor` ou `IfcWindow` via `IfcRelFillsElement`.
   - Espaces et surfaces habitables : `IfcSpace` avec quantités normalisées `Qto_SpaceBaseQuantities` (`NetFloorArea`, `NetVolume`) reliées par `IfcRelDefinesByProperties`.
   - Rattachement spatial d'étage : `IfcRelContainedInSpatialStructure`.
3. **Encodage Robuste et Performance :**  
   Génération de GUIDs conformes base64-IFC (22 caractères) et échappement automatique des chaînes de caractères. Temps de génération typique : $< 5\text{ ms}$ pour une maquette complète.

### Conséquences

- Interopérabilité OpenBIM totale avec les visionneuses et logiciels du marché (BIMcollab, Solibri, BlenderBIM, Autodesk Revit).
- Téléchargement direct instantané via `Blob` d'URL côté client dans l'interface web.
- Suite de tests unitaires automatisés validant la conformité syntaxique et structurelle du fichier STEP généré.

---

## ADR-034 : Cotations 2D Associatives et Propagation Paramétrique Bidirectionnelle

- **Date :** 2026-11-14
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 5 (Documentation de plans et cotations associatives)

### Problème

Dans un outil BIM, une cotation n'est pas un simple texte graphique passif : c'est une métadonnée paramétrique associative. Lorsque l'architecte allonge ou déplace un mur, la cotation attachée doit automatiquement recalculer sa valeur sans intervention manuelle. Lorsqu'un mur est supprimé, la cotation orpheline doit disparaître.

### Décisions Prises

1. **Modèle de Données Déclaratif :**  
   Introduction de l'entité `Dimension` dans `BimState.dimensions` avec références architecturales (`references: ElementId[]`), décalage perpendiculaire (`offset`), valeur calculée (`value`) et libellé optionnel (`customLabel`).
2. **Calcul Pur et Déterministe :**  
   La fonction pure `computeDimensionValue(dim, state)` calcule :
   - Pour 1 référence de mur : la longueur axiale exacte du mur ($\|P_2 - P_1\|$).
   - Pour 2 références : la distance orthogonale exacte entre les deux murs s'ils sont parallèles, ou la distance entre leurs milieux.
3. **Associativité Transactionnelle (`UpdateWallCommand`) :**  
   Lors de l'application d'un `UpdateWallCommand`, le draft Immer recherche toutes les cotations dont `references.includes(wallId)` et recalcule dynamiquement leur `value`. `UpdateWallCommand.getChangedIds()` retourne `[wallId, ...impactedDimensionIds]`.
4. **Cascade et Réversibilité (`DeleteWallCommand`) :**  
   Lorsqu'un mur est supprimé, toutes les cotations qui le référencent sont supprimées en cascade de `draft.dimensions`. Grâce à Immer, un appel à `doc.undo()` restaure le mur et toutes ses cotations associées à l'identique.
5. **Rendu Architectural Conforme :**
   - En Canvas 2D (`@mini-bim/view-2d`) : tracé des lignes de rappel, ligne de cote, traits obliques à 45° et texte orienté lisible.
   - En export SVG imprimable (`generatePlanSvg`) : calque dédié `<g id="dimensions">` vectoriel, net et proportionné à l'échelle choisie (1:50, 1:100, 1:200).

### Conséquences

- L'utilisateur n'a jamais à mettre à jour manuellement ses cotes après avoir modifié un plan.
- Respect rigoureux des Règles d'Or : modularité stricte, séparation des responsabilités et réversibilité transactionnelle intégrale.

---

## ADR-035 : Architecture des Dalles Horizontales (`Slab`), Représentation Polygonale 2D et Extrusion 3D Négative

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 6 (Dalles horizontales, planchers et toitures terrasses)

### Problème

Comment modéliser et positionner les dalles structurelles horizontales (`Slab`) au sein du modèle déclaratif de Mini-BIM et dans les moteurs de rendu 2D et 3D ?
Trois questions critiques se posent :

1. Quelle est la convention d'ancrage altimétrique de la dalle par rapport au niveau ?
2. Comment gérer les trémies d'escalier ou les gaines techniques (trous dans la dalle) ?
3. Comment assurer l'étanchéité géométrique 3D sans interférer avec les pieds de murs ?

### Décisions Prises

1. **Modèle de Données Déclaratif Minimal (`BimState.slabs`) :**  
   Introduction de l'entité `Slab` dans le state :
   - `id: ElementId` (ULID unique).
   - `levelId: ElementId` (Niveau de rattachement).
   - `boundary: Vec2[]` (Contour extérieur polygonal simple, orienté CCW).
   - `holes: Vec2[][]` (Liste de contours intérieurs pour les trémies, orientés CW).
   - `thickness: number` (Épaisseur constructive strictement positive, ex: 200 mm).
   - `baseOffset: number` (Décalage altimétrique optionnel par rapport au niveau).
2. **Convention Altimétrique d'Extrusion Négative (Sous le Niveau) :**  
   Dans les règles de l'art du bâtiment et dans Revit/IFC, l'élévation d'un niveau d'étage représente la cote de **plancher fini**. La dalle structurelle est donc positionnée sous cette cote :
   - Face supérieure de la dalle : $Z_{\text{sup}} = \text{level.elevation} + \text{baseOffset}$.
   - Face inférieure de la dalle : $Z_{\text{inf}} = Z_{\text{sup}} - \text{thickness}$.  
     Cette convention garantit que les murs posés au niveau ($Z = \text{level.elevation}$) reposent exactement sur la face supérieure de la dalle sans interpénétration volumique avec celle-ci.
3. **Triangulation 3D Robuste via `earcut` :**  
   La géométrie 3D de la dalle est générée via un maillage extrudé indexé. Les faces supérieure et inférieure sont triangulées par `earcut` en gérant nativement les trous (`holes`). Les parois latérales verticales relient les arêtes extérieures et intérieures entre $Z_{\text{sup}}$ et $Z_{\text{inf}}$.
4. **Rendu 2D en Plan :**  
   Le contour de la dalle est tracé en trait continu discret avec motif de poché ou bordure différenciée. Les trémies intérieures sont représentées avec les diagonales de réservation normalisées (croix de trémie).
5. **Export IFC4 Normalisé (`IfcSlab`) :**  
   La dalle est exportée sous forme d'`IFCSLAB` avec `PredefinedType = .FLOOR.` (ou `.BASESLAB.` pour le rez-de-chaussée). La géométrie utilise `IfcExtrudedAreaSolid` avec un profil `IfcArbitraryProfileDefWithVoids` pour les dalles percées de trémies.

### Conséquences

- Modèle géométrique clair, prédictible et exempt de conflits d'altimétrie avec les murs.
- Les trémies d'escalier sont prises en compte aussi bien en 3D (trou solide net) qu'en 2D.
- Maintien du principe d'immutabilité et de réversibilité transactionnelle intégrale (`AddSlabCommand`, `UpdateSlabCommand`, `DeleteSlabCommand`).

---

## ADR-036 : Gestion du Multi-Niveaux, Altimétrie Paramétrique et Rendu Fantôme (`Underlay`)

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 6 (Édifices multi-étages RDC + R+1)

### Problème

Dans un bâtiment à plusieurs étages, comment permettre à l'utilisateur de concevoir les cloisons et murs d'un étage supérieur en référence directe aux murs porteurs du rez-de-chaussée, sans surcharger la vue 2D ni dupliquer les éléments ?

### Décisions Prises

1. **Notion de Niveau Actif (`activeLevelId`) dans le Store UI :**  
   L'interface web possède un sélecteur de niveau actif. Le viewport 2D affiche en priorité les éléments (murs, ouvertures, pièces, cotations, dalles) rattachés à ce niveau.
2. **Vue Fantôme en Transparence (_Underlay_) :**  
   Lorsque l'utilisateur travaille sur le niveau $N$ (ex: R+1), le moteur 2D propose d'activer la vue Underlay du niveau $N-1$ (RDC) :
   - Les murs du niveau inférieur sont dessinés en traits fins pointillés gris clair (`#9ca3af`).
   - Les ouvertures du niveau inférieur sont indiquées en pointillés légers pour repérer les aplombs de fenêtres.
3. **Magnétisme Inter-Niveaux (Snap sur l'Underlay) :**  
   L'algorithme de snap prend en compte les sommets et les lignes d'axe des murs du niveau inférieur affichés dans l'Underlay. L'utilisateur peut ainsi aligner une façade d'étage sur la façade du rez-de-chaussée d'un seul clic.
4. **Empilement 3D Coordonné :**  
   Dans le viewport 3D, tous les niveaux sont affichés simultanément. Chaque élément calcule sa position globale en $Z$ à partir de l'élévation de son niveau (`level.elevation`).

### Conséquences

- Ergonomie calquée sur les meilleurs standards professionnels (Revit, ArchiCAD).
- Alignement architectural immédiat des façades et des refends porteurs entre étages.
- Aucune pollution du modèle documentaire : l'Underlay est une pure option de visualisation 2D.

---

## ADR-037 : Modèle Paramétrique d'Escalier (`Stair`) et Découpe Automatique de Trémie

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 6 (Circulations verticales et liaisons inter-niveaux)

### Problème

Comment modéliser les circulations verticales entre étages de manière rigoureuse, en respectant les normes de sécurité de l'architecture (formule de Blondel) tout en assurant l'ouverture de la trémie dans le plancher haut ?

### Décisions Prises

1. **Modèle Déclaratif `Stair` :**
   - `id: ElementId`.
   - `bottomLevelId: ElementId` et `topLevelId: ElementId`.
   - `startPoint: Vec2` (départ au sol du niveau bas) et `endPoint: Vec2` (arrivée au niveau haut).
   - `width: number` (largeur de la volée, ex: 900 mm).
2. **Application Automatique de la Formule de Blondel :**  
   Soit $\Delta Z = \text{topLevel.elevation} - \text{bottomLevel.elevation}$ la hauteur à franchir.
   - Le moteur calcule automatiquement le nombre optimal de marches $N$ pour que la hauteur de contremarche $h = \Delta Z / N$ soit comprise entre $160\text{ mm}$ et $185\text{ mm}$.
   - Le giron $g = \|\text{endPoint} - \text{startPoint}\| / (N - 1)$ est validé selon la relation de confort :
     $$2h + g \in [600, 640]\text{ mm}$$
   - Si les dimensions choisies violent la formule, un avertissement constructif est affiché dans l'inspecteur.
3. **Réservation Automatique de Trémie :**  
   Une fonction d'assistance permet de générer automatiquement un contour de trémie (`hole`) dans la dalle du niveau supérieur, avec recul suffisant pour garantir une échappée de tête d'au moins $2,00\text{ m}$ sur toute la montée.
4. **Rendu Architectural Conforme :**
   - En 2D : tracé des nez de marches, ligne de foulée avec flèche orientée vers le haut, et trait de coupe oblique à mi-hauteur.
   - En 3D : maillage solide Three.js crénelé avec contremarches et marches distinctes.

### Conséquences

- Conception intuitive et normée des escaliers.
- Cohérence tridimensionnelle parfaite entre l'escalier et le trou de plancher qui le surplombe.

---

## ADR-038 : Relations Déclaratives Inter-Entités et Moteur de Cascade Générique

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Architecture du modèle BIM pour la Saison 2 (Phases 6 à 9)

### Problème

Actuellement, les cascades de suppression sont codées en dur de manière impérative dans les commandes : `DeleteWallCommand` référence explicitement `doors`, `windows`, `rooms` et `dimensions`. Avec l'arrivée des dalles (`slabs`), des escaliers (`stairs`), des toits (`roofs`), des équipements (`components`) et des réseaux techniques (`mep`), chaque nouvelle entité obligerait à rouvrir et modifier toutes les commandes de suppression existantes, violant l'Open-Closed Principle (OCP) et créant une dette technique exponentielle.

### Décisions Prises

1. **Registre de Métadonnées des Relations (`RELATIONS_REGISTRY`) :**  
   Définition déclarative centralisée des dépendances et politiques d'intégrité référentielle :
   ```typescript
   export interface RelationDef {
     readonly sourceCategory: Category;
     readonly field: string;
     readonly targetCategory: Category;
     readonly isArray?: boolean;
     readonly onDelete: 'cascade' | 'restrict' | 'detach';
   }
   ```
   Exemples déclaratifs :
   - `door.hostWallId` $\to$ `wall` (`onDelete: 'cascade'`)
   - `window.hostWallId` $\to$ `wall` (`onDelete: 'cascade'`)
   - `dimension.references` $\to$ `wall` (`onDelete: 'cascade'`)
   - `wall.levelId` $\to$ `level` (`onDelete: 'restrict'`)
   - `slab.levelId` $\to$ `level` (`onDelete: 'restrict'`)
2. **Moteur Générique de Cascade (`resolveCascadeDeletions`) :**  
   La suppression d'un élément interroge le registre pour collecter automatiquement et de façon déterministe tous les éléments dépendants à supprimer en cascade, ou pour rejeter la transaction (`DELETE_REJECTED`) si une contrainte `restrict` est violée.
3. **Pérennité de `getChangedIds()` :**  
   `getChangedIds()` est calculé directement et automatiquement à partir du résultat du moteur générique de cascade, sans logique spécifique par élément.

### Conséquences

- L'ajout d'une nouvelle entité (ex: `Slab` en Phase 6) s'effectue par simple déclaration dans le registre sans jamais retoucher aux commandes de murs ou d'autres entités existantes.
- Code du noyau (`@mini-bim/core`) hautement maintenable, modulaire et extensible.

---

## ADR-039 : Cycle de Vie Non-Destructif des Pièces (Statut Dérivé `Enclosed` / `Unenclosed`)

- **Date :** 2026-11-15
- **Statut :** Accepté (Amende et remplace la cascade destructive d'ADR-032)
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Révision architecturale suite à l'audit critique de cohérence métier

### Problème

L'ADR-032 supprimait en cascade l'entité `Room` de `BimState.rooms` dès qu'un mur frontière était détruit. Ce comportement contredisait le principe fondateur ADR-001 (la géométrie est un cache dérivé) et le standard de référence Revit :
Si un architecte supprime un mur pour le redessiner 50 cm plus loin, la pièce (avec son identifiant, son nom "Chambre Parents", son numéro et ses finitions) était définitivement perdue.

### Décisions Prises

1. **Préservation Sémantique de la Pièce :**  
   Une pièce (`Room`) n'est **jamais supprimée automatiquement** lors de la modification ou suppression d'un mur. Seule une action explicite de l'utilisateur (`DeleteRoomCommand`) peut détruire l'entité.
2. **Statut Spatial Dérivé à la Demande :**  
   Le moteur spatial `detectRooms` attribue dynamiquement un statut à chaque pièce déclarée dans le modèle :
   - `enclosed` : La graine (`seed`) est géométriquement contenue dans un contour fermé de murs. La surface, le périmètre et le volume sont calculés.
   - `unenclosed` : Le contour de murs est ouvert (« fuite » d'enceinte). L'étiquette de pièce reste affichée en grisé sur le plan avec la mention _« Non délimitée »_ et une surface de $0\text{ m}^2$.
   - `redundant` : Deux graines distinctes se retrouvent dans la même enceinte fermée.
3. **Restauration Automatique :**  
   Dès que l'utilisateur referme l'enceinte de murs, la pièce redevient instantanément `enclosed` avec recalcul de sa surface, sans perte d'historique ni de métadonnées.

### Conséquences

- Alignement rigoureux avec le fonctionnement éprouvé de Revit.
- Élimination des suppressions en cascade complexes et fragiles pour les pièces.
- Expérience utilisateur infiniment plus tolérante aux phases intermédiaires de dessin de cloisons.

---

## ADR-040 : Contrainte Altimétrique Supérieure des Murs (`topConstraint`) et Sous-Face de Dalle

- **Date :** 2026-11-15
- **Statut :** Accepté (Révisé suite à l'Audit Croisé)
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Phase 6 (Multi-niveaux et planchers d'étages)

### Problème

Dans un bâtiment à étages, si un mur du niveau $N$ s'élève jusqu'à l'élévation brute du niveau supérieur $N+1$, il entre en collision volumique avec la dalle de plancher du niveau $N+1$. Cette interpénétration engendre :

1. Un double comptage faux des volumes de béton dans les métrés.
2. Des conflits volumiques (clashs 3D) dans les visionneuses IFC OpenBIM.
3. Des failles potentielles si la formule ne précise pas quelle dalle couvre le mur, ignore le `baseOffset` de la dalle (ex: une dalle abaissée de 100 mm qui rentre dans le mur), ou ne propage pas les invalidations du type de dalle vers les murs contraints.

### Décisions Prises

1. **Introduction de `topConstraint` sur `Wall` :**  
   Tout mur peut définir son raccord altimétrique supérieur :
   ```typescript
   export interface TopConstraint {
     readonly levelId: ElementId; // Niveau supérieur d'attachement (ex: N+1)
     readonly offset?: number; // Décalage relatif optionnel en mm (défaut: 0)
   }
   ```
2. **Priorité Algorithmique (`heightOverride` vs `topConstraint`) :**
   - **Priorité absolue à `heightOverride` :** Si un mur possède une valeur `heightOverride: number` explicite (cas d'un muret d'allège libre, acrotère, ou mur rideau non attaché), sa hauteur est rigoureusement $H = \text{heightOverride}$ et $Z_{\text{top}} = Z_{\text{base}} + H$. La contrainte de niveau supérieur est alors inactive.
   - **Comportement par défaut (Paramétrique Revit) :** Par défaut, pour tout mur standard nouvellement créé ou migré sans `heightOverride`, la contrainte `topConstraint` est active et pointe vers le niveau immédiatement supérieur $N+1$ (`offset: 0`).
3. **Calcul Rigoureux de Sous-Face de Dalle de Couverture :**  
   Pour un mur $W$ contraint au niveau $N+1$ :
   - Le moteur recherche parmi les dalles portées par le niveau $N+1$ celles dont le contour 2D `boundary` couvre géométriquement l'axe ou l'emprise au sol du mur.
   - Si une dalle $S$ couvre le mur $W$, l'altitude de sous-face de cette dalle est :
     $$Z_{\text{inf}}(S) = \text{level}_{N+1}.\text{elevation} + (\text{slab.baseOffset} \mathbin{??} 0) - \text{slabType.thickness}$$
     Le sommet du mur s'arrête exactement sous cette sous-face :
     $$Z_{\text{top}}(W) = Z_{\text{inf}}(S) + (\text{topConstraint.offset} \mathbin{??} 0)$$
   - Si plusieurs dalles couvrent différentes parties du mur, la cote retenue est $\min_S Z_{\text{inf}}(S)$ afin de garantir l'absence totale de collision.
   - Si aucune dalle du niveau $N+1$ ne couvre le mur (ex: mur en double hauteur ou terrasse extérieure), le sommet du mur s'arrête à l'élévation brute du niveau :
     $$Z_{\text{top}}(W) = \text{level}_{N+1}.\text{elevation} + (\text{topConstraint.offset} \mathbin{??} 0)$$
   - La hauteur géométrique résultante est : $H_{\text{eff}} = Z_{\text{top}}(W) - Z_{\text{base}}(W)$.
4. **Intégration DAG des Dépendances Dalle $\to$ Murs (ADR-041) :**  
   Le DAG enregistre les arêtes orientées :
   - `slab (N+1) -> wall (N)` (pour tout mur couvert)
   - `slab (N) -> wall (N)` (pour tout mur reposant sur la dalle si `slab.baseOffset > 0`, car la face supérieure surélève le pied de mur)
   - `slabType -> slab`
   - `level (N+1) -> wall (N)`
     Toute modification de l'épaisseur du type de dalle (`slabType.thickness`), du décalage de dalle (`baseOffset`), ou de l'élévation du niveau recalcule automatiquement $Z_{\text{top}}$ (ou $Z_{\text{base}}$) et re-maille les murs contraints sous-jacents.
5. **Garantie d'Absence de Collision (Disjonction Parfaite) :**  
   Pour tout mur du niveau $N$ couvert par une dalle du niveau $N+1$ (quel que soit son `baseOffset` dans $[-500, +500]$ mm) :
   $$wall_N.maxZ \le slab_{N+1}.minZ \implies \text{Volume}(wall_N \cap slab_{N+1}) \equiv 0$$

### Conséquences

- Les murs suivent automatiquement les variations de hauteur d'étage et d'épaisseur de plancher.
- Éradication totale des conflits d'interpénétration mur/dalle en 3D et dans les exports IFC4.
- Invariant mathématique robuste testé par fuzzing de propriétés (`fast-check`).

---

## ADR-041 : Architecture du Graphe de Dépendances Minimal (DAG) et Moteur de Propagation Générique

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Résolution de la dette d'extensibilité identifiée lors de l'audit croisé Claude / Architecte. Le principe architectural n°4 ("Propagation réactive par DAG") était jusqu'alors implémenté de manière ad-hoc via des listes d'IDs codées en dur dans chaque commande Immer (`getChangedIds()`), violant le principe Ouvert/Fermé (Open-Closed Principle).

### Problème

À chaque nouvelle catégorie BIM introduite (dalles en Phase 6, toitures en Phase 7, composants en Phase 8, gaines et tuyaux en Phase 9), les commandes existantes (`DeleteWallCommand`, `DeleteLevelCommand`, etc.) devaient être réouvertes pour y ajouter la logique de cascade manuelle. Sans DAG centralisé :

1. `getChangedIds()` risquait d'omettre des dépendants, empêchant l'invalidation propre des caches géométriques ou du rendu.
2. Les contraintes d'intégrité (ex: interdiction de supprimer un niveau référencé) nécessitaient un parcours itératif spécifique dans chaque commande.

### Décisions Prises

1. **Option A retenue (DAG Minimal en TypeScript Pur) :**  
   Implémentation dans `@mini-bim/core` d'une structure de graphe dirigé acyclique compacte (~100 à 150 lignes de code) sans dépendance externe, couplée au `RELATIONS_REGISTRY` (ADR-038).
2. **Structure du DAG (`DependencyGraph`) :**
   ```typescript
   export class DependencyGraph {
     private readonly forward = new Map<ElementId, Set<ElementId>>(); // parent -> enfants dépendants
     private readonly reverse = new Map<ElementId, Set<ElementId>>(); // enfant -> parents référencés

     addEdge(parent: ElementId, child: ElementId): void;
     removeEdge(parent: ElementId, child: ElementId): void;
     removeNode(id: ElementId): void;
     getDependents(id: ElementId): readonly ElementId[]; // fermeture transitive aval
     getDependencies(id: ElementId): readonly ElementId[]; // parents amont directs
     getChangedIds(modifiedRootIds: readonly ElementId[]): readonly ElementId[]; // tri topologique
   }
   ```
3. **Alimentation Hybride du DAG (Clés Étrangères Explicites & Sur-Invalidation Spatiale) :**  
   Le DAG ne pouvant pas dériver les relations purement spatiales (couverture 2D de dalle ou connectivité de sommets) à partir de champs statiques seuls, il combine deux mécanismes :
   - **Arêtes Déclaratives par Clés Étrangères :**
     - Baie `door` / `window` $\to$ arc `hostWallId` $\to$ `openingId`
     - Famille/Type $\to$ arc `typeId` $\to$ `instanceId` (ex: `wallTypeId` $\to$ `wallId`, `doorTypeId` $\to$ `doorId`, `windowTypeId` $\to$ `windowId`, `slabTypeId` $\to$ `slabId`)
     - Cotation `dim` $\to$ arcs `references[i]` $\to$ `dimId`
     - Entité de niveau `e` (mur, dalle) $\to$ arc `levelId` $\to$ `e.id`
   - **Arêtes de Sur-Invalidation Spatiale (Coarse-Grained Spatial Dependencies) :**
     - **Dalle $N+1 \to$ Murs du niveau $N$ :** Tout mur contraint au niveau supérieur $N+1$ dépend du niveau $N+1$ et de l'ensemble des dalles de ce niveau (`slabs(N+1) -> wall(N)`). Toute modification d'épaisseur de dalle, de décalage ou de contour sur $N+1$ ré-évalue automatiquement le $Z_{\text{top}}$ des murs sous-jacents. Le surcoût d'invalidation est négligeable ($\ll 0.01\text{ ms}$).
     - **Connectivité Spatiale des Jonctions :** Les voisins connectés partageant un sommet coïncident ($\|P_i - P_j\| \le 1.0\text{ mm}$) sont résolus dynamiquement à la volée par le moteur de topologie géométrique lors des déplacements.
4. **Suppression Générique Déduite par le Graphe :**  
   Le moteur générique de cascade (`resolveCascadeDeletions`, ADR-038) interroge le DAG :
   - Si `onDelete: 'cascade'`, suppression récursive de la fermeture transitive.
   - Si `onDelete: 'restrict'` et qu'il existe des arcs entrants, rejet immédiat avec le code unifié `DELETE_RESTRICTED` et la liste `blockingIds: ElementId[]` des éléments empêchant la suppression.
   - Si `onDelete: 'detach'`, réinitialisation des clés étrangères orphelines.
5. **Sémantique Déterministe de `getChangedIds()` (Option B) :**  
   Chaque `Command.getChangedIds()` retourne la liste exacte des `ElementId` directement mutés dans le draft Immer par `apply()`. Cette liste correspond bijectivement aux opérations `add`/`remove`/`replace` générées par `produceWithPatches`.  
   `BimDocument.execute()` calcule ensuite :
   $$\text{changedFinal} = \text{union}(\text{getChangedIds}(), \text{dag.getDependents}(\text{getChangedIds}()))$$
   Le DAG capture les dépendants transitifs non directement mutés (ex : une ouverture devant être revalidée suite à un changement de type de mur), garantissant qu'aucun élément impacté n'est omis.  
   **Conséquence pour `DeleteWallCommand` :** En 6.0a, `DeleteWallCommand.getChangedIds()` retourne `[wallId, ...openingIds, ...dimIds, ...roomIds]` (tout ce que `apply()` a supprimé du draft). En Phase 6.1, quand ADR-039 (statut dérivé) sera implémenté, `apply()` ne mutera plus les Rooms $\to$ `getChangedIds()` ne les inclura plus. Ce changement de comportement sera acté par mise à jour des tests concernés à ce moment-là.  
   **Signature Canonique Hôte-Dépendante pour `AddDoorCommand` et `AddWindowCommand` (Stratégie B) :**  
   Bien que `AddDoorCommand.apply()` et `AddWindowCommand.apply()` ne mutent techniquement que les dictionnaires `doors` ou `windows` dans le draft Immer (le mur hôte ne recevant pas de patch de mutation direct), ces deux commandes retournent `[this.door.id, this.door.hostWallId]` et `[this.window.id, this.window.hostWallId]`.  
   Cette signature est canonique et définitivement conservée : une commande d'insertion de baie est par essence « hôte-aware », car percer une ouverture impacte directement le solide 3D et le tracé 2D de son mur hôte. Le DAG orienté `wall -> opening` n'a ainsi pas besoin d'être complexifié par des arêtes inverses redondantes (`opening -> wall`), et les viewports reçoivent la garantie immédiate de régénération du solide percé sans aucun risque de régression de rendu. Une éventuelle normalisation vers `[openingId]` pur ne sera envisagée qu'en Phase 9 si un mécanisme d'invalidation dédié aux hôtes est formellement introduit.
6. **Post-Condition Universelle Différentielle (`validateDirty`) dans `execute()` :**  
   Pour éradiquer les vérifications ad-hoc par commande tout en évitant de bloquer des commandes innocentes sur des modèles avec des avertissements préexistants, `BimDocument.execute()` exécute une post-condition différentielle sur l'ensemble du dirty set avant validation transactionnelle :
   ```typescript
   validateDirty(draftState, changedIds, previousState);
   ```
   - Calcule les violations de règles sur les entités du dirty set dans `draftState`.
   - Ne rejette la transaction que si elle **introduit au moins une nouvelle violation** ou aggrave une violation existante par rapport à `previousState`.
   - Porte obligatoirement `offendingIds: ElementId[]` dans l'exception `BimValidationError` afin que l'UI puisse cibler visuellement les éléments responsables.
   - Pour tout mur sale : vérifie la non-dégénérescence ($L > 10^{-4}\text{ mm}$) et re-valide ses ouvertures via `validateOpenings(wall, openings)` ($H_{\text{linteau}} \le H_{\text{eff}}$, gardes de rive, non-chevauchement).
   - Pour toute dalle sale : exécute `validateSlab(slab, draftState)`.
   - Pour tout niveau sale : vérifie la stricte unicité des élévations (`DUPLICATE_LEVEL_ELEVATION`).
   - Pour tout type sale : vérifie les épaisseurs et dimensions positives.
     Si une nouvelle contrainte est violée dans le dirty set, la transaction est **rejetée atomiquement**, le draft Immer est abandonné et rien n'est empilé dans l'historique Undo/Redo.  
     **Politique de validation de l'état initial :**  
     Le constructeur `BimDocument(initialState)` n'exécute pas `validateDirty` lors de l'instanciation initiale du document. La validation différentielle est active exclusivement sur les mutations exécutées via `execute(command)`. Cette politique permet le chargement, la consultation ou la migration contrôlée de documents historiques ou de maquettes d'importation comportant des avertissements préexistants, tout en garantissant qu'aucune nouvelle violation ou aggravation de violation ne peut être introduite par les commandes applicatives.

### Conséquences

- Respect total d'Open/Closed : ajouter une entité (dalle, toiture) ne touche jamais aux commandes des autres entités.
- Algorithme ultra-rapide par parcours en largeur (BFS) en $\mathcal{O}(V + E)$ ($\ll 0.1\text{ ms}$).
- Détection immédiate de tout cycle éventuel d'invalidation.
- Garantie formelle et universelle d'intégrité géométrique sur toutes les opérations (modification de niveau, changement de type de dalle, étirement de mur).

---

## ADR-042 : Généralisation du Modèle Type / Instance (`SlabType`, `DoorType`, `WindowType`)

- **Date :** 2026-11-15
- **Statut :** Accepté (Révisé suite à l'Audit Croisé)
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Anticipation architecturale de la Phase 6.1 et de la bibliothèque de composants (Phase 8)

### Problème

En V1.0, seule l'entité `Wall` disposait d'un type formel (`WallType`), tandis que `Door`, `Window` et le premier jet de `Slab` stockaient leurs propriétés dimensionnelles constructives directement sur l'instance (`door.width`, `door.height`, `window.sillHeight`, `slab.thickness`).
Pour la Phase 8 (catalogue de familles et composants paramétriques), l'absence de types pour les portes, fenêtres et dalles forcerait une migration de schéma cassante. De plus, une migration simpliste forçant toutes les baies vers un type standard unique (ex: 900×2100) détruirait les dimensions personnalisées existantes.

### Décisions Prises

1. **Standardisation Globale du Modèle Type / Instance :**  
   Toutes les entités architecturales hôtes et hébergées sont strictement réparties en Type constructif et Instance paramétrique, en préservant scrupuleusement les contrats d'interface existants (`offsetAlong` et `swing: { side, direction }`) :
   - **`SlabType` & `Slab` :**
     ```typescript
     export interface SlabType {
       readonly id: ElementId;
       readonly name: string; // ex: "Dalle BA 200 mm"
       readonly thickness: number; // mm (> 0)
       readonly materialId?: string;
     }
     export interface Slab {
       readonly id: ElementId;
       readonly category: 'slab';
       readonly slabTypeId: ElementId;
       readonly levelId: ElementId;
       readonly boundary: readonly Vec2[];
       readonly holes: readonly (readonly Vec2[])[];
       readonly baseOffset?: number; // mm (décalage propre à l'instance, défaut: 0)
       readonly name?: string;
     }
     ```
   - **`DoorType` & `Door` :**
     ```typescript
     export interface DoorType {
       readonly id: ElementId;
       readonly name: string; // ex: "Porte Isoplane 900x2100"
       readonly width: number; // mm (> 0)
       readonly height: number; // mm (> 0)
     }
     export interface Door {
       readonly id: ElementId;
       readonly category: 'door';
       readonly doorTypeId: ElementId;
       readonly hostWallId: ElementId;
       readonly offsetAlong: number; // Abscisse curviligne préservée depuis start
       readonly swing: {
         readonly side: 'left' | 'right';
         readonly direction: 'in' | 'out'; // Requis pour le rendu 2D et IFC
       };
     }
     ```
   - **`WindowType` & `Window` :**
     ```typescript
     export interface WindowType {
       readonly id: ElementId;
       readonly name: string; // ex: "Fenêtre Châssis 1200x1400"
       readonly width: number; // mm (> 0)
       readonly height: number; // mm (> 0)
       readonly defaultSillHeight: number; // mm
     }
     export interface Window {
       readonly id: ElementId;
       readonly category: 'window';
       readonly windowTypeId: ElementId;
       readonly hostWallId: ElementId;
       readonly offsetAlong: number; // Abscisse curviligne préservée
       readonly sillHeight: number; // Allège propre à l'instance
     }
     ```
2. **Re-validation Transactionnelle lors de la Modification de Type :**  
   Lors de l'exécution de `UpdateDoorTypeCommand` ou `UpdateWindowTypeCommand` (ex: modification de largeur de 900 mm à 1200 mm) :
   - Le gestionnaire de commande interroge le DAG pour identifier toutes les instances dépendantes du type.
   - Pour chaque mur hôte concerné, il réévalue `validateOpenings(wall, openings)`.
   - Si une seule des instances dépendantes vient à sévériser son mur hôte ou chevaucher une autre baie suite à cet élargissement, la transaction est **rejetée atomiquement** avec l'erreur typée `TYPE_UPDATE_INVALIDATES_INSTANCES`, protégeant le modèle contre toute corruption géométrique.
3. **Arêtes DAG Type $\to$ Instance (ADR-041) :**  
   Les arêtes `doorTypeId -> doorId`, `windowTypeId -> windowId`, et `slabTypeId -> slabId` sont enregistrées dans le DAG. Toute modification de type invalide automatiquement l'ensemble des instances associées dans `getChangedIds()`, provoquant le recalcul et le re-maillage de leurs murs hôtes respectifs.

### Conséquences

- Zéro régression sur le tracé des débattements 2D (`swing.direction` préservé).
- Continuité parfaite des noms de champs (`offsetAlong`).
- Intégrité constructive garantie lors des modifications massives par type.

---

## ADR-043 : Migration de Schéma Documentaire v2 et Préservation Intégrale des Familles

- **Date :** 2026-11-15
- **Statut :** Accepté
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Transition du modèle V1 vers le modèle multi-niveaux et dalles en Phase 6.1

### Problème

En V1.0 (`schemaVersion: 1`), les portes et fenêtres stockaient leurs dimensions (`width`, `height`) directement sur l'instance. La mise à niveau vers le modèle Type/Instance d'ADR-042 constitue une modification de schéma structurelle.
Une migration simpliste assignant des types standards fixes (ex: tous les ouvrants forcés à 900×2100) détruirait les dimensions sur mesure de maquettes existantes.

### Décisions Prises

1. **Incrémentation de `schemaVersion` :**  
   Le schéma documentaire passe formellement à `schemaVersion: 2`.
2. **Fonction Pure de Migration `migrateSchemaV1toV2` :**  
   Lors de la désérialisation JSON (`deserializeBimDocument`), tout état avec `schemaVersion: 1` (ou non spécifié) est automatiquement converti par une fonction de migration déterministe :
   - **Portes :** Partitionnement de `v1State.doors` par dimensions distinctes $(width, height)$. Pour chaque couple unique rencontré, un `DoorType` dédié est généré (ex: `door-type-900x2100` avec nom `"Porte 900×2100 mm"`). L'instance de porte se voit assigner le `doorTypeId` correspondant. **Aucune dimension n'est écrasée.**
   - **Fenêtres :** Partitionnement par triplet distinct $(width, height, sillHeight)$. Génération d'un `WindowType` dédié par triplet (ex: `window-type-1200x1400-900`).
   - **Dalles & Types de Dalles :** Initialisation d'un type de dalle standard `default-slab-type` (épaisseur 200 mm) et initialisation du dictionnaire `slabs: {}`.
   - **Préservation Géométrique des Murs Migrés (`heightOverride` conditionnel) :**  
     Afin d'éviter de figer artificiellement tous les murs de la Saison 1 à hauteur fixe (ce qui empêcherait leur raccordement automatique sous les dalles lors de l'ajout ultérieur d'un étage R+1), la migration pose :
     $$\text{wall.heightOverride} = \text{wallType.height}$$
     **uniquement** si un niveau supérieur existe déjà dans le fichier ET que l'écart altimétrique avec ce niveau est différent de `wallType.height`.  
     Dans les fichiers mono-niveau standards de Saison 1 (sans étage supérieur), `heightOverride` reste `undefined` : le mode automatique donne exactement `wallType.height` (invariance volumique garantie), tout en permettant au mur de s'adapter automatiquement sous la sous-face de la dalle lors de l'ajout ultérieur d'un étage.
   - **Raccord Altimétrique Dynamique pour les Nouveaux Murs & Invalidation `AddLevel` :**  
     Pour tout mur en mode automatique (`heightOverride: undefined`), la contrainte supérieure est résolue dynamiquement vers le niveau immédiatement supérieur (`next-level-up`). L'ajout d'un niveau supérieur (`AddLevelCommand`) recalcule la hauteur des murs auto sous-jacents et les inclut systématiquement dans `getChangedIds()`.
   - **Bascule « Auto / Fixe » dans l'Inspecteur :**  
     Le panneau d'inspection des propriétés offre une bascule claire entre hauteur automatique (contrainte au niveau supérieur avec déduction de dalle) et hauteur fixe manuelle (`heightOverride`), avec un avertissement non-bloquant si un mur à hauteur fixe pénètre dans le volume d'une dalle.
3. **Validation de Non-Régression par Fixtures de Référence :**  
   Les fichiers de démonstration et fixtures de test certifiés en Phase 5 (`demo-plan.json` et maquettes d'or) sont inclus dans un test de migration automatisé vérifiant non seulement l'égalité bit-à-bit des dimensions des ouvertures, mais également la stricte conservation du volume 3D total de matière de chaque mur.

### Conséquences

- Rétrocompatibilité garantie à 100% avec les sauvegardes de la Saison 1.
- Zéro perte de données dimensionnelles lors de la montée de version.
- Migration propre, isolée et réversible dans `@mini-bim/core`.

---

## ADR-044 : Étirement Élastique des Murs, Résolution de Connectivité, Compensation des Baies et Garde-fous Géométriques

- **Date :** 2026-11-15
- **Statut :** Accepté (Validé lors de la revue contradictoire Phase 6.0c)
- **Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)
- **Contexte :** Finalisation de la refonte architecturale préalable de la Saison 2 (Phase 6.0c). Implémentation du comportement BIM fondamental : lorsqu'un mur est translaté (`MoveWallCommand`), ses murs voisins connectés s'étirent élastiquement pour maintenir la fermeture topologique des jonctions sans corrompre les ouvertures hébergées ni les pièces.

### Problème

En Phase 3.3, `MoveWallTool` se contentait d'émettre un `UpdateWallCommand` sur le mur sélectionné, translatant ses deux extrémités sans toucher aux voisins. Les jonctions d'angles s'ouvraient, brisant l'étanchéité des pièces (`rooms`).
L'algorithme préliminaire proposé dans `TOOLS_SPEC.md §7.2` (« intersection de l'axe du voisin avec le nouvel axe du mur déplacé ») s'avère incomplet et instable dans plusieurs cas géométriques critiques :

1. **Translations longitudinales en L-junction :** Si un mur horizontal $A$ est translaté le long de son propre axe, l'intersection de son axe infini avec l'axe du mur perpendiculaire $B$ reste fixe, ce qui déconnecterait physiquement les extrémités des deux murs.
2. **Compensation de position des baies sur un mur pivoté :** Une rotation du mur voisin fausse l'abscisse curviligne 1D des portes et fenêtres si l'on ne compense pas par une projection rigoureuse.
3. **Murs colinéaires bout-à-bout :** Un rejet brutal sur critère $|\sin \theta| < 0.05$ empêcherait l'étirement axial de cloisons alignées.
4. **Faux cycles cinématiques :** Une propagation récursive aveugle déclencherait une erreur de cycle sur toute pièce fermée rectangulaire ($A-B-C-D-A$).

### Décisions Prises

#### 1. Arbitrage Formel des 3 Questions Fondamentales (Q1, Q2, Q3)

##### QUESTION 1 — Algorithme de Résolution de Connectivité : Option α Retenue (Revit-like Elastic Stretch)

- **Connexions d'extrémités (`endpoint-start`, `endpoint-end`) :**  
  L'extrémité partagée du mur voisin $B$ suit directement la nouvelle position de l'extrémité correspondante du mur déplacé $A$ :
  $$P_B' = P_A + \vec{\Delta}$$
  L'autre extrémité de $B$ ($Q_B$) reste rigoureusement ancrée à sa position initiale ($Q_B' = Q_B$).  
  Le mur voisin $B$ subit ainsi une élongation/raccourcissement et une rotation éventuelle d'angle $\theta = \angle(\vec{v}_B', \vec{v}_B)$. Ce comportement correspond exactement au standard des logiciels BIM majeurs (Autodesk Revit, Graphisoft Archicad) : déplacer une cloison en angle déforme le polygone de la pièce en maintenant la coïncidence stricte des sommets.
- **Connexions en T au milieu (`connection === 'mid'`) :**  
  Lorsque l'extrémité d'un mur incident $B$ bute sur le corps du mur traversant déplacé $A$, la nouvelle extrémité de $B$ est calculée par projection le long de sa propre droite directrice sur la nouvelle droite directrice de $A'$ :
  $$P_B' = \mathcal{D}_B \cap \mathcal{D}_{A'}$$
  Si $|\sin \angle(\vec{u}_B, \vec{u}_{A'})| < 0.05$, la projection est rejetée avec l'erreur `WALL_STRETCH_PARALLEL`.

##### QUESTION 2 — Compensation d'Abscisse Curviligne des Baies : Option β Retenue (Projection Monde Réelle)

Lorsqu'un mur voisin $B$ s'étire par son origine ($B.start$), son repère curviligne local est décalé. Si aucune compensation n'est appliquée, les ouvertures glissent dans l'espace monde avec l'origine du mur, ce qui déplacerait des portes non visées par l'utilisateur.

- **Formule de projection exacte (Option β) :**  
  Soit $M = P_{B0} + \text{offsetAlong} \cdot \vec{u}_B$ la position spatiale monde initiale du centre de la baie sur $B$.  
  Après étirement et rotation de $B$ vers $[P_{B0}', P_{B1}']$, la nouvelle abscisse curviligne compensée est calculée par projection orthogonale du point monde $M$ sur le nouvel axe orienté de $B'$ :
  $$\text{offsetAlong}' = (M - P_{B0}') \cdot \vec{u}_B' \quad \text{avec} \quad \vec{u}_B' = \frac{P_{B1}' - P_{B0}'}{\|P_{B1}' - P_{B0}'\|}$$
- **Propriété de convergence :**  
  Dans le cas très fréquent où la rotation est nulle ($\vec{u}_B' = \vec{u}_B$, translation purement orthogonale de $A$), la formule se réduit rigoureusement à l'Option α :
  $$\text{offsetAlong}' = \text{offsetAlong} - \Delta L_{\text{start}}$$
  En présence d'une rotation, l'Option β garantit la distance euclidienne minimale $\|M' - M\|$ entre l'ancienne position dans la pièce et la nouvelle baie sur la cloison inclinée. L'intégrité constructive est ensuite contrôlée par la post-condition universelle `validateOpenings(B', openings)`.

##### QUESTION 3 — Murs Parallèles Bout-à-Bout : Option α / γ Unifiée (Support Extrémité, Rejet Mid)

- Deux murs colinéaires ou parallèles bout-à-bout ($A$ de $(0,0)$ à $(6000,0)$ et $B$ de $(6000,0)$ à $(12000,0)$) forment une connexion d'extrémité (`connection: 'endpoint-start'`).
- Lors d'une translation axiale de $A$ par $\vec{\Delta} = (500, 0)$, $B.start$ passe à $(6500, 0)$ tandis que $B.end$ reste à $(12000, 0)$. La nouvelle longueur $L' = 5500\text{ mm} \ge 100\text{ mm}$ et le vecteur directeur est conservé ($\vec{v}' \cdot \vec{v} > 0$). C'est un étirement axial pur légitime et courant en architecture.
- **Règle d'application stricte :**  
  Le garde-fou `WALL_STRETCH_PARALLEL` ($|\sin \theta| < 0.05$) est **strictement réservé aux connexions incidentes en T (`connection === 'mid'`)**, où l'intersection de droites $\mathcal{D}_B \cap \mathcal{D}_{A'}$ est dégénérée ou indéterminée.  
  Pour toutes les connexions d'extrémités (`endpoint-start`, `endpoint-end`), la connectivité est assurée par coïncidence des sommets. Les murs colinéaires ou parallèles bout-à-bout sont donc **pleinement autorisés**, et régis par les garde-fous universels `WALL_STRETCH_COLLAPSE` et `WALL_STRETCH_REVERSED`.

#### 2. Cascade Récursive et Détection de Cycle (`WALL_STRETCH_CYCLE`) vs Pièces Fermées

- **Résolution de l'incompatibilité apparente :**  
  Dans une pièce fermée à 4 murs en boucle ($A \to B \to C \to D \to A$, telle que la pièce de référence de Phase 3.3 et `demoDocument.ts`), déplacer le mur $A$ étire les voisins directs $B$ et $D$ en déplaçant leurs extrémités partagées avec $A$. Leurs extrémités opposées (connectées à $C$) **ne bougent pas** ($Q_B' = Q_B$, $Q_D' = Q_D$).  
  Par conséquent, la connexion avec le mur opposé $C$ reste parfaitement statique, $C$ ne subit aucune déformation, et la propagation s'arrête naturellement à distance topologique 1. La pièce se transforme en quadrilatère/parallélogramme déformé, restant 100% étanche sans cycle.
- **Déclenchement légitime de `WALL_STRETCH_CYCLE` :**  
  La propagation récursive et la détection de cycle interviennent lorsqu'une commande sollicite le déplacement des deux extrémités d'un mur en chaîne (propagation en chaîne rigide ou cascade multi-niveaux où un mur intermédiaire collapse et transmet son déplacement à son extrémité opposée).  
  L'algorithme maintient un ensemble `visited = new Set<ElementId>()`. Si un mur déjà présent dans `visited` est à nouveau sollicité pour une mutation de sommet par la chaîne de propagation, l'opération est immédiatement interrompue avec l'erreur typée `WALL_STRETCH_CYCLE` et la liste des `offendingIds` formant la boucle fermée cinématique.
  > [!NOTE] Caractère défensif de WALL_STRETCH_CYCLE  
  > WALL_STRETCH_CYCLE est un garde-fou purement défensif. En Option α stricte (un seul mur déplacé par commande), il ne se déclenche jamais en usage normal. Le test T-MOVE-07 force une configuration défensive à double sollicitation du même sommet via une chaîne cyclique pour vérifier l'invariant topologique, mais aucun scénario nominal ne produit cette situation en V1.

#### 3. Spécification Formelle de `computeWallStretch`

Module : `packages/geometry/src/junctions/stretch.ts`

```typescript
export interface WallStretchInput {
  readonly movedWall: { readonly start: Vec2; readonly end: Vec2 };
  readonly delta: Vec2;
  readonly neighbor: { readonly start: Vec2; readonly end: Vec2 };
  readonly connection: 'endpoint-start' | 'endpoint-end' | 'mid';
}

export interface WallStretchResult {
  readonly newNeighborEndpoints: { readonly start: Vec2; readonly end: Vec2 };
  readonly deltaStart: Vec2;
  readonly deltaEnd: Vec2;
}

export function computeWallStretch(input: WallStretchInput): WallStretchResult;
```

**Algorithme :**

1. **Calcul des nouveaux sommets cibles :**
   - Si `connection === 'endpoint-start'` :
     $P_{\text{newStart}} = \text{neighbor.start} + \vec{\Delta}$ ; $P_{\text{newEnd}} = \text{neighbor.end}$.
   - Si `connection === 'endpoint-end'` :
     $P_{\text{newStart}} = \text{neighbor.start}$ ; $P_{\text{newEnd}} = \text{neighbor.end} + \vec{\Delta}$.
   - Si `connection === 'mid'` :
     Calcul de l'angle $\theta$ entre la direction de `neighbor` et la direction de `movedWall`.
     Si $|\sin \theta| < 0.05$, throw `WallStretchError('WALL_STRETCH_PARALLEL')`.
     Intersection de la droite $\mathcal{D}(\text{neighbor.start}, \text{neighbor.end})$ avec la droite translatée $\mathcal{D}(\text{movedWall.start} + \vec{\Delta}, \text{movedWall.end} + \vec{\Delta})$.
     Le point d'intersection devient la nouvelle extrémité du voisin qui était connectée au corps du mur.
2. **Vérification des Garde-fous Topologiques :**
   - Soit $\vec{v}_{\text{old}} = \text{neighbor.end} - \text{neighbor.start}$ et $L_{\text{old}} = \|\vec{v}_{\text{old}}\|$.
   - Soit $\vec{v}_{\text{new}} = P_{\text{newEnd}} - P_{\text{newStart}}$ et $L_{\text{new}} = \|\vec{v}_{\text{new}}\|$.
   - **Non-Inversion (`WALL_STRETCH_REVERSED`) :**  
     Si $\vec{v}_{\text{new}} \cdot \vec{v}_{\text{old}} \le 0$, throw `WallStretchError('WALL_STRETCH_REVERSED')`.
   - **Non-Effondrement (`WALL_STRETCH_COLLAPSE`) :**  
     Si $L_{\text{new}} < 100.0\text{ mm}$ ET $L_{\text{new}} < L_{\text{old}}$, throw `WallStretchError('WALL_STRETCH_COLLAPSE')`.  
     _(Remarque : si le mur mesurait déjà 90 mm initialement et n'est pas raccourci, il n'est pas rejeté)._
3. **Retour du résultat avec deltas d'extrémités pour compensation :**
   - $\vec{\delta}_{\text{start}} = P_{\text{newStart}} - \text{neighbor.start}$
   - $\vec{\delta}_{\text{end}} = P_{\text{newEnd}} - \text{neighbor.end}$

#### 4. Intégration dans `MoveWallCommand` et `validateDirty`

- **Signature de la commande :**
  ```typescript
  export class MoveWallCommand implements BimCommand {
    public readonly type = 'MoveWall';
    constructor(
      public readonly wallId: ElementId,
      public readonly delta: Vec2,
      public readonly options: {
        readonly stretchNeighbors?: boolean;
        readonly propagateChain?: boolean;
      } = {},
    ) {}
    // ...
  }
  ```
- **Détection des connexions (seuil $1.0\text{ mm}$) :**
  Pour chaque autre mur de même niveau dans le document :
  - Distance entre sommets $\le 1.0\text{ mm}$ $\to$ `endpoint-start` ou `endpoint-end`.
  - Distance d'une extrémité au segment intérieur $\le 1.0\text{ mm}$ $\to$ `mid`.
- **Compensation transactionnelle des baies :**
  Pour chaque mur voisin $B$ dont l'origine subit $\vec{\delta}_{\text{start}} \ne \vec{0}$, chaque porte et fenêtre hébergée sur $B$ voit son `offsetAlong` mis à jour selon la formule de projection monde (Option β).
- **Contrôle universel `validateDirty` :**
  Tous les éléments mutés ($A$, les voisins $B$, les baies compensées) sont soumis à `validateDirty`. Si le raccourcissement d'un voisin fait déborder une porte au-delà des gardes de rive ou linteau ($H_{\text{linteau}} \le H_{\text{eff}}$), la commande est rejetée atomiquement avec `offendingIds`.
- **Statut des pièces (`Room`) :**
  Après déplacement, l'algorithme de détection des pièces réévalue les contours. Si une pièce voit son enceinte brisée, elle passe en `status: 'unenclosed'` avec `area: 0` conformément à l'ADR-039 sans être supprimée.

#### 5. Impact sur les Tests Existants

- **`MoveWallTool.test.ts` :**  
  Les assertions vérifiant l'émission de `UpdateWallCommand` sont mises à jour pour vérifier l'émission de `MoveWallCommand(wallId, delta, { stretchNeighbors: true })`.
- **`App.test.tsx` (Test de Crédibilité Phase 3.3) :**  
  Déplacer `wall_south` de $(500,0)$ étire élastiquement `wall_east` et `wall_west`. `door_demo` conserve son `offsetAlong = 2000`. `createWallMeshWithOpenings` est désormais appelé pour les 3 murs impactés. La pièce de 24 m² se transforme en parallélogramme fermé sans perte d'étanchéité.

#### 6. Matrice d'Acceptation Consolidée (43 Tests Spécifiés)

- **`packages/geometry/src/junctions/stretch.test.ts` (14 tests) :**
  - `T-STRETCH-01` à `05` : L-junctions et T-junctions orthogonales/axiales.
  - `T-STRETCH-06` : X-junction (4 murs concourants) $\to$ 2 voisins adjacents étirés, mur opposé stationnaire.
  - `T-STRETCH-06b` : Jonction multi-branches (5 murs concourants).
  - `T-STRETCH-07` : Jonction multi-branches générale.
  - `T-STRETCH-08` & `09` : Parallèles bout-à-bout axiaux et perpendiculaires.
  - `T-STRETCH-10` & `11` : Garde-fou `WALL_STRETCH_COLLAPSE` (rejet $L' < 100\text{ mm} \land L' < L$, bypass si déjà court).
  - `T-STRETCH-12` : Garde-fou `WALL_STRETCH_REVERSED`.
  - `T-STRETCH-13` : Rotation du voisin avec ouverture hébergée $\to$ projection `offsetAlong'` valide dans les bornes.
- **`packages/core/src/commands-move.test.ts` (13 tests) :**
  - `T-MOVE-01` à `06` : Mur isolé, jonctions L, X, compensation de baie, rollback sur COLLAPSE/REVERSED.
  - `T-MOVE-07` : Détection défensive de `WALL_STRETCH_CYCLE`.
  - `T-MOVE-08` : Cascade linéaire récursive (2 niveaux).
  - `T-MOVE-09` & `10` : Réversibilité exacte Undo/Redo.
  - `T-MOVE-11` : Préservation des `offendingIds` précis.
  - `T-MOVE-12a` : Pièce fermée déformée $\to$ `Room` reste `enclosed` et sa surface est recalculée numériquement.
  - `T-MOVE-12b` : Déplacement rompant une enceinte $\to$ `Room` passe `unenclosed` avec `area = 0` (non supprimée, ADR-039).
- **`packages/core/src/rules-move.test.ts` (5 tests) :**
  - `T-RULES-MOVE-01` à `05` : Intégration différentielle `validateDirty` sur les étirements de murs et ouvertures.
- **`apps/web/src/tools/MoveWallTool.test.ts` (8 tests) :**
  - `T-TOOL-MOVE-01` à `08` : Émission de `MoveWallCommand`, snap 10 mm, Escape, affichage d'erreur sur rejet, zéro mutation directe.
- **`apps/web/src/App.test.tsx` (3 tests) :**
  - `T-APP-MOVE-01` (Test de Crédibilité Phase 3.3 réhaussé) : Déplacement mur sud, étirement est/ouest, régénération 3D.
  - `T-APP-MOVE-02` : Undo restaure tous les murs bit-à-bit.
  - `T-APP-MOVE-03` : Validation différentielle sur maquette importée.

### Conséquences

- Les jonctions de murs restent scellées lors des manipulations interactives, apportant le comportement BIM attendu de niveau professionnel.
- Zéro régression sur le test de crédibilité du BIM de Phase 3.3.
- Garantie mathématique de non-effondrement et de non-inversion grâce aux 3 garde-fous stricts.
- Zéro dépendance interdite (respect total des règles de pureté architecturale).

---

## ADR-045 : Modèle Dalles, SlabType, Migration de Schéma v1→v2 et Résolution des Trémies

### Statut

**Accepté** (Phase 6.1a — Préalable d'implémentation)

### Date

15 novembre 2026

### Contexte

La Phase 6.1a amorce le chantier majeur des dalles horizontales (`Slab`) et de la généralisation du modèle Type / Instance pour l'ensemble des éléments constructifs (`SlabType`, `DoorType`, `WindowType`). Ce passage introduit `schemaVersion: 2`.
Trois décisions d'ingénierie majeures doivent être tranchées formellement avant l'écriture du code de production :

1. La persistance ou dérivation pure des champs `status` et `area` de `Room` (suite aux ajouts de la Phase 6.0c).
2. L'emplacement architectural et l'algorithme exact du calcul de la hauteur d'arase supérieure (`topConstraint`) des murs sous dalles.
3. Les garanties de rétrocompatibilité et la politique de rejet lors de la migration automatique des fichiers V1 vers V2.

---

### Décisions Arbitrées

#### DÉCISION 1 — Persistance de `Room.status` et `Room.area` : Option α (Persistance dans le Draft)

- **Arbitrage :** **Option α** (les champs optionnels `status?: 'enclosed' | 'unenclosed'` et `area?: number` sont persistés dans l'état documentaire `BimState.rooms`).
- **Justification :**
  1. _Performance d'affichage $\mathcal{O}(1)$ :_ Le calcul topologique des pièces (`detectRooms`) implique un partitionnement planaire et un lancer de rayons géométrique. Le faire à chaque rafraîchissement d'affichage 2D Canvas ou 3D Three.js dégraderait les performances au-delà des 60 FPS requis.
  2. _Cohérence avec ADR-039 :_ Le statut dérivé `unenclosed` est un état métier persistant permettant à l'utilisateur de constater une rupture d'enceinte sans voir sa pièce supprimée du modèle.
  3. _Harmonisation documentaire :_ `CORE_SPEC.md` et `ROOMS_SPEC.md` sont formellement alignés sur `types.ts` pour consigner que `Room` porte ces attributs calculés lors des mutations topologiques (création, déplacement de mur, suppression).

#### DÉCISION 2 — Calcul de `topConstraint` : Option α (Helper Métier Pur `computeWallEffectiveHeight`)

- **Arbitrage :** **Option α** (Fonction pure `computeWallEffectiveHeight(wall, state)` hébergée dans `packages/core/src/walls.ts`).
- **Signature :**
  ```typescript
  export interface WallEffectiveHeightResult {
    readonly zBase: number;
    readonly zTop: number;
    readonly heightEff: number;
    readonly limitingSlabId?: ElementId;
  }
  export function computeWallEffectiveHeight(
    wall: Wall,
    state: BimState,
  ): WallEffectiveHeightResult;
  ```
- **Règles de Calcul Déterministe :**
  1. **Priorité absolue à `heightOverride` :** Si `wall.heightOverride !== undefined`, $H_{\text{eff}} = \text{wall.heightOverride}$, $Z_{\text{base}} = \text{level.elevation}$, $Z_{\text{top}} = Z_{\text{base}} + H_{\text{eff}}$.
  2. **Contrainte de niveau supérieur :** Si un niveau supérieur existe (soit via `wall.topConstraint.levelId`, soit le niveau $N+1$ contigu) :
     - On recherche toutes les dalles $s \in \text{state.slabs}$ associées à ce niveau supérieur qui recouvrent spatialement l'axe du mur (intersection 2D segment-polygone de dalle $\text{dist} \le \text{tolerance}$).
     - Pour chaque dalle couvrante, l'arase de sous-face est $Z_{\text{inf}}(s) = \text{level}_{N+1}.\text{elevation} + (s.\text{baseOffset} \mathbin{?} 0) - \text{slabType}_s.\text{thickness}$.
     - L'arase supérieure effective du mur est calée sous la dalle la plus basse : $Z_{\text{top}} = \min_{s} Z_{\text{inf}}(s)$.
     - Si aucune dalle ne couvre le mur, $Z_{\text{top}} = \text{level}_{N+1}.\text{elevation} + (\text{wall.topConstraint?.offset} \mathbin{?} 0)$.
     - $H_{\text{eff}} = Z_{\text{top}} - Z_{\text{base}}$.
  3. **Absence de contrainte supérieure (Dernier étage) :** $H_{\text{eff}} = \text{wallType.height}$, $Z_{\text{top}} = Z_{\text{base}} + H_{\text{eff}}$.
- **Intégration DAG :** Arêtes orientées `slab(N+1) -> wall(N)` et `slab(N) -> wall(N)` (si `baseOffset > 0`) pour propager automatiquement l'invalidation géométrique 3D lors de toute mutation d'épaisseur ou d'offset de dalle.

#### DÉCISION 3 — Rétrocompatibilité & Migration v1 $\to$ v2 : Rejet Strict des Données Invalides

- **Arbitrage :**
  1. `BimDocument.fromJSON` détecte `schemaVersion`. Si absent ou `1`, la fonction pure `migrateSchemaV1toV2` est invoquée automatiquement.
  2. **Rejet strict (Fail-Fast) :** Aucune invention de données par défaut. Si une porte ou fenêtre V1 possède une largeur ou hauteur invalide (`width <= 0`, `NaN`, non numérique ou manquante), la migration lève immédiatement `BimValidationError('MALFORMED_DOOR' | 'MALFORMED_WINDOW')`.
  3. **Migration sans perte de volume :** Regroupement déterministe des types synthétisés :
     - Pour chaque couple distinct $(width, height)$ de porte $\to$ un `DoorType` unique partagé.
     - Pour chaque triplet distinct $(width, height, sillHeight)$ de fenêtre $\to$ un `WindowType` unique partagé.
     - Somme des volumes de parois, réservations et dalles strictement invariante au micron cube près.
  4. **Mode hauteur des murs migrés (ADR-043 §2) :** `wall.heightOverride` n'est posé que si un niveau supérieur existe et présente un écart altimétrique différent de `wallType.height`. Sinon, le mur reste en mode automatique (`heightOverride: undefined`).

---

### Découpe Géométrique des Trémies (`computeEffectiveSlabPolygon`)

La fonction géométrique pure `computeEffectiveSlabPolygon` dans `@mini-bim/geometry/src/slabs/effective.ts` opère via la librairie éprouvée `polygon-clipping` :

1. **Union des trémies :** $\mathcal{H}_{\text{merged}} = \text{union}(\text{manualHoles}, \text{stairShafts})$.
2. **Découpe en rive :** $\mathcal{B}_{\text{trimmed}} = \text{difference}(\text{boundary}, \mathcal{H}_{\text{merged}})$.
   - Si $\mathcal{B}_{\text{trimmed}} = \emptyset \implies$ throw `SlabGeometryError('SLAB_EMPTY')`.
   - Si $\mathcal{B}_{\text{trimmed}}$ est un `MultiPolygon` disjoint $\implies$ throw `SlabGeometryError('SLAB_SEVERED')`.
3. **Trous intérieurs effectifs :** Les trous entièrement intérieurs à $\mathcal{B}_{\text{trimmed}}$ constituent `effectiveHoles` ; les trémies tangentes ou sécantes avec la rive sont naturellement absorbées dans l'encoche de contour extérieur de `trimmedBoundary`.

---

### Conséquences

- Le schéma documentaire évolue de manière étanche vers la v2 avec typage complet des ouvertures et dalles.
- Rétrocompatibilité totale avec les maquettes V1.0 de Saison 1.
- Respect rigoureux des 620 tests existants via adaptation transparente des lectures de propriétés sur types.

---

## ADR-046 : PropertyInspector Unifié, SlabTool Interactif, Rendu 2D/3D Dalles et LevelSelector

### Statut

**Accepté** (Phase 6.1b — Couche UI et Rendu)

### Date

15 novembre 2026

### Contexte

La Phase 6.1a a posé le modèle métier immuable des dalles (`Slab`, `SlabType`), les contraintes altimétriques de murs et la migration v1→v2. La Phase 6.1b dote Mini-BIM de son interface visuelle et interactive complète :

1. Panneau latéral d'inspection des propriétés (`PropertyInspector`).
2. Machine à états d'interaction pour le tracé de planchers (`SlabTool`, raccourci `L`).
3. Moteur de rendu 2D plan avec poché architectural béton et croix de réservation des trémies (`@mini-bim/view-2d`).
4. Moteur de rendu 3D Three.js avec maillage extrudé triangulé par `earcut` (`@mini-bim/view-3d`).
5. Sélecteur de niveau actif dans la barre d'outils (`LevelSelector`).
6. Export IFC4 certifié `IfcSlab` (`.FLOOR.`) avec profils découpés.

### Décisions d'Architecture

#### 1. UX du PropertyInspector : Édition Directe & Debounce Numérique (Point A)

- **Arbitrage :** Les modifications de dropdowns (types constructifs, niveaux, sens d'ouverture) émettent immédiatement une commande transactionnelle (`UpdateXxxCommand`).
- **Debounce numérique (200 ms) :** Les champs de saisie numérique (hauteur, offset, épaisseur) appliquent un debounce de 200 ms ou déclenchent la commande sur `onBlur`, évitant la saturation de l'historique Undo/Redo par des micro-commandes à chaque frappe de touche.
- **Bascule Hauteur Mur (Auto / Fixe) :**
  - _Auto :_ `topConstraint: { levelId: nextHigherLevel.id, offset: 0 }`, `heightOverride: undefined`.
  - _Fixe :_ `heightOverride: currentValue`, `topConstraint: undefined`.
  - _Avertissement non-bloquant :_ Si une hauteur fixe entraîne une pénétration dans une dalle supérieure (détectée via `computeWallVerticalBounds`), un badge d'avertissement jaune est affiché sans bloquer la modélisation.

#### 2. État du LevelSelector : Option β Éphémère (Point B)

- **Arbitrage :** L'identifiant du niveau actif (`activeLevelId`) est conservé dans le contexte applicatif React (`AppContext` ou `ActiveLevelContext`), de manière strictement découplée du modèle documentaire `BimState` (parfaitement aligné sur le pattern de sélection UI acté dans l'ADR-025).
- **Conséquence :** Le niveau actif pilote le filtrage en plan 2D (`Viewport2D`) et la hauteur par défaut des nouveaux éléments créés par les outils (`WallTool`, `SlabTool`), tandis que la vue 3D (`Viewport3D`) continue d'afficher l'intégralité du bâtiment multi-niveaux.

#### 3. Rendu 2D des Dalles et Trémies (`@mini-bim/view-2d`)

- Poché continu gris béton (`#f3f4f6`) sur le contour extérieur `boundary`.
- Hachures diagonales à 45° en traits fins (`#e5e7eb`).
- Contour périphérique fin noir (`#374151`, épaisseur 1 px écran).
- Trémies (`holes` et `openings`) : évidement du poché laissant apparaître l'arrière-plan, contour de réservation et croix diagonale normalisée (tracé en X reliant les sommets opposés de la boîte englobante de la trémie).
- Surbrillance bleue (`#3b82f6`) en cas de sélection.
- Ordre de profondeur : dalles dessinées en arrière-plan sous les murs, avant les cotations.

#### 4. Rendu 3D des Dalles (`@mini-bim/view-3d`)

- Découpe géométrique préalable par `computeEffectiveSlabPolygon` pour extraire l'enveloppe solide d'un seul tenant et les anneaux intérieurs CW.
- Triangulation plane par `earcut` pour la face supérieure ($Z_{\text{sup}} = \text{elevation} + \text{baseOffset}$) et la face inférieure ($Z_{\text{inf}} = Z_{\text{sup}} - \text{thickness}$).
- Flancs verticaux extrudés (2 triangles par segment de contour et par segment de trou).
- Matériau Three.js distinct (béton clair, `roughness: 0.85`).
- Attachement sémantique des métadonnées `userData: { elementId: slab.id, category: 'slab' }` pour le picking raycast.

#### 5. Export IFC4 (`IfcSlab`)

- Classe IFC4 : `IfcSlab` avec `PredefinedType = .FLOOR.` (9ᵉ attribut ISO 10303-21).
- Définition de profil : `IfcArbitraryClosedProfileDef` pour dalle pleine, `IfcArbitraryProfileDefWithVoids` pour dalle avec trémies.
- Rattachement spatial `IfcRelContainedInSpatialStructure` vers le `IfcBuildingStorey` correspondant au `levelId`.

---

## ADR-047 : Purge des Champs Transitoires V1, Underlay Vectoriel Path2D et Snapping Inter-Niveaux

### Statut

**Accepté** (Phase 6.2 — Vue Fantôme et Purge Transitoire)

### Date

15 novembre 2026

### Contexte

La Phase 6.1b a certifié le modèle de dalles et son rendu 2D/3D. Pour assurer la compatibilité ascendante lors de la transition vers le schéma v2 (ADR-042), des champs transitoires optionnels subsistaient sur `Door` et `Window` (`width?`, `height?`, `kind?`). De plus, la modélisation multi-étages requiert de voir et d'aligner les parois du niveau actif $N$ sur celles de l'étage inférieur $N-1$ sans pixellisation ni surcharge cognitive.

### Décisions d'Architecture

#### 1. D1 — Localisation du Cache Path2D (Option β : Module Dédié Pur)

- **Décision :** Implémenter le cache vectoriel d'underlay dans un module dédié et pur `@mini-bim/view-2d/src/underlay/UnderlayCache.ts`.
- **Justification :** L'Option β garantit l'isolation stricte : zéro dépendance au DOM ou au canvas HTML, testabilité unitaire totale sous Vitest en environnement Node/JSDOM, et réutilisabilité pour d'autres sorties vectorielles (ex: générateur SVG). `View2D` encapsule simplement une instance d'UnderlayCache et pilote son cycle de vie.
- **Principe d'invalidation sélective :** Le cache n'est invalidé que si au moins un identifiant de `changedIds` correspond à un mur ou une ouverture du niveau $N-1$. Si `changedIds` ne concerne que le niveau actif $N$, le `Path2D` en coordonnées mondes est réutilisé sans recompilation.

#### 2. D2 — Contenu du Rendu Underlay (Option α : Murs + Ouvertures)

- **Décision :** L'underlay affiche exclusivement les murs et les ouvertures hébergées (portes, fenêtres) du niveau $N-1$.
- **Justification :** L'Option α offre une clarté visuelle optimale pour l'architecte. L'affichage des cotations ou dalles de l'étage inférieur encombrerait inutilement le plan de travail. Les parois sont dessinées en traits fins pointillés gris (`#9ca3af`, `lineWidth = 1 / scale`, `lineDash = [4 / scale, 4 / scale]`, `globalAlpha = 0.5`) tracées en arrière-plan sous le niveau actif.

#### 3. D3 — Périmètre des Niveaux Visibles (Option α : N et N-1)

- **Décision :** En 2D, l'utilisateur visualise strictement le niveau actif $N$ en premier plan et, en option, le niveau immédiatement inférieur $N-1$ en vue fantôme.
- **Justification :** Les niveaux $N+1$ ou $N-2$ restent invisibles pour éviter toute ambiguïté de superposition. Un commutateur explicite « Afficher le niveau inférieur » dans la `Toolbar` permet d'activer ou désactiver l'underlay à la demande.

#### 4. Purge Définitive des Champs Transitoires V1 (Breaking Change Typage)

- **Suppression définitive dans `packages/core/src/types.ts` :**
  - `Door.kind?`, `Door.width?`, `Door.height?`
  - `Window.kind?`, `Window.width?`, `Window.height?`
- **Conséquence :** Toutes les dimensions géométriques sont désormais obligatoirement résolues à travers les familles paramétriques partagées `doorTypes[door.doorTypeId]` et `windowTypes[window.windowTypeId]`.

#### 5. Snapping Inter-Niveaux Déterministe

- Aimantation magnétique active sur les sommets de murs de l'underlay ($N-1$) avec une tolérance constante en pixels écran :
  $$\text{toleranceMonde} = \frac{12\text{ px}}{\text{scale}}$$
- À zoom $1\times$, tolérance = $12\text{ mm}$ ; à zoom $0.1\times$, tolérance = $120\text{ mm}$ ; à zoom $10\times$, tolérance = $1.2\text{ mm}$.
- Désactivable via l'option `snapToUnderlay: false`.

#### 6. D4 — Arbitrage d'Équidistance de Snapping (Priorité Niveau Actif)

- **Décision :** En cas d'équidistance parfaite (ou dans le même rayon de tolérance) entre un sommet de mur du niveau actif $N$ et un sommet de mur de l'underlay $N-1$, le sommet du niveau actif est **strictement prioritaire**.
- **Justification :** Évite les ambiguïtés d'accroche UX et préserve la cohésion topologique du plan en cours d'édition (évite de créer des micro-décalages ou de s'aimanter par mégarde sur l'étage sous-jacent).

#### 7. D5 — Tolérance de Compatibilité & Déduplication des Types dans `UpdateDoorCommand` / `UpdateWindowCommand`

- **Contexte :** La purge des champs transitoires (`width?`, `height?`, `kind?`) sur `Door` et `Window` impose de piloter les dimensions via `doorTypeId` / `windowTypeId`. Pour préserver la compatibilité avec les scripts d'automatisation et les outils existants passant encore un patch `{ width, height }`, les commandes supportent ces attributs de manière transactionnelle.
- **Règle de Déduplication Stricte :** Lors de l'application d'un patch avec dimensions, la commande inspecte d'abord le catalogue existant (`draft.doorTypes` / `draft.windowTypes`). Si un type constructif aux dimensions identiques existe déjà, il est réutilisé. Dans le cas contraire uniquement, un type déterministe est généré (ex: `door-type-1000x2150`).
- **Périmètre du Modèle :** Conformément au standard BIM Type/Instance d'ADR-042, les types créés enrichissent le catalogue du projet et restent persistés même en cas de suppression de l'instance hôte. L'instance `Door` ou `Window` ne stocke aucun champ transitoire et référence exclusivement son `doorTypeId` / `windowTypeId`.

---

## ADR-048 : Escalier Paramétrique Droit, Formule de Blondel, Dérivation de Trémie et Rendering Crénelé

### Statut

**Accepté** (Phase 6.4 — Escalier Paramétrique et Dérivation de Trémie)

### Date

15 novembre 2026

### Contexte

Les phases précédentes ont posé les fondations multi-niveaux, les dalles horizontales, les relations déclaratives (DAG) et la vue fantôme d'underlay. L'introduction d'un escalier reliant deux niveaux adjacents constitue le lien vertical sémantique et constructif majeur du bâtiment. Cet élément doit :
1. Calculer ses marches et contremarches selon la formule ergonomique et réglementaire de Blondel ($2h + g$).
2. Dériver automatiquement la trémie d'échappée dans la dalle de plancher supérieure sans polluer le modèle documentaire (`slab.holes` restant réservé aux réservations manuelles).
3. Produire un rendu 2D plan normalisé (nez de marches, ligne de foulée fléchée) et un rendu 3D étanche (maillage crénelé optimisé).
4. S'intégrer dans le DAG (`stair -> slab(topLevel)`) pour régénérer la dalle lors des déplacements de l'escalier.
5. Permettre la modélisation interactive (`StairTool`), l'inspection paramétrique (`PropertyInspector`) et l'interopérabilité IFC4 (`IfcStair`, `IfcStairFlight`).

### Décisions d'Architecture

#### 1. D1 — Portée de l'Itération 6.4 (Option α : Escalier Droit Simple 1 Volée)

- **Décision :** Restreindre le périmètre de la Phase 6.4 à l'escalier droit à 1 volée continue, sans palier de repos ni quartiers tournants.
- **Justification :** Aligné sur le périmètre MVP d'ADR-037. L'escalier droit pose les fondations mathématiques complètes (Blondel, échappée, calcul de trémie, maillage crénelé fusionné) qui serviront de socle aux extensions futures (Phase 6.5 : palier intermédiaire ; Phase 7 : escaliers balancés et hélicoïdaux).

#### 2. D2 — Modèle Type / Instance pour l'Escalier (Option γ : StairType Minimal + Surcharges)

- **Décision :** Formaliser un `StairType` portant les attributs de famille générique (`id`, `name`, `width`, `materialId?`), tandis que l'instance `Stair` porte les liaisons d'implantation spatiale (`bottomLevelId`, `topLevelId`, `start`, `end`) et une surcharge optionnelle `widthOverride`.
- **Justification :** Cohérence stricte avec le pattern Revit / ADR-042. Une agence d'architecture normalise ses largeurs de volées (ex. 900 mm pour le résidentiel individuel, 1200 mm pour l'ERP). La surcharge locale permet de gérer les cas particuliers de trémies étroites sans multiplier inutilement les types.

#### 3. D3 — Validation Réglementaire de Blondel (Option β : Warnings Confort vs Rejet Sécurité)

- **Formule de Blondel :** $M = 2h + g$ où $h$ est la hauteur de contremarche et $g$ le giron horizontal.
- **Plage de Confort :** $2h + g \in [600, 640]\text{ mm}$, avec $h \in [160, 190]\text{ mm}$ et $g \in [250, 320]\text{ mm}$.
- **Plage de Sécurité Maximale :** $2h + g \in [560, 680]\text{ mm}$.
- **Décision d'Arbitrage :**
  - Si $2h + g \in [600, 640]\text{ mm}$ : Conforme (`isCompliant: true`), badge vert dans l'UI.
  - Si $2h + g \in [560, 680]\text{ mm} \setminus [600, 640]\text{ mm}$ : Avertissement non-bloquant (`STAIR_BLONDEL_OUT_OF_COMFORT`), badge jaune, modélisation acceptée.
  - Si $2h + g \notin [560, 680]\text{ mm}$ : Avertissement de sécurité majeur (`STAIR_BLONDEL_OUT_OF_SAFETY`), badge rouge.
  - *Rejet strict à la création (`validateStair`) :* Longueur de run aberrante ($L < \text{width}$ ou $L > 20000\text{ mm}$), niveaux non adjacents, ou delta d'élévation $\Delta Z \le 0$.

#### 4. D4 — Granularité du Maillage 3D (Option α : 1 RawMeshData Fusionné)

- **Décision :** Générer l'escalier complet (marches supérieures, contremarches verticales et flancs latéraux) en un unique buffer géométrique fusionné (`RawMeshData`).
- **Justification :** Cohérent avec les générateurs `createWallMeshAggregated` et `createSlabMesh`. Garantit un draw call unique par escalier dans Three.js et permet un picking direct par raycasting via `userData.elementId = stair.id`. Le volume total et la topologie étanche (caractéristique d'Euler = 2) sont vérifiables de manière déterministe.

#### 5. D5 — Dérivation Automatique de la Trémie & Respect de la Source Unique de Vérité (ADR-001)

- **Règle d'Or :** La trémie de l'escalier n'est **jamais stockée** dans la propriété documentaire `slab.holes` de la dalle supérieure.
- **Principe :** La fonction pure `computeStairShaft(stair, state)` projette l'emprise horizontale au niveau `topLevel` en tenant compte d'un dégagement latéral de $50\text{ mm}$ (passage de main courante) et de $100\text{ mm}$ en extrémités. Lors du rendu ou du calcul géométrique, les trémies dérivées sont transmises via le paramètre éphémère `slab.openings` à `computeEffectiveSlabPolygon`.
- **Invalidation par le DAG :** Une relation dépendante `stair -> slab(topLevel)` est enregistrée dans le `RELATIONS_REGISTRY` (ADR-038 / ADR-041). Toute modification d'un escalier invalide automatiquement le cache de maillage de la dalle d'étage.

#### 6. D6 — Ligne de Foulée et Représentation 2D

- La ligne de foulée est tracée le long de l'axe de parcours avec un cercle au point de départ (`start`) et une flèche orientée vers le haut au point d'arrivée (`end`).
- Les nez de marches sont dessinés sous forme de $N-1$ segments perpendiculaires à la directrice de la volée.
- En vue fantôme (Underlay $N-1$), l'escalier est représenté en traits pointillés gris (`#9ca3af`) pour situer la circulation verticale.

---

## ADR-049 : Résolveur Unique de Géométrie de Mur (`resolveWallGeometry` — S1-1 + S1-4)

### Statut

**Accepté** (Chantier 2 — Correction des anomalies S1-1 & S1-4)

### Date

15 novembre 2026

### Contexte & Analyse du Problème

L'audit architectural approfondi a identifié deux failles critiques dans la propagation altimétrique des murs :

1. **Bug S1-1 (Hauteur effective non propagée) :**
   Dans les modules métiers (`rules.ts`, `metrics.ts`, `ifc/generator.ts`, `mesh-generator.ts`), le calcul de la hauteur des murs utilisait directement `wallType.height` ou un fallback local `wall.heightOverride ?? wallType.height ?? 2800`, ignorant totalement la contrainte supérieure `topConstraint` et la sous-face des dalles structurelles couvrantes.

2. **Bug S1-4 (Désynchronisation 3D vs IFC vs Cotes d'ouvertures) :**
   Le composant `Viewport3D` extrudait les murs au niveau de base `elevation` du niveau sans appliquer `wall.baseOffset`, utilisait `wallType.height` au lieu de la hauteur effective, et positionnait les placeholders de portes et fenêtres au niveau brut du storey. Résultat : un mur avec `baseOffset: +500 mm` flottait ou voyait ses portes décalées de 500 mm par rapport à l'évidement 3D, tout en divergeant de l'export IFC4.

### Décisions d'Architecture

#### 1. D1 — Résolveur Unique de Géométrie de Mur (`resolveWallGeometry`)

Toute géométrie altimétrique de mur et toute position d'ouverture hébergée doivent être calculées par une unique fonction pure faisant autorité :
```typescript
function resolveWallGeometry(wall: Wall, state: BimState): ResolvedWall;
```
Située dans `packages/core/src/walls/resolve.ts` et réexportée à la racine de `@mini-bim/core`.

#### 2. D2 — Modèle de Données Dérivé (`ResolvedWall` & `ResolvedOpening`)

```typescript
export interface ResolvedOpening {
  readonly id: ElementId;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly sillZAbsolute: number;   // zBase + sillHeight
  readonly lintelZAbsolute: number; // zBase + sillHeight + height
}

export interface ResolvedWall {
  readonly wallId: ElementId;
  readonly zBase: number;          // level.elevation + (wall.baseOffset ?? 0)
  readonly zTop: number;           // Surcharge > TopConstraint/Dalle > Nominal
  readonly height: number;         // zTop - zBase (>= 0)
  readonly heightSource: 'override' | 'constraint' | 'nominal';
  readonly limitingSlabId?: ElementId;
  readonly openings: readonly ResolvedOpening[];
}
```

#### 3. D3 — Réfractoration des 5 Consommateurs

1. **`packages/core/src/rules.ts` :** Validation de collision et de débordement haut des ouvertures (`checkDoorViolations`, `checkWindowViolations`, `checkOpeningsWithCandidate`) basée sur `resolveWallGeometry(wall, state).height`.
2. **`packages/core/src/metrics.ts` :** Calculs des surfaces brutes, nettes et volumes solides de murs (`computeWallMetrics`, `computeLevelMetrics`) basés sur `resolved.height`.
3. **`packages/core/src/ifc/generator.ts` :** Solide extrudé `IFCEXTRUDEDAREASOLID` avec `resolved.height`, et placement `IFCCARTESIANPOINT` à `z = baseOffset`.
4. **`packages/view-3d/src/mesh-generator.ts` :** Découpage et extrusion paramétrique acceptant `height?: number` optionnel pour découper et extruder le mur à sa hauteur effective.
5. **`apps/web/src/components/Viewport3D.tsx` :** Génération des tronçons solides avec `elevation: resolved.zBase` et `height: resolved.height`, et instanciation des placeholders 3D à `resolvedHost.zBase` avec dimensions issues de `resolved.openings`.

#### 4. D4 — Règle de Non-Régression & Règle d'Or

Zéro occurrence de `wallType.height` en dehors de `resolve.ts` (et de son délégué `walls.ts`, ou de la validation de validité intrinsèque du type `wallType.height > 0`) dans le code de production.

#### 5. D5 — Découplage de `@mini-bim/view-3d`

Le package `@mini-bim/view-3d` reste strictement découplé de `@mini-bim/core`. Il ne dépend pas du résolveur mais accepte un paramètre géométrique neutre `height?: number` sur `WallWithOpeningsParams` et `createWallMesh`. C'est le consommateur applicatif (`Viewport3D.tsx`) qui fait le pont en appelant `resolveWallGeometry` et en passant `resolved.zBase` et `resolved.height`.

---

## ADR-050 : Unification des Données Dérivées, Invalidation de Cache & Matériaux Partagés (S1-2 + S2-3 + S2-5)

### Statut

**Accepté** (Chantier 3 — 15 novembre 2026)

### Décisions Clés

1. **D1 — Invalidation Réactive et Ciblée de l'Underlay Cache (S1-2) :**
   - `UnderlayCache.getOrCompile` enregistre tous les identifiants d'éléments (murs, portes, fenêtres, escaliers, niveau) du niveau fantôme.
   - `View2D.invalidateUnderlayCache(changedIds)` filtre par `underlayLevelId` et ne purge le cache que si un élément du niveau fantôme est modifié.
   - `Viewport2D.tsx` s'abonne à `doc.subscribe` pour invalider sélectivement le cache dès qu'une commande est exécutée.

2. **D2 — Protection des Matériaux Partagés Three.js (S2-3) :**
   - `Scene3D.removeMesh` et `Scene3D.dispose` ne détruisent pas les matériaux marqués `userData.ownsMaterial === false` ou `userData.isSharedMaterial === true`.
   - Les matériaux internes `defaultMaterial`, `highlightMaterial`, `slabMaterial` et `stairMaterial` sont immunisés contre toute destruction unitaire.
   - Les placeholders 3D des portes et fenêtres (`doorMaterialRef`, `windowMaterialRef`) empruntent leur matériau sans le détruire.

3. **D3 — Source Unique pour les Trémies d'Escaliers 2D et 3D (S2-5) :**
   - `@mini-bim/core` est promu en dépendance de production de `@mini-bim/view-2d`.
   - `View2D.ts` et `Viewport3D.tsx` utilisent tous deux la même fonction pure `computeStairShaft` avec `{ useHeadroomCutoff: true, slabThickness }`, éliminant toute duplication algorithmique et garantissant une géométrie de trémie rigoureusement identique en 2D et 3D.

---

## ADR-051 : Persistance Locale Automatique via IndexedDB & Sécurisation de Session (S2-8)

### Statut

**Accepté** (Chantier 3 — 15 novembre 2026)

### Décisions Clés

1. **D1 — IndexedDB comme Moteur de Persistance Asynchrone :**
   - Base `mini_bim_autosave`, store `projects`, clé `'current_project'`.
   - Sauvegarde asynchrone évitant tout blocage du fil d'exécution graphique.

2. **D2 — Debounce 500 ms et Flush sur Déchargement :**
   - `AutoSaveManager` temporise les écritures disque à 500 ms pour regrouper les mutations successives.
   - Écouteur `beforeunload` pour sauvegarder immédiatement tout état modifié en attente.

3. **D3 — Restauration Transparente et Notification Utilisateur :**
   - Au chargement initial de l'application, l'état précédent est restauré automatiquement via `BimDocument.fromJSON` si présent.
   - Bannière informative `info-banner` ("Projet restauré depuis la sauvegarde automatique") affichée avec disparition automatique après 4 secondes.

4. **D4 — Périmètre Concurrence Multi-onglets (Clause V1) :**
   - Le mode de fonctionnement local-first mono-onglet est explicitement assumé en V1. La concurrence multi-onglets applique une politique standard *Last-Write-Wins*.
   - Le verrouillage inter-onglets (`Web Locks API`) et la synchronisation réactive (`BroadcastChannel`) sont reportés en Phase 9.

---

## ADR-052 : Dépendance Contrôlée de `@mini-bim/view-2d` vers `@mini-bim/core` pour Fonctions Pures de Dérivation (Amendement ADR-021 & ADR-029)

### Statut

**Accepté** (Chantier 3 — Complément d'Architecture — 15 novembre 2026)

### Décisions Clés

1. **D1 — Amendement Contrôlé d'ADR-021 & ADR-029 :**
   - `@mini-bim/view-2d` est officiellement autorisé à importer `@mini-bim/core` en dépendance de production (`dependencies`), exclusivement pour les fonctions mathématiques pures de dérivation géométrique et les types en lecture seule.

2. **D2 — Périmètre Autorisé (White-list) :**
   - Fonctions pures autorisées : `computeStairShaft`, `computeStairGeometry`, `computeHeadroomCutoffStep`, `resolveWallGeometry`.
   - Types et interfaces en lecture seule (`Stair`, `Slab`, `Wall`, `BimState`).

3. **D3 — Périmètre Interdit (Black-list Impérative) :**
   - Interdiction absolue d'importer `BimDocument`, `CommandBus`, les commandes concrètes de mutation (`AddWallCommand`, etc.), Immer (`produceWithPatches`), l'historique undo/redo ou tout état applicatif mutable.
   - `View2D` demeure un visualiseur Canvas 2D impératif et passif, qui n'applique aucune mutation directe et émet uniquement des intentions via ses callbacks.

---

## ADR-053 : Toitures (Plat & 2 Pans), Biseautage des Murs sous Toiture via `topProfile`, et Dérivation des Trémies de Toit

### Statut

**Accepté** (Phase 7 — 15 novembre 2026)

### Décisions Clés

1. **D1 — Modèle Discriminated Union (`RoofType`) :**
   - Séparation stricte des types `RoofType` selon la famille `flat` (épaisseur, acrotère) vs `gable` (épaisseur, pente, débord).
   - Invalidation immédiate au niveau du type-checker de propriétés invalides (pente sur toit plat).

2. **D2 — Biseautage des Murs via `topProfile: Vec2[]` :**
   - Extension de `ResolvedWall` : `topProfile` décrit la ligne brisée d'arase supérieure.
   - Murs pignons traversant le faîtage : profil en chevron à 3 sommets avec pic exact $z_{\text{ridge}} = z_{\text{base}} + W_{\text{half}} \cdot \tan(\alpha)$.

3. **D3 & D4 — Dérivation Non-Destructive des Trémies (`computeEffectiveRoofPolygon`) :**
   - Les trémies (`RoofOpening`) ne sont pas fusionnées dans le polygone d'assise mais dérivées à la volée.

4. **D5 — Rendu 3D Solide Étanche (Euler-Poincaré = 2) :**
   - Maillage étanche et calcul de volume analytique $V = 2 \times S_{\text{versant}} \times e$.

5. **D6 — Interopérabilité IFC4 :**
   - Export conforme ISO 16739 : `IFCROOF` agrégeant des entités `IFCSLAB.ROOF.`.

6. **D7 — Migration Schéma `topConstraint` :**
   - Discriminated union `{ kind: 'level' }` | `{ kind: 'roof' }` avec rétrocompatibilité automatique.

7. **D8 — Algorithme de Couverture Wall $\to$ Roof :**
   - Liaison explicite ou détection géométrique d'intersection 2D.

8. **D9 — Outil Interactif `RoofTool` & PropertyInspector :**
   - Workflow fluide de tracé, saisie du faîtage, et édition dynamique des propriétés.

---

## ADR-054 : Composants Architecturaux, Mobilier Paramétrique & Interopérabilité IFC4 (Phase 8)

### Statut

**Accepté** (Phase 8 — 18 novembre 2026)

### Contexte & Problématique

Mini-BIM supportait les éléments structurels du gros œuvre (murs, ouvertures, dalles, escaliers, toitures). Pour compléter la conception architecturale, le bâtiment doit intégrer le mobilier, les équipements sanitaires et les menuiseries spécifiques avec intégrité sémantique, classification buildingSMART IFC4 et détection spatiale des interférences.

### Décisions Clés

1. **D1 — Séparation ComponentType / Component :**
   - `ComponentType` définit les dimensions par défaut, la famille (`furniture`, `sanitary`, `system`, `glazing`), le mapping IFC4 (`IfcFurniture`, `IfcSanitaryTerminal`, `IfcSystemFurnitureElement`, `IfcDoor`, `IfcWindow`), les zones de dégagement et la symbologie 2D/3D.
   - `Component` porte l'occurrence physique avec placement ($x, y$, rotation, élévation, mur hôte éventuel) et surcharges dimensionnelles validées.

2. **D2 — Classification & Hiérarchie IFC4 buildingSMART :**
   - Remplacement de `IfcFurnishingElement` obsolète par `IfcFurniture` et `IfcFurnitureType`.
   - Équipements sanitaires typés : `IfcSanitaryTerminal` / `IfcSanitaryTerminalType` avec énumérations normalisées (`TOILETPAN`, `WASHHANDBASIN`, `SHOWER`, `BATH`, `SINK`).
   - Mobilier modulaire et cloisons mobiles : `IfcSystemFurnitureElement` / `IfcSystemFurnitureElementType`.
   - Liaison d'occurrence à type via `IfcRelDefinesByType`.

3. **D3 — Menuiseries Composants & Réservations Hôtes :**
   - Les menuiseries placées via le catalogue de composants (baies vitrées, portes coulissantes) génèrent automatiquement leur réservation `IfcOpeningElement` perçant le mur hôte, liée par `IfcRelVoidsElement` et remplie par `IfcRelFillsElement`.

4. **D4 — Moteur de Collision & Dégagements Fonctionnels (SAT 2D + Altimétrie) :**
   - Séparation stricte entre collision physique (matière solide) et violation de dégagement (zones fonctionnelles d'usage).
   - Détection via Théorème des Axes Séparateurs (SAT 2D) combiné à l'intervalle altimétrique $[z_{\text{inf}}, z_{\text{sup}}]$.

---

## ADR-055 : Modularisation du Noyau, Propagation DAG des Composants Hébergés et Qualification Système

### Statut

**Accepté** (Phase 8.6 — 19 novembre 2026)

### Contexte & Problématique

À l'issue de la Phase 8 et des chantiers de consolidation 1 à 4, le moteur nécessitait une consolidation technique majeure avant la Phase 9 (MEP) :
1. Éliminer la dette de maintenabilité des trois monolithes (> 1 500 à 2 150 lignes).
2. Valider formellement la réactivité du DAG pour les composants hébergés (`placement.hostWallId`) et trancher la sévérité de collision mur $\to$ composant.
3. Mesurer les performances transactionnelles réelles sur 1 000 éléments et intégrer des tests E2E sur navigateur réel.

### Décisions Clés

1. **D1 — Découpage Modulaire Zéro Rupture :**
   - Scission de `packages/core/src/rules.ts` en `packages/core/src/rules/` (12 modules de domaine).
   - Scission de `packages/core/src/commands.ts` en `packages/core/src/commands/` (10 modules de domaine).
   - Scission de `apps/web/src/components/PropertyInspector.tsx` en `apps/web/src/components/inspector/` (10 composants).
   - Maintien rigoureux de façades de ré-export 100% rétrocompatibles (`export * from './rules/index.js'`, etc.).

2. **D2 — Propagation DAG des Composants Hébergés :**
   - Enregistrement de `component -> hostWallId` dans le DAG.
   - Toute modification du mur hôte (`UpdateWallCommand`, `MoveWallCommand`) invalide et notifie les composants dépendants via `CommandResult.changed` et `lastChangedIds` (`T-EXEC-08`).

3. **D3 — Tranchage Collision Mur $\to$ Composant : Sévérité `warning` :**
   - `COMPONENT_COLLISION` est classé en `severity: 'warning'`.
   - `validateDirty` ne bloque pas la transaction pour les avertissements (`T-RULES-MOVE-06`), préservant la fluidité de conception architecturale sans masquer les conflits aux outils d'audit.

4. **D4 — Banc de Performance Synthétique & Qualification Externe :**
   - Mesures certifiées sur 1 000 murs : DAG en < 2 ms, transaction complète en 12,5 ms.
   - Export STEP ISO 10303-21 autonome validé par le parseur C++/WASM `web-ifc`.
   - Smoke tests Playwright E2E sur bundle de production Vite (`vite preview`).

---

## ADR-056 : Modèle Sémantique MEP et Graphe Topologique de Réseau Découplé

### Contexte

À l'issue de la Phase 9.1 (métrologie de scalabilité empirique sur 100, 1 000 et 10 000 entités), la Phase 9.2 engage le noyau MEP (génie climatique, plomberie et courants techniques).
Deux exigences clés ont été identifiées :
1. Isolation stricte selon l'ADR-009, sans couplage prématuré aux moteurs de rendu 2D/3D ni au routage.
2. Divergence fondamentale entre le `DependencyGraph` du BIM (DAG orienté acyclique strict) et les réseaux hydrauliques réels qui comportent naturellement des boucles fermées (aller/retour chauffage, boucles de recyclage ECS).

### Décisions Clés

1. **D1 — Découplage Structurel des Deux Graphes :**
   - `DependencyGraph` : DAG strict réservé à l'invalidation sémantique (`levelId -> mepElement`, `mepSystemId -> mepElement`). Aucune arête physique de fluide n'y est insérée pour préserver l'acyclicité.
   - `MepNetworkGraph` : Graphe topologique physique indépendant autorisant les réseaux linéaires, ramifiés, les sous-réseaux disjoints et les **boucles fermées** (`hasLoops()`).

2. **D2 — Modèle Sémantique Typé & Ports :**
   - Entités créées : `Pipe`, `Duct`, `CableTray`, `MepFitting`, `MepEquipment`, `MepSystem`, `Port`, `Connector`.
   - Typage strict des domaines (`plumbing`, `hvac`, `hydronic`, `electrical`) et des fluides sans chaînes libres.
   - Contrat formel de `Port` (position 3D, normale extérieure unitaire, dimensions, domaine, type de fluide, forme de section).

3. **D3 — Tolérances Numériques Centralisées (`MEP_TOLERANCES`) :**
   - Tolérances explicites : `POSITION_MM = 1.0`, `ANGLE_RAD = 0.05` (~2.86° anti-parallèle), `DIMENSION_MM = 0.5`.

4. **D4 — Commandes Transactionnelles & Cascade de Suppression :**
   - 12 commandes transactionnelles réversibles sous `produceWithPatches` Immer.
   - La suppression d'un élément détache automatiquement tous ses connecteurs incidents et purge ses références système. L'opération `undo()` restaure fidèlement le réseau complet.

5. **D5 — Performance & Complexité $\mathcal{O}(1)$ :**
   - Validations différentielles `validateDirty` en coût local strict $\mathcal{O}(1)$ sans boucle quadratique $\mathcal{O}(N^2)$ globale.
   - Qualification formelle sur 10 000 connexions avec parcours BFS en < 20 ms.

---

## ADR-057 : Indexation Spatiale 2D, Frustum Culling et Modularisation des Moteurs de Rendu

### Contexte

Lors du benchmark de la Phase 9.1 sur 1 000 entités réalistes (~400 murs, 200 ouvertures, mobilier, dalles, toitures, escaliers), le rendu 2D Canvas complet prenait **270 ms** (~3,7 FPS), dépassant largement le budget interactif de **16,67 ms** (60 FPS).
Par ailleurs, `renderer.ts` (~1 946 lignes) et `mesh-generator.ts` (~1 568 lignes) dépassaient le seuil de maintenabilité de 1 500 lignes.

### Décisions Clés

1. **D1 — Modularisation en Sous-Modules de Domaine :**
   - `packages/view-3d/src/mesh-generator/` découpé en 8 modules (`types`, `walls`, `openings`, `slabs`, `stairs`, `roofs`, `rooms`, `index`).
   - `packages/view-2d/src/renderer/` découpé en 12 modules (`config`, `grid`, `walls`, `openings`, `slabs`, `stairs`, `roofs`, `rooms`, `dimensions`, `underlay`, `preview`, `plan-view`, `index`).
   - Façades rétrocompatibles préservées dans `mesh-generator.ts` et `renderer.ts`.

2. **D2 — Grille Spatiale Uniforme (`SpatialGrid2D`) :**
   - Découpage du monde en cellules de 5 000 mm avec requêtes de fenêtre en $\mathcal{O}(c + m)$.
   - Indexation automatique de toutes les catégories architecturales.
   - Scan linéaire de référence `LinearSpatialIndex2D` pour étalonnage métrologique.

3. **D3 — Frustum Culling AABB & Filtrage par Niveau :**
   - Élimination des entités hors viewport avec marge de garde dynamique $\mathrm{marginMm} = \max(500, 50 / \mathrm{scale})$.
   - Filtrage par niveau actif `effectiveLevelId` : seuls les murs visibles du niveau actif sont résolus par `solveWallJunctions`.
   - Éléments traversants (`Stair`) visibles simultanément sur leur niveau de départ et d'arrivée via `levelIds`.

4. **D4 — Validation Métrologique (60 FPS Garanti) :**
   - Temps de rendu sur 1 000 entités réduit de **270 ms** à **11,63 ms (P95)** et **7,78 ms (P50)** (> 60 FPS certifié).
   - Mouvements caméra fluides : Pan P50 à 8,10 ms, Zoom P50 à 7,07 ms, Level Switch à 7,13 ms.
   - Scalabilité à 10 000 entités : 98,3% des éléments hors champ éliminés, requête spatiale en 0,50 ms.

---

## ADR-058 : Routage Géométrique Déterministe 3D et Insertion Paramétrique des Raccords MEP

### Contexte

Dans le cadre de la Sous-phase 9.3.3 (Réseaux Techniques MEP), après la mise en place du modèle topologique (`MepNetworkGraph`, ADR-056) et du pipeline graphique 2D/3D avec inspection (Sous-phases 9.3.1 et 9.3.2), Mini-BIM requiert un moteur de routage automatique pour relier deux ports ou tronçons du réseau sans recourir à un algorithme A* ou à des voxels.

### Décisions Clés

1. **D1 — Solveur de Routage Déterministe en Temps Constant $\mathcal{O}(1)$ (`routing.ts`) :**
   - Module pur fonctionnel sans dépendance DOM/React/Three.js (ADR-009).
   - Prise en charge des configurations canoniques : direct (avec transition auto si diamètres inégaux), coude orthogonal en L (90° et 45°), baïonnette en Z (déport double coude) et colonne montante/descendante ($\Delta Z$).
   - Garde-fou géométrique : rejet strict des segments < 50 mm (`MIN_SEGMENT_LENGTH_MM`).

2. **D2 — Commandes Transactionnelles Atomiques sous Immer (`commands.ts`) :**
   - `RouteMepPathCommand` : instanciation réversible en un bloc de tous les segments, coudes, réductions et connecteurs.
   - `InsertTeeBranchCommand` : découpe atomique du segment hôte en deux sous-segments, insertion du raccord Té à 3 ports, re-câblage des connecteurs incidents et raccordement de la branche secondaire sans orphelins sur Undo/Redo.
   - `ConnectWithTransitionCommand` : raccordement réducteur entre ports de calibres différents.

3. **D3 — Re-maillage 3D Incrémental Isolé du Réseau MEP (`Viewport3D.tsx`) :**
   - Mutation d'un élément MEP invalide uniquement son cluster connecté via `state.mepConnectors`.
   - Zéro re-maillage des murs, ouvertures, dalles ou toitures de l'architecture.

4. **D4 — Interaction et Ergonomie CAD (`MepTool.ts` & `MepRibbon.tsx`) :**
   - Accrochage magnétique hybride (ports ADR-047 et corps de tronçon hôte).
   - Polyline de prévisualisation avec waypoints et badges de coudes intermédiaires.
   - Inversion de l'orientation du coude via la touche `Tab` ou `Espace`.
   - Sélecteur d'angle préférentiel 90° / 45° dans le ruban contextuel.

---

## ADR-059 : Moteur Analytique de Détection des Conflits Géométriques (Clash Detection), Index Spatial 3D (BVH) et Qualification Sémantique BIM

### Contexte

Dans le cadre de la Phase 9 (Réseaux Techniques MEP) et de la coordination spatiale multi-métiers (Architecture, Structure, MEP), la détection des interférences physiques et des violations d'enveloppe de garde est un enjeu critique pour éviter les collisions de chantier (tuyau traversant un mur sans réservation, gaine traversant une dalle, chevauchement de conduits). Sans index spatial, la recherche exhaustive en $\mathcal{O}(N^2)$ s'effondre sur de grands modèles, et sans qualification sémantique, le moteur noie l'utilisateur sous des centaines de faux positifs constructifs.

### Décisions Clés

1. **D1 — Broad-Phase 3D Déterministe par BVH (AABB Tree) en TypeScript Pur (`packages/core/src/clash/spatial/`) :**
   - Index spatial hiérarchique pur sans Three.js ni DOM (Règle d'or #1 et ADR-009).
   - Partitionnement par médiane selon l'axe de plus grande amplitude géométrique.
   - Élimination de 99,63 % des paires candidates ($N = 500 \implies 456$ paires analysées sur 124 750).
   - Réutilisation directe dans `checkWallViolations` pour éliminer le goulot quadratique de la Phase 9.1.

2. **D2 — Narrow-Phase Analytique Exacte 3D (SAT 15 axes & Cylindre) (`packages/core/src/clash/narrow-phase/`) :**
   - 3D SAT complet testant les 15 axes potentiellement séparateurs pour boîtes orientées (OBB / OBB).
   - Test analytique exact de distance minimale segment-à-segment et segment-à-OBB pour les cylindres (tuyaux, gaines circulaires) avec support de la garde (`clearance`).
   - Calcul exact de `penetrationDepthMm`, `intersectionBox: AABB3D` et du contact ponctuel `point: Vec3`.

3. **D3 — Qualification Sémantique BIM & Élimination à 100% des Faux Positifs (`rules.ts`) :**
   - Exclusion des connexions MEP connectées via `Connector`.
   - Exclusion des baies (`Door`, `Window`, `Component`) hébergées sur leur `hostWallId`.
   - Exclusion des murs connectés à leurs extrémités (L, T, X) et des appuis dalles plans ($\le 2\text{ mm}$).
   - Classification en deux niveaux : `hard` (pénétration solide $> 2\text{ mm}$) et `clearance` (violation d'enveloppe).

4. **D4 — Superpositions Visuelles 3D & Contrôles Utilisateur (`Scene3D.ts` & `ClashPanel.tsx`) :**
   - Rendu 3D Three.js des volumes englobants filaires et translucides (rouge pour hard, ambre pour clearance) et sphère repère au point de collision.
   - Méthode `focusOnPoint` pour centrer et orienter la caméra 3D sur le conflit.
   - Panneau `ClashPanel` avec compteurs, filtres par discipline et sévérité, export CSV et sélection croisée des deux entités en interférence.

---

## ADR-060 : Modèle de Référence Fédéré IFC en Lecture Seule (Underlay 3D) & Coordination Spatiale Inter-Maquettes

### Contexte

Dans le cadre de la clôture de la Phase 9 (Réseaux Techniques MEP, Détection de Collisions & Import IFC), Mini-BIM doit intégrer des maquettes IFC externes issues d'autres logiciels BIM (Revit, Archicad, Tekla) pour permettre la synthèse interdisciplinaire (BIM Management). Tenter de convertir destructivement ces maquettes vers des entités éditables natives (`Wall`, `Slab`, etc. dans `BimState`) corrompt la source de vérité et introduit une infinité de cas limites géométriques non maîtrisés. Le standard industriel consiste à traiter les modèles IFC externes comme des maquettes de référence fédérées en lecture seule (*Underlay 3D* / coordination layer).

### Décisions Clés

1. **D1 — Isolation Stricte du Noyau Métier (`ADR-001`) :**
   - Les maquettes externes sont typées par l'interface `FederatedModel`, totalement découplée de `BimState`.
   - Zéro injection dans `state.walls`, `state.slabs` ou `state.pipes`.
   - Zéro mutation de l'historique Undo/Redo ni du CommandBus.
   - Zéro persistance automatique dans IndexedDB (`autoSave`).
   - Cycle de vie indépendant (chargement, recalage, bascule de visibilité, déchargement explicite).

2. **D2 — Normalisation Métrique & Alignement de Repère Z-up (`ADR-003`) :**
   - Détection des unités déclarées (`IFCSIUNIT`) via `detectIfcUnits` et normalisation vers le millimètre (`scaleToMm`).
   - Conversion inverse du repère standard Y-up de WebIFC/Three.js vers le repère architectural Z-up de Mini-BIM :
     $$\begin{cases} X_{\text{mini}} = X_{\text{web}} \times \text{scaleToMm} \\ Y_{\text{mini}} = -Z_{\text{web}} \times \text{scaleToMm} \\ Z_{\text{mini}} = Y_{\text{web}} \times \text{scaleToMm} \end{cases}$$
   - Alignement étalon round-trip validé sur la Villa Contemporaine Complexe avec un écart inférieur à 0,1 mm.

3. **D3 — Discipline Mémoire WASM & Rendu Dédié Three.js (`view-3d`) :**
   - Libération déterministe de la mémoire WebAssembly via `try ... finally { ifcApi.CloseModel(openModelId); }`.
   - Gestionnaire modulaire `FederatedIfcManager` dans `packages/view-3d` encapsulant le groupe Three.js `federatedIfcGroup`.
   - Contrôles de visibilité, opacité réglable, mode filaire et décalage de recalage spatial $(dX, dY, dZ)$ en millimètres.
   - Libération GPU stricte de toutes les `BufferGeometry` et des matériaux lors du déchargement ou du `dispose()`.

4. **D4 — Coordination Spatiale BVH Inter-Modèles (`ADR-059`) :**
   - Indexation des boîtes englobantes normalisées dans le `BVHTree` de la Phase 9.4.
   - Détection interactive des interférences entre éléments natifs (ex: canalisations, gaines) et entités IFC externes (`detectFederatedClashes`).

5. **D5 — Inspection Sémantique en Lecture Seule & UI Réactive (`apps/web`) :**
   - Raycasting 3D sans altération du document.
   - Panneau `FederatedIfcPanel` avec onglets Maquettes, Inspecteur de propriétés (`GlobalId`, type IFC, `PropertySets`, `BaseQuantities`) et Conflits spatiaux.
   - Respect strict de la Règle d'or #2 : zéro import de `@mini-bim/geometry` dans `apps/web`.

---

## ADR-062 : Scalabilité du Noyau 10 000 Entités — Indexation Paresseuse $\mathcal{O}(1)$, Partage Structurel CSG de Dalles via WeakMap et DAG Incrémental Différentiel

### Contexte

La métrologie de la Phase 9.1 a révélé deux goulots d'étranglement de scalabilité sur le palier des 10 000 entités (ADR-014) :
1. `resolveWallGeometry` prenait 6 708 ms sur 4 000 murs à cause d'un double balayage quadratique de l'ensemble des ouvertures/composants et de calculs CSG répétés de dalles.
2. Une mutation unitaire (`UpdateWallCommand`, `MoveWallCommand`) provoquait une latence de ~6,9 s en raison de la ré-indexation globale du DAG et de la traversée de milliers de pièges Proxy Immer de V8.

### Décisions Clés

1. **D1 — Pureté Fonctionnelle et Indexation Paresseuse via `WeakMap` (`packages/core/src/walls/index-cache.ts`) :**
   - Mise en place de `LazyWallResolutionIndex` indexé sur la référence immuable `WeakMap<BimState, WallResolutionIndex>` avec getters paresseux mémoïsés (`doorsByHostWallId`, `windowsByHostWallId`, `componentsByLevelId`, `wallsByLevelId`, `dimensionsByRefId`, `roomsByLevelId`, `slabsByLevelId`, `roofs`).
   - Dé-proxification automatique dans `getOrBuildWallResolutionIndex` via `original(draft) ?? draft` avec option `{ bypassUnwrap: true }` si appelée sur un draft en cours de mutation.
   - Partage structurel des dalles via `WeakMap<Slab, EffectiveSlabResult>` réutilisant les contours CSG tant que l'objet `Slab` n'a pas été muté.

2. **D2 — Maintenance Incrémentale Différentielle du DAG (`packages/core/src/dag/DependencyGraph.ts` & `document.ts`) :**
   - Conservation de l'instance persistante `DependencyGraph` dans `BimDocument`.
   - Invariance topologique (`isTopologicalInvariant = true`) court-circuitant la reconstruction et le clonage du DAG lors des translations géométriques pures.
   - Mise à jour différentielle locale `updateElements` pour les mutations structurelles.
   - Atomicité absolue : si `validateDirty` lève une exception, `this.state` et `this._dag` restent strictement inchangés (`T-EXEC-INVARIANT-CONTRACT`).

3. **D3 — Accélération de `validateDirty` & Filtrage Spatial sans Proxy (`packages/core/src/rules/dirty.ts` & `rooms/detect.ts`) :**
   - Court-circuit immédiat des violations `'warning'` non-bloquantes (ex. interférences de mobilier) sans second balayage sur `previousState`.
   - Filtrage spatial AABB 2D en amont dans `detectRooms` sur coordonnées brutes sans réveiller les proxies Immer.
   - Évitement du balayage de clés sur draft Immer via `noNewWalls: true` et `modifiedWallIds`.
   - Repli architectural systématique sur la détection complète du niveau pour les grandes pièces ouvertes (> 6m ou > 15m) afin de garantir 0 faux négatif `unenclosed`.

---

## ADR-063 : Coupes 2D Dynamiques, Élévations de Façade, Plans de Coupe 3D et Export Vectoriel SVG Normalisé

### Contexte

En ingénierie du bâtiment et modélisation BIM professionnelle (Revit, ArchiCAD), la coupe et l'élévation ne sont pas des dessins statiques ou isolés, mais des projections analytiques directes et dynamiques de la maquette numérique unique.
Mini-BIM nécessitait un moteur dynamique capable de couper et projeter tous les corps d'état modélisés (architecture, structure, réseaux MEP), de synchroniser en temps réel un plan de coupe 3D Three.js sans dégradation de performance, d'exporter en SVG vectoriel avec cartouche réglementaire ISO, et d'offrir une ergonomie interactive fluide.

### Décisions Clés

1. **D1 — Contrat Unifié `SectionCut` & Repère Local de Coupe (`@mini-bim/core`, `@mini-bim/geometry`) :**
   - Coupe définie par segment 2D borné `start`, `end`, une direction d'observation `viewDirection: 1 | -1`, une profondeur de champ `depth` et des bornes altimétriques optionnelles `zMin`, `zMax`.
   - Repère orthonormé local `SectionFrame2D` $P(x, y) \to (s, d)$ avec abscisse curviligne $s \in [0, L]$ et profondeur $d \in [0, \text{depth}]$.
   - Algorithme analytique `sliceSegmentWithPolygon` calculant l'intervalle de coupure exact avec les polygones 2D (murs, dalles, toitures).

2. **D2 — Assemblage Neutre `computeSectionScene` (`@mini-bim/core`) :**
   - Fonction pure découplée de tout moteur graphique produisant `SectionScene` contenant `cutItems` (pochés de coupe forts avec hachures maçonnerie, béton, isolant, solide MEP) et `projectedItems` (arêtes fines d'arrière-plan).
   - Prise en compte rigoureuse des déductions d'ouvertures (allèges, linteaux), des trémies de dalles et cages d'escaliers (ADR-048), du biseautage de tête sous toiture (ADR-053), et des réseaux MEP (traversées circulaires ou projections de parcours).

3. **D3 — Moteur de Rendu Canvas 2D & Export Vectoriel SVG (`@mini-bim/view-2d`) :**
   - Rendu Canvas 2D `renderSectionView` avec cibles altimétriques, niveaux, lignes de sol et styles de hachures conformes aux normes ISO 128 / BIM.
   - Export SVG `generateSectionSvg` intégrant cartouche réglementaire, motifs de hachures `<defs>` vectoriels, échelles normalisées 1:50, 1:100, 1:200 et format A4/A3 paysage.
   - Représentation normalisée du symbole de coupe sur plan 2D (`drawSectionCuts`) avec trait mixte fort, flèches d'observation et pastilles de repère $A-A'$.

4. **D4 — Synchronisation 3D Three.js & Filtrage Raycasting (`@mini-bim/view-3d`) :**
   - Activation de `renderer.localClippingEnabled = true` et `setSectionCutFrom2D(start, end, viewDirection)`.
   - Construction déterministe du plan analytique `THREE.Plane(normal, constant)` en repère Z-up :
     $$\vec{n} = \text{viewDirection} \cdot (-u_y, u_x, 0), \quad c = -(n_x \cdot x_1 + n_y \cdot y_1)$$
   - Propagation automatique aux matériaux existants et nouveaux via `setSectionCutPlane`.
   - Filtrage dans `raycastNDC` : élimination des surfaces coupées (`distanceToPoint(hit.point) < 0`), permettant le picking naturel des éléments situés derrière la coupe.

5. **D5 — Ergonomie Cockpit & Expérience Utilisateur (`apps/web`) :**
   - Outil interactif pur `SectionTool` (`X`) avec mode glisser et mode deux clics, snap 45°/90° sur `Shift`, et inversion du sens par barre d'espace (`Space`).
   - Détection au clic et sélection via `findSectionCutAtScreen` dans `SelectTool`.
   - Panneau d'inspection dédié `SectionInspector` dans `PropertyInspector`.
   - Intégration dans `ProjectBrowser` (sous-dossier « Coupes & Élévations »), onglet dédié `SplitViewport` (`Coupe`), et composant `SectionViewport` avec toggle Synchro 3D et bouton d'export SVG.
   - Respect absolu de la Règle d'or #2 : zéro import direct de `@mini-bim/geometry` dans `apps/web`.






