const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+14000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
function cst(n){ const i=APP.indexOf('const '+n+'='); const fin=APP.indexOf('];',i); return APP.slice(i,fin+2); }
function obj(n){ const i=APP.indexOf('const '+n+'={'); let p=0,d=APP.indexOf('{',i); for(let j=d;j<APP.length;j++){ if(APP[j]==='{')p++; else if(APP[j]==='}'){p--; if(!p) return APP.slice(i,j+2);} } }
const code=[cst('CATALOGUE'),cst('FOURNISSEURS_3D'),cst('CAT_LIST'),obj('METIERS'),dec("METIERS['3d'].catalogue=CATALOGUE;"),dec("METIERS['3d'].fournisseurs=FOURNISSEURS_3D;"),dec('function metierPackDe(base){'),
  'const norm = s => (s||\'\').toLowerCase().normalize(\'NFD\').replace(/[\\u0300-\\u036f]/g,\'\');',
  dec('function slugNom(nom){'),dec('function idCatalogue(nom,prefixe){'),dec('function produitCle(p){'),dec('function cataloguePoser(cible,opts){'),dec('function catalogueEnPlace(){')].join('\n');
const bac=new Function('etat',`let db=etat.db; const uid=()=>'u'+(etat.n=(etat.n||0)+1);
  ${code}
  return { cataloguePoser, catalogueEnPlace, metierPackDe, idCatalogue, produitCle, CATALOGUE, CAT_LIST, METIERS };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Le pack appartient au métier 3D');
{ const g=bac({db:{produits:[]}});
  v('160 références, toutes dans les huit catégories',[g.CATALOGUE.length,g.CATALOGUE.filter(c=>!g.CAT_LIST.includes(c[1])).length],[160,0]);
  v('rattaché au métier 3D',g.METIERS['3d'].catalogue===g.CATALOGUE,true);
  v('aucun autre métier n\'a de pack',Object.keys(g.METIERS).filter(k=>k!=='3d'&&g.METIERS[k].catalogue).length,0);
  v('sans métier réglé, c\'est la 3D (les entreprises d\'avant le choix)',g.metierPackDe({}).nom,'3D — Hygiène anti-nuisibles');
  v('un métier inconnu retombe aussi sur la 3D',g.metierPackDe({metier:'boulangerie'}).nom,'3D — Hygiène anti-nuisibles'); }

console.log('« ↻ Catalogue OP » sur un espace 3D qui a l\'ancien pack : exactement les 50 arrivent');
{ const g=bac({db:{produits:[]}});
  const ancien=g.CATALOGUE.slice(0,110);
  const base={metier:'3d',produits:ancien.map(c=>({id:g.idCatalogue(c[0]),nom:c[0],categorie:c[1],fournisseurs:c[2],qte:3})),fournisseurs:[]};
  const g2=bac({db:base}); v('le bouton se montre',g2.catalogueEnPlace(),true);
  const r=g2.cataloguePoser(base);
  v('50 produits posés, pas un de plus',r.produits,50);
  v('160 au total, sans doublon de nom',[base.produits.length,new Set(base.produits.map(p=>g.produitCle(p))).size],[160,160]);
  v('les 50 portent une catégorie des huit',base.produits.slice(110).every(p=>g.CAT_LIST.includes(p.categorie)),true);
  v('les anciens gardent leur stock',base.produits[0].qte,3);
  v('les cinq fiches fournisseurs sont venues',base.fournisseurs.length,5);
  v('rejouer ne pose rien de plus',g2.cataloguePoser(base).produits,0); }

console.log('Un métier sans pack ne reçoit rien et ne voit pas le bouton');
{ const base={metier:'nettoyage',produits:[{id:'a',nom:'ALTA 7000'},{id:'b',nom:'ADVION GEL BLATTES 30G'},{id:'c',nom:'CYTROL FORTE WP'},{id:'d',nom:'TEENOX EC'},{id:'e',nom:'NEBULOUS TURBO'},{id:'f',nom:'X'}],fournisseurs:[]};
  const g=bac({db:base});
  v('même avec cinq noms du pack 3D, pas de bouton',g.catalogueEnPlace(),false);
  v('et rien ne se pose',g.cataloguePoser(base),{produits:0,fournisseurs:0}); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
