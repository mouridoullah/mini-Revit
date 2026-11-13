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
