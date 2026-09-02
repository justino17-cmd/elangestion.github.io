// Génère data/data.js à partir des fichiers JSON de data/.
//
// Pourquoi un fichier généré plutôt qu'un fetch() : l'application démarre de
// façon synchrone (`let db = load()` au niveau supérieur, et load() a besoin du
// catalogue). Passer à un chargement asynchrone imposerait de restructurer tout
// le démarrage — un risque disproportionné sur une base sans test. Les données
// vivent donc en .json, éditables et lisibles en diff, et ce script produit le
// script classique que le navigateur charge avant js/app.js.
//
// Usage :  npm run build:data
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCES = [
  ['CATALOGUE',        'data/catalogue.json',        'Catalogue produits (biocides, matériel)'],
  ['REPORT_TEMPLATES', 'data/report-templates.json', 'Modèles d\'en-tête de rapport'],
  ['I18N',             'data/i18n.json',             'Traductions (en, es)']
];

const parts = SOURCES.map(([name, file, label]) => {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  return `/* ${label} — ${count} entrées · source : ${file} */\nconst ${name} = ${JSON.stringify(value)};`;
});

const out = `/* FICHIER GÉNÉRÉ — ne pas modifier à la main.
   Régénérer avec : npm run build:data
   Les sources éditables sont les .json de data/. */\n\n${parts.join('\n\n')}\n`;

writeFileSync('data/data.js', out);
console.log(`data/data.js écrit — ${out.length} octets`);
