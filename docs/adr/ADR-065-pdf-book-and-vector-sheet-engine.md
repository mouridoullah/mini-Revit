# ADR-065 : Moteur de Mise en Page & Carnet de Plans PDF Multi-Pages (PDF 1.4 Vectoriel Pur)

## Statut
Accepté

## Contexte
La Saison 3 de Mini-BIM vise à doter la plateforme d'une chaîne complète d'édition et de diffusion de livrables architecturaux professionnels. Après le moteur d'exportation DXF R12 1:1 (ADR-064), les maîtres d'œuvre, bureaux d'études et architectes doivent pouvoir générer un dossier de plans complet multi-pages imprimable et diffusable, intégrant page de garde, plans d'étages, coupes transversales, élévations et synthèse des métrés.

Dans le respect strict des principes fondateurs de Mini-BIM (local-first, zéro-dépendance externe lourde, performance temps réel et indépendance vis-à-vis de services cloud ou de bibliothèques tierces avec filigrane comme jsPDF ou PDFKit), nous devions concevoir un moteur d'assemblage et de rendu vectoriel PDF 1.4 natif en pur TypeScript.

## Décision

### 1. Moteur Vectoriel PDF 1.4 Pur TypeScript (`PdfWriter`)
Nous implémentons un générateur vectoriel PDF 1.4 autonome dans `packages/view-2d/src/pdf/` :
- **Conversion métrique exacte** : $1\text{ mm papier} = \frac{72}{25.4}\text{ pt} \approx 2.83464567\text{ pt}$.
- **Repère géométrique natif Y-up** : Origine (0, 0) en bas à gauche de la page, parfaitement alignée avec le repère cartésien BIM et CAO.
- **Primitives vectorielles élémentaires du flux PDF Content Stream** :
  - Déplacements et tracés : `m` (moveTo), `l` (lineTo), `c` (curveTo Bézier cubique), `h` (closePath).
  - Couleurs et styles : `RG` / `rg` (couleurs RGB de contour et de remplissage), `w` (épaisseur de trait), `d` (pointillés / tirets).
  - Opérateurs de rendu : `S` (stroke), `f` (fill), `B` (fill and stroke).
  - Masquage et isolation : `q x y w h re W n ... Q` (sauvegarde de contexte graphique et découpage strict de la zone de dessin protégée).
- **Polices Type 1 standard sans embarquement lourd** : Utilisation des polices PostScript universelles `/Helvetica` et `/Helvetica-Bold` avec `/Encoding /WinAnsiEncoding`.
- **Encodage Windows-1252 mono-octet (`win-ansi.ts`)** : Conversion déterministe en octets bruts `Uint8Array` pour préserver 100% de la typographie et des symboles français : `é`, `è`, `à`, `ç`, `ê`, `ù`, `î`, `ô`, `€`, `’`, `°`, `±`, `²`, `³`, `Ø`.
- **Table `xref` binaire stricte (ISO 32000-1)** : Calcul déterministe des offsets d'octets réels sur le flux `Uint8Array`, écriture d'entrées de 20 octets fixes (`0000000015 00000 n \n`), section `trailer`, mot-clé `startxref` et terminaison `%%EOF`.

### 2. Composition et Mise en Page Normalisée
Le moteur supporte les formats standard :
- **A4 Paysage** : $297 \times 210$ mm ($841.89 \times 595.28$ pt).
- **A3 Paysage** : $420 \times 297$ mm ($1190.55 \times 841.89$ pt).

Chaque planche comprend :
- Un cadre extérieur double fort et filet fin.
- Une zone de dessin protégée par découpage géométrique (`clipRect`), garantissant qu'aucune entité ne déborde sur les marges ni sur le cartouche.
- Un cartouche architectural normalisé ($155 \times 40$ mm) disposé dans l'angle inférieur droit, regroupant :
  - Titre du projet, intitulé de la planche, indice et révision, date et auteur.
  - Numérotation séquentielle normalisée `PL-XX / N`.
  - Échelle numérique normalisée (Auto, 1:50, 1:100, 1:200).
  - Échelle graphique graduée alternée noir/blanc (0 – 1m – 2m – 5m).
  - Flèche Nord architecturale bicolore avec rose des vents.

### 3. Ordonnancement des 4 Types de Planches
La fonction orchestratrice `generatePdfBook(doc, options)` assemble les feuillets dans l'ordre logique d'un dossier de permis de construire ou d'exécution :
1. **PL-01 : Page de garde & Sommaire général** : Grand en-tête architectural, titre de l'opération, bloc de synthèse des 9 indicateurs clés du bâtiment (nombre de niveaux, surface utile cumulée, murs, baies, dalles, toits, escaliers, coupes, linéaires MEP) et table des matières listant chaque planche avec son numéro et son échelle.
2. **PL-02..k : Planches Plans d'Étages** : Une planche par niveau (trié par altitude croissante), intégrant les dalles et trémies tiretées, les murs résolus avec poché gris et hachures 45°, les baies de portes (battants et arcs de rotation) et fenêtres (cadres et vitrages bleus), les escaliers (marches et ligne de foulée), les réseaux MEP colorés par système, les cotations violettes avec ticks 45°, les symboles de coupe ISO et les pastilles de pièces avec fond blanc opaque.
3. **PL-(k+1)..m : Planches Coupes & Élévations** : Rendu vectoriel dérivé directement du graphe topologique `SectionScene` (ADR-063), incluant la ligne de sol $Z=0$ avec hachures de terrain naturel, les symboles altimétriques triangulaires et cotes de niveaux, les projections fines d'arrière-plan, les coupes fortes avec hachures structurelles et les traversées de réseaux MEP.
4. **PL-N : Planche Synthèse des Métrés & Surfaces** : Calculé automatiquement via `computeLevelMetrics` de `@mini-bim/core`, comprenant 3 tableaux normalisés :
   - Tableau 1 : Récapitulatif par niveau architectural avec ligne de total général (linéaires de murs, surfaces nettes, volumes, nombre de portes et fenêtres, surface habitable).
   - Tableau 2 : Tableau détaillé des pièces (nom, niveau d'appartenance, surface habitable en m², périmètre en m).
   - Tableau 3 : Réseaux techniques MEP (système, domaine métier, linéaire total calculé en m).

### 4. Interface Utilisateur Cockpit Graphite
- Bouton **Carnet PDF** intégré dans la barre d'outils supérieure (`Toolbar.tsx`), accessible immédiatement à côté de l'export DXF.
- Modale interactive `ExportPdfModal.tsx` adoptant les tokens du thème sombre Graphite (`--bg-surface`, `--bg-elevated`, `--border-subtle`, `--accent-primary`), permettant de régler en un clic :
  - Le format de planche (A4 / A3 Paysage).
  - L'échelle architecturale (Auto / 1:50 / 1:100 / 1:200).
  - Le contenu à inclure (Page de garde, Plans d'étages, Coupes, Métrés).
  - Le titre du dossier, l'auteur et l'indice de révision.
- Téléchargement instantané du fichier `.pdf` vectoriel via `useBimExport.ts`.

### 5. Qualification Métrologique & Validation Automatisée (ADR-014)
- **Validateur strict de syntaxe PDF 1.4 (`packages/view-2d/src/pdf/pdf.test.ts`)** :
  - Vérification de la signature `%PDF-1.4` et du marqueur de fin `%%EOF`.
  - Absence absolue de valeurs corrompues (`NaN`, `Infinity`, `undefined`).
  - Validation octet par octet de la table `xref` : lecture des offsets, vérification du pointage exact sur `${id} 0 obj` pour chaque objet du document.
  - Vérification des dimensions `MediaBox` et du décompte des pages.
  - Validation sur document synthétique, sur la **Villa Complexe** et sur la maquette étalon **Immeuble R+4 complet** (9 planches A3, 6 niveaux, coupe et métrés, > 45 Ko vectoriel pur).
- **Test E2E Playwright (`smoke.spec.ts`)** : Test réel en navigateur Chromium validant le parcours complet (clic sur Carnet PDF, saisie des options dans la modale, validation, capture de l'événement de téléchargement et contrôle binaire du fichier PDF généré).

## Conséquences
- Mini-BIM dispose d'un moteur d'édition de carnets de plans autonome, sans aucune dépendance logicielle externe ni coût d'infrastructure.
- Fichiers PDF 1.4 vectoriels ultra-légers (< 60 Ko pour un immeuble complet R+4), nets à l'impression à n'importe quel facteur d'échelle, lisibles par 100% des lecteurs PDF et conformes aux exigences des dossiers d'architecture.
