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
// Sur la bêta, il n'y a ni entreprise à nommer ni espace à rejoindre : l'identifiant et le mot
// de passe viennent de la Tour, rien d'autre. On retire le champ « Entreprise » et le lien
// « Rejoindre un espace » de l'écran de connexion — y taper un nom envoyait la page chercher
// une entreprise et expédier un lien de connexion à son adresse.
const ENT_AVANT = "${_surEspace?'':`<div class=\"field\"><label>Entreprise";
if (s.indexOf(ENT_AVANT) < 0) { console.error('ÉCHEC : le champ Entreprise de la connexion est introuvable'); process.exit(1); }
s = s.split(ENT_AVANT).join("${true?'':`<div class=\"field\"><label>Entreprise");
const LIEN_AVANT = '<div style="text-align:center;margin-top:14px"><a onclick="teamopJoinPrompt()"';
if (s.indexOf(LIEN_AVANT) < 0) { console.error('ÉCHEC : le lien « Rejoindre un espace » est introuvable'); process.exit(1); }
s = s.split(LIEN_AVANT).join('<div style="display:none"><a onclick="teamopJoinPrompt()"');
if (s.indexOf("const BETA_ESSAI=true;") < 0) { console.error('ÉCHEC : la porte serveur de la bêta (BETA_ESSAI) n\'est pas armée'); process.exit(1); }
// La refonte (nouveau dessin ne du logo : sapin, menthe, diagonale) est ARMEE PAR LA BETA seule.
// app.html sert la v561 a tous les clients ; ici on pose data-refonte sur <html> et le bloc
// <style id="refonte-css"> prend la main. Un seul attribut separe les deux mondes.
if (s.indexOf('<html lang="fr">') < 0) { console.error('ÉCHEC : la balise <html> de la page est introuvable'); process.exit(1); }
s = s.replace('<html lang="fr">', '<html lang="fr" data-refonte>');
s = s.replace(/<link rel="manifest"[^>]*>/, '');
/* La barre du haut ne porte QUE le nom — demande de Justin, 7 septembre 2026. Sur un
   téléphone il ne reste que 142 px entre le menu et les trois ronds, et « · 🧪 BÊTA » y
   mangeait la moitié du nom, tronqué en « OP GEST… ». Le repère de bêta ne disparaît pas
   pour autant : la couleur orange reste ici, la tête du menu affiche « BÊTA TESTE » en
   toutes lettres, l'écran de connexion aussi (ligne suivante), et l'adresse dit beta.html.
   Quatre marques valent mieux qu'une qui rend le nom illisible. */
s = s.split('<div class="topbar-brand mono">OP GESTION</div>').join('<div class="topbar-brand mono" style="color:var(--org)">OP GESTION</div>');
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
