---
name: apple-visual-craft
description: Visual taste and shape/material/typography reference from Apple's own design system (HIG, Liquid Glass) and from the App Store's most acclaimed craft — Things 3, Ivory, Fantastical, Arc, Apple Design Award winners — plus a resilience checklist for what actually breaks in production (text clipping at zoom, chips overflowing, colour-only badges, interrupted animations). Use alongside apple-design (which covers motion) whenever a screen's LOOK needs judging or redrawing — shape language, materials, type scale, color restraint, spacing, density — not just how it animates.
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

## 7. Résilience — ce qui casse une fois en production

Un écran beau en capture d'écran et cassé sur un vrai téléphone n'est pas un bon écran. Ces
règles viennent du skill `ui-ux-pro-max` (nextlevelbuilder, MIT) — la partie qui décrit les
pannes réellement observées, pas son générateur de design system.

- **Le texte essentiel doit refluer sans être coupé** : largeur étroite, zoom du navigateur,
  taille de police système augmentée, espacement forcé par l'utilisateur. Un libellé tronqué
  par `overflow:hidden` cache une information ; sur une fiche d'intervention, ça peut être le
  nom du client. Vérifier à 390px ET avec le zoom à 200 %.
- **L'équilibrage de titre (`text-wrap: balance`) est une amélioration, pas une garantie** :
  ne jamais construire une mise en page qui suppose qu'un mot précis restera sur la dernière
  ligne. Le navigateur peut l'ignorer.
- **Les listes de chips et de tags s'enroulent, ou proposent un `+n` cliquable.** Jamais une
  rangée qui déborde en silence hors de l'écran — c'est le piège classique des filtres.
- **Le sens d'un badge ne peut pas reposer sur la seule couleur.** Un statut « Terminée » vs
  « Annulée » doit rester distinguable en niveaux de gris, et lisible par un daltonien : il
  faut le mot, pas juste la pastille verte ou rouge.
- **Une interaction rapide peut annuler une animation, mais l'état final doit rester juste.**
  Si l'utilisateur tape deux fois vite sur « retour », la transition saute — c'est acceptable ;
  ce qui ne l'est pas, c'est de se retrouver sur le mauvais écran, avec le focus perdu ou un
  contenu à moitié rendu. C'est exactement le risque des transitions de vue directionnelles
  (`nav-avant` / `nav-retour`) : la classe est retirée sur `finished`, y compris quand une
  transition en interrompt une autre.

**Contrôle avant de dire « c'est fait »** (adapté du même skill) :

- [ ] contraste texte ≥ 4,5:1, **dans les deux thèmes** (`node scripts/verifier-theme.js`)
- [ ] état de focus visible au clavier sur tout ce qui est actionnable
- [ ] `prefers-reduced-motion: reduce` respecté, sans exception
- [ ] texte et chips qui refluent sans coupure, testés au zoom
- [ ] `cursor: pointer` sur tout ce qui se clique
- [ ] rendu vérifié à 390 px (téléphone), 768 px (tablette) et en largeur bureau

**Ce que ce skill dit et qui NE s'applique pas tel quel à TeamOP** : sa règle « aucun emoji
comme icône, uniquement du SVG ». TeamOP utilise délibérément les deux — des SVG via `fic()`
pour les onglets et la navigation, des emojis dans les listes, badges et fenêtres (🏢 client,
🧰 intervention, 🔑 note d'accès). C'est une identité assumée, lisible d'un coup d'œil sur le
terrain. Ne pas partir en croisade anti-emoji au nom de cette règle : la question à se poser
est « est-ce lisible et cohérent ? », pas « est-ce un SVG ? ».

## 8. Les deux thèmes — l'élévation se fait par la lumière, pas par l'ombre

En thème sombre, une ombre portée ne se voit pas : ce qui dit qu'une surface est « au-dessus »,
c'est qu'elle est **plus claire**. C'est la règle iOS, et Material la chiffre en voile blanc
(5 % à 1dp, 8 % à 2dp, 12 % à 8dp, 16 % à 24dp).

**TeamOP le fait déjà bien — ne pas le casser.** L'échelle est en place dans les deux sens :

| | sombre (défaut) | jour (option) |
|---|---|---|
| `--bg` (fond) | `#0D1624` | `#EEF1F6` |
| `--bg1` | `#16203A` | `#FFFFFF` |
| `--bg2` | `#1B2542` | `#F4F6FB` |
| `--bg3` | `#243154` | `#E7EBF3` |

Deux choses à en retenir :

- **Pas de noir pur.** `#0D1624` est un bleu très sombre, pas `#000000`. Le noir pur crée un
  contraste dur qui fatigue l'œil et fait « baver » le texte blanc (halation) sur écran OLED.
  Ne jamais « nettoyer » la palette en descendant vers le noir absolu.
- **Une couleur d'accent vive sur fond sombre doit être désaturée et éclaircie**, pas reprise
  telle quelle depuis le thème jour. Le même vert qui passe sur blanc devient criard sur
  `#0D1624` et tombe souvent sous 4,5:1. `scripts/verifier-theme.js` vérifie exactement ça,
  dans les deux thèmes — le lancer n'est pas optionnel.

## 9. La densité — un outil professionnel n'est pas une app grand public

La HIG d'Apple décrit surtout des apps de consommation. TeamOP est un **outil de travail** :
80 interventions, des tableaux, un planning, des listes longues. Le modèle à regarder ici,
c'est Linear, Superhuman, Notion, Stripe — des interfaces denses qui restent lisibles.

- **Hiérarchiser plutôt que supprimer.** Devant un écran chargé, la question n'est pas « qu'est-ce
  que j'enlève ? » mais « est-ce que ça pourrait rester, en plus petit, en moins contrasté, ou
  ailleurs ? ». Une information supprimée est une information que l'utilisateur ira chercher
  ailleurs — sur un chantier, c'est un appel téléphonique.
- **La graisse et la couleur portent la hiérarchie avant la taille.** C'est le geste
  Apple/Linear : plutôt que trois tailles de titre, un même corps en trois graisses et deux
  niveaux de gris. Échelle typographique resserrée pour une interface dense : ratio ~1,2
  (tierce mineure) entre les niveaux, pas 1,333.
- **Un tableau ou une liste bat une grille de cartes** dès que l'utilisateur doit *comparer* ou
  *balayer* — c'est le cas des interventions, du stock, du planning. Les cartes conviennent à
  un tableau de bord (peu d'éléments, hétérogènes), pas à 80 lignes homogènes.
- **Une grille d'espacement tenue est ce qui sépare le dense du chaotique.** 8px, subdivisions
  4px, sans exception locale — Linear tient toute son interface sur cette seule échelle.

## 10. Les trois états que personne ne dessine

Une analyse Nielsen Norman de 2025 sur 50 tableaux de bord générés par IA : **92 % sans état
vide, 78 % sans état d'erreur, 100 % avec un simple spinner** au lieu d'un vrai état de
chargement. Chez les designers humains, les trois sont soignés 7 fois sur 10. C'est
exactement l'écart entre « ça marche » et « c'est fini ».

- **Vide** — ne jamais afficher une zone vide muette. L'état vide explique ce qui devrait s'y
  trouver et donne le geste suivant. TeamOP a déjà `emptyState(ico, txt, btn, fn)` : l'utiliser
  partout, avec un bouton d'action quand il y en a un de sensé, pas seulement un message.
- **Chargement** — le squelette (contour gris de ce qui va arriver, pulsation discrète) bat le
  spinner : il annonce la forme du contenu, réduit le temps perçu d'environ 30 %, et évite le
  saut de mise en page quand les données arrivent. **TeamOP n'en a aucun aujourd'hui** — c'est
  un vrai manque sur une app qui synchronise. À réserver aux conteneurs (listes, tableaux,
  cartes) ; jamais sur un bouton, un champ, une fenêtre ou un toast.
- **Erreur / hors-ligne** — TeamOP est une PWA utilisée sur le terrain, souvent sans réseau.
  Un échec doit dire *ce qui s'est passé* et *ce que l'utilisateur peut faire*, pas afficher un
  code technique. Un travail non synchronisé doit se voir, sans affoler : l'app fonctionne
  hors ligne, c'est une fonctionnalité, pas une panne.

## 11. La main qui tient le téléphone

75 % des interactions sur téléphone se font au pouce. La carte d'atteinte a trois zones : le
**bas-centre** (facile, le pouce y repose), les **côtés à mi-hauteur** (il faut s'étirer), et
les **coins hauts** (difficile, il faut changer de prise ou la seconde main).

À savoir pour TeamOP, factuellement : la navigation passe par `.menu-btn`, qui ouvre la barre
latérale — et ce bouton est dans la barre du haut, donc **dans la zone la plus difficile à
atteindre à une main**. Sur un chantier, avec des gants, une main occupée, c'est le geste le
plus fréquent placé au pire endroit.

Ce n'est pas une consigne de tout refaire : déplacer la navigation est une décision de Justin,
pas d'un agent. Mais toute action **fréquente et primaire** ajoutée à un écran devrait aller
vers le bas de l'écran plutôt qu'en haut à droite, et cette contrainte doit peser dans le
jugement quand un écran est redessiné.

## 12. Ne pas avoir l'air d'une interface générée par une IA

Le skill officiel d'Anthropic (`anthropics/skills`, `frontend-design`) nomme cinq « défauts par
défaut » — les combinaisons vers lesquelles un modèle glisse tout seul quand on lui demande
« fais quelque chose de beau ». Les connaître, c'est pouvoir les refuser :

1. Fond crème (`#F4F1EA`) + serif contrasté + accent terracotta (`#D97757`)
2. Fond noir + accent vert acide ou vermillon
3. Mise en page « journal » : filets fins, zéro arrondi, colonnes denses
4. Le kit SaaS : des cartes toutes identiques, même rayon partout, ombres grises
5. Le chrome de gabarit : libellés EN MAJUSCULES, tirets espacés, monospace pour les données

Trois règles du même skill, qui valent pour TeamOP :

- **Puiser le vocabulaire visuel dans le métier**, pas dans les tendances. TeamOP, c'est du
  terrain, des tournées, du matériel. Pas une app de méditation.
- **Un élément structurel doit porter une information, pas décorer.** Une numérotation
  01/02/03 seulement si l'ordre compte vraiment ; un filet seulement s'il sépare deux choses
  réellement distinctes.
- **Le mouvement : un moment orchestré, pas des effets dispersés.** Mieux vaut une transition
  juste que six animations qui se disputent l'attention.

## 13. Typographie française — ce que les guides anglophones ne disent pas

Toutes les références de ce skill sont anglophones. Le français a des règles que ni la HIG ni
les Web Interface Guidelines de Vercel ne couvrent, et qui se voient à l'œil nu :

- **Espace insécable avant `: ; ! ?` et à l'intérieur des guillemets `« »`.** Sans elle, le
  navigateur peut renvoyer le `:` seul en début de ligne, ou séparer un guillemet de son mot.
  **Constat dans app.html : 428 guillemets français, zéro espace insécable.** C'est le défaut
  typographique le plus visible de l'interface aujourd'hui — `&nbsp;` (ou `&#8239;`, l'espace
  fine insécable, plus juste devant `: ; ! ?`) le corrige.
- **Un libellé français est plus long que son équivalent anglais** — « Revenir aux
  interventions » contre « Back ». Toute grille copiée d'une référence anglophone doit être
  élargie, pas reprise telle quelle.
- Ellipse `…` en un seul caractère, jamais trois points ; et `font-variant-numeric:
  tabular-nums` sur toute colonne de chiffres pour qu'ils s'alignent — **déjà en place dans
  app.html (17 occurrences), à ne pas perdre en redessinant.**

**Où en est TeamOP sur la liste de Vercel** (vérifié, septembre 2026) : `touch-action` (17),
`tabular-nums` (17), `inputmode` (22), `color-scheme` (13), `theme-color` (2), et **zéro
`transition: all`** — la discipline est déjà là, inutile de refaire ce travail. Deux points
à surveiller seulement : `overscroll-behavior:contain` n'est posé qu'à deux endroits (à
étendre aux fenêtres modales, l'app en est pleine), et les espaces insécables ci-dessus.

## 14. Pour TeamOP précisément

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
- [12 principes du thème sombre — Uxcel](https://uxcel.com/blog/12-principles-of-dark-mode-design-627) et [iOS Dark Mode : 8 règles pratiques](https://irisapp.cc/ios-dark-mode-design-8-practical-guidelines-for-better-contrast-and-readability/)
- [Interfaces denses : la hiérarchie bat le minimalisme](https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026) et [Designing for Data Density — Paul Wallas](https://paulwallas.medium.com/designing-for-data-density-what-most-ui-tutorials-wont-teach-you-091b3e9b51f4)
- [États vide / chargement / erreur — l'UX que l'IA oublie](https://blog.vibecoder.me/empty-states-loading-states-error-states) (chiffres NN/g 2025) et [Carbon Design System — patterns loading et empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)
- [La zone du pouce — Juno School](https://www.junoschool.org/article/thumb-zone-design-one-handed-use/)
- [anthropics/skills — `frontend-design`](https://github.com/anthropics/skills) — les cinq « défauts par défaut » de l'IA (section 12)
- [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) — liste de contrôle web, sans framework. Largement déjà respectée par TeamOP (section 13) ; ses règles React/Next.js ne s'appliquent pas ici.
- [ui-ux-pro-max-skill — nextlevelbuilder (MIT)](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — section 7 uniquement (résilience du texte, anti-patterns, contrôle avant livraison). Son générateur de design system (192 palettes, 79 styles, 74 paires de polices) est délibérément écarté : TeamOP a déjà sa marque et sa discipline de couleur, en importer un catalogue les diluerait.
