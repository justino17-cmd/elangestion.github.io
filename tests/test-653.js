/* ⛔ CE QUE CE FICHIER GARDE — l'application dit ELLE-MÊME quand sa synchro ne part pas.

   Justin, 11 septembre 2026 : « c'est à nous de trouver les problèmes, ce n'est pas normal de
   leur faire faire ça ». Demander à quelqu'un chez un client de coller une commande dans une
   console n'est pas un diagnostic, c'est un aveu — et ça se paie devant son propre client.

   Toute la journée s'est jouée là : les appareils savaient ce qui n'allait pas (base vide,
   écoute coupée, écriture refusée, mauvais espace), personne ne le leur a demandé, et il a
   fallu des captures d'écran pour reconstituer ce que le code pouvait dire en une phrase.

   L'appareil remonte donc son état par le canal qui existe déjà (tmPush → /api/bug), visible
   dans la Tour et envoyé par mail. Deux déclencheurs : aucun premier instantané après 25 s, et
   une écriture non acquittée au bout de 15 s.

   ⛔ ET IL NE REMONTE QUE DES COMPTEURS. Pas un nom de client, pas une adresse, pas un libellé
   d'intervention — même règle que /health, qui reste agrégée parce qu'elle est publique. Un
   diagnostic qui fait voyager les données d'un client n'est pas un progrès. */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
function extraire(nom){ const i=APP.indexOf('function '+nom+'('); if(i<0) throw new Error('introuvable : '+nom);
  let j=APP.indexOf('{',i),p=0; for(let k=j;k<APP.length;k++){ const c=APP[k]; if(c==='{')p++; else if(c==='}'){ p--; if(p===0){ j=k; break; } } } return APP.slice(i,j+1); }

console.log('L\'appareil remonte son diagnostic tout seul');
{
  v('la fonction existe', /function syncDiagnostic\(motif\)\{/.test(APP), true);
  v('elle part quand le premier instantané n\'arrive jamais',
    /if\(!_syncGotInitial && _syncOn\) syncDiagnostic\('bloquée : premier instantané jamais reçu après 25 s'\);/.test(APP), true);
  v('…et quand une écriture n\'est pas acquittée',
    /syncDiagnostic\('ecriture non acquittee en 15 s/.test(APP), true);
  v('elle emprunte le canal existant vers la Tour',
    /if\(typeof tmPush==='function'\) tmPush\('synchro',msg,'','sync',0\);/.test(APP), true);
}

console.log('\nElle ne remonte que des compteurs — jamais une donnée de client');
{
  const src=extraire('syncDiagnostic');
  /* Ce qui a le droit de voyager : des longueurs de collections, l'identifiant d'espace (déjà
     envoyé par /api/bug), des états oui/non. Rien qui nomme quelqu'un. */
  v('des longueurs de collections, pas leur contenu', /const n=c=>\(\(\(typeof db!=='undefined'&&db&&db\[c\]\)\|\|\[\]\)\)\.length;/.test(src), true);
  v('⛔ aucun nom de client ne part', /db\.clients\[|\.nom|\.prenom|fullName\(/.test(src), false);
  v('⛔ aucune adresse ni e-mail', /adresse|email|mail/i.test(src), false);
  v('⛔ aucun libellé d\'intervention', /titre|libelle|desc/i.test(src), false);
  v('le rôle est remonté, pas l\'identité', /role '\+\(\(typeof currentUser!=='undefined'&&currentUser&&currentUser\.role\)/.test(src), true);
}

console.log('\nElle ne parle qu\'une fois par chargement');
{
  v('un drapeau la tait ensuite', /let _syncDiagDit=false;/.test(APP), true);
  v('…et il est posé dès le premier passage', /if\(_syncDiagDit\) return; _syncDiagDit=true;/.test(APP), true);
  /* Le quota serveur est de 20 signalements par heure et par espace : une remontée en boucle
     noierait les vraies erreurs et ferait taire la vigie pour tout le monde. */
  v('une seule remontée par chargement, pas une par tentative',
    (APP.match(/_syncDiagDit=true;/g)||[]).length, 1);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
