/* ══ v639 — DEUX PERSONNES DANS LA MÊME BOX, ET AUCUNE N'ÉCRASE L'AUTRE ═══════════════════
   Demande de Justin, 10 septembre 2026 au soir : « il faut que personne n'écrase rien ».

   Le défaut : une box est UN enregistrement pour la synchro. Alexis change le stock de
   l'ADVION, Justin celui du DEBUSK, dans la MÊME box — les deux appareils tamponnent la box
   entière, et à la fusion le plus récent l'emporte EN BLOC. Le travail de l'autre disparaît
   sans message et sans pierre tombale : rien ne le détecte, jamais.

   Ce fichier fait tourner les VRAIES fonctions extraites d'app.html — estampiller,
   ombreRelever, boxFusionFine, fusionnerBases — sur deux appareils simulés qui ont chacun
   leur base et leur ombre, exactement comme deux téléphones sur le terrain.              */
const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0;
const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);}
  else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
/* ⛔ EXTRAIRE LA FONCTION ENTIÈRE, PAS SON PREMIER MORCEAU QUI COMPILE.
   L'extracteur des suites précédentes rendait le PLUS COURT préfixe qui passe `new Function` :
   sur `ombreRelever`, dont la dernière ligne construit l'ombre des lignes de stock, il coupait
   avant — la sonde testait alors une fonction amputée, et six vérifications échouaient sur du
   code pourtant juste. On borne donc au début de la DÉCLARATION SUIVANTE de premier niveau,
   puis on prend le PLUS LONG bloc valide. `tests/LISEZMOI.md` en fait la règle. */
function decoupe(h){ const d=APP.indexOf(h); if(d<0) throw new Error('introuvable : '+h);
  const suite=/\n(?=(?:function |const |let |var |class |async function |\/\* |views\.|document\.|window\.|try\{))/g;
  suite.lastIndex=d+h.length;
  const m=suite.exec(APP); const fin=m?m.index:Math.min(APP.length,d+80000);
  let bout=APP.slice(d,fin);
  for(;;){ const k=Math.max(bout.lastIndexOf('}'),bout.lastIndexOf(';')); if(k<0) break;
    const t=bout.slice(0,k+1);
    try{ new Function(t); return t; }catch(e){ bout=bout.slice(0,k); } }
  throw new Error('fin introuvable : '+h); }

const CODE=['const COLLS_HORS_FUSION=','function collsFusion(d){','const COLLS_DICT=','function dictFusion(prio,autre){',
  'function recEmpreinte(r){','const stockEmpreinte=','const MS_MAX=','let _ombre={}, _ombreStock={};',
  'function ombreRelever(){','const TOMBE_JOURS=','function estampiller(){','function msElaguer(ms,st,now){',
  'function boxFusionFine(gagnante,perdante){','function tombesElaguer(t,now){','function tombesUnion(a,b){','function numMaxUnion(a,b){',
  'function fusionnerBases(local,remote,prioriteLocale){','function baseSignature(d){'].map(h=>decoupe(h)).join('\n');
const neuf=new Function('etat',`let db=etat.db; const syncEnabled=()=>true;
  ${CODE}
  return { estampiller, ombreRelever, fusionnerBases, boxFusionFine, msElaguer, baseSignature,
           getDb:()=>db, setDb:d=>{db=d;} };`);

/* Deux appareils : chacun sa base, chacun son ombre. */
const copie=o=>JSON.parse(JSON.stringify(o));
const appareil=base=>{ const g=neuf({db:copie(base)}); g.ombreRelever(); return g; };
const save=g=>{ g.estampiller(); };               // ce que save() fait à la synchro
const attendre=()=>{ const t=Date.now(); while(Date.now()===t){} };   // garantir deux millisecondes distinctes
const BASE={ boxes:[{id:'bx1',nom:'Cuisine',actif:true,stock:{pA:{u:40,ctn:0},pB:{u:12,ctn:0},pC:{u:5,ctn:1}}}],
             produits:[{id:'pA',nom:'ADVION'},{id:'pB',nom:'DEBUSK'},{id:'pC',nom:'ALTA'}],
             mouvements:[], _tombes:{} };
const stockDe=d=>((d.boxes||[]).find(b=>b.id==='bx1')||{}).stock||{};

/* ─────────────────────────────────────────────────────────────────────────────────────── */
console.log('Deux personnes, deux produits, la MÊME box');
{ /* On part d'une base déjà tamponnée des deux côtés : c'est l'état normal après une synchro. */
  const socle=appareil(BASE); save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun);

  A.getDb().boxes[0].stock.pA={u:30,ctn:0};   // Alexis sort 10 ADVION
  save(A); attendre();
  B.getDb().boxes[0].stock.pB={u:2,ctn:0};    // Justin sort 10 DEBUSK, juste après
  save(B);

  const fus=A.fusionnerBases(A.getDb(),B.getDb(),false);   // A reçoit l'instantané de B
  v('les DEUX gestes survivent chez A',[stockDe(fus).pA,stockDe(fus).pB],[{u:30,ctn:0},{u:2,ctn:0}]);
  const inv=B.fusionnerBases(B.getDb(),A.getDb(),false);   // et dans l'autre sens
  v('…et chez B, à l\'identique',[stockDe(inv).pA,stockDe(inv).pB],[{u:30,ctn:0},{u:2,ctn:0}]);
  v('le produit que personne n\'a touché ne bouge pas',stockDe(fus).pC,{u:5,ctn:1});
  v('la fusion est la même des deux côtés — pas de divergence',stockDe(fus),stockDe(inv));

  /* La preuve que c'est bien la maille fine qui sauve : sans marques, l'un des deux tombe. */
  const sansMarques=copie(B.getDb()); delete sansMarques.boxes[0]._ms;
  const gros=A.fusionnerBases(A.getDb(),sansMarques,false);
  v('sans les marques, l\'ancienne règle reprend — et un geste est perdu',
    stockDe(gros).pA.u===30&&stockDe(gros).pB.u===2,false);
}

console.log('\nLe même produit, par deux personnes : c\'est un vrai conflit, le plus récent gagne');
{ const socle=appareil(BASE); save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun);
  A.getDb().boxes[0].stock.pA={u:30,ctn:0}; save(A); attendre();
  B.getDb().boxes[0].stock.pA={u:37,ctn:0}; save(B);
  v('le geste le plus récent l\'emporte sur CETTE ligne',stockDe(A.fusionnerBases(A.getDb(),B.getDb(),false)).pA,{u:37,ctn:0});
  v('et les autres lignes ne bougent pas',stockDe(A.fusionnerBases(A.getDb(),B.getDb(),false)).pB,{u:12,ctn:0});
}

console.log('\nUn retrait ne se fait pas défaire par le travail d\'un autre');
{ const socle=appareil(BASE); save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun);
  delete A.getDb().boxes[0].stock.pC;         // Alexis retire ALTA (elle était à 5 u / 1 ctn)
  save(A); attendre();
  B.getDb().boxes[0].stock.pB={u:2,ctn:0};    // Justin travaille ailleurs dans la box
  save(B);
  const f=A.fusionnerBases(A.getDb(),B.getDb(),false);
  v('le produit retiré ne revient pas',('pC' in stockDe(f)),false);
  v('et le geste de l\'autre est intact',stockDe(f).pB,{u:2,ctn:0});

  /* L'inverse : quelqu'un remet du stock sur le produit APRÈS le retrait. Le plus récent gagne. */
  const C=appareil(commun); attendre();
  C.getDb().boxes[0].stock.pC={u:9,ctn:0}; save(C);
  v('un réapprovisionnement postérieur au retrait, lui, gagne',stockDe(A.fusionnerBases(A.getDb(),C.getDb(),false)).pC,{u:9,ctn:0});
}

console.log('\nPendant le déploiement : un appareil resté en v638 ne fait rien exploser');
{ const socle=appareil(BASE); save(socle);
  const vieux=copie(socle.getDb()); delete vieux.boxes[0]._ms;   // version d'avant : aucune marque
  const A=appareil(socle.getDb());
  A.getDb().boxes[0].stock.pA={u:30,ctn:0}; save(A);
  const f=A.fusionnerBases(A.getDb(),vieux,false);
  v('la fusion aboutit quand même',!!stockDe(f).pA,true);
  v('et c\'est l\'ancienne règle qui tranche — le plus récent en bloc',stockDe(f).pA,{u:30,ctn:0});
  v('boxFusionFine se retire proprement quand un côté ne date pas ses lignes',
    A.boxFusionFine({stock:{},_ms:{}},{stock:{}}),null);
}

console.log('\nLes listes internes de la box s\'ajoutent au lieu de s\'écraser');
{ const socle=appareil({boxes:[{id:'bx1',stock:{},arrivages:[{id:'a0',ts:1}]}],produits:[],_tombes:{}});
  save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun);
  A.getDb().boxes[0].arrivages.unshift({id:'aA',ts:100}); save(A); attendre();
  B.getDb().boxes[0].arrivages.unshift({id:'aB',ts:200}); save(B);
  const arr=(A.fusionnerBases(A.getDb(),B.getDb(),false).boxes[0].arrivages||[]).map(x=>x.id).sort();
  v('deux arrivages validés en même temps font deux arrivages',arr,['a0','aA','aB']);
}

console.log('\nLes marques ne grossissent pas sans fin');
{ const g=appareil(BASE); const now=Date.now(); const vieux=now-100*86400000;
  const st={pA:{u:1,ctn:0}};
  v('une marque d\'un produit EN STOCK ne s\'élague jamais, même très ancienne',
    Object.keys(g.msElaguer({pA:vieux},st,now)),['pA']);
  v('celle d\'un produit retiré s\'efface passé 90 jours',
    Object.keys(g.msElaguer({pA:now,pZ:vieux},st,now)),['pA']);
  const beaucoup={}; for(let i=0;i<900;i++) beaucoup['x'+i]=now-i*1000;
  const el=g.msElaguer(Object.assign({pA:now},beaucoup),st,now);
  v('et le nombre de marques de produits retirés est plafonné',
    [Object.keys(el).length<=601, 'pA' in el],[true,true]);
}

console.log('\nUne marque ne fait jamais rebattre la pierre tombale de son enregistrement');
{ const g=appareil(BASE); save(g); attendre(); save(g); attendre(); save(g);   // trois save() sans rien changer
  /* Le piège que ce bloc garde : `_ms` est écrit à CHAQUE save(). S'il entrait dans
     recEmpreinte, chaque enregistrement re-tamponnerait `_m`, donc la box battrait sa propre
     pierre tombale à l'infini et gagnerait toutes les fusions sans que personne n'ait rien
     fait. Le signe que tout va bien : `_m` reste ABSENT tant que rien n'a changé. */
  v('trois save() sans changement ne posent aucun tampon',g.getDb().boxes[0]._m,undefined);
  v('alors que les marques de lignes, elles, existent',Object.keys(g.getDb().boxes[0]._ms||{}).sort(),['pA','pB','pC']);
  g.getDb().boxes[0].stock.pA={u:1,ctn:0}; attendre(); save(g);
  const b=g.getDb().boxes[0];
  v('un vrai changement, lui, tamponne la box',typeof b._m==='number'&&b._m>0,true);
  v('et il ne date que la ligne touchée',[b._ms.pA===b._m,b._ms.pB<b._m],[true,true]);
}

console.log('\nAller-retour complet : trois appareils, sept gestes, rien ne se perd');
{ const socle=appareil({boxes:[{id:'bx1',stock:{p1:{u:10,ctn:0},p2:{u:10,ctn:0},p3:{u:10,ctn:0},p4:{u:10,ctn:0}}}],
    produits:[1,2,3,4].map(i=>({id:'p'+i,nom:'P'+i})),mouvements:[],_tombes:{}});
  save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun), C=appareil(commun);
  A.getDb().boxes[0].stock.p1={u:3,ctn:0}; save(A); attendre();
  B.getDb().boxes[0].stock.p2={u:4,ctn:0}; save(B); attendre();
  C.getDb().boxes[0].stock.p3={u:5,ctn:0}; save(C); attendre();
  // le nuage reçoit dans le désordre, chacun pousse et repousse
  let nuage=A.fusionnerBases(commun,A.getDb(),false);
  nuage=B.fusionnerBases(nuage,B.getDb(),false);
  nuage=C.fusionnerBases(nuage,C.getDb(),false);
  nuage=A.fusionnerBases(nuage,A.getDb(),false);       // A repousse sa vue, plus ancienne
  v('les trois gestes tiennent, malgré une repoussée d\'un appareil en retard',
    [stockDe(nuage).p1,stockDe(nuage).p2,stockDe(nuage).p3,stockDe(nuage).p4],
    [{u:3,ctn:0},{u:4,ctn:0},{u:5,ctn:0},{u:10,ctn:0}]);
  v('total du stock : 3+4+5+10',[1,2,3,4].reduce((s,i)=>s+stockDe(nuage)['p'+i].u,0),22);
}

console.log('\nLa signature voit ce que la fusion fine a recomposé');
{ /* `boxFusionFine` garde le `_m` de la box gagnante tout en y injectant une ligne venant de la
     perdante. La signature, qui ne regardait que `id@_m`, était donc IDENTIQUE avant et après :
     `_repousser` ne partait pas, et la recomposition mettait plus longtemps à atteindre un
     TROISIÈME appareil. Trouvé par `relecteur` — c'est exactement ce qu'une sonde à deux
     appareils ne peut pas voir, puisque chacun y pousse son propre geste. */
  const socle=appareil(BASE); save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun);
  A.getDb().boxes[0].stock.pA={u:30,ctn:0}; save(A); attendre();
  B.getDb().boxes[0].stock.pB={u:2,ctn:0}; save(B);
  const avant=A.baseSignature(B.getDb());
  const f=A.fusionnerBases(A.getDb(),B.getDb(),false);
  v('la fusion a bien recomposé la box',[stockDe(f).pA.u,stockDe(f).pB.u],[30,2]);
  v('le _m de la box gagnante n\'a pas bougé — c\'était le piège',
    f.boxes[0]._m,B.getDb().boxes[0]._m);
  v('mais la signature, elle, a changé : la repoussée partira',A.baseSignature(f)!==avant,true);
  v('et deux bases identiques gardent la même signature',A.baseSignature(f),A.baseSignature(copie(f)));
}

console.log('\nÀ identifiant égal, c\'est le côté GAGNANT qui tranche');
{ const g=appareil(BASE);
  const gagnante={id:'bx1',_m:9,_ms:{},stock:{},arrivages:[{id:'a1',ts:5,valide:true}]};
  const perdante={id:'bx1',_m:1,_ms:{},stock:{},arrivages:[{id:'a1',ts:5,valide:false},{id:'a2',ts:7}]};
  const f=g.boxFusionFine(gagnante,perdante);
  v('la version de la gagnante l\'emporte sur un identifiant partagé',
    (f.arrivages.find(x=>x.id==='a1')||{}).valide,true);
  v('et ce que seule la perdante avait est repris',f.arrivages.map(x=>x.id).sort(),['a1','a2']);
}

console.log('\nIdempotence et commutativité — la propriété qui fait qu\'une synchro converge');
{ const socle=appareil(BASE); save(socle); const commun=copie(socle.getDb());
  const A=appareil(commun), B=appareil(commun), C=appareil(commun);
  A.getDb().boxes[0].stock.pA={u:1,ctn:0}; save(A); attendre();
  B.getDb().boxes[0].stock.pB={u:2,ctn:0}; save(B); attendre();
  C.getDb().boxes[0].stock.pC={u:3,ctn:0}; save(C);
  const f1=A.fusionnerBases(A.getDb(),B.getDb(),false);
  v('refusionner ne change plus rien',stockDe(A.fusionnerBases(f1,B.getDb(),false)),stockDe(f1));
  v('ni une troisième fois, ni avec soi-même',stockDe(A.fusionnerBases(A.fusionnerBases(f1,B.getDb(),false),A.getDb(),false)),stockDe(f1));
  const abc=A.fusionnerBases(A.fusionnerBases(A.getDb(),B.getDb(),false),C.getDb(),false);
  const cba=A.fusionnerBases(A.fusionnerBases(C.getDb(),B.getDb(),false),A.getDb(),false);
  const bca=A.fusionnerBases(A.fusionnerBases(B.getDb(),C.getDb(),false),A.getDb(),false);
  v('A→B→C, C→B→A et B→C→A donnent le même stock',[stockDe(cba),stockDe(bca)],[stockDe(abc),stockDe(abc)]);
  v('et les trois gestes tiennent',[stockDe(abc).pA.u,stockDe(abc).pB.u,stockDe(abc).pC.u],[1,2,3]);
}

console.log('\nDes marques abîmées font retomber sur l\'ancienne règle, jamais planter');
{ /* N'importe qui peut aujourd'hui écrire dans le document d'équipe (voir REPRISE.md, la
     règle Firestore) : une charge abîmée ne doit pas entrer dans la recomposition.
     `typeof [] === 'object'` — d'où la garde explicite sur les tableaux. */
  const g=appareil(BASE);
  const bon={id:'bx1',stock:{pA:{u:1,ctn:0}},_ms:{pA:5}};
  [['un tableau',[]],['une chaîne','x'],['nul',null],['absent',undefined]].forEach(([nom,abime])=>{
    const mauvais={id:'bx1',stock:{pA:{u:9,ctn:0}}}; if(abime!==undefined) mauvais._ms=abime;
    let a,b2; try{ a=g.boxFusionFine(bon,mauvais); }catch(e){ a='LEVÉ'; }
    try{ b2=g.boxFusionFine(mauvais,bon); }catch(e){ b2='LEVÉ'; }
    v('_ms '+nom+' : refusé proprement, dans les deux sens',[a,b2],[null,null]); });
  let sansStock; try{ sansStock=g.boxFusionFine({id:'bx1',_ms:{pA:1}},{id:'bx1',_ms:{pA:2}}); }catch(e){ sansStock='LEVÉ'; }
  v('une box sans stock ne lève pas',sansStock!=='LEVÉ',true);
}

console.log('\nCinq appareils, trois cents gestes, échanges dans le désordre');
{ /* LE test de ce fichier. Une fusion peut être juste sur trois cas choisis et diverger sur
     mille : ce qui compte, c'est que tous les appareils finissent sur le MÊME stock quel que
     soit l'ordre des échanges. Horloge maîtrisée et tirage à graine fixe : le scénario est
     rejoué à l'identique à chaque exécution. */
  let horloge=1000000; const vraiNow=Date.now;
  const sauverH=g=>{ horloge++; Date.now=()=>horloge; try{ g.estampiller(); } finally { Date.now=vraiNow; } };
  const PRODS=['p1','p2','p3','p4','p5','p6','p7','p8'];
  const dep={boxes:[{id:'bx1',nom:'Cuisine',actif:true,stock:{}},{id:'bx2',nom:'Réserve',actif:true,stock:{}}],
    produits:PRODS.map(id=>({id,nom:id.toUpperCase()})),mouvements:[],_tombes:{}};
  PRODS.forEach(p2=>{ dep.boxes[0].stock[p2]={u:20,ctn:0}; dep.boxes[1].stock[p2]={u:20,ctn:0}; });
  const socle=appareil(dep); sauverH(socle); const commun=copie(socle.getDb());
  const dev=[0,1,2,3,4].map(()=>appareil(commun));
  let graine=42; const alea=()=>{ graine=(graine*1103515245+12345)&0x7fffffff; return graine/0x7fffffff; };
  const pick=l=>l[Math.floor(alea()*l.length)];
  let retraits=0, poses=0;
  for(let tour=0;tour<300;tour++){
    const g=pick(dev), bxId=pick(['bx1','bx2']), p2=pick(PRODS);
    const b=g.getDb().boxes.find(x=>x.id===bxId);   // pick() DANS le find() serait retiré à chaque élément
    b.stock=b.stock||{}; const r=alea();
    if(r<0.15&&b.stock[p2]){ delete b.stock[p2]; retraits++; }
    else if(r<0.25&&!b.stock[p2]){ b.stock[p2]={u:Math.floor(alea()*10),ctn:0}; poses++; }
    else b.stock[p2]={u:Math.floor(alea()*30),ctn:Math.floor(alea()*3)};
    sauverH(g);
    if(tour%2===0){ const x=pick(dev), y=pick(dev); if(x!==y) x.setDb(x.fusionnerBases(x.getDb(),y.getDb(),alea()<0.5)); }
  }
  for(let k=0;k<2;k++) for(const x of dev) for(const y of dev) if(x!==y) x.setDb(x.fusionnerBases(x.getDb(),y.getDb(),false));
  const vu=g=>JSON.stringify(['bx1','bx2'].map(id=>((g.getDb().boxes||[]).find(b=>b.id===id)||{}).stock||{}));
  const ref=vu(dev[0]);
  v('les cinq appareils convergent sur le même stock',dev.map(vu).every(t=>t===ref),true);
  const st=['bx1','bx2'].map(id=>(dev[0].getDb().boxes.find(b=>b.id===id)||{}).stock||{});
  v('aucun produit fantôme n\'est apparu',st.every(o=>Object.keys(o).every(p2=>PRODS.includes(p2))),true);
  v('aucune quantité négative',st.some(o=>Object.values(o).some(x=>(x.u||0)<0||(x.ctn||0)<0)),false);
  v('les marques restent bornées',dev[0].getDb().boxes.every(b=>Object.keys(b._ms||{}).length<=PRODS.length*2),true);
  console.log('   ('+retraits+' retraits et '+poses+' poses parmi 300 gestes, 2 box, 8 produits)');
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
