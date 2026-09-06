/* Génère beta.html — le canal d'essai isolé d'OP GESTION.
   Usage : node beta-build.js   (à relancer à chaque version à tester)
   La bêta a SES données locales (préfixe elanB_), SON espace de synchro par défaut
   (elan-gestion-beta) et un bandeau 🧪 BÊTA : elle ne touche jamais aux données
   de l'app réelle ni à celles des clients. Première connexion : admin / 1234. */
const fs = require('fs');
let s = fs.readFileSync('app.html', 'utf8');
s = s.split("'elan_").join("'elanB_");
s = s.split('"elan_').join('"elanB_');
s = s.split("'op_devis_code'").join("'opB_devis_code'");
s = s.split("FB_TEAM='elan-gestion'").join("FB_TEAM='elan-gestion-beta'");
s = s.replace(/const APP_VERSION = '([0-9]+)'/, "const APP_VERSION = '$1-beta'");
// La porte serveur : la bêta ne connaît aucun compte de départ et demande à api.teamop.fr
// avant d'ouvrir. Les accès se créent et se coupent depuis la Tour de contrôle (Accès bêta).
s = s.split("const BETA_ESSAI=false;").join("const BETA_ESSAI=true;");
if (s.indexOf("const BETA_ESSAI=true;") < 0) { console.error('ÉCHEC : la porte serveur de la bêta (BETA_ESSAI) n\'est pas armée'); process.exit(1); }
s = s.replace(/<link rel="manifest"[^>]*>/, '');
s = s.split('<div class="topbar-brand mono">OP GESTION</div>').join('<div class="topbar-brand mono" style="color:var(--org)">OP GESTION · 🧪 BÊTA</div>');
s = s.split('<h2>OP GESTION</h2>').join('<h2>OP GESTION <span style="font-size:12px;color:var(--org);vertical-align:middle">🧪 BÊTA</span></h2>');
if (s.indexOf("'elanB_gestion_v2'") < 0) { console.error('ÉCHEC : le stockage local de la bêta n\'est pas isolé (STORE_KEY)'); process.exit(1); }
if (s.indexOf("FB_TEAM='elan-gestion-beta'") < 0) { console.error('ÉCHEC : l\'espace de synchro bêta n\'est pas isolé (FB_TEAM)'); process.exit(1); }
// Sortie par défaut : beta.html. Un chemin en argument sert au canal d'aperçu
// (scripts/apercu.sh), qui veut la même isolation des données sous /apercu/.
// La route PROPOSE du serveur exécute ce fichier dans un bac à sable dont le faux
// `process` n'a que exit() : on ne suppose jamais argv.
const sortie = (process.argv && process.argv[2]) || 'beta.html';
fs.writeFileSync(sortie, s);
console.log(sortie + ' générée (' + Math.round(s.length / 1024) + ' Ko) — version ' + (s.match(/APP_VERSION = '([^']+)'/) || [])[1]);
