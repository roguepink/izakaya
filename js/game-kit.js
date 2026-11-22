/* =====================================================================
   ミニゲームの「わく」(ノブさん 2026-11-22「簡単なゲームを何個も作って、今日のゲームはこれ、と出したい」)

   ・ゲームの一覧は config.js の SHOP.GAMES。1本 = games/<id>.js の1ファイル。
   ・ゲームのファイルは「遊ぶときだけ」読みこむ。何本ふやしても、お店の重さは変わらない。
   ・スタート画面・点数・残り時間・おしまい画面・もう一回・やめる・ゆれ・光る・点数の文字 は ここで共通。
     ゲームのファイルには「遊ぶところ」だけを書く(作り方は games/_template.js)。
   ・今日のゲーム: 大将が決めたもの(state.todayGame)。決めていなければ 日がわり(日付で自動。みんな同じ)。

   window.IZGAME = {
     list(),                    … 出せるゲームの一覧(SHOP.GAMES の off でないもの)
     today(override),           … 今日のゲーム(一覧の1つ)。override = 大将が決めた id
     def(id),                   … 一覧の1つ
     load(id) -> Promise,       … ゲームのファイルを読みこむ(1回だけ)
     open({ game, seed, best, onStart(), onEnd(score, aborted) -> 結果の文, onClose() }),
     abort(), isOpen(),
     maxScore(id, seed),        … その並びで取れる いちばん高い点(読みこみ前は null)
     sec(id),                   … 1回の秒数
     register(game)             … ゲームのファイルが 自分を登録する(game.ready に Promise を入れると、絵の読みこみを待ってから始める)
   }
   ===================================================================== */
(function () {
  'use strict';
  var GAMES = {}, loading = {};
  function cfg() { return ((window.SHOP && SHOP.GAMES) || []).filter(function (x) { return x && x.id && !x.off; }); }
  function def(id, any) { var L = any ? ((window.SHOP && SHOP.GAMES) || []) : cfg(); for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i]; return null; }   // any: off のものも(ためしのページ用)
  function dayIndex(d) {   // 日がわりの番号(朝5時で日がかわる。お店は夜なので 夜中の0時で変わらないように)
    d = d || new Date(); var t = new Date(d.getTime() - 5 * 3600 * 1000);
    return Math.floor(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86400000);
  }
  function today(override) {
    var L = cfg(); if (!L.length) return null;
    if (override && def(override)) return def(override);
    return L[dayIndex() % L.length];
  }
  function load(id) {
    if (GAMES[id]) return Promise.resolve(GAMES[id]);
    if (loading[id]) return loading[id];
    var d = def(id, true) || { file: 'games/' + id + '.js' };
    loading[id] = new Promise(function (ok, ng) {
      var s = document.createElement('script'); s.src = d.file || ('games/' + id + '.js'); s.async = true;
      if (window.IZGAME_BASE) s.src = IZGAME_BASE + s.getAttribute('src');   // tools/ から開くとき
      s.onload = function () { if (GAMES[id]) Promise.resolve(GAMES[id].ready).then(function () { ok(GAMES[id]); }, function () { ok(GAMES[id]); }); else { delete loading[id]; ng(new Error('登録されていない: ' + id)); } };   // ready: 絵などの読みこみを 待つ(ゲームが Promise を渡したとき)
      s.onerror = function () { delete loading[id]; s.remove(); ng(new Error('読めない: ' + id)); };
      document.head.appendChild(s);
    });
    return loading[id];
  }

  /* ---------- 見た目(全部のゲームで共通) ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#izg{position:fixed;inset:0;z-index:100000;background:#1a120c;color:#fbf3e4;display:flex;flex-direction:column;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none}',
    '#izg .izg-top{display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 8px;font-size:18px;gap:10px}',
    '#izg .izg-top b{font-size:24px;font-variant-numeric:tabular-nums}',
    '#izg .izg-top>span{white-space:nowrap}#izg .izg-top .izg-u{font-size:14px}#izg .izg-top .izg-combo{flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis}',   /* 上の帯は 1行(小さいスマホで「ヤード」が 折れていた 11-22) */
    '#izg .izg-combo{color:#f5c04a;font-weight:700;min-width:5em;text-align:center}',
    '#izg canvas{flex:1;width:100%;min-height:0;display:block}',
    '#izg .izg-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90vw,370px);max-height:calc(100% - 24px);overflow:auto;background:#2a1d14;border:2px solid #8a5a2a;border-radius:16px;padding:18px 16px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
    '#izg .izg-panel h2{margin:0 0 8px;font-size:24px;color:#f5c04a}',
    '#izg .izg-panel p{margin:6px 0;font-size:15px;line-height:1.7}',
    '#izg .izg-today{display:inline-block;background:#d9442e;color:#fff;font-size:12px;font-weight:700;border-radius:99px;padding:2px 10px;margin-bottom:6px}',
    '#izg .izg-leg{margin:8px 0 4px;text-align:left}',
    '#izg .izg-leg div{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:5px 8px;border-radius:10px;margin:5px 0;font-size:15px;line-height:1.4}',
    '#izg .izg-leg span{flex:1 1 9em;min-width:0}',   /* 絵が多いときは 説明を 下の行へ(小さいスマホで 文字が 縦に細長く くずれていた 11-22) */
    '#izg .izg-leg img{width:40px;height:40px;flex:none}',
    '@media (max-width:360px){#izg .izg-leg img{width:34px;height:34px}}',
    '#izg .izg-leg .g{background:rgba(255,240,210,.08)}',
    '#izg .izg-leg .b{background:rgba(255,60,40,.14)}',
    '#izg .izg-leg .o{background:rgba(255,210,60,.14)}',
    '#izg .izg-leg b{font-size:17px}',
    '#izg .izg-big{font-size:44px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}',
    '#izg .izg-btns{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;position:sticky;bottom:-18px;background:#2a1d14;padding:8px 0 10px;margin-bottom:-10px}',   /* 説明が長くても「スタート」は いつも見える(小さいスマホで 下に かくれていた 11-22) */
    '#izg button{font:inherit;font-size:17px;font-weight:700;border:0;border-radius:99px;padding:12px 22px;cursor:pointer}',
    '#izg .izg-go{background:#d9442e;color:#fff}',
    '#izg .izg-no{background:#4a3a2c;color:#f2e6d4}',
    '#izg .izg-x{position:absolute;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));background:#4a3a2c;color:#f2e6d4;padding:8px 14px;font-size:14px}',
    '#izg .izg-res{color:#f5c04a;font-weight:700}',
    '#izg .izg-wait{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);font-size:18px;opacity:.8}'
  ].join('\n');
  document.head.appendChild(css);

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = (typeof seed === 'number' ? seed : hash(seed)) >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  var root = null, cv = null, g = null, opts = null, G = null, raf = 0, kit = null, D = null;

  /* ゲームに渡す道具箱。ゲームのファイルは これだけ使えば 作れる */
  function makeKit() {
    var cache = {};
    var k = {
      W: 1, H: 1, t: 0, score: 0, phase: 'ready', seed: '', g: null,
      rng: rng, hash: hash, EMOJI_FONT: EMOJI_FONT,
      add: function (n) { k.score += n; },   // 点数を足す(マイナスもOK)。途中は 0より下にもなる(0点のときに −10 を取っても 減らないのは 不公平だった 11-22)。おしまいの点は 0より下にはしない
      combo: function (s) { var c = root && root.querySelector('.izg-combo'); if (c) c.textContent = s || ''; },   // 上のまん中の文字(「🔥 5れんぞく」など)
      fx: function (x, y, s, color, big) { k._fx.push({ x: x, y: y, s: s, c: color || '#ffe08a', a: big ? 1.6 : 1.1, big: big || 0 }); },   // 点数の文字が ふわっと出る(x,y は 0〜1)
      flash: function (color, power) { k._flash = { c: color || '220,40,30', a: power || 1 }; },   // 画面が光る(色は 'r,g,b')
      shake: function (power) { k._shake = Math.max(k._shake, power || 1); },   // 画面がゆれる
      emoji: function (x, e, cx, cy, size) { x.font = Math.round(size) + 'px ' + EMOJI_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, cx, cy + size * 0.06); },
      sprite: function (id, w, h, drawFn) {   // 絵を先に1回だけ描いて 使い回す(軽くするため)
        var key = id + ':' + w + 'x' + h; if (cache[key]) return cache[key];
        var c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); drawFn(c.getContext('2d'), c.width, c.height); return (cache[key] = c);
      },
      icon: function (canvas) { try { return '<img alt="" src="' + canvas.toDataURL() + '">'; } catch (e) { return ''; } },
      end: function () { finish(false); },   // 時間の前に おしまいにしたいとき
      _fx: [], _flash: null, _shake: 0
    };
    return k;
  }

  function resize() {
    if (!cv) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (kit) { kit.W = w; kit.H = h; if (G && G.resize) G.resize(kit); if (kit.phase !== 'play') { try { draw(); } catch (e) {} } }   // 向きを変えたとき、スタート画面・おしまい画面の うしろも 描き直す
  }
  function panel(html, btns) {
    var old = root.querySelector('.izg-panel'); if (old) old.remove();
    if (html == null) return null;
    var p = el('div', 'izg-panel', html), b = el('div', 'izg-btns');
    btns.forEach(function (x) { var bt = el('button', x[2] || 'izg-go', x[0]); bt.onclick = x[1]; b.appendChild(bt); });
    p.appendChild(b); root.appendChild(p); return p;
  }
  function secOf() { return (G && G.sec) || (D && D.sec) || 30; }
  function startScreen() {
    kit.phase = 'ready';
    var intro = ''; try { intro = G.intro ? G.intro(kit) : ''; } catch (e) {}
    panel((opts.today ? '<div class="izg-today">🎮 今日のゲーム</div>' : '') +
      '<h2>' + (G.title || D.name) + (G.ver ? ' <small style="font-size:13px;opacity:.7">' + G.ver + '</small>' : '') + '</h2>' + intro +
      (opts.best ? '<p>今日の自分の最高: <b>' + opts.best + (D.unit || '点') + '</b></p>' : ''),
      [['スタート', begin], ['やめる', close, 'izg-no']]);
  }
  function begin() {
    panel(null);
    kit.t = 0; kit.score = 0; kit._fx = []; kit._flash = null; kit._shake = 0; kit.phase = 'play'; kit.seed = opts.seed;
    kit.combo('');
    G.start(kit, opts.seed);
    if (opts.onStart) opts.onStart();
    kit._last = performance.now(); loop();
  }
  function finish(aborted) {
    if (!kit || kit.phase !== 'play') { if (aborted) close(); return; }
    kit.phase = 'end'; cancelAnimationFrame(raf); draw();
    var score = Math.max(0, Math.round(kit.score)), mx = maxScore(D.id, opts.seed); if (mx != null) score = Math.min(score, mx);
    var msg = ''; try { msg = opts.onEnd ? opts.onEnd(score, !!aborted) || '' : ''; } catch (e) {}
    if (aborted) { close(); return; }
    var extra = ''; try { extra = G.result ? G.result(kit) || '' : ''; } catch (e) {}
    var neg = Math.round(kit.score) < 0 ? '<p style="opacity:.8;font-size:14px">(マイナスは 0' + (D.unit || '点') + 'になります)</p>' : '';   // 上の帯は −949点、おしまいは 0点 で 食いちがって見えた(11-23)
    panel('<h2>おしまい!</h2><div class="izg-big">' + score + '<small style="font-size:20px">' + (D.unit || '点') + '</small></div>' + neg +
      (extra ? '<p>' + extra + '</p>' : '') + (msg ? '<p class="izg-res">' + msg + '</p>' : ''),
      [['もう一回', function () { opts.best = Math.max(opts.best || 0, score); begin(); }], ['お店にもどる', close, 'izg-no']]);
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    var now = performance.now(), dt = Math.min(0.25, (now - kit._last) / 1000); kit._last = now;   // 遅いスマホでも 30秒は30秒
    if (document.hidden) return;
    kit.t += dt;
    G.update(kit, dt);
    kit._fx.forEach(function (f) { f.y -= dt * 0.12; f.a -= dt * 1.4; }); kit._fx = kit._fx.filter(function (f) { return f.a > 0; });
    if (kit._flash) { kit._flash.a -= dt * (kit._flash.a > 1 ? 2 : 3); if (kit._flash.a <= 0) kit._flash = null; }
    kit._shake = Math.max(0, kit._shake - dt * (kit._shake > 1 ? 2.5 : 5));
    root.querySelector('#izgScore').textContent = Math.round(kit.score);
    root.querySelector('#izgTime').textContent = Math.max(0, Math.ceil(secOf() - kit.t));
    draw();
    if (kit.phase === 'play' && kit.t >= secOf()) finish(false);
  }
  function draw() {
    var W = kit.W, H = kit.H, sx = kit._shake ? Math.sin(kit.t * 90) * 6 * kit._shake : 0, sy = kit._shake > 1 ? Math.cos(kit.t * 70) * 5 * (kit._shake - 1) : 0;
    g.save(); g.translate(sx, sy);
    G.draw(kit, g, W, H);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    kit._fx.forEach(function (f) {
      g.globalAlpha = Math.max(0, Math.min(1, f.a)); g.font = 'bold ' + (f.big === 2 ? 42 : f.big ? 30 : 22) + 'px sans-serif';
      var hw = g.measureText(f.s).width / 2 + 8, x = Math.max(hw, Math.min(W - hw, f.x * W));   // 文字の はばを測って 内側に(右はしで 切れていた 11-23)
      if (f.big) { g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(f.s, x, f.y * H); }
      g.fillStyle = f.c; g.fillText(f.s, x, f.y * H); g.globalAlpha = 1;
    });
    g.restore();
    if (kit._flash) { g.fillStyle = 'rgba(' + kit._flash.c + ',' + (Math.min(1, kit._flash.a) * 0.3 + Math.max(0, kit._flash.a - 1) * 0.2) + ')'; g.fillRect(0, 0, W, H); }
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }

  function open(o) {
    if (root) return;
    opts = o || {};
    D = def(opts.game, opts.any) || today(opts.game) || null;
    if (!D) return;
    root = el('div', null, '<div class="izg-top"><span>' + (D.icon || '🎮') + ' <b id="izgScore">0</b><span class="izg-u">' + (D.unit || '点') + '</span></span><span class="izg-combo"></span><span' + (D.noTimer ? ' style="visibility:hidden"' : '') + '>残り <b id="izgTime">' + (D.sec || 30) + '</b>秒</span></div><canvas></canvas><div class="izg-wait">じゅんび中…</div>');
    root.id = 'izg';
    var x = el('button', 'izg-x', '✕ やめる'); x.onclick = function () { if (kit && kit.phase === 'play') finish(true); else close(); }; root.appendChild(x);
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    var mine = root;
    load(D.id).then(function (game) {
      if (root !== mine) return;   // 読みこみ中に やめた
      G = game; kit = makeKit(); kit.g = g;
      var w = root.querySelector('.izg-wait'); if (w) w.remove();
      resize(); window.addEventListener('resize', resize);
      cv.addEventListener('pointerdown', function (e) { try { cv.setPointerCapture(e.pointerId); } catch (e2) {} if (G.pointer) G.pointer(kit, pos(e), 'down', e); });   // 指が 画面の外に出ても はなした所まで 受け取る
      cv.addEventListener('pointermove', function (e) { if (G.pointer && (e.buttons || e.pointerType === 'touch')) G.pointer(kit, pos(e), 'move', e); });
      cv.addEventListener('pointerup', function (e) { if (G.pointer) G.pointer(kit, pos(e), 'up', e); });
      cv.addEventListener('pointercancel', function (e) { if (G.pointer) G.pointer(kit, pos(e), 'cancel', e); });   // スマホの 通知・ホームのスワイプで 指が とりけされたとき(11-22 ボウリングが「はなすと投げる」のまま止まっていた)
      window.addEventListener('keydown', onKey);
      if (G.init) G.init(kit);
      draw(); startScreen();
    }).catch(function () {
      if (root !== mine) return;
      var w = root.querySelector('.izg-wait'); if (w) w.textContent = 'ゲームを読みこめませんでした。電波を たしかめて、もう一度 おためしください';
    });
  }
  function onKey(e) { if (kit && kit.phase === 'play' && G && G.key) G.key(kit, e.key); }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey);
    if (G && G.stop) { try { G.stop(kit); } catch (e) {} }
    root.remove(); root = cv = g = null; kit = null; G = null; var o = opts; opts = null; D = null;
    if (o && o.onClose) o.onClose();
  }
  function maxScore(id, seed) { var gm = GAMES[id]; if (!gm || !gm.maxScore) return gm ? 99999 : null; try { return gm.maxScore(seed); } catch (e) { return null; } }

  window.IZGAME = {
    list: cfg, today: today, def: def, load: load, open: open,
    abort: function () { if (!root) return; if (kit && kit.phase === 'play') finish(true); else close(); },
    isOpen: function () { return !!root; },
    maxScore: maxScore,
    sec: function (id) { var d = def(id); return (GAMES[id] && GAMES[id].sec) || (d && d.sec) || 30; },
    register: function (game) { if (game && game.id) GAMES[game.id] = game; },
    _games: GAMES, _dayIndex: dayIndex, _rngOf: rng
  };
})();
