/* ⛔ CE QUE CE FICHIER GARDE — un périmètre qui se calcule VIDE ne masque jamais tout.

   Constaté chez ELAN le 11 septembre 2026 : un compte à « voir tout » affichait
   « 1 box (mes box) » alors que l'entreprise en compte une dizaine, et les techniciens ne
   voyaient plus les box. Le périmètre d'un chef/DR se déduit des FICHES TECHNICIENS des
   personnes rattachées à lui (techId, sinon fiche au même nom). Si AUCUNE ne se résout, le
   calcul rendait un ensemble VIDE — et un ensemble vide, passé à visibleBoxes, ne laisse
   passer aucune ligne. Une absence de donnée était lue comme une interdiction.

   Trois états, et il faut les trois :
     personne rattaché          → null  (pas de périmètre : on voit tout, comme avant)
     rattachés SANS fiche tech  → null  ← LE CORRECTIF (avant : ensemble vide = on ne voit rien)
     rattachés AVEC fiche tech  → les identifiants techniciens de l'équipe (cloisonnement réel)

   Le cloisonnement voulu par Justin le 10 septembre reste intact : dès qu'une personne
   rattachée a une fiche technicien, le périmètre existe et filtre. On ne rend de la
   visibilité que là où il n'y avait AUCUNE donnée pour en retirer. */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

/* Extraction des VRAIES fonctions du fichier livré — aucune reconstruction. */
function extraire(nom){ const i=APP.indexOf('function '+nom+'('); if(i<0) throw new Error('introuvable : '+nom);
  let j=APP.indexOf('{',i),p=0; for(let k=j;k<APP.length;k++){ const c=APP[k]; if(c==='{')p++; else if(c==='}'){ p--; if(p===0){ j=k; break; } } } return APP.slice(i,j+1); }

let db, currentUser;
const fullName=u=>((u&&u.prenom||'')+' '+(u&&u.nom||'')).trim();
eval(extraire('equipeDe'));
eval(extraire('perimetreTechIds'));

console.log('Un périmètre vide ne masque jamais tout');

const chef={id:'c1',prenom:'Alex',nom:'Huby',role:'chefEquipe',actif:true};

// 1) Personne n'est rattaché → pas de périmètre (comportement historique, inchangé)
{
  db={users:[chef,{id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true}],techniciens:[]};
  currentUser=chef;
  v('personne rattaché → null (on voit tout)', perimetreTechIds(chef), null);
}

// 2) LE CORRECTIF — des personnes rattachées, mais AUCUNE fiche technicien à leur nom
{
  db={users:[chef,{id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,chefId:'c1'}],techniciens:[]};
  currentUser=chef;
  v('rattachés SANS fiche technicien → null, pas un ensemble vide', perimetreTechIds(chef), null);
}

// 3) Le cloisonnement voulu reste entier dès qu'une fiche existe
{
  db={users:[chef,{id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,chefId:'c1',techId:'TEC-1'}],
      techniciens:[{id:'TEC-1',nom:'Marc Perpi'}]};
  currentUser=chef;
  const p=perimetreTechIds(chef);
  v('rattaché AVEC fiche technicien → un périmètre réel', p&&[...p], ['TEC-1']);
  v('…et ce n\'est pas null : le filtrage s\'applique bien', p===null, false);
}

// 4) La fiche retrouvée par le NOM compte aussi (pas seulement par techId)
{
  db={users:[chef,{id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,chefId:'c1'}],
      techniciens:[{id:'TEC-9',nom:'Marc Perpi'}]};
  currentUser=chef;
  const p=perimetreTechIds(chef);
  v('fiche retrouvée par le nom → périmètre réel', p&&[...p], ['TEC-9']);
}

// 5) Un administrateur n'est jamais cloisonné
{
  const admin={id:'a1',prenom:'OP',nom:'Admin',role:'admin',actif:true};
  db={users:[admin,{id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,chefId:'a1'}],techniciens:[]};
  v('administrateur → null, toujours', perimetreTechIds(admin), null);
}

// 6) La garde est bien dans le fichier livré
v('le correctif est présent dans app.html', /if\(!ids\.size\) return null;/.test(APP), true);

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
