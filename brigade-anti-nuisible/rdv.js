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

    /* ── étape 3 : validation et récapitulatif ── */
    var form = document.getElementById('rdv-form');
    var erreur = document.getElementById('rdv-erreur');

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

      var demande = {
        jour: etat.jour, creneau: etat.creneau,
        nom: nom, telephone: tel, commune: commune,
        nuisible: form.nuisible.value, lieu: form.lieu.value,
        details: form.details.value.trim()
      };
      envoyerDemande(demande);

      remplir('recap-jour', demande.jour);
      remplir('recap-creneau', demande.creneau);
      remplir('recap-nom', demande.nom);
      remplir('recap-tel', demande.telephone);
      remplir('recap-commune', demande.commune);
      remplir('recap-nuisible', demande.nuisible);
      remplir('recap-lieu', demande.lieu);
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
