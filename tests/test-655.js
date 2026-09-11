/* ⛔ CE QUE CE FICHIER GARDE — un appareil rattaché à AUCUNE entreprise doit le DIRE.

   Justin, 11 septembre 2026, après avoir tapé une adresse d'entreprise qui n'existe pas et
   obtenu un écran de connexion parfaitement normal : « quand un lien n'existe pas, ça ne devrait
   rien faire. Tu m'étonnes qu'il y a des bugs après. »

   Il avait raison, et le vrai défaut était plus profond que l'adresse. Un appareil qui n'est
   rattaché à aucun espace fonctionne parfaitement : il enregistre, il affiche, il ne signale
   rien — il est simplement SEUL. Constaté chez ELAN : leur administrateur a travaillé deux
   jours dans l'espace de repli sans que personne puisse s'en apercevoir, pendant que son équipe
   travaillait ailleurs. Le diagnostic a coûté une journée entière.

   ⚠️ CE QU'ON NE FAIT PAS, ET POURQUOI : dire « cette entreprise n'existe pas » sur l'écran de
   connexion. Le serveur répond volontairement « Entreprise, identifiant ou mot de passe
   incorrect » sans distinguer les trois — sinon n'importe qui pourrait deviner la liste des
   entreprises clientes en essayant des noms. Même raison que /health, qui reste agrégée parce
   qu'elle est publique. On avertit donc sur ce qu'on SAIT de l'appareil, jamais sur ce qui
   existe côté serveur. */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Un appareil non rattaché le dit, sur l\'écran de connexion');
{
  v('l\'avertissement existe', /id="li-orphelin"/.test(APP), true);
  v('…et il ne s\'affiche QUE si l\'appareil n\'est rattaché à rien',
    /\$\{\(!_surEspace&&!BETA_ESSAI\)\?`<div id="li-orphelin"/.test(APP), true);
  /* La bêta est un canal interne, sans espace d'entreprise : l'avertissement y serait faux. */
  v('⛔ la bêta en est exclue', /&&!BETA_ESSAI\)\?`<div id="li-orphelin"/.test(APP), true);
  v('il dit la CONSÉQUENCE, pas seulement l\'état', /ne rejoindra pas ton équipe/.test(APP), true);
  v('…et il dit quoi faire', /lien de connexion<\/b> de ton entreprise/.test(APP), true);
}

console.log('\nOn n\'annonce jamais l\'existence d\'une entreprise');
{
  /* Le message d'échec du serveur reste indistinct : entreprise, identifiant ou mot de passe.
     Le rendre précis transformerait l'écran de connexion en annuaire des clients. */
  const SRV=fs.readFileSync(__dirname+'/../server/index.js','utf8');
  v('⛔ le refus de connexion reste indistinct',
    /Entreprise, identifiant ou mot de passe incorrect\./.test(SRV), true);
  v('⛔ aucune route ne confirme qu\'une entreprise existe par son nom seul',
    /espace inconnu'.*\bnom\b/.test(SRV.split('\n').filter(l=>/app\.(get|post)\('\/api\/espaces\/(existe|par-nom|slug)/.test(l)).join('\n')), false);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
