# ADR-064 : Moteur d'Exportation DXF R12 Pur TypeScript (AC1009)

## Statut
Accepté

## Contexte
La Saison 3 de Mini-BIM introduit l'interopérabilité CAO professionnelle 2D via l'exportation native de fichiers DXF pour les plans d'étages et les coupes/élévations analytiques (ADR-063).

Deux options techniques se présentaient pour le format pivot DXF :
1. **DXF R2000+ (`AC1015`)** : Format moderne supportant l'entité native `HATCH`, `LWPOLYLINE`, les dictionnaires `OBJECTS`, `CLASSES`, et les métadonnées étendues. Cependant, il impose des contraintes syntaxiques draconiennes (identifiants uniques hexadécimaux `5`, sous-classes `AcDbEntity` code `100`, pointeurs hiérarchiques vers `ModelSpace` code `330`). La moindre incohérence de handle ou de dictionnaire entraîne le rejet pur et simple du fichier ou une invite d'erreur de récupération dans AutoCAD, LibreCAD ou QCAD.
2. **DXF R12 (`AC1009`)** : Format standard universellement reconnu par 100% des logiciels de CAO/BIM du marché. Il est minimaliste, déterministe, ne nécessite ni dictionnaires, ni handles, ni sous-classes, tout en offrant une fidélité géométrique absolue.

## Décision

### 1. Ciblage Strict de DXF R12 (`AC1009`)
Nous implémentons un moteur DXF autonome pur TypeScript (`packages/view-2d/src/dxf/`), sans aucune dépendance logicielle externe :
- **Entête normalisé** : `$ACADVER = AC1009`, `$MEASUREMENT = 1` (système métrique en mm).
- **Repère ModelSpace 1:1 en mm** : 1 unité DXF = 1 mm réel dans l'espace modèle. Aucune inversion d'axe Y ni échelle papier n'est appliquée en ModelSpace (contrairement au SVG).
- **Limites d'emprise** : Calcul dynamique des variables d'entête `$EXTMIN` et `$EXTMAX` permettant un centrage et un affichage immédiats via la commande *Zoom Étendu* (`ZOOM E`) à l'ouverture du fichier.

### 2. Primitives Géométriques & Hachures Linéaires
- **Contours fermés** : Tracés via l'entité `POLYLINE` suivie d'une séquence de `VERTEX` et terminée par `SEQEND`, avec le drapeau `70 = 1` (fermé).
- **Hachures analytiques en primitives `LINE`** : L'entité complexe `HATCH` n'existant qu'à partir de la R14/R2000, le module `hatch.ts` génère des segments de hachures linéaires `LINE` découpés analytiquement à 45° via `sliceSegmentWithPolygonWithHoles` de `@mini-bim/geometry`. Ces segments sont isolés sur des calques dédiés (`ARCH-HATCH`, `SECTION-HATCH`), ce qui permet aux projeteurs CAO de masquer ou régler leur transparence en un clic.
- **Arcs et Cercles** : Entités `CIRCLE` et `ARC` (angles en degrés trigonométriques anti-horaires 0–360°).
- **Textes** : Entités `TEXT` normalisées avec échappement AutoCAD universel (`cleanDxfText` : `%%c` pour Ø, `%%d` pour °, `%%p` pour ±, `m2` pour m²).

### 3. Charte des Calques Normalisée (ACI Standards)
Tous les calques utilisés dans la section `ENTITIES` sont obligatoirement déclarés au préalable dans la table `LAYER` de la section `TABLES` (garantie d'intégrité référentielle) :

| Nom du Calque | Couleur ACI | Type de Ligne | Description Métier |
| :--- | :--- | :--- | :--- |
| `0` | 7 (Blanc/Noir) | `CONTINUOUS` | Calque système obligatoire |
| `ARCH-WALLS` | 7 (Blanc/Noir) | `CONTINUOUS` | Contours des murs résolus |
| `ARCH-HATCH` | 8 (Gris) | `CONTINUOUS` | Pochage / hachures des murs coupés |
| `ARCH-OPENINGS` | 4 (Cyan) | `CONTINUOUS` | Jambages, dormants et vitrages |
| `ARCH-DOOR-SWINGS` | 8 (Gris) | `DASHED` | Arcs et battements de portes à 90° |
| `ARCH-SLABS` | 3 (Vert) | `CONTINUOUS` | Dalles et trémies |
| `ARCH-ROOFS` | 2 (Jaune) | `CONTINUOUS` | Toitures et faîtages |
| `ARCH-STAIRS` | 7 (Blanc/Noir) | `CONTINUOUS` | Escaliers, contremarches et lignes de foulée |
| `ARCH-FURNITURE` | 9 (Gris clair) | `CONTINUOUS` | Composants et mobilier |
| `ARCH-ROOMS` | 5 (Bleu) | `CONTINUOUS` | Libellés et surfaces des pièces |
| `ARCH-DIMS` | 6 (Magenta) | `CONTINUOUS` | Cotations linéaires avec ticks 45° |
| `ARCH-SECTIONS` | 6 (Magenta) | `DASHDOT` | Lignes de coupe ISO et flèches |
| `SECTION-CUT` | 7 (Blanc/Noir) | `CONTINUOUS` | Éléments coupés au premier plan |
| `SECTION-HATCH` | 8 (Gris) | `CONTINUOUS` | Hachures de coupe à 45° |
| `SECTION-PROJ` | 9 (Gris clair) | `CONTINUOUS` | Arêtes et menuiseries en projection |
| `SECTION-LEVELS` | 6 (Magenta) | `DASHDOT` | Niveaux d'étages et cotes altimétriques |
| `SECTION-GROUND` | 8 (Gris) | `DASHED` | Ligne de référence sol Z = 0 |
| `SECTION-MEP-CUT` | 4 (Cyan) | `CONTINUOUS` | Canalisations et gaines coupées |
| `SECTION-MEP-PROJ` | 5 (Bleu) | `CONTINUOUS` | Canalisations et gaines projetées |
| `SECTION-ANNOTATIONS`| 7 (Blanc/Noir) | `CONTINUOUS` | Titres, échelles et cartouches |
| `MEP-SUPPLY` | 5 (Bleu) | `CONTINUOUS` | Eau froide sanitaire, soufflage VMC |
| `MEP-RETURN` | 1 (Rouge) | `CONTINUOUS` | Eau chaude sanitaire, retour VMC |
| `MEP-DRAINAGE` | 3 (Vert) | `CONTINUOUS` | Évacuations EU / EV |
| `MEP-VENTILATION` | 4 (Cyan) | `CONTINUOUS` | Gaines aérauliques |
| `MEP-ELECTRICAL` | 2 (Jaune) | `CONTINUOUS` | Chemins de câbles et courants forts |

### 4. Rigueur Syntaxique et Métrologie Automatisée
- **Fin de ligne CRLF (`\r\n`)** : Obligatoire pour la conformité CAO DOS/Windows.
- **Nombre pair de lignes** : Chaque code de groupe DXF entier sur 3 colonnes est immédiatement suivi de sa ligne valeur.
- **Terminaison canonique** : Clôture stricte par `0\r\nEOF\r\n`.
- **Validation automatisée** : Un parseur et validateur strict (`packages/view-2d/src/dxf/dxf.test.ts`) vérifie l'absence absolue de `NaN`, l'intégrité référentielle des calques et la conformité dimensionnelle à $10^{-3}$ mm près sur la Villa Complexe et l'Immeuble R+4.

## Conséquences
- Fichiers `.dxf` générés légers, robustes et s'ouvrant instantanément sans aucun message d'erreur ni avertissement dans tous les logiciels de CAO (AutoCAD, LibreCAD, QCAD, BricsCAD, DraftSight).
- Parité géométrique et sémantique parfaite entre les vues interactives 2D, les exports SVG et les exports DXF.
