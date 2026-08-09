/* BRIGADE ANTI-NUISIBLE — menu mobile, commun à toutes les pages.
   Ouverture / fermeture du menu replié, et fermeture au choix d'une rubrique. */
(function () {
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('menu-principal');
  if (!burger || !menu) return;
  burger.addEventListener('click', function () {
    var ouvert = menu.classList.toggle('ouvert');
    burger.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    burger.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      menu.classList.remove('ouvert');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Ouvrir le menu');
    }
  });
})();
