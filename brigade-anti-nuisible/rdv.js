/* BRIGADE ANTI-NUISIBLE — prise de rendez-vous.
   Le client choisit un jour (deux prochaines semaines, dimanche exclu),
   un créneau horaire, laisse ses coordonnées et obtient un récapitulatif. */
(function () {
  function initRdv() {
    var zone = document.getElementById('rdv-jours');
    if (!zone || zone.dataset.pret) return;
    zone.dataset.pret = '1';

    var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var etat = { jour: null, creneau: null };

    /* ── étape 1 : les douze prochains jours ouvrés (lundi–samedi) ── */
    var d = new Date();
    d.setDate(d.getDate() + 1);
    var ajoutes = 0;
    while (ajoutes < 12) {
      if (d.getDay() !== 0) {
        (function (dd) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'rdv-jour';
          b.setAttribute('aria-pressed', 'false');
          b.innerHTML = '<small>' + JOURS[dd.getDay()] + '</small><b>' + dd.getDate() + '</b><span>' + MOIS[dd.getMonth()] + '</span>';
          var libelle = JOURS[dd.getDay()] + ' ' + dd.getDate() + ' ' + MOIS[dd.getMonth()];
          b.addEventListener('click', function () {
            zone.querySelectorAll('.rdv-jour').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
            etat.jour = libelle;
          });
          zone.appendChild(b);
        })(new Date(d));
        ajoutes++;
      }
      d.setDate(d.getDate() + 1);
    }

    /* ── étape 2 : le créneau horaire ── */
    document.querySelectorAll('.rdv-creneau').forEach(function (c) {
      c.addEventListener('click', function () {
        document.querySelectorAll('.rdv-creneau').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        c.setAttribute('aria-pressed', 'true');
        etat.creneau = c.textContent.replace(/\s+/g, ' ').trim();
      });
    });

    /* ── estimation de devis en direct ──
       À AJUSTER : grille tarifaire INDICATIVE (fourchettes TTC, déplacement et
       diagnostic compris). Remplacer par les vrais tarifs de l'entreprise. */
    var GRILLE = {
      'Rats ou souris':                     { base: [90, 150] },
      'Cafards / blattes':                  { base: [110, 180] },
      'Punaises de lit':                    { base: [180, 350] },
      'Nid de guêpes':                      { base: [90, 140], forfait: true },
      'Frelons (européens ou asiatiques)':  { base: [110, 180], forfait: true },
      'Fourmis':                            { base: [80, 130] },
      'Puces':                              { base: [110, 170] },
      'Je ne sais pas encore':              null
    };
    var COEF_SURFACE = {
      'Moins de 50 m²': 1,
      'Entre 50 et 100 m²': 1.25,
      'Plus de 100 m²': 1.5,
      'Je ne sais pas': 1.25
    };
    var COEF_AMPLEUR = {
      'Je viens de le remarquer': 1,
      'Présence régulière depuis quelques semaines': 1.15,
      "C'est installé, j'en vois partout": 1.35
    };
    /* À AJUSTER : frais de déplacement par secteur (essence + temps de route).
       Mettre 0 pour le département où l'entreprise est basée, et le vrai
       supplément pour les autres. */
    var FRAIS_SECTEUR = {
      'Charente-Maritime (17)': 0,
      'Vendée (85)': 20,
      'Loire-Atlantique (44)': 40
    };
    /* À AJUSTER : prix de chaque passage au-delà du premier, et supplément
       pour la garantie longue. */
    var PRIX_PASSAGE_SUPP = 40;
    var PRIX_GARANTIE = { '3 mois': 0, '6 mois': 30 };

    var form = document.getElementById('rdv-form');
    var erreur = document.getElementById('rdv-erreur');
    var montantEl = document.getElementById('rdv-montant');
    var detailEl = document.getElementById('rdv-detail');
    var precisionEl = document.getElementById('rdv-precision');
    var champSurface = document.getElementById('champ-surface');
    var champAmpleur = document.getElementById('champ-ampleur');
    var champPassages = document.getElementById('champ-passages');
    var champGarantie = document.getElementById('champ-garantie');

    function dix(v) { return Math.round(v / 10) * 10; }

    /* le calcul : traitement (main-d'œuvre + produits), passages supplémentaires,
       garantie choisie, puis déplacement selon le secteur */
    function estimation() {
      var regle = GRILLE[form.nuisible.value];
      if (!regle) return null;
      var bas = regle.base[0], haut = regle.base[1];
      var supPassages = 0, supGarantie = 0;
      if (!regle.forfait) {
        var cs = COEF_SURFACE[form.surface.value] || 1;
        var ca = COEF_AMPLEUR[form.ampleur.value] || 1;
        bas = dix(bas * cs * ca);
        haut = dix(haut * cs * ca);
        var nb = parseInt(form.passages.value, 10);       /* NaN pour « Sur conseil » */
        if (nb >= 2) supPassages = (nb - 1) * PRIX_PASSAGE_SUPP;
        supGarantie = PRIX_GARANTIE[form.garantie.value] || 0;
      }
      var frais = FRAIS_SECTEUR[form.departement.value] || 0;
      var totalBas = bas + supPassages + supGarantie + frais;
      var totalHaut = haut + supPassages + supGarantie + frais;
      return {
        traitementBas: bas, traitementHaut: haut,
        supPassages: supPassages, supGarantie: supGarantie, frais: frais,
        texte: totalBas + ' € – ' + totalHaut + ' €'
      };
    }

    function majEstimation() {
      var regle = GRILLE[form.nuisible.value];
      /* un nid se chiffre au forfait, réglé en un seul passage : surface,
         ampleur, passages et garantie ne s'appliquent pas */
      var forfait = regle && regle.forfait;
      champSurface.style.display = forfait ? 'none' : '';
      champAmpleur.style.display = forfait ? 'none' : '';
      champPassages.style.display = forfait ? 'none' : '';
      champGarantie.style.display = forfait ? 'none' : '';
      var e = estimation();
      if (e) {
        montantEl.textContent = e.texte;
        var morceaux = ['<span>Traitement (main-d’œuvre et produits) : ' + e.traitementBas + ' € – ' + e.traitementHaut + ' €</span>'];
        if (!forfait) {
          if (e.supPassages) morceaux.push('<span>Passages supplémentaires : +' + e.supPassages + ' €</span>');
          morceaux.push('<span>Garantie ' + form.garantie.value + ' : ' + (e.supGarantie ? '+' + e.supGarantie + ' €' : 'incluse') + '</span>');
        }
        morceaux.push('<span>Déplacement : ' + (e.frais ? '+' + e.frais + ' €' : 'inclus') + '</span>');
        detailEl.innerHTML = morceaux.join(' · ');
        precisionEl.textContent = 'Estimation indicative, diagnostic compris. Le prix définitif est confirmé gratuitement sur place, avant toute intervention — jamais au-delà du devis validé ensemble.';
      } else {
        montantEl.textContent = 'Sur diagnostic';
        detailEl.textContent = '';
        precisionEl.textContent = 'Pas encore sûr de l’espèce ? Le technicien l’identifie lors du passage gratuit et vous annonce le prix avant toute intervention.';
      }
    }

    ['nuisible', 'surface', 'ampleur', 'passages', 'garantie', 'departement'].forEach(function (n) {
      form[n].addEventListener('change', majEstimation);
    });
    majEstimation();

    /* ── autocomplétion de la commune (liste officielle 17 · 85 · 44) ── */
    var communeInput = form.commune;
    var boiteSugg = document.getElementById('rdv-suggestions');
    if (window.COMMUNES && boiteSugg) {
      var NOMS_DEP = { '17': 'Charente-Maritime (17)', '85': 'Vendée (85)', '44': 'Loire-Atlantique (44)' };
      var actif = -1;
      var plat = function (s) {
        return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[-'’ ]+/g, ' ').trim();
      };
      var fermer = function () {
        boiteSugg.classList.remove('visible');
        boiteSugg.innerHTML = '';
        actif = -1;
        communeInput.setAttribute('aria-expanded', 'false');
      };
      var choisir = function (nom, dep) {
        communeInput.value = nom;
        form.departement.value = NOMS_DEP[dep];
        majEstimation();
        fermer();
      };
      var suggerer = function () {
        var q = plat(communeInput.value);
        if (q.length < 2) { fermer(); return; }
        var debut = [], dedans = [];
        for (var i = 0; i < COMMUNES.length; i++) {
          var n = plat(COMMUNES[i][0]);
          if (n.indexOf(q) === 0) debut.push(COMMUNES[i]);
          else if (n.indexOf(q) !== -1) dedans.push(COMMUNES[i]);
          if (debut.length >= 8) break;
        }
        var res = debut.concat(dedans).slice(0, 8);
        if (!res.length) { fermer(); return; }
        boiteSugg.innerHTML = '';
        res.forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button';
          var nomEl = document.createElement('span');
          nomEl.textContent = c[0];
          var depEl = document.createElement('span');
          depEl.className = 'dep';
          depEl.textContent = c[1];
          b.appendChild(nomEl);
          b.appendChild(depEl);
          b.addEventListener('click', function () { choisir(c[0], c[1]); });
          boiteSugg.appendChild(b);
        });
        actif = -1;
        boiteSugg.classList.add('visible');
        communeInput.setAttribute('aria-expanded', 'true');
      };
      communeInput.addEventListener('input', suggerer);
      communeInput.addEventListener('focus', suggerer);
      communeInput.addEventListener('blur', function () { setTimeout(fermer, 180); });
      communeInput.addEventListener('keydown', function (e) {
        var boutons = boiteSugg.querySelectorAll('button');
        if (!boutons.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length;
          boutons.forEach(function (b, i) { b.classList.toggle('active', i === actif); });
          boutons[actif].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && actif >= 0) {
          e.preventDefault();
          boutons[actif].click();
        } else if (e.key === 'Escape') {
          fermer();
        }
      });
    }

    function remplir(id, valeur) {
      var el = document.getElementById(id);
      if (el) el.textContent = valeur;
    }

    /* À VENIR : brancher ici l'envoi réel de la demande (e-mail ou serveur)
       dès qu'un canal de réception existe. La demande complète est dans `demande`. */
    function envoyerDemande(demande) {
      void demande;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var manques = [];
      if (!etat.jour) manques.push('le jour (étape 1)');
      if (!etat.creneau) manques.push("le créneau horaire (étape 2)");
      var nom = form.nom.value.trim();
      var tel = form.telephone.value.trim();
      var commune = form.commune.value.trim();
      if (!nom) manques.push('votre nom');
      if (!/^[0-9 +().\-]{8,}$/.test(tel)) manques.push('un numéro de téléphone valide');
      if (!commune) manques.push('votre commune');
      if (manques.length) {
        erreur.textContent = 'Pour valider, il manque : ' + manques.join(', ') + '.';
        erreur.classList.add('visible');
        erreur.scrollIntoView({ block: 'center' });
        return;
      }
      erreur.classList.remove('visible');

      var forfaitNid = GRILLE[form.nuisible.value] && GRILLE[form.nuisible.value].forfait;
      var estim = estimation();
      var demande = {
        jour: etat.jour, creneau: etat.creneau,
        nom: nom, telephone: tel, commune: commune,
        departement: form.departement.value,
        nuisible: form.nuisible.value, lieu: form.lieu.value,
        surface: forfaitNid ? '—' : form.surface.value,
        ampleur: forfaitNid ? '—' : form.ampleur.value,
        passages: forfaitNid ? '1 passage (forfait nid)' : form.passages.value,
        garantie: forfaitNid ? '—' : form.garantie.value,
        estimation: estim
          ? estim.texte + (estim.frais ? ' (dont ' + estim.frais + ' € de déplacement)' : ' (déplacement inclus)')
          : 'Sur diagnostic gratuit',
        details: form.details.value.trim()
      };
      envoyerDemande(demande);

      remplir('recap-jour', demande.jour);
      remplir('recap-creneau', demande.creneau);
      remplir('recap-nom', demande.nom);
      remplir('recap-tel', demande.telephone);
      remplir('recap-commune', demande.commune);
      remplir('recap-departement', demande.departement);
      remplir('recap-nuisible', demande.nuisible);
      remplir('recap-lieu', demande.lieu);
      remplir('recap-surface', demande.surface);
      remplir('recap-ampleur', demande.ampleur);
      remplir('recap-passages', demande.passages);
      remplir('recap-garantie', demande.garantie);
      remplir('recap-estimation', demande.estimation);
      remplir('recap-details', demande.details || '—');

      document.getElementById('rdv-app').style.display = 'none';
      var conf = document.getElementById('rdv-confirmation');
      conf.classList.add('visible');
      conf.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('rdv-modifier').addEventListener('click', function () {
      document.getElementById('rdv-confirmation').classList.remove('visible');
      document.getElementById('rdv-app').style.display = '';
      document.getElementById('rdv-app').scrollIntoView();
    });
  }

  window.initRdv = initRdv;
  initRdv();
})();
