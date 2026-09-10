/* Le pont entre deux espaces : ce qu'on copie d'un côté doit se relire à l'identique de l'autre. */
const fs=require('fs'); const APP=fs.readFileSync('/home/user/teamop/app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error('introuvable : '+h);
  for(let i=d;i<d+9000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin : '+h); }
const morceaux=['const norm = s =>','const CAT_LIST=','function devineCat(nom){','function catalogueLignes(list){','function produitsVisibles(){','function plAnalyse(){'].map(dec).join('\n');
const bac=new Function('etat',`let db=etat.db, prdOnglet=etat.onglet, prdSearch=etat.q, _plLignes=[], champ='';
  const CAT_DEVINE=[]; const $=id=>id==='pl-texte'?{value:champ}:null;
  ${morceaux}
  return { catalogueLignes, produitsVisibles, lire:t=>{ champ=t; plAnalyse(); return _plLignes; }, regler:(o,s)=>{ prdOnglet=o; prdSearch=s; } };`)
  ({db:{produits:[]},onglet:'tous',q:''});
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

const source=[
  {id:'1',nom:'VULCANO BLOC BROMA 30',fournisseurs:['ORCAD'],prix:0,ref:'VB30',categorie:'TP14 — Rodenticide',perso:true},
  {id:'2',nom:'Gel blattes Maxforce',fournisseurs:['MABI'],prix:24.9,ref:'',categorie:'TP18 — Insecticide',perso:true},
  {id:'3',nom:'Gants nitrile',fournisseurs:[],prix:0,ref:'GN9',categorie:'EPI',perso:false},
  {id:'4',nom:'Piège ; à glu',fournisseurs:['ARMOSA'],prix:3.5,ref:'PG;1',categorie:'Piégeage',perso:true}];

console.log('Ce qui est copié');
const lignes=bac.catalogueLignes(source);
v('une ligne par produit',lignes.length,4);
v('nom, fournisseur, prix, réf, catégorie',lignes[1],'Gel blattes Maxforce ; MABI ; 24,9 ;  ; TP18 — Insecticide');
v('sans fournisseur ni prix, les colonnes restent en place',lignes[2],'Gants nitrile ;  ;  ; GN9 ; EPI');
v('le point-virgule d\'un nom ne casse pas les colonnes',lignes[3].split(';').length,5);
v('… et le nom garde son sens',lignes[3].split(';')[0].trim(),'Piège à glu');

console.log('Ce qui est relu de l\'autre côté');
const relu=bac.lire(lignes.join('\n'));
v('quatre produits',relu.length,4);
v('VULCANO complet',relu[0],{nom:'VULCANO BLOC BROMA 30',fournisseur:'ORCAD',prix:0,ref:'VB30',categorie:'TP14 — Rodenticide'});
v('le prix français revient en nombre',relu[1].prix,24.9);
v('la catégorie est reprise, pas devinée',relu[2].categorie,'EPI');

console.log('L\'ancien format continue de passer');
v('deux colonnes',bac.lire('MUSKIL bloc 10 kg ; SODIF')[0],{nom:'MUSKIL bloc 10 kg',fournisseur:'SODIF',prix:0,ref:'',categorie:''});
v('une seule colonne',bac.lire('Gants')[0],{nom:'Gants',fournisseur:'',prix:0,ref:'',categorie:''});
v('une catégorie inventée est ignorée',bac.lire('X ; Y ; 1 ; R ; Bidule')[0].categorie,'');
v('les lignes vides sautent',bac.lire('A\n\n  \nB').length,2);

console.log('Ce qu\'on voit est ce qu\'on copie');
bac.regler('perso',''); const dbLoc={produits:source};
const vis=(o,q)=>{ bac.regler(o,q); return bac.produitsVisibles.call({},...[]) };
/* produitsVisibles lit db du bac : on la remplit */
const bac2=new Function('etat',`let db=etat.db, prdOnglet='tous', prdSearch='';
  ${morceaux}
  return { visibles:(o,q)=>{ prdOnglet=o; prdSearch=q; return produitsVisibles().map(p=>p.nom); } };`)({db:dbLoc});
v('onglet « mes produits »',bac2.visibles('perso',''),['VULCANO BLOC BROMA 30','Gel blattes Maxforce','Piège ; à glu']);
v('recherche « vulcano »',bac2.visibles('tous','vulcano'),['VULCANO BLOC BROMA 30']);
v('recherche par référence',bac2.visibles('tous','gn9'),['Gants nitrile']);
console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
