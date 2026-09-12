/* ⛔ CE QUE CE FICHIER GARDE — le second versant de la consigne du 11 septembre 2026.

   Justin a dit DEUX choses le même soir, et elles ont l'air de se contredire :
     · « dès la connexion, peu importe les choses qu'ils vont faire. Ils peuvent rien faire, ça
       met la page complète. Ils ne peuvent pas la faire plus tard. »
     · « Pour les versions publiques, toutes les mises à jour se feront la nuit. »

   Elles ne se contredisent pas : elles ne parlent pas du même cas, et c'est ce partage qui les
   rend tenables toutes les deux.

   · OBLIGATOIRE — l'appareil est SOUS le minimum exigé. Écran bloquant, tout de suite, aucune
     sortie. C'est le cas où attendre coûte : cet appareil n'enregistre déjà plus rien pour
     l'équipe, et tant qu'il traîne il fait croire à son porteur qu'il travaille. Mesuré chez
     ELAN le 11 septembre : Benoit en v634, Mathieu et Mathys en v641, minimum exigé v665.
   · SIMPLE NOUVELLE VERSION — rien ne bloque, l'appareil travaille normalement. On ne prend
     PAS l'écran en pleine journée : ça s'installe la nuit, tout seul, page libre.

   ⛔ ET CE N'EST PAS LE « PLUS TARD » QU'ON VIENT DE CONDAMNER. La différence tient en une
   phrase : « plus tard » était un BOUTON — ça dépendait de quelqu'un, et une personne sur deux
   ne le touchait jamais, d'où Benoit resté en v634 pendant des semaines. Ici personne ne décide
   et personne ne peut repousser : c'est l'heure qui décide, et elle arrive tous les jours.

   ⚠️ LE PIÈGE QUI A FAILLI PASSER, et qui vaut plus que le reste de ce fichier : `majAppliquer`
   éteint le minuteur de nuit, et il est écrit DEUX CENTS LIGNES AU-DESSUS de l'endroit naturel
   où l'on aurait déclaré `_majNuit`. Un `let` plus bas les aurait mis en zone morte temporelle
   pour lui — et la ligne étant dans un try/catch, l'erreur aurait été avalée en silence : le
   minuteur aurait continué de tourner après le départ de la mise à jour. C'est exactement le
   genre de zone morte qui avait rendu tout le rangement de catégories inopérant le 10 septembre
   au matin, sans qu'aucun test ne le voie. La déclaration est donc remontée, et ce fichier
   vérifie la POSITION, pas seulement la présence. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

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

console.log('L’obligatoire prend l’écran ; le reste part la nuit');

// ══ 1) LA FENÊTRE DE NUIT — on joue la vraie fonction, heure par heure ═══════════════════
{
  const bornes = APP.match(/const MAJ_NUIT_DEBUT=(\d+), MAJ_NUIT_FIN=(\d+);/);
  v('les bornes sont nommées, pas semées dans le code', !!bornes, true);
  const src = corps(APP, 'function majEstNuit(');
  v('la fonction existe', src.length > 40, true);
  /* L'heure de L'APPAREIL, pas celle du serveur : c'est là que quelqu'un travaille ou non. */
  v('⛔ elle lit l’heure locale, pas une heure UTC', /getHours\(\)/.test(src) && !/getUTCHours/.test(src), true);
  const majEstNuit = eval('(' + src.replace(/^function majEstNuit/, 'function') + ')');
  const MAJ_NUIT_DEBUT = +bornes[1], MAJ_NUIT_FIN = +bornes[2];
  global.MAJ_NUIT_DEBUT = MAJ_NUIT_DEBUT; global.MAJ_NUIT_FIN = MAJ_NUIT_FIN;
  const h = n => majEstNuit(new Date(2026, 8, 12, n, 30, 0));

  /* Les heures de travail, une par une. Une équipe de terrain commence tôt : c'est 5 h le
     plancher, pas 6 h — on ne recharge jamais sous les doigts du premier levé. */
  for (const n of [5, 6, 7, 8, 10, 12, 15, 17, 19, 21])
    v('⛔ ' + n + ' h : on ne touche à rien, quelqu’un travaille peut-être', h(n), false);
  for (const n of [22, 23, 0, 2, 4])
    v('' + n + ' h : la mise à jour peut partir', h(n), true);
  v('la fenêtre commence à 22 h', MAJ_NUIT_DEBUT, 22);
  v('…et se referme à 5 h', MAJ_NUIT_FIN, 5);
}

// ══ 2) LE PARTAGE : obligatoire → écran ; le reste → la nuit ═════════════════════════════
{
  const p = corps(APP, 'function majPrete(');
  v('⛔ l’obligatoire prend l’écran tout de suite',
    /if\(oblig\|\|_versionBloquee\)\{ majEcranBloquant\(_versionMin\|\|''\); return; \}/.test(p), true);
  v('⛔ le reste part sur la nuit, sans rien afficher', /majNuitArmer\(\);/.test(p), true);
  v('…et l’écran bloquant n’est PAS le cas par défaut', p.indexOf('majEcranBloquant') < p.indexOf('majNuitArmer'), true);
  /* La bannière « nouvelle version » du service worker n'est pas un cas obligatoire : elle ne
     doit plus prendre l'écran d'un appareil qui travaille très bien. */
  v('⛔ la nouvelle version détectée ne prend plus l’écran en pleine journée',
    /function showUpdateBanner\(\)\{ majPrete\(!!_versionBloquee\); \}/.test(APP), true);
  /* Le filet de majArmer rechargeait tout de suite quand majPrete échouait : en pleine
     journée, ça emportait la page sous les doigts de quelqu'un pour une mise à jour qui
     n'urgeait pas. */
  v('⛔ le filet de majArmer ne recharge plus en pleine journée',
    /catch\(e\)\{ try\{ majNuitArmer\(\); \}catch\(_e\)\{\} \}/.test(APP), true);
  v('…et il ne rappelle plus majAppliquer directement',
    /try\{ majPrete\(false\); \}catch\(e\)\{ try\{ majAppliquer\(\); \}/.test(APP), false);
}

// ══ 3) LA BOUCLE D'ATTENTE — trois conditions, et l'obligatoire passe devant ═════════════
{
  const n = corps(APP, 'function majNuitArmer(');
  v('la boucle existe', n.length > 200, true);
  v('⛔ elle s’efface si l’obligatoire a pris la main',
    /if\(_majEnRoute\|\|_versionBloquee\)\{ _majNuit=false; return; \}/.test(n), true);
  v('elle attend le jour ET la page occupée', /if\(!majEstNuit\(\)\|\|occ\)\{ _majNuitTimer=setTimeout\(essayer,60000\); return; \}/.test(n), true);
  v('⛔ elle consulte bien majOccupe — personne n’est rechargé en pleine saisie', /const occ=majOccupe\(\);/.test(n), true);
  v('elle ne s’arme qu’une fois', /if\(_majNuit\) return; _majNuit=true;/.test(n), true);
  v('elle garde la version d’avant, pour pouvoir dire « c’est fait » au retour',
    /localStorage\.setItem\('elan_maj_depuis'/.test(n), true);
  /* majAppliquer pousse déjà la synchro : la doubler ici enverrait deux écritures pour rien. */
  v('elle ne double pas le travail de majAppliquer', /syncPush/.test(n), false);
  v('le pas de la boucle est d’une minute — pas de réveil toutes les secondes la nuit',
    /setTimeout\(essayer,60000\)/.test(n), true);
}

// ══ 4) ⛔ LA ZONE MORTE TEMPORELLE — on vérifie la POSITION, pas la présence ══════════════
/* Le contrôle qui compte. `majAppliquer` éteint le minuteur de nuit ; si la déclaration
   descendait un jour à côté de majNuitArmer (l'endroit « logique »), la ligne lèverait dans un
   try/catch, l'erreur serait avalée, et le minuteur tournerait après le départ de la mise à
   jour. Rien ne le dirait. */
{
  const decl = APP.indexOf('let _majNuit=false,_majNuitTimer=null;');
  v('la déclaration existe', decl > -1, true);
  const usage = APP.indexOf('_majNuit=false; clearTimeout(_majNuitTimer);');
  v('majAppliquer éteint bien le minuteur de nuit', usage > -1, true);
  v('⛔ et la déclaration est AVANT l’usage — pas de zone morte temporelle', decl < usage, true);
  /* Une seule déclaration : deux `let` du même nom dans deux portées ne lèveraient pas, ils
     feraient juste que l'un des deux n'éteint rien. */
  v('une seule déclaration de _majNuit', (APP.match(/let _majNuit\b/g) || []).length, 1);
  v('elle est déclarée avec les autres drapeaux de version', decl < APP.indexOf('function majAppliquer('), true);
}

// ══ 5) CE QUE LA v666 A FERMÉ NE SE ROUVRE PAS ═══════════════════════════════════════════
/* Le risque de ce lot : en rendant la mise à jour patiente, ré-ouvrir la porte qu'on venait
   de condamner. L'écran obligatoire doit rester exactement ce qu'il était. */
{
  const f = corps(APP, 'function majEcranBloquant(');
  v('⛔ toujours un seul bouton sur l’écran obligatoire', (f.match(/<button/g) || []).length, 1);
  v('⛔ toujours aucune croix', /this\.parentNode\.remove\(\)|✕/.test(f), false);
  v('⛔ toujours aucun « plus tard »', /plus tard|Plus tard|Terminer ma saisie/.test(f), false);
  v('le clavier ne sort toujours pas de l’écran', /ev\.key==='Tab'\)\{ ev\.preventDefault\(\)/.test(f), true);
  const a = corps(APP, 'function majAppliquer(');
  v('la synchro part toujours avant le rechargement', a.indexOf('syncPush(true)') < a.indexOf('location.reload()'), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
