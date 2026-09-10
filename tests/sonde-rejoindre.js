const pw=require('playwright-core'); const att=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:false,args:['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  const ctx=await b.newContext({viewport:{width:1200,height:900}}); const p=await ctx.newPage(); const err=[]; p.on('pageerror',e=>err.push(e.message)); p.on('dialog',d=>d.accept());
  await p.goto('http://127.0.0.1:8123/beta.html',{waitUntil:'load',timeout:60000}); await att(1500);
  /* ── 1. un appareil qui a DÉJÀ SERVI : son vidage unique a eu lieu, le drapeau est posé ── */
  await p.evaluate(()=>{ localStorage.setItem('elanB_vierge_v1','1'); localStorage.setItem('elanB_prod_v2','1');
    localStorage.setItem('elanB_gestion_v2',JSON.stringify({produits:[{id:'p',nom:'Un produit à moi'}],boxes:[],users:[]})); });
  /* ── 2. il REJOINT un espace en appelant LE VRAI teamopJoin, pas une imitation ── */
  const joint=await p.evaluate(()=>{
    const code=btoa(unescape(encodeURIComponent(JSON.stringify({t:'espace-elan-test',k:'cle-test',n:'ELAN'}))));
    if(typeof teamopJoin!=='function') return 'teamopJoin absent';
    teamopJoin(code);
    return { team:localStorage.getItem('elanB_sync_team'), frais:localStorage.getItem('elanB_frais'),
      storeKey:localStorage.getItem('elanB_gestion_v2'), vierge:localStorage.getItem('elanB_vierge_v1') }; });
  await p.reload({waitUntil:'load',timeout:60000}); await att(1800);
  const apres=await p.evaluate(()=>({
    produits:(db.produits||[]).length, boxes:(db.boxes||[]).map(x=>x.nom||x.numero),
    fournisseurs:(db.fournisseurs||[]).length, devis:(db.devis||[]).length, factures:(db.factures||[]).length,
    contrats:(db.contrats||[]).length, clients:(db.clients||[]).length, interventions:(db.interventions||[]).length,
    drapeauVierge:!!localStorage.getItem('elanB_vierge_v1') }));
  /* ── 3. et ce que la fusion en ferait chez le client, qui a ses 110 noms sous ids aléatoires ── */
  const fusion=await p.evaluate(()=>{
    const equipe={produits:[],boxes:[],users:[],clients:[],interventions:[],devis:[],factures:[],contrats:[],fournisseurs:[],
      mouvements:[],bons:[],demandes:[],journal:[],boxDecisions:[],produitsDistincts:[]};
    CATALOGUE.slice(0,110).forEach(c=>{ equipe.produits.push({id:uid(),nom:c[0],categorie:c[1],cree:0,_m:2});
      equipe.produits.push({id:uid(),nom:c[0],categorie:c[1],cree:0,_m:2}); });
    equipe.boxes.push({id:'vraie',nom:'ELAN CAZABOX',stock:{}});
    const avant={equipe:equipe.produits.length, boxesEquipe:equipe.boxes.map(x=>x.nom)};
    const r=fusionnerBases(db,JSON.parse(JSON.stringify(equipe)),false);
    const noms={}; (r.produits||[]).forEach(q=>{ const k=produitCle(q); noms[k]=(noms[k]||0)+1; });
    return { avant, apres:{produits:r.produits.length, boxes:(r.boxes||[]).map(x=>x.nom||x.numero),
      devis:(r.devis||[]).length, factures:(r.factures||[]).length, contrats:(r.contrats||[]).length,
      tripletsOuPire:Object.values(noms).filter(n=>n>2).length, maxParNom:Math.max(...Object.values(noms)) } }; });
  console.log(JSON.stringify({joint,apresRejoindre:apres,fusionChezLeClient:fusion,err},null,1)); await b.close(); })().catch(e=>{ console.error('ÉCHEC',e.message); process.exit(1); });
