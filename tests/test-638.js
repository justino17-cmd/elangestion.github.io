/* ══ v638 — les corrections d'audit du 10 septembre 2026 ══════════════════════════════════
   Quatre audits, quatre familles de dégâts. Ce fichier les cloue.

   Chaque bloc EXÉCUTE la fonction réelle extraite d'app.html quand elle est extractible, et
   ne se rabat sur la lecture du texte que pour ce qui ne l'est pas (un ordre d'opérations,
   un balisage, une fonction de 200 lignes qui touche le DOM). C'est la leçon du 10 septembre
   au matin : une suite qui reconstruit son propre ordre de déclaration avait laissé passer
   une zone morte temporelle qui rendait tout le rangement de catégories inopérant.        */
const fs=require('fs'); const APP=fs.readFileSync(__dirname+'/../app.html','utf8');
let ok=0,ko=0;
const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);}
  else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };
function decoupe(entete,max){ const deb=APP.indexOf(entete); if(deb<0) throw new Error('introuvable : '+entete);
  for(let i=deb;i<deb+(max||40000);i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const bout=APP.slice(deb,i+1);
    try{ new Function(bout); return bout; }catch(e){} }
  throw new Error('fin introuvable : '+entete); }

/* ─────────────────────────────────────────────────────────────────────────────────────── */
console.log('Les unités : ce que le client lit, ce que le registre porte');
{ const code=['function stockConv(q,de,vers){','function uniteCompat(de,vers){','function prodLineUnit(l){'].map(d=>decoupe(d)).join('\n');
  const bac=new Function('db',`${code}; return {stockConv,uniteCompat,prodLineUnit};`);
  const db={produits:[{id:'p1',nom:'TERMIFOS 500',unite:'L',prix:48}]};
  const g=bac(db);
  v('250 mL d\'un produit stocké au litre valent 0,25 L',g.stockConv(250,'mL','L'),0.25);
  v('l\'unité de la ligne prime sur celle de la fiche',g.prodLineUnit({produitId:'p1',unite:'mL'}),'mL');
  v('sans unité de ligne, celle de la fiche',g.prodLineUnit({produitId:'p1'}),'L');
  v('deux unités inconvertibles ne s\'additionnent pas',g.uniteCompat('u','cart.'),false);
  v('mais mL et L, si',[g.uniteCompat('mL','L'),g.uniteCompat('g','kg'),g.uniteCompat('L','L')],[true,true,true]);

  /* La facture générée depuis une intervention. C'est le chiffre qui part chez le client. */
  const ligne=l=>{ const p=db.produits.find(x=>x.id===l.produitId)||{};
    const uL=g.prodLineUnit(l), uP=p.unite||uL;
    const q=Math.round(g.stockConv(l.qte!=null?(+l.qte||0):1,uL,uP)*10000)/10000;
    return {designation:(p.nom||l.nomLibre||'Produit')+(uP?' ('+uP+')':''),qte:q,pu:p.prix||0}; };
  const L=ligne({produitId:'p1',qte:250,unite:'mL'});
  v('250 mL × 48 €/L font 12 €, plus jamais 12 000 €',[L.qte,L.pu,Math.round(L.qte*L.pu*100)/100],[0.25,48,12]);
  v('et la désignation dit dans quelle unité on compte',L.designation,'TERMIFOS 500 (L)');
  v('le code de la facture applique bien stockConv',
    /const q=Math\.round\(stockConv\(l\.qte!=null\?\(\+l\.qte\|\|0\):1,uL,uP\)\*10000\)\/10000;/.test(APP),true);
}

{ const code=['function prodLineUnit(l){','function registreBiocides(cid){'].map(d=>decoupe(d)).join('\n');
  const bac=new Function('etat',`let db=etat.db;
    const produit=id=>(db.produits||[]).find(p=>p.id===id)||{};
    const registreInts=cid=>(db.interventions||[]).filter(i=>i.clientId===cid);
    const intTechIds=()=>[]; const techName=()=>'';
    ${code}; return {registreBiocides};`);
  const db={produits:[{id:'p1',nom:'TERMIFOS 500',unite:'L',amm:'FR-123',matiereActive:'Fipronil'}],
    interventions:[{id:'i1',clientId:'c1',date:'2026-09-10',produitsUtilises:[{produitId:'p1',qte:250,unite:'mL'}]}]};
  const l=bac({db}).registreBiocides('c1')[0];
  v('le registre réglementaire porte l\'unité de la LIGNE',[l.qte,l.unite],[250,'mL']);
  v('plus jamais « 250 L » — facteur 1000 sur un biocide appliqué',l.unite!=='L',true);
}

console.log('\nLe dossier sanitaire ne totalise que ce qui s\'additionne');
{ const bac=new Function('',`${decoupe('function stockConv(q,de,vers){')}\n${decoupe('function uniteCompat(de,vers){')}
    return function(lignes,fiches){ const prodMap={};
      lignes.forEach(l=>{ const p=fiches.find(q=>q.id===l.produitId); if(!p) return;
        const qL=(l.qte!=null?(+l.qte||0):1);
        const uP=p.unite||l.unite||'', uL=l.unite||uP, o=uniteCompat(uL,uP);
        const u=o?uP:uL, k=p.id+'|'+u;
        prodMap[k]=prodMap[k]||{p,q:0,u}; prodMap[k].q+=(o?stockConv(qL,uL,uP):qL); });
      return Object.values(prodMap).map(x=>({nom:x.p.nom,q:Math.round(x.q*10000)/10000,u:x.u})); };`)();
  const fiches=[{id:'p1',nom:'TERMIFOS',unite:'L'},{id:'p2',nom:'BLOC',unite:'u'}];
  v('250 mL + 2 L font 2,25 L, plus jamais 252 mL',
    bac([{produitId:'p1',qte:250,unite:'mL'},{produitId:'p1',qte:2,unite:'L'}],fiches),
    [{nom:'TERMIFOS',q:2.25,u:'L'}]);
  v('ce qui ne se convertit pas garde sa propre ligne',
    bac([{produitId:'p2',qte:3,unite:'u'},{produitId:'p2',qte:2,unite:'cart.'}],fiches),
    [{nom:'BLOC',q:3,u:'u'},{nom:'BLOC',q:2,u:'cart.'}]);
  v('une ligne à zéro compte pour zéro, pas pour un',
    bac([{produitId:'p2',qte:0,unite:'u'}],fiches),[{nom:'BLOC',q:0,u:'u'}]);
  v('une ligne sans quantité vaut toujours un',
    bac([{produitId:'p2',unite:'u'}],fiches),[{nom:'BLOC',q:1,u:'u'}]);
}

console.log('\nLe devis qui part chez le client');
{ const bac=new Function('',`${decoupe('const ligTotLigne=l=>')}\n${decoupe('const ligHT=ls=>')}\nreturn {ligTotLigne,ligHT};`)();
  const l3=[{qte:1.5,pu:33.33},{qte:1.5,pu:33.33},{qte:1.5,pu:33.33}];
  v('chaque ligne est arrondie au centime',bac.ligTotLigne(l3[0]),49.99);
  v('le total est la somme de ce que le client LIT',bac.ligHT(l3),149.97);
  v('quatre lignes de 0,5 × 24,99 : plus d\'écart de deux centimes',
    bac.ligHT([0,1,2,3].map(()=>({qte:.5,pu:24.99}))),49.96);
  v('le PDF utilise le même arrondi que l\'écran',
    /const q=Number\(l\.qte\)\|\|0, pu=Number\(l\.pu\)\|\|0, tot=ligTotLigne\(l\);/.test(APP),true);
  v('« Modèle générique » ne s\'imprime plus en tête du devis',
    /const socNom=\/g\[ée\]n\[ée\]rique\|aucune\/i\.test\(String\(d\.rapportModele\|\|''\)\)\?'':String\(d\.rapportModele\|\|''\);/.test(APP),true);
}

console.log('\nLa virgule décimale — mesurée sur Chromium en fr-FR');
{ /* Un <input type="number"> AVALE la virgule : « 33,50 » devient « 3350 », le champ reste
     VALIDE. Dix-neuf champs décimaux étaient concernés, dont le prix unitaire d'un devis et
     le taux de TVA. Le garde est unique et posé à la frappe ; la preuve fonctionnelle est
     dans scratchpad/sonde-virgule4.js (navigateur réel, six scénarios). */
  const g=(APP.match(/document\.addEventListener\('keydown',function\(e\)\{[\s\S]{0,900}?\n\},true\);/g)||[])
    .filter(b=>/e\.key!==','/.test(b))[0]||'';
  v('le garde existe',!!g,true);
  v('il ne vise que les champs numériques',/el\.type!=='number'/.test(g),true);
  v('il laisse passer les raccourcis clavier',/e\.ctrlKey\|\|e\.metaKey\|\|e\.altKey/.test(g),true);
  v('il insère au curseur, pas au bout — execCommand respecte une sélection en cours',
    /document\.execCommand\('insertText',false,'\.'\)/.test(g),true);
  v('il ne réémet rien quand execCommand a réussi (sinon les blocs se re-dessinent sous les doigts)',
    /if\(!ok\)\{ el\.value=/.test(g),true);
}

console.log('\nLe stock ne compte plus ce qui n\'est pas sorti');
{ v('la clôture inscrit ce qui est SORTI, pas ce qui était demandé',
    /if\(pris>0\) db\.mouvements\.unshift\(\{[^\n]*qte:pris,/.test(APP),true);
  v('et le stock se plafonne sur le même nombre',/p\.qte=Math\.max\(0,dispo-pris\);/.test(APP),true);
  v('la validation DR en lot trace le delta réel',
    /if\(du\)\{ const av=cur\.u\|\|0; cur\.u=Math\.max\(0,av\+du\); ru=cur\.u-av; if\(ru\) traceBox\(b,l\.produitId,ru,'u'/.test(APP),true);
  v('le mouvement isolé aussi',
    /if\(du\)\{ const av=cur\.u\|\|0; cur\.u=Math\.max\(0,av\+du\); ru=cur\.u-av; if\(ru\) traceBox\(b,m\.produitId,ru,'u'/.test(APP),true);
  v('boxAdj aussi, et il s\'arrête si rien ne bouge',
    /const reel=b\.stock\[pid\]\[field\]-avAdj;\s*\n\s*if\(!reel\)\{/.test(APP),true);
  v('changer l\'unité après la quantité rend puis reprend le stock',
    /if\(q&&av!==u\)\{ intStockAjuste\(i,l\.produitId,-q,av\); intStockAjuste\(i,l\.produitId,q,u\); \}/.test(APP),true);
}

console.log('\nLe bon de remise distingue les unités des cartons');
{ const bac=new Function('',`${decoupe('function remiseTotTxt(r){')}\nreturn remiseTotTxt;`)();
  v('2 u et 3 cartons ne font pas 5 u',bac({lignes:[{qte:2,unite:'u'},{qte:3,unite:'cart.'}]}),'2 u · 3 cart.');
  v('un bon d\'avant le correctif compte toujours en unités',bac({lignes:[{qte:4}]}),'4 u');
  v('un bon vide le dit',bac({lignes:[]}),'0 u');
  v('les deux sens du geste produisent chacun leur ligne',
    /if\(m\.pourQui&&ru<0\) remiseAjoute\(Object\.assign\(\{\},m,\{produitId:l\.produitId\}\),-ru,'u'\);/.test(APP),true);
  v('le retrait validé sépare unités et cartons',
    /if\(m\.pourQui&&s\.u\) remiseAjoute\(m,s\.u,'u'\);/.test(APP)&&/if\(m\.pourQui&&s\.ctn\) remiseAjoute\(m,s\.ctn,'ctn'\);/.test(APP),true);
  v('une ligne par produit ET par unité',
    /br\.lignes\.find\(x=>x\.produitId===m\.produitId&&\(x\.unite\|\|'u'\)===uR\)/.test(APP),true);
}

console.log('\nOuvrir un écran n\'écrit jamais dans les données de l\'entreprise');
{ v('boxAutoNouveautes a disparu',/function boxAutoNouveautes\(/.test(APP),false);
  v('openBox n\'appelle plus rien qui écrive',
    /function openBox\(id,opts\)\{ boxView=id; boxProdSearch=''; _doublonsOuvert=false; _doublonsUnParUn=false;\s+\/\//.test(APP),true);
  v('la pastille « \\+N » reste, elle : on prévient sans écrire',
    (APP.match(/bxp-pastille/g)||[]).length>=3,true);
}

console.log('\nLe plan d\'appâtage ne se perd plus à la synchro');
{ const code=['const COLLS_HORS_FUSION=','function collsFusion(d){','const COLLS_DICT=','function dictFusion(prio,autre){',
    'function tombesUnion(','function fusionnerBases(local,remote,prioriteLocale){','function baseSignature(d){'].map(d=>decoupe(d)).join('\n');
  const bac=new Function('',`${code}; return {fusionnerBases,baseSignature};`)();
  const A={clients:[{id:'c1',nom:'A'}],plansSite:{c1:{postes:new Array(24).fill(0).map((_,i)=>({id:'po'+i}))}},planNotes:{'2026-09-10':'note A'},_tombes:{}};
  const B={clients:[{id:'c2',nom:'B'}],plansSite:{c2:{postes:new Array(18).fill(0).map((_,i)=>({id:'pb'+i}))}},planNotes:{'2026-09-11':'note B'},_tombes:{}};
  const f=bac.fusionnerBases(A,B,false);
  v('les deux plans survivent, chacun chez son client',
    [Object.keys(f.plansSite).sort(),f.plansSite.c1.postes.length,f.plansSite.c2.postes.length],[['c1','c2'],24,18]);
  v('les notes de journée aussi',Object.keys(f.planNotes).sort(),['2026-09-10','2026-09-11']);
  v('et dans l\'autre sens, pareil',Object.keys(bac.fusionnerBases(A,B,true).plansSite).sort(),['c1','c2']);
  v('sur la MÊME clé, le côté prioritaire tranche, comme pour un enregistrement',
    bac.fusionnerBases({plansSite:{c1:{v:'local'}},_tombes:{}},{plansSite:{c1:{v:'distant'}},_tombes:{}},true).plansSite.c1.v,'local');
  v('la signature voit les dictionnaires — sinon la fusion passe pour un non-événement',
    bac.baseSignature(A)!==bac.baseSignature(f),true);
}

console.log('\nUn numéro de document ne se réutilise pas');
{ const bac=new Function('db',`${decoupe('function intNum(){')}\nreturn intNum;`);
  const an=new Date().getFullYear();
  const n=i=>'INT-'+an+'-'+String(i).padStart(3,'0');
  const db={interventions:[1,2,3].map(i=>({num:n(i)})),interventionsArchive:[]};
  v('le numéro suit le plus grand émis',bac(db)(),n(4));
  db.interventionsArchive.push(db.interventions.pop());          // une annulation archive
  v('une intervention annulée ne libère pas son numéro',bac(db)(),n(4));
  db.interventionsArchive.push(db.interventions.pop(),db.interventions.pop());
  v('trois annulations non plus',bac(db)(),n(4));
  v('un numéro en double ne reste pas invisible',/function docNumsDoubles\(coll\)\{/.test(APP),true);
  const dbl=new Function('db',`${decoupe('function docNumsDoubles(coll){')}\nreturn docNumsDoubles;`);
  v('il est nommé sur l\'écran des factures',
    dbl({factures:[{num:'FAC-2026-014'},{num:'FAC-2026-014'},{num:'FAC-2026-015'}]})('factures'),['FAC-2026-014']);
}

console.log('\nLes traces d\'une entreprise ne suivent pas l\'appareil chez la suivante');
{ v('le verdict de repli compte le préfixe EXACT, pas « elan » tout court',
    /k\.indexOf\(STORE_KEY\.split\('_'\)\[0\]\+'_'\)===0/.test(APP),true);
  v('les sept clés du lien lisible partent ensemble',
    /'elan_lien_lisible_motif','elan_espace_admin'\]/.test(APP),true);
  v('« Mise en production » annonce le retrait voulu, sinon la synchro le défait',
    /function resetProdWipe\(\)\{[\s\S]{0,700}?syncRetraitVoulu\(\);/.test(APP),true);
}

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
