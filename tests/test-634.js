const fs=require('fs'); const APP=fs.readFileSync('/home/user/teamop/app.html','utf8');
function dec(h){ const d=APP.indexOf(h); if(d<0) throw new Error(h); for(let i=d;i<d+14000;i++){ if(APP[i]!=='}'&&APP[i]!==';') continue; const b=APP.slice(d,i+1); try{ new Function(b); return b; }catch(e){} } throw new Error('fin '+h); }
const code=['const norm = s =>','function idCatalogue(nom,prefixe){','function produitCle(p){','function slugNom(nom){','function idProduit(nom){','function produitMemeNom(a,b){','function empreinteNom(s){','function produitCreer(fiche,opts){','function produitsDoublons(){','function uidTs(id){','function produitCree(p){','function produitsDistinctIds(cle){','function produitDistinct(p){'].map(dec).join('\n');
const bac=new Function('etat',`let db=etat.db, poussees=[];
  const uid=()=>(etat.pre||'u')+(etat.n=(etat.n||0)+1)+Math.random().toString(36).slice(2,7); const currentUser={id:'moi'};
  const produitCreePrevenir=p=>poussees.push(p.nom);
  ${code}
  return { produitCreer, produitsDoublons, idCatalogue, idProduit, produitCle, slugNom, empreinteNom, poussees };`);
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+'\n      attendu : '+JSON.stringify(b)+'\n      obtenu  : '+JSON.stringify(a));} };

console.log('Une référence fournisseur et une référence du pack ne font plus deux fiches');
{ const db={produits:[]}; const g=bac({db});
  // le pack officiel pose « VULCANO 5 » ; la gamme ORCAD la porte aussi
  g.produitCreer({id:g.idCatalogue('VULCANO 5'),nom:'VULCANO 5',fournisseurs:['ORCAD']},{semis:true});
  const r=g.produitCreer({id:g.idCatalogue('Vulcano 5'),nom:'Vulcano 5',fournisseurs:['ORCAD']},{push:true});
  v('une seule fiche',db.produits.length,1);
  v('la seconde demande rend la première',r.nom,'VULCANO 5');
  v('aucun doublon à fusionner ensuite',g.produitsDoublons().length,0);
  v('rien n\'est annoncé comme nouveau',g.poussees,[]); }

console.log('Deux noms longs que la troncature à 60 signes confond entrent tous les deux');
{ const a='Vanne de décompression pistolet pour pompe MABI 8L eco raccord acier';
  const b='Vanne de décompression pistolet pour pompe MABI 8L eco raccord inox';
  const db={produits:[]}; const g=bac({db});
  v('le même identifiant, en effet',g.idCatalogue(a),g.idCatalogue(b));
  const pa=g.produitCreer({id:g.idCatalogue(a),nom:a},{push:true});
  const pb=g.produitCreer({id:g.idCatalogue(b),nom:b},{push:true});
  v('les deux fiches existent',db.produits.length,2);
  v('des identifiants distincts',pa.id!==pb.id,true);
  v('la seconde porte bien son nom',pb.nom,b);
  v('ce ne sont pas des doublons',g.produitsDoublons().length,0);
  v('le premier arrivé garde l\'identifiant nu',pa.id,g.idCatalogue(a));
  v('le second porte l\'empreinte de son nom entier',pb.id,g.idCatalogue(b)+'-'+g.empreinteNom(g.slugNom(b)));
  // l'ordre inverse croise les identifiants : c'est le résidu assumé, et il reste rattrapable
  const db2={produits:[]}; const g2=bac({db:db2});
  const qb=g2.produitCreer({id:g2.idCatalogue(b),nom:b},{push:true});
  const qa=g2.produitCreer({id:g2.idCatalogue(a),nom:a},{push:true});
  v('dans l\'autre sens les deux entrent quand même',[db2.produits.length,qb.nom,qa.nom],[2,b,a]);
  v('mais les identifiants se croisent — un doublon, pas une perte',qb.id!==pb.id,true);
  const g3=bac({db:{produits:[pa,pb,qa,qb].map(x=>({...x}))}});
  v('et le détecteur de doublons le voit',g3.produitsDoublons().length,2); }

console.log('Les cinq écritures différentes du MÊME produit se replient sur une fiche');
{ const paires=[['TEENOX® EC','Teenox EC'],['DOBOL FUMIGATEUR (20g)','Dobol fumigateur 20g'],
    ['PISTOLET "BAIT GUN"','Pistolet Bait Gun'],['ECHELLE TELESCOPIQUE 3,80m','Echelle telescopique 3.80m'],
    ['TEENOX® GEL BLATTES - ARMOSA','Teenox gel blattes - Armosa']];
  const db={produits:[]}; const g=bac({db});
  paires.forEach(([a,b])=>{ g.produitCreer({id:g.idCatalogue(a),nom:a},{push:true}); g.produitCreer({id:g.idCatalogue(b),nom:b},{push:true}); });
  v('cinq paires, cinq fiches',db.produits.length,5);
  v('c\'est la première écriture qui reste',db.produits.map(p=>p.nom),paires.map(x=>x[0]));
  v('aucune empreinte ajoutée sur ces identifiants-là',db.produits.map(p=>p.id),paires.map(x=>g.idCatalogue(x[0]))); }

console.log('Le même produit demandé deux fois reste une seule fiche');
{ const db={produits:[]}; const g=bac({db});
  const p1=g.produitCreer({id:g.idCatalogue('GEL SCIANT'),nom:'GEL SCIANT'},{push:true});
  const p2=g.produitCreer({id:g.idCatalogue('gel  sciant'),nom:'gel  sciant'},{push:true});
  v('une seule fiche',db.produits.length,1);
  v('c\'est la même',p1===p2,true);
  v('annoncée une seule fois',g.poussees.length,1); }

console.log('Un nom qui ne laisse rien une fois réduit ne prend PAS l\'identifiant générique');
{ const db={produits:[]}; const g=bac({db});
  v('« ??? » et « !!! » slugueraient tous les deux en rien',[g.idCatalogue('???'),g.idCatalogue('!!!')],['cat_x','cat_x']);
  const a=g.produitCreer({id:g.idProduit('???'),nom:'???'},{push:true});
  const b2=g.produitCreer({id:g.idProduit('!!!'),nom:'!!!'},{push:true});
  v('les deux fiches existent',db.produits.map(p=>p.nom),['???','!!!']);
  v('aucune ne porte cat_x',[a.id,b2.id].filter(x=>x==='cat_x').length,0);
  // et si un appelant force quand même l'identifiant générique, la garde de produitCreer rattrape
  const db2={produits:[]}; const g2=bac({db:db2});
  g2.produitCreer({id:'cat_x',nom:'???'},{push:true});
  const c=g2.produitCreer({id:'cat_x',nom:'!!!'},{push:true});
  v('la ceinture de sécurité les sépare aussi',[db2.produits.length,c.nom],[2,'!!!']);
  // un nom en écriture non latine : même traitement
  const db3={produits:[]}; const g3=bac({db:db3});
  g3.produitCreer({id:g3.idProduit('مبيد'),nom:'مبيد'},{push:true});
  g3.produitCreer({id:g3.idProduit('Приманка'),nom:'Приманка'},{push:true});
  v('deux noms non latins restent deux produits',db3.produits.length,2); }

console.log('Aucun chemin de nom libre ne fabrique plus l\'identifiant générique');
{ const APPEL=/produitCreer\(\{id:idCatalogue\(([a-z]\.nom|nom)\)/g;
  v('plus aucun appel produitCreer avec idCatalogue sur un nom libre',(APP.match(APPEL)||[]).length,0);
  // les sites qui gardent idCatalogue prennent tous leur nom d'une CONSTANTE du fichier
  const restants=(APP.match(/id:idCatalogue\(([^)]*)\)/g)||[]).map(x=>x.replace(/^id:idCatalogue\(/,'').replace(/\)$/,''));
  /* `f.nom,'four'` s'est ajouté le 11 septembre 2026 (v665) : le semis du pack FOURNISSEURS_3D.
     Il a sa place dans cette liste pour la MÊME raison que les autres — le nom vient d'une
     CONSTANTE de ce fichier (ARMOSA, ENSYSTEX, SODIF, MABI, ORCAD), jamais d'une saisie, et
     les cinq sluguent. Sans identifiant déduit, trois appareils qui sèment le pack chacun de
     leur côté tiraient trois uid() différents : mesuré chez ELAN, cinq fournisseurs en TRIPLE,
     seize fiches pour six. ⚠️ Un fournisseur créé à la main garde uid() — cette ligne ne
     l'autorise QUE pour le pack. */
  v('et ceux qui restent viennent de CATALOGUE, CATFOUR ou du pack fournisseurs',[...new Set(restants)].sort(),['c[0]',"f.nom,'four'",'nom','x[0]']);
  v('le site « nom » est celui de cataloguePoser, gardé par slugNom',/if\(!nom\|\|!slugNom\(nom\)\)return;/.test(APP),true); }

console.log('Deux appareils hors ligne, deux noms illisibles : la synchro n\'en écrase plus un');
{ /* la fusion unit par IDENTIFIANT et ne passe jamais par la garde de produitCreer — c'est pour ça
     que l'identifiant doit être unique DÈS la création, pas rattrapé après. */
  const fusion=(A,B)=>{ const m=new Map(); [].concat(A,B).forEach(r=>{ const e=m.get(r.id);
    if(!e||(r._m||0)>(e._m||0)) m.set(r.id,r); }); return [...m.values()]; };
  const dbA={produits:[]}, dbB={produits:[]}; const gA=bac({db:dbA,pre:'A'}), gB=bac({db:dbB,pre:'B'});
  gA.produitCreer({id:gA.idProduit('杀虫剂'),nom:'杀虫剂',qte:12,_m:100},{push:true});
  gB.produitCreer({id:gB.idProduit('★★★'),nom:'★★★',qte:50,_m:200},{push:true});
  const apres=fusion(dbA.produits,dbB.produits);
  v('les deux produits survivent à la synchro',apres.length,2);
  v('et leurs deux stocks avec',apres.map(p=>p.qte).sort((a,b)=>a-b),[12,50]); }

console.log('Le semis se date d\'avant tout et n\'est jamais « nouveau »');
{ const m=APP.match(/const produits = CATALOGUE\.map\([^\n]*\n/); if(!m) throw new Error('semis introuvable');
  v('le semis porte cree:0',/cree:0/.test(m[0]),true);
  v('le semis porte _m:1',/_m:1/.test(m[0]),true);
  v('son identifiant est déduit du nom',/id:idCatalogue\(c\[0\]\)/.test(m[0]),true); }

console.log('Plus aucun chemin ne compare les noms « à la main »');
{ v('aucun (p.nom||\'\').toLowerCase()===',APP.split("(p.nom||'').toLowerCase()===").length-1,0);
  v('aucun identifiant « four_ » fabriqué',APP.split("idCatalogue(x[2]+' '+x[0],'four')").length-1,0);
  v('un seul db.produits.push dans le code',APP.split('\n').filter(l=>/db\.produits\.push\(/.test(l)&&!/^\s*(\/\/|\*|\/\*)/.test(l)&&!/n'existe/.test(l)).length,1); }

console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
