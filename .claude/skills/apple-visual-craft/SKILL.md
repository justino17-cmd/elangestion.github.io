---
name: apple-visual-craft
description: Visual taste and shape/material/typography reference from Apple's own design system (HIG, Liquid Glass) and from the App Store's most acclaimed craft — Things 3, Ivory, Fantastical, Arc, Apple Design Award winners. Use alongside apple-design (which covers motion) whenever a screen's LOOK needs judging or redrawing — shape language, materials, type scale, color restraint, spacing, density — not just how it animates.
---

# Le métier du beau — références Apple et grands studios

`apple-design` dit comment une interface **bouge**. Ce skill-ci dit comment elle **est
dessinée** : formes, matières, typographie, couleur, densité. Les deux ensemble sont le
vocabulaire complet d'un écran qui « sonne Apple ». Sourcé en septembre 2026 — HIG, WWDC 2025
(Liquid Glass), et ce que publient ou montrent les studios cités plus bas.

## 1. La forme — concentricité, pas juste des coins arrondis

Depuis iOS 7 (2013), l'icône d'app n'est **pas** un rectangle à coins arrondis : c'est une
superellipse (« squircle »), `|x/a|ⁿ + |y/b|ⁿ = 1`, où la courbure reste continue tout le long
du contour — elle ne saute jamais d'un bord droit à un arc de cercle. C'est ce qui fait qu'un
coin Apple a l'air *soufflé*, pas *découpé*. Le CSS `border-radius` classique n'a pas cette
continuité (courbure discontinue aux jonctions bord/arc) ; `corner-shape: superellipse(n)` (CSS
2025+) ou un chemin SVG en Bézier tuné s'en approchent. Sans ce support, un `border-radius`
généreux (14–20px sur une carte, 10–12px sur un bouton) reste le compromis correct.

**Concentricité** (principe central de Liquid Glass, WWDC 2025) : un contrôle niché dans un
autre doit épouser la même courbure, à l'échelle. Un bouton dans une carte, une carte dans un
panneau : leurs rayons doivent être visuellement imbriqués, pas juste « arrondis chacun de son
côté ». Une carte à 16px de rayon avec un bouton interne à 6px colle mal ; 16px dehors et
`16 - padding` dedans épouse.

## 2. La matière — Liquid Glass, sans le copier au pixel près

WWDC 2025 a introduit Liquid Glass : une couche translucide qui plie et réfracte la lumière de
ce qu'il y a dessous, en temps réel, et qui répond au mouvement. Trois principes portables au
web, indépendamment du rendu exact :

- **Hiérarchie** : les contrôles élèvent le contenu, ils ne lui font pas concurrence. Une barre
  d'outils flottante en verre au-dessus d'une liste ; jamais un fond opaque qui coupe le
  contenu en deux zones figées.
- **Harmonie** : l'interface épouse le matériel et le contexte, pas l'inverse. Un panneau qui se
  fond dans ce qu'il survole (`backdrop-filter: blur() saturate()`, déjà utilisé sur
  `.topbar` dans app.html) plutôt qu'un aplat de couleur posé dessus.
- **Consistance** : les mêmes motifs partout, prévisibles, pour ne pas faire réfléchir
  l'utilisateur à chaque écran. C'est l'argument pour NE PAS inventer un nouveau style de carte
  par écran.

Ce que ça ne veut PAS dire pour TeamOP : imiter Liquid Glass au pixel près serait un travail de
plateforme natif (SwiftUI), hors de portée d'une page web, et hors sujet — la marque de TeamOP
(vert OP GESTION, bleu nuit TEAM OP) doit rester lisible, pas noyée sous du verre neutre. On
prend le PRINCIPE (hiérarchie, harmonie, consistance), pas la texture littérale.

## 3. Typographie — l'échelle système, un plancher de lisibilité

Échelle Dynamic Type d'Apple (SF Pro), à utiliser comme grille de référence même hors iOS :

| Rôle | Taille | Graisse |
|---|---|---|
| Large Title | 34pt | Regular/Bold |
| Title 1 | 28pt | Regular/Bold |
| Title 2 | 22pt | Regular/Bold |
| Title 3 | 20pt | Semibold |
| Headline | 17pt | Semibold |
| Body | 17pt | Regular — **plancher de lisibilité, jamais en dessous pour du texte lu** |
| Callout | 16pt | Regular |
| Subhead | 15pt | Regular |
| Footnote | 13pt | Regular |
| Caption | 11–12pt | Regular |

Sur le terrain (soleil, écran mouillé, gants), le corps de texte ne descend jamais sous 15px web
(≈ Body/Callout). Un titre grandit ET se resserre en tracking (`letter-spacing` négatif léger) à
mesure qu'il monte en taille — déjà fait sur `.topbar h1` dans app.html
(`clamp(19px,1.9vw,23px); letter-spacing:-.022em`), c'est la bonne référence à reproduire
ailleurs, pas à réinventer.

## 4. Couleur — une base neutre, un seul accent

Palette système Apple : `systemBlue/Red/Orange/Yellow/Green/Teal/Indigo/Purple/Pink` plus
`systemGray` à `systemGray6`, chacune adaptative clair/sombre. Le principe qui compte plus que
les teintes : **une base neutre (fonds, texte, bordures en gris) + un seul accent qui porte le
sens** (statut, action principale, sélection). Ajouter une deuxième couleur « décorative » dilue
la première — c'est déjà la discipline de TeamOP (vert OP GESTION comme unique accent, jamais
deux couleurs vives sur le même écran) : la tenir, pas la relâcher en « embellissant ».

## 5. Espace — grille 8pt, cible tactile 44×44pt

- Grille de référence à 8px, subdivisions à 4px pour les petits ajustements (pas un mandat
  Apple officiel, mais la convention universelle qui en découle).
- **Cible tactile minimale : 44×44pt.** Sur OP GESTION — utilisé au doigt, parfois ganté,
  jamais à la souris sur le terrain — c'est un plancher dur, pas une suggestion. Vérifier
  chaque bouton, chaque ligne de liste cliquable.
- « Quand un écran semble mal habillé, la correction est presque toujours plus de marge, pas
  plus de contenu. » La personnalité vient de l'espacement et de la hiérarchie, pas de la
  variété des composants.

## 6. Ce que les grands studios enseignent, chacun une leçon différente

Ne pas copier ces apps visuellement — TeamOP a sa propre identité. Les lire pour la manière de
penser, pas pour le pixel.

- **Things 3 (Cultured Code)** — le contenu passe avant le chrome. Une tâche s'affiche comme du
  texte nu sur un fond neutre ; les métadonnées (tags, date, sous-tâches) n'apparaissent que si
  elles existent, jamais un champ vide affiché par principe. Beaucoup de blanc, une seule
  couleur d'accent par liste. Leçon pour TeamOP : une intervention sans note ne doit pas
  montrer un bloc « Note » vide.
- **Ivory (Tapbots)** — la personnalité passe par la couleur, le son, l'animation ; la
  typographie, les contrôles et la navigation restent ceux de la plateforme. Résultat :
  reconnaissable ET jamais dépaysant. Leçon : ne pas inventer un bouton retour personnalisé
  quand le motif standard (`← Libellé`) suffit déjà et qu'il est partout ailleurs dans l'app.
- **Fantastical (Flexibits)** — la hiérarchie se fait par la taille et la graisse du texte
  (grands libellés de mois, séparateurs de jour plus épais), pas par des cadres ou des fonds
  colorés. Accepter de perdre un peu de densité (3-4 lignes en moins à l'écran) pour que
  l'œil scanne plus vite est un compromis délibéré, pas un défaut.
- **Arc (The Browser Company)** — le soin est pesé aussi lourd que l'ingénierie, et
  l'inspiration vient d'ailleurs que la tech (cinéma, jeu vidéo) pour l'onboarding et le
  rythme, pas seulement d'autres apps professionnelles. Leçon : le premier écran après
  connexion mérite le même soin que l'écran le plus utilisé.
- **Apple Design Awards** — la liste change chaque année (juin) et reste la référence la plus
  fiable de ce qu'Apple elle-même considère comme la meilleure exécution du moment, toutes
  catégories (Interaction, Visuals and Graphics, Delight and Fun…). Revoir les gagnants de
  l'année en cours avant une refonte importante plutôt que de se fier à une mémoire datée —
  le style qui gagne change d'une année à l'autre (skeuomorphisme → flat → glass).

## 7. Pour TeamOP précisément

- Priorité au terrain, pas au bureau : lumière du jour, une main, parfois un gant, jamais une
  souris. La cible 44×44pt et le plancher de 15px de corps de texte priment sur toute
  esthétique qui les grignoterait.
- Le vert OP GESTION et le bleu nuit TEAM OP restent les seuls accents — Liquid Glass et la
  concentricité s'appliquent à la FORME (rayons, matières, hiérarchie), jamais comme prétexte
  à ajouter une couleur.
- Français partout, y compris dans le jugement de densité : un libellé français est
  structurellement plus long qu'un équivalent anglais (« Revenir aux Interventions » vs
  « Back ») — la grille d'espacement doit absorber ça, pas être copiée telle quelle depuis une
  référence anglophone.

## Sources

- [Apple Design Awards 2025 — gagnants et finalistes](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/)
- [Apple Design Awards 2026 — gagnants](https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/)
- [Apple — Liquid Glass, WWDC 2025](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Liquid Glass : Hiérarchie, Harmonie, Consistance — createwithswift.com](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)
- [Apple Design System Breakdown — superdesign.dev](https://superdesign.dev/blog/apple-design-system)
- [Comment Apple utilise les squircles — squircle.js.org](https://squircle.js.org/blog/squircles-in-apple-design)
- [Ivory : Playful Precision from Tapbots' 15-Year Craft Legacy — blakecrosley.com](https://blakecrosley.com/guides/design/ivory)
- [The New Fantastical Review — MacStories](https://www.macstories.net/reviews/the-new-fantastical-review/)
- [The Browser Company — design et craft — inverse.com](https://www.inverse.com/input/design/the-browser-company-arc-design-interview)
