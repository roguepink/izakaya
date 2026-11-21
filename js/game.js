/* =====================================================================
   ミニゲーム「ジョッキ キャッチ」(ノブさん 2026-11-21)
   30秒のあいだ、上から落ちてくる ビール・おでん・おにぎりを お盆で受け止める。焦げた焼き鳥は よける。
   軽くするため 3D は使わず、平らな絵(canvas 2D)だけ。遊んでいる間は お店の 3D を休ませる(app.js)。
   その日(その回)は みんな同じ並びで落ちてくる(seed)ので、運の差が出にくい。

   window.IZGAME = {
     open({ seed, best, onEnd(score, aborted) -> 結果の文(任意), onClose() }),
     abort(),        … 途中で終わらせる(記念撮影が始まったときなど)
     isOpen(),
     maxScore(seed)  … その日の並びで取れる いちばん高い点(点数の確かめ・常連の子の点数に使う)
   }
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 30;
  /* 落ちてくる物。pt: 点数 / w: 出やすさ */
  var KINDS = [
    { e: '🍺', pt: 10, w: 40 },
    { e: '🍢', pt: 5, w: 22 },
    { e: '🍙', pt: 5, w: 16 },
    { e: 'burnt', pt: -15, w: 22 }   // 焦げた焼き鳥(よける)
  ];
  var TRAY_Y = 0.84, TRAY_W = 0.27;

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  /* 落ちてくる物の並び(seed が同じなら いつも同じ) */
  function plan(seed) {
    var r = rng(hash('jokki:' + seed)), L = [], t = 0.7, tot = 0;
    KINDS.forEach(function (k) { tot += k.w; });
    while (t < SEC - 1.4) {
      var p = t / SEC, pick = r() * tot, k = 0;
      for (var i = 0; i < KINDS.length; i++) { pick -= KINDS[i].w; if (pick < 0) { k = i; break; } }
      L.push({ t: t, x: 0.08 + r() * 0.84, k: k, v: 0.34 + p * 0.42 + r() * 0.08 });   // v: 1秒に 画面の高さの何倍 落ちるか(だんだん速く)
      t += 0.66 - p * 0.32 + r() * 0.24;
    }
    return L;
  }
  /* 続けて受け止めると おまけ(+0〜+9) */
  function addPt(K, streak) { return K.pt + Math.min(streak - 1, 9); }
  function maxScore(seed) { var s = 0, st = 0; plan(seed).forEach(function (it) { var K = KINDS[it.k]; if (K.pt > 0) { st++; s += addPt(K, st); } }); return s; }

  var css = document.createElement('style');
  css.textContent = [
    '#izg{position:fixed;inset:0;z-index:100000;background:#1a120c;color:#fbf3e4;display:flex;flex-direction:column;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none}',
    '#izg .izg-top{display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 8px;font-size:18px;gap:10px}',
    '#izg .izg-top b{font-size:24px;font-variant-numeric:tabular-nums}',
    '#izg .izg-combo{color:#f5c04a;font-weight:700;min-width:5em;text-align:center}',
    '#izg canvas{flex:1;width:100%;min-height:0;display:block}',
    '#izg .izg-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88vw,360px);background:#2a1d14;border:2px solid #8a5a2a;border-radius:16px;padding:20px 18px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
    '#izg .izg-panel h2{margin:0 0 8px;font-size:24px;color:#f5c04a}',
    '#izg .izg-panel p{margin:6px 0;font-size:15px;line-height:1.7}',
    '#izg .izg-big{font-size:44px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}',
    '#izg .izg-btns{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}',
    '#izg button{font:inherit;font-size:17px;font-weight:700;border:0;border-radius:99px;padding:12px 22px;cursor:pointer}',
    '#izg .izg-go{background:#d9442e;color:#fff}',
    '#izg .izg-no{background:#4a3a2c;color:#f2e6d4}',
    '#izg .izg-x{position:absolute;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));background:#4a3a2c;color:#f2e6d4;padding:8px 14px;font-size:14px}',
    '#izg .izg-res{color:#f5c04a;font-weight:700}'
  ].join('\n');
  document.head.appendChild(css);

  var root = null, cv = null, g = null, st = null, opts = null, raf = 0, sprites = {};
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function sprite(key, size) {   // 絵文字は 先に小さな絵にしておく(毎回描くより軽い)
    var id = key + size; if (sprites[id]) return sprites[id];
    var c = document.createElement('canvas'); c.width = c.height = Math.ceil(size * 1.3); var x = c.getContext('2d');
    if (key === 'burnt') {   // 焦げた焼き鳥: 黒い玉3つの串 + けむり
      x.strokeStyle = '#c9a77a'; x.lineWidth = size * 0.07; x.beginPath(); x.moveTo(c.width * 0.2, c.height * 0.8); x.lineTo(c.width * 0.82, c.height * 0.18); x.stroke();
      for (var k = 0; k < 3; k++) { x.fillStyle = k % 2 ? '#2a1a12' : '#1a100a'; x.beginPath(); x.arc(c.width * (0.36 + k * 0.15), c.height * (0.64 - k * 0.15), size * 0.17, 0, Math.PI * 2); x.fill(); }
      x.strokeStyle = 'rgba(200,200,200,.7)'; x.lineWidth = size * 0.05;
      for (var s2 = 0; s2 < 2; s2++) { x.beginPath(); x.moveTo(c.width * (0.5 + s2 * 0.18), c.height * 0.3); x.quadraticCurveTo(c.width * (0.42 + s2 * 0.18), c.height * 0.15, c.width * (0.52 + s2 * 0.18), c.height * 0.04); x.stroke(); }
    } else {
      x.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(key, c.width / 2, c.height / 2 + size * 0.06);
    }
    return (sprites[id] = c);
  }

  function resize() {
    if (!cv) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    st && (st.W = w, st.H = h);
  }

  function panel(html, btns) {
    var old = root.querySelector('.izg-panel'); if (old) old.remove();
    if (html == null) return null;
    var p = el('div', 'izg-panel', html), b = el('div', 'izg-btns');
    btns.forEach(function (x) { var bt = el('button', x[2] || 'izg-go', x[0]); bt.onclick = x[1]; b.appendChild(bt); });
    p.appendChild(b); root.appendChild(p); return p;
  }

  function startScreen() {
    st.phase = 'ready';
    panel('<h2>🍺 ジョッキ キャッチ</h2><p>落ちてくる <b>ビール・おでん・おにぎり</b> を、お盆で受け止めてね。<br>黒い <b>焦げた焼き鳥</b> は よける!</p><p>指で左右に動かします。時間は30秒。<br>続けて受け止めると 点数がふえます。</p>' +
      (opts.best ? '<p>今日の自分の最高: <b>' + opts.best + '点</b></p>' : ''),
      [['スタート', begin], ['やめる', close, 'izg-no']]);
  }
  function begin() {
    panel(null);
    var items = plan(opts.seed).map(function (it) { return { t: it.t, x: it.x, k: it.k, v: it.v, y: -0.1, live: false, done: false }; });
    st.items = items; st.t = 0; st.score = 0; st.streak = 0; st.fx = []; st.flash = 0; st.phase = 'play'; st.last = performance.now();
    if (opts.onStart) opts.onStart();
    loop();
  }
  function finish(aborted) {
    if (!st || st.phase !== 'play') { if (aborted) close(); return; }
    st.phase = 'end'; cancelAnimationFrame(raf); draw();
    var score = Math.max(0, st.score), msg = '';
    try { msg = opts.onEnd ? opts.onEnd(score, !!aborted) || '' : ''; } catch (e) {}
    if (aborted) { close(); return; }
    panel('<h2>おしまい!</h2><div class="izg-big">' + score + '<small style="font-size:20px">点</small></div>' + (msg ? '<p class="izg-res">' + msg + '</p>' : ''),
      [['もう一回', function () { opts.best = Math.max(opts.best || 0, score); begin(); }], ['お店にもどる', close, 'izg-no']]);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    var now = performance.now(), dt = Math.min(0.25, (now - st.last) / 1000); st.last = now;   // 遅いスマホでも 30秒は30秒
    if (document.hidden) return;
    st.t += dt;
    var tray = st.trayX, half = TRAY_W / 2, size = st.size;
    st.items.forEach(function (it) {
      if (it.done) return;
      if (!it.live) { if (st.t >= it.t) it.live = true; else return; }
      var py = it.y; it.y += it.v * dt;
      var r = size * 0.42 / st.W;
      if (py < TRAY_Y && it.y >= TRAY_Y - 0.01 && Math.abs(it.x - tray) < half + r) {   // お盆に当たった
        it.done = true; var K = KINDS[it.k];
        if (K.pt > 0) { st.streak++; var add = addPt(K, st.streak); st.score += add; st.fx.push({ x: it.x, y: TRAY_Y - 0.04, s: '+' + add, c: '#ffe08a', a: 1 }); }
        else { st.streak = 0; st.score = Math.max(0, st.score + K.pt); st.flash = 1; st.fx.push({ x: it.x, y: TRAY_Y - 0.04, s: String(K.pt), c: '#ff7a6a', a: 1 }); }
      } else if (it.y > 1.05) { it.done = true; if (KINDS[it.k].pt > 0) st.streak = 0; }   // 落とした(焦げは落としてよい)
    });
    st.fx.forEach(function (f) { f.y -= dt * 0.12; f.a -= dt * 1.4; }); st.fx = st.fx.filter(function (f) { return f.a > 0; });
    st.flash = Math.max(0, st.flash - dt * 3);
    root.querySelector('#izgScore').textContent = st.score;
    root.querySelector('#izgTime').textContent = Math.max(0, Math.ceil(SEC - st.t));
    root.querySelector('.izg-combo').textContent = st.streak >= 3 ? '🔥 ' + st.streak + 'れんぞく' : '';
    draw();
    if (st.t >= SEC) finish(false);
  }

  function draw() {
    var W = st.W, H = st.H, size = st.size = Math.max(34, Math.min(W, H) * 0.11);
    g.fillStyle = '#2a1c12'; g.fillRect(0, 0, W, H);
    // のれんの帯とカウンター(雰囲気だけ。軽く)
    g.fillStyle = '#3a2618'; g.fillRect(0, 0, W, H * 0.06);
    g.fillStyle = '#7a4a24'; g.fillRect(0, H * (TRAY_Y + 0.06), W, H);
    g.fillStyle = '#5a3418'; g.fillRect(0, H * (TRAY_Y + 0.06), W, 6);
    if (st.items) st.items.forEach(function (it) {
      if (!it.live || it.done) return;
      var sp = sprite(KINDS[it.k].e, size); g.drawImage(sp, it.x * W - sp.width / 2, it.y * H - sp.height / 2);
    });
    // お盆
    var tx = st.trayX * W, tw = TRAY_W * W, ty = TRAY_Y * H;
    g.fillStyle = '#b8743a'; g.beginPath(); g.ellipse(tx, ty + 8, tw / 2, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d99a58'; g.beginPath(); g.ellipse(tx, ty + 2, tw / 2 - 4, 9, 0, 0, Math.PI * 2); g.fill();
    st.fx && st.fx.forEach(function (f) { g.globalAlpha = Math.max(0, f.a); g.fillStyle = f.c; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText(f.s, f.x * W, f.y * H); g.globalAlpha = 1; });
    if (st.flash > 0) { g.fillStyle = 'rgba(220,60,40,' + (st.flash * 0.25) + ')'; g.fillRect(0, 0, W, H); }
  }

  function moveTo(clientX) { var r = cv.getBoundingClientRect(); st.trayX = Math.max(TRAY_W / 2, Math.min(1 - TRAY_W / 2, (clientX - r.left) / r.width)); }

  function open(o) {
    if (root) return;
    opts = o || {}; st = { trayX: 0.5, phase: 'ready', W: 1, H: 1, size: 40 };
    root = el('div', null, '<div class="izg-top"><span>🍺 <b id="izgScore">0</b>点</span><span class="izg-combo"></span><span>残り <b id="izgTime">30</b>秒</span></div><canvas></canvas>');
    root.id = 'izg';
    var x = el('button', 'izg-x', '✕ やめる'); x.onclick = function () { if (st.phase === 'play') finish(true); else close(); }; root.appendChild(x);
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    resize(); window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', function (e) { moveTo(e.clientX); });
    cv.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') moveTo(e.clientX); });
    window.addEventListener('keydown', onKey);
    draw(); startScreen();
  }
  function onKey(e) { if (!st || st.phase !== 'play') return; if (e.key === 'ArrowLeft') st.trayX = Math.max(TRAY_W / 2, st.trayX - 0.06); if (e.key === 'ArrowRight') st.trayX = Math.min(1 - TRAY_W / 2, st.trayX + 0.06); }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey);
    root.remove(); root = cv = g = null; var o = opts; st = null; opts = null;
    if (o && o.onClose) o.onClose();
  }
  window.IZGAME = {
    open: open,
    abort: function () { if (!root) return; if (st && st.phase === 'play') finish(true); else close(); },
    isOpen: function () { return !!root; },
    maxScore: maxScore,
    SEC: SEC
  };
})();
