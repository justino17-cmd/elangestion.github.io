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
  v('elle est plafonnée en nombre d\'appels',/quotaOk\(jetonQuota/.test(route),true);
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
  v('une session ANONYME DÉJÀ EN PLACE tente aussi le jeton',/if\(!u \|\| u\.isAnonymous\)\{/.test(auth),true);
  v('si le jeton échoue, on garde ou on ouvre une session anonyme — la synchro ne s\'arrête pas',
    /if\(!firebase\.auth\(\)\.currentUser\) await firebase\.auth\(\)\.signInAnonymously\(\);/.test(auth),true);
  v('un jeton d\'une AUTRE entreprise fait déconnecter',
    /if\(cl && cl!==tIci\)\{ try\{ await firebase\.auth\(\)\.signOut\(\); \}/.test(auth),true);
  v('le jeton n\'est demandé que si la session ne vaut pas déjà',
    auth.indexOf('fbJetonEquipe()')>auth.indexOf('u.isAnonymous'),true);
}

console.log('\nLa règle Firestore n\'a PAS changé — et c\'est l\'ordre qui protège');
{ v('la règle publiée est toujours la permissive',
    /allow read:\s+if connecte\(\);\s*\n\s*allow write:\s+if connecte\(\) && versionOk\(\);/.test(RULES),true);
  v('la règle future est écrite noir sur blanc, prête à coller',
    /request\.auth\.token\.t == teamId/.test(RULES),true);
  v('les deux conditions avant de la publier sont écrites',
    [/Tous les appareils doivent présenter le jeton/.test(RULES),/espace de REPLI/.test(RULES)],[true,true]);
  v('et le danger de l\'inverse aussi',/perdent alors l'accès aux données de LEUR PROPRE entreprise/.test(RULES),true);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
