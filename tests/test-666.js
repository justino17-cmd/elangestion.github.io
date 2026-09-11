/* ⛔ CE QUE CE FICHIER GARDE — trois portes condamnées le 11 septembre 2026 au soir, et une
   phrase qui mentait dans le journal de la Tour.

   ── 1) LA MISE À JOUR NE SE REMET PLUS À PLUS TARD ────────────────────────────────────────
   Justin, le 11 septembre 2026 : « dès la connexion, peu importe les choses qu'ils vont faire.
   Ils peuvent rien faire, ça met la page complète, faire la mise à jour. Ils ne peuvent pas la
   faire plus tard. » Il y avait DEUX portes de sortie, et il fallait fermer les deux :
     · la bannière du bas portait une croix ✕ — un doigt dessus, et l'appareil restait en
       vieille version, à lire sans pouvoir écrire, sans que personne ne le sache ;
     · l'écran d'attente offrait « Terminer ma saisie d'abord », qui le refermait pour deux
       minutes, renouvelables tant qu'un formulaire restait ouvert.
   Mesuré chez ELAN le jour même : Benoit en v634, Mathieu et Mathys en v641, alors que le
   minimum exigé était v665 — des semaines de retard sur des appareils qui travaillaient tous
   les jours. Ce n'est pas qu'ils refusaient : personne ne leur a jamais imposé.

   ── 2) UN REFUS DU NUAGE NE S'APPELLE PAS TOUJOURS « VERSION » ─────────────────────────────
   Relevé de la Tour, ELAN, 11 septembre 2026 au soir, copié tel quel :
       18:44  Version bloquée — mise à jour forcée — v658 sous le minimum v653   (ben)
       18:32  Version bloquée — mise à jour forcée — v663 sous le minimum v663   (florent)
       18:12  Version bloquée — mise à jour forcée — v661 sous le minimum v653   (antho)
   Aucune de ces trois phrases n'est vraie : 658 n'est pas sous 653, 663 n'est pas sous 663.
   Le nuage refusait bien l'écriture — mais l'application recopiait dans le journal le minimum
   qu'elle avait EN MÉMOIRE, parfois vieux de plusieurs heures. Neuf publications dans
   l'après-midi, donc neuf fournées de lignes incohérentes, dans le seul endroit qu'on ouvre
   quand un client appelle. Une ligne de journal fausse coûte plus cher que pas de ligne du
   tout : elle envoie chercher au mauvais endroit.

   ── 3) ET LA BOUCLE QUE LE NOUVEL ÉCRAN AURAIT OUVERTE ─────────────────────────────────────
   Conséquence directe de (1) : l'écran bloquant n'ayant plus de porte de sortie, un refus du
   nuage qui n'a RIEN à voir avec la version (jeton d'équipe périmé, entreprise fermée depuis
   la Tour) enfermait l'appareil pour toujours — recharger, se faire refuser, recharger. On ne
   force donc qu'UNE SEULE mise à jour tant que la cause n'est pas confirmée, et le second
   passage dit ce qui se passe au lieu de reproposer un bouton qui ne répare rien. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const CNX = fs.readFileSync(__dirname + '/../connexion.html', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

/* Le texte RÉEL de la fonction, accolades comptées — pas une tranche de longueur fixe, qui
   attraperait la moitié de la suivante le jour où l'une grandit. */
function corps(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return '';
  let j = src.indexOf('{', i), p = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === '{') p++;
    else if (c === '}') { p--; if (!p) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('La mise à jour ne se remet plus à plus tard, et le journal dit la vérité');

// ══ 1) L'ÉCRAN BLOQUANT : une seule issue ════════════════════════════════════════════════
{
  const f = corps(APP, 'function majEcranBloquant(');
  v('l’écran bloquant existe', f.length > 400, true);
  v('il couvre tout l’écran, au-dessus de tout', /position:fixed;inset:0;z-index:2147483647/.test(f), true);
  v('il se déclare comme une alerte modale', /setAttribute\('role','alertdialog'\)/.test(f) && /aria-modal','true'/.test(f), true);
  /* UN bouton. Pas deux : la seconde porte est exactement ce qu'on vient de condamner. */
  v('⛔ un seul bouton sur l’écran', (f.match(/<button/g) || []).length, 1);
  v('⛔ aucune croix pour le refermer', /this\.parentNode\.remove\(\)|✕/.test(f), false);
  v('⛔ aucun « plus tard »', /plus tard|Plus tard|Terminer ma saisie/.test(f), false);
  v('le clavier ne peut pas en sortir', /ev\.key==='Tab'\)\{ ev\.preventDefault\(\)/.test(f), true);
  v('le bouton prend le focus tout seul', /maj-bloque-btn'\); if\(b\) b\.focus\(\)/.test(f), true);
  v('il dit que rien ne s’enregistre tant qu’elle n’est pas faite', /ne peut pas enregistrer le travail/.test(f), true);
  /* La cible tactile : plancher de 44 px sur le terrain. 15 px de haut + 16 px de police
     dépassent largement, mais la valeur est écrite, donc elle se vérifie. */
  v('le bouton est une vraie cible tactile', /padding:15px;font-size:16px/.test(f), true);
}

// ══ 2) LES DEUX PORTES DE SORTIE MÈNENT MAINTENANT À L'ÉCRAN ═════════════════════════════
{
  v('⛔ la bannière refermable ne se construit plus',
    /function showUpdateBanner\(\)\{ majEcranBloquant\(_versionMin\|\|''\); \}/.test(APP), true);
  v('…et plus personne ne fabrique #update-banner',
    /createElement\('div'\); d\.id='update-banner'/.test(APP), false);
  const p = corps(APP, 'function majPrete(');
  v('l’écran d’attente ne propose plus de finir sa saisie', /majTerminerSaisie\(\)/.test(p), false);
  v('majPrete mène droit à l’écran bloquant', /majEcranBloquant\(_versionMin\|\|''\);/.test(p), true);
  v('⛔ majOccupe n’est plus consulté', /majOccupe/.test(p), false);
  /* Les deux fonctions restent — une dizaine d'endroits les appellent, et une fonction absente
     casse tout un écran pour une porte qu'on vient de condamner. */
  v('majMaintenant existe encore', /function majMaintenant\(\)\{ majAppliquer\(\); \}/.test(APP), true);
  v('majTerminerSaisie existe encore, et mène au même endroit',
    /function majTerminerSaisie\(\)\{ majEcranBloquant\(_versionMin\|\|''\); \}/.test(APP), true);
}

// ══ 3) CE QUI EST ENREGISTRÉ PART AVANT LE REDÉMARRAGE ═══════════════════════════════════
{
  const a = corps(APP, 'function majAppliquer(');
  v('l’écran bloquant est retiré avant l’installation', /\$\('maj-bloque'\); if\(z\) z\.remove\(\)/.test(a), true);
  v('⛔ la synchro part avant le rechargement', /if\(typeof syncPush==='function'\) syncPush\(true\)/.test(a), true);
  v('…et AVANT le rechargement, pas après', a.indexOf('syncPush(true)') < a.indexOf('location.reload()'), true);
  v('le drapeau « en route » est posé, pour ne pas repartir deux fois', /_majEnRoute=true;/.test(a), true);
}

// ══ 4) LE MOTIF ÉCRIT DANS LE JOURNAL — on joue la vraie fonction ════════════════════════
/* On extrait majObligatoire d'app.html et on l'exécute pour de bon, avec des doublures autour.
   C'est la seule façon de prouver la PHRASE : la relire ne dit pas ce qu'elle vaut à
   l'exécution, et c'est justement une phrase à l'exécution qui s'est retrouvée fausse. */
function jouerMajObligatoire(version, min, dejaTente) {
  const src = corps(APP, 'function majObligatoire(');
  const APP_VERSION = String(version);
  const APP_VERSION_NUM = parseInt(APP_VERSION, 10) || 0;
  let _versionBloquee = false, _majAutoTimer = null;
  let motif = null, pretes = 0, bloquant = null;
  const magasin = {};
  const cnxSignaler = (ev, extra) => { motif = (extra || {}).motif; };
  const navigator = {};                                   // pas de service worker dans la doublure
  const majPrete = () => { pretes++; };
  const majEcranBloquant = (m, cause) => { bloquant = { min: m, cause: cause }; };
  const sessionStorage = {
    getItem: (k) => (dejaTente && k === 'elan_maj_forcee') ? '1' : null,
    setItem: (k, val) => { magasin[k] = val; }
  };
  eval(src + '\nmajObligatoire(min);');
  return { motif, pretes, bloquant, magasin, bloquee: _versionBloquee };
}
{
  // a) le vrai cas : on est réellement sous le minimum
  const vrai = jouerMajObligatoire('664', 665, false);
  v('un vrai retard de version se dit tel quel', vrai.motif, 'v664 sous le minimum v665');
  v('…et la mise à jour part', vrai.pretes, 1);
  v('…sans passer par l’écran « refus »', vrai.bloquant, null);
  v('…et sans poser de marque de tentative', Object.keys(vrai.magasin).length, 0);

  // b) LES TROIS LIGNES RELEVÉES CHEZ ELAN — aucune ne doit plus pouvoir s'écrire
  for (const [ver, mini] of [['658', 653], ['663', 663], ['661', 653]]) {
    const r = jouerMajObligatoire(ver, mini, false);
    v('⛔ « v' + ver + ' sous le minimum v' + mini +' » ne s’écrit plus',
      /sous le minimum/.test(r.motif || ''), false);
    v('   …et le motif dit ce qui s’est vraiment passé',
      r.motif, 'écriture refusée par le nuage — v' + ver + ', minimum non confirmé');
  }

  // c) le minimum non confirmé (serveur muet) : min vaut 0
  const flou = jouerMajObligatoire('665', 0, false);
  v('un minimum inconnu ne s’invente pas', /sous le minimum/.test(flou.motif || ''), false);
  v('on tente quand même la mise à jour, UNE fois', flou.pretes, 1);
  v('…et on marque qu’on l’a tentée', flou.magasin['elan_maj_forcee'], '1');

  // d) deuxième passage : la marque est là, on ne relance pas la boucle
  const second = jouerMajObligatoire('665', 0, true);
  v('⛔ le second passage ne relance PAS de mise à jour', second.pretes, 0);
  v('…il montre l’écran qui explique', second.bloquant && second.bloquant.cause, 'refus');
  v('…et il ne repose pas la marque', Object.keys(second.magasin).length, 0);

  // e) un vrai retard de version n'est JAMAIS bridé par la marque : c'est une cause connue
  const vraiMarque = jouerMajObligatoire('664', 665, true);
  v('⛔ un vrai retard passe même si une tentative a déjà eu lieu', vraiMarque.pretes, 1);
}

// ══ 5) ON REDEMANDE LE MINIMUM AVANT DE NOMMER UNE CAUSE ═════════════════════════════════
{
  const r = corps(APP, 'function versionRefuseeParNuage(');
  v('⛔ le minimum en mémoire ne sert plus de verdict', /_versionMin\|\|\(APP_VERSION_NUM\+1\)/.test(r), false);
  v('on redemande au serveur avant de trancher', /versionVerifier\(true\)/.test(r), true);
  v('…et on ne nomme la version que si elle est vraiment en cause',
    /_versionMin>APP_VERSION_NUM\?_versionMin:0/.test(r), true);
  v('un blocage déjà posé pendant l’aller-retour n’est pas redoublé',
    (r.match(/if\(_versionBloquee\) return;/g) || []).length, 2);
}

// ══ 6) L'ÉCRAN SAIT DIRE L'AUTRE CAUSE ═══════════════════════════════════════════════════
{
  const f = corps(APP, 'function majEcranBloquant(');
  v('l’écran connaît les deux causes', /cause==='refus'/.test(f), true);
  v('⛔ il ne propose pas « Faire la mise à jour » à quelqu’un déjà à jour',
    /refus\?'location\.reload\(\)':'majAppliquer\(\)'/.test(f), true);
  v('il dit que ce n’est pas la version', /ce n’est pas la version qui bloque/.test(f), true);
  v('il dit quoi faire', /Préviens ton responsable/.test(f), true);
  v('le sens ne tient pas à la couleur seule : le titre change aussi',
    /refus\?'Enregistrement refusé':'Mise à jour nécessaire'/.test(f), true);
  /* ⛔ Le retour anticipé rouvrait la boucle : l'écran « mise à jour » monté en premier
     empêchait l'écran « refus » de le remplacer, et la personne gardait sous les yeux un bouton
     qui recharge sans rien réparer. Mesuré au navigateur sur la bêta, le 11 septembre 2026 —
     deux appels d'affilée, le second ressortait sans rien changer. */
  v('⛔ un écran déjà posé cède la place quand la cause change',
    /if\(e\)\{ if\(e\.getAttribute\('data-cause'\)===\(cause\|\|'version'\)\) return e; e\.remove\(\); \}/.test(f), true);
  v('…et la cause est inscrite sur l’écran', /setAttribute\('data-cause',cause\|\|'version'\)/.test(f), true);
}

// ══ 7) LA PAGE DE CONNEXION — une adresse qui n'est pas la nôtre ne mène à rien ═══════════
/* Demande de Justin, 11 septembre 2026 : « si le lien n'est pas dans notre base de données, ça
   marche pas ». Avant, n'importe quoi tapé ouvrait un formulaire de connexion COMPLET pour une
   entreprise inexistante, et l'échec final disait « identifiant ou mot de passe incorrect » —
   la personne faisait réinitialiser un mot de passe qui était bon. */
async function jouerEspaceExiste(reponse) {
  const src = corps(CNX, 'async function espaceExiste(');
  const fetch = reponse;
  const f = eval('(' + src.replace(/^async function espaceExiste/, 'async function') + ')');
  return await f('elan');
}
(async () => {
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });

  v('une entreprise connue passe', await jouerEspaceExiste(async () => J({ ok: true, libre: false })), 'connue');
  v('⛔ une adresse absente de notre base est refusée', await jouerEspaceExiste(async () => J({ ok: true, libre: true })), 'inconnue');
  /* ⚠️ TROIS ÉTATS, jamais deux. Refuser sur une réponse qu'on n'a pas reçue, c'est fermer la
     porte à toute une équipe dès que le réseau hoquette — et passer n'accorde rien, il reste
     l'identifiant et le mot de passe à donner derrière. */
  v('un réseau coupé ne ferme la porte à personne', await jouerEspaceExiste(async () => { throw new TypeError('Failed to fetch'); }), 'incertain');
  v('l’anti-abus non plus', await jouerEspaceExiste(async () => new Response('non', { status: 429 })), 'incertain');
  v('une réponse qu’on ne comprend pas ne tranche pas', await jouerEspaceExiste(async () => J({ ok: true })), 'incertain');
  v('une réponse sans corps JSON ne tranche pas', await jouerEspaceExiste(async () => new Response('bonjour', { status: 200 })), 'incertain');

  // Les trois chemins d'entrée passent bien par la même porte
  v('la saisie à la main vérifie avant de naviguer',
    /var etat=await espaceExiste\(v\);[\s\S]{0,200}if\(etat==='inconnue'\)\{ adrMsg/.test(CNX), true);
  v('⛔ l’arrivée directe sur /e/nom vérifie aussi',
    /espaceExiste\(adr\)\.then\(function\(etat\)\{\s*if\(etat==='inconnue'\)/.test(CNX), true);
  v('…et le formulaire de connexion n’apparaît qu’après', CNX.indexOf('cxAfficher(adr);') > CNX.indexOf("espaceExiste(adr).then"), true);
  v('⛔ un lien collé sans code repasse par la même porte',
    /if\(s\)\{ var i=\$id\('adr-nom'\); if\(i\) i\.value=s; adrAller\(\); return; \}/.test(CNX), true);
  v('⛔ plus aucune navigation directe sans vérification',
    /if\(s\)\{ location\.href='\/e\/'\+encodeURIComponent\(s\); return; \}/.test(CNX), false);
  /* L'adresse ne se normalise dans la barre QUE si elle a été reconnue : réécrire proprement
     une adresse qu'on vient de refuser lui donnerait l'air valide. */
  v('on ne range pas dans la barre une adresse refusée',
    corps(CNX, 'function cxAfficher(').indexOf('history.replaceState') > -1
    && !/inconnue'\)\{[\s\S]{0,400}history\.replaceState/.test(CNX), true);
  v('le bouton se désarme pendant la vérification', /btn\.disabled=true; btn\.textContent='Vérification…'/.test(CNX), true);
  v('…et se réarme après', /btn\.disabled=false; btn\.textContent='Accéder à mon compte'/.test(CNX), true);

  console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
})();
