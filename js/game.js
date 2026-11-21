/* =====================================================================
   ミニゲーム「ジョッキ キャッチ」(ノブさん 2026-11-21 / 11-21 夜 作り直し)
   30秒のあいだ、上から いろいろな物が落ちてくる。お盆で受け止める。
     ・白いお皿にのった物 … プラス(+5〜10)。たくさんの種類
     ・赤い丸の 黒く焦げた物 … マイナス(−20)。後半ほど たくさん落ちてくる。よけるのが本番
     ・金色の星 … 大当たり(+50)。1回に4つだけ。少し速い
     ・でっかい焦げ … −100。1回に3つ。出る前に 上に赤い「!」
   11-21 夜 2回目: まっすぐ・右ななめ上・左ななめ上から。1つずつ速さがちがう。はじめ少なめ → だんだん どしゃぶり。
   焦げを取らずに 続けて受け止めると、おまけ(+1〜+9)がつく。焦げを取ると おまけは0から。
   ノブさん「マイナスとプラスを ちゃんと見分けられるように」→ 色だけでなく 形でも分ける(丸い皿 / 赤い輪と「−」の札とけむり / 星)。
   軽くするため 3D は使わず、平らな絵(canvas 2D)だけ。絵は先に1回だけ描いて使い回す。
   遊んでいる間は お店の 3D を休ませる(app.js)。
   その日(その回)は みんな同じ並びで落ちてくる(seed)ので、運の差が出にくい。

   window.IZGAME = {
     open({ seed, best, onStart(), onEnd(score, aborted) -> 結果の文(任意), onClose() }),
     abort(),        … 途中で終わらせる(記念撮影が始まったときなど)
     isOpen(),
     maxScore(seed)  … その日の並びで取れる いちばん高い点(点数の確かめ・常連の子の点数に使う)
   }
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 30;
  /* 落ちてくる物。type: good(プラス)/ bad(焦げ・マイナス)/ gold(大当たり)。w: 出やすさ(同じ type の中で) */
  var KINDS = [
    { id: 'beer', e: '🍺', type: 'good', pt: 10, w: 16 },
    { id: 'sake', e: '🍶', type: 'good', pt: 10, w: 9 },
    { id: 'oden', e: '🍢', type: 'good', pt: 5, w: 10 },
    { id: 'onigiri', e: '🍙', type: 'good', pt: 5, w: 10 },
    { id: 'sushi', e: '🍣', type: 'good', pt: 8, w: 9 },
    { id: 'ebi', e: '🍤', type: 'good', pt: 8, w: 9 },
    { id: 'gyoza', e: '🥟', type: 'good', pt: 5, w: 9 },
    { id: 'karaage', e: '🍗', type: 'good', pt: 6, w: 9 },
    { id: 'dango', e: '🍡', type: 'good', pt: 5, w: 8 },
    { id: 'b_kushi', e: 'kushi', type: 'bad', pt: -20, w: 10, name: '焦げた焼き鳥' },
    { id: 'b_fish', e: '🐟', type: 'bad', pt: -20, w: 8, name: '焦げた魚' },
    { id: 'b_meat', e: '🥩', type: 'bad', pt: -20, w: 8, name: '焦げた肉' },
    { id: 'b_ika', e: '🦑', type: 'bad', pt: -20, w: 7, name: '焦げたイカ' },
    { id: 'b_huge', e: '🍖', type: 'bad', pt: -100, w: 0, big: 1, name: '巨大な焦げ肉' },   // たまにだけ出る でっかい焦げ(−100)
    { id: 'g_beer', e: '🍺', type: 'gold', pt: 50, w: 1, name: '金のジョッキ' },
    { id: 'g_ebi', e: '🦞', type: 'gold', pt: 50, w: 1, name: '金の伊勢えび' }
  ];
  var BY = { good: [], bad: [], gold: [] }, HUGE_I = KINDS.findIndex(function (k) { return k.big; });
  KINDS.forEach(function (k, i) { if (k.w) BY[k.type].push(i); });
  var TRAY_Y = 0.84, TRAY_W = 0.27, GOLD_N = 4, BIG = 2.6;   // BIG: 巨大な焦げの大きさ(ふつうの何倍)

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function pickIn(r, list) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += KINDS[list[i]].w; var p = r() * tot; for (i = 0; i < list.length; i++) { p -= KINDS[list[i]].w; if (p < 0) return list[i]; } return list[0]; }
  /* 落ちてくる物の並び(seed が同じなら いつも同じ)
     ノブさん 11-21 夜「簡単すぎる。右ななめ上・左ななめ上からも、まっすぐも。1つずつ速さを変えて。たくさん。異常な感じ」
     「はじめは少なめで、だんだん すごく いっぱい出てくる。たまに ものすごく でっかい 当たっちゃいけないやつ(すごいマイナス)」
     x … お盆の高さに来たときの横の位置。sx … 出てくるときの横の位置(画面の外のこともある=ななめに飛んでくる) */
  var HUGE = HUGE_I;
  function plan(seed) {
    var r = rng(hash('jokki3:' + seed)), L = [], t = 0.7;
    function one(t, p, k, dir, vmul) {
      var x = 0.08 + r() * 0.84;
      var v = (0.3 + p * 0.3) * (0.6 + r() * 0.95) * (vmul || 1);   // 1つずつ速さがちがう(遅いのも 速いのも)
      if (dir == null) { var q = r(), side = 0.25 + p * 0.3; dir = q < side ? -1 : q < side * 2 ? 1 : 0; }   // 後半ほど ななめが多い
      var sx = x;
      if (dir) sx = Math.max(-0.3, Math.min(1.3, x - dir * (0.4 + r() * 0.6)));   // dir=1: 右上から左下へ / -1: 左上から右下へ
      L.push({ t: t, x: x, sx: sx, k: k, v: v });
    }
    while (t < SEC - 1.2) {
      var p = t / SEC, badShare = 0.26 + p * 0.2;   // 焦げの割合: はじめ3割 → 終わり5割弱
      one(t, p, pickIn(r, r() < badShare ? BY.bad : BY.good));
      t += 0.62 - p * 0.44 + r() * 0.1;   // はじめは ゆったり(0.6秒に1つ) → 終わりは どしゃぶり(0.2秒に1つ)
    }
    // どしゃぶり: 中ごろと後半に、同じ向きから 一気に 6〜9こ
    [11 + r() * 3, 19 + r() * 3, 25 + r() * 2].forEach(function (bt, i) {
      var dir = r() < 0.5 ? -1 : 1, n = 6 + i + Math.floor(r() * 2);
      for (var j = 0; j < n; j++) one(bt + j * 0.09, bt / SEC, pickIn(r, r() < 0.45 ? BY.bad : BY.good), dir, 1.1);
    });
    // 巨大な焦げ(−100): 3回。ゆっくり大きく落ちてくる。よけられるように 少し遅め
    [8 + r() * 3, 16 + r() * 3, 23 + r() * 3].forEach(function (ht) { one(ht, ht / SEC, HUGE, null, 0.75); });
    for (var g = 0; g < GOLD_N; g++) {   // 大当たりは 4つ。少し速い
      var gt = 4.5 + g * 7 + r() * 2.5;
      one(gt, gt / SEC, pickIn(r, BY.gold), null, 1.3);
    }
    L.sort(function (a, b) { return a.t - b.t; });
    return L;
  }
  /* 続けて受け止めると おまけ(+0〜+9)。焦げを取ると 0 から */
  function addPt(K, streak) { return K.pt + Math.min(streak - 1, 9); }
  function maxScore(seed) { var s = 0, st = 0; plan(seed).forEach(function (it) { var K = KINDS[it.k]; if (K.pt > 0) { st++; s += addPt(K, st); } }); return s; }

  var css = document.createElement('style');
  css.textContent = [
    '#izg{position:fixed;inset:0;z-index:100000;background:#1a120c;color:#fbf3e4;display:flex;flex-direction:column;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none}',
    '#izg .izg-top{display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 8px;font-size:18px;gap:10px}',
    '#izg .izg-top b{font-size:24px;font-variant-numeric:tabular-nums}',
    '#izg .izg-combo{color:#f5c04a;font-weight:700;min-width:5em;text-align:center}',
    '#izg canvas{flex:1;width:100%;min-height:0;display:block}',
    '#izg .izg-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90vw,370px);max-height:calc(100% - 24px);overflow:auto;background:#2a1d14;border:2px solid #8a5a2a;border-radius:16px;padding:18px 16px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
    '#izg .izg-panel h2{margin:0 0 8px;font-size:24px;color:#f5c04a}',
    '#izg .izg-panel p{margin:6px 0;font-size:15px;line-height:1.7}',
    '#izg .izg-leg{margin:8px 0 4px;text-align:left}',
    '#izg .izg-leg div{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:10px;margin:5px 0;font-size:15px;line-height:1.4}',
    '#izg .izg-leg img{width:40px;height:40px;flex:none}',
    '#izg .izg-leg .g{background:rgba(255,240,210,.08)}',
    '#izg .izg-leg .b{background:rgba(255,60,40,.14)}',
    '#izg .izg-leg .o{background:rgba(255,210,60,.14)}',
    '#izg .izg-leg b{font-size:17px}',
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
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function circle(x, cx, cy, r) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); }
  function food(x, e, cx, cy, fs) {   // 食べ物を1つ描く(焼き鳥だけは 絵文字が無いので 手描き)
    if (e === 'kushi') {
      x.strokeStyle = '#d8b88a'; x.lineWidth = fs * 0.07; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - fs * 0.38, cy + fs * 0.38); x.lineTo(cx + fs * 0.4, cy - fs * 0.4); x.stroke();
      for (var k = 0; k < 3; k++) { x.fillStyle = k % 2 ? '#9a5a2a' : '#8a4a20'; circle(x, cx + fs * (-0.2 + k * 0.19), cy + fs * (0.2 - k * 0.19), fs * 0.17); x.fill(); }
      return;
    }
    x.font = Math.round(fs) + 'px ' + EMOJI_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, cx, cy + fs * 0.06);
  }
  /* 絵は 先に1回だけ描いておく(毎回描くより ずっと軽い)。part: 'rays' は 大当たりの後ろの 回る光 */
  function sprite(ki, size, part) {
    var K = KINDS[ki], id = K.id + (part || '') + size; if (sprites[id]) return sprites[id];
    var S = Math.ceil(size * (part === 'rays' ? 1.9 : 1.55)), c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), cx = S / 2, cy = S / 2, R = size * 0.56;
    if (part === 'rays') {   // 金色の星(とがった光)
      var n = 12, ro = S * 0.49, ri = R * 1.02;
      x.beginPath();
      for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n, rr = i % 2 ? ri : ro; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      x.closePath(); x.fillStyle = '#ffd23f'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#a8740a'; x.stroke();
    } else if (K.type === 'good') {   // 白いお皿(プラス)
      circle(x, cx, cy, R); x.fillStyle = '#f8ecd4'; x.fill(); x.lineWidth = size * 0.05; x.strokeStyle = '#c9964f'; x.stroke();
      circle(x, cx, cy, R * 0.78); x.lineWidth = 1.5; x.strokeStyle = 'rgba(201,150,79,.45)'; x.stroke();
      food(x, K.e, cx, cy, size * 0.74);
    } else if (K.type === 'gold') {   // 金色の丸(大当たり)
      var gr = x.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      gr.addColorStop(0, '#fff6c0'); gr.addColorStop(1, '#f0b000');
      circle(x, cx, cy, R); x.fillStyle = gr; x.fill(); x.lineWidth = size * 0.06; x.strokeStyle = '#a8740a'; x.stroke();
      food(x, K.e, cx, cy, size * 0.74);
    } else {   // 焦げ(マイナス): けむり + 黒っぽい丸 + 太い赤い輪 + 黒く焦げた食べ物 + 赤い「−」の札
      x.fillStyle = 'rgba(190,190,190,.55)';   // けむり(もくもく)
      [[-0.35, -0.94, 0.2], [0.05, -1.0, 0.25], [0.42, -0.92, 0.18], [0.2, -1.18, 0.15]].forEach(function (d) { circle(x, cx + d[0] * R, cy + d[1] * R, d[2] * R); x.fill(); });
      circle(x, cx, cy, R); x.fillStyle = '#5a2a1a'; x.fill();
      var t = document.createElement('canvas'); t.width = t.height = S; var tx = t.getContext('2d');
      food(tx, K.e, cx, cy, size * 0.7);
      tx.globalCompositeOperation = 'source-atop';   // 食べ物の形のまま 黒く塗る(焦げ)
      tx.fillStyle = 'rgba(30,14,6,.58)'; tx.fillRect(0, 0, S, S);
      tx.fillStyle = 'rgba(255,110,30,.85)';         // 赤くくすぶる所を少し
      [[-0.18, 0.1], [0.12, -0.14], [0.2, 0.16], [-0.05, -0.02]].forEach(function (d) { circle(tx, cx + d[0] * size, cy + d[1] * size, size * 0.035); tx.fill(); });
      x.drawImage(t, 0, 0);
      circle(x, cx, cy, R); x.lineWidth = size * 0.1; x.strokeStyle = '#ff3b2f'; x.stroke();
      if (K.big) {   // 巨大な焦げ: 「−100」の札(下のまんなか)
        var lw = size * 0.62, lh = size * 0.26, ly = cy + R * 0.62;
        x.fillStyle = '#ff3b2f'; x.fillRect(cx - lw / 2, ly - lh / 2, lw, lh); x.lineWidth = Math.max(2, size * 0.02); x.strokeStyle = '#fff'; x.strokeRect(cx - lw / 2, ly - lh / 2, lw, lh);
        x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(lh * 0.8) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('−100', cx, ly + lh * 0.04);
      } else {
        var bx = cx + R * 0.74, by = cy + R * 0.7, br = size * 0.2;   // 「−」の札(右下)
        circle(x, bx, by, br); x.fillStyle = '#ff3b2f'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke();
        x.fillStyle = '#fff'; x.fillRect(bx - br * 0.55, by - br * 0.14, br * 1.1, br * 0.28);
      }
    }
    return (sprites[id] = c);
  }
  function icon(ki) { try { return '<img alt="" src="' + sprite(ki, 40).toDataURL() + '">'; } catch (e) { return ''; } }

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
    var good = BY.good.slice(0, 3).map(icon).join(''), bad = BY.bad.slice(0, 2).map(icon).join(''), gold = icon(BY.gold[0]);
    panel('<h2>🍺 ジョッキ キャッチ</h2>' +
      '<div class="izg-leg">' +
      '<div class="g">' + good + '<span><b>白いお皿</b> … 取る!<br>+5〜10点</span></div>' +
      '<div class="b">' + bad + '<span><b>赤い丸の焦げ</b> … よける!<br>−20点</span></div>' +
      '<div class="b">' + icon(HUGE_I) + '<span><b>でっかい焦げ</b> … ぜったい よける!<br>−100点(「!」が出たら来る)</span></div>' +
      '<div class="o">' + gold + '<span><b>金色の星</b> … 大当たり!<br>+50点(4つだけ)</span></div>' +
      '</div>' +
      '<p>指で お盆を左右に動かします。30秒。<br>ななめからも飛んでくる! だんだん どしゃぶりに。<br>焦げを取らずに続けると 点数がどんどんふえる!</p>' +
      (opts.best ? '<p>今日の自分の最高: <b>' + opts.best + '点</b></p>' : ''),
      [['スタート', begin], ['やめる', close, 'izg-no']]);
  }
  function begin() {
    panel(null);
    var items = plan(opts.seed).map(function (it) { return { t: it.t, x: it.x, sx: it.sx, cx: it.sx, k: it.k, v: it.v, y: -0.1, live: false, done: false }; });
    st.items = items; st.t = 0; st.score = 0; st.streak = 0; st.huge = 0; st.gold = 0; st.bad = 0; st.fx = []; st.flash = 0; st.gflash = 0; st.shake = 0; st.phase = 'play'; st.last = performance.now();
    if (opts.onStart) opts.onStart();
    loop();
  }
  function finish(aborted) {
    if (!st || st.phase !== 'play') { if (aborted) close(); return; }
    st.phase = 'end'; cancelAnimationFrame(raf); draw();
    var score = Math.max(0, st.score), msg = '';
    try { msg = opts.onEnd ? opts.onEnd(score, !!aborted) || '' : ''; } catch (e) {}
    if (aborted) { close(); return; }
    panel('<h2>おしまい!</h2><div class="izg-big">' + score + '<small style="font-size:20px">点</small></div>' +
      '<p>大当たり ' + st.gold + '/' + GOLD_N + ' ・ 焦げ ' + st.bad + '回' + (st.huge ? '(でっかい焦げ ' + st.huge + '回)' : '') + '</p>' + (msg ? '<p class="izg-res">' + msg + '</p>' : ''),
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
      it.cx = it.sx + (it.x - it.sx) * (it.y + 0.1) / (TRAY_Y + 0.1);   // ななめに進む(お盆の高さで ちょうど x)
      var KK = KINDS[it.k], r = size * (KK.big ? BIG * 0.36 : KK.type === 'bad' ? 0.3 : 0.42) / st.W;   // 焦げは 少し甘めに(かすったくらいは セーフ)
      if (py < TRAY_Y && it.y >= TRAY_Y - 0.01 && Math.abs(it.cx - tray) < half + r) {   // お盆に当たった
        it.done = true; var K = KINDS[it.k];
        if (K.pt > 0) {
          st.streak++; var add = addPt(K, st.streak); st.score += add;
          if (K.type === 'gold') { st.gold++; st.gflash = 1; st.fx.push({ x: it.x, y: TRAY_Y - 0.06, s: '+' + add + ' 大当たり!', c: '#ffd23f', a: 1.4, big: 1 }); }
          else st.fx.push({ x: it.x, y: TRAY_Y - 0.04, s: '+' + add, c: '#ffe08a', a: 1 });
        } else {
          st.bad++; st.streak = 0; st.score = Math.max(0, st.score + K.pt); st.flash = K.big ? 2.2 : 1; st.shake = K.big ? 2.5 : 1;
          if (K.big) st.huge++;
          st.fx.push({ x: it.x, y: TRAY_Y - 0.05, s: String(K.pt).replace('-', '−') + (K.big ? ' うわぁ!' : ''), c: '#ff5a4a', a: K.big ? 1.8 : 1.2, big: K.big ? 2 : 1 });
        }
      } else if (it.y > 1.05 + (KK.big ? 0.15 : 0)) it.done = true;   // 落としても 減らない(焦げは よけるもの)
    });
    st.fx.forEach(function (f) { f.y -= dt * 0.12; f.a -= dt * 1.4; }); st.fx = st.fx.filter(function (f) { return f.a > 0; });
    st.flash = Math.max(0, st.flash - dt * (st.flash > 1 ? 2 : 3)); st.gflash = Math.max(0, st.gflash - dt * 2.5); st.shake = Math.max(0, st.shake - dt * (st.shake > 1 ? 2.5 : 5));
    root.querySelector('#izgScore').textContent = st.score;
    root.querySelector('#izgTime').textContent = Math.max(0, Math.ceil(SEC - st.t));
    root.querySelector('.izg-combo').textContent = st.streak >= 3 ? '🔥 ' + st.streak + 'れんぞく' : '';
    draw();
    if (st.t >= SEC) finish(false);
  }

  function draw() {
    var W = st.W, H = st.H, size = st.size = Math.max(40, Math.min(W * 0.13, H * 0.1, 80));
    var sx = st.shake ? Math.sin(st.t * 90) * 6 * st.shake : 0, sy = st.shake > 1 ? Math.cos(st.t * 70) * 5 * (st.shake - 1) : 0;
    g.save(); g.translate(sx, sy);
    g.fillStyle = '#2a1c12'; g.fillRect(-10, 0, W + 20, H);
    // のれんの帯とカウンター(雰囲気だけ。軽く)
    g.fillStyle = '#3a2618'; g.fillRect(-10, 0, W + 20, H * 0.06);
    g.fillStyle = '#7a4a24'; g.fillRect(-10, H * (TRAY_Y + 0.06), W + 20, H);
    g.fillStyle = '#5a3418'; g.fillRect(-10, H * (TRAY_Y + 0.06), W + 20, 6);
    if (st.items) st.items.forEach(function (it) {
      if (!it.live || it.done) return;
      var K = KINDS[it.k], x = it.cx * W, y = it.y * H;
      if (K.type === 'gold') {   // 後ろの星を ゆっくり回して 目立たせる
        var rs = sprite(it.k, size, 'rays'), sc = 1 + Math.sin(st.t * 8) * 0.07;
        g.save(); g.translate(x, y); g.rotate(st.t * 1.6); g.scale(sc, sc); g.drawImage(rs, -rs.width / 2, -rs.height / 2); g.restore();
      } else if (K.type === 'bad') x += Math.sin(st.t * 14 + it.t * 7) * 2;   // 焦げは ぷるぷる
      var sp = sprite(it.k, K.big ? Math.round(size * BIG) : size); g.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
    });
    if (st.items) st.items.forEach(function (it) {   // 巨大な焦げの予告: 出てくる 1秒前から 上に赤い「!」
      if (it.live || it.done || !KINDS[it.k].big || it.t - st.t > 1) return;
      var ax = Math.max(0.06, Math.min(0.94, it.sx)) * W, on = Math.floor(st.t * 8) % 2;
      g.fillStyle = on ? '#ff3b2f' : '#ffdd55'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('!', ax, H * 0.065); g.textBaseline = 'alphabetic';
    });
    // お盆
    var tx = st.trayX * W, tw = TRAY_W * W, ty = TRAY_Y * H;
    g.fillStyle = '#b8743a'; g.beginPath(); g.ellipse(tx, ty + 8, tw / 2, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d99a58'; g.beginPath(); g.ellipse(tx, ty + 2, tw / 2 - 4, 9, 0, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center';
    st.fx && st.fx.forEach(function (f) {
      g.globalAlpha = Math.max(0, Math.min(1, f.a)); g.font = 'bold ' + (f.big === 2 ? 42 : f.big ? 30 : 22) + 'px sans-serif';
      if (f.big) { g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(f.s, Math.max(70, Math.min(W - 70, f.x * W)), f.y * H); }
      g.fillStyle = f.c; g.fillText(f.s, Math.max(70, Math.min(W - 70, f.x * W)), f.y * H); g.globalAlpha = 1;
    });
    g.restore();
    if (st.flash > 0) { g.fillStyle = 'rgba(220,40,30,' + (Math.min(1, st.flash) * 0.3 + Math.max(0, st.flash - 1) * 0.2) + ')'; g.fillRect(0, 0, W, H); }
    if (st.gflash > 0) { g.fillStyle = 'rgba(255,215,60,' + (st.gflash * 0.3) + ')'; g.fillRect(0, 0, W, H); }
  }

  function moveTo(clientX) { var r = cv.getBoundingClientRect(); st.trayX = Math.max(TRAY_W / 2, Math.min(1 - TRAY_W / 2, (clientX - r.left) / r.width)); }

  function open(o) {
    if (root) return;
    opts = o || {}; st = { trayX: 0.5, phase: 'ready', W: 1, H: 1, size: 40, gold: 0, bad: 0 };
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
    _plan: plan, _kinds: KINDS, _sprite: sprite,   // 試し(tools)用
    SEC: SEC
  };
})();
