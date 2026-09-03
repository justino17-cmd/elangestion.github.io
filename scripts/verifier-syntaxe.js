/* Vérifie que chaque bloc <script> des pages livrées est du JavaScript analysable.
 *
 * Pourquoi ce fichier existe : le 3 septembre 2026, un commentaire « // » inséré au milieu
 * d'une instruction tenant sur une seule ligne a transformé la fin de cette ligne — dont une
 * accolade fermante — en commentaire. app.html a cessé d'être analysable et la page est restée
 * BLANCHE en production pour toutes les entreprises. Les tests de l'époque vérifiaient le
 * comportement de fonctions simulées ; aucun ne vérifiait que le fichier livré parsait encore.
 *
 * Usage : node scripts/verifier-syntaxe.js
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const pages = fs.readdirSync(RACINE).filter(f => f.endsWith('.html')).sort();
const BLOC = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

let erreurs = 0, blocs = 0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(RACINE, page), 'utf8');
  let m, n = 0;
  while ((m = BLOC.exec(html))) {
    n++; blocs++;
    const code = m[1];
    try { new Function(code); }
    catch (e) {
      // « await » à la racine d'un module est légitime : on retente dans un contexte async
      try { new Function('return (async () => {' + code + '})'); }
      catch (e2) {
        erreurs++;
        const avant = html.slice(0, m.index).split('\n').length;
        console.error('✗ ' + page + ' — bloc <script> n°' + n + ' (vers la ligne ' + avant + ') : ' + e2.message);
      }
    }
  }
}
console.log((erreurs ? '✗' : '✓') + ' ' + pages.length + ' pages, ' + blocs + ' blocs <script> inline, ' + erreurs + ' en erreur');
process.exit(erreurs ? 1 : 0);
