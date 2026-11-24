/* =====================================================================
   ミニゲーム「PK チャレンジ」(ノブさん 2026-11-24)
   10本 ける。入ったゴールの数が点数(最高 10)。
   1本の流れ:
     ① ねらい … ボールから ゴールへ 矢印が 左右に ゆれる → タップで 向きを決める(矢印は ゴールの中だけ を ゆれる)
     ② 強さ   … 右の 縦のゲージが 上下に 動く → タップで ける。上ほど 強い = ボールが 速い
     ③ シュート … キーパー(大きめ)が すごい速さで 左右に ランダムに 動いている。
                  ボールが 遅いほど キーパーが 追いつく(はやく 着くほど 入りやすい)。
                  ゲージの 一番上(MAX)で けったときは 100% ゴール(キーパーは 間に合わない)。
   MAX は せまく、ゲージは 速く、速さも とちゅうで 変わる → なかなか 押せない(ノブさん「なかなか 一番上で押せないくらい」)。
   スタート画面・点数の表示・おしまい画面は js/game-kit.js(わく)が受け持つ。単位は config.js の unit: 'ゴール'。
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 150, N = 10;
  var MAX_ZONE = 0.05;             // ゲージの 一番上の「MAX」の はば(全体の 5%)
  var T_SLOW = 1.05, T_FAST = 0.28; // ボールが ゴールに 着くまでの 時間(弱い〜強い)
  var K_HALF = 0.15;               // キーパーの 体の はば(ゴールの はば = 1 として 半分)
  var K_REACT = 0.2;               // キーパーが ボールに 気づくまで(秒)
  var K_CHASE = 0.5;               // キーパーが ボールを 追う 速さ(ゴールの はば / 秒)
  var AUTO = 6;                    // 押さずに これだけ たつと 自動で 決まる(秒)
  var st = null, tries = 0;
  function rnd2(seed) { return window.IZGAME._rngOf(seed); }

  /* 10本ぶんの 難しさ(だんだん 速くなる。とちゅうで 速さが ゆれる回も ある) */
  function plan(r) {
    var L = [];
    for (var i = 0; i < N; i++) {
      var p = i / (N - 1);
      L.push({
        aimPer: 0.95 - p * 0.35 + r() * 0.15,        // 矢印が 片道に かかる秒
        gPer: 0.62 - p * 0.2 + r() * 0.1,            // ゲージが 下→上に かかる秒
        gWob: r() < 0.35 + p * 0.4 ? 0.5 + r() * 0.5 : 0,   // ゲージの 速さが ゆれる 強さ(0 なら 一定)
        gWobF: 1.3 + r() * 1.7, gPh: r() * 6.28,
        kSpeed: 1.6 + p * 0.9 + r() * 0.4,           // キーパーが ふだん 動く 速さ(ゴールの はば / 秒)
        seed: r()
      });
    }
    return L;
  }

  window.IZGAME.register({
    id: 'pk', title: '⚽ PK チャレンジ', ver: 'ver.1', sec: SEC,
    maxScore: function () { return N; },
    intro: function () {
      return '<p>キーパーの すきまを ねらって <b>10本</b> シュート!</p>' +
        '<p>① 左右に ゆれる <b>矢印</b> を タップで止めて ねらいを決める<br>② 上下に動く <b>強さのゲージ</b> を タップで ける</p>' +
        '<p style="font-size:13px;opacity:.9">強いほど ボールが速くて 入りやすい。弱いと キーパーに 止められます。<br><b style="color:#ffe05a">いちばん上の MAX</b> で ければ 100% ゴール!(でも なかなか 押せません…)</p>';
    },
    init: function () { st = {}; },
    start: function (k, seed) {
      tries++;
      var r = rnd2(seed + ':pk:' + Date.now() + ':' + tries);
      st.r = r; st.rounds = plan(r); st.i = 0; st.res = []; st.goals = 0;
      st.kx = 0.5; st.kv = 0; st.kTgt = 0.5; st.kWait = 0; st.kArm = 0;
      newKick(k);
      if (window.__izgDebug) window.__izgDebug.pk = st;
    },
    update: function (k, dt) {
      var R = st.rounds[st.i] || st.rounds[N - 1];
      if (st.phase !== 'shot' && st.phase !== 'fb' && st.phase !== 'done') moveKeeper(R, dt);
      st.t += dt;
      if (st.phase === 'aim') {
        st.as += dt / R.aimPer;
        var a = st.as % 2; a = a < 1 ? a : 2 - a; st.aim = st.aDir > 0 ? a : 1 - a;
        if (st.t > AUTO) lockAim(k);
      } else if (st.phase === 'power') {
        var f = 1 + (R.gWob ? R.gWob * Math.sin(st.t * R.gWobF * 6.28 + R.gPh) : 0);
        st.gs += dt * Math.max(0.35, f) / R.gPer;
        var g = st.gs % 2; st.pow = g < 1 ? g : 2 - g;
        if (st.t > AUTO) kick(k);
      } else if (st.phase === 'shot') {
        var T = st.T, u = Math.min(1, st.t / T);
        st.bu = u;
        if (!st.max && st.t > K_REACT) {   // キーパーが ボールを 追う
          var d = st.tx - st.kx, step = K_CHASE * dt;
          st.kx += Math.abs(d) <= step ? d : Math.sign(d) * step;
          st.kArm = Math.min(1, st.kArm + dt * 4);
        } else if (st.max) { st.kx += st.kv * dt * 0.3; }
        if (u >= 1) finish(k);
      } else if (st.phase === 'fb') {
        if (st.t >= 1.15) {
          st.i++;
          if (st.i >= N) { st.phase = 'done'; st.t = 0; k.combo(''); st.endAt = k.t + 1.2; }
          else newKick(k);
        }
      } else if (st.phase === 'done') {
        if (st.endAt && k.t >= st.endAt) { st.endAt = 0; k.end(); }
      }
    },
    draw: function (k, g, W, H) {
      if (!st.rounds) { st.rounds = plan(rnd2('intro')); st.i = 0; st.res = []; st.kx = 0.5; st.kv = 0; st.kTgt = 0.3; st.kWait = 0; st.kArm = 0; st.phase = 'aim'; st.aim = 0.3; st.pow = 0.6; st.t = 0; st.as = 0; st.aDir = 1; }   // スタート前の 見本
      drawField(g, W, H);
      drawGoal(k, g, W, H);
      drawKeeper(k, g, W, H);
      drawBall(k, g, W, H);
      if (st.phase === 'aim' || st.phase === 'power') drawArrow(k, g, W, H);
      drawGauge(k, g, W, H);
      drawMarks(g, W, H);
      if (st.phase === 'fb' && st.fb) drawFb(g, W, H);
    },
    pointer: function (k, p, type) {
      if (type !== 'down' || k.phase !== 'play') return;
      tap(k);
    },
    key: function (k, key) { if (key === ' ' || key === 'Enter') tap(k); },
    result: function () {
      var mx = st.res.filter(function (x) { return x === 'max'; }).length;
      return (st.goals >= N ? '🏆 パーフェクト! 10本 全部 ゴール!' : st.goals >= 8 ? 'すごい! エースストライカー!' : st.goals >= 6 ? 'ナイス! いい ねらい!' : st.goals >= 4 ? 'まずまず。強さが カギ!' : 'ドンマイ! キーパーの 動きを よく見て!') +
        '<br>ゴール ' + st.goals + '本 / 10本' + (mx ? ' ・ MAX ' + mx + '回' : '');
    }
  });

  function tap(k) {
    if (st.phase === 'aim') lockAim(k);
    else if (st.phase === 'power') kick(k);
  }
  function newKick(k) {
    st.phase = 'aim'; st.t = 0; st.as = 0; st.aDir = st.r() < 0.5 ? 1 : -1; st.aim = st.aDir > 0 ? 0 : 1;
    st.pow = 0; st.gs = 0; st.bu = 0; st.fb = null; st.max = false; st.kArm = 0;
    k.combo((st.i + 1) + ' / ' + N);
  }
  function lockAim(k) {
    st.tx = 0.06 + st.aim * 0.88;   // ゴールの中の 横の位置(0〜1。ポストの すぐ内がわまで)
    st.phase = 'power'; st.t = 0; st.gs = 0;
  }
  function kick(k) {
    st.max = st.pow >= 1 - MAX_ZONE;
    st.T = st.max ? 0.22 : T_SLOW - (T_SLOW - T_FAST) * Math.pow(st.pow, 0.9);
    st.phase = 'shot'; st.t = 0;
    if (st.max) { k.flash('255,230,90', 0.7); k.shake(0.6); }
  }
  function finish(k) {
    var goal = st.max || Math.abs(st.tx - st.kx) > K_HALF + 0.035;   // 0.035 = ボールの 半分
    st.res.push(goal ? (st.max ? 'max' : 'goal') : 'save');
    if (goal) { st.goals++; k.add(1); }
    st.fb = goal ? (st.max ? { s: 'ゴラッソ!!', c: '#ffe05a' } : { s: 'ゴール!', c: '#9cf07a' }) : { s: 'セーブされた…', c: '#ff8a6a' };
    if (goal) k.flash(st.max ? '255,220,80' : '160,255,140', st.max ? 1.2 : 0.6); else k.shake(0.8);
    st.phase = 'fb'; st.t = 0;
  }
  /* キーパーの ふだんの動き: 行き先を ランダムに 決めて すごい速さで 動く。ときどき 止まる・急に 逆へ */
  function moveKeeper(R, dt) {
    if (st.kWait > 0) { st.kWait -= dt; st.kv = 0; return; }
    var d = st.kTgt - st.kx, sp = R.kSpeed * (0.8 + 0.4 * Math.abs(Math.sin(st.t * 3.1)));
    if (Math.abs(d) < 0.02) {
      var q = st.r();
      if (q < 0.25) st.kWait = 0.08 + st.r() * 0.25;          // 一瞬 止まる
      st.kTgt = 0.12 + st.r() * 0.76;
      if (q > 0.85) st.kTgt = st.kx < 0.5 ? 0.82 + st.r() * 0.06 : 0.12 + st.r() * 0.06;   // 端から端へ 一気に
      return;
    }
    st.kv = Math.sign(d) * sp;
    st.kx += Math.abs(d) <= sp * dt ? d : st.kv * dt;
  }

  /* ---------- 絵 ---------- */
  function geo(W, H) {   // ゴール・ボールの 位置(縦長の 画面)
    var gw = Math.min(W * 0.86, H * 0.62), gh = gw * 0.36, gx = (W - gw) / 2, gy = H * 0.2;
    return { gw: gw, gh: gh, gx: gx, gy: gy, bx: W / 2, by: H * 0.8, br: Math.max(10, gw * 0.045) };
  }
  function drawField(g, W, H) {
    var G = geo(W, H);
    g.fillStyle = '#1b2a3c'; g.fillRect(-10, 0, W + 20, G.gy - G.gh * 0.15);   // 夜空
    // 観客(点々)
    for (var i = 0; i < 70; i++) { var x = (i * 53.7) % (W + 20) - 10, y = G.gy * 0.25 + ((i * 37) % 23) / 23 * G.gy * 0.45; g.fillStyle = ['#e8503c', '#f2e6c8', '#4a8ad8', '#ffd23f'][i % 4]; g.globalAlpha = 0.55; g.beginPath(); g.arc(x, y, 3, 0, 6.28); g.fill(); }
    g.globalAlpha = 1;
    // 芝(しま)
    var top = G.gy - G.gh * 0.15;
    for (var s = 0; s < 8; s++) { var y0 = top + (H - top) * Math.pow(s / 8, 1.35), y1 = top + (H - top) * Math.pow((s + 1) / 8, 1.35); g.fillStyle = s % 2 ? '#3f9a46' : '#48a94f'; g.fillRect(-10, y0, W + 20, y1 - y0 + 1); }
    // ペナルティエリアの 線
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-10, G.gy + G.gh + 4); g.lineTo(W + 10, G.gy + G.gh + 4); g.stroke();
    g.beginPath(); g.moveTo(G.gx - G.gw * 0.25, G.gy + G.gh + 4); g.lineTo(G.gx - G.gw * 0.45, H * 0.62); g.lineTo(G.gx + G.gw * 1.45, H * 0.62); g.lineTo(G.gx + G.gw * 1.25, G.gy + G.gh + 4); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(G.bx, G.by + G.br * 0.9, 5, 2.5, 0, 0, 6.28); g.fill();   // ペナルティマーク
  }
  function drawGoal(k, g, W, H) {
    var G = geo(W, H);
    // ネット
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(G.gx, G.gy, G.gw, G.gh);
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
    for (var i = 1; i < 18; i++) { var x = G.gx + G.gw * i / 18; g.beginPath(); g.moveTo(x, G.gy); g.lineTo(x, G.gy + G.gh); g.stroke(); }
    for (var j = 1; j < 7; j++) { var y = G.gy + G.gh * j / 7; g.beginPath(); g.moveTo(G.gx, y); g.lineTo(G.gx + G.gw, y); g.stroke(); }
    // わく(ゴールのとき ネットが ゆれる)
    var wob = st.phase === 'fb' && st.fb && st.fb.c !== '#ff8a6a' ? Math.sin(st.t * 30) * Math.max(0, 1 - st.t * 2) * 4 : 0;
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(5, G.gw * 0.022); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(G.gx, G.gy + G.gh + 4); g.lineTo(G.gx, G.gy + wob); g.lineTo(G.gx + G.gw, G.gy - wob); g.lineTo(G.gx + G.gw, G.gy + G.gh + 4); g.stroke();
  }
  function drawKeeper(k, g, W, H) {
    var G = geo(W, H), kw = G.gw * K_HALF * 2, cx = G.gx + G.gw * st.kx, base = G.gy + G.gh + 2;
    var kh = G.gh * 1.02, u = kw / 100;
    var lean = Math.max(-0.35, Math.min(0.35, (st.kv || 0) * 0.08));
    g.save(); g.translate(cx, base); g.rotate(lean);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, kw * 0.45, 5, 0, 0, 6.28); g.fill();
    // 足
    g.strokeStyle = '#1a1a22'; g.lineCap = 'round'; g.lineWidth = 13 * u;
    g.beginPath(); g.moveTo(-12 * u, -kh * 0.38); g.lineTo(-22 * u, -4 * u); g.stroke();
    g.beginPath(); g.moveTo(12 * u, -kh * 0.38); g.lineTo(22 * u, -4 * u); g.stroke();
    // 体(大きめの オレンジの ユニフォーム)
    g.fillStyle = '#ff8a1e'; roundRect(g, -30 * u, -kh * 0.82, 60 * u, kh * 0.48, 14 * u); g.fill();
    g.fillStyle = '#1a1a22'; g.font = 'bold ' + Math.round(22 * u) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('1', 0, -kh * 0.52);
    // うで(ボールに 向かって 広げる)
    var arm = 0.55 + (st.kArm || 0) * 0.5 + 0.12 * Math.sin(k.t * 9);
    g.strokeStyle = '#ff8a1e'; g.lineWidth = 12 * u;
    [-1, 1].forEach(function (sd) {
      var hx = sd * (30 + 34 * arm) * u, hy = -kh * 0.78 - 26 * arm * u;
      g.beginPath(); g.moveTo(sd * 26 * u, -kh * 0.76); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(hx, hy, 10 * u, 0, 6.28); g.fill(); g.strokeStyle = '#2a8ad8'; g.lineWidth = 3 * u; g.stroke(); g.strokeStyle = '#ff8a1e'; g.lineWidth = 12 * u;   // 手ぶくろ
    });
    // 頭(はちまきの 大将ふう キーパー)
    var hy0 = -kh * 0.82 - 16 * u;
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(0, hy0, 17 * u, 0, 6.28); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(-17 * u, hy0 - 10 * u, 34 * u, 6 * u);   // はちまき
    g.fillStyle = '#e8402c'; g.beginPath(); g.arc(0, hy0 - 7 * u, 3 * u, 0, 6.28); g.fill();
    var look = Math.max(-1, Math.min(1, ((st.phase === 'shot' ? st.tx : 0.5) - st.kx) * 3));
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(-6 * u + look * 2 * u, hy0 + 2 * u, 2.6 * u, 0, 6.28); g.arc(6 * u + look * 2 * u, hy0 + 2 * u, 2.6 * u, 0, 6.28); g.fill();   // 目
    g.strokeStyle = '#1a120c'; g.lineWidth = 2.2 * u; g.beginPath();
    if (st.phase === 'fb' && st.fb && st.fb.c === '#ff8a6a') g.arc(0, hy0 + 8 * u, 5 * u, 0.15 * Math.PI, 0.85 * Math.PI);   // 止めた → にっこり
    else g.arc(0, hy0 + 13 * u, 4 * u, 1.15 * Math.PI, 1.85 * Math.PI);   // ふだんは きりっ
    g.stroke();
    g.restore();
  }
  function ballPos(G) {   // ボールの 今の 位置と 大きさ(手前 → ゴールへ 小さくなる)
    var u = st.phase === 'shot' || st.phase === 'fb' ? (st.bu || 0) : 0;
    var tx = G.gx + G.gw * (st.tx == null ? 0.5 : st.tx), ty = G.gy + G.gh * (st.max ? 0.22 : 0.55);
    var e = 1 - Math.pow(1 - u, 1.4);
    var x = G.bx + (tx - G.bx) * e, y = G.by + (ty - G.by) * e - Math.sin(u * Math.PI) * G.gh * 0.25;
    var saved = st.phase === 'fb' && st.fb && st.fb.c === '#ff8a6a';
    if (saved) { x = G.gx + G.gw * st.kx + (st.tx - st.kx) * G.gw * 0.4; y = G.gy + G.gh * 0.9 + st.t * G.gh * 0.6; }   // はじかれて 下へ
    return { x: x, y: y, r: G.br * (1 - 0.45 * e), u: u };
  }
  function drawBall(k, g, W, H) {
    var G = geo(W, H), b = ballPos(G);
    if (st.phase === 'shot' && st.max) {   // MAX の ボールは 炎の しっぽ
      g.fillStyle = 'rgba(255,170,40,.45)'; g.beginPath(); g.moveTo(b.x - b.r, b.y); g.lineTo(G.bx, G.by + G.br); g.lineTo(b.x + b.r, b.y); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(b.x, b.y + b.r * 0.9, b.r * 0.9, b.r * 0.3, 0, 0, 6.28); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.28); g.fill();
    g.strokeStyle = '#1a1a22'; g.lineWidth = Math.max(1.5, b.r * 0.1); g.stroke();
    var rot = (st.phase === 'shot' ? st.t * 18 : 0);
    g.fillStyle = '#1a1a22';
    for (var i = 0; i < 5; i++) { var a = rot + i * 1.2566; g.beginPath(); g.arc(b.x + Math.cos(a) * b.r * 0.55, b.y + Math.sin(a) * b.r * 0.55, b.r * 0.22, 0, 6.28); g.fill(); }
    g.beginPath(); g.arc(b.x, b.y, b.r * 0.26, 0, 6.28); g.fill();
  }
  function drawArrow(k, g, W, H) {
    var G = geo(W, H), aim = st.phase === 'aim' ? st.aim : (st.tx - 0.06) / 0.88;
    var tx = G.gx + G.gw * (0.06 + aim * 0.88), ty = G.gy + G.gh * 0.55;
    var sx = G.bx, sy = G.by - G.br * 1.4, ang = Math.atan2(ty - sy, tx - sx), len = Math.hypot(tx - sx, ty - sy) * 0.62;
    var ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
    g.save(); g.globalAlpha = st.phase === 'aim' ? 1 : 0.55;
    g.strokeStyle = '#ffe05a'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = '#ffe05a'; g.beginPath(); g.moveTo(ex + Math.cos(ang) * 22, ey + Math.sin(ang) * 22); g.lineTo(ex + Math.cos(ang + 2.4) * 18, ey + Math.sin(ang + 2.4) * 18); g.lineTo(ex + Math.cos(ang - 2.4) * 18, ey + Math.sin(ang - 2.4) * 18); g.closePath(); g.fill();
    // ねらう所(ゴールの中の 点線の まる)
    g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,224,90,.9)'; g.lineWidth = 2.5; g.beginPath(); g.arc(tx, ty, G.br * 0.8, 0, 6.28); g.stroke(); g.setLineDash([]);
    g.restore();
    if (st.phase === 'aim') label(g, '👆 タップで ねらいを決める', W / 2, G.by + G.br * 3.2, 20, '#fbf3e4');
  }
  function drawGauge(k, g, W, H) {
    var G = geo(W, H), gw = 30, gh = H * 0.3, gx = W - gw - Math.max(16, W * 0.05), gy = H * 0.5;
    g.fillStyle = 'rgba(20,14,8,.65)'; roundRect(g, gx - 8, gy - 30, gw + 16, gh + 40, 12); g.fill();
    var gr = g.createLinearGradient(0, gy + gh, 0, gy);
    gr.addColorStop(0, '#3a6ad8'); gr.addColorStop(0.5, '#3ad070'); gr.addColorStop(0.85, '#e8b030'); gr.addColorStop(0.95, '#e8402c'); gr.addColorStop(1, '#e8402c');
    g.fillStyle = gr; roundRect(g, gx, gy, gw, gh, 8); g.fill();
    g.fillStyle = '#ffe05a'; g.fillRect(gx - 4, gy, gw + 8, gh * MAX_ZONE);   // MAX の はば
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('MAX', gx + gw / 2, gy - 12);
    var on = st.phase === 'power' || st.phase === 'shot' || st.phase === 'fb';
    if (on) {
      var my = gy + gh * (1 - st.pow);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#1a120c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(gx - 4, my); g.lineTo(gx - 18, my - 10); g.lineTo(gx - 18, my + 10); g.closePath(); g.stroke(); g.fill();
      g.fillRect(gx - 3, my - 3, gw + 6, 6); g.strokeRect(gx - 3, my - 3, gw + 6, 6);
    }
    if (st.phase === 'power') label(g, '💥 タップで ける!', W / 2, G.by + G.br * 3.2, 22, '#ffe05a');
  }
  function drawMarks(g, W, H) {   // 10本の 結果(下の まん中。左下は わくの「やめる」ボタン)
    var y = H - 70, n = N;   // 左下の「やめる」に かからない 高さ
    for (var i = 0; i < n; i++) {
      var x = W / 2 + (i - (n - 1) / 2) * 20, r = st.res[i];
      g.fillStyle = r === 'max' ? '#ffe05a' : r === 'goal' ? '#9cf07a' : r === 'save' ? '#ff6a5a' : (i === st.i ? '#fbf3e4' : 'rgba(255,255,255,.3)');
      g.beginPath(); g.arc(x, y, r || i !== st.i ? 6 : 7, 0, 6.28); g.fill();
      if (r === 'save') { g.strokeStyle = '#1a120c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3); g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3); g.stroke(); }
    }
  }
  function drawFb(g, W, H) {
    var a = Math.min(1, st.t / 0.12), big = st.fb.s === 'ゴラッソ!!';
    g.save(); g.globalAlpha = a;
    label(g, st.fb.s, W / 2, H * 0.52, big ? 46 : 38, st.fb.c);
    g.restore();
  }
  function label(g, s, x, y, sz, col) {
    g.font = 'bold ' + sz + 'px "Hiragino Sans","Noto Sans JP",sans-serif'; g.textAlign = 'center'; g.lineWidth = Math.max(4, sz * 0.18); g.strokeStyle = 'rgba(20,12,8,.85)'; g.lineJoin = 'round';
    g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
})();
