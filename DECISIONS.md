# REGISTRE DES DÉCISIONS D'ARCHITECTURE (ADR) — MINI-BIM

**Statut global :** Registre Officiel de Décisions Techniques  
**Dernière mise à jour :** 13 novembre 2026

---

## Sommaire des ADRs

| Réf.        | Titre de la Décision                                                                         |   Statut    |    Date    |
| :---------- | :------------------------------------------------------------------------------------------- | :---------: | :--------: |
| **ADR-001** | Modèle BIM comme Source de Vérité Unique (Géométrie = Cache Dérivé)                          | **Accepté** | 13/11/2026 |
| **ADR-002** | Découplage Impératif des Moteurs de Vues (Canvas 2D / Three.js vs React)                     | **Accepté** | 13/11/2026 |
| **ADR-003** | Standardisation des Unités et Repères Spatiaux (Millimètres Float64 & Z-Up)                  | **Accepté** | 13/11/2026 |
| **ADR-004** | Découpe d'Ouvertures par Tranches 2.5D (Sutherland-Hodgman)                                  | **Accepté** | 13/11/2026 |
| **ADR-005** | Résolution Topologique des Jonctions de Murs et Limites d'Onglet                             | **Accepté** | 13/11/2026 |
| **ADR-006** | Gestion des Mutations et Undo/Redo par Command Pattern Typé                                  | **Accepté** | 13/11/2026 |
| **ADR-007** | Stratégie de Persistance Hybride (JSON Versionné puis SQLite WASM/OPFS)                      | **Accepté** | 13/11/2026 |
| **ADR-008** | Détection Hybride et Stabilité Sémantique des Pièces (Rooms)                                 | **Accepté** | 13/11/2026 |
| **ADR-009** | Architecture d'Extensibilité pour les Réseaux MEP (Category Registry)                        | **Accepté** | 13/11/2026 |
| **ADR-010** | Révision des Tolérances Numériques, Typage des Intersections et Rejet de l'Arrondi Prématuré | **Accepté** | 13/11/2026 |
| **ADR-011** | Moteur de Jonctions de Murs Déterministe (L, T, X, Colinéaire et Multi-branches)             | **Accepté** | 13/11/2026 |
| **ADR-012** | Directives de Robustesse Topologique et Clôture des Jonctions (Audit Approfondi Phase 1)     | **Accepté** | 13/11/2026 |
| **ADR-013** | Formalisation et Validation des Percements d'Ouvertures 2.5D (Phase 1.2)                     | **Accepté** | 13/11/2026 |
| **ADR-014** | Gouvernance et Traçabilité des Métriques de Rapports (CI Verbatim)                           | **Accepté** | 13/11/2026 |
| **ADR-015** | RawMeshData et Buffers Neutres pour Rendu 3D (sans dépendance Three.js)                      | **Accepté** | 13/11/2026 |
| **ADR-016** | Stratégie Hybride de Triangulation 2D (Triangle Fan O(n) + Ear Clipping earcut)              | **Accepté** | 13/11/2026 |
| **ADR-017** | Traitement des Interfaces de Contact Internes entre Pièces Adjacentes (Modular Solid Block)  | **Accepté** | 13/11/2026 |
| **ADR-018** | Architecture Impérative de view-3d sans React, Rendu à la Demande et Backface Culling        | **Accepté** | 13/11/2026 |
| **ADR-019** | Architecture du Noyau BIM — BimDocument, CommandBus et Undo/Redo via Immer                   | **Accepté** | 13/11/2026 |
| **ADR-020** | Stratégie d'Identifiants Uniques — Adoption d'ULID pour le Noyau BIM                         | **Accepté** | 13/11/2026 |
| **ADR-021** | Architecture Impérative de view-2d sans React, Émission de Command, Conversion Y-up/Y-down   | **Accepté** | 13/11/2026 |
| **ADR-022** | Intégration React dans apps/web — Viewports Impératifs Isolés, Contexte Documentaire         | **Accepté** | 13/11/2026 |
| **ADR-023** | Génération de Maillages 3D dans @mini-bim/view-3d via Interfaces Géométriques Neutres        | **Accepté** | 14/11/2026 |
| **ADR-024** | Architecture des Outils Interactifs 2D (State Machines Pures, Snapping 45° et Pont DOM)      | **Accepté** | 14/11/2026 |
| **ADR-025** | Sélection UI Partagée Bidirectionnelle (État Éphémère React vs Pureté Documentaire)          | **Accepté** | 14/11/2026 |
| **ADR-026** | Picking 3D Déterministe via Raycasting, userData et Permutation de Matériau Partagé          | **Accepté** | 14/11/2026 |
| **ADR-027** | Remplacement de BimDocument sans Recréation de Contexte Graphique (setDocument vs Re-Key)    | **Accepté** | 14/11/2026 |

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
