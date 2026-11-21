/* =====================================================================
   ミニゲーム「ジョッキ キャッチ」(ノブさん 2026-11-21 / 11-21 夜 作り直し / 11-22 ゲームのわくに のせかえ)
   30秒のあいだ、上から いろいろな物が落ちてくる。お盆で受け止める。
     ・白いお皿にのった物 … プラス(+5〜10)。たくさんの種類
     ・赤い丸の 黒く焦げた物 … マイナス(−20)。後半ほど たくさん落ちてくる。よけるのが本番
     ・金色の星 … 大当たり(+50)。1回に4つだけ。少し速い
     ・でっかい焦げ … −150。1回に5回。出る前に 上に赤い「!」
   まっすぐ・右ななめ上・左ななめ上から。1つずつ速さがちがう。はじめ少なめ → だんだん どしゃぶり。
   焦げを取らずに 続けて受け止めると、おまけ(+1〜+9)。焦げを取ると おまけは0から。
   その日(その回)は みんな同じ並びで落ちてくる(seed)ので、運の差が出にくい。
   スタート画面・点数・おしまい画面などは js/game-kit.js(わく)が受け持つ。ここは「遊ぶところ」だけ。
   ===================================================================== */
(function () {
  'use strict';
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
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
    { id: 'b_huge', e: '🍖', type: 'bad', pt: -150, w: 0, big: 1, name: '巨大な焦げ肉' },   // たまにだけ出る めちゃめちゃ大きい焦げ(−150)
    { id: 'g_beer', e: '🍺', type: 'gold', pt: 50, w: 1, name: '金のジョッキ' },
    { id: 'g_ebi', e: '🦞', type: 'gold', pt: 50, w: 1, name: '金の伊勢えび' }
  ];
  var BY = { good: [], bad: [], gold: [] }, HUGE_I = KINDS.findIndex(function (k) { return k.big; });
  KINDS.forEach(function (k, i) { if (k.w) BY[k.type].push(i); });
  var TRAY_Y = 0.84, TRAY_W = 0.27, GOLD_N = 4, BIG = 3.2;   // BIG: 巨大な焦げの大きさ(ふつうの何倍)

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function pickIn(r, list) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += KINDS[list[i]].w; var p = r() * tot; for (i = 0; i < list.length; i++) { p -= KINDS[list[i]].w; if (p < 0) return list[i]; } return list[0]; }
  /* 落ちてくる物の並び(seed が同じなら いつも同じ)
     ノブさん 11-21 夜「簡単すぎる。右ななめ上・左ななめ上からも、まっすぐも。1つずつ速さを変えて。たくさん。異常な感じ」
     「はじめは少なめで、だんだん すごく いっぱい出てくる。たまに ものすごく でっかい 当たっちゃいけないやつ(すごいマイナス)」
     x … お盆の高さに来たときの横の位置。sx … 出てくるときの横の位置(画面の外のこともある=ななめに飛んでくる) */
  var HUGE = HUGE_I;
  /* 11-21 夜 3回目(ノブさん「簡単すぎて つまらない。本当に よけきれないくらいの、ななめからの 波のような攻撃。
     ゆっくり・遅い・速いを まぜる。めちゃめちゃ大きなマイナス」) */
  function plan(seed) {
    var r = rng(hash('jokki4:' + seed)), L = [], t = 0.6;
    function speed(p) {   // 遅い・ふつう・速い を まぜる(1つずつ ちがう)
      var q = r(), base = 0.34 + p * 0.3;
      return base * (q < 0.25 ? 0.4 + r() * 0.25 : q < 0.75 ? 0.8 + r() * 0.4 : 1.5 + r() * 0.7);
    }
    function one(t, p, k, dir, v, x) {
      if (x == null) x = 0.08 + r() * 0.84;
      if (v == null) v = speed(p);
      if (dir == null) { var q = r(), side = 0.3 + p * 0.3; dir = q < side ? -1 : q < side * 2 ? 1 : 0; }
      var sx = dir ? Math.max(-0.35, Math.min(1.35, x - dir * (0.45 + r() * 0.6))) : x;   // dir=1: 右上から / -1: 左上から
      L.push({ t: t, x: x, sx: sx, k: k, v: v });
    }
    function bad() { return pickIn(r, BY.bad); }
    function good() { return pickIn(r, BY.good); }
    // ふだんの雨: はじめ少なめ → だんだん どしゃぶり
    while (t < SEC - 1) {
      var p = t / SEC;
      one(t, p, r() < 0.28 + p * 0.2 ? bad() : good());
      t += 0.58 - p * 0.38 + r() * 0.1;
    }
    // 波の攻撃: ななめ上から、落ちる場所が 端から端へ ずれていく焦げの列(壁のように せまってくる)。だんだん長く・多く
    var wt = 6;
    while (wt < SEC - 2) {
      var p2 = wt / SEC, dir = r() < 0.5 ? -1 : 1, n = 7 + Math.floor(p2 * 8 + r() * 3), v = (0.42 + p2 * 0.35) * (0.85 + r() * 0.3);
      var gap = 0.2 + r() * 0.6, gw = 0.21 - p2 * 0.03;   // すき間(まん中に おいしい物)。お盆が ぎりぎり入る広さ。ここに入れば よけられる
      for (var j = 0; j < n; j++) {
        var x = dir > 0 ? 0.92 - j * (0.84 / (n - 1)) : 0.08 + j * (0.84 / (n - 1));   // 来る向きと 反対へ 流れる
        var dg = Math.abs(x - gap);
        if (dg < gw) { if (dg < 0.06) one(wt + j * 0.07, p2, good(), dir, v, gap); continue; }
        one(wt + j * 0.07, p2, bad(), dir, v, x);
      }
      if (p2 > 0.55 && r() < 0.5) {   // 後半は 反対からも 同時に(X の形)
        var n2 = 5 + Math.floor(r() * 3), d2 = -dir;
        for (var j2 = 0; j2 < n2; j2++) one(wt + 0.35 + j2 * 0.08, p2, r() < 0.8 ? bad() : good(), d2, v * (0.7 + r() * 0.5));
      }
      wt += 4.6 - p2 * 1.8 + r() * 0.8;
    }
    // めちゃめちゃ大きい焦げ(−150): 5回。ゆっくり せまってくる。最後だけ 2つ同時(左右に はなれて)
    [7 + r() * 2, 12 + r() * 2, 17 + r() * 2, 22 + r() * 2, 26 + r()].forEach(function (ht, i) {
      var hx = 0.2 + r() * 0.6;
      one(ht, ht / SEC, HUGE, null, 0.3 + r() * 0.12, i === 4 ? 0.2 : hx);
      if (i === 4) one(ht + 0.6, ht / SEC, HUGE, null, 0.36, 0.8);
    });
    for (var g = 0; g < GOLD_N; g++) {   // 大当たりは 4つ。速い
      var gt = 4.5 + g * 7 + r() * 2.5;
      one(gt, gt / SEC, pickIn(r, BY.gold), null, (0.34 + gt / SEC * 0.3) * 1.6);
    }
    L.sort(function (a, b) { return a.t - b.t; });
    return L;
  }
  /* 続けて受け止めると おまけ(+0〜+9)。焦げを取ると 0 から */
  function addPt(K, streak) { return K.pt + Math.min(streak - 1, 9); }
  function maxScore(seed) { var s = 0, st = 0; plan(seed).forEach(function (it) { var K = KINDS[it.k]; if (K.pt > 0) { st++; s += addPt(K, st); } }); return s; }

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
        x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(lh * 0.8) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('−150', cx, ly + lh * 0.04);
      } else {
        var bx = cx + R * 0.74, by = cy + R * 0.7, br = size * 0.2;   // 「−」の札(右下)
        circle(x, bx, by, br); x.fillStyle = '#ff3b2f'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke();
        x.fillStyle = '#fff'; x.fillRect(bx - br * 0.55, by - br * 0.14, br * 1.1, br * 0.28);
      }
    }
    return (sprites[id] = c);
  }
  function icon(ki) { try { return '<img alt="" src="' + sprite(ki, 40).toDataURL() + '">'; } catch (e) { return ''; } }


  var sprites = {};
  function icon(ki) { try { return '<img alt="" src="' + sprite(ki, 40).toDataURL() + '">'; } catch (e) { return ''; } }
  var st = null;

  window.IZGAME.register({
    id: 'jokki', title: '🍺 ジョッキ キャッチ', ver: 'ver.3', sec: SEC,
    maxScore: maxScore,
    intro: function () {
      var good = BY.good.slice(0, 3).map(icon).join(''), bad = BY.bad.slice(0, 2).map(icon).join(''), gold = icon(BY.gold[0]);
      return '<div class="izg-leg">' +
        '<div class="g">' + good + '<span><b>白いお皿</b> … 取る!<br>+5〜10点</span></div>' +
        '<div class="b">' + bad + '<span><b>赤い丸の焦げ</b> … よける!<br>−20点</span></div>' +
        '<div class="b">' + icon(HUGE_I) + '<span><b>でっかい焦げ</b> … ぜったい よける!<br>−150点(「!」が出たら来る)</span></div>' +
        '<div class="o">' + gold + '<span><b>金色の星</b> … 大当たり!<br>+50点(4つだけ)</span></div>' +
        '</div>' +
        '<p>指で お盆を左右に動かします。30秒。<br>ななめから 焦げの波が おそってくる!<br>遅いのも 速いのも。だんだん どしゃぶりに。<br>焦げを取らずに続けると 点数がどんどんふえる!</p>';
    },
    init: function () { st = { trayX: 0.5, items: null, size: 40 }; },
    start: function (k, seed) {
      st.items = plan(seed).map(function (it) { return { t: it.t, x: it.x, sx: it.sx, cx: it.sx, k: it.k, v: it.v, y: -0.1, live: false, done: false }; });
      st.streak = 0; st.huge = 0; st.gold = 0; st.bad = 0;
    },
    update: function (k, dt) {
      var tray = st.trayX, half = TRAY_W / 2, size = st.size;
      st.items.forEach(function (it) {
        if (it.done) return;
        if (!it.live) { if (k.t >= it.t) it.live = true; else return; }
        var py = it.y; it.y += it.v * dt;
        it.cx = it.sx + (it.x - it.sx) * (it.y + 0.1) / (TRAY_Y + 0.1);   // ななめに進む(お盆の高さで ちょうど x)
        var KK = KINDS[it.k], r = size * (KK.big ? BIG * 0.36 : KK.type === 'bad' ? 0.3 : 0.42) / k.W;   // 焦げは 少し甘めに(かすったくらいは セーフ)
        if (py < TRAY_Y && it.y >= TRAY_Y - 0.01 && Math.abs(it.cx - tray) < half + r) {   // お盆に当たった
          it.done = true; var K = KINDS[it.k];
          if (K.pt > 0) {
            st.streak++; var add = addPt(K, st.streak); k.add(add);
            if (K.type === 'gold') { st.gold++; k.flash('255,215,60', 1); k.fx(it.x, TRAY_Y - 0.06, '+' + add + ' 大当たり!', '#ffd23f', 1); }
            else k.fx(it.x, TRAY_Y - 0.04, '+' + add, '#ffe08a');
          } else {
            st.bad++; st.streak = 0; k.add(K.pt); k.flash('220,40,30', K.big ? 2.2 : 1); k.shake(K.big ? 2.5 : 1);
            if (K.big) st.huge++;
            k.fx(it.x, TRAY_Y - 0.05, String(K.pt).replace('-', '−') + (K.big ? ' うわぁ!' : ''), '#ff5a4a', K.big ? 2 : 1);
          }
        } else if (it.y > 1.05 + (KK.big ? 0.15 : 0)) it.done = true;   // 落としても 減らない(焦げは よけるもの)
      });
      k.combo(st.streak >= 3 ? '🔥 ' + st.streak + 'れんぞく' : '');
    },
    draw: function (k, g, W, H) {
      var size = st.size = Math.max(40, Math.min(W * 0.13, H * 0.1, 80));
      g.fillStyle = '#2a1c12'; g.fillRect(-10, 0, W + 20, H);
      g.fillStyle = '#3a2618'; g.fillRect(-10, 0, W + 20, H * 0.06);   // のれんの帯とカウンター(雰囲気だけ。軽く)
      g.fillStyle = '#7a4a24'; g.fillRect(-10, H * (TRAY_Y + 0.06), W + 20, H);
      g.fillStyle = '#5a3418'; g.fillRect(-10, H * (TRAY_Y + 0.06), W + 20, 6);
      if (st.items) st.items.forEach(function (it) {
        if (!it.live || it.done) return;
        var K = KINDS[it.k], x = it.cx * W, y = it.y * H;
        if (K.type === 'gold') {   // 後ろの星を ゆっくり回して 目立たせる
          var rs = sprite(it.k, size, 'rays'), sc = 1 + Math.sin(k.t * 8) * 0.07;
          g.save(); g.translate(x, y); g.rotate(k.t * 1.6); g.scale(sc, sc); g.drawImage(rs, -rs.width / 2, -rs.height / 2); g.restore();
        } else if (K.type === 'bad') x += Math.sin(k.t * 14 + it.t * 7) * 2;   // 焦げは ぷるぷる
        var sp = sprite(it.k, K.big ? Math.round(size * BIG) : size); g.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
      });
      if (st.items) st.items.forEach(function (it) {   // 巨大な焦げの予告: 出てくる 1秒前から 上に赤い「!」
        if (it.live || it.done || !KINDS[it.k].big || it.t - k.t > 1) return;
        var ax = Math.max(0.06, Math.min(0.94, it.sx)) * W, on = Math.floor(k.t * 8) % 2;
        g.fillStyle = on ? '#ff3b2f' : '#ffdd55'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('!', ax, H * 0.065); g.textBaseline = 'alphabetic';
      });
      var tx = st.trayX * W, tw = TRAY_W * W, ty = TRAY_Y * H;   // お盆
      g.fillStyle = '#b8743a'; g.beginPath(); g.ellipse(tx, ty + 8, tw / 2, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d99a58'; g.beginPath(); g.ellipse(tx, ty + 2, tw / 2 - 4, 9, 0, 0, Math.PI * 2); g.fill();
    },
    pointer: function (k, p) { st.trayX = Math.max(TRAY_W / 2, Math.min(1 - TRAY_W / 2, p.x)); },
    key: function (k, key) { if (key === 'ArrowLeft') st.trayX = Math.max(TRAY_W / 2, st.trayX - 0.06); if (key === 'ArrowRight') st.trayX = Math.min(1 - TRAY_W / 2, st.trayX + 0.06); },
    result: function () { return '大当たり ' + st.gold + '/' + GOLD_N + ' ・ 焦げ ' + st.bad + '回' + (st.huge ? '(でっかい焦げ ' + st.huge + '回)' : ''); },
    _plan: plan, _kinds: KINDS, _sprite: sprite   // 試し(tools)用
  });
})();
