const fs=require('fs'); const APP=fs.readFileSync('/home/user/teamop/app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+14000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
const code=['const norm = s =>','function idCatalogue(nom,prefixe){','function produitCle(p){','function uidTs(id){','function produitCree(p){','function produitsDistinctIds(cle){','function produitDistinct(p){','function produitsDistinctsDeclarer(cle,ids,nom){','function produitsDistinctsAnnuler(cle){','function produitsDoublons(){','function produitsFusionnables(l){','function produitsDoublonSurvivante(l){','function produitsFusionApercu(l){','function produitsFusionnerDoublons(cles){','const BOX_NOUVEAUTES_DEPUIS='].map(dec).join('\n');
const bac=new Function('etat',`let db=etat.db, journal=[];
  const logEvent=(a,b)=>journal.push(a+' · '+b); const save=()=>{etat.saves++;}; const currentUser={id:'u'}; const fullName=()=>'Justin';
  ${code}
  return { produitsFusionnerDoublons, produitsDoublons, produitsFusionnables, produitsFusionApercu, produitsDistinctsDeclarer, journal };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Le stock GLOBAL de la fiche retirée n\'est plus jeté');
{ const db={produits:[{id:'cat_gel',nom:'GEL SCIANT',qte:30,cree:0},{id:'zz',nom:'Gel sciant',qte:12,cree:0}],
    boxes:[{id:'b',stock:{cat_gel:{u:4,ctn:0},zz:{u:6,ctn:0}}}],mouvements:[],boxDecisions:[],produitsDistincts:[]};
  const g=bac({db,saves:0}); g.produitsFusionnerDoublons();
  v('une seule fiche',db.produits.length,1);
  v('les deux stocks globaux additionnés',db.produits[0].qte,42);
  v('et le stock de box aussi, comme avant',db.boxes[0].stock.cat_gel,{u:10,ctn:0}); }

console.log('Deux fiches sous le MÊME identifiant : leur stock global s\'additionne aussi');
{ const db={produits:[{id:'cat_a',nom:'ADVION',qte:8,cree:0},{id:'cat_a',nom:'ADVION',qte:5,cree:0}],
    boxes:[{id:'b',stock:{cat_a:{u:3,ctn:0}}}],mouvements:[],boxDecisions:[],produitsDistincts:[]};
  const g=bac({db,saves:0}); g.produitsFusionnerDoublons();
  v('une seule fiche',db.produits.length,1); v('8 + 5',db.produits[0].qte,13);
  v('le stock de la box est intact',db.boxes[0].stock,{cat_a:{u:3,ctn:0}}); }

console.log('« Pas dans cette box » survit à une fusion');
{ const D=Date.parse('2026-09-10T10:00:00Z');
  const db={produits:[{id:'cat_x',nom:'XILIX',cree:D+9000},{id:'zz',nom:'Xilix',cree:D+9000}],
    boxes:[{id:'b1',stock:{}}],mouvements:[],produitsDistincts:[],
    boxDecisions:[{id:'b1',ecartes:{zz:D+9500},par:'Justin',ts:D+9500}]};
  const g=bac({db,saves:0}); g.produitsFusionnerDoublons();
  v('la décision suit la fiche gardée',Object.keys(db.boxDecisions[0].ecartes),['cat_x']);
  v('elle porte la date la plus récente',db.boxDecisions[0].ecartes.cat_x,D+9500);
  v('la fiche écartée ne revient donc pas',db.produits.map(p=>p.id),['cat_x']); }

console.log('Une déclaration « ce sont deux produits » n\'est plus emportée par un troisième homonyme');
{ const db={produits:[{id:'cat_p',nom:'PIÈGE',cree:0},{id:'aa',nom:'Piege',cree:0},{id:'bb',nom:'PIEGE',cree:0},{id:'cc',nom:'piège',cree:0}],
    boxes:[{id:'b',stock:{cat_p:{u:1,ctn:0},aa:{u:2,ctn:0},bb:{u:4,ctn:0},cc:{u:8,ctn:0}}}],mouvements:[],boxDecisions:[],produitsDistincts:[]};
  const g=bac({db,saves:0}); g.produitsDistinctsDeclarer('piege',['cat_p','aa'],'PIÈGE');
  v('deux fiches seulement sont repliables',g.produitsFusionnables(g.produitsDoublons()[0]).map(p=>p.id),['bb','cc']);
  const r=g.produitsFusionnerDoublons();
  v('les deux déclarées sont toujours là',db.produits.map(p=>p.id).filter(id=>id==='cat_p'||id==='aa'),['cat_p','aa']);
  v('les deux autres se sont repliées en une',db.produits.length,3);
  v('la déclaration de l\'équipe tient',(db.produitsDistincts[0]||{}).ids,['aa','cat_p']);
  v('le compte annoncé est celui du repli réel',[r.paires,r.fiches],[1,1]);
  v('aucun stock perdu',Object.values(db.boxes[0].stock).reduce((t,x)=>t+x.u,0),15); }

console.log('Un groupe ENTIÈREMENT déclaré ne promet rien et ne casse rien');
{ const db={produits:[{id:'cat_p',nom:'PIÈGE',cree:0},{id:'aa',nom:'Piege',cree:0}],boxes:[],mouvements:[],boxDecisions:[],produitsDistincts:[]};
  const g=bac({db,saves:0}); g.produitsDistinctsDeclarer('piege',['cat_p','aa'],'PIÈGE');
  v('le bandeau ne le signale plus',g.produitsDoublons().length,0);
  v('et rien ne se fusionne',[g.produitsFusionnerDoublons().paires,db.produits.length],[0,2]); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
