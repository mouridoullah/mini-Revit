# SPÉCIFICATION TECHNIQUE DES MÉTRÉS ET QUANTITÉS (METRICS_SPEC.md)

**Statut :** Spécification de Référence — Phase 4  
**Date :** 14 novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Packages d'implémentation :** `@mini-bim/core`, `apps/web/src/components/MetricsPanel.tsx`

---

## 1. Principes Directeurs et Déduction des Baies

Le calcul des quantités et des surfaces est la pierre angulaire transformant un modeleur géométrique en un système BIM authentique.

1. **Conservation Rigoureuse des Surfaces :**  
   Toute ouverture (porte ou fenêtre) percée dans un mur hôte est intégralement déduite de la surface brute du mur pour produire la surface nette.
2. **Standardisation des Unités et Clarté des En-têtes :**  
   Les calculs internes s'effectuent strictement en millimètres ($\text{mm}$, $\text{mm}^2$, $\text{mm}^3$).  
   Les sorties utilisateur et l'exportation CSV affichent systématiquement les unités internationales usuelles de l'artisanat du bâtiment : mètres ($\text{m}$), mètres carrés ($\text{m}^2$), mètres cubes ($\text{m}^3$), et unités de comptage ($\text{u}$).

---

## 2. Formules et Preuves Arithmétiques

### 2.1 Murs et Ouvertures Hébergées

Pour un mur d'axe $\mathbf{P}_1 \to \mathbf{P}_2$, d'épaisseur $e$ et de hauteur $h$, accueillant $N$ ouvertures de dimensions $(w_i, h_i)$ :

$$\text{Longueur axiale} : L = \|\mathbf{P}_2 - \mathbf{P}_1\| \quad (\text{mm})$$
$$\text{Surface brute} : S_{\text{brute}} = L \times h \quad (\text{mm}^2)$$
$$\text{Surface totale des baies} : S_{\text{ouvertures}} = \sum_{i=1}^{N} (w_i \times h_i) \quad (\text{mm}^2)$$
$$\text{Surface nette} : S_{\text{nette}} = S_{\text{brute}} - S_{\text{ouvertures}} \quad (\text{mm}^2)$$
$$\text{Volume de maçonnerie} : V_{\text{net}} = S_{\text{nette}} \times e \quad (\text{mm}^3)$$

#### Preuve Numérique Formelle (Mur de 6 m avec 1 Porte et 1 Fenêtre) :

- Mur : $L = 6\,000\text{ mm}$, $h = 2\,800\text{ mm}$, $e = 200\text{ mm}$.
- Porte : $w_d = 900\text{ mm}$, $h_d = 2\,100\text{ mm} \implies S_d = 1\,890\,000\text{ mm}^2 = 1,89\text{ m}^2$.
- Fenêtre : $w_w = 1\,200\text{ mm}$, $h_w = 1\,400\text{ mm} \implies S_w = 1\,680\,000\text{ mm}^2 = 1,68\text{ m}^2$.
- **Calculs :**
  $$S_{\text{brute}} = 6\,000 \times 2\,800 = 16\,800\,000\text{ mm}^2 = 16,800\text{ m}^2$$
  $$S_{\text{ouvertures}} = 1,89 + 1,68 = 3,570\text{ m}^2$$
  $$S_{\text{nette}} = 16,800 - 3,570 = 13,230\text{ m}^2 = 13\,230\,000\text{ mm}^2$$
  $$V_{\text{net}} = 13\,230\,000 \times 200 = 2\,646\,000\,000\text{ mm}^3 = 2,646\text{ m}^3$$

### 2.2 Pièces et Volumes Habités

Pour une pièce délimitée par un polygone extérieur $\mathcal{P}_{\text{ext}}$ et $M$ anneaux intérieurs de poteaux $\mathcal{H}_j$ sous une hauteur de niveau $H_{\text{niveau}}$ :

$$\text{Surface utile} : S_{\text{pièce}} = \left| \mathcal{A}(\mathcal{P}_{\text{ext}}) \right| - \sum_{j=1}^{M} \left| \mathcal{A}(\mathcal{H}_j) \right| \quad (\text{mm}^2)$$
$$\text{Périmètre intérieur} : P_{\text{pièce}} = \mathcal{P}(\mathcal{P}_{\text{ext}}) + \sum_{j=1}^{M} \mathcal{P}(\mathcal{H}_j) \quad (\text{mm})$$
$$\text{Volume utile chauffé} : V_{\text{pièce}} = S_{\text{pièce}} \times H_{\text{niveau}} \quad (\text{mm}^3)$$

#### Preuve Numérique Formelle (Pièce Rectangulaire 4 m × 3 m d'Axe) :

- Épaisseur des murs : $200\text{ mm}$.
- Enveloppe extérieure brute : $4,2\text{ m} \times 3,2\text{ m} = 13,44\text{ m}^2$ (non pertinent pour l'habitation).
- **Nu intérieur fini :**
  $$L_{\text{int}} = 4\,000 - 2 \times 100 = 3\,800\text{ mm}$$
  $$l_{\text{int}} = 3\,000 - 2 \times 100 = 2\,800\text{ mm}$$
  $$S_{\text{int}} = 3,8\text{ m} \times 2,8\text{ m} = 10,640\text{ m}^2 = 10\,640\,000\text{ mm}^2$$
  $$P_{\text{int}} = 2 \times (3,8 + 2,8) = 13,20\text{ m}$$
  $$V_{\text{int}} = 10,640\text{ m}^2 \times 2,8\text{ m} = 29,792\text{ m}^3 = 29\,792\,000\,000\text{ mm}^3$$

---

## 3. Schéma et Spécification de l'Export CSV

Le bouton « Exporter CSV » de `<MetricsPanel />` génère un fichier texte conforme à la norme RFC 4180 avec encodage UTF-8.

### 3.1 Structure du Fichier

```csv
Catégorie,Élément,Quantité,Unité
Murs,Linéaire total,20.000,m
Murs,Surface nette totale,49.230,m²
Murs,Volume total,9.846,m³
Portes,Nombre total,1,u
Portes,Surface totale,1.890,m²
Fenêtres,Nombre total,1,u
Fenêtres,Surface totale,1.680,m²
Pièces,Surface utile totale,22.040,m²
Pièces,Séjour (Surface),22.04,m²
Pièces,Séjour (Périmètre),18.80,m
Pièces,Séjour (Volume),61.71,m³
```

### 3.2 Règles de Validité de l'Export

1. **Ligne 1 obligatoire :** `Catégorie,Élément,Quantité,Unité`.
2. **Colonne Unité :** Valeurs normalisées `m`, `m²`, `m³`, `u`.
3. **Format des Nombres :** Virgule flottante au format décimal point standardisé (ex: `13.230`).
