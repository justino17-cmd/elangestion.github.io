/* ⛔ CE QUE CE FICHIER GARDE — deux défauts signalés par ELAN le 11 septembre 2026.

   1. « ÇA NE SYNCHRONISE PAS ENTRE LES UTILISATEURS », « l'admin ne voit pas les stocks à jour ».
      `_syncTs` est le repère de réception : `if((d.ts||0)<=_syncTs) return;` — ce qui arrive de
      plus ancien que ce repère est IGNORÉ. Il était posé AVANT l'écriture. Tant qu'une écriture
      réussissait toujours, c'était juste. Le 11 septembre, les écritures ont échoué des heures :
      le repère avançait à CHAQUE tentative ratée, et l'appareil se mettait à ignorer tout ce que
      ses collègues publiaient — leurs documents paraissant plus anciens que ses propres échecs.
      Un appareil sourd, sans un mot. Le repère ne doit avancer que sur un ACCUSÉ.

   2. « POURQUOI LES DR VOIENT LES NOTIFICATIONS DE CERTAINS DR ». Un DR à qui personne n'est
      rattaché n'a pas de périmètre, et le repli lui montrait alors TOUT — donc les mouvements
      des équipes d'un autre DR. Celui qui avait des personnes rattachées était, lui, cloisonné :
      d'où le « certains » de la question. L'alerte exige désormais un lien EXPLICITE.
      ⚠️ Seules les ALERTES changent : ce qu'un DR a le droit de voir n'est pas touché. */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
function extraire(nom){ const i=APP.indexOf('function '+nom+'('); if(i<0) throw new Error('introuvable : '+nom);
  let j=APP.indexOf('{',i),p=0; for(let k=j;k<APP.length;k++){ const c=APP[k]; if(c==='{')p++; else if(c==='}'){ p--; if(p===0){ j=k; break; } } } return APP.slice(i,j+1); }

console.log('Le repère de synchro n\'avance que sur une écriture acquittée');
{
  /* Ordre des opérations dans le fichier livré : la valeur d'avant est gardée, puis rendue
     sur échec ET sur non-acquittement. Le texte est vérifié parce que la séquence vit dans
     une fonction asynchrone entremêlée de Firestore, non extractible telle quelle. */
  v('l\'ancienne valeur est gardée avant l\'écriture',
    /const ts=Date\.now\(\); const _tsAvant=_syncTs; _syncTs=ts;/.test(APP), true);
  v('elle est rendue quand l\'écriture échoue',
    /try\{ if\(_syncTs===ts\) _syncTs=_tsAvant; \}catch\(_e\)\{\}/.test(APP), true);
  v('elle est rendue aussi quand rien n\'est acquitté dans le délai',
    /* On vérifie la PROPRIÉTÉ, pas la mise en page : la restauration doit se trouver DANS le
       bloc des 15 secondes, avant qu'il se referme. Exiger les deux lignes COLLÉES rendait ce
       test faux dès qu'on ajoutait une ligne entre elles — ce qui est arrivé en y branchant le
       diagnostic automatique. Un test qui casse sur une mise en page ne garde rien. */
    /* Le délai n'est plus une constante depuis la v660 — il suit le poids de la base (une
       seconde par tranche de 50 Ko, plafonné à 45 s), parce que quinze secondes fixes étaient
       une vitesse minimale déguisée qui accusait à tort les grosses bases. On repère donc le
       bloc par la variable qui l'arme, pas par le nombre qui y était écrit. */
    (function(){ const fin=APP.indexOf('},_delai);'); if(fin<0) return 'bloc du delai introuvable';
      return APP.slice(Math.max(0,fin-1800),fin).indexOf('if(_syncTs===ts) _syncTs=_tsAvant;')>=0; })(), true);
  v('le repère sert bien à ignorer le plus ancien (la garde existe toujours)',
    /if\(\(d\.ts\|\|0\)<=\(_syncTs\|\|0\)\) return;/.test(APP), true);
  /* Le garde-fou `_syncTs===ts` : si une écriture PLUS RÉCENTE est passée entre-temps, on ne
     rembobine pas le repère sur celle-là — sinon on rejouerait des fusions déjà appliquées. */
  v('on ne rembobine que SON propre repère, jamais celui d\'une écriture plus récente',
    (APP.match(/if\(_syncTs===ts\) _syncTs=_tsAvant;/g)||[]).length, 2);
}

console.log('\nUn DR n\'est alerté que pour SES box');
{
  let db, currentUser;
  const fullName=u=>((u&&u.prenom||'')+' '+(u&&u.nom||'')).trim();
  eval(extraire('equipeDe')); eval(extraire('perimetreTechIds')); eval(extraire('perimetreUserIds'));
  eval(extraire('myTechId'));
  // `can` et `notifBoxOk` sont remplacés par des doublures minimales : ce test vise l'aiguillage
  // de notifBoxConcerne, pas la mécanique des droits (éprouvée ailleurs).
  let CAN_VALIDER=true; const can=c=>c==='validerDR'?CAN_VALIDER:false;
  const notifBoxOk=()=>true;   // un admin voit tout : la doublure le dit
  eval(extraire('notifBoxConcerne'));

  const dr={id:'dr1',prenom:'Alex',nom:'Huby',role:'dr',actif:true};
  const autre={id:'t9',prenom:'Zoe',nom:'Autre',role:'technicien',actif:true,drId:'dr2'};
  const sien={id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,drId:'dr1',techId:'TEC-1'};

  // DR SANS personne rattachée : plus d'alerte sur une box à laquelle rien ne le lie
  db={users:[dr,autre],techniciens:[]}; currentUser=dr;
  v('DR sans équipe : une box d\'un autre ne l\'alerte plus',
    notifBoxConcerne({id:'b1',techIds:['TEC-9'],userIds:[],respUserId:'dr2'}), false);
  v('…mais la box dont il est responsable l\'alerte toujours',
    notifBoxConcerne({id:'b2',techIds:[],userIds:[],respUserId:'dr1'}), true);
  v('…et celle où il est nommé aussi',
    notifBoxConcerne({id:'b3',techIds:[],userIds:['dr1'],respUserId:''}), true);

  // DR AVEC équipe : les box de son équipe l'alertent
  db={users:[dr,sien,autre],techniciens:[{id:'TEC-1',nom:'Marc Perpi'}]}; currentUser=dr;
  v('DR avec équipe : la box de son technicien l\'alerte',
    notifBoxConcerne({id:'b4',techIds:['TEC-1'],userIds:[],respUserId:''}), true);
  v('…et celle d\'une autre équipe ne l\'alerte pas',
    notifBoxConcerne({id:'b5',techIds:['TEC-9'],userIds:[],respUserId:'dr2'}), false);

  // Un administrateur garde TOUT
  const admin={id:'a1',prenom:'OP',nom:'Admin',role:'admin',actif:true};
  db={users:[admin],techniciens:[]}; currentUser=admin; CAN_VALIDER=false;
  v('un administrateur est alerté sur tout, sans exception',
    notifBoxConcerne({id:'b6',techIds:['TEC-9'],userIds:[],respUserId:'zz'}), true);

  // Un technicien : inchangé, seulement ses box
  const tech={id:'t1',prenom:'Marc',nom:'Perpi',role:'technicien',actif:true,techId:'TEC-1'};
  db={users:[tech],techniciens:[{id:'TEC-1',nom:'Marc Perpi'}]}; currentUser=tech; CAN_VALIDER=false;
  v('technicien : sa box l\'alerte', notifBoxConcerne({id:'b7',techIds:['TEC-1'],userIds:[],respUserId:''}), true);
  v('technicien : celle d\'un autre, non', notifBoxConcerne({id:'b8',techIds:['TEC-9'],userIds:[],respUserId:''}), false);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
