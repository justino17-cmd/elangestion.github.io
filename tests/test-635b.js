const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+14000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
const code=['const norm = s =>','function produitCle(p){','function uidTs(id){','function produitCree(p){','function produitsDistinctIds(cle){','function produitDistinct(p){',
  'function boxDecision(b){','function boxDecider(b,ids){','function boxDecisionAnnuler(b,pid){','function abpDisponibles(b){','function boxPoserProduits(b,ids,opts){',
  'function bxpCibles(){','function bxpPosePlan(ids){','function bxpPoseAnnuler(){'].map(dec).join('\n');
const bac=new Function('etat',`let db=etat.db, journal=[], toasts=[];
  let bxpCiblesSel=new Set(etat.cibles||[]), _dernierePose=null;
  const logEvent=(a,b)=>journal.push(a+' · '+b); const save=()=>{etat.saves=(etat.saves||0)+1;}; const toast=t=>toasts.push(t);
  const visibleBoxes=l=>(l||[]).filter(b=>!etat.cache||!etat.cache.includes(b.id));
  const bxpBox=()=>db.boxes.find(x=>x.id===etat.ouverte);
  const renderBoxDetail=()=>{}; const produit=id=>(db.produits||[]).find(p=>p.id===id)||{}; const currentUser={id:'u'}; const fullName=()=>'Chef';
  ${code}
  return { boxPoserProduits, bxpCibles, bxpPosePlan, bxpPoseAnnuler, boxDecider, boxDecision,
    poser(ids){ /* l'écriture d'addBoxProd, extraite telle quelle pour être testable */
      const b=bxpBox(); const uniq=[...new Set(ids)]; const paires=[]; let poses=0, touchees=0, ici=0, deja=0; const noms=[];
      bxpCibles().forEach(bx=>{ if(!bxpCiblesSel.has(bx.id)) return;
        const r=boxPoserProduits(bx,uniq,{respecterEcartes:bx.id!==b.id});
        deja+=r.deja.length; if(!r.poses.length) return;
        poses+=r.poses.length; touchees++; noms.push(bx.nom||bx.numero||'');
        if(bx.id===b.id) ici=r.poses.length;
        paires.push({boxId:bx.id,ids:r.poses,ecartsLeves:r.ecartsLeves}); });
      if(poses) logEvent('Produits ajoutés aux box',poses+' fiche(s) à zéro dans '+touchees+' box : '+noms.slice(0,6).join(', '));
      _dernierePose={ts:1,paires}; return {poses,touchees,ici,deja}; },
    annuler(){ return bxpPoseAnnuler(); },
    cibler(ids){ bxpCiblesSel=new Set(ids); }, journal, toasts };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
const base=()=>({produits:[{id:'p1',nom:'ADVION',cree:0},{id:'p2',nom:'MUSKIL',cree:0},{id:'p3',nom:'GANTS',cree:0}],
  boxes:[{id:'b1',nom:'CAZABOX',stock:{}},{id:'b2',nom:'Sud',stock:{}},{id:'b3',nom:'Allégée',stock:{}},{id:'b4',nom:'Fermée',actif:false,stock:{}}],
  boxDecisions:[],produitsDistincts:[],mouvements:[]});

console.log('Les box visées : jamais une box fermée, jamais une box hors périmètre');
{ const db=base(); const g=bac({db,ouverte:'b1'});
  v('la box inactive n\'est pas une cible',g.bxpCibles().map(b=>b.id),['b1','b2','b3']);
  const g2=bac({db,ouverte:'b1',cache:['b3']});
  v('une box hors du périmètre non plus',g2.bxpCibles().map(b=>b.id),['b1','b2']); }

console.log('Le plan à blanc dit ce qui entrerait, sans rien écrire');
{ const db=base(); db.boxes[1].stock={p1:{u:4,ctn:0}};
  const g=bac({db,ouverte:'b1',cibles:['b1','b2','b3']});
  g.boxDecider(db.boxes[2],['p2']);
  const plan=g.bxpPosePlan(['p1','p2','p3']);
  v('trois box visées',plan.boxes,3);
  v('total exact : 3 + 2 + 2',plan.total,7);
  v('l\'écarté de la box qu\'on ne regarde pas est compté à part',plan.ecartesGardes,1);
  v('rien n\'a été écrit',[Object.keys(db.boxes[0].stock).length,Object.keys(db.boxes[2].stock).length],[0,0]);
  v('le stock existant n\'est pas recompté',plan.parBox.find(x=>x.b.id==='b2').ids,['p2','p3']); }

console.log('LA règle : un écarté ne se lève que sur la box qu\'on a sous les yeux');
{ const db=base(); const g=bac({db,ouverte:'b1',cibles:['b1','b2','b3']});
  g.boxDecider(db.boxes[0],['p1']);   // écarté sur la box OUVERTE
  g.boxDecider(db.boxes[2],['p1']);   // écarté sur une AUTRE box
  const r=g.poser(['p1','p2','p3']);
  v('la box ouverte repose son écarté : c\'est un acte informé',!!db.boxes[0].stock.p1,true);
  v('l\'autre box garde le sien',!!db.boxes[2].stock.p1,false);
  v('et sa décision est intacte',Object.keys(g.boxDecision(db.boxes[2]).ecartes),['p1']);
  v('la décision de la box ouverte, elle, est levée',Object.keys(g.boxDecision(db.boxes[0]).ecartes),[]);
  v('comptes',[r.poses,r.touchees,r.ici],[8,3,3]);
  v('la box fermée reste vide',Object.keys(db.boxes[3].stock).length,0); }

console.log('Rejouer le geste ne défait pas ce que les équipes ont décidé entre-temps');
{ const db=base(); const g=bac({db,ouverte:'b1',cibles:['b1','b2','b3']});
  g.poser(['p1','p2','p3']);
  g.boxDecider(db.boxes[1],['p2']); delete db.boxes[1].stock.p2;   // une équipe allège sa box
  const r=g.poser(['p1','p2','p3']);
  v('la seconde passe ne repose rien',r.poses,0);
  v('l\'allègement tient',!!db.boxes[1].stock.p2,false); }

console.log('Une seule ligne de journal pour tout le geste');
{ const db=base(); const g=bac({db,ouverte:'b1',cibles:['b1','b2','b3']});
  g.poser(['p1','p2','p3']);
  v('une ligne, comptée, qui nomme les box',g.journal,['Produits ajoutés aux box · 9 fiche(s) à zéro dans 3 box : CAZABOX, Sud, Allégée']); }

console.log('Annuler défait vraiment, sauf ce qui a bougé entre-temps');
{ const db=base(); const g=bac({db,ouverte:'b1',cibles:['b1','b2','b3']});
  g.boxDecider(db.boxes[0],['p1']);
  g.poser(['p1','p2','p3']);
  db.boxes[1].stock.p2={u:5,ctn:0};   // un arrivage est arrivé sur une fiche posée
  g.annuler();
  v('tout est retiré',[Object.keys(db.boxes[0].stock).length,Object.keys(db.boxes[2].stock).length],[0,0]);
  v('sauf la fiche qui a reçu du stock',db.boxes[1].stock,{p2:{u:5,ctn:0}});
  v('et l\'écart levé sur la box ouverte est remis',Object.keys(g.boxDecision(db.boxes[0]).ecartes),['p1']); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
