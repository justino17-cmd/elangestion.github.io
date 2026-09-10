const fs=require('fs'); const APP=fs.readFileSync('/home/user/teamop/app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+12000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
const code=['const norm = s =>','function idCatalogue(nom,prefixe){','function produitCle(p){','function uidTs(id){','function produitCree(p){','function produitsDistinctIds(cle){','function produitDistinct(p){','function produitsDistinctsAnnuler(cle){','function produitsDoublons(){','function produitsFusionnables(l){','function produitsDoublonSurvivante(l){','function produitsFusionnerDoublons(cles){','function produitsRecents(){','function boxDecision(b){','function boxVuTs(b){','function boxNouveautes(b,cands){','function boxDecisionAnnuler(b,pid){','function boxPoserProduits(b,ids,opts){','function abpDisponibles(b){','function boxAutoNouveautes(b){','const BOX_NOUVEAUTES_DEPUIS='].map(dec).join('\n');
const bac=new Function('etat',`let db=etat.db, journal=[], toasts=[];
  const logEvent=(a,b)=>journal.push(a+' · '+b); const save=()=>{etat.saves++;}; const toast=t=>toasts.push(t);
  const produit=id=>(db.produits||[]).find(p=>p.id===id)||{}; const visibleBoxes=l=>l; const currentUser={id:'u'}; const fullName=()=>'Justin';
  ${code}
  return { produitsFusionnerDoublons, produitsDoublons, boxAutoNouveautes, boxNouveautes, produitsRecents, idCatalogue, journal, toasts };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Deux fiches sous le même identifiant : plus de perte');
{ const db={produits:[{id:'cat_debusk',nom:'AÉROSOL DEBUSK',_m:5,cree:0,ref:'D1'},{id:'cat_debusk',nom:'AEROSOL DEBUSK',_m:9,cree:0,prix:12},{id:'cat_gants',nom:'GANTS',cree:0}],
    boxes:[{id:'bx',nom:'Box',stock:{cat_debusk:{u:12,ctn:0},cat_gants:{u:3,ctn:0}}}],mouvements:[{id:'m1',produitId:'cat_debusk',qte:2}]};
  const g=bac({db,saves:0}); const r=g.produitsFusionnerDoublons();
  v('la fiche survit',db.produits.map(p=>p.nom),['AÉROSOL DEBUSK','GANTS']);
  v('le stock de la box est intact',db.boxes[0].stock,{cat_debusk:{u:12,ctn:0},cat_gants:{u:3,ctn:0}});
  v('elle a récupéré ce qui lui manquait',[db.produits[0].ref,db.produits[0].prix],['D1',12]);
  v('le mouvement pointe toujours dessus',db.mouvements[0].produitId,'cat_debusk');
  v('plus aucun doublon',g.produitsDoublons().length,0); }

console.log('Les deux défauts ensemble : même identifiant ET même nom sous deux identifiants');
{ const db={produits:[{id:'cat_a',nom:'ADVION',cree:0},{id:'cat_a',nom:'ADVION',cree:0},{id:'zz',nom:'Advion',cree:0}],
    boxes:[{id:'bx',nom:'Box',stock:{cat_a:{u:4,ctn:0},zz:{u:6,ctn:0}}}],mouvements:[]};
  const g=bac({db,saves:0}); g.produitsFusionnerDoublons();
  v('une seule fiche',db.produits.length,1); v('stock additionné sur la fiche à identifiant déduit du nom',db.boxes[0].stock,{cat_a:{u:10,ctn:0}});
  v('c\'est bien celle-là qui survit',db.produits[0].id,'cat_a'); }

console.log('Le catalogue se pose dans TOUTES les box visibles');
{ const D=Date.parse('2026-09-10T10:00:00Z');
  const db={produits:[{id:'p1',nom:'NEUF UN',cree:D+1000},{id:'p2',nom:'NEUF DEUX',cree:D+2000},{id:'p0',nom:'ANCIEN',cree:0}],
    boxes:[{id:'b1',nom:'Nord',stock:{}},{id:'b2',nom:'Sud',stock:{p0:{u:5,ctn:0}}},{id:'b3',nom:'Fermée',actif:false,stock:{}}],
    boxDecisions:[],produitsDistincts:[],mouvements:[],boxMvtAttente:[]};
  const g=bac({db,saves:0}); const n=g.boxAutoNouveautes(db.boxes[0]);
  v('les deux box actives reçoivent les deux nouveautés',[Object.keys(db.boxes[0].stock).sort(),Object.keys(db.boxes[1].stock).sort()],[['p1','p2'],['p0','p1','p2']]);
  v('la box inactive est laissée tranquille',Object.keys(db.boxes[2].stock),[]);
  v('le stock existant n\'est pas touché',db.boxes[1].stock.p0,{u:5,ctn:0});
  v('le message dit combien et dans combien de box',/4 produits du catalogue ajoutés à zéro dans 2 box/.test(g.toasts[g.toasts.length-1]),true);
  v('rendu pour la box ouverte',n,2);
  v('rien à reposer au passage suivant',g.boxAutoNouveautes(db.boxes[0]),0); }
console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
