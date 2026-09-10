/* Vérifie le PÉRIMÈTRE des permissions sur le code RÉELLEMENT LIVRÉ (app.html).

   Deux promesses tiennent cette mécanique, et un test doit défendre les deux :

     • ce qu'on voit se restreint quand on rattache quelqu'un à un chef — un chef ne voit
       que SON équipe, un technicien que SES interventions, et les clients, devis,
       factures et pointages suivent le même fil ;
     • tant que PERSONNE n'est rattaché, rien ne change. On ne retire jamais un accès en
       silence : c'est le rattachement, fait à la main, qui restreint.

   Les fonctions sont découpées dans app.html et exécutées telles quelles.

   Usage : node scripts/verifier-permissions.js   (depuis la racine du dépôt) */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');

/* Découpe une déclaration à partir de son en-tête : on avance d'accolade fermante en
   accolade fermante jusqu'à ce que le morceau compile. Plus sûr qu'une expression
   régulière sur du code dense, où une accolade peut vivre dans une chaîne. */
function decoupe(entete) {
  const deb = APP.indexOf(entete);
  if (deb < 0) { console.error('introuvable dans app.html : ' + entete); process.exit(1); }
  for (let i = deb; i < deb + 20000; i++) {
    if (APP[i] !== '}' && APP[i] !== ';') continue;
    const bout = APP.slice(deb, i + 1);
    try { new Function(bout); return bout; } catch (e) { /* pas encore complet */ }
  }
  console.error('fin de déclaration introuvable pour : ' + entete);
  process.exit(1);
}

const MORCEAUX = [
  'const fullName = u =>',
  'const CAPS_HERITE = {',
  'const CAPS = Object.fromEntries',
  'function userCap(u,cap){',
  'function can(cap){',
  'function myTechId(){',
  'function intTechIds(i){',
  /* Les rôles sont devenus libres (v613) : chefsPossibles lit maintenant leur déclaration,
     il faut donc embarquer de quoi la lire, sinon le bac à sable tombe sur roleEstChef. */
  'const ROLE = {',
  'const ROLE_TECH_BASE=',
  'const ROLE_CHEF_BASE=',
  'function rolesPerso(){',
  'function roleDef(cle){',
  'function roleEstTech(cle){',
  'function roleEstChef(cle){',
  'function chefsPossibles(sauf){',
  'function equipeDe(u){',
  'function perimetreTechIds(u){',
  'function perimetreUserIds(u){',
  'function visibleInts(list){',
  'function mesClientIds(){',
  'function creeParMoi(x){',
  'function visibleClients(list){',
  'function visibleDocs(list){',
  'function visiblePointages(list){',
  'function boxValidRequis(){',
  /* Les quatre filtres qui ignoraient le périmètre d'un DR (v622, 10 septembre 2026) */
  'const todayISO = () =>',
  'function delegationActive(u){',
  'function delegationsRecues(u){',
  'const boxExclu=',
  'function visibleBoxes(list){',
  'function mesBoxIds(){',
  'function visibleMouvements(list){',
  'function vehiculeAuto(v,u){',
  'const vehExclu=',
  'function userVehiculeVoitIl(v,u){',
  'function visibleVehicules(list){',
  'function visibleJournal(list){'
].map(decoupe).join('\n');

/* Un bac à sable minimal : les fonctions livrées lisent « db » et « currentUser ». */
const bac = new Function('etat', `
  let db = etat.db, currentUser = etat.currentUser;
  ${MORCEAUX}
  return {
    poser: (d, u) => { db = d; currentUser = u; },
    perimetreTechIds, perimetreUserIds, visibleInts, visibleClients, visibleDocs,
    visiblePointages, boxValidRequis, chefsPossibles, equipeDe,
    visibleBoxes, visibleVehicules, visibleMouvements, visibleJournal
  };
`)({ db: {}, currentUser: null });

let echecs = 0, reussites = 0;
function verifie(titre, obtenu, attendu) {
  const ok = String(obtenu) === String(attendu);
  if (ok) { reussites++; console.log('  ✓ ' + titre); }
  else { echecs++; console.log('  ✗ ' + titre + '\n      attendu : ' + attendu + '\n      obtenu  : ' + obtenu); }
}

/* ── L'espace d'essai : deux équipes, un chef chacune ── */
function espace() {
  return {
    users: [
      { id: 'uAdmin', prenom: 'Ada', nom: 'Admin', role: 'admin', actif: true },
      { id: 'uChefA', prenom: 'Chef', nom: 'Nord', role: 'chefEquipe', actif: true, techId: 'tChefA' },
      { id: 'uChefB', prenom: 'Chef', nom: 'Sud', role: 'chefEquipe', actif: true, techId: 'tChefB' },
      { id: 'uTecA1', prenom: 'Karim', nom: 'Nord1', role: 'technicien', actif: true, techId: 'tA1', chefId: 'uChefA' },
      { id: 'uTecA2', prenom: 'Sofia', nom: 'Nord2', role: 'technicien', actif: true, techId: 'tA2', chefId: 'uChefA' },
      { id: 'uTecB1', prenom: 'Tom', nom: 'Sud1', role: 'technicien', actif: true, techId: 'tB1', chefId: 'uChefB' }
    ],
    techniciens: [{ id: 'tChefA', nom: 'Chef Nord' }, { id: 'tChefB', nom: 'Chef Sud' },
      { id: 'tA1', nom: 'Karim Nord1' }, { id: 'tA2', nom: 'S. Nord2' }, { id: 'tB1', nom: 'Tom Sud1' }],
    clients: [{ id: 'cN1' }, { id: 'cN2' }, { id: 'cS1' }, { id: 'cX' }],
    interventions: [
      { id: 'i1', clientId: 'cN1', techIds: ['tA1'] },
      { id: 'i2', clientId: 'cN2', techIds: ['tA2'] },
      { id: 'i3', clientId: 'cS1', techIds: ['tB1'] }
    ],
    devis: [{ id: 'd1', clientId: 'cN1' }, { id: 'd2', clientId: 'cS1' }, { id: 'd3', clientId: 'cX' }],
    factures: [{ id: 'f1', clientId: 'cN1' }, { id: 'f2', clientId: 'cS1' }],
    pointages: [{ id: 'p1', techId: 'tA1' }, { id: 'p2', techId: 'tB1' }],
    boxes: [
      { id: 'bA1', techIds: ['tA1'] },            // la box du technicien Nord1
      { id: 'bB1', techIds: ['tB1'] },            // celle du Sud
      { id: 'bTous', visibleTous: true },
      { id: 'bChefA', respUserId: 'uChefA' },     // le chef Nord en est responsable
      { id: 'bPourB', userIds: ['uChefB'] },      // désignée pour le chef Sud
      { id: 'bX' }                                // à personne
    ],
    vehicules: [{ id: 'vA1', techId: 'tA1' }, { id: 'vB1', techId: 'tB1' }, { id: 'vChefA', userIds: ['uChefA'] }, { id: 'vX' }],
    mouvements: [{ id: 'm1', boxId: 'bA1' }, { id: 'm2', boxId: 'bB1' }, { id: 'm3', technicien: 'Karim Nord1' }, { id: 'm4', boxId: 'bX' },
      /* fait par un utilisateur du Nord dont la fiche technicien porte un autre nom : c'est le nom
         d'utilisateur qui est écrit sur la ligne, c'est lui qui doit compter */
      { id: 'm5', technicien: 'Sofia Nord2' }, { id: 'm6', technicien: 'Tom Sud1' }],
    journal: [{ id: 'j1', userId: 'uTecA1' }, { id: 'j2', userId: 'uTecB1' }, { id: 'j3', userId: 'uChefA' }, { id: 'j4', userId: 'uAdmin', cibleUserId: 'uTecA2' }],
    /* les chefs ont « tout voir », les techniciens non — les défauts de l'application */
    permissions: { chefEquipe: { caps: { voirTout: true } }, technicien: { caps: { voirTout: false } } }
  };
}
const ids = l => l.map(x => x.id).join(',') || '—';
function regarde(db, uid) {
  bac.poser(db, db.users.find(x => x.id === uid));
  return {
    interventions: ids(bac.visibleInts(db.interventions)),
    clients: ids(bac.visibleClients(db.clients)),
    devis: ids(bac.visibleDocs(db.devis)),
    factures: ids(bac.visibleDocs(db.factures)),
    pointages: ids(bac.visiblePointages(db.pointages)),
    boxes: ids(bac.visibleBoxes(db.boxes)),
    vehicules: ids(bac.visibleVehicules(db.vehicules)),
    mouvements: ids(bac.visibleMouvements(db.mouvements)),
    journal: ids(bac.visibleJournal(db.journal))
  };
}

console.log('\nChacun ne voit que ce qui le concerne');
let db = espace();
const admin = regarde(db, 'uAdmin');
verifie("l'administrateur voit tout (interventions)", admin.interventions, 'i1,i2,i3');
verifie("l'administrateur voit tout (clients)", admin.clients, 'cN1,cN2,cS1,cX');
verifie("l'administrateur voit tout (box, véhicules, mouvements, journal)", [admin.boxes, admin.vehicules, admin.mouvements, admin.journal].join(' | '), 'bA1,bB1,bTous,bChefA,bPourB,bX | vA1,vB1,vChefA,vX | m1,m2,m3,m4,m5,m6 | j1,j2,j3,j4');

const chefA = regarde(db, 'uChefA');
verifie('le chef Nord ne voit que les interventions de SON équipe', chefA.interventions, 'i1,i2');
verifie('… et les clients de son équipe seulement', chefA.clients, 'cN1,cN2');
verifie('… ses devis', chefA.devis, 'd1');
verifie('… ses factures', chefA.factures, 'f1');
verifie('… ses pointages', chefA.pointages, 'p1');
verifie('… ses box : celles de son équipe, la sienne, celles visibles par tous — pas celles du Sud', chefA.boxes, 'bA1,bTous,bChefA');
verifie('… ses véhicules : celui de son équipe et celui désigné pour lui', chefA.vehicules, 'vA1,vChefA');
verifie('… ses mouvements : ceux de ses box et ceux faits par son équipe', chefA.mouvements, 'm1,m3,m5');
verifie('… son journal : son équipe, lui-même, et ce qui vise son équipe', chefA.journal, 'j1,j3,j4');

const chefB = regarde(db, 'uChefB');
verifie("le chef Sud ne voit pas l'équipe Nord", chefB.interventions, 'i3');
verifie('… ni ses clients', chefB.clients, 'cS1');
verifie('… ni ses box, ni ses véhicules, ni ses mouvements, ni son journal', [chefB.boxes, chefB.vehicules, chefB.mouvements, chefB.journal].join(' | '), 'bB1,bTous,bPourB | vB1 | m2,m6 | j2');

const tec = regarde(db, 'uTecA1');
verifie('un technicien ne voit que SES interventions', tec.interventions, 'i1');
verifie('… et seulement le client où il est allé', tec.clients, 'cN1');
verifie('… et les papiers de ce client', tec.devis + ' | ' + tec.factures, 'd1 | f1');
verifie('… et son seul pointage', tec.pointages, 'p1');
verifie('… sa box, son véhicule, ses mouvements, son journal — rien ne change pour lui', [tec.boxes, tec.vehicules, tec.mouvements, tec.journal].join(' | '), 'bA1,bTous | vA1 | m1,m3 | j1');

console.log('\nRien n\'est retiré tant que personne n\'est rattaché');
db = espace();
db.users.forEach(u => { if (u.chefId === 'uChefA') u.chefId = ''; });
const chefSeul = regarde(db, 'uChefA');
verifie('un chef sans équipe voit tout, comme avant (interventions)', chefSeul.interventions, 'i1,i2,i3');
verifie('… comme avant (clients)', chefSeul.clients, 'cN1,cN2,cS1,cX');
verifie('… comme avant (devis)', chefSeul.devis, 'd1,d2,d3');
verifie('… comme avant (box, véhicules, mouvements, journal)', [chefSeul.boxes, chefSeul.vehicules, chefSeul.mouvements, chefSeul.journal].join(' | '), 'bA1,bB1,bTous,bChefA,bPourB,bX | vA1,vB1,vChefA,vX | m1,m2,m3,m4,m5,m6 | j1,j2,j3,j4');

console.log('\nCe qu\'on a créé soi-même reste à soi');
db = espace();
db.clients.push({ id: 'cNeuf', creePar: 'uTecA1' });
verifie('un client créé par un technicien lui reste visible', regarde(db, 'uTecA1').clients, 'cN1,cNeuf');

console.log('\nLa validation DR, en interrupteur d\'entreprise');
db = espace();
bac.poser(db, db.users.find(x => x.id === 'uTecA1'));
verifie('sans interrupteur ni case, aucune validation exigée', bac.boxValidRequis(), false);
db.validDRTous = true;
verifie('interrupteur posé : la validation devient exigée', bac.boxValidRequis(), true);
bac.poser(db, db.users.find(x => x.id === 'uAdmin'));
verifie('… mais jamais pour qui valide (il se validerait lui-même)', bac.boxValidRequis(), false);
db.validDRTous = false;
bac.poser(db, Object.assign({}, db.users.find(x => x.id === 'uTecA1'), { boxValidDR: true }));
verifie('la case de la fiche reste honorée', bac.boxValidRequis(), true);

console.log('\nLe rattachement lui-même');
db = espace();
bac.poser(db, db.users.find(x => x.id === 'uChefA'));
verifie('on ne peut pas être son propre chef', ids(bac.chefsPossibles('uChefA')), 'uAdmin,uChefB');
verifie("l'équipe d'un chef est bien la sienne", ids(bac.equipeDe(db.users.find(x => x.id === 'uChefA'))), 'uTecA1,uTecA2');
db.users.find(x => x.id === 'uTecA2').actif = false;
verifie('un compte désactivé sort du périmètre', ids(bac.equipeDe(db.users.find(x => x.id === 'uChefA'))), 'uTecA1');

console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s)' : '✓ ' + reussites + ' vérifications, aucun échec'));
process.exit(echecs ? 1 : 0);
