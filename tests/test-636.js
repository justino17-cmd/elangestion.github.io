const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+16000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
function cst(n){ const i=APP.indexOf('const '+n+'='); const fin=APP.indexOf('];',i); return APP.slice(i,fin+2); }
function obj(n){ const i=APP.indexOf('const '+n+'={'); let p=0,d=APP.indexOf('{',i); for(let j=d;j<APP.length;j++){ if(APP[j]==='{')p++; else if(APP[j]==='}'){p--; if(!p) return APP.slice(i,j+2);} } }
const code=[cst('CATALOGUE'),cst('FOURNISSEURS_3D'),cst('CAT_LIST'),obj('METIERS'),dec("METIERS['3d'].catalogue=CATALOGUE;"),dec("METIERS['3d'].fournisseurs=FOURNISSEURS_3D;"),
  dec('function metierPackDe(base){'),"const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');",
  dec('function slugNom(nom){'),dec('function idCatalogue(nom,prefixe){'),dec('function produitCle(p){'),dec('function cataloguePoser(cible,opts){'),dec('function cataloguePackNeufs(d){')].join('\n');
const bac=new Function('etat',`let db=etat.db||{}; const uid=()=>'u'+(etat.n=(etat.n||0)+1);
  ${code}
  return { cataloguePackNeufs, cataloguePoser, idCatalogue, produitCle, CATALOGUE, CAT_LIST };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
const g=bac({}); const T0=Date.now();
const pack110=()=>g.CATALOGUE.slice(0,110).map(c=>({id:g.idCatalogue(c[0]),nom:c[0],categorie:c[1],fournisseurs:c[2],cree:0}));

console.log('Une entreprise qui TRAVAILLE DÉJÀ avec le pack se voit proposer la suite, datée');
{ const d={produits:pack110(),fournisseurs:[],journal:[]};
  v('le compte annoncé est exact, et RIEN n\'est écrit',[g.cataloguePackNeufs(d).length,d.produits.length],[50,110]);
  const n=g.cataloguePoser(d,{ancien:true,naissance:Date.now()}).produits;
  v('le tap les pose',[n,d.produits.length],[50,160]);
  v('datées de maintenant : ce sont des nouveautés',d.produits.slice(110).every(p=>p.cree>=T0),true);
  v('mais datées d\'avant tout pour la fusion : une suppression volontaire garde le dessus',d.produits.slice(110).every(p=>p._m===1),true);
  v('rangées dans les huit catégories',d.produits.filter(p=>!g.CAT_LIST.includes(p.categorie)).length,0);
  v('les fiches fournisseurs suivent',d.fournisseurs.length,5);
  v('les 110 d\'avant ne sont pas re-datées',d.produits.slice(0,110).every(p=>p.cree===0),true);
  v('plus rien à proposer ensuite',[g.cataloguePackNeufs(d).length,d.produits.length],[0,160]); }

console.log('Une entreprise qui n\'a JAMAIS eu le pack ne reçoit rien');
{ const d={produits:[{id:'a',nom:'Balai'},{id:'b',nom:'Serpillère'},{id:'c',nom:'Seau'},{id:'d',nom:'Détergent'},{id:'e',nom:'Gants ménage'},{id:'f',nom:'Aspirateur'}],fournisseurs:[],journal:[]};
  v('métier 3D par défaut, mais le pack n\'est pas en place ici',g.cataloguePackNeufs(d).length,0);
  v('rien n\'a bougé',[d.produits.length,d.fournisseurs.length,d.journal.length],[6,0,0]); }

console.log('Un métier sans pack ne reçoit rien, même avec des noms du pack 3D');
{ const d={metier:'nettoyage',produits:pack110(),fournisseurs:[],journal:[]};
  v('aucun pack pour ce métier',g.cataloguePackNeufs(d).length,0);
  v('les 110 restent tels quels',d.produits.length,110); }

console.log('Une base vide ou presque reste vide');
{ v('base vide',g.cataloguePackNeufs({produits:[],fournisseurs:[],journal:[]}).length,0);
  const q=pack110().slice(0,4);
  v('quatre fiches du pack : sous le seuil de cinq, on ne propose rien',g.cataloguePackNeufs({produits:q,fournisseurs:[],journal:[]}).length,0);
  v('cinq fiches du pack : le seuil est atteint',g.cataloguePackNeufs({produits:pack110().slice(0,5),fournisseurs:[],journal:[]}).length,155);
  v('rien du tout',g.cataloguePackNeufs({}).length,0); }

console.log('Ce qui a été supprimé exprès ne revient pas par la porte de derrière');
{ /* la pierre tombale gagne quand t >= _m, et _m vaut 1 : elle gagne toujours */
  const d={produits:pack110(),fournisseurs:[],journal:[]};
  g.cataloguePoser(d,{ancien:true,naissance:Date.now()});
  const cible=d.produits.find(p=>/VULCANO PATE$/.test(p.nom));
  v('la fiche existe',!!cible,true);
  v('et sa date de fusion la met derrière n\'importe quelle tombe',cible._m<2,true); }

console.log('L\'ordre du fichier : catalogueCompleter est appelée depuis migrate, avant le chargement');
{ const lig=APP.split('\n'); const l=m=>lig.findIndex(x=>x.startsWith(m))+1;
  v('migrate n\'écrit RIEN dans le catalogue : le geste est à l\'utilisateur',/catalogueCompleter/.test(APP),false);
  v('la bande de synchro est en tête de l\'onglet Ajouter',/el\.innerHTML=bandePack\+groupe/.test(APP),true);
  v('la bulle compte ce qui manque',/const nPack=cataloguePackNeufs\(\)\.length;/.test(APP),true);
  v('le tap passe par cataloguePackSync',/onclick="cataloguePackSync\(\)"/.test(APP),true);
  v('la cible tactile bat la spécificité de la refonte',/html\[data-refonte\] \.bxp-cibles-l \.btn\.sm\{min-height:44px/.test(APP),true);
  v('cataloguePoser sait dater',/const naissance=\(opts&&\+opts\.naissance\)\|\|0;/.test(APP),true);
  v('et le bouton « ↻ Catalogue OP » date aussi',/cataloguePoser\(db,\{naissance:Date\.now\(\)\}\)/.test(APP),true);
  ['const METIERS=','const CATALOGUE=','const FOURNISSEURS_3D=','const CAT_LIST='].forEach(m=>v(m.replace(/[=(].*$/,'').trim()+' est déclarée avant le chargement',l(m)>0&&l(m)<l('let db = load();'),true)); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
