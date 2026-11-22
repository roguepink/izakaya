/* =====================================================================
   ミニゲーム「ハンドレッド ボウリング」(ノブさん 2026-11-22)
   1回投げるだけで 100本のピンを 倒す。ピンは ふつうの並びではなく、レーンに でたらめに 100本(毎回ちがう)。
   えらべるもの: ボールの色・重さ・回転の量・右回転/左回転・投げる場所(左/まん中/右)。
   右回転は 左へ曲がる、左回転は 右へ曲がる。ガーターは なし(はしの かべで 跳ね返る)。左から 右回転で投げると、はじめは 右へ転がって あとで 左へ曲がる(右からは その逆)。
   はじめに カメラが 上から下へ レーンを なぞって ピンの並びを見せる → 指で 投げる向きを決めて(ななめもOK)、はなすと投げる。
   ななめに投げると かべで 何回も 跳ね返りながら ジグザグに 進む(11-22 ノブさん「斜めにも投げれるように」)。
   倒れたピンが ほかのピンを たおす(れんさ)。倒れた本数が そのまま点数(100点満点)。3D は使わない(平らな絵)。
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 60, LEN = 6.4, PIN_R = 0.027, N_PIN = 100, TOP = 6.0;
  var COLORS = [['赤', '#d9442e'], ['青', '#3a6ad8'], ['金', '#e0b030'], ['黒', '#2a2a30'], ['ピンク', '#e88aa8'], ['緑', '#3a9a5a']];
  var WEIGHT = [['軽い', 0.05, 0.7], ['ふつう', 0.06, 1.0], ['重い', 0.07, 1.45]];   // [名前, 半径, 重さ]
  var SPIN = [['なし', 0], ['少し', 1], ['ふつう', 2], ['すごく', 3]];
  var DIR = [['右回転', -1], ['左回転', 1]];   // 右回転 → 左へ曲がる
  var POS = [['左', 0.2], ['まん中', 0.5], ['右', 0.8]];
  var opt = { c: 0, w: 1, s: 2, d: 0, p: 0 }, MAX_ANG = 0.95;   // 投げる向き: まっすぐから 左右に 55度まで
  try { var sv = JSON.parse(localStorage.getItem('iz-bowl') || 'null'); if (sv) Object.keys(opt).forEach(function (k) { if (typeof sv[k] === 'number') opt[k] = sv[k]; }); } catch (e) {}
  var st = null, tries = 0;

  function layout(seed) {   // 100本を でたらめに(まとまりも 少し)。毎回ちがう
    var r = window.IZGAME._rngOf(seed), L = [], guard = 0;
    var clusters = []; for (var c = 0; c < 4; c++) clusters.push([0.15 + r() * 0.7, 2.4 + r() * 3.2]);
    while (L.length < N_PIN && guard++ < 6000) {
      var x, y;
      if (r() < 0.45) { var cl = clusters[Math.floor(r() * clusters.length)]; x = cl[0] + (r() - 0.5) * 0.3; y = cl[1] + (r() - 0.5) * 0.5; }
      else { x = 0.05 + r() * 0.9; y = 2.0 + r() * 3.8; }
      if (x < 0.04 || x > 0.96 || y < 1.9 || y > 5.9) continue;
      if (L.some(function (p) { return (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < 0.0042; })) continue;
      L.push({ x: x, y: y, vx: 0, vy: 0, st: 'stand', a: 0, va: 0 });
    }
    return L;
  }
  function chips(key, list) {
    return '<div class="bw-row"><b>' + { c: 'ボールの色', w: '重さ', s: '回転の量', d: '回転の向き', p: '投げる場所' }[key] + '</b><span>' + list.map(function (x, i) {
      var sw = key === 'c' ? '<i style="background:' + x[1] + '"></i>' : '';
      return '<button type="button" data-bw="' + key + i + '" class="' + (opt[key] === i ? 'on' : '') + '">' + sw + x[0] + '</button>';
    }).join('') + '</span></div>';
  }
  var css = document.createElement('style');
  css.textContent = '#izg .bw-row{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:8px 0;text-align:left}#izg .bw-row b{font-size:13px;color:#f5c04a}#izg .bw-row span{display:flex;flex-wrap:wrap;gap:6px}' +
    '#izg .bw-row button{font-size:14px;padding:7px 12px;background:#4a3a2c;color:#f2e6d4;border:2px solid transparent;display:inline-flex;align-items:center;gap:5px}#izg .bw-row button.on{border-color:#f5c04a;background:#6a4a2a}' +
    '#izg .bw-row i{width:14px;height:14px;border-radius:50%;display:inline-block;box-shadow:inset -2px -2px 0 rgba(0,0,0,.3)}';
  document.head.appendChild(css);
  document.addEventListener('click', function (e) {   // えらんだものを 覚える
    var b = e.target.closest && e.target.closest('#izg [data-bw]'); if (!b) return;
    var v = b.getAttribute('data-bw'), k = v[0], i = +v.slice(1); opt[k] = i;
    b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    try { localStorage.setItem('iz-bowl', JSON.stringify(opt)); } catch (e2) {}
  });

  function aimAt(p) {   // 指の場所 → 投げる向き(ボールから 指へ)。指がボールより下なら 横の位置だけで決める
    var v = st.view; if (!v) return;
    var dx = (p.x - v.bx) * v.W, dy = (v.by - p.y) * v.H;
    st.ang = Math.max(-MAX_ANG, Math.min(MAX_ANG, Math.atan2(dx, Math.max(40, dy))));
  }
  function hit(p, k) { if (p.st !== 'stand') return; p.st = 'fly'; st.down++; k.add(1); st.chain.push(k.t); }

  function step(k, dt) {   // 1コマぶんの動き(update が 1/120秒ずつに 区切って 呼ぶ)
      var b = st.ball;
      if (st.phase === 'look') {   // 上から下へ なぞって見せる
        st.lookT += dt; var q = Math.min(1, st.lookT / 2.8), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        st.cam = TOP - (TOP - 0.0) * e; if (q >= 1) st.phase = 'aim';
        k.combo(''); return;
      }
      if (st.phase === 'aim') { k.combo(st.aiming ? '👉 はなすと投げる!' : '🎯 ねらってね'); return; }
      if (st.slow > 0) { st.slow -= dt; dt *= 0.45; }
      if (st.phase === 'roll') {
        var steps = 4, h = dt / steps;
        for (var s = 0; s < steps; s++) {
          b.vx += st.dir * st.spin * 0.16 * Math.max(0, Math.min(1.4, (b.y - 1.0) / 2.4)) * h;   // あとから 大きく曲がる(フック)
          b.x += b.vx * h; b.y += b.vy * h; b.rot += (b.vy * 9 + st.spin * 4) * h;
          if (b.x - b.r < 0 || b.x + b.r > 1) {   // ガーターは なし: はしの かべで 跳ね返る(11-22 ノブさん「確実に点がつく形で」)
            b.x = b.x < 0.5 ? b.r : 1 - b.r; b.vx = -b.vx * 0.88 + (b.x < 0.5 ? 0.1 : -0.1); k.shake(0.6);   // ななめに投げたときは 勢いを あまり落とさず ジグザグに
            if (k.t - (st.bumpAt || 0) > 0.4) { st.bumpAt = k.t; st.msg = 'ボヨーン!'; st.msgT = 0.9; }
          }
          st.pins.forEach(function (p) {
            if (p.st !== 'stand') return;
            var dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy, rr = b.r + PIN_R;
            if (d2 < rr * rr) {
              var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d, sp2 = Math.hypot(b.vx, b.vy);
              hit(p, k); p.vx = nx * sp2 * (0.9 + b.m * 0.35) + b.vx * 0.3; p.vy = ny * sp2 * (0.9 + b.m * 0.35) + b.vy * 0.4; p.va = (Math.random() - 0.5) * 20;
              b.vy *= 1 - 0.018 / b.m; b.vx -= nx * 0.06 / b.m;
              if (st.down === 1) st.slow = 0.7;   // はじめて当たった瞬間は スロー
            }
          });
        }
        st.cam = Math.max(st.cam, Math.min(TOP, b.y - 0.9));
        if (b.y > LEN || b.vy < 0.15) { st.phase = 'settle'; st.endT = k.t + 2.2; }
      } else if (st.phase === 'settle') {
        st.cam += (Math.min(TOP, 4.2) - st.cam) * Math.min(1, dt * 1.5);
        if (k.t >= st.endT && st.pins.every(function (p) { return p.st !== 'fly'; })) { st.phase = 'done'; k.end(); }
        if (k.t >= st.endT + 3) { st.phase = 'done'; k.end(); }
      }
      // 倒れたピン: すべって ほかのピンを たおす(れんさ)
      var flying = st.pins.filter(function (p) { return p.st === 'fly'; });
      flying.forEach(function (p) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        var f = Math.exp(-2.0 * dt); p.vx *= f; p.vy *= f; p.va *= f;
        if (p.x < 0.01 || p.x > 0.99) { p.vx *= -0.4; p.x = Math.max(0.01, Math.min(0.99, p.x)); }
        var v = Math.hypot(p.vx, p.vy);
        if (v > 0.22) st.pins.forEach(function (q) {
          if (q.st !== 'stand') return;
          var dx = q.x - p.x, dy = q.y - p.y; if (dx * dx + dy * dy > 4 * PIN_R * PIN_R * 1.3) return;
          hit(q, k); var an = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 1.3, sp3 = v * 0.86;
          q.vx = Math.cos(an) * sp3; q.vy = Math.sin(an) * sp3; q.va = (Math.random() - 0.5) * 20; p.vx *= 0.62; p.vy *= 0.62;
        });
        if (v < 0.06) p.st = 'down';
      });
      st.chain = st.chain.filter(function (t) { return k.t - t < 0.5; });
      if (st.chain.length >= 8 && k.t - st.bigAt > 0.6) { st.bigAt = k.t; k.shake(1.2); k.fx(0.5, 0.3, 'れんさ!' , '#ffd23f', 1); }
      if (st.msgT > 0) st.msgT -= dt;
      k.combo(st.phase === 'roll' || st.phase === 'settle' ? '🎳 ' + st.down + '本' : '');
    }

  window.IZGAME.register({
    id: 'bowling', title: '🎳 ハンドレッド ボウリング', ver: 'ver.2', sec: SEC,
    maxScore: function () { return N_PIN; },
    intro: function () {
      return '<p>1回 投げるだけ。レーンに でたらめに ならんだ <b>100本</b>の ピンを、何本 倒せるか!<br>倒れたピンが ほかのピンも たおします。ガーターは なし(かべで 跳ね返る)。<br><b>ななめに投げる</b>と かべで 何回も 跳ね返って、たくさん 倒せるかも!</p>' +
        chips('c', COLORS) + chips('w', WEIGHT) + chips('s', SPIN) + chips('d', DIR) + chips('p', POS) +
        '<p style="font-size:13px;opacity:.8">右回転は 左へ、左回転は 右へ 曲がります。<br>左から 右回転で投げると、はじめは 右へ転がって あとで 左へ曲がります。<br>スタートすると ピンの並びを 上から見せます。<br>見たら <b>指で 投げる向きを決めて、はなすと 投げます</b>。</p>';
    },
    init: function () { st = {}; },
    start: function (k, seed) {
      tries++;
      st.pins = layout(seed + ':' + Date.now() + ':' + tries);
      var W = WEIGHT[opt.w], sp = SPIN[opt.s][1], dir = DIR[opt.d][1], x0 = POS[opt.p][1];
      st.speed = 2.6 + (W[2] - 1) * 0.15; st.ang = 0; st.aiming = false;
      st.ball = { x: x0, y: 0.35, vx: 0, vy: st.speed, r: W[1], m: W[2], rot: 0 };
      st.spin = sp; st.dir = dir; st.color = COLORS[opt.c][1];
      st.bumpAt = 0; st.phase = 'look'; st.lookT = 0; st.cam = TOP; st.down = 0; st.chain = []; st.slow = 0; st.endT = 0; st.msg = ''; st.msgT = 0; st.bigAt = 0;
    },
    update: function (k, dt) {   // 動きは 1/120秒ずつに 区切って計算(スマホの速さで れんさの数・すりぬけが 変わらないように 11-22)
      var n = Math.min(40, Math.max(1, Math.ceil(dt * 120))); for (var i = 0; i < n; i++) step(k, dt / n);
    },
    draw: function (k, g, W, H) {
      if (!st.pins) { st.pins = layout('intro'); st.cam = 3.2; st.phase = 'intro'; st.ball = { x: 0.5, y: 0.35, r: 0.05, vx: 0, vy: 0, rot: 0 }; }   // スタート前は 見本の並び
      var lw = Math.min(W * 0.78, 420), lx = (W - lw) / 2, s = lw, bottom = H * 0.86;
      var Y = function (y) { return bottom - (y - st.cam + (st.phase === 'look' || st.phase === 'aim' ? 0 : 0)) * s; };
      if (st.phase === 'look' || st.phase === 'aim') Y = function (y) { return bottom - (y - st.cam) * s; };
      g.fillStyle = '#1e140c'; g.fillRect(-10, 0, W + 20, H);
      g.fillStyle = '#d9442e'; g.fillRect(lx - 10, 0, 10, H); g.fillRect(lx + lw, 0, 10, H);   // はしの かべ(跳ね返る。ガーターなし)
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(lx - 4, 0, 2, H); g.fillRect(lx + lw + 2, 0, 2, H);
      var lg = g.createLinearGradient(lx, 0, lx + lw, 0); lg.addColorStop(0, '#c8955a'); lg.addColorStop(0.5, '#e2b47a'); lg.addColorStop(1, '#c8955a');
      g.fillStyle = lg; g.fillRect(lx, 0, lw, H);
      g.strokeStyle = 'rgba(120,70,30,.25)'; g.lineWidth = 1; for (var i = 1; i < 12; i++) { g.beginPath(); g.moveTo(lx + lw * i / 12, 0); g.lineTo(lx + lw * i / 12, H); g.stroke(); }   // 板の目
      var fy = Y(0.15); if (fy > 0 && fy < H) { g.fillStyle = '#8a2a1e'; g.fillRect(lx, fy, lw, 4); }   // ファウルライン
      [1.4].forEach(function (yy) { var ay = Y(yy); if (ay < -20 || ay > H + 20) return; g.fillStyle = '#7a3a1a'; for (var j = 1; j < 7; j++) { var ax = lx + lw * j / 7; g.beginPath(); g.moveTo(ax, ay - 12); g.lineTo(ax - 6, ay + 6); g.lineTo(ax + 6, ay + 6); g.closePath(); g.fill(); } });   // 矢印
      var pr = PIN_R * s;
      st.pins.forEach(function (p) {
        var x = lx + p.x * lw, y = Y(p.y); if (y < -20 || y > H + 20) return;
        if (p.st === 'stand') {
          g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 1.5, y + 2, pr, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(x, y, pr, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#d9442e'; g.lineWidth = Math.max(1.5, pr * 0.32); g.beginPath(); g.arc(x, y, pr * 0.62, 0, Math.PI * 2); g.stroke();
        } else {   // 倒れたピン(横になった形)
          g.save(); g.translate(x, y); g.rotate(p.a); g.globalAlpha = p.st === 'down' ? 0.75 : 1;
          g.fillStyle = '#f4efe2'; g.beginPath(); g.ellipse(0, 0, pr * 2.1, pr * 0.85, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#d9442e'; g.fillRect(pr * 0.7, -pr * 0.8, pr * 0.35, pr * 1.6); g.restore(); g.globalAlpha = 1;
        }
      });
      var b = st.ball, bx = lx + b.x * lw, by = Y(b.y), br = b.r * s;
      st.view = { bx: bx / W, by: by / H, W: W, H: H };
      if (st.phase === 'aim' || st.phase === 'roll' || st.phase === 'settle') {
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(bx + 3, by + 4, br, 0, Math.PI * 2); g.fill();
        var bg2 = g.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br); bg2.addColorStop(0, '#ffffff'); bg2.addColorStop(0.25, st.color); bg2.addColorStop(1, st.color);
        g.fillStyle = bg2; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,.55)'; for (var h2 = 0; h2 < 3; h2++) { var an = b.rot + h2 * 0.5; g.beginPath(); g.arc(bx + Math.cos(an) * br * 0.45, by + Math.sin(an) * br * 0.45, br * 0.13, 0, Math.PI * 2); g.fill(); }   // 指の穴(回る)
      }
      if (st.phase === 'aim') {   // 曲がり方の 目安(点線)
        g.setLineDash([6, 8]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath();
        var sx = b.x, sy = b.y, vx = Math.sin(st.ang) * st.speed, vy = Math.cos(st.ang) * st.speed; g.moveTo(lx + sx * lw, Y(sy));
        for (var t = 0; t < 1.5; t += 0.04) { vx += st.dir * st.spin * 0.16 * Math.max(0, Math.min(1.4, (sy - 1.0) / 2.4)) * 0.04; sx += vx * 0.04; sy += vy * 0.04;
          if (sx - b.r < 0 || sx + b.r > 1) { sx = sx < 0.5 ? b.r : 1 - b.r; vx = -vx * 0.88 + (sx < 0.5 ? 0.1 : -0.1); }   // かべで 跳ね返る所も 見せる
          g.lineTo(lx + sx * lw, Y(sy)); }
        g.stroke(); g.setLineDash([]);
        var ax = bx + Math.sin(st.ang) * br * 3.2, ay = by - Math.cos(st.ang) * br * 3.2;   // 向きの矢印
        g.save(); g.translate(ax, ay); g.rotate(st.ang); g.fillStyle = '#ffd23f'; g.strokeStyle = '#3a2210'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -br * 1.1); g.lineTo(-br * 0.8, br * 0.3); g.lineTo(-br * 0.3, br * 0.3); g.lineTo(-br * 0.3, br * 1.2); g.lineTo(br * 0.3, br * 1.2); g.lineTo(br * 0.3, br * 0.3); g.lineTo(br * 0.8, br * 0.3); g.closePath(); g.stroke(); g.fill(); g.restore();
        if (!st.aiming) { var hy = Math.max(8, Math.min(H * 0.36, by - br * 4.6 - 76));   // 説明の箱は ボールと矢印より上に(横向きで ボールに重なっていた 11-23)
          g.fillStyle = 'rgba(20,12,8,.78)'; g.fillRect(W / 2 - 150, hy, 300, 76); g.fillStyle = '#ffd23f'; g.font = 'bold 21px sans-serif'; g.textAlign = 'center'; g.fillText('👆 指で 向きを決めて', W / 2, hy + 32); g.fillText('はなすと 投げる!', W / 2, hy + 62); }
      }
      if (st.phase === 'look') { g.fillStyle = 'rgba(20,12,8,.7)'; g.fillRect(W / 2 - 110, 14, 220, 40); g.fillStyle = '#fbf3e4'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('ピンの並びを 見てね…', W / 2, 41); }
      if (st.msgT > 0) { g.fillStyle = '#fbf3e4'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(st.msg, W / 2, H * 0.4); }
    },
    pointer: function (k, p, type, e) {
      if (k.phase !== 'play') return;
      if (st.phase === 'look') { if (type === 'down') st.lookT = 99; return; }   // 見るのを とばす
      if (st.phase === 'aim') {   // 指を おいた方へ 投げる(ななめもOK)。はなすと 投げる
        var id = e && e.pointerId != null ? e.pointerId : 0;
        if (type === 'down') { if (st.aiming && st.pid !== id) return; st.pid = id; st.aiming = true; aimAt(p); return; }   // 2本目の指は 無視(先に離した指で 投げていた 11-23)
        if (st.aiming && st.pid !== id) return;
        else if (type === 'move' && st.aiming) aimAt(p);
        else if (type === 'cancel') st.aiming = false;   // 指が とりけされた(通知など)→ ねらい直し
        else if (type === 'up' && st.aiming) { st.aiming = false; var b = st.ball; b.vx = Math.sin(st.ang) * st.speed; b.vy = Math.cos(st.ang) * st.speed; st.phase = 'roll'; }
      }
    },
    result: function () { return st.down >= N_PIN ? '🎉 パーフェクト! 100本 ぜんぶ!' : st.down >= 80 ? 'すごい! もう少しで 100本!' : st.down >= 50 ? 'なかなか! 半分 こえた!' : '回転や 投げる場所を 変えてみよう'; }
  });
})();
