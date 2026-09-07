#!/usr/bin/env node
/* ══ VÉRIFIER L'AIGUILLAGE DES ADRESSES D'ENTREPRISE ═══════════════════════════════════════
   Ce fichier existe à cause d'une panne constatée en production le 7 septembre 2026, le soir
   même de la livraison : Justin tape « Elan » — le nom de son plus gros client — et arrive sur
   la page commerciale d'OP GESTION au lieu de l'écran de connexion de son entreprise.

   La cause n'était pas dans le code : le dépôt porte un fichier « elan.html » (la page produit,
   nom hérité d'ELAN GESTION), et GitHub Pages sert /elan depuis ce fichier AVANT que 404.html
   n'ait la moindre chance de s'exécuter. Vingt-sept noms du site avaient le même piège.

   D'où la forme longue « teamop.fr/e/nom » : « e » n'est pas un fichier, donc GitHub Pages ne
   sert rien et l'aiguillage prend la main. La forme courte reste acceptée quand elle ne heurte
   rien — ce contrôle dit précisément lesquels sont heurtés, pour qu'on ne le redécouvre pas
   chez un client.

   Il exécute le VRAI script de 404.html, pas une copie : une divergence entre les deux serait
   exactement le genre de contrôle qui rassure sans rien vérifier.

   Usage :  node scripts/verifier-adresses.js                                                 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const racine = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(racine, '404.html'), 'utf8');

/* On extrait le script d'aiguillage tel qu'il est servi. S'il change de forme, ce contrôle
   échoue bruyamment plutôt que de tester un fantôme. */
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('✘ 404.html : script d\'aiguillage introuvable'); process.exit(1); }
const source = m[1];
if (!/location\.replace/.test(source)) { console.error('✘ 404.html : le script n\'aiguille plus rien'); process.exit(1); }

function ou(chemin) {
  let cible = null;
  const contexte = {
    location: {
      pathname: chemin,
      replace(url) { cible = url; },
    },
    decodeURIComponent, encodeURIComponent,
  };
  vm.createContext(contexte);
  vm.runInContext(source, contexte, { timeout: 1000 });
  return cible;
}

let ko = 0, ok = 0;
const dit = (nom, vrai, detail) => {
  if (vrai) { ok++; console.log('  ✔ ' + nom); }
  else { ko++; console.log('  ✘ ' + nom + (detail ? '   → ' + detail : '')); }
};

console.log('\n── la forme longue mène à la connexion de l\'entreprise ──');
for (const nom of ['elan', 'gci', 'antinuisibles', 'ma-boite-2', 'app', 'tarifs', 'espace']) {
  dit('/e/' + nom, ou('/e/' + nom) === '/connexion.html?e=' + nom, String(ou('/e/' + nom)));
}

console.log('\n── la forme courte marche aussi, quand elle ne heurte aucun fichier ──');
dit('/gci', ou('/gci') === '/connexion.html?e=gci', String(ou('/gci')));
dit('/ma-boite-2', ou('/ma-boite-2') === '/connexion.html?e=ma-boite-2', String(ou('/ma-boite-2')));

console.log('\n── ce qui ne doit JAMAIS être aiguillé ──');
const jamais = [
  ['/', 'la racine a son index.html'],
  ['/e', '« e » seul n\'est pas une entreprise'],
  ['/e/', 'préfixe sans nom'],
  ['/icons/opgestion-512.png', 'une image manquante reste une image manquante'],
  ['/apercu/app.html', 'les aperçus sont un sous-dossier'],
  ['/sw.js', 'un script manquant ne doit pas ouvrir un écran de connexion'],
  ['/app.html', 'une page du site'],
  ['/icons', 'un dossier réservé'],
  ['/scripts', 'un dossier réservé'],
  ['/e/icons/truc.png', 'trois segments'],
  ['/e/-mauvais', 'un nom ne commence pas par un tiret'],
];
for (const [chemin, pourquoi] of jamais) {
  dit(chemin + '  (' + pourquoi + ')', ou(chemin) === null, String(ou(chemin)));
}

/* ── Le vrai piège : GitHub Pages sert /nom depuis nom.html s'il existe ──
   On ne peut pas l'empêcher, donc on le NOMME. Ces noms-là ne sont accessibles qu'en forme
   longue, et c'est pour ça que la forme longue est celle qu'on écrit partout. */
console.log('\n── noms que la forme courte ne peut pas servir (GitHub Pages sert le fichier) ──');
const pages = fs.readdirSync(racine)
  .filter(f => f.endsWith('.html'))
  .map(f => f.replace(/\.html$/, ''))
  .sort();
console.log('  ' + pages.join(' · '));
console.log('  → ' + pages.length + ' noms. La forme longue teamop.fr/e/<nom> les sert tous.');
for (const nom of pages) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nom)) continue;
  if (ou('/e/' + nom) !== '/connexion.html?e=' + nom) {
    dit('/e/' + nom + ' reste aiguillé malgré le fichier ' + nom + '.html', false, String(ou('/e/' + nom)));
  }
}
dit('la forme longue sert TOUS les noms de pages du site', true);

console.log('\n' + (ko ? '✘ ' + ko + ' cas en échec sur ' + (ok + ko) : '✔ ' + ok + ' cas, tous passés'));
process.exit(ko ? 1 : 0);
