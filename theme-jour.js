/* Thème jour / nuit TEAM OP — bouton ☀️/🌙 en bas à droite, mémorisé (localStorage).
   Intégration : <script src="theme-jour.js" defer></script> sur chaque page, après fond-anime-teamop.js.
   Le thème jour s'applique via la classe "jour" sur <html>. */
(function () {
  var KEY = 'teamop-theme';
  var CSS = [
    'html.jour { background: #eef3fb !important; }',
    'html.jour body { background: transparent !important; }',
    'html.jour a { color: #1d4ed8; } html.jour a:hover { color: #1e40af; }',
    /* Surfaces */
    'html.jour [style*="background: rgba(10, 16, 32"] { background: rgba(255, 255, 255, 0.92) !important; }',
    'html.jour [style*="background: rgba(14, 23, 46"] { background: #ffffff !important; }',
    'html.jour [style*="background: rgba(13, 21, 42"] { background: #ffffff !important; }',
    'html.jour [style*="background: rgba(13, 23, 48"] { background: #f6f9ff !important; }',
    'html.jour [style*="background: rgba(16, 28, 56"] { background: #e9effb !important; }',
    'html.jour [style*="background: rgba(90, 140, 220, 0.18)"] { background: #e3ebf8 !important; }',
    'html.jour [style*="background: rgba(56, 189, 248, 0.1"] { background: rgba(2, 132, 199, 0.1) !important; }',
    'html.jour [style*="background: rgba(124, 58, 237, 0.12)"] { background: rgba(124, 58, 237, 0.08) !important; }',
    'html.jour [style*="background: rgba(124, 58, 237, 0.2)"] { background: rgba(124, 58, 237, 0.12) !important; }',
    'html.jour [style*="background: linear-gradient(135deg, rgba(37, 99, 235, 0.2)"] { background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(56, 189, 248, 0.04)) !important; }',
    'html.jour [style*="background: linear-gradient(180deg, rgba(30, 27, 60"] { background: linear-gradient(180deg, #f3efff, #ffffff) !important; }',
    /* Bordures */
    'html.jour [style*="rgba(90, 140, 220"] { border-color: #d3ddf0 !important; }',
    'html.jour [style*="rgba(56, 189, 248, 0.35"], html.jour [style*="rgba(56, 189, 248, 0.45"], html.jour [style*="rgba(56, 189, 248, 0.5"] { border-color: rgba(2, 132, 199, 0.5) !important; }',
    'html.jour [style*="rgba(124, 198, 255"] { border-color: rgba(29, 78, 216, 0.4) !important; }',
    'html.jour [style*="rgba(167, 139, 250"] { border-color: rgba(109, 40, 217, 0.45) !important; }',
    'html.jour [style*="rgba(124, 90, 220"] { border-color: rgba(109, 40, 217, 0.35) !important; }',
    'html.jour [style*="rgba(74, 222, 128"] { border-color: rgba(21, 128, 61, 0.45) !important; }',
    'html.jour [style*="rgba(251, 191, 36"] { border-color: rgba(180, 83, 9, 0.45) !important; }',
    'html.jour [style*="rgba(248, 113, 113"] { border-color: rgba(220, 38, 38, 0.4) !important; }',
    'html.jour [style*="rgba(140, 160, 220"] { border-color: #c6d4ec !important; }',
    /* Textes */
    'html.jour [style*="color: rgb(242, 247, 255)"] { color: #0e1b36 !important; }',
    'html.jour [style*="color: rgb(207, 224, 255)"] { color: #22406e !important; }',
    'html.jour [style*="color: rgb(207, 231, 255)"] { color: #1d4ed8 !important; }',
    'html.jour [style*="color: rgb(168, 188, 228)"] { color: #3d5170 !important; }',
    'html.jour [style*="color: rgb(147, 169, 212)"] { color: #46608e !important; }',
    'html.jour [style*="color: rgb(159, 180, 221)"] { color: #35507e !important; }',
    'html.jour [style*="color: rgb(159, 220, 255)"] { color: #0369a1 !important; }',
    'html.jour [style*="color: rgb(191, 229, 255)"] { color: #075985 !important; }',
    'html.jour [style*="color: rgb(213, 200, 255)"] { color: #6d28d9 !important; }',
    'html.jour [style*="color: rgb(196, 181, 253)"] { color: #6d28d9 !important; }',
    'html.jour [style*="color: rgb(230, 220, 255)"] { color: #5b21b6 !important; }',
    'html.jour [style*="color: rgb(134, 239, 172)"] { color: #15803d !important; }',
    'html.jour [style*="color: rgb(252, 211, 77)"] { color: #b45309 !important; }',
    'html.jour [style*="color: rgb(252, 165, 165)"] { color: #b91c1c !important; }',
    'html.jour [style*="color: rgb(248, 113, 113)"] { color: #dc2626 !important; }',
    'html.jour [style*="color: rgb(56, 189, 248)"] { color: #0284c7 !important; }',
    /* Ombres */
    'html.jour [style*="box-shadow: 0 30px 70px"] { box-shadow: 0 24px 60px rgba(30, 64, 175, 0.12) !important; }',
    'html.jour [style*="box-shadow: 0 24px 60px"] { box-shadow: 0 18px 50px rgba(30, 64, 175, 0.18) !important; }',
    /* Bouton */
    '#teamop-theme-btn { position: fixed; bottom: 22px; right: 22px; width: 48px; height: 48px; border-radius: 50%; border: 1px solid rgba(124, 198, 255, 0.4); background: rgba(14, 23, 46, 0.95); color: #eaf6ff; font-size: 20px; cursor: pointer; z-index: 300; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; }',
    'html.jour #teamop-theme-btn { background: #ffffff; border-color: #c9d8f0; box-shadow: 0 10px 30px rgba(30, 64, 175, 0.18); }',
  ].join('\n');

  function init() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var btn = document.createElement('button');
    btn.id = 'teamop-theme-btn';
    btn.setAttribute('aria-label', 'Changer de thème');
    document.body.appendChild(btn);
    function apply(t) {
      document.documentElement.classList.toggle('jour', t === 'jour');
      btn.textContent = t === 'jour' ? '🌙' : '☀️';
      btn.title = t === 'jour' ? 'Passer en thème nuit' : 'Passer en thème jour';
    }
    var cur = 'nuit';
    try { cur = localStorage.getItem(KEY) || 'nuit'; } catch (e) {}
    apply(cur);
    btn.addEventListener('click', function () {
      cur = cur === 'jour' ? 'nuit' : 'jour';
      try { localStorage.setItem(KEY, cur); } catch (e) {}
      apply(cur);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
