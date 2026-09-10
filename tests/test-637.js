const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

/* ⛔ CE QUE CE FICHIER GARDE, et pourquoi il est écrit comme une lecture du texte et non comme une
   exécution : load() n'est pas extractible (il lit localStorage, il recharge la page). Le défaut
   qu'on verrouille ici est un ORDRE D'OPÉRATIONS entre deux fonctions et un drapeau — il se lit.
   La preuve fonctionnelle, elle, est une sonde en navigateur qui appelle le VRAI teamopJoin :
   scratchpad/sonde-rejoindre.js. Mesuré le 10 septembre 2026, avant/après :
     avant → 160 produits, 2 box de démonstration, 2 devis, 5 fournisseurs ; fusion chez le client :
             220 fiches deviennent 380 et 110 noms passent en TRIPLE
     après → 0 partout ; la base du client reste à 220, aucun triplet. */

console.log('Rejoindre un espace remet l\'appareil VRAIMENT à neuf');
{ /* les deux portes : le lien de connexion et le Code espace */
  const portes=APP.split("localStorage.setItem('elan_frais','1')").length-1;
  v('deux chemins de rejointe',portes,2);
  const gardes=APP.split("localStorage.removeItem('elan_vierge_v1')").length-1;
  v('les deux retirent le drapeau du vidage unique',gardes,2);
  /* et ils le font APRÈS avoir retiré la base, jamais ailleurs dans le fichier */
  const bloc=/removeItem\(STORE_KEY\);[\s\S]{0,120}elan_frais[\s\S]{0,1600}?removeItem\('elan_vierge_v1'\)/g;
  v('chaque garde suit bien le retrait de la base',(APP.match(bloc)||[]).length,2);
  v('la raison est écrite à côté',/Restaurant Le Gourmet/.test(APP),true); }

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
