/* =====================================================================
   ミニゲーム「大将をたたくな!」(ノブさん 2026-11-22)
   9つの穴から、大将と にせものの顔が つぎつぎ出てくる。にせものは 色・メガネ・帽子などで ひと目で ちがう(11-22 ノブさん「パッと見で全然違う形に」)。そのぶん 後半は とても速い。にせものを たたくと +1、本物の大将を たたくと −10。
   はじめは ゆっくり・少なめ → だんだん 速く・たくさん → 最後は 3つの顔が いっしょに出てくる。
   顔の絵は games/tataki.webp(1枚に まとめた 顔写真。上の段: ふつう / 下の段: たたかれた顔。0番が本物の大将、1〜12番が にせもの)
   スタート画面・点数・おしまい画面などは js/game-kit.js(わく)が受け持つ。
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 30, N_CH = 13, CELL = 176;
  var img = new Image(), ready = new Promise(function (ok) { img.onload = ok; img.onerror = ok; });
  img.src = (window.IZGAME_BASE || '') + 'games/tataki.webp';
  var st = null;

  /* 出てくる順番(seed が同じなら いつも同じ) */
  function plan(seed) {
    var r = window.IZGAME._rngOf('tataki2:' + seed), L = [], t = 0.8, busy = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    function one(t, p, real) {
      var free = []; for (var h = 0; h < 9; h++) if (busy[h] <= t) free.push(h);
      if (!free.length) return;
      var hole = free[Math.floor(r() * free.length)], life = 1.35 - p * 0.92 + r() * 0.12;   // 最後は 0.45秒くらいで ひっこむ
      var ch = real ? 0 : 1 + Math.floor(r() * (N_CH - 1));
      busy[hole] = t + life + 0.18; L.push({ t: t, hole: hole, ch: ch, life: life });
    }
    while (t < SEC - 0.6) {
      var p = t / SEC, realRate = 0.25 + p * 0.15;
      if (p > 0.66) { for (var k = 0; k < 3; k++) one(t + k * 0.05, p, r() < realRate); t += 0.72 - (p - 0.66) * 1.1 + r() * 0.08; }   // 最後は 3つの顔が いっしょに
      else if (p > 0.3 && r() < 0.45) { one(t, p, r() < realRate); one(t + 0.08, p, r() < realRate); t += 0.66 - p * 0.4 + r() * 0.12; }   // ときどき 2つ
      else { one(t, p, r() < realRate); t += 0.85 - p * 0.75 + r() * 0.12; }
    }
    return L;
  }
  function face(ch, hit) {   // 顔写真を切り出した 小さな絵
    var c = document.createElement('canvas'); c.width = c.height = CELL; var x = c.getContext('2d');
    try { x.drawImage(img, ch * CELL, hit ? CELL : 0, CELL, CELL, 0, 0, CELL, CELL); } catch (e) {}
    return c;
  }
  function iconOf(ch) { try { return '<img alt="" src="' + face(ch, false).toDataURL() + '">'; } catch (e) { return ''; } }

  window.IZGAME.register({
    id: 'tataki', title: '🔨 大将をたたくな!', ver: 'ver.2', sec: SEC, ready: ready,
    maxScore: function (seed) { return plan(seed).filter(function (x) { return x.ch !== 0; }).length; },
    intro: function () {
      return '<div class="izg-leg">' +
        '<div class="b">' + iconOf(0) + '<span><b>本物の大将</b> … たたかない!<br>たたくと −10点</span></div>' +
        '<div class="g">' + iconOf(1) + iconOf(6) + iconOf(4) + iconOf(8) + '<span><b>にせもの</b> … たたく!<br>+1点</span></div>' +
        '</div><p>9つの穴から 大将と にせものが 出てきます。<br>はちまきが 紺色で、メガネも帽子もないのが 本物の大将。<br>ほかは ぜんぶ たたこう! どんどん 速くなります。30秒。</p>';
    },
    init: function () { st = { list: [], holes: [], hit: 0, ouch: 0, faces: {} }; },
    start: function (k, seed) {
      st.list = plan(seed).map(function (x) { return { t: x.t, hole: x.hole, ch: x.ch, life: x.life, state: 'wait', hitAt: 0 }; });
      st.hit = 0; st.ouch = 0; st.streak = 0;
    },
    update: function (k) {
      st.list.forEach(function (x) {
        if (x.state === 'wait' && k.t >= x.t) x.state = 'up';
        if (x.state === 'up' && k.t >= x.t + x.life) x.state = 'gone';
        if (x.state === 'hit' && k.t >= x.hitAt + 0.45) x.state = 'gone';
      });
      k.combo(st.streak >= 5 ? '🔥 ' + st.streak + 'れんぞく' : '');
    },
    draw: function (k, g, W, H) {
      g.fillStyle = '#2a1c12'; g.fillRect(-10, 0, W + 20, H);
      g.fillStyle = '#3a2618'; g.fillRect(-10, 0, W + 20, H * 0.05);
      var cw = Math.min(W / 3.05, (H * 0.94) / 3.35), ox = (W - cw * 3) / 2, oy = (H - cw * 3.25) / 2 + cw * 0.08;
      st.holes = [];
      for (var h = 0; h < 9; h++) {
        var cx = ox + (h % 3 + 0.5) * cw, cy = oy + (Math.floor(h / 3) + 0.8) * cw * 1.08, rw = cw * 0.44, rh = cw * 0.15;
        st.holes.push({ cx: cx, cy: cy, rw: rw, top: cy - cw * 0.85 });
        g.fillStyle = '#120a06'; g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, Math.PI, 0); g.fill();   // 穴(うしろ半分)
      }
      st.list.forEach(function (x) {
        if (x.state !== 'up' && x.state !== 'hit') return;
        var hl = st.holes[x.hole], age = k.t - x.t, left = x.t + x.life - k.t;
        var rise = x.state === 'hit' ? 1 - Math.min(1, (k.t - x.hitAt) / 0.45) * 0.9 : Math.min(1, age / 0.14, Math.max(0, left) / 0.14);
        var sz = cw * 1.0, top = hl.cy - sz * 0.9 * rise;
        var key = x.ch + (x.state === 'hit' ? 'h' : 'n'), sp = st.faces[key] || (st.faces[key] = face(x.ch, x.state === 'hit'));
        g.save(); g.beginPath(); g.rect(hl.cx - sz, hl.cy - sz * 1.3, sz * 2, sz * 1.3); g.clip();   // 穴より下は 見せない
        g.drawImage(sp, hl.cx - sz / 2, top, sz, sz); g.restore();
        x.box = [hl.cx, top + sz * 0.45, sz * 0.42, sz * 0.5];
      });
      st.holes.forEach(function (hl) {   // 穴の手前のふち
        g.strokeStyle = '#7a4a24'; g.lineWidth = 6; g.beginPath(); g.ellipse(hl.cx, hl.cy, hl.rw, hl.rw * 0.33, 0, 0, Math.PI); g.stroke();
      });
    },
    pointer: function (k, p, type) {
      if (type !== 'down' || k.phase !== 'play') return;
      var px = p.x * k.W, py = p.y * k.H, best = null;
      st.list.forEach(function (x) {
        if (x.state !== 'up' || !x.box) return;
        if (Math.abs(px - x.box[0]) < x.box[2] && Math.abs(py - x.box[1]) < x.box[3]) best = x;
      });
      if (!best) return;
      best.state = 'hit'; best.hitAt = k.t;
      var fx = best.box[0] / k.W, fy = (best.box[1] - best.box[3]) / k.H;
      if (best.ch === 0) { k.add(-10); st.ouch++; st.streak = 0; k.flash('220,40,30', 2); k.shake(2.2); k.fx(fx, fy, '−10 いてっ!', '#ff5a4a', 2); }
      else { k.add(1); st.hit++; st.streak++; k.fx(fx, fy, '+1', '#ffe08a'); }
    },
    result: function () { return 'にせもの ' + st.hit + '人 ・ 本物の大将 ' + st.ouch + '回' + (st.ouch ? '(いてて…)' : '(大将は ぶじ!)'); }
  });
})();
