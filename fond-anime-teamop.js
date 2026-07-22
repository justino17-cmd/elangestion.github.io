/* Fond animé TEAM OP — grille + écriture "TEAM OP" en points + contour qui respire.
   Intégration : <script src="fond-anime-teamop.js" defer></script> juste avant </body>.
   Le canvas se place tout seul derrière le contenu (z-index négatif). */
(function () {
  var VITESSE = 1;        // 0.3 = lent, 2.5 = rapide
  var INTERACTIF = true;  // réagit à la souris / au toucher
  /* Le mot écrit en fond : par défaut TEAM OP, ou le nom de l'application
     de la page via <script src="fond-anime-teamop.js" data-mot="ELAN GESTION" defer> */
  var MOT = (document.currentScript && document.currentScript.getAttribute('data-mot')) || 'TEAM OP';

  function init() {
    var c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block;';
    document.body.prepend(c);
    var ctx = c.getContext('2d');
    var W, H, dpr;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    window.addEventListener('pointermove', function (e) { mouse.tx = e.clientX; mouse.ty = e.clientY; });
    window.addEventListener('touchmove', function (e) { if (e.touches[0]) { mouse.tx = e.touches[0].clientX; mouse.ty = e.touches[0].clientY; } }, { passive: true });

    var speed = function () { return VITESSE; };
    var interactive = function () { return INTERACTIF; };

    var GS = 90;
    var pulses = [];
    var dotCache = { w: 0, h: 0, letters: [] };

    function sampleText() {
      var sub = 14;
      var off = document.createElement('canvas');
      off.width = W; off.height = H;
      var o = off.getContext('2d');
      o.font = '900 100px Arial, sans-serif';
      var w100 = o.measureText(MOT).width;
      var fontPx = Math.min((Math.min(W * 0.74, 900) / w100) * 100, H * 0.28);
      var font = '900 ' + fontPx + 'px Arial, sans-serif';
      o.font = font; o.textAlign = 'left'; o.textBaseline = 'middle';
      var textX = (W - o.measureText(MOT).width) / 2, textY = H * 0.5;
      var letters = [];
      for (var k = 0; k < MOT.length; k++) {
        if (MOT[k] === ' ') continue;
        o.clearRect(0, 0, W, H);
        o.fillStyle = '#fff';
        var lx = textX + o.measureText(MOT.slice(0, k)).width;
        var cw = o.measureText(MOT[k]).width;
        o.fillText(MOT[k], lx, textY);
        var img = o.getImageData(0, 0, W, H).data;
        var dots = [];
        var minY = Infinity, maxY = -Infinity;
        var cMin = Math.max(0, Math.floor((lx - sub) / sub)), cMax = Math.min(Math.floor(W / sub) - 1, Math.ceil((lx + cw + sub) / sub));
        var rMin = Math.max(0, Math.floor((textY - fontPx * 0.8) / sub)), rMax = Math.min(Math.floor(H / sub) - 1, Math.ceil((textY + fontPx * 0.8) / sub));
        for (var r = rMin; r <= rMax; r++) for (var cc = cMin; cc <= cMax; cc++) {
          var hit = 0, tot = 0;
          for (var sy = 1; sy < sub; sy += 3) for (var sx = 1; sx < sub; sx += 3) {
            tot++;
            if (img[((r * sub + sy) * W + cc * sub + sx) * 4 + 3] > 128) hit++;
          }
          if (hit / tot >= 0.55) {
            var x = cc * sub + sub / 2, y = r * sub + sub / 2;
            dots.push({ x: x, y: y, ph: Math.random() * 6.3 });
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        if (dots.length) letters.push({ dots: dots, minY: minY, maxY: maxY, cx: lx + cw / 2 });
      }
      dotCache = { w: W, h: H, letters: letters, font: font, textX: textX, textY: textY, fontPx: fontPx };
    }

    function drawTextTracer(t, tg) {
      if (dotCache.w !== W || dotCache.h !== H) sampleText();
      var STAG = 900, DUR = 1600, START = 500;
      var letters = dotCache.letters;
      if (!letters.length) return;
      var writeEnd = START + (letters.length - 1) * STAG + DUR;
      var breath = tg > writeEnd ? 0.78 + 0.22 * Math.sin(t * 0.0011) : 1;
      letters.forEach(function (L, i) {
        var local = (tg - START) - i * STAG;
        if (local <= 0) return;
        var prog = Math.min(local / DUR, 1);
        var u = prog * prog * (3 - 2 * prog);
        var top = L.minY - 80, bot = L.maxY + 24;
        var headY = top + u * (bot - top);
        for (var di = 0; di < L.dots.length; di++) {
          var d = L.dots[di];
          if (d.y > headY) continue;
          var a = (0.17 + 0.06 * Math.sin(t * 0.001 + d.ph)) * breath;
          if (prog < 1) {
            var dy = headY - d.y;
            a += Math.exp(-(dy * dy) / 3200) * 0.5;
          }
          if (interactive() && mouse.x > -999) {
            var dm = Math.hypot(d.x - mouse.x, d.y - mouse.y);
            if (dm < 150) a += (1 - dm / 150) * 0.35;
          }
          ctx.fillStyle = 'rgba(120, 195, 255, ' + Math.min(a, 0.85) + ')';
          ctx.beginPath(); ctx.arc(d.x, d.y, 1.7, 0, 7); ctx.fill();
        }
        if (prog < 1) {
          var g = ctx.createLinearGradient(L.cx, headY, L.cx, headY - 110);
          g.addColorStop(0, 'rgba(90, 195, 255, 0.75)'); g.addColorStop(1, 'rgba(90, 195, 255, 0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(L.cx, headY); ctx.lineTo(L.cx, headY - 110); ctx.stroke();
          var hg = ctx.createRadialGradient(L.cx, headY, 0, L.cx, headY, 12);
          hg.addColorStop(0, 'rgba(200, 240, 255, 0.9)'); hg.addColorStop(1, 'rgba(90, 190, 255, 0)');
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.arc(L.cx, headY, 12, 0, 7); ctx.fill();
          ctx.fillStyle = '#dff2ff';
          ctx.beginPath(); ctx.arc(L.cx, headY, 2.4, 0, 7); ctx.fill();
        }
      });
      var cLocal = tg - writeEnd - 300;
      if (cLocal > 0) {
        var reveal = Math.min(cLocal / 2500, 1);
        var pulse = 0.32 + 0.20 * Math.sin(t * 0.0011);
        ctx.save();
        ctx.font = dotCache.font;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
        if (reveal < 1) ctx.setLineDash([reveal * dotCache.fontPx * 6, 100000]);
        ctx.strokeStyle = 'rgba(130, 205, 255, ' + (reveal < 1 ? 0.5 : pulse) + ')';
        ctx.shadowColor = 'rgba(90, 190, 255, 0.8)';
        ctx.shadowBlur = reveal < 1 ? 6 : 4 + 5 * (0.5 + 0.5 * Math.sin(t * 0.0011));
        ctx.strokeText(MOT, dotCache.textX, dotCache.textY);
        ctx.restore();
      }
    }

    function drawGrid(t, dt, tg) {
      var offV = (t * 0.008 * speed()) % GS, offH = (t * 0.005 * speed()) % GS;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(70, 110, 190, 0.08)';
      ctx.beginPath();
      for (var x = -GS + offV + 0.5; x < W; x += GS) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var y = -GS + offH + 0.5; y < H; y += GS) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      drawTextTracer(t, tg);
      if (interactive() && mouse.x > -999) {
        var g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 180);
        g.addColorStop(0, 'rgba(56, 189, 248, 0.10)'); g.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = g; ctx.fillRect(mouse.x - 180, mouse.y - 180, 360, 360);
      }
      if (pulses.length < 5 && Math.random() < 0.008 * dt * 0.06 * speed() + 0.004) {
        var horiz = Math.random() < 0.5;
        var pu0 = { horiz: horiz, line: (Math.floor(Math.random() * ((horiz ? H : W) / GS)) + 0.5) * GS - GS / 2, p: Math.random() < 0.5 ? 0 : 1, dir: 0 };
        pu0.dir = pu0.p === 0 ? 1 : -1;
        pulses.push(pu0);
      }
      for (var i = 0; i < pulses.length; i++) {
        var pu = pulses[i];
        pu.p += pu.dir * dt * 0.00012 * speed();
        var px = pu.horiz ? pu.p * W : pu.line, py = pu.horiz ? pu.line : pu.p * H;
        var tail = 70, txp = pu.horiz ? px - pu.dir * tail : px, typ = pu.horiz ? py : py - pu.dir * tail;
        var lg = ctx.createLinearGradient(px, py, txp, typ);
        lg.addColorStop(0, 'rgba(56, 189, 248, 0.55)'); lg.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(txp, typ); ctx.stroke();
        ctx.fillStyle = 'rgba(150, 220, 255, 0.8)';
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 7); ctx.fill();
      }
      pulses = pulses.filter(function (pu) { return pu.p > -0.05 && pu.p < 1.05; });
    }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var start = performance.now(), last = start;
    function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(now - last, 50); last = now;
      mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08;
      ctx.clearRect(0, 0, W, H);
      if (reduced) drawGrid(start, 0, 1e9);
      else drawGrid(now, dt, now - start);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
