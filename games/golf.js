/* =====================================================================
   ミニゲーム「ナイスショット ゴルフ」(ノブさん 2026-11-22)
   左右に動く 目もりが 10回 出てくる。まん中で「打つ!」を押すほど 力が たまる。
   速さは まちまち: ゆっくり 1回・ふつう 1回・あとは 速い(とちゅうで 急に速くなる/ゆるむ/止まる/ゆれる)。
   毎回 ちがう並び(もう一回 でも 変わる)。10回 終わったら 打つ場面 → ボールが飛んで「〇〇ヤード」が点数(最高 390ヤード)。
   スタート画面・点数の表示・おしまい画面は js/game-kit.js(わく)が受け持つ。点数の単位は config.js の unit: 'ヤード'。
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 150, N = 10, MAX_YD = 390, PER = MAX_YD / N, SWEET = 0.035;   // SWEET: まん中の「ぴったり」の はば(目もり全体の 3.5%)
  var FAST = ['fast', 'fast', 'accel', 'brake', 'stop', 'wobble'];   // 速い回の 動き方(fast を 少し多めに)
  var st = null, tries = 0;

  /* 10回ぶんの 動き方を決める。ゆっくり1回・ふつう1回は 場所も ばらばら */
  function plan(r) {
    var L = [];
    for (var i = 0; i < N - 2; i++) L.push(FAST[Math.floor(r() * FAST.length)]);
    L.splice(Math.floor(r() * (L.length + 1)), 0, 'slow');
    L.splice(1 + Math.floor(r() * L.length), 0, 'normal');   // ふつうは 1回目には しない(ゆっくりの すぐ後に なりすぎないように)
    return L.map(function (type) {
      var per = { slow: 1.75, normal: 1.05, fast: 0.52 + r() * 0.22, accel: 0.8 + r() * 0.15, brake: 0.5 + r() * 0.12, stop: 0.55 + r() * 0.15, wobble: 0.6 + r() * 0.15 }[type];
      return { type: type, per: per, wait: 0.3 + r() * 0.9, dir: r() < 0.5 ? 1 : -1, stopAt: 0.2 + r() * 0.22, stopLen: 0.18 + r() * 0.2, wob: 1.6 + r() * 1.6, ph: r() * 6.28 };
    });
  }
  /* その回の 速さの倍率(pos = 目もりの位置 0〜1、t = 動きはじめてからの秒) */
  function speedOf(R, pos, t) {
    var c = Math.exp(-Math.pow((pos - 0.5) / 0.16, 2));   // まん中に 近いほど 1
    switch (R.type) {
      case 'accel': return 1 + 1.6 * c;           // まん中で 急に速くなる
      case 'brake': return 1.25 - 0.7 * c;        // まん中で ゆるむ(早く押しすぎる)
      case 'wobble': return 1 + 0.6 * Math.sin(t * R.wob * 6.28 + R.ph);   // 速くなったり 遅くなったり
      default: return 1;
    }
  }
  function grade(q) { return q >= 0.97 ? ['ナイスショット!', '#ffe05a'] : q >= 0.75 ? ['グッド!', '#9cf07a'] : q >= 0.4 ? ['まあまあ', '#f2e6d4'] : q > 0 ? ['おしい…', '#f0a070'] : ['ミス', '#ff7a6a']; }
  function rnd2(seed) { return window.IZGAME._rngOf(seed); }

  window.IZGAME.register({
    id: 'golf', title: '⛳ ナイスショット ゴルフ', ver: 'ver.1', sec: SEC,
    maxScore: function () { return MAX_YD; },
    intro: function () {
      return '<p>左右に動く 目もりが <b>10回</b> 出てきます。<br>まん中の <b style="color:#9cf07a">みどり</b> に来たときに <b>「打つ!」</b>(画面の どこでも OK)。<br>ぴったりなほど 力が たまって、ボールが 遠くへ 飛びます。</p>' +
        '<p style="font-size:13px;opacity:.85">速さは 毎回 ちがいます。とちゅうで 急に速くなったり、止まったりするのも…<br>10回 終わったら ショット! 最高 <b>390ヤード</b>。</p>';
    },
    init: function () { st = {}; },
    start: function (k, seed) {
      tries++;
      st.rounds = plan(rnd2(seed + ':golf:' + Date.now() + ':' + tries));   // 毎回 ちがう並び(ノブさん「リズムを毎回ランダムに」)
      st.i = 0; st.q = []; st.phase = 'wait'; st.t = 0; st.s = 0; st.pos = 0; st.fb = null; st.power = 0;
      st.swing = 0; st.hitAt = 0; st.flyT = 0; st.yards = 0; st.shown = 0; st.endAt = 0; st.trail = [];
      k.combo('1 / ' + N);
      if (window.__izgDebug) window.__izgDebug.golf = st;   // 確認用の道具だけが使う(ふだんは 何もしない)
    },
    update: function (k, dt) {
      var R = st.rounds[st.i];
      if (st.phase === 'wait') {   // 動きだす前の 間(毎回 ちがう長さ)
        st.t += dt; st.pos = R.dir > 0 ? 0 : 1;
        if (st.t >= R.wait) { st.phase = 'move'; st.t = 0; st.s = 0; st.stopped = 0; }
      } else if (st.phase === 'move') {
        st.t += dt;
        var f = speedOf(R, st.pos, st.t);
        if (R.type === 'stop') {   // まん中の 少し手前で 一瞬 止まる
          var near = R.dir > 0 ? st.pos > R.stopAt && st.pos < 0.5 : st.pos < 1 - R.stopAt && st.pos > 0.5;
          if (near && st.stopped < R.stopLen && st.s < 1) { st.stopped += dt; f = 0; }
        }
        st.s += dt * f / R.per;
        var p = st.s % 2; p = p < 1 ? p : 2 - p;   // 行って もどる
        st.pos = R.dir > 0 ? p : 1 - p;
        if (st.s >= 3) hit(k, -1);   // 1往復半 しても 押さなかった → ミス
      } else if (st.phase === 'fb') {   // 「ナイスショット!」などを 少し見せる
        st.t += dt;
        if (st.t >= 0.75) { st.i++; if (st.i >= N) { st.phase = 'swing'; st.t = 0; k.combo('⛳ ショット'); } else { st.phase = 'wait'; st.t = 0; k.combo((st.i + 1) + ' / ' + N); } }
      } else if (st.phase === 'swing') {   // テークバック → 打つ
        st.t += dt;
        if (st.t >= 1.15 && !st.hitAt) { st.hitAt = 1; k.flash('255,255,255', 1); k.shake(0.8); }   // カキーン
        if (st.t >= 1.7) { st.phase = 'fly'; st.flyT = 0; st.trail = []; }
      } else if (st.phase === 'fly') {
        st.flyT += dt;
        var y = Math.min(st.yards, Math.round(st.yards * Math.min(1, flyX(st.flyT) / Math.max(1, st.yards))));
        if (y > st.shown) { k.add(y - st.shown); st.shown = y; }
        if (st.flyT >= FLY_T + ROLL_T && !st.endAt) { if (st.shown < st.yards) { k.add(st.yards - st.shown); st.shown = st.yards; } st.endAt = k.t + 2.2; k.combo(''); if (st.yards >= 300) { k.flash('255,220,80', 1.2); } }
        if (st.endAt && k.t >= st.endAt) { st.phase = 'done'; k.end(); }
      }
    },
    draw: function (k, g, W, H) {
      if (!st.rounds) { st.rounds = plan(rnd2('intro')); st.i = 0; st.q = []; st.phase = 'intro'; st.pos = 0.3; st.power = 0; st.swing = 0; }   // スタート前の 見本
      if (st.phase === 'fly' || st.phase === 'done') drawFly(g, W, H);
      else drawTee(k, g, W, H);
    },
    pointer: function (k, p, type) {
      if (type !== 'down' || k.phase !== 'play') return;
      if (st.phase === 'move') hit(k, st.pos);
    },
    key: function (k, key) { if ((key === ' ' || key === 'Enter') && st.phase === 'move') hit(k, st.pos); },
    result: function () {
      var nice = st.q.filter(function (q) { return q >= 0.97; }).length;
      return (st.yards >= MAX_YD ? '🏆 パーフェクト! 390ヤード!' : st.yards >= 330 ? 'すごい! プロなみの 飛距離!' : st.yards >= 250 ? 'いい当たり!' : st.yards >= 150 ? 'まずまず。リズムを よく見て!' : 'ドンマイ! もう一回!') + '<br>ナイスショット ' + nice + '回 / 10回';
    }
  });

  function hit(k, pos) {   // pos = 押した所(−1 は 押さなかった)
    var d = pos < 0 ? 1 : Math.abs(pos - 0.5);
    var q = d <= SWEET ? 1 : Math.pow(Math.max(0, 1 - (d - SWEET) / 0.4), 1.6);
    st.q.push(q); st.power += q / N; st.hitPos = pos;
    var gr = grade(q); st.fb = { s: gr[0], c: gr[1], q: q };
    if (q >= 0.97) { k.flash('255,230,90', 0.6); }
    else if (q === 0) k.shake(0.5);
    st.phase = 'fb'; st.t = 0;
    if (st.q.length === N) st.yards = Math.round(st.q.reduce(function (a, b) { return a + b * PER; }, 0));
  }

  /* ---------- 打つ前の画面(コースと ゴルファーと 目もり) ---------- */
  function drawTee(k, g, W, H) {
    var hz = H * 0.42;
    var sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#5aa8e8'); sky.addColorStop(1, '#bfe2f6');
    g.fillStyle = sky; g.fillRect(-10, 0, W + 20, hz);
    g.fillStyle = '#7fb86a'; g.beginPath(); g.moveTo(-10, hz); g.quadraticCurveTo(W * 0.3, hz - H * 0.06, W * 0.6, hz - H * 0.015); g.quadraticCurveTo(W * 0.85, hz - H * 0.05, W + 10, hz); g.fill();   // 遠くの丘
    g.fillStyle = '#5a9a48'; g.fillRect(-10, hz, W + 20, H - hz);
    g.fillStyle = '#6fb456'; g.beginPath(); g.moveTo(W * 0.42, hz); g.lineTo(W * 0.58, hz); g.lineTo(W * 1.1, H); g.lineTo(-W * 0.1, H); g.closePath(); g.fill();   // フェアウェイ
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; for (var i = 1; i < 6; i++) { var yy = hz + (H - hz) * Math.pow(i / 6, 1.6); g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    // 旗(遠く)
    var fx = W * 0.53, fy = hz + 4; g.strokeStyle = '#eee'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 22); g.stroke(); g.fillStyle = '#e8402c'; g.beginPath(); g.moveTo(fx, fy - 22); g.lineTo(fx + 12, fy - 18); g.lineTo(fx, fy - 14); g.fill();
    // ゴルファー(力が たまるほど テークバックが 大きくなる)
    var gs = Math.min(W * 0.62, H * 0.42), gx = W * 0.5, gy = H * 0.97;
    var back = st.phase === 'swing' ? swingAng(st.t) : -0.25 - Math.min(1, st.power) * 1.6 - (st.phase === 'move' ? 0.06 * Math.sin(k.t * 6) : 0);
    drawGolfer(g, gx, gy, gs, back, st.phase === 'swing' && st.t > 1.15);
    // 目もり
    if (st.phase !== 'swing') drawGauge(k, g, W, H);
  }
  function swingAng(t) {   // テークバック(0〜0.75秒)→ ふり下ろし(0.75〜1.15)→ フォロー(〜1.7)
    var top = -2.6, start = -0.25 - Math.min(1, st.power) * 1.6;
    if (t < 0.75) { var u = t / 0.75; return start + (top - start) * (1 - Math.pow(1 - u, 2)); }
    if (t < 1.15) { var v = (t - 0.75) / 0.4; return top + (0.15 - top) * (v * v); }
    var w = Math.min(1, (t - 1.15) / 0.5); return 0.15 + (2.5 - 0.15) * (1 - Math.pow(1 - w, 2));
  }
  /* 正面から見た ゴルファー(右打ち: 打つ方向は 画面の右)。a = 腕の角度(0 = まっすぐ下、マイナス = 画面の左へ ふりあげる) */
  function drawGolfer(g, x, y, s, a, hitDone) {
    var u = s / 100;
    var ballX = x + 4 * u, ballY = y - 3 * u;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y - 1 * u, 30 * u, 6 * u, 0, 0, Math.PI * 2); g.fill();
    if (!hitDone) {   // ティーと ボール
      g.fillStyle = '#f2e6c8'; g.fillRect(ballX - 1 * u, ballY, 2 * u, 4 * u);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ballX, ballY - 2.6 * u, 2.8 * u, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke();
    }
    var hip = { x: x, y: y - 46 * u }, sh = { x: x, y: y - 74 * u };
    var tw = Math.max(-0.35, Math.min(0.35, a * 0.14));   // 体の ひねり
    // 足
    g.strokeStyle = '#3a3f55'; g.lineCap = 'round'; g.lineWidth = 9 * u;
    g.beginPath(); g.moveTo(hip.x - 6 * u, hip.y); g.lineTo(x - 15 * u, y - 22 * u); g.lineTo(x - 17 * u, y - 4 * u); g.stroke();
    g.beginPath(); g.moveTo(hip.x + 6 * u, hip.y); g.lineTo(x + 15 * u, y - 22 * u); g.lineTo(x + 17 * u, y - 4 * u); g.stroke();
    g.fillStyle = '#f4f2ee'; [-1, 1].forEach(function (sd) { g.beginPath(); g.ellipse(x + sd * 19 * u, y - 3 * u, 7 * u, 3.5 * u, 0, 0, Math.PI * 2); g.fill(); });   // くつ
    // 体
    g.fillStyle = '#e8503c'; g.beginPath(); g.moveTo(sh.x - 15 * u + tw * 10 * u, sh.y); g.lineTo(sh.x + 15 * u + tw * 10 * u, sh.y); g.lineTo(hip.x + 11 * u, hip.y + 2 * u); g.lineTo(hip.x - 11 * u, hip.y + 2 * u); g.closePath(); g.fill();
    g.fillStyle = '#2a2a36'; g.fillRect(hip.x - 11 * u, hip.y - 2 * u, 22 * u, 5 * u);   // ベルト
    // 頭と帽子
    var hx = sh.x + tw * 6 * u, hy = sh.y - 13 * u;
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(hx, hy, 10 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(hx - 3.6 * u, hy + 1.5 * u, 1.3 * u, 0, Math.PI * 2); g.arc(hx + 3.6 * u, hy + 1.5 * u, 1.3 * u, 0, Math.PI * 2); g.fill();   // 目(ボールを見ている)
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(hx, hy - 2.5 * u, 10.6 * u, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();   // キャップ
    g.fillStyle = '#e8e8e8'; g.beginPath(); g.ellipse(hx, hy - 3 * u, 12 * u, 3 * u, 0, 0, Math.PI); g.fill();   // つば(前に出る)
    g.fillStyle = '#2a8a4a'; g.beginPath(); g.arc(hx, hy - 8 * u, 1.6 * u, 0, Math.PI * 2); g.fill();
    // 腕と クラブ(肩の まん中を 中心に まわる)
    var pv = { x: sh.x + tw * 4 * u, y: sh.y + 4 * u }, L1 = 34 * u;
    var hand = { x: pv.x + Math.sin(a) * L1, y: pv.y + Math.cos(a) * L1 };
    g.strokeStyle = '#f0c8a0'; g.lineWidth = 7 * u;
    g.beginPath(); g.moveTo(sh.x - 13 * u + tw * 10 * u, sh.y + 3 * u); g.lineTo(hand.x, hand.y); g.stroke();
    g.beginPath(); g.moveTo(sh.x + 13 * u + tw * 10 * u, sh.y + 3 * u); g.lineTo(hand.x, hand.y); g.stroke();
    var hinge = a < -0.4 ? Math.min(1.4, (-a - 0.4) * 0.9) : a > 0.6 ? -Math.min(1.2, (a - 0.6) * 0.8) : 0;   // 手首の 折れ
    var ca = a - hinge, L2 = 46 * u;
    var head = { x: hand.x + Math.sin(ca) * L2, y: hand.y + Math.cos(ca) * L2 };
    g.strokeStyle = '#c8ccd4'; g.lineWidth = 2.6 * u; g.beginPath(); g.moveTo(hand.x, hand.y); g.lineTo(head.x, head.y); g.stroke();
    g.fillStyle = '#3a3a44'; g.beginPath(); g.ellipse(head.x, head.y, 6 * u, 3.4 * u, ca, 0, Math.PI * 2); g.fill();   // クラブの頭
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(hand.x, hand.y, 4 * u, 0, Math.PI * 2); g.fill();   // 手袋
  }
  function drawGauge(k, g, W, H) {
    var gw = Math.min(W * 0.86, 420), gh = 34, gx = (W - gw) / 2, gy = H * 0.14;
    g.fillStyle = 'rgba(20,14,8,.72)'; roundRect(g, gx - 10, gy - 30, gw + 20, gh + 70, 14); g.fill();
    var gr = g.createLinearGradient(gx, 0, gx + gw, 0);
    gr.addColorStop(0, '#c83a2a'); gr.addColorStop(0.3, '#e8b030'); gr.addColorStop(0.44, '#8ad050'); gr.addColorStop(0.5, '#3ad070'); gr.addColorStop(0.56, '#8ad050'); gr.addColorStop(0.7, '#e8b030'); gr.addColorStop(1, '#c83a2a');
    g.fillStyle = gr; roundRect(g, gx, gy, gw, gh, 10); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(gx + gw * (0.5 - SWEET), gy - 3, gw * SWEET * 2, 3); g.fillRect(gx + gw * (0.5 - SWEET), gy + gh, gw * SWEET * 2, 3);   // ぴったりの はば
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(gx + gw / 2, gy - 6); g.lineTo(gx + gw / 2, gy + gh + 6); g.stroke();
    // 何回目か(10個の丸)
    for (var i = 0; i < N; i++) {
      var cx = gx + gw / 2 + (i - (N - 1) / 2) * 20, cy = gy - 16, q = st.q[i];
      g.fillStyle = q == null ? (i === st.i ? '#fbf3e4' : 'rgba(255,255,255,.25)') : grade(q)[1];
      g.beginPath(); g.arc(cx, cy, i === st.i && q == null ? 6 : 5, 0, Math.PI * 2); g.fill();
    }
    // 動く 目じるし
    var showPos = st.phase === 'fb' ? (st.hitPos < 0 ? -1 : st.hitPos) : st.pos;
    if (showPos >= 0 && st.phase !== 'intro_') {
      var mx = gx + gw * showPos;
      g.fillStyle = '#ffffff'; g.strokeStyle = '#1a120c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(mx, gy + gh * 0.5); g.lineTo(mx - 11, gy - 12); g.lineTo(mx + 11, gy - 12); g.closePath(); g.stroke(); g.fill();
      g.fillRect(mx - 3, gy - 2, 6, gh + 4); g.strokeRect(mx - 3, gy - 2, 6, gh + 4);
    }
    // 力のたまり
    var pw = gw * 0.62, px = (W - pw) / 2, py = gy + gh + 16;
    g.fillStyle = 'rgba(255,255,255,.18)'; roundRect(g, px, py, pw, 10, 5); g.fill();
    g.fillStyle = '#ffd23f'; roundRect(g, px, py, Math.max(10, pw * Math.min(1, st.power)), 10, 5); g.fill();
    g.fillStyle = '#fbf3e4'; g.font = 'bold 12px sans-serif'; g.textAlign = 'right'; g.fillText('パワー', px - 6, py + 9);
    // ひとこと
    if (st.phase === 'fb' && st.fb) {
      var a = Math.min(1, st.t / 0.12), sz = st.fb.q >= 0.97 ? 34 : 28;
      g.save(); g.globalAlpha = a; g.font = 'bold ' + sz + 'px sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(20,12,8,.8)';
      g.strokeText(st.fb.s, W / 2, gy + gh + 70); g.fillStyle = st.fb.c; g.fillText(st.fb.s, W / 2, gy + gh + 70); g.restore();
    }
    if (st.phase === 'wait' || st.phase === 'move') {   // 打つボタン(画面の どこを押しても よい)
      var bw = Math.min(W * 0.5, 220), bh = 58, bx = (W - bw) / 2, by = gy + gh + 40;   // 目もりの すぐ下(人に 重ならない)
      g.fillStyle = st.phase === 'move' ? '#d9442e' : 'rgba(217,68,46,.45)'; roundRect(g, bx, by, bw, bh, 29); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('⛳ 打つ!', W / 2, by + 39);
    }
  }

  /* ---------- 飛んでいく画面 ---------- */
  var FLY_T = 2.8, ROLL_T = 0.9;
  function flyX(t) {   // 飛んだ距離(ヤード)。キャリー 88% + ころがり 12%
    var Y = st.yards, carry = Y * 0.88;
    if (t <= FLY_T) return carry * (t / FLY_T);
    var u = Math.min(1, (t - FLY_T) / ROLL_T); return carry + (Y - carry) * (1 - Math.pow(1 - u, 2));
  }
  function flyH(t) {   // 高さ(ヤード)
    if (t > FLY_T) { var u = (t - FLY_T) / ROLL_T; return u < 0.35 ? Math.sin(u / 0.35 * Math.PI) * 3 : 0; }   // 1回 はねる
    var p = t / FLY_T, apex = 12 + st.yards * 0.09; return 4 * apex * p * (1 - p);
  }
  function drawFly(g, W, H) {
    var t = st.flyT, bx = flyX(t), bh = flyH(t);
    var view = 150, sc = W / view, gy = H * 0.72;
    var cam = Math.max(0, bx - view * 0.45);
    var sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#4a9ce0'); sky.addColorStop(1, '#cfeaf8');
    g.fillStyle = sky; g.fillRect(-10, 0, W + 20, gy);
    // 雲(ゆっくり 流れる)
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (var c = 0; c < 6; c++) { var cx = ((c * 97 - cam * 0.4 * sc) % (W + 160) + W + 160) % (W + 160) - 80, cy = H * (0.1 + (c % 3) * 0.08); g.beginPath(); g.ellipse(cx, cy, 34, 12, 0, 0, Math.PI * 2); g.ellipse(cx + 22, cy - 6, 22, 10, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5a9a48'; g.fillRect(-10, gy, W + 20, H - gy);
    g.fillStyle = '#6fb456'; g.fillRect(-10, gy, W + 20, (H - gy) * 0.45);   // フェアウェイ
    // 距離の目じるし(50ヤードごと)
    g.textAlign = 'center';
    for (var y = 50; y <= 400; y += 50) {
      var x = (y - cam) * sc; if (x < -40 || x > W + 40) continue;
      g.fillStyle = y % 100 ? '#f2f2f2' : '#ffd23f'; g.fillRect(x - 2, gy - 26, 4, 30);
      g.font = 'bold 14px sans-serif'; g.fillStyle = 'rgba(20,40,20,.85)'; g.fillText(y + 'y', x, gy + 26);
    }
    // グリーンと旗(390ヤードの先)
    var gx2 = (395 - cam) * sc; if (gx2 > -80 && gx2 < W + 80) { g.fillStyle = '#86d070'; g.beginPath(); g.ellipse(gx2, gy + 6, 50, 9, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 2; g.beginPath(); g.moveTo(gx2, gy + 4); g.lineTo(gx2, gy - 40); g.stroke(); g.fillStyle = '#e8402c'; g.beginPath(); g.moveTo(gx2, gy - 40); g.lineTo(gx2 + 18, gy - 34); g.lineTo(gx2, gy - 28); g.fill(); }
    // ティー(0ヤード)
    var tx = (0 - cam) * sc; if (tx > -20) { g.fillStyle = '#f2e6c8'; g.fillRect(tx - 2, gy - 6, 4, 8); }
    // ボールの あと(点線)
    if (!st.trail.length || st.trail[st.trail.length - 1][0] < bx - 1) st.trail.push([bx, bh]);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath();
    st.trail.forEach(function (p, i) { var px = (p[0] - cam) * sc, py = gy - p[1] * sc; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
    var px = (bx - cam) * sc, py = gy - bh * sc;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(px, gy + 2, 6, 2, 0, 0, Math.PI * 2); g.fill();   // かげ
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py - 4, 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.stroke();
    // 飛んだ距離
    var shown = Math.round(Math.min(st.yards, bx));
    g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = 'rgba(20,12,8,.75)';
    var label = shown + ' ヤード'; g.strokeText(label, W / 2, H * 0.3); g.fillStyle = st.endAt ? '#ffe05a' : '#ffffff'; g.fillText(label, W / 2, H * 0.3);
    if (st.endAt) { g.font = 'bold 22px sans-serif'; g.lineWidth = 5; var s2 = st.yards >= MAX_YD ? '🏆 パーフェクト!' : st.yards >= 330 ? 'ナイスショット!' : st.yards >= 250 ? 'いい当たり!' : 'ドンマイ!'; g.strokeText(s2, W / 2, H * 0.3 + 36); g.fillStyle = '#fbf3e4'; g.fillText(s2, W / 2, H * 0.3 + 36); }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
})();
