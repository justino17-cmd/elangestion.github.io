#!/usr/bin/env node
/* Vérifie une page HTML de TeamOP sur trois points que l'œil rate :
     1. la syntaxe du JavaScript embarqué — chaque <script> sans src passe par node --check ;
     2. les variables CSS utilisées mais jamais définies — var(--x) sans « --x: » ni setProperty ;
        c'est la famille de bug qui cassait le mode jour de la Tour (--fond2) et 190 usages
        d'OP GESTION (--card2, --brd2) : une valeur de secours en dur, ou rien du tout ;
     3. le contraste WCAG des couples texte/fond des jetons, thème par thème.
   Usage : node scripts/verifier-theme.js tour.html [app.html …]
   Code de retour 1 si une erreur bloquante : syntaxe, ou fantôme sans valeur de secours. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TEXTES = ['--t1', '--t2', '--t3', '--text', '--text2', '--muted', '--dim', '--code', '--strong', '--link', '--side-ink', '--side-mut', '--on-acc'];
const FONDS = ['--bg', '--bg1', '--bg2', '--bg3', '--surface', '--inset', '--card', '--card2', '--hover', '--sel', '--chip', '--side', '--acc'];

function lireCouleur(v) {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null; // oklch, color-mix, var() : hors de portée de ce contrôle
}
function surFond(c, fond) {
  if (c.a >= 1 || !fond) return c;
  return { r: c.r * c.a + fond.r * (1 - c.a), g: c.g * c.a + fond.g * (1 - c.a), b: c.b * c.a + fond.b * (1 - c.a), a: 1 };
}
function luminance({ r, g, b }) {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contraste(a, b) { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

function verifierSyntaxe(html) {
  const erreurs = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)/) || [])[1] || '';
    if (type && !/javascript|module|ecmascript/i.test(type)) continue;
    n++;
    const tmp = path.join(os.tmpdir(), `teamop-verif-${process.pid}-${n}.${/module/i.test(type) ? 'mjs' : 'js'}`);
    fs.writeFileSync(tmp, m[2]);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) {
      const ligneDebut = html.slice(0, m.index).split('\n').length;
      erreurs.push(`script n°${n} (à partir de la ligne ${ligneDebut}) : ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')}`);
    }
    finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  return { scripts: n, erreurs };
}

function verifierVariables(html) {
  const definies = new Set();
  for (const m of html.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) definies.add(m[1]);
  for (const m of html.matchAll(/setProperty\(\s*['"](--[A-Za-z0-9_-]+)['"]/g)) definies.add(m[1]);
  const fantomes = new Map();
  for (const m of html.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g)) {
    if (definies.has(m[1])) continue;
    const e = fantomes.get(m[1]) || { avecSecours: 0, sansSecours: 0 };
    if (m[2]) e.avecSecours++; else e.sansSecours++;
    fantomes.set(m[1], e);
  }
  return fantomes;
}

function blocsDeJetons(html) {
  // chaque bloc CSS portant au moins cinq variables = un thème (ou un jeu d'accents)
  const blocs = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(html))) {
    const decls = [...m[2].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);?/g)];
    if (decls.length < 5) continue;
    const jetons = {};
    for (const d of decls) jetons[d[1]] = d[2].trim();
    blocs.push({ selecteur: m[1].trim().replace(/\s+/g, ' ').slice(-60), jetons });
  }
  return blocs;
}

function verifierContrastes(html) {
  const rapports = [];
  for (const bloc of blocsDeJetons(html)) {
    const c = {};
    for (const [k, v] of Object.entries(bloc.jetons)) { const col = lireCouleur(v); if (col) c[k] = col; }
    const base = c['--bg'] || c['--surface'] || c['--card'];
    if (!base) continue;
    const faibles = [];
    for (const t of TEXTES) {
      if (!c[t]) continue;
      for (const f of FONDS) {
        if (!c[f] || f === t) continue;
        if (t === '--on-acc' && f !== '--acc') continue;
        if (t !== '--on-acc' && f === '--acc') continue;
        const fond = surFond(c[f], base), texte = surFond(c[t], fond);
        const r = contraste(texte, fond);
        const seuil = (t === '--t3' || t === '--muted' || t === '--dim' || t === '--side-mut') ? 3.0 : 4.5; // textes secondaires : au moins le seuil UI
        if (r < seuil) faibles.push(`${t} sur ${f} = ${r.toFixed(2)}:1 (< ${seuil})`);
      }
    }
    rapports.push({ selecteur: bloc.selecteur, couleurs: Object.keys(c).length, faibles });
  }
  return rapports;
}

let bloquant = false;
for (const fichier of process.argv.slice(2)) {
  const html = fs.readFileSync(fichier, 'utf8');
  console.log(`\n══ ${fichier} ══`);

  const s = verifierSyntaxe(html);
  if (s.erreurs.length) { bloquant = true; console.log(`✗ syntaxe : ${s.erreurs.length} erreur(s) sur ${s.scripts} script(s)`); s.erreurs.forEach(e => console.log('   ' + e)); }
  else console.log(`✓ syntaxe : ${s.scripts} script(s) embarqué(s) valides`);

  const f = verifierVariables(html);
  if (!f.size) console.log('✓ variables : aucune variable fantôme');
  else for (const [nom, e] of f) {
    if (e.sansSecours) bloquant = true;
    console.log(`${e.sansSecours ? '✗' : '⚠'} variable ${nom} jamais définie — ${e.avecSecours} usage(s) avec secours, ${e.sansSecours} sans (propriété ignorée)`);
  }

  for (const r of verifierContrastes(html)) {
    if (!r.faibles.length) console.log(`✓ contrastes ${r.selecteur} : ${r.couleurs} couleurs, couples texte/fond conformes`);
    else { console.log(`⚠ contrastes ${r.selecteur} : ${r.faibles.length} couple(s) faible(s)`); r.faibles.forEach(x => console.log('   ' + x)); }
  }
}
process.exit(bloquant ? 1 : 0);
