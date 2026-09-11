/* ══ v640 — LE JETON D'ÉQUIPE : donner enfin une identité à Firestore ═══════════════════════
   Aujourd'hui l'application se connecte à Firebase en ANONYME. Google sait qu'un appareil est
   là, jamais À QUELLE ENTREPRISE il appartient — d'où une règle Firestore qui ne sait dire que
   « toute personne connectée », et donc n'importe quel compte anonyme qui lit et écrit le
   document de n'importe quelle entreprise. Reproduit : avec les seules constantes du fichier
   servi publiquement, le contenu d'une entreprise sur la clé par défaut se déchiffre en entier.

   Le serveur délivre désormais, contre la PREUVE de la clé d'équipe, un jeton signé qui porte
   l'entreprise dans `claims.t`. Ce fichier fabrique un vrai jeton avec le code réel extrait de
   `server/index.js` et une clé de signature jetable, et vérifie sa signature.

   ⚠️ CE QUI N'EST PAS ENCORE FAIT, ET C'EST VOULU : la règle Firestore n'a pas changé. On met
   tous les appareils en place AVANT de fermer la porte — publier la règle trop tôt couperait
   les retardataires de leur propre entreprise. Le dernier bloc de ce fichier le verrouille.  */
const fs=require('fs'), crypto=require('crypto');
const RAC=__dirname+'/..';
const APP=fs.readFileSync(RAC+'/app.html','utf8');
const SRV=fs.readFileSync(RAC+'/server/index.js','utf8');
const RULES=fs.readFileSync(RAC+'/firestore.rules','utf8');
let ok=0,ko=0;
const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);}
  else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

/* ─────────────────────────────────────────────────────────────────────────────────────── */
console.log('Le jeton est bien celui que Firebase attend');
{ /* On rejoue la fabrique du serveur, telle qu'elle est écrite, avec une clé jetable.
     ⚠️ On la prend DANS la route, jamais par une recherche globale : `const b64u` existe aussi
     dans fbAdminJeton() vingt lignes plus haut, et un motif non ancré rendait la première
     ligne de l'autre fonction — une fabrique amputée qui ne définit rien. */
  const ROUTE=(SRV.match(/app\.post\('\/api\/fb\/jeton'[\s\S]*?\n\}\);/)||[''])[0];
  const bloc=(ROUTE.match(/const b64u[\s\S]*?const sig = [\s\S]*?\.toString\('base64url'\);/)||[''])[0];
  v('la fabrique est bien dans la route, entière',[bloc.length>300,/const sans =/.test(bloc),/const uid =/.test(bloc)],[true,true,true]);
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,
    privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const fbAdminCle={client_email:'essai@teamop.iam.gserviceaccount.com',private_key:privateKey};
  const t='ent-demo-0001';
  const fab=new Function('fbAdminCle','crypto','t',bloc+'\n return {sans, sig, uid};');
  const r=fab(fbAdminCle,crypto,t);
  const dec=x=>JSON.parse(Buffer.from(x,'base64url').toString('utf8'));
  const [h,p]=r.sans.split('.'); const ent=dec(h), corps=dec(p);
  v('signé en RS256',ent.alg,'RS256');
  v('audience : celle de l\'Identity Toolkit',corps.aud,
    'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit');
  v('l\'émetteur est aussi le sujet, comme Firebase l\'exige',corps.iss===corps.sub,true);
  v('il porte l\'entreprise, et rien d\'autre',corps.claims,{t:t});
  v('valable une heure',(corps.exp-corps.iat),3600);
  v('un identifiant par ENTREPRISE, dérivé de t, sans donnée de personne',
    [corps.uid.slice(0,3),corps.uid.length<=128,/^[a-z0-9_]+$/.test(corps.uid)],['eq_',true,true]);
  v('deux entreprises différentes n\'ont pas le même identifiant',
    fab(fbAdminCle,crypto,'ent-autre').uid!==r.uid,true);
  const pub=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
  v('la signature se vérifie avec la clé publique',
    crypto.createVerify('RSA-SHA256').update(r.sans).verify(pub,Buffer.from(r.sig,'base64url')),true);
  v('elle ne se vérifie PAS avec une autre clé',
    crypto.createVerify('RSA-SHA256').update(r.sans).verify(
      crypto.createPublicKey(crypto.generateKeyPairSync('rsa',{modulusLength:2048,
        privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey
      ).export({type:'spki',format:'pem'}),Buffer.from(r.sig,'base64url')),false);
}

console.log('\nLa route ne délivre rien sans preuve, et jamais pour le repli');
{ const route=(SRV.match(/app\.post\('\/api\/fb\/jeton'[\s\S]*?\n\}\);/)||[''])[0];
  v('la route existe',route.length>200,true);
  v('elle exige un t ET une empreinte bien formée',/\/\^\[0-9a-f\]\{64\}\$\/\.test\(kh\)/.test(route),true);
  /* UNE seule garde, partagée avec les copies de sauvegarde : deux copies d'un contrôle de
     sécurité finissent toujours par diverger — c'est la leçon des quatre portes de sortie
     d'espace, corrigées le même jour. */
  v('elle réutilise la garde des copies, elle n\'en écrit pas une seconde',
    /const refus = sauvRefus\(t, kh, 'jeton'\);/.test(route),true);
  /* ⛔ LE PLAFOND SE COMPTE APRÈS LA PREUVE. Compté avant, il devenait une arme : 120 requêtes
     avec le `t` d'une entreprise et n'importe quelle empreinte bien formée, et tous ses
     appareils prennent 429 pour une heure — la règle une fois fermée, l'entreprise perdrait
     l'accès à ses propres données, indéfiniment répétable. Et le vidage de la table aussi :
     5001 identifiants inventés remettaient tous les compteurs à zéro. Trouvé par `gardien`. */
  v('elle est plafonnée en nombre d\'appels',/quotaOk\(jetonQuota/.test(route),true);
  v('…et le plafond se compte APRÈS la preuve de clé, jamais avant',
    route.indexOf('quotaOk(jetonQuota')>route.indexOf('sauvRefus(t, kh'),true);
  v('…le vidage de la table aussi',
    route.indexOf('jetonQuota = new Map()')>route.indexOf('sauvRefus(t, kh'),true);
  /* ⛔ Une clé PUBLIQUE n'est pas une preuve. `sauvRefus` refuse l'espace de repli par son NOM ;
     des entreprises ont leur propre identifiant d'espace tout en portant encore la clé écrite
     en clair dans app.html. Sans ce refus, elles recevraient un vrai jeton — et la règle une
     fois fermée se refermerait sur tout le monde SAUF sur la population la plus exposée. */
  v('elle refuse un espace encore sur la clé PARTAGÉE, pas seulement l\'espace de repli',
    /if \(cleEstPublique\(t\)\) return res\.status\(409\)/.test(route),true);
  /* ⛔ TROIS ÉTATS, PAS DEUX. Un booléen « a-t-elle sa clé propre ? » confond « non, elle
     porte la clé partagée » avec « on n'en sait rien ». Deux dégâts, tous deux constatés :
     un espace HORS ANNUAIRE s'affichait « 🔓 Clé partagée — à migrer » dans la Tour alors que
     le serveur n'a aucun code pour lui — Justin l'a lu comme un constat le 11 septembre 2026 ;
     et un espace d'annuaire au code illisible se comptait « à migrer » POUR TOUJOURS, donc le
     compteur ne pouvait plus atteindre zéro — or c'est la condition n°3 avant de refermer la
     règle Firestore, et une condition impossible à tenir finit par être ignorée. */
  const etat=new Function('CLE_PAR_DEFAUT',(SRV.match(/function cleEtat\(e\) \{[\s\S]*?\n\}/)||[''])[0]+'\nreturn cleEtat;')('ELAN-GESTION-7F3A9C2E-cloud-2026');
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64');
  v('clé à elle → « propre »',etat({code:b64({k:'sa-cle-a-elle'})}),'propre');
  v('clé écrite en clair dans app.html → « partagee »',etat({code:b64({k:'ELAN-GESTION-7F3A9C2E-cloud-2026'})}),'partagee');
  v('hors annuaire (aucun code) → « inconnue », surtout pas « partagee »',[etat(null),etat({})],['inconnue','inconnue']);
  v('code illisible → « inconnue », pour que le compteur puisse descendre à zéro',etat({code:'pas-du-base64-valide!!'}),'inconnue');
  v('clé vide → « inconnue »',etat({code:b64({k:''})}),'inconnue');
  v('cleEstPublique n\'est que « l\'état vaut partagee », pas une seconde définition',
    /function cleEstPublique\(t\) \{ return cleEtat\(espaceParT\(t\)\) === 'partagee'; \}/.test(SRV),true);
  v('une seule définition de la clé partagée, et une seule de l\'état',
    [(SRV.match(/CLE_PAR_DEFAUT = '/g)||[]).length,(SRV.match(/function cleEtat\(/g)||[]).length],[1,1]);
  v('son commentaire dit la VÉRITÉ : ouverte par défaut, sûre par l\'ordre d\'appel',
    /OUVERTE PAR DÉFAUT, ET C'EST L'ORDRE D'APPEL QUI LA REND SÛRE/.test(SRV),true);
  /* La Tour doit lire les trois états, sinon elle remet le mensonge en place. */
  const TOUR=fs.readFileSync(RAC+'/tour.html','utf8');
  /* Tolérant au balisage : la Tour publiée et celle de la refonte n'écrivent pas le libellé
     de la même façon (`<b>` ou non). Ce qui est verrouillé, c'est que le troisième état
     EXISTE et qu'il est nommé, pas la façon dont il est gras. */
  v('la Tour distingue « clé inconnue » de « clé partagée »',/❔ (<b>)?Clé inconnue/.test(TOUR),true);
  v('son compteur « à migrer » ne compte QUE ce qui est vraiment partagé',
    /x\.cleEtat==='partagee'/.test(TOUR),true);
  v('et son filtre dit la même chose que son compteur',
    (TOUR.match(/cleEtat==='partagee'/g)||[]).length,2);
  v('un jeton ne se met en cache nulle part en chemin',/Cache-Control', 'no-store'/.test(route),true);
  v('sans clé d\'administration, elle le dit au lieu de fabriquer n\'importe quoi',
    /firebase_off/.test(route),true);
  v('elle n\'écrit JAMAIS l\'identifiant d\'entreprise dans les journaux',
    /console\.(log|error|warn)\([^)]*\bt\b[^)]*\)/.test(route.replace(/'[^']*'/g,"''")),false);
  const garde=(SRV.match(/function sauvRefus\(t, kh, quoi\)[\s\S]*?\n\}/)||[''])[0];
  v('la garde refuse l\'espace de repli — sa clé est publique, une preuve venant de lui ne prouve rien',
    /ESPACES_INTOUCHABLES\.includes\(t\)/.test(garde),true);
  v('…un espace fermé',/entFermes\.espaces\.includes\(t\)/.test(garde),true);
  v('…et une clé fausse',/espaceCleOk\(t, kh\)/.test(garde),true);
}

console.log('\nCôté application : le jeton s\'essaie, mais rien ne casse s\'il manque');
{ const jet=(APP.match(/async function fbJetonEquipe\(\)\{[\s\S]*?\n\}catch\(e\)\{ return ''; \} \}/)||[''])[0];
  v('fbJetonEquipe existe',jet.length>100,true);
  v('elle envoie la PREUVE, jamais la clé',[/khEquipe\(\)/.test(jet),/syncSecret\(\)/.test(jet)],[true,false]);
  v('elle rend vide plutôt que de lever, quoi qu\'il arrive',/catch\(e\)\{ return ''; \}/.test(jet),true);
  v('elle ne reste pas suspendue si le serveur ne répond pas',/AbortController/.test(jet),true);

  const auth=(APP.match(/async function syncAuth\(\)\{[\s\S]*?\n\}catch\(e\)\{ try\{ console\.warn\('auth sync/)||[''])[0];
  /* ⛔ ON JUGE SUR LE CLAIM, PAS SUR L'ANONYMAT. `espace.html` (le portail client) déclare le
     même projet Firebase sur la même origine : sa session était PARTAGÉE avec l'application.
     Un patron qui règle son abonnement puis ouvre OP GESTION arrivait donc ici avec un compte
     e-mail — ni anonyme, ni porteur du jeton — et le bloc était sauté : cet appareil n'aurait
     JAMAIS demandé de jeton, et se serait retrouvé muet le jour où la règle l'exige.
     Trouvé par `gardien`. La vraie question est « cette session vaut-elle pour l'entreprise
     qu'on a sous les yeux ? », et l'isolement des deux pages se fait par une application
     Firebase NOMMÉE — la persistance étant rangée par nom d'application. */
  v('l\'application Firestore d\'OP GESTION est NOMMÉE, séparée du portail client',
    /firebase\.initializeApp\(cfg,'opgestion'\)/.test(APP),true);
  v('plus aucun firebase.auth() global : tout passe par cette application',
    (APP.match(/firebase\.auth\(\)/g)||[]).length,0);
  v('la décision porte sur le claim, pas sur l\'anonymat',/if\(!cl\)\{/.test(auth),true);
  v('si le jeton échoue, on garde ou on ouvre une session anonyme — la synchro ne s\'arrête pas',
    /if\(!A\.auth\(\)\.currentUser\) await A\.auth\(\)\.signInAnonymously\(\);/.test(auth),true);
  v('un jeton d\'une AUTRE entreprise fait déconnecter',
    /if\(cl && cl!==tIci\)\{ try\{ await A\.auth\(\)\.signOut\(\); \}/.test(auth),true);
  v('le jeton n\'est demandé qu\'après avoir constaté que la session ne vaut pas',
    auth.indexOf('fbJetonEquipe()')>auth.indexOf('if(!cl)'),true);
  /* La session Firebase est le secret le plus VIVANT : elle se renouvelle indéfiniment toute
     seule. Un appareil qu'on rend ou dont la Tour ferme l'espace la garderait sinon. */
  const quitter=(APP.match(/function espaceQuitter\(\)\{[\s\S]*?\n\}\n(?=(?:async function |function |const |let |\/\*))/)||[''])[0];
  v('quitter un espace emporte AUSSI la session Firebase',
    /name==='opgestion'\)\[0\]; if\(a&&a\.auth\) a\.auth\(\)\.signOut\(\)/.test(quitter),true);
  /* ⛔ ET PAR LE STOCKAGE, PAS SEULEMENT PAR LE SDK. L'application nommée n'existe que si
     syncInit a dépassé le chargement des trois scripts de Google DANS CE CHARGEMENT-CI. Sur
     la porte de la Tour (« espace fermé »), la vérification part à 2,6 s : en 4G c'est une
     course perdue d'avance, et après elle `elan_sync_team` a disparu — donc syncAuth ne
     repassera JAMAIS pour rattraper. Une entreprise coupée par TEAM OP gardait ainsi, sur
     chaque appareil, une session valide et renouvelable en lecture ET écriture sur son
     document. Trouvé par `gardien` en seconde passe. */
  v('…et directement dans le stockage de Firebase, qui marche même si le SDK n\'est pas chargé',
    /indexedDB\.open\('firebaseLocalStorageDb'\)/.test(quitter),true);
  v('en n\'effaçant QUE la clé d\'OP GESTION — la base est partagée avec le portail client',
    /indexOf\(':opgestion'\)>0\) st\.delete\(k\)/.test(quitter),true);
  v('la porte de la Tour laisse le temps à ce retrait de s\'exécuter',
    /setTimeout\(\(\)=>location\.reload\(\),400\); return;/.test(APP),true);
  /* Travailler hors ligne est une fonctionnalité ; se croire synchronisé sans l'être, non. */
  v('et quand les quatre reprises sont épuisées, l\'utilisateur l\'apprend',
    /Pas de connexion à l\\?'espace de l\\?'équipe/.test(APP),true);
}

console.log('\nLa règle Firestore n\'a PAS changé — et c\'est l\'ordre qui protège');
{ v('la règle publiée est toujours la permissive',
    /allow read:\s+if connecte\(\);\s*\n\s*allow write:\s+if connecte\(\) && versionOk\(\);/.test(RULES),true);
  v('la règle future est écrite noir sur blanc, prête à coller',
    /request\.auth\.token\.get\('t', ''\) == teamId/.test(RULES),true);
  /* ⛔ Une première rédaction de ce bloc avait laissé tomber versionOk() — donc rouvrait la
     porte de version, très exactement « ce qui a détruit les comptes d'ELAN ». Trouvé par
     `gardien`. Le paradoxe aurait été complet : la condition n°1 s'appuie sur ce verrou pour
     orchestrer la migration. */
  v('elle GARDE versionOk() sur l\'écriture',/== teamId\s*\n\s*\/\/\s*&& versionOk\(\);/.test(RULES),true);
  v('les QUATRE conditions avant de la publier sont écrites',
    [/Tous les appareils doivent présenter le jeton/.test(RULES),/espace de REPLI/.test(RULES),
     /ENCORE LA CLÉ PARTAGÉE/.test(RULES),/LES ESPACES HORS ANNUAIRE/.test(RULES)],[true,true,true,true]);
  v('et le danger de l\'inverse aussi',/perdent alors l'accès aux données de LEUR PROPRE entreprise/.test(RULES),true);
  /* Un jeton d'une heure n'est pas un accès d'une heure : Firebase l'échange contre une
     session renouvelable indéfiniment. Fermer une entreprise depuis la Tour ne coupe donc
     pas son Firestore sur un appareil déjà pourvu. Ce n'est pas une régression, mais c'est
     un levier qu'on n'a pas — et qu'on pourrait croire acquis. */
  v('ce que la règle NE donne pas est écrit aussi',
    [/ne s'arrête pas au bout d'une heure/.test(RULES),/ne coupe PAS son Firestore/.test(RULES)],[true,true]);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
