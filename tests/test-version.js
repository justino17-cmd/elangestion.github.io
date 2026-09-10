/* Le contrat de versionEnLigne : cache d'une minute, lecture fraîche à la demande, refus si illisible. */
const fs=require('fs'); const SRC=fs.readFileSync('/home/user/teamop/server/index.js','utf8');
function decoupe(deb,fin){ const i=SRC.indexOf(deb); if(i<0) throw new Error('introuvable : '+deb); const j=SRC.indexOf(fin,i); if(j<0) throw new Error('fin introuvable'); return SRC.slice(i,j+fin.length); }
let ok=0,ko=0; const v=(t,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)){ok++;console.log('  ✓ '+t);} else {ko++;console.log('  ✗ '+t+' attendu '+JSON.stringify(b)+' obtenu '+JSON.stringify(a));} };
const code=decoupe('const versionLigne = { v: 0, ts: 0, encours: null };','  return versionLigne.encours;\n}');
let appels=0, corps="const APP_VERSION = '626';", faux=false, lus=0;
const flux=t=>({ async *[Symbol.asyncIterator](){ const b=Buffer.from(t,'utf8'); for(let i=0;i<b.length;i+=64000){ const m=b.subarray(i,i+64000); lus+=m.length; yield m; } } });
const bac=new Function('etat',`const fetch=(u,o)=>{ etat.appels++; if(etat.faux) return Promise.reject(new Error('réseau')); return Promise.resolve({ok:true,body:etat.flux(etat.corps)}); };
  const AbortController=function(){ this.signal={}; this.abort=()=>{}; }; const setTimeout=(f,ms)=>0; const clearTimeout=()=>{}; const console={error:()=>{}};
  ${code}
  return { versionEnLigne, etatCache: versionLigne };`)({get appels(){return appels;},set appels(x){appels=x;},get corps(){return corps;},get faux(){return faux;},flux});

(async()=>{
  console.log('Cache et fraîcheur');
  v('première lecture', await bac.versionEnLigne(), 626); v('un seul appel réseau', appels, 1);
  await bac.versionEnLigne(); v('la seconde lecture ne rappelle pas', appels, 1);
  corps="const APP_VERSION = '627';";
  v('le cache tient dans la minute', await bac.versionEnLigne(), 626);
  v('« Exiger » relit toujours', await bac.versionEnLigne(true), 627); v('deux appels réseau', appels, 2);
  bac.etatCache.ts = Date.now()-61000;
  v('après une minute, la lecture normale relit', await bac.versionEnLigne(), 627); v('trois appels', appels, 3);

  console.log('Quand teamop.fr est illisible');
  /* La garde de « Exiger » : refuser un chiffre PÉRIMÉ, pas refuser tout court. Une lecture ratée
     juste après une lecture réussie laisse une valeur d'il y a quelques secondes — elle est bonne. */
  /* La garde de « Exiger », mot pour mot : la lecture a-t-elle VRAIMENT abouti ? Pas « la valeur
     est-elle récente ? » — une lecture ratée trente secondes après une réussie laisserait passer
     l'ancien numéro, et c'est exactement le cas de production. */
  const exiger=async()=>{ const tsAvant=bac.etatCache.ts; const m=await bac.versionEnLigne(true); return (!m||bac.etatCache.ts===tsAvant)?503:m; };
  faux=true; const avant=bac.etatCache.ts;
  v('lecture ratée juste après une réussie : REFUSÉ, pas 627', await exiger(), 503);
  v("l'horodatage n'a pas bougé", bac.etatCache.ts, avant);
  bac.etatCache.v=0; bac.etatCache.ts=0;
  v('jamais rien lu : refusé aussi', await exiger(), 503);
  faux=false; corps="const APP_VERSION = '628';";
  v('teamop.fr revient : « Exiger » rend la version servie', await exiger(), 628);

  console.log('Lecture bornée : on ne tire pas trois mégaoctets');
  lus=0; bac.etatCache.ts=0; corps="const APP_VERSION = '629';"+'x'.repeat(3000000);
  v('version lue', await bac.versionEnLigne(true), 629);
  v('moins de 200 Ko tirés sur une page de 3 Mo', lus<200000, true);
  lus=0; bac.etatCache.ts=0; corps='y'.repeat(3000000);   // page sans version : plafond
  await bac.versionEnLigne(true);
  v('page sans version : plafonnée à 1,2 Mo', lus<=1300000, true);
  v('et la valeur connue reste la dernière lue', bac.etatCache.v, 629);

  console.log('\n'+ok+' ✓  '+ko+' ✗'); process.exit(ko?1:0);
})();
