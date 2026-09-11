/* ⛔ CE QUE CE FICHIER GARDE — « à chaque mise à jour ça recrée un OP Admin chez ELAN ».

   Signalé par Justin le 11 septembre 2026. La cause : le compte de départ était fabriqué avec
   `uid()`, dans migrate(), qui tourne à CHAQUE chargement et se déclenche dès que la liste des
   comptes est vide — appareil qui a perdu sa base, ou simplement avant que la synchro n'ait
   livré les comptes de l'équipe. Un identifiant NEUF à chaque passage, et une fusion qui réunit
   par identifiant : elle ADDITIONNAIT les comptes au lieu de les confondre. Un « OP Admin » de
   plus à chaque fois, chez un vrai client.

   Deux verrous, et il faut les deux :
     · l'identifiant est FIXE — les recréations retombent sur le même enregistrement, et une
       fois le compte supprimé sa pierre tombale porte cet identifiant, donc il ne revient plus ;
     · ceux qui se sont DÉJÀ empilés sont retirés au chargement — mais uniquement ceux restés
       INTACTS (aucun mot de passe, aucun code), et jamais le dernier.

   ⚠️ Et un piège de portée, commis puis corrigé en écrivant ce correctif : la constante avait
   été déclarée DANS migrate(), donc invisible depuis boot() qui s'en sert — « ReferenceError »
   au premier démarrage, application morte. La syntaxe, elle, passait. Ce test le vérifie. */

const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Le compte de départ ne se duplique plus');
{
  v('l\'identifiant du compte de départ est FIXE', /const ID_ADMIN_DEPART='u-op-admin';/.test(APP), true);
  v('…et c\'est bien lui qui sert à la création',
    /d\.users = \[\{id:ID_ADMIN_DEPART,prenom:'OP',nom:'Admin',login:'admin',role:'admin'/.test(APP), true);
  v('⛔ plus aucun compte de départ fabriqué avec uid()',
    /d\.users = \[\{id:uid\(\)/.test(APP), false);
}

console.log('\nLa constante est visible de partout où elle sert (piège de portée)');
{
  /* Déclarée DANS migrate(), elle était invisible depuis boot() : ReferenceError au démarrage,
     et la vérification de syntaxe n'y voyait rien. On exige donc une déclaration en colonne 0,
     AVANT migrate() et AVANT boot(). */
  const decl=APP.indexOf("\nconst ID_ADMIN_DEPART=");
  const mig=APP.indexOf('\nfunction migrate(');
  const boot=APP.indexOf('\nasync function boot()');
  v('déclarée au niveau global (début de ligne)', decl>0, true);
  v('déclarée AVANT migrate()', decl>0 && decl<mig, true);
  v('déclarée AVANT boot()', decl>0 && decl<boot, true);
  /* Et une seule déclaration : deux `const` du même nom dans deux portées finiraient par
     diverger, exactement comme les deux copies de fbUidEquipe évitées côté serveur. */
  v('une seule déclaration', (APP.match(/const ID_ADMIN_DEPART=/g)||[]).length, 1);
}

console.log('\nLes comptes de départ déjà empilés sont retirés, sans jamais toucher un vrai compte');
{
  v('le ménage existe et vise le compte de départ intact',
    /\(u\.prenom\|\|''\)==='OP'&&\(u\.nom\|\|''\)==='Admin'&&!u\.pwdHash&&!u\.pinHash/.test(APP), true);
  /* ⛔ Le garde-fou qui compte : un compte qui a servi porte un mot de passe. Sans `!u.pwdHash`,
     ce ménage effacerait l'administrateur d'une entreprise. */
  v('⛔ un compte avec mot de passe est hors d\'atteinte', /&&!u\.pwdHash&&!u\.pinHash/.test(APP), true);
  v('on n\'agit qu\'à partir de DEUX comptes intacts', /if\(vierges\.length>1\)\{/.test(APP), true);
  v('…et on en garde toujours un', /const garde=vierges\.find\(u=>u\.id===ID_ADMIN_DEPART\)\|\|vierges\[0\];/.test(APP), true);
  /* Sans pierre tombale, la fusion les ramènerait depuis les autres appareils au passage suivant. */
  v('les retirés reçoivent une pierre tombale', /db\.usersSupprimes=usersTombesFusion\(db,\{usersSupprimes:aRetirer\.map/.test(APP), true);
  v('le geste est tracé dans le journal', /Comptes de départ en double/.test(APP), true);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
