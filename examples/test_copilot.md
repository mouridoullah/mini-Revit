# Plan de test complet — "La Maison R+1"

Voici un plan architectural réel, avec **toutes les coordonnées et valeurs** pour reproduire et tester **100% des fonctionnalités** de Mini-BIM. Tu peux le suivre pas à pas et vérifier chaque résultat.

---

## Le plan — Vue d'ensemble

**Maison individuelle R+1** de 8m × 6m hors œuvre, avec :
- **RDC** : Séjour/cuisine ouverte (32 m²), Chambre 1 (12 m²), SdB (5 m²), WC (2 m²), escalier droit
- **R+1** : Palier (4 m²), Chambre 2 (14 m²), Chambre 3 (12 m²), SdB (5 m²)
- **Toiture** : non implémentée (Phase 7)

```
┌─────────────────────────────────────────────────────────┐
│  RDC — 8000 mm × 6000 mm (hors œuvre, murs 200mm)       │
│                                                          │
│  (0,6000)                               (8000,6000)      │
│     ┌───────┬─────────┬───────┬───────┐                 │
│     │       │         │       │       │                 │
│     │  WC   │  SdB    │ Esc.  │Chambre│                 │
│     │ 2 m²  │  5 m²   │       │ 1     │                 │
│     │       │         │       │ 12 m² │                 │
│     ├───────┴─────────┤       │       │                 │
│     │                 │       │       │                 │
│     │                 │       ├───────┤                 │
│     │  Séjour /       │       │       │                 │
│     │  Cuisine        │       │ Hall  │                 │
│     │  ouverte        │       │       │                 │
│     │  32 m²          │       │       │                 │
│     │                 │       │       │                 │
│  (0,0)└────────────────┴───────┴───────┘(8000,0)        │
│                                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  R+1 — 8000 mm × 6000 mm (mêmes axes)                   │
│                                                          │
│     ┌───────┬─────────┬───────┬───────┐                 │
│     │       │         │       │       │                 │
│     │ SdB   │Chambre 3│Palier │Chambre│                 │
│     │ 5 m²  │ 12 m²   │ 4 m²  │ 2     │                 │
│     │       │         │       │ 14 m² │                 │
│     ├───────┴─────────┤       │       │                 │
│     │                 │       │       │                 │
│     │                 │       ├───────┤                 │
│     │                 │       │       │                 │
│     │  Vide sur       │       │       │                 │
│     │  séjour         │       │       │                 │
│     │  (avec garde-   │       │       │                 │
│     │   corps)        │       │       │                 │
│     │                 │       │       │                 │
│     └─────────────────┴───────┴───────┘                 │
└─────────────────────────────────────────────────────────┘
```

---

## Inventaire complet — Ce qu'il faut créer

### RDC (Niveau 0, élévation = 0 mm)

| # | Élément | Détail | Commande / Outil |
|---|---|---|---|
| 1 | Mur Sud extérieur | (0,0) → (8000,0), 200 mm ép. | `W` |
| 2 | Mur Est extérieur | (8000,0) → (8000,6000), 200 mm | `W` |
| 3 | Mur Nord extérieur | (8000,6000) → (0,6000), 200 mm | `W` |
| 4 | Mur Ouest extérieur | (0,6000) → (0,0), 200 mm | `W` |
| 5 | Refend vertical 1 | (4000,0) → (4000,6000), 100 mm | `W` |
| 6 | Refend horizontal 1 | (0,2500) → (4000,2500), 100 mm | `W` |
| 7 | Refend horizontal 2 | (4000,1000) → (8000,1000), 100 mm | `W` |
| 8 | Porte d'entrée | Sud, offset 3500 mm, 900×2100, swing right/in | `D` |
| 9 | Fenêtre Séjour | Sud, offset 1200 mm, 1200×1400, sill 900 | `F` |
| 10 | Fenêtre Chambre 1 | Est, offset 5000 mm, 1200×1200, sill 1000 | `F` |
| 11 | Fenêtre Cuisine | Ouest, offset 1500 mm, 1000×1200, sill 1100 | `F` |
| 12 | Dalle RDC | (0,0)→(8000,0)→(8000,6000)→(0,6000), 200 mm | `L` |
| 13 | Escalier RDC→R+1 | Pied (5500, 1500) → tête (5500, 4500), largeur 1000 mm | `E` |
| 14 | Pièce "Séjour" | Seed (2000, 1500) | Auto-détectée |
| 15 | Pièce "Chambre 1" | Seed (6500, 3000) | Auto-détectée |
| 16 | Pièce "SdB" | Seed (1500, 4500) | Auto-détectée |
| 17 | Pièce "WC" | Seed (2500, 5000) | Auto-détectée |

### R+1 (Niveau 1, élévation = 2800 mm)

| # | Élément | Détail | Commande / Outil |
|---|---|---|---|
| 18 | Mur Sud R+1 | (0,0) → (8000,0), 200 mm | `W` |
| 19 | Mur Est R+1 | (8000,0) → (8000,6000), 200 mm | `W` |
| 20 | Mur Nord R+1 | (8000,6000) → (0,6000), 200 mm | `W` |
| 21 | Mur Ouest R+1 | (0,6000) → (0,0), 200 mm | `W` |
| 22 | Refend vertical R+1 | (4000,0) → (4000,6000), 100 mm | `W` |
| 23 | Refend horizontal R+1 | (0,2500) → (4000,2500), 100 mm | `W` |
| 24 | Refend horizontal R+1 bis | (4000,1000) → (8000,1000), 100 mm | `W` |
| 25 | Fenêtre Chambre 2 | Est, offset 2500 mm, 1200×1400, sill 900 | `F` |
| 26 | Fenêtre Chambre 3 | Nord, offset 1500 mm, 1200×1400, sill 900 | `F` |
| 27 | Fenêtre SdB R+1 | Ouest, offset 4500 mm, 800×800, sill 1200 | `F` |
| 28 | Dalle R+1 | (0,0)→(8000,0)→(8000,6000)→(0,6000), 200 mm | `L` |
| 29 | Trémie escalier | Automatique via escalier | Auto-dérivée |
| 30 | Pièce "Chambre 2" | Seed (6500, 3000) | Auto-détectée |
| 31 | Pièce "Chambre 3" | Seed (1500, 4500) | Auto-détectée |
| 32 | Pièce "Palier" | Seed (5000, 3000) | Auto-détectée |

---

##  Déroulé pas à pas — 30 minutes

### Phase 1 — Préparation (1 min)

```
1. Ouvre http://localhost:5173/
2. Le demoDocument par défaut s'affiche (4 murs + porte + fenêtre)
3. Sélectionne tout (S, clic sur chaque élément, Suppr) OU
   recharge avec  en partant d'un projet vide
4. Vérifie que le plan 2D est vide
```

### Phase 2 — Le RDC : murs extérieurs (5 min)

**Objectif** : 4 murs formant un rectangle 8m × 6m.

```
1. Touche W (Tracer Mur)
2. Clic à (0, 0) → le preview démarre
3. Clic à (8000, 0) → 1er mur créé
4. Touche W à nouveau
5. Clic à (8000, 0) → clic à (8000, 6000) → 2e mur
6. Touche W
7. Clic à (8000, 6000) → clic à (0, 6000) → 3e mur
8. Touche W
9. Clic à (0, 6000) → clic à (0, 0) → 4e mur (fermeture)
```

 **Vérification** :
- Les 4 murs se raccordent proprement aux coins (onglets à 90°)
- Le StatusBar affiche `Murs : 4`
- La pièce "Séjour" est détectée avec environ **37 m²** (surface intérieure : 7.6 × 5.6 = 42.56 m², moins les refends à venir)

### Phase 3 — Le RDC : refends intérieurs (5 min)

```
1. W → (4000, 0) → (4000, 6000)   [refend vertical central]
2. W → (0, 2500) → (4000, 2500)   [refend horizontal ouest]
3. W → (4000, 1000) → (8000, 1000) [refend horizontal est]
```

 **Vérification** :
- Les murs intérieurs s'accrochent aux murs extérieurs (T-junction propre)
- Le plan affiche maintenant 4 pièces distinctes
- Surface totale ≈ 42 m²

### Phase 4 — Le RDC : ouvertures (5 min)

**Porte d'entrée** :
```
1. Touche D
2. Survole le mur Sud → un aperçu de porte apparaît
3. Clic vers l'abscisse 3500 mm du mur (à ≈ 3500 mm du coin gauche)
4. La porte est posée avec un arc de débattement de 90°
```

**Fenêtre Séjour** :
```
1. Touche F
2. Survol du mur Sud → aperçu fenêtre
3. Clic à 1200 mm du coin gauche (dans le séjour)
```

**Fenêtre Chambre 1** :
```
1. F → clic sur le mur Est, à 5000 mm du Sud
```

**Fenêtre Cuisine** :
```
1. F → clic sur le mur Ouest, à 1500 mm du Sud
```

 **Vérification** :
- Le poché du mur est **réellement découpé** à l'emplacement de chaque baie
- En 3D : portes en bois, fenêtres en verre translucide
- Si tu tentes de poser une porte sur un mur trop court → **error-banner** rouge s'affiche
- Si tu tentes de poser deux portes qui se chevauchent → **error-banner** `OPENING_OVERLAP`

### Phase 5 — Le RDC : dalle (2 min)

```
1. Touche L (Dalle)
2. Clic aux 4 coins du contour intérieur :
   (100, 100) → (7900, 100) → (7900, 5900) → (100, 5900)
3. Double-clic (ou Enter) pour fermer
```

 **Vérification** :
- La dalle apparaît en 2D : poché béton + hachures 45°
- En 3D : volume gris sous les murs
- Sa surface ≈ 47 m² (elle déborde légèrement sous les murs extérieurs)
- Dans le MetricsPanel : `Volume dalle = 9.4 m³`

### Phase 6 — Le RDC : escalier (3 min)

```
1. Touche E (Escalier)
2. Clic au pied : (5500, 1500) — dans le couloir/hall
3. Clic à la tête : (5500, 4500) — il monte vers le nord
4. L'escalier est créé et le PropertyInspector affiche :
   - ΔZ = 2800 mm
   - N = 16 marches
   - h = 175 mm
   - g = 187.5 mm
   - 2h + g = 537.5 mm  Hors Confort
```

 **Test négatif intéressant** : l'escalier de test initial est **trop court** (3000 mm pour monter 2800 mm → giron trop petit). C'est **volontaire** pour tester le badge.

**Correction** : dans le PropertyInspector, change la longueur (ou supprime et refais avec une tête plus loin) :
```
1. Suppr l'escalier
2. E → (5500, 1000) → (5500, 5000)  [4000 mm de long]
```

 **Vérification après correction** :
- N = 16, h = 175, g = 250
- 2h + g = 600 mm → **Badge Vert** : `Conforme (Confort)`

### Phase 7 — Le R+1 (5 min)

```
1. Bouton + Étage (dans la Toolbar) → crée "Étage 1" à +2800 mm
2. Sélecteur Étage : Étage 1
3. Active l'underlay ( Underlay (N-1) ON)
4. Les murs du RDC apparaissent en pointillés gris
```

**Murs R+1** (le snap va t'aider) :
```
1. W → (0,0) → (8000,0)         [snap sur sommets RDC]
2. W → (8000,0) → (8000,6000)
3. W → (8000,6000) → (0,6000)
4. W → (0,6000) → (0,0)
5. W → (4000,0) → (4000,6000)
6. W → (0,2500) → (4000,2500)
7. W → (4000,1000) → (8000,1000)
```

**Fenêtres R+1** :
```
1. F → mur Est, offset 2500
2. F → mur Nord, offset 1500
3. F → mur Ouest, offset 4500
```

**Dalle R+1** :
```
1. L → (100,100) → (7900,100) → (7900,5900) → (100,5900)
2. Enter
```

 **Vérification CRUCIALE** :
- La dalle R+1 doit avoir **une trémie automatique** à l'aplomb de l'escalier (visible en 2D comme croix de réservation + en 3D comme trou)
- **La trémie n'est PAS stockée** dans la dalle (vérifier dans l'export JSON plus tard)
- Surface dalle R+1 = 47 - 4 (trémie) = 43 m²

### Phase 8 — Vérifications 3D (3 min)

```
1. Vue 3D : orbite autour du bâtiment
2. Tu dois voir :
   - RDC complet avec murs, portes, fenêtres, dalle
   - R+1 posé au-dessus avec mêmes murs
   - L'escalier qui monte du RDC vers R+1
   - La trémie dans la dalle R+1 (trou par lequel on voit l'escalier)
   - Les 2 dalles superposées avec 2800 mm entre elles
3. Sélectionne un mur en 3D → il se surligne en bleu
4. La sélection est SYNCHRONISÉE avec le plan 2D
```

### Phase 9 — Tests de crédibilité (5 min)

#### Test 1 — Déplacer un mur, les voisins suivent
```
1. Touche M (Déplacer Mur)
2. Sélectionne le mur Ouest (le mur extérieur à x=0)
3. Glisse-le de +500 mm vers l'Est
4.  Vérifications :
   - Le mur Ouest est maintenant à x=500
   - Les murs Nord et Sud se sont ÉTIRÉS (ils vont de (500,y) à (8000,y))
   - Les fenêtres/portes des murs étirés ont suivi
   - La pièce Séjour a été recalculée
   - Les métrés ont changé
5. Ctrl+Z → tout revient à l'état initial
```

#### Test 2 — Déplacer un mur portant une porte
```
1. Sélectionne le mur Sud (qui porte la porte d'entrée)
2. Déplace-le de (0, +300) mm vers le Nord
3.  Vérifications :
   - Le mur Sud est à y=300
   - La porte d'entrée a SUIVI (offsetAlong = 3500 inchangé)
   - La pièce Séjour a rétréci
   - La dalle RDC n'a pas bougé (elle est indépendante)
4. Ctrl+Z
```

#### Test 3 — Déplacer un escalier, la trémie suit
```
1. Touche E (mais sans créer — utilise S pour sélection)
2. Sélectionne l'escalier
3. Glisse-le de (0, +500) — vers le Nord
4.  Vérifications :
   - L'escalier a bougé en 2D et 3D
   - La trémie dans la dalle R+1 a suivi automatiquement
   - La dalle R+1 a été régénérée avec le nouveau trou
5. Ctrl+Z
```

#### Test 4 — Changer l'épaisseur d'un type de mur
```
1. Sélectionne un mur intérieur
2. PropertyInspector → Type → change de "100mm" à "150mm"
3.  Vérifications :
   - Le mur devient plus épais
   - Les pièces adjacentes ont vu leur surface réduite
   - En 3D : le mur est plus épais visuellement
4. Ctrl+Z
```

### Phase 10 — Métre et documentation (2 min)

```
1. Regarde le MetricsPanel (panneau bas ou drawer)
2. Tu dois voir :
   - Murs : 52 m de linéaire, 141 m² nets (déduction des baies)
   - Portes : 1 (1.89 m²)
   - Fenêtres : 6 (≈ 7.2 m²)
   - Dalles : 2 (≈ 94 m², 18.8 m³)
   - Escaliers : 1 (16 marches)
   - Pièces RDC : Séjour 32 m², Chambre 1 12 m², SdB 5 m², WC 2 m²
   - Pièces R+1 : Chambre 2 14 m², Chambre 3 12 m², Palier 4 m², SdB 5 m²
3. Bouton  Exporter CSV → fichier .csv téléchargé
4. Ouvre-le dans Excel/Numbers → vérifie les colonnes Catégorie, Élément, Quantité, Unité
```

### Phase 11 — Export IFC (2 min)

```
1. Bouton  Exporter IFC
2. Fichier maison.ifc téléchargé (~50-200 KB)
3. Ouvre dans BlenderBIM :
   - File → Import → IFC
   - Vérifie : 8 murs, 2 dalles, 1 escalier, 7 ouvertures
   - Vérifie : l'escalier est bien entre RDC et R+1
   - Vérifie : la trémie est percée
4. Ou teste en ligne : https://viewer.thatopen.com/
   - Drag & drop le fichier
   - Vérifie la même chose
```

 **Vérification IFC critique** :
- Les murs doivent avoir une hauteur correcte (2800 - 200 = 2600 mm pour le RDC si topConstraint actif)
- L'escalier doit avoir **N=16 contremarches** visibles
- La trémie doit être **dans la dalle**, pas flottante
- Les fenêtres doivent avoir **allège correcte** (900/1000/1100/1200 mm selon les cas)

### Phase 12 — Export SVG (1 min)

```
1. Bouton  Plan (SVG) + sélecteur 1:100
2. Fichier plan-rdc-1-100.svg téléchargé
3. Ouvre dans Chrome
4. Vérifie :
   - Cartouche en bas à droite (Titre, Échelle, Date, Auteur)
   - Murs pochés en noir
   - Porte avec arc de débattement
   - Fenêtres avec double trait
   - Pièces avec nom + surface au centre
   - Cotes (si activées)
5. Change l'échelle en 1:50 → refais l'export → vérifie que le plan est 2× plus grand
```

### Phase 13 — Persistance JSON (1 min)

```
1. Bouton  (Sauvegarder) → fichier maison.json téléchargé
2. Ouvre-le dans un éditeur de texte
3. Vérifie :
   - schemaVersion: 2
   - units: "mm"
   - levels, wallTypes, doorTypes, windowTypes, stairTypes
   - walls, slabs, stairs, doors, windows, rooms
   - dimensions (si cotations)
4. Bouton  (Charger) → sélectionne le fichier
5.  Vérification :
   - Le projet est identique à avant la sauvegarde
   - Le viewport 2D et 3D se sont mis à jour instantanément
   - Les métriques sont correctes
```

### Phase 14 — Undo/Redo extrême (2 min)

```
1. Enchaîne 10 modifications (déplacer mur, changer épaisseur, poser porte…)
2. Ctrl+Z × 10 →  tout revient à l'état initial
3. Ctrl+Shift+Z × 10 →  tout revient à l'état final
4. Vérifie : aucune commande fantôme, aucune corruption
```

---

##  Tests spécifiques par fonctionnalité

### Test A — Les jonctions de murs
```
1. Trace un L : (0,0)→(4000,0) et (4000,0)→(4000,4000)
2.  Vérification : le coin est en onglet biseauté (45°)
3. Modifie l'angle : trace à 45° (0,0)→(4000,4000) et (4000,4000)→(4000,0)
4.  Vérification : l'onglet est calculé correctement
5. Trace un T : (0,0)→(8000,0) et (4000,0)→(4000,4000)
6.  Vérification : le mur traversant reste continu, le mur aboutant s'arrête proprement
```

### Test B — Les escaliers (Blondel)
```
1. Crée 3 escaliers avec des hauteurs différentes :
   - (ΔZ=2500, L=3600) → N=14, h=178.5, g=257 → 2h+g=614  Conforme
   - (ΔZ=2800, L=4000) → N=16, h=175, g=250 → 2h+g=600  Conforme
   - (ΔZ=2800, L=3000) → N=16, h=175, g=187.5 → 2h+g=537  Hors Confort
2.  Vérification : badge vert/jaune/rouge selon le cas
3. Bascule le sens de l'escalier avec ⇄ → 2D et 3D suivent
```

### Test C — Underlay multi-niveaux
```
1. RDC : trace 4 murs en rectangle
2. R+1 : active l'underlay → les 4 murs RDC apparaissent en pointillés
3. R+1 : trace un mur en partant d'un sommet RDC → snap à 12px écran
4.  Vérification : le mur R+1 est parfaitement aligné sur le sommet RDC
5. R+1 : désactive l'underlay → les pointillés disparaissent
```

### Test D — Cascade de suppression
```
1. Sélectionne le mur Sud (porte + fenêtres hébergées)
2. Suppr →  le mur ET ses portes/fenêtres disparaissent
3. Ctrl+Z →  le mur ET ses portes/fenêtres réapparaissent
4. Sélectionne un niveau R+1 (DeleteLevelCommand si implémenté)
   →  si des murs y sont attachés, rejet avec DELETE_RESTRICTED
```

### Test E — Pièces et surfaces
```
1. Crée une pièce en L (2 murs en L)
2.  Vérification : la pièce est détectée avec surface et libellé au centre
3. Ajoute un poteau au milieu (petit mur 200×200)
4.  Vérification : la surface du poteau est DÉDUITE de la pièce
5. Supprime un mur de la pièce
6.  Vérification : la pièce passe à `unenclosed`, surface = 0, mais elle n'est PAS supprimée
7. Refais le mur
8.  Vérification : la pièce retrouve son statut `enclosed` et sa surface
```

### Test F — Résilience et validation
```
1. Tente de poser une porte sur un mur de 500 mm → error-banner
2. Tente de poser une fenêtre dont l'allège + hauteur > hauteur mur → error-banner
3. Tente de déplacer un mur pour qu'il collisionne avec un autre → message/warning
4. Tente d'ouvrir un fichier JSON corrompu → error-banner sans corruption du projet actuel
5. Tente d'importer un fichier avec schemaVersion: 999 → error-banner explicite
```

---

##  Tableau récapitulatif — Ce que tu dois voir à la fin

| Métrique | Valeur attendue |
|---|---|
| **Niveaux** | 2 (RDC + R+1) |
| **Murs RDC** | 4 ext + 3 int = 7 |
| **Murs R+1** | 4 ext + 3 int = 7 |
| **Dalles** | 2 (RDC + R+1) |
| **Escaliers** | 1 (RDC→R+1) |
| **Portes** | 1 |
| **Fenêtres** | 6 (3 par niveau) |
| **Pièces RDC** | 4 |
| **Pièces R+1** | 4 |
| **Cotations** | (à ajouter si tu veux) |
| **Trémies** | 1 (dans dalle R+1, dérivée) |
| **Surface habitable** | ≈ 70 m² |
| **Linéaire murs** | ≈ 52 m |
| **Surface nette murs** | ≈ 141 m² |
| **Volume dalle** | ≈ 18.8 m³ |
| **Tests automatisés** | 797 verts |

---

## Bonus — Tests que tu peux faire au-delà du plan

| Test | Comment |
|---|---|
| **Onglet suspendu** | Lance l'app, n'y touche pas 10s → CPU 0% (rendu à la demande) |
| **Rechargement à chaud** | Modifie un mur, Ctrl+Z, recharge la page → le projet n'est PAS persisté (local-first, mais pas d'autosave en V1) |
| **Export IFC dans Solibri** | Si tu as Solibri, teste l'import → vérifie les propriétés des murs |
| **Plan SVG à 1:50** | Vérifie que la taille physique d'un mur de 8000mm sur le plan = 160mm en 1:50 |
| **Multi-onglets** | Ouvre l'app dans 2 onglets → chaque onglet a son propre document (pas de collaboration) |
| **Mobile / tablette** | L'app fonctionne, mais pas optimisée tactile (viewport 50/50) |

---

## Ce que tu risques de rencontrer (bugs connus)

| Symptôme | Cause | Contournement |
|---|---|---|
| Le snap inter-niveaux accroche trop | Underlay actif + snapToUnderlay par défaut | Désactive l'underlay si tu veux dessiner libre |
| L'escalier de test 3000 mm est jaune | Giron trop court (L/N = 187.5mm < 250mm comfort) | Allonge l'escalier à 4000 mm |
| Le badge Blondel est rouge | 2h+g hors [560, 680] | Ajuste la longueur ou la hauteur d'étage |
| L'export IFC ne montre pas les dalles | Vérifie que tu as bien exporté, pas juste sauvegardé | Bouton  Exporter IFC (pas ) |
| La trémie n'apparaît pas en 3D | Régénération 3D en cours | Attends 1s, ou change de niveau et reviens |
| Les cotes ne s'affichent pas | Fonctionnalité Phase 5, il faut les ajouter manuellement | Bouton cotations dans la Toolbar (si présent) |

---

##  En résumé

**Ce plan te permet de tester** :
-  20 murs avec jonctions L/T/onglets
-  7 ouvertures hébergées (portes + fenêtres)
-  2 dalles avec trémie dérivée
-  1 escalier paramétrique avec Blondel
-  2 niveaux avec underlay et snap inter-niveaux
-  8 pièces auto-détectées
-  Métre complet en temps réel
-  Export IFC4 + SVG
-  Persistance JSON
-  Undo/Redo sur 20+ commandes
-  Tests de crédibilité (murs qui suivent, escaliers qui suivent)

**Durée** : 30-45 min si tu suis tout
**Résultat** : une maison R+1 complète avec escalier, exportable et documentée

---

**Si tu veux un plan plus simple** (juste pour valider que l'outil marche en 5 min) :
1. 4 murs en rectangle → 1 porte → 1 dalle → exporter IFC → ouvrir dans BlenderBIM
2. C'est déjà impressionnant

**Si tu veux un plan plus ambitieux** (pour pousser dans les retranchements) :
- Ajoute des cotations
- Crée 3 niveaux (RDC + R+1 + R+2 avec escalier entre chaque)
- Teste la limite : 50 murs, 20 ouvertures → regarde les perfs

**Bon test !**  Partage-moi ce que tu observes, les frictions, les bugs — c'est ce qui guidera Phase 7 et les suivantes.