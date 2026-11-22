# ADR-056 : Modèle Sémantique MEP et Graphe Topologique de Réseau Découplé

- **Statut :** Accepté
- **Date :** 2026-11-19
- **Auteurs :** Équipe Mini-BIM (Phase 9.2)
- **Décideurs :** Architecture Core & Direction Technique
- **Références :** ADR-009 (Extensibilité MEP), ADR-010 (Tolérances et Intersections continu float64), Phase 9.1 (Banc de scalabilité)

---

## 1. Contexte

À l'issue de la Phase 9.1 (campagne métrologique de scalabilité empirique sur 100, 1 000 et 10 000 entités), Mini-BIM engage la **Phase 9.2 : Noyau MEP & Modèle Topologique des Réseaux Techniques**.
Cette phase marque la transition du moteur d'un outil de modélisation architecturale pure vers une suite BIM pluridisciplinaire.

Deux impératifs majeurs ont été dégagés lors des revues d'architecture :
1. **Périmètre strict :** Se concentrer exclusivement sur le noyau métier, les connecteurs, la topologie et les validations transactionnelles, en proscrivant formellement le routage géométrique automatique, le rendu 2D/3D et la détection d'interférences 3D.
2. **Divergence topologique fondamentale :** Un réseau hydraulique réel comporte naturellement des boucles fermées (départ/retour chauffage, boucles de recyclage ECS, boucles d'eau glacée). À l'inverse, le `DependencyGraph` du noyau BIM est par définition un **graphe orienté acyclique (DAG)** dont tout cycle provoque un rejet critique (`CYCLE_DETECTED`).

---

## 2. Décisions Architecturales

### 2.1. Découplage Structurel Strict des Deux Graphes

Deux graphes indépendants coexistent au sein du domaine `@tabax/core`, chacun doté d'une responsabilité univoque :

1. **`DependencyGraph` (DAG de dépendance BIM) :**
   - **Rôle :** Propagation réactive des invalidations et calcul de l'ordre d'évaluation lors des mutations d'état.
   - **Contrainte :** Acyclicité stricte ($V + E$).
   - **Relations MEP enregistrées :** Uniquement les dépendances hiérarchiques structurelles : `levelId -> mepElement`, `mepSystemId -> mepElement`.
   - **Règle absolue :** **Aucune arête de connexion physique ou de flux de fluide n'est insérée dans le DAG.**
2. **`MepNetworkGraph` (Graphe topologique de réseau physique) :**
   - **Rôle :** Modélisation de la connectivité physique réelle, parcours des réseaux/sous-réseaux (BFS), détection des ports ouverts et recensement des boucles fermées.
   - **Topologie autorisée :** Réseaux linéaires, réseaux ramifiés, dérivations, sous-réseaux disjoints, éléments isolés et **boucles fermées cycliques**.
   - **Tolérance au cycle :** Les cycles y sont valides et normaux ; la méthode `hasLoops()` permet de les inspecter sans jamais bloquer le moteur transactionnel.

### 2.2. Modèle Sémantique Typé des Entités MEP

Le module `packages/core/src/mep/` définit les entités métier suivantes :
- **`Pipe` (Tuyauterie) :** Segment rectiligne de canalisation transportant un fluide sous pression ou gravitaire (diamètre nominal, matériau, pente, 2 ports d'extrémité).
- **`Duct` (Gaine aéraulique) :** Conduit rectiligne d'air (section circulaire ou rectangulaire, isolation, 2 ports d'extrémité).
- **`CableTray` (Chemin de câbles) :** Support de câbles électriques et de données (largeur, hauteur de rebord, 2 ports).
- **`MepFitting` (Raccord) :** Élément de transition topologique ou directionnelle (`elbow`, `tee`, `cross`, `transition`, `cap`).
- **`MepEquipment` (Équipement technique) :** Appareil raccordé (`boiler`, `heat_pump`, `water_heater`, `pump`, `ahu`, `fan`, `radiator`, `valve`, `meter`, `electrical_panel`).
- **`MepSystem` (Système technique) :** Regroupement fonctionnel d'éléments sous une même sémantique fluide (nom, domaine, fluide/système, couleur d'identification).
- **`Port` (Point de raccordement) :** Propriété portée par un élément physique (position 3D absolue, vecteur normal extérieur, domaine, type de fluide, forme, dimensions nominales, sens de flux).
- **`Connector` (Liaison effective) :** Relation topologique unissant deux ports physiques (`portAId`, `portBId`, `systemId`).

### 2.3. Taxonomie Typée des Domaines et Fluides

Afin d'éliminer tout risque d'erreur lié à des chaînes de caractères libres non contrôlées, les domaines et fluides sont strictement typés :
- `plumbing` : `domestic_cold_water`, `domestic_hot_water`, `drainage_waste`, `drainage_soil`.
- `hvac` : `supply_air`, `return_air`, `exhaust_air`.
- `hydronic` : `hydronic_supply`, `hydronic_return`.
- `electrical` : `power`, `telecom`.

### 2.4. Tolérances Numériques Centralisées (`MEP_TOLERANCES`)

Toutes les vérifications géométriques d'accostage utilisent des tolérances explicites et centralisées :
- `POSITION_MM` : $1.0\text{ mm}$ (distance spatiale maximale pour considérer deux ports coïncidents).
- `ANGLE_RAD` : $0.05\text{ rad}$ ($\approx 2.86^\circ$, tolérance d'alignement anti-parallèle des vecteurs normaux $u \cdot v \le -\cos(\theta)$).
- `DIMENSION_MM` : $0.5\text{ mm}$ (tolérance sur le diamètre ou la section).
- `SLOPE_PERCENT` : $0.001$.

### 2.5. Commandes Transactionnelles et Cascade de Suppression

Toutes les opérations d'édition MEP sont encapsulées dans des commandes transactionnelles réversibles :
- `AddPipeCommand`, `UpdatePipeCommand`, `DeletePipeCommand`
- `AddDuctCommand`, `UpdateDuctCommand`, `DeleteDuctCommand`
- `AddCableTrayCommand`, `UpdateCableTrayCommand`, `DeleteCableTrayCommand`
- `AddMepFittingCommand`, `UpdateMepFittingCommand`, `DeleteMepFittingCommand`
- `AddMepEquipmentCommand`, `UpdateMepEquipmentCommand`, `DeleteMepEquipmentCommand`
- `CreateMepSystemCommand`, `AssignToMepSystemCommand`, `RemoveFromMepSystemCommand`, `DeleteMepSystemCommand`
- `ConnectPortsCommand`, `DisconnectPortsCommand`

**Politique de suppression en cascade :**
La suppression d'un élément MEP détache et supprime immédiatement tous les connecteurs incidents reliant ses ports et purge ses références dans les systèmes techniques rattachés.
Grâce au moteur Immer (`produceWithPatches`), l'opération `undo()` restaure fidèlement l'élément, ses ports et ses connexions incidentes sans duplication ni état orphelin.

### 2.6. Performance & Complexité Locale $\mathcal{O}(1)$

Conformément aux leçons de la Phase 9.1, les validateurs différentiels MEP intégrés à `validateDirty` (`checkPipeViolations`, `checkDuctViolations`, `checkConnectorViolations`, etc.) s'exécutent en complexité locale stricte $\mathcal{O}(1)$ par élément marqué dirty. Aucune boucle quadratique $\mathcal{O}(N^2)$ globale de collision solide 3D n'est introduite dans cette phase, celle-ci étant réservée au moteur BVH/OBB de la Phase 9.4.

---

## 3. Conséquences & Bénéfices

- **Préservation de l'architecture existante :** Les 18 catégories initiales, le système de double viewport 2D/3D et l'ensemble des 1 045 tests existants restent 100% verts sans aucune altération.
- **Extensibilité démontrée :** L'ajout de 7 nouvelles catégories (`pipe`, `duct`, `cableTray`, `mepFitting`, `mepEquipment`, `mepSystem`, `mepConnector`) porte le registre à 25 catégories et 29 relations déclaratives.
- **Scalabilité validée empiriquement :** Le banc de test `T-MEP-SCALE` certifie que le `MepNetworkGraph` gère 10 000 connexions avec un parcours BFS en $< 20\text{ ms}$ et une détection de boucles en $< 10\text{ ms}$.
- **Cadre prêt pour la Phase 9.3 :** Le modèle topologique est solide, sérialisable et transactionnel, prêt pour l'intégration des outils de dessin interactifs et du rendu 2D/3D unifié.
