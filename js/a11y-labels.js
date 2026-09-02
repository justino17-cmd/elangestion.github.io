/* Association libellé ↔ champ, faite à l'exécution.
   ────────────────────────────────────────────────────────────────────────
   Aucune des 247 balises <label> du projet n'était reliée à son champ : un
   lecteur d'écran annonçait des champs anonymes, et cliquer sur le libellé
   ne donnait pas le focus. (WCAG 1.3.1, 3.3.2, 4.1.2)

   La correction n'est pas faite dans les gabarits parce que 168 d'entre eux
   sont produits par des chaînes JavaScript, dont plusieurs rendues en boucle :
   y inscrire des id statiques fabriquerait des doublons, ce qui casse
   l'association au lieu de la réparer. On relie donc chaque libellé au champ
   qui le suit au moment où il entre dans le document, avec un identifiant
   unique garanti par compteur.

   Le fichier est partagé par app.html, messages.html, espace.html et
   elan.html — les quatre pages porteuses de formulaires. */
(function () {
  var seq = 0;
  var FIELD = /^(INPUT|SELECT|TEXTAREA)$/;

  function control(label) {
    // Champ frère immédiat, ou premier champ du bloc frère (motif .field / .frow).
    var n = label.nextElementSibling;
    if (n && FIELD.test(n.tagName)) return n;
    if (n && n.querySelector) {
      var inner = n.querySelector('input,select,textarea');
      if (inner) return inner;
    }
    // Sinon, champ suivant à l'intérieur du même conteneur.
    var box = label.parentElement;
    return box ? box.querySelector('input,select,textarea') : null;
  }

  function link(root) {
    if (!root || !root.querySelectorAll) return;
    var labels = root.querySelectorAll('label:not([for]):not([data-lbl])');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      l.setAttribute('data-lbl', '1');
      // Un champ imbriqué donne déjà l'association implicite : ne rien faire.
      if (l.querySelector('input,select,textarea')) continue;
      var c = control(l);
      if (!c || !FIELD.test(c.tagName)) continue;
      if (c.type === 'hidden') continue;
      if (!c.id) c.id = 'f-a11y-' + (++seq);
      l.setAttribute('for', c.id);
    }
  }

  function scan() { try { link(document); } catch (e) { console.error('a11y-labels', e); } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();

  // Les vues et les modales sont réécrites par innerHTML : on traite ce qui
  // vient d'être inséré, pas le document entier.
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) { try { link(added[j]); } catch (e) { console.error('a11y-labels', e); } }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    console.error('a11y-labels : observateur indisponible', e);
  }
})();
