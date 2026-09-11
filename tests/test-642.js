/* ⛔ CE QUE CE FICHIER GARDE — le semis de démonstration ne doit JAMAIS entrer chez un client.

   Constaté chez ELAN le 11 septembre 2026, capture à l'appui : « Mes demandes » affichait
   DC-2026-001 · « Cuisine — Restaurant Le Gourmet », DEUX FOIS. Reproduit au navigateur sur le
   fichier livré, en posant l'état exact (scratchpad/banc/sonde-semis.js) :

     drapeau de vidage présent + base locale absente + appareil rattaché
       avant → 160 produits, 2 box de démonstration, 2 devis, 2 factures, 5 fournisseurs
       après → 0 partout

   Le défaut tenait à un ET manquant. « Pas de base → semis » et « on ne vide qu'une fois dans
   la vie de l'appareil » sont sûrs ENSEMBLE tant que « pas de base » veut dire « appareil
   neuf ». Ce n'est pas vrai : une base disparaît aussi sur un appareil qui a servi — écriture
   refusée faute de place, stockage nettoyé, profil recréé. La synchro étant une UNION, le
   semis part alors chez toute l'équipe ; et `uid()` changeant à chaque passage, un second rejeu
   AJOUTE une copie au lieu de la remplacer — d'où les deux lignes identiques de la capture.

   ⚠️ Le contre-test compte autant : une garde qui bloque TOUT ne vaut rien. Un appareil
   vraiment neuf doit toujours découvrir l'application avec sa démonstration. Les trois cas sont
   joués au navigateur par scratchpad/banc/sonde-neuf.js — 6 ✓ 0 ✗ :
     appareil vraiment neuf        → 160 produits, 2 box   (la découverte est intacte)
     appareil rattaché             → 0 / 0
     appareil déjà utilisé         → 0 / 0                                                   */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Le semis n\'entre jamais dans la base d\'une entreprise');
{
  v('la garde existe, et elle vide les MÊMES collections que le drapeau',
    /if\(neuve && \(APPAREIL_DEJA_VU \|\| espaceRattache\(\)\)\) COLLECTIONS_DONNEES\.forEach\(c=>d\[c\]=\[\]\);/.test(APP), true);
  /* `neuve` dit « il n'y avait pas de base », sur les DEUX chemins — celui qui lit et celui qui
     rattrape une base illisible. Un seul des deux oublié, et le semis passe par l'autre. */
  v('« pas de base » est posé sur le chemin normal ET sur le rattrapage',
    (APP.match(/neuve=!raw;|catch\(e\)\{ neuve=true;/g)||[]).length, 2);
  /* Le rattachement se lit dans le stockage, PAS par syncTeam() : celle-ci est déclarée plus
     bas, et espaceHerite() n'a pas encore tourné quand load() décide. */
  v('le rattachement se lit sur le stockage, pas sur une fonction pas encore prête',
    /function espaceRattache\(\)\{ try\{ return !!String\(localStorage\.getItem\('elan_sync_team'\)\|\|''\)\.trim\(\); \}/.test(APP), true);
  v('…et il est défini AVANT load\\(\\), sinon il ne servirait à rien',
    APP.indexOf('function espaceRattache()') < APP.indexOf('function load(){'), true);
  /* ⛔ Le drapeau garde son rôle : ce n'est pas lui qu'on a changé, c'est la CONDITION du
     semis. Le retirer ici rouvrirait le défaut qu'il ferme (voir CLAUDE.md, elan_vierge_v1). */
  v('le drapeau de vidage est intact', /if\(!localStorage\.getItem\('elan_vierge_v1'\)\)\{/.test(APP), true);
  /* La preuve que le semis EXISTE encore : sans ça, la garde n'aurait plus d'objet et ce test
     passerait au vert sur une application qui ne sait plus se présenter. */
  v('le semis porte toujours ses deux box de démonstration',
    [/Cuisine — Restaurant Le Gourmet/.test(APP), /Réserve — Boulangerie Au Bon Pain/.test(APP)], [true,true]);
  v('…et la demande que la capture d\'ELAN montrait', /num:'DC-2026-001'/.test(APP), true);
}

console.log('\nUn bouton de box qui ne peut pas agir le DIT');
{
  /* ⛔ Le second défaut du même signalement d'ELAN : « impossible d'ajouter les produits dans
     les box ». Mesuré au navigateur (scratchpad/banc/sonde-bouton-box.js) — la box affichée
     absente de `db.boxes`, la feuille ne s'ouvre pas, AUCUN message, AUCUNE erreur : dix
     fonctions faisaient `if(!b) return;` en silence. On tape, rien ne se passe, et personne ne
     peut dire pourquoi — ni l'utilisateur, ni nous à distance.
       avant → feuille fermée, message AUCUN
       après → feuille fermée, « Cette box n'est plus dans ta base… », retour à la liste
     Le cas sain est inchangé : box présente → la feuille s'ouvre, sans message. */
  v('une seule fonction porte le message, pas dix copies',
    (APP.match(/function bxpBoxDite\(retour\)\{/g)||[]).length, 1);
  v('…et elle parle', /toast\('Cette box n\\'est plus dans ta base/.test(APP), true);
  /* `retour` n'est vrai que pour le bouton : ramener à la liste au milieu d'un geste déjà
     commencé dans la feuille serait pire que le silence. */
  v('le bouton de la box ramène à la liste', /function openBoxProduits\(\)\{ const b=bxpBoxDite\(true\);/.test(APP), true);
  v('les gestes DANS la feuille parlent sans ramener en arrière',
    (APP.match(/const b=bxpBoxDite\(\); if\(!b\) return;/g)||[]).length, 6);
  /* Les fonctions internes (bxpFeuille, bxpMajPied) restent muettes : elles sont appelées
     APRÈS que la box a été validée, et les faire parler doublerait le message. */
  v('les deux fonctions internes restent silencieuses, et c\'est voulu',
    (APP.match(/const b=bxpBox\(\); if\(!b\) return;/g)||[]).length, 2);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
