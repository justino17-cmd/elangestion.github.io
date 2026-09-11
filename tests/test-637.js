const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
const ESP=fs.readFileSync(__dirname+'/../espace.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

/* ⛔ CE QUE CE FICHIER GARDE, et pourquoi il est écrit comme une lecture du texte et non comme une
   exécution : load() n'est pas extractible (il lit localStorage, il recharge la page). Le défaut
   qu'on verrouille ici est un ORDRE D'OPÉRATIONS entre deux fonctions et un drapeau — il se lit.
   La preuve fonctionnelle, elle, est une sonde en navigateur qui appelle le VRAI teamopJoin :
   scratchpad/sonde-rejoindre.js. Mesuré le 10 septembre 2026, avant/après :
     avant → 160 produits, 2 box de démonstration, 2 devis, 5 fournisseurs ; fusion chez le client :
             220 fiches deviennent 380 et 110 noms passent en TRIPLE
     après → 0 partout ; la base du client reste à 220, aucun triplet. */

console.log('Quitter un espace remet l\'appareil VRAIMENT à neuf — les QUATRE portes');
{ /* v638 : le v637 ne couvrait que deux portes sur quatre. Le lien client (espace.html) et la
     fermeture par la Tour avaient exactement le même défaut, non corrigé. Les trois portes
     d'app.html passent désormais par UN SEUL chemin, espaceQuitter(), et espace.html — qui ne
     partage aucun code avec l'application — refait la même chose en clair. */
  v('espaceQuitter existe',/function espaceQuitter\(\)\{/.test(APP),true);
  v('elle lit le préfixe sur STORE_KEY, jamais écrit en dur',
    /const P=STORE_KEY\.split\('_'\)\[0\]\+'_';/.test(APP),true);
  /* Borné à la déclaration SUIVANTE, jamais à un nombre de caractères : la première version
     coupait à 1400 et a cessé de voir la fonction le jour où elle a grandi de dix lignes —
     quatre vérifications au rouge sur du code pourtant juste. Même leçon que l'extracteur
     des suites 638 à 640, voir tests/LISEZMOI.md. */
  const q=(APP.match(/function espaceQuitter\(\)\{[\s\S]*?\n\}\n(?=(?:async function |function |const |let |\/\*))/)||[''])[0];
  v('elle retire la base',/removeItem\(STORE_KEY\)/.test(q),true);
  v('elle retire le drapeau du vidage unique',/removeItem\(P\+'vierge_v1'\)/.test(q),true);
  v('elle pose le drapeau « frais » — sinon la synchro fait l\'union et POUSSE',/setItem\(P\+'frais','1'\)/.test(q),true);
  v('elle emporte les secrets et accès payants de l\'entreprise quittée',
    ['anthropic_key','devis_code','sync_cfg','espace_admin'].every(k=>q.indexOf("'"+k+"'")>=0),true);
  v('et les bases mises de côté',/deleteDatabase\(P\+'cote'\)/.test(q),true);
  const appels=APP.split(/\bespaceQuitter\(\);/).length-1;
  v('les trois portes d\'app.html y passent',appels,3);
  v('plus une seule sortie d\'espace qui retire la base à la main',
    (APP.match(/removeItem\(STORE_KEY\)/g)||[]).length,1);
  v('resetData() a disparu — elle rejouait le semis sur un appareil resté rattaché',
    /function resetData\(\)/.test(APP),false);
  /* La quatrième porte : le lien d'activation d'un client. C'est sa PREMIÈRE minute. */
  v('espace.html retire la base',/removeItem\('elan_gestion_v2'\)/.test(ESP),true);
  v('espace.html retire le drapeau du vidage unique',/removeItem\('elan_vierge_v1'\)/.test(ESP),true);
  v('espace.html pose le drapeau « frais »',/setItem\('elan_frais','1'\)/.test(ESP),true);
  v('la raison est écrite à côté, dans les deux fichiers',
    [/Restaurant Le Gourmet/.test(APP),/Restaurant Le Gourmet/.test(ESP)],[true,true]); }

console.log('Le semis porte bien ce qu\'on refuse de déverser chez un client');
{ /* si ces données disparaissaient du semis, la garde perdrait son objet — le test le dirait */
  v('le semis contient des box de démonstration',/Cuisine — Restaurant Le Gourmet/.test(APP),true);
  v('et le vidage couvre les box',/COLLECTIONS_DONNEES=\[[^\]]*'boxes'/.test(APP),true);
  v('et les produits',/COLLECTIONS_DONNEES=\[[^\]]*'produits'/.test(APP),true);
  v('le vidage est bien conditionné au drapeau',/if\(!localStorage\.getItem\('elan_vierge_v1'\)\)\{/.test(APP),true); }

console.log('La synchro du pack ne prétend plus protéger ce qu\'elle ne protège pas');
{ v('plus de {ancien:true} sur le geste de synchro',/cataloguePoser\(db,\{naissance:Date\.now\(\)\}\)/.test(APP),true);
  v('et le commentaire dit pourquoi',/estampiller\(\) date de MAINTENANT/.test(APP),true);
  /* ancien:true reste utile ailleurs — au semis du pack, où l'ombre est relevée juste après load() */
  v('l\'option existe toujours',/opts&&opts\.ancien\)\?\{_m:1\}/.test(APP),true); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
