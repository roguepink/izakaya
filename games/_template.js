/* =====================================================================
   ゲームの お手本(新しいゲームは このファイルを写して作る)  2026-11-22
   見本の中身: 「焼き鳥タップ」… 網の上に 焼き鳥が出てくる。焼けたもの(茶色)を さわると +10。
   焦げたもの(黒)を さわると −20。20秒。

   作り方:
     1. このファイルを games/<英語の名前>.js に写す(例: games/oden.js)
     2. id を ファイル名と同じにする
     3. config.js の SHOP.GAMES に 1行 足す(off: true のうちは お店に出ない)
     4. tools/game-play.html?g=<id> で 1人で遊んで ためす
     5. tools/game-check.py <id> で 重さを測る(合格したら off をはずす)

   わく(js/game-kit.js)が やってくれること:
     スタート画面(intro の文)・スタート / やめる・点数と残り時間の表示・おしまい画面・もう一回・
     画面のゆれ(k.shake)・光る(k.flash)・点数の文字(k.fx)・上のまん中の文字(k.combo)・ランキングへの記録

   ゲームが書くこと(この下の register の中):
     intro()            スタート画面に出す せつめい(HTML)
     init(k)            ゲームを開いたとき 1回
     start(k, seed)     スタートのたび。seed が同じなら みんな同じ並びにする(k.rng(seed) を使う)
     update(k, dt)      毎回(dt = 前からの秒)。点数は k.add(10) / k.add(-20)
     draw(k, g, W, H)   毎回 絵を描く(g = 2D の筆、W・H = 画面の大きさ)
     pointer(k, p, type) 指でさわった(p.x・p.y は 0〜1、type は down / move / up)
     result(k)          おしまい画面に出す ひとこと
     maxScore(seed)     その並びで取れる いちばん高い点(ずるい点数を防ぐ。だいたいで よい)

   軽くするための きまり:
     ・3D は使わない(平らな絵だけ)。絵は k.sprite で 先に1回だけ描いて 使い回す
     ・毎回 新しい物を たくさん作らない(配列は start で作って 使い回す)
     ・音は まだ使わない(お店の音と ぶつかるので、入れるときは 相談)
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 20, SPOTS = 9;   // 網の上の 置き場所(3×3)
  var st = null;

  function plan(seed, rnd) {   // 出てくる順番(seed が同じなら いつも同じ)
    var L = [], t = 0.5;
    while (t < SEC - 0.8) {
      var p = t / SEC;
      L.push({ t: t, spot: Math.floor(rnd() * SPOTS), bad: rnd() < 0.25 + p * 0.2, life: 1.6 - p * 0.7 });
      t += 0.7 - p * 0.35 + rnd() * 0.2;
    }
    return L;
  }

  window.IZGAME.register({
    id: '_template', title: '🍢 焼き鳥タップ(お手本)', ver: 'お手本', sec: SEC,
    maxScore: function (seed) { var n = 0; plan(seed, mk(seed)).forEach(function (x) { if (!x.bad) n += 10; }); return n; },
    intro: function () {
      return '<p>網の上に 焼き鳥が出てきます。<br><b>茶色(焼けた)</b> を さわると +10点。<br><b>黒(焦げた)</b> を さわると −20点。<br>20秒。</p>';
    },
    init: function () { st = { list: [], hit: 0, miss: 0 }; },
    start: function (k, seed) { st.list = plan(seed, mk(seed)).map(function (x) { x.state = 'wait'; return x; }); st.hit = 0; st.miss = 0; },
    update: function (k) {
      st.list.forEach(function (x) {
        if (x.state === 'wait' && k.t >= x.t) x.state = 'show';
        if (x.state === 'show' && k.t >= x.t + x.life) x.state = 'gone';
      });
    },
    draw: function (k, g, W, H) {
      g.fillStyle = '#2a1c12'; g.fillRect(-10, 0, W + 20, H);
      var cell = Math.min(W, H) / 3.4, ox = (W - cell * 3) / 2, oy = (H - cell * 3) / 2;
      g.strokeStyle = '#555'; g.lineWidth = 3;   // 網
      for (var i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(ox, oy + i * cell); g.lineTo(ox + cell * 3, oy + i * cell); g.stroke(); g.beginPath(); g.moveTo(ox + i * cell, oy); g.lineTo(ox + i * cell, oy + cell * 3); g.stroke(); }
      st.list.forEach(function (x) {
        if (x.state !== 'show') return;
        var cx = ox + (x.spot % 3 + 0.5) * cell, cy = oy + (Math.floor(x.spot / 3) + 0.5) * cell;
        var sp = k.sprite(x.bad ? 'bad' : 'good', cell * 0.8, cell * 0.8, function (c, w, h) {   // 先に1回だけ描く
          c.strokeStyle = '#d8b88a'; c.lineWidth = w * 0.05; c.lineCap = 'round'; c.beginPath(); c.moveTo(w * 0.15, h * 0.85); c.lineTo(w * 0.85, h * 0.15); c.stroke();
          for (var j = 0; j < 3; j++) { c.fillStyle = x.bad ? '#2a1a12' : '#a8642a'; c.beginPath(); c.arc(w * (0.32 + j * 0.17), h * (0.68 - j * 0.17), w * 0.12, 0, Math.PI * 2); c.fill(); }
        });
        g.drawImage(sp, cx - sp.width / 2, cy - sp.height / 2);
        x._box = [cx / W, cy / H, cell * 0.45 / W, cell * 0.45 / H];
      });
    },
    pointer: function (k, p, type) {
      if (type !== 'down' || k.phase !== 'play') return;
      st.list.forEach(function (x) {
        if (x.state !== 'show' || !x._box) return;
        if (Math.abs(p.x - x._box[0]) < x._box[2] && Math.abs(p.y - x._box[1]) < x._box[3]) {
          x.state = 'gone';
          if (x.bad) { k.add(-20); st.miss++; k.flash('220,40,30', 1); k.shake(1); k.fx(x._box[0], x._box[1], '−20', '#ff5a4a', 1); }
          else { k.add(10); st.hit++; k.fx(x._box[0], x._box[1], '+10', '#ffe08a'); }
        }
      });
    },
    result: function () { return '焼けた焼き鳥 ' + st.hit + '本 ・ 焦げ ' + st.miss + '本'; }
  });
  function mk(seed) { return window.IZGAME._rngOf ? window.IZGAME._rngOf(seed) : Math.random; }
})();
