const fs=require('fs'); const APP=fs.readFileSync('/home/user/teamop/app.html','utf8');
function decoupe(entete){ const deb=APP.indexOf(entete); if(deb<0) throw new Error('introuvable : '+entete);
  for(let i=deb;i<deb+40000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const bout=APP.slice(deb,i+1); try{ new Function(bout); return bout; }catch(e){} }
  throw new Error('fin introuvable : '+entete); }
const morceaux=['const norm = s =>','function produitCle(p){','function boxStock(b,pid){','function produitsDistinctIds(cle){','function produitDistinct(p){','function produitsDistinctsDeclarer(cle,ids,nom){','function produitsDistinctsAnnuler(cle){',
  'function produitsDoublons(){','function produitsFusionnables(l){','function produitsDoublonSurvivante(l){','function produitsFusionApercu(l){','function produitsFusionnerDoublons(cles){',
  'let bxpOnglet=','function bxpBox(){','function abpDisponibles(b){','function boxPoserProduits(b,ids){','function boxRetirable(b,pid){','function boxRetirerCoches(){','function boxRetirerAnnuler(){',
  'const BOX_NOUVEAUTES_DEPUIS=','function uidTs(id){','function produitCree(p){','function boxDecision(b){','function boxVuTs(b){','function produitsRecents(){','function boxNouveautes(b,cands){','function boxAutoNouveautes(b){','function boxDecider(b,ids){','function boxDecisionAnnuler(b,pid){',
  'let _pushProduitLot=','function produitCreer(fiche,opts){','function produitCreePrevenir(p){'].map(decoupe).join('\n');
const bac=new Function('etat',`let db=etat.db, currentUser=etat.currentUser, journal=[], toasts=[], pushes=[], timers=[], boxView='bx', current='boxes', rendus=0;
  const logEvent=(a,b)=>journal.push(a+' · '+b); const save=()=>{ etat.saves++; }; const toast=t=>toasts.push(t); const toastAnnuler=(t,a)=>toasts.push(t+' ['+a+']');
  const closeModal=()=>{}; const renderBoxDetail=()=>{ rendus++; }; const bxpRafraichir=()=>{}; const $=()=>null; const views={}; const visibleBoxes=l=>l||[];
  const fullName=u=>u?((u.prenom?u.prenom+' ':'')+(u.nom||'')).trim():'—'; const produit=id=>db.produits.find(p=>p.id===id)||{};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7); const userSeesModule=(u,k)=>u.role!=='client';
  const pushNotify=(t,c,u,d)=>pushes.push({t,c,d}); const setTimeout=(f,ms)=>{ timers.push(f); return timers.length; }; const clearTimeout=()=>{};
  ${morceaux}
  return {poser:(d,u)=>{db=d;currentUser=u;}, setRet:ids=>{ bxpRetSel=new Set(ids); }, tick:()=>{ const t=timers.splice(0); t.forEach(f=>f()); },
    uidTs,produitCree,boxNouveautes,boxAutoNouveautes,boxDecider,boxDecisionAnnuler,boxDecision,boxRetirable,boxPoserProduits,abpDisponibles,produitsDoublons,produitsDistinctIds,produitsDistinctsDeclarer,produitsDistinctsAnnuler,produitsFusionnerDoublons,produitsFusionApercu,produitCreer,boxRetirerCoches,boxRetirerAnnuler,
    dernier:()=>_dernierRetrait, journal,toasts,pushes, DEPUIS:BOX_NOUVEAUTES_DEPUIS};`)({db:{},currentUser:null,saves:0});
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
const ADMIN={id:'uAdmin',prenom:'Sophie',nom:'Admin',role:'admin'}; const D=bac.DEPUIS;
const uidNow=()=>Date.now().toString(36)+'abcde';
function base(){ return {users:[ADMIN,{id:'k',prenom:'Karim',nom:'Benali',role:'technicien',actif:true},{id:'z',prenom:'Zoé',nom:'Off',role:'technicien',actif:false}],
  produits:[{id:'A',nom:'ADVION',cree:0},{id:'B',nom:'BLATTOX',cree:0},{id:'C',nom:'CARTONS',cree:0},{id:'Dn',nom:'DÉTECTEUR',cree:D+1000},{id:'E',nom:'ÉPONGE',cree:0},{id:'F',nom:'Blattox',cree:0,ref:'F-1'},{id:'G',nom:'GANTS',cree:0},{id:'H',nom:'HOUSSE',cree:D+3000},{id:'Z',nom:'ZÉRO DÉMO',cree:D+5000,_demo:true}],
  boxes:[{id:'bx',nom:'Box Nord',stock:{A:{u:0,ctn:0},B:{u:3,ctn:0},C:{u:0,ctn:2},G:{u:0,ctn:0}}},{id:'bx2',nom:'Box Sud',stock:{F:{u:1,ctn:0}}}],
  boxMvtAttente:[{id:'l1',statut:'brouillon',type:'ajustementLot',boxId:'bx',parId:'k',lignes:[{produitId:'G',du:2}]}],mouvements:[],boxDecisions:[],produitsDistincts:[]}; }

console.log('Dates de création');
{ const u=uidNow(); v('uidTs lit un uid()',Math.abs(bac.uidTs(u)-Date.now())<2000,true); v('uidTs : cat_ et demo → 0',[bac.uidTs('cat_advion'),bac.uidTs('demo_adv'),bac.uidTs('')],[0,0,0]);
  v('produitCree : cree, 0, repli uid, catalogue',[bac.produitCree({cree:5}),bac.produitCree({cree:0,id:u}),Math.abs(bac.produitCree({id:u})-Date.now())<2000,bac.produitCree({id:'cat_x'})],[5,0,true,0]); }

console.log('Nouveautés d\'une box');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0];
  v('nouveaux : H puis Dn (récent d\'abord) — pas E (semis), pas A (dans la box), pas Z (démo), pas F (homonyme de B posé)',bac.boxNouveautes(b).map(p=>p.id),['H','Dn']);
  bac.boxDecider(b,['H']); v('écarté H : reste Dn',bac.boxNouveautes(b).map(p=>p.id),['Dn']);
  v('la décision vit dans db.boxDecisions, par box',[db.boxDecisions.length,db.boxDecisions[0].id,Object.keys(db.boxDecisions[0].ecartes),db.boxDecisions[0].par],[1,'bx',['H'],'Sophie Admin']);
  bac.boxDecisionAnnuler(b,'H'); v('proposé à nouveau',bac.boxNouveautes(b).map(p=>p.id),['H','Dn']);
  const jeune={id:uidNow(),nom:'Box neuve',stock:{}}; v('une box créée maintenant ne voit rien d\'antérieur comme nouveau',bac.boxNouveautes(jeune).length,0);
  v('le plancher est la date de la version',new Date(D).toISOString(),'2026-09-10T10:00:00.000Z'); }

console.log('Retirable');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0];
  v('A à zéro → ok',bac.boxRetirable(b,'A'),{ok:true,raison:'à zéro'}); v('B en stock → 3 u',bac.boxRetirable(b,'B'),{ok:false,raison:'3 u'}); v('C cartons',bac.boxRetirable(b,'C'),{ok:false,raison:'2 cartons'});
  v('G : brouillon d\'un autre → gardé',bac.boxRetirable(b,'G'),{ok:false,raison:'brouillon en cours'}); db.boxMvtAttente[0].statut='enAttente'; v('G : demande en attente',bac.boxRetirable(b,'G').raison,'demande en attente');
  b.stock.X={u:0,ctn:0}; v('fiche disparue : retirable, dite',bac.boxRetirable(b,'X'),{ok:true,raison:'fiche introuvable'}); }

console.log('Poser dans la box');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0];
  v('disponibles : Dn, E, H, Z (pas F : même nom que B posé)',bac.abpDisponibles(b).map(p=>p.id).sort(),['Dn','E','H','Z']);
  const r=bac.boxPoserProduits(b,['Dn','E','B','F']); v('posés Dn et E ; B (déjà) et F (homonyme) refusés',[r.poses,r.deja],[['Dn','E'],['B','F']]); v('à zéro',b.stock.Dn,{ctn:0,u:0}); }

console.log('Doublons et « c\'est normal »');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0];
  v('B/F sont un doublon',bac.produitsDoublons().map(l=>l.map(p=>p.id)),[['B','F']]);
  bac.produitsDistinctsDeclarer('blattox',['B','F'],'BLATTOX'); v('déclarés distincts : plus de doublon',bac.produitsDoublons().length,0);
  v('F redevient disponible pour la box où B est posé',bac.abpDisponibles(b).map(p=>p.id).sort(),['Dn','E','F','H','Z']);
  db.produits.push({id:'F2',nom:'BLATTOX ',cree:0}); v('un troisième homonyme ressignale le groupe',bac.produitsDoublons().map(l=>l.map(p=>p.id)),[['B','F','F2']]);
  db.produits.pop(); bac.produitsDistinctsAnnuler('blattox'); v('déclaration annulée : doublon signalé',bac.produitsDoublons().length,1); }

console.log('Fusion d\'un seul groupe, aperçu, date la plus ancienne');
{ const db=base(); bac.poser(db,ADMIN); db.produits.push({id:'A2',nom:'Advion',cree:D+9000,_m:5},{id:'B2',nom:'blattox',cree:D+9000}); db.boxes[1].stock.A2={u:4,ctn:0};
  db.produits.find(p=>p.id==='A').cree=D+100;
  const grA=bac.produitsDoublons().find(l=>l[0].id==='A'||l[0].id==='A2'); const ap=bac.produitsFusionApercu(grA);
  v('aperçu : A survit (posée dans 1 box, comme A2, mais plus ancienne), Box Sud 0+4→4',[ap.s.id,ap.perdantes.map(p=>p.id),ap.box],['A',['A2'],[{nom:'Box Sud',avant:0,ajout:4,apres:4}]]);
  bac.produitsDistinctsDeclarer('advion',['A'],'ADVION');   // déclaration partielle : le groupe reste signalé
  /* v634 : une fiche déclarée « c'est un autre produit » n'est plus emportée par un homonyme
     arrivé après. Il ne reste alors qu'A2 de libre — rien à replier, rien ne bouge. */
  const r0=bac.produitsFusionnerDoublons(new Set(['advion']));
  v('une déclaration partielle bloque le repli, sans rien casser',[r0.paires,r0.fiches,db.produits.some(p=>p.id==='A2')],[0,0,true]);
  v('la déclaration de l\'équipe tient',bac.produitsDistinctIds('advion').has('A'),true);
  bac.produitsDistinctsAnnuler('advion');   // l'équipe revient dessus : le repli redevient possible
  const r=bac.produitsFusionnerDoublons(new Set(['advion']));
  v('seul le groupe ADVION est fusionné',[r.paires,r.fiches,db.produits.some(p=>p.id==='A2'),db.produits.filter(p=>/blattox/i.test(p.nom)).length],[1,1,false,3]);
  v('stock additionné dans Box Sud',db.boxes[1].stock.A,{ctn:0,u:4}); v('la déclaration, annulée par l\'équipe, n\'est plus là',db.produitsDistincts.length,0);
  v('cree = la plus ancienne (A2 n\'est pas devenue une nouveauté)',db.produits.find(p=>p.id==='A').cree,D+100); }

console.log('Naissance d\'un produit et push groupé');
{ const db=base(); bac.poser(db,ADMIN); const avant=Date.now();
  const p=bac.produitCreer({nom:'NOUVEAU'},{push:true}); v('cree et auteur posés, id généré',[p.cree>=avant,p.creePar,typeof p.id],[true,'uAdmin','string']);
  const s=bac.produitCreer({id:'cat_x',nom:'SEMIS'},{semis:true,push:true}); v('un semis vaut 0, jamais poussé',s.cree,0);
  bac.produitCreer({nom:'DEUX'},{push:true}); bac.tick();
  v('un seul push pour deux créations, aux actifs qui voient les box, sans le créateur',[bac.pushes.length,bac.pushes[0].d,bac.pushes[0].t],[1,['k'],'2 nouveaux produits au catalogue']);
  bac.produitCreer({nom:'TROIS'},{push:true}); bac.tick(); v('pas de second push dans les 10 minutes',bac.pushes.length,1);
  v('db.produits.push n\'existe qu\'une fois dans app.html',(APP.match(/db\.produits\.push\(/g)||[]).length,1); }

console.log('Retrait coché, revérifié, annulable');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0]; bac.setRet(['A','B']);
  bac.boxRetirerCoches(); v('A retiré, B gardé (stock)',[b.stock.A,!!b.stock.B],[undefined,true]);
  v('journal nominatif',/Produits retirés de la box · Box Nord : ADVION/.test(bac.journal[bac.journal.length-1]),true);
  v('message avec Annuler',/1 produit retiré · 1 gardé.*\[boxRetirerAnnuler\(\)\]/.test(bac.toasts[bac.toasts.length-1]),true);
  b.stock.A={u:2,ctn:0};   // un arrivage a reposé A entre-temps
  bac.boxRetirerAnnuler(); v('annuler ne touche pas un produit déjà reposé avec du stock',b.stock.A,{u:2,ctn:0});
  bac.setRet(['C']); bac.boxRetirerCoches(); v('rien retiré quand tout est gardé : message, pas de journal',/Rien retiré/.test(bac.toasts[bac.toasts.length-1]),true); }
console.log('Le catalogue nourrit la box tout seul');
{ const db=base(); bac.poser(db,ADMIN); const b=db.boxes[0]; const n=bac.boxAutoNouveautes(b);
  v('à l\'ouverture, H et Dn se posent à zéro',[n,b.stock.H,b.stock.Dn],[2,{ctn:0,u:0},{ctn:0,u:0}]); v('journal',/Nouveaux produits du catalogue posés dans la box · Box Nord : HOUSSE, DÉTECTEUR/.test(bac.journal.join(" | ")),true);
  v('seconde ouverture : rien',bac.boxAutoNouveautes(b),0);
  bac.setRet(['H']); bac.boxRetirerCoches(); v('retiré ET écarté : il ne revient pas',[b.stock.H,bac.boxNouveautes(b).map(p=>p.id),bac.boxAutoNouveautes(b)],[undefined,[],0]);
  bac.boxRetirerAnnuler(); v('annuler le retrait lève l\'écart',[b.stock.H,Object.keys(bac.boxDecision(b).ecartes)],[{ctn:0,u:0},[]]);
  bac.setRet(['H']); bac.boxRetirerCoches(); const r=bac.boxPoserProduits(b,['H']); v('reposer à la main lève l\'écart aussi',[r.poses,Object.keys(bac.boxDecision(b).ecartes)],[['H'],[]]); }
console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
