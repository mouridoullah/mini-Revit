# Spécification Technique — Escaliers Paramétriques & Dérivation de Trémie (Phase 6.4)

**Statut :** Spécification de Référence (ADR-048)  
**Date :** 15 novembre 2026  
**Auteurs :** Équipe Mini-BIM & Lead Architect

---

## 1. Contexte & Principes Fondamentaux

L'escalier est l'élément de circulation verticale reliant deux étages adjacents. Dans Mini-BIM, la modélisation de l'escalier repose sur trois principes architecturaux stricts :

1. **Source Unique de Vérité (ADR-001 / ADR-048) :** L'escalier porte la géométrie de la volée (`start`, `end`, `bottomLevelId`, `topLevelId`). La trémie dans le plancher haut n'est **jamais stockée** dans la dalle (`slab.holes` restant réservé aux réservations manuelles). Elle est dérivée à la demande via `computeStairShaft()` et transmise dynamiquement aux moteurs de rendu et de découpe 2D/3D via `slab.openings`.
2. **Modèle Type / Instance (ADR-042 / ADR-048 D2) :** Le catalogue `draft.stairTypes` définit la largeur nominale (défaut 900 mm) et les matériaux, tandis que l'instance `Stair` porte la trajectoire et une surcharge optionnelle `widthOverride`.
3. **Ergonomie Réglementaire de Blondel (ADR-048 D3) :** Le pas de foulée $M = 2h + g$ est validé à chaque modification pour alerter l'utilisateur sur la conformité de l'ouvrage sans bloquer inutilement la modélisation.

---

## 2. Modèle de Données TypeScript

### 2.1 Interface `StairType`

```typescript
export interface StairType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // Largeur nominale de volée en mm (défaut: 900 mm, min: 500 mm, max: 2000 mm)
  readonly materialId?: string;
}
```

### 2.2 Interface `Stair`

```typescript
export interface Stair {
  readonly id: ElementId;
  readonly category: 'stair';
  readonly stairTypeId: ElementId;
  readonly bottomLevelId: ElementId;
  readonly topLevelId: ElementId;
  readonly start: Vec2; // Pied de l'escalier (coordonnées monde mm)
  readonly end: Vec2; // Tête d'arrivée de l'escalier (coordonnées monde mm)
  readonly widthOverride?: number; // Surcharge locale optionnelle de la largeur
  readonly name?: string;
}
```

### 2.3 Extension de `BimState`

```typescript
export interface BimState {
  // ...
  readonly stairTypes?: Readonly<Record<ElementId, StairType>>;
  readonly stairs?: Readonly<Record<ElementId, Stair>>;
}
```

---

## 3. Mathématiques de l'Escalier & Formule de Blondel

### 3.1 Calcul Altimétrique & Dimensionnel (`computeStairGeometry`)

Pour un escalier unissant un niveau bas d'élévation $Z_{\text{bas}}$ et un niveau haut d'élévation $Z_{\text{haut}}$ :
1. **Dénivelée totale ($\Delta Z$) :**
   $$\Delta Z = Z_{\text{haut}} - Z_{\text{bas}}$$
   *(Rejet strict si $\Delta Z \le 0$)*
2. **Nombre de marches ($N$) :**
   $$N = \operatorname{clamp}\left(\operatorname{round}\left(\frac{\Delta Z}{175}\right), 3, 30\right)$$
   *(Visant une hauteur théorique de contremarche de 175 mm)*
3. **Hauteur réelle de contremarche ($h$) :**
   $$h = \frac{\Delta Z}{N}$$
4. **Reculement horizontal total ($L$) :**
   $$L = \|\text{end} - \text{start}\| = \sqrt{(\text{end}_x - \text{start}_x)^2 + (\text{end}_y - \text{start}_y)^2}$$
5. **Giron réel ($g$) :**
   $$g = \frac{L}{N}$$
6. **Vecteur directionnel unitaire ($\vec{u}$) :**
   $$\vec{u} = \frac{\text{end} - \text{start}}{L}$$
7. **Vecteur transversal normal unitaire ($\vec{n}$) :**
   $$\vec{n} = (-u_y, u_x)$$

### 3.2 Critères de Conformité de Blondel (`validateStairBlondel`)

La formule de Blondel évalue la relation ergonomique :
$$M = 2h + g$$

| Plage $2h + g$ | Statut | Comportement UI / Moteur |
|---|---|---|
| $2h + g \in [600, 640]\text{ mm}$ avec $h \in [160, 190]$ et $g \in [250, 320]$ | **Conforme Confort** (`isCompliant: true`) | Badge vert dans le PropertyInspector |
| $2h + g \in [560, 680]\text{ mm}$ hors confort | **Avertissement Ergonomie** (`STAIR_BLONDEL_OUT_OF_COMFORT`) | Badge jaune, warning explicite |
| $2h + g < 560\text{ mm}$ ou $> 680\text{ mm}$ | **Avertissement Sécurité** (`STAIR_BLONDEL_OUT_OF_SAFETY`) | Badge rouge, alerte sur pente excessive ou giron trop court |

---

## 4. Dérivation Géométrique de la Trémie (`computeStairShaft`)

La trémie dans la dalle de plancher haut doit dégager le passage de la tête de l'usager et le gabarit de la volée :

- **Largeur de trémie ($W_{\text{trémie}}$) :**
  $$W_{\text{trémie}} = W_{\text{escalier}} + 2 \times 50\text{ mm}$$
  *(50 mm de jeu de chaque côté pour passage de main courante et finition)*
- **Longueur de trémie ($L_{\text{trémie}}$) :**
  $$L_{\text{trémie}} = L + 2 \times 100\text{ mm}$$
  *(100 mm de dégagement en pied et en tête)*
- **Polygone 2D projeté :** Rectangle en coordonnées monde orienté selon $\vec{u}$ et $\vec{n}$, centré sur l'axe de l'escalier et s'étendant de $-100\text{ mm}$ en deçà de `start` jusqu'à $+100\text{ mm}$ au-delà de `end`.

### Échappée de Tête (`computeHeadroom`)

La hauteur d'échappée minimale est de $2000\text{ mm}$ entre le nez de n'importe quelle marche et la sous-face de la dalle supérieure. Si l'échappée est inférieure à $2000\text{ mm}$, un avertissement non-bloquant `STAIR_HEADROOM_INSUFFICIENT` est émis.

---

## 5. Intégration DAG & Propagation

Dans le graphe de dépendances (`DependencyGraph`, ADR-041) :
- Arête dirigée : `stair -> slab(topLevelId)`.
- Lors d'un `AddStairCommand`, `UpdateStairCommand` ou `DeleteStairCommand`, l'identifiant de la dalle supérieure est inclus dans `getDependents(stairId)`.
- Le cache de maillage 3D et le cache de polygone 2D de la dalle supérieure sont invalidés et recalculés à la demande avec les nouvelles trémies dérivées.

---

## 6. Rendu 2D & 3D

### 6.1 Représentation 2D Plan (`drawStair`)
- Contour de l'emprise rectangulaire en trait plein fin (`#374151`).
- $N-1$ lignes de nez de marches transversales espacées de $g$.
- Ligne de foulée axiale reliant `start` à `end`, munie d'un cercle d'ancrage en pied et d'une flèche directionnelle en tête.
- En vue underlay ($N-1$), l'escalier est tracé en gris pointillé (`#9ca3af`, opacité 0.5).

### 6.2 Maillage 3D Crénelé (`createStairMesh`)
- Maillage unifié (`RawMeshData`) comprenant :
  - La face supérieure horizontale de chaque marche ($W \times g$, normale $+Z$).
  - La contremarche verticale de chaque marche ($W \times h$, normale $-\vec{u}$).
  - Les deux flancs latéraux fermés reliant les crénelages au limon inférieur.
  - La sous-face inclinée fermant le solide.
- Topologie étanche (caractéristique d'Euler $V - E + F = 2$).
- Matériau bois clair / béton structuré (`#a0825a`), raycast direct avec `userData.elementId = stair.id`.
