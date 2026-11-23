/* =====================================================================
   ミニゲーム「ダーツ 10投勝負」(元: 単独のゲーム roguepink/darts → 居酒屋へ 2026-11-23)
   的は 左右に 動く。画面の どこを押しても、その瞬間に ダーツが まっすぐ上へ 一定の時間(T_FLY)で 飛ぶ。
   点は「着いた瞬間の、的の中心との 横のずれ」だけで決まる(運の ぶれは なし)。10投の合計。
   だんだん 速くなる → 7〜8投目は フェイント(急に止まる・逆に走る・速さが変わる)→ 9投目は 超高速 → 10投目は 得点2倍。
   直前のダーツに ほぼ同じ所で 当てると「ロビンフッド」+30点(めったに出ない おまけ)。

   元のゲームから 変えた所:
     ・音(WebAudio)は まるごと消した(お店の音と ぶつかるため)。振動は 残した
     ・題名画面・結果画面・ベスト記録・シェア・インストール画面・ミュート・アイコン/紹介画像の絵 は消した(わくが 受け持つ)
     ・合計点の表示は わくの 上の帯へ。何投目かは 上の帯の まん中(k.combo)。キャンバスには 10投の ますだけ 残した
     ・的の動き・フェイントの並びは k.rng(seed) で 1投ごとに 決める(同じ seed なら みんな同じ並び)
     ・のこりのダーツは 右下へ(左下は わくの「やめる」ボタンが あるため)
     ・1投に 10秒 待っても 投げなければ 自動で投げる(わくの 120秒の 打ち切りより 前に、必ず 10投 終わるように)
   ===================================================================== */
(function () {
  'use strict';
  var SEC = 120, LW = 360, DT = 1 / 60, N = 10;   // LW: 元のゲームの 横はば。この はばで 描いて、画面に 合わせて 拡大する
  var T_FLY = 0.46;                 // 手元から 的まで 飛ぶ時間(秒)。画面の高さが 変わっても 同じ → どのスマホでも 同じ難しさ
  var DART_X = 180;                 // ダーツが 飛ぶ 横の位置(まん中)
  var XL = 60, XR = 300;            // 的の中心が 動く はば
  var BOARD_R = 110;                // 的の半径(点が ある所)
  var ROBIN_PX = 0.6, ROBIN_PTS = 30;
  var AUTO = 10;                    // 1投に これだけ 待っても 投げないと 自動で投げる(秒)
  // [半径, 点, ことば]。中心からの 横のずれが この半径以内なら その点
  var RINGS = [[12, 50, 'ブル!'], [30, 30, 'ナイス!'], [56, 20, 'いいね!'], [83, 10, 'おしい!'], [110, 5, 'ギリギリ!']];
  var RANKS = [[450, 'プロ級'], [370, '上級'], [280, '中級'], [180, '初級'], [0, 'ビギナー']];
  var ROUND_MSG = ['1投目', '', '', 'スピードアップ!', '', '', '動きが かわるぞ!', 'フェイントに注意!', '超高速!', 'ラスト1投 得点2倍!'];
  var FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",sans-serif';
  var st = null;                    // 遊んでいる間の いろいろ(start で 毎回 作り直す)
  var V = { key: '' };              // 画面の大きさ・位置(画面の大きさが 変わったときだけ 計算しなおす)
  var probe = null;                 // iPhone の 下の 線(ホームの線)の 高さを 測る 見えない箱

  function rngOf(s) { return window.IZGAME._rngOf(s); }
  function ringOf(d) { d = Math.abs(d); for (var i = 0; i < RINGS.length; i++) if (d <= RINGS[i][0]) return i; return -1; }
  function rankOf(total) { for (var i = 0; i < RANKS.length; i++) if (total >= RANKS[i][0]) return RANKS[i]; return RANKS[RANKS.length - 1]; }

  /* ---------- ゲームの決まり(絵と 切りはなしてある → 試験でも そのまま使える) ---------- */
  function newGame(seed) {
    var r = rngOf('darts:' + seed);
    var S = { seed: String(seed), r: r, i: 0, phase: 'intro', phaseT: 0.8, t: 0, idle: 0, bx: 90 + r() * 180, dir: r() < 0.5 ? -1 : 1, v: 0, tgt: 0,
      pat: null, patT: 0, evT: 0, stopT: 0, dart: null, stuck: [], throws: [], total: 0, events: [] };
    setPattern(S, 0); S.v = S.dir * S.tgt;
    return S;
  }
  function setPattern(S, i) {   // 1投ごとに 別の 乱数(投げるのが 早い人も 遅い人も、その投の 動き方は 同じになる)
    var r = S.r = rngOf('darts:' + S.seed + ':' + i), k = 0.92 + r() * 0.16, p;
    if (i < 3) p = { type: 'const', speed: [120, 140, 160][i] * k };
    else if (i < 6) p = { type: 'const', speed: [200, 230, 260][i - 3] * k };
    else if (i < 8) p = { type: 'feint', speed: (210 + 30 * (i - 6)) * k };
    else if (i === 8) p = { type: 'zip', speed: 340 * k };
    else p = { type: 'last', speed: 250 * k };
    S.pat = p; S.patT = 0; S.evT = 0.6 + r() * 0.8; S.stopT = 0; S.tgt = p.speed;
  }
  function stepBoard(S, dt) {
    var p = S.pat, r = S.r; S.patT += dt;
    if (p.type === 'feint') {                       // 急に止まる・逆走する・速さが変わる
      if (S.stopT > 0) { S.stopT -= dt; S.tgt = 0; if (S.stopT <= 0) { S.tgt = p.speed * (0.8 + r() * 0.5); if (r() < 0.5) S.dir = -S.dir; } }
      else { S.evT -= dt; if (S.evT <= 0) { var q = r();
        if (q < 0.4) S.stopT = 0.3 + r() * 0.45; else if (q < 0.72) S.dir = -S.dir; else S.tgt = p.speed * (q < 0.86 ? 0.5 : 1.5);
        S.evT = 0.55 + r() * 0.9; } }
    } else if (p.type === 'zip') {                  // とても速い(折り返しは はしだけ。運だのみに しない)
      S.tgt = p.speed;
    } else if (p.type === 'last') {                 // 速くなったり 遅くなったり
      S.tgt = p.speed * (0.62 + 0.42 * Math.sin(S.patT * 2.4));
    } else S.tgt = p.speed;
    var tv = S.dir * S.tgt, acc = (p.type === 'feint' || p.type === 'zip') ? 2400 : 1200;
    if (S.v < tv) S.v = Math.min(tv, S.v + acc * dt); else S.v = Math.max(tv, S.v - acc * dt);
    S.bx += S.v * dt;
    if (S.bx < XL) { S.bx = 2 * XL - S.bx; S.v = Math.abs(S.v); S.dir = 1; }
    else if (S.bx > XR) { S.bx = 2 * XR - S.bx; S.v = -Math.abs(S.v); S.dir = -1; }
  }
  function toReady(S) { S.phase = 'ready'; S.idle = 0; S.events.push({ k: 'round', i: S.i }); }
  function step(S, dt) {
    S.t += dt; stepBoard(S, dt);
    if (S.phase === 'intro') { S.phaseT -= dt; if (S.phaseT <= 0) toReady(S); }
    else if (S.phase === 'ready') { S.idle += dt; if (S.idle >= AUTO) throwDart(S, true); }   // 待ちすぎたら 自動で投げる
    else if (S.phase === 'fly') { var d = S.dart; d.t += dt; if (d.t >= T_FLY) impact(S, S.bx - S.v * (d.t - T_FLY)); }
    else if (S.phase === 'after') { S.phaseT -= dt; if (S.phaseT <= 0) { S.i++;
      if (S.i >= N) { S.phase = 'done'; S.events.push({ k: 'done' }); }
      else { setPattern(S, S.i); toReady(S); } } }
  }
  function throwDart(S, auto) { if (S.phase !== 'ready') return false; S.phase = 'fly'; S.dart = { t: 0 }; S.events.push({ k: 'throw', auto: !!auto }); return true; }
  function impact(S, bxAt) {
    var rel = DART_X - bxAt, k = ringOf(rel), base = k >= 0 ? RINGS[k][1] : 0, mult = S.i === N - 1 ? 2 : 1, bonus = 0;
    var prevT = S.throws[S.throws.length - 1];
    if (k >= 0 && prevT && prevT.ring >= 0 && Math.abs(prevT.rel - rel) <= ROBIN_PX) bonus = ROBIN_PTS;
    var pts = base * mult + bonus;
    S.throws.push({ rel: rel, ring: k, base: base, mult: mult, bonus: bonus, pts: pts });
    S.total += pts;
    if (k >= 0) S.stuck.push({ rx: rel, tilt: (Math.random() - 0.5) * 0.3, robin: bonus > 0 });   // かたむきは 見た目だけ
    S.dart = null; S.phase = 'after'; S.phaseT = 0.6;
    S.events.push({ k: k >= 0 ? 'hit' : 'miss', ring: k, pts: pts, base: base, mult: mult, bonus: bonus, rel: rel });
  }

  /* ---------- 遊ぶ状態(演出) ---------- */
  function demo() { var d = fresh(newGame('demo')); d.S.phase = 'demo'; d.S.bx = DART_X; return d; }   // スタート前の 見本(止まった 的)
  function fresh(S) { return { S: S, acc: 0, fx: [], falls: [], wob: 0, flash: 0, shake: 0, banner: null, doneT: -1, hint: true, readyT: 0, now: 0 }; }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function addFx(f) {   // 同じ種類の 古い文字は 消してから 出す(続けて 当てると 文字が 二重に 重なっていた)
    for (var i = st.fx.length - 1; i >= 0; i--) if (st.fx[i].kind === f.kind) st.fx.splice(i, 1);
    st.fx.push(f);
  }
  function events(k) {   // できごと → 点数・演出
    var S = st.S;
    while (S.events.length) {
      var e = S.events.shift();
      if (e.k === 'throw') st.hint = false;
      else if (e.k === 'round') { var m = ROUND_MSG[e.i]; if (m) st.banner = { text: m, t: 0, big: e.i === N - 1 }; st.readyT = 0; k.combo((e.i + 1) + '投目'); }   // 上の帯は 小さいスマホで 切れるので 短く(10投の ますが 下にある)
      else if (e.k === 'hit') {
        k.add(e.pts); st.wob = 0.45; buzz(e.ring === 0 ? [20, 40, 30] : 15);
        var label = RINGS[e.ring][2]; if (e.mult > 1) label += ' ×2';
        addFx({ kind: 'pts', t: 0, text: '+' + e.pts, label: label, ring: e.ring, robin: e.bonus > 0 });
        if (e.ring === 0) { st.flash = 1; st.shake = 0.25; addFx({ kind: 'crowd', t: 0 }); }
        if (e.bonus) { st.flash = Math.max(st.flash, 0.8); if (e.ring !== 0) addFx({ kind: 'crowd', t: 0 }); }
      } else if (e.k === 'miss') {
        buzz(8);
        st.falls.push({ x: DART_X + 1, y: V.boardY + 2, vx: (e.rel > 0 ? -1 : 1) * 30, vy: 40, rot: 0, vr: (e.rel > 0 ? -1 : 1) * 4, t: 0 });
        addFx({ kind: 'pts', t: 0, text: '0', label: 'はずれ…', ring: -1 });
      } else if (e.k === 'done') st.doneT = 1.1;
    }
  }
  function fxStep(dt) {
    st.now += dt;
    if (st.wob > 0) st.wob = Math.max(0, st.wob - dt);
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 0.9);
    if (st.shake > 0) st.shake = Math.max(0, st.shake - dt);
    if (st.banner) { st.banner.t += dt; if (st.banner.t > 1.6) st.banner = null; }
    st.readyT += dt;
    for (var i = st.fx.length - 1; i >= 0; i--) { st.fx[i].t += dt; if (st.fx[i].t > 2) st.fx.splice(i, 1); }
    for (var j = st.falls.length - 1; j >= 0; j--) { var f = st.falls[j]; f.t += dt; f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.y > V.floorY + 30) { f.y = V.floorY + 30; f.vy *= -0.25; f.vx *= 0.5; f.vr *= 0.4; } if (f.t > 1.4) st.falls.splice(j, 1); }
  }
  function tryThrow() { if (st && st.S && throwDart(st.S)) st.hint = false; }

  /* ---------- 画面の大きさ ---------- */
  function safeBottom() {
    try {
      if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'; document.body.appendChild(probe); }
      return parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    } catch (e) { return 0; }
  }
  function fit(W, H, g) {   // 元の 論理の大きさ(横360)のまま、画面に いちばん大きく 入るように 拡大して まん中に置く
    var dpr = g.canvas.width / Math.max(1, W), key = W + 'x' + H + '@' + dpr;
    if (V.key === key) return;
    V.key = key; V.dpr = dpr;
    V.H = Math.max(600, Math.min(780, H / Math.max(1, W) * LW));
    V.SC = Math.min(W / LW, H / V.H); V.OX = (W - LW * V.SC) / 2; V.OY = (H - V.H * V.SC) / 2;
    V.x0 = -V.OX / V.SC - 4; V.x1 = (W - V.OX) / V.SC + 4; V.y0 = -V.OY / V.SC - 4; V.y1 = (H - V.OY) / V.SC + 4;   // 見えている はんい(よこ向きの 余白も 背景で うめる)
    V.bot = Math.min(40, safeBottom() / V.SC);
    V.top = 6;                                      // 10投の ますの 上
    V.boardY = Math.max(V.top + 166, V.H * 0.27);
    V.tipY = V.H - V.bot - 150;                     // 手元の ダーツの 先
    V.floorY = V.tipY - 118;
    V.colS = Math.max(V.SC, Math.min(1.1, (H - 20) / 260));   // 縦に並べるときの 大きさ(10個 × 26)
    V.col = V.SC < 0.8 && V.OX - 14 - 31 * V.colS >= 8;      // 横向きで 小さくなり、左に 余白が あるとき
    V.colX = V.OX - 14 - 31 * V.colS; V.colY = (H - (N * 26 - 4) * V.colS) / 2;
  }

  /* ---------- 絵(動かない物は 1回だけ描いて 使い回す) ---------- */
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function bgSprite(k, W, H) {
    var d = V.dpr;
    return k.sprite('darts-bg' + V.bot.toFixed(1), Math.round(W * d), Math.round(H * d), function (c) { c.setTransform(V.SC * d, 0, 0, V.SC * d, V.OX * d, V.OY * d); paintBackground(c); });
  }
  function boardSprite(k) {
    var pad = BOARD_R + 16, s = V.SC * V.dpr;
    return k.sprite('darts-board', pad * 2 * s, pad * 2 * s, function (c) { c.setTransform(s, 0, 0, s, pad * s, pad * s); paintBoard(c, BOARD_R); });
  }
  function dartSprite(k) {   // ダーツ1本(先が 上、羽根が 下)。いちばん大きく描く 1.2倍で 作っておく
    var s = 1.2 * V.SC * V.dpr;
    var c = k.sprite('darts-dart', 26 * s, 92 * s, function (x) { x.setTransform(s, 0, 0, s, 13 * s, 2 * s); paintDart(x); });
    c._u = s; return c;
  }
  function paintBackground(c) {
    var x0 = V.x0, x1 = V.x1, y0 = V.y0, y1 = V.y1, wd = x1 - x0, fy = V.floorY;
    // レンガの壁
    var g = c.createLinearGradient(0, y0, 0, fy);
    g.addColorStop(0, '#2a1218'); g.addColorStop(1, '#3a1a1c');
    c.fillStyle = g; c.fillRect(x0, y0, wd, fy - y0);
    var bh = 22, bw = 46;
    for (var row = Math.floor(y0 / bh) - 1; row * bh < fy; row++) {
      var y = row * bh, of = (row & 1) ? bw / 2 : 0;
      for (var col = Math.floor((x0 - of) / bw) - 1; col * bw + of < x1; col++) {
        var h = hash(row * 91 + col * 7);
        c.fillStyle = 'rgb(' + (78 + h * 34 | 0) + ',' + (34 + h * 14 | 0) + ',' + (32 + h * 10 | 0) + ')';
        c.fillRect(col * bw + of + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    c.fillStyle = 'rgba(10,3,6,.38)'; c.fillRect(x0, y0, wd, fy - y0);
    // 的の スポットライト
    var sp = c.createRadialGradient(LW / 2, V.boardY, 20, LW / 2, V.boardY, 260);
    sp.addColorStop(0, 'rgba(255,214,150,.30)'); sp.addColorStop(0.6, 'rgba(255,180,110,.10)'); sp.addColorStop(1, 'rgba(255,180,110,0)');
    c.fillStyle = sp; c.fillRect(x0, y0, wd, fy - y0);
    // ネオン(的の下の 左右の壁)
    var zoneTop = V.boardY + BOARD_R + 24, zoneBot = fy - 10, zh = zoneBot - zoneTop;
    if (zh > 40) {
      var sz = Math.min(1, zh / 110);
      neonGlass(c, 62, zoneTop + zh / 2, sz);
      neonText(c, 'ダーツ', 298, zoneTop + zh / 2, sz);
    }
    // 床(木)
    var fg = c.createLinearGradient(0, fy, 0, y1);
    fg.addColorStop(0, '#4a2a18'); fg.addColorStop(1, '#2a160c');
    c.fillStyle = fg; c.fillRect(x0, fy, wd, y1 - fy);
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x0, fy - 6, wd, 6);   // 壁と床の さかい
    c.save(); c.beginPath(); c.rect(x0, fy, wd, y1 - fy); c.clip();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5;
    var n = Math.min(120, Math.ceil(Math.max(LW / 2 - x0, x1 - LW / 2) / 8.4) + 2);
    for (var k = -n; k <= n; k++) { var dx = k * 70; c.beginPath(); c.moveTo(LW / 2 + dx * 0.12, fy); c.lineTo(LW / 2 + dx * 3, y1 + 300); c.stroke(); }
    c.strokeStyle = 'rgba(255,220,180,.06)';
    for (var yy = fy + 8, gap = 12; yy < y1; yy += gap, gap *= 1.35) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
    c.restore();
    // スローライン
    var ly = V.tipY + 108;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(132, ly - 1, LW - 264, 9);
    c.fillStyle = '#c9c2b8'; c.fillRect(136, ly, LW - 272, 5);
    // 周りを 少し暗く
    var vg = c.createRadialGradient(LW / 2, V.H * 0.45, V.H * 0.35, LW / 2, V.H * 0.45, V.H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(x0, y0, wd, y1 - y0);
  }
  function glowStroke(c, color, w, path) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.globalAlpha *= 0.18; var a = c.globalAlpha / 0.18;
    c.lineWidth = w * 4.2; path(); c.stroke();
    c.globalAlpha = a * 0.35; c.lineWidth = w * 2.2; path(); c.stroke();
    c.globalAlpha = a; c.lineWidth = w; path(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = w * 0.4; path(); c.stroke();
    c.restore();
  }
  function neonGlass(c, x, y, s) {
    glowStroke(c, '#ff4f9a', 3 * s, function () { c.beginPath();
      c.moveTo(x - 26 * s, y - 30 * s); c.lineTo(x + 26 * s, y - 30 * s); c.lineTo(x, y); c.closePath();
      c.moveTo(x, y); c.lineTo(x, y + 28 * s); c.moveTo(x - 16 * s, y + 30 * s); c.lineTo(x + 16 * s, y + 30 * s);
      c.moveTo(x + 10 * s, y - 30 * s); c.lineTo(x + 26 * s, y - 50 * s); });
    glowStroke(c, '#7dff8a', 2.5 * s, function () { c.beginPath(); c.arc(x - 8 * s, y - 19 * s, 5 * s, 0, 6.283); });
  }
  function neonText(c, t, x, y, s) {
    c.save(); c.font = '900 ' + Math.round(26 * s) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    var chars = t.split(''), lh = 30 * s, y0 = y - (chars.length - 1) * lh / 2;
    chars.forEach(function (ch, i) {
      c.shadowColor = '#3ef0ff'; c.shadowBlur = 14 * s; c.fillStyle = '#3ef0ff'; c.fillText(ch, x, y0 + i * lh);
      c.shadowBlur = 4 * s; c.fillStyle = '#d9fdff'; c.fillText(ch, x, y0 + i * lh);
    });
    c.restore();
  }
  function paintBoard(c, R) {   // 中心(0,0)
    var seg = Math.PI * 2 / 20, a0 = -Math.PI / 2 - seg / 2;
    c.save();
    // ふち
    c.fillStyle = '#0d0d0f'; c.beginPath(); c.arc(0, 0, R + 13, 0, 6.283); c.fill();
    c.strokeStyle = '#9a9aa2'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, R + 12, 0, 6.283); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R + 8, -2.6, -0.6); c.stroke();
    function ring(r0, r1, colA, colB) {
      for (var s = 0; s < 20; s++) { c.fillStyle = s % 2 ? colB : colA; c.beginPath(); c.arc(0, 0, r1, a0 + s * seg, a0 + (s + 1) * seg); c.arc(0, 0, r0, a0 + (s + 1) * seg, a0 + s * seg, true); c.closePath(); c.fill(); }
    }
    ring(RINGS[3][0], RINGS[4][0], '#1c1a1a', '#efe2c0');
    ring(RINGS[2][0], RINGS[3][0], '#cc2a2e', '#1f8c4c');
    ring(RINGS[1][0], RINGS[2][0], '#1c1a1a', '#efe2c0');
    c.fillStyle = '#1f8c4c'; c.beginPath(); c.arc(0, 0, RINGS[1][0], 0, 6.283); c.fill();
    c.fillStyle = '#d8262f'; c.beginPath(); c.arc(0, 0, RINGS[0][0], 0, 6.283); c.fill();
    // 針金
    c.strokeStyle = 'rgba(214,214,220,.85)'; c.lineWidth = 1.1;
    for (var k = 0; k < RINGS.length; k++) { c.beginPath(); c.arc(0, 0, RINGS[k][0], 0, 6.283); c.stroke(); }
    c.lineWidth = 0.7; c.strokeStyle = 'rgba(214,214,220,.55)';
    for (var s2 = 0; s2 < 20; s2++) { var a = a0 + s2 * seg; c.beginPath(); c.moveTo(Math.cos(a) * RINGS[1][0], Math.sin(a) * RINGS[1][0]); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke(); }
    // つや
    var gl = c.createLinearGradient(-R, -R, R, R); gl.addColorStop(0, 'rgba(255,255,255,.10)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.18)');
    c.fillStyle = gl; c.beginPath(); c.arc(0, 0, R, 0, 6.283); c.fill();
    // 点数の数字(上と下)
    var labels = [[(RINGS[3][0] + RINGS[4][0]) / 2, '5', 19], [(RINGS[2][0] + RINGS[3][0]) / 2, '10', 17], [(RINGS[1][0] + RINGS[2][0]) / 2, '20', 16], [(RINGS[0][0] + RINGS[1][0]) / 2, '30', 12]];
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    labels.forEach(function (lb) {
      c.font = '900 ' + lb[2] + 'px ' + FONT;
      [-1, 1].forEach(function (sg) { c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(lb[1], 0, sg * lb[0] + 1); c.fillStyle = '#fff'; c.fillText(lb[1], 0, sg * lb[0] + 1); });
    });
    c.font = '900 10px ' + FONT; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText('50', 0, 0.5); c.fillStyle = '#fff'; c.fillText('50', 0, 0.5);
    c.restore();
  }
  function paintDart(c) {   // 先が(0,0)、からだは +y の向き。全長 約88
    c.fillStyle = '#d9dde3'; c.beginPath(); c.moveTo(0, 0); c.lineTo(1.7, 17); c.lineTo(-1.7, 17); c.closePath(); c.fill();   // 先(針)
    var bg = c.createLinearGradient(-5, 0, 5, 0); bg.addColorStop(0, '#4b4f57'); bg.addColorStop(0.45, '#e7eaee'); bg.addColorStop(1, '#3a3d44');   // バレル(にぎる所)
    c.fillStyle = bg; c.beginPath(); c.moveTo(-3, 16); c.lineTo(3, 16); c.lineTo(5, 22); c.lineTo(5, 40); c.lineTo(3, 45); c.lineTo(-3, 45); c.lineTo(-5, 40); c.lineTo(-5, 22); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(30,30,36,.55)'; c.lineWidth = 0.9; for (var gy = 24; gy <= 38; gy += 3.5) { c.beginPath(); c.moveTo(-5, gy); c.lineTo(5, gy); c.stroke(); }
    c.fillStyle = '#20161c'; c.fillRect(-2, 45, 4, 20);   // シャフト
    c.fillStyle = '#ff4f9a'; c.strokeStyle = '#5a1030'; c.lineWidth = 1.4;   // フライト(羽根)
    c.beginPath(); c.moveTo(0, 56); c.lineTo(12, 70); c.lineTo(12, 88); c.lineTo(0, 82); c.lineTo(-12, 88); c.lineTo(-12, 70); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(0, 62); c.lineTo(5, 70); c.lineTo(5, 80); c.lineTo(0, 77); c.closePath(); c.fill();
    c.fillStyle = '#ffe066'; c.beginPath(); c.arc(-7, 76, 2.4, 0, 6.283); c.fill();
  }
  function drawDart(g, spr, x, y, s, ang, sy, alpha) {
    g.save(); g.translate(x, y); if (ang) g.rotate(ang); g.scale(s, s * (sy || 1)); if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(spr, -13, -2, spr.width / spr._u, spr.height / spr._u);
    g.restore();
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function outlined(c, text, x, y, size, fill, stroke, lw, weight) {
    c.font = (weight || 900) + ' ' + size + 'px ' + FONT; c.lineJoin = 'round';
    c.lineWidth = lw || size * 0.18; c.strokeStyle = stroke || '#1b0a12'; c.strokeText(text, x, y); c.fillStyle = fill; c.fillText(text, x, y);
  }
  function drawHUD(g, S, live, col) {   // 10投の ます(合計点は わくの 上の帯に 出る)。col = 縦に並べる(横向きの画面)
    var cw = 31, gp = 3, x0 = (LW - (cw * N + gp * (N - 1))) / 2, y0 = V.top;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var i = 0; i < N; i++) {
      var x = col ? 0 : x0 + i * (cw + gp), t = S.throws[i], cur = live && i === S.i && S.phase !== 'done';
      if (col) y0 = i * 26;
      roundRect(g, x, y0, cw, 22, 6);
      g.fillStyle = t ? (t.ring === 0 ? 'rgba(255,210,58,.30)' : 'rgba(255,255,255,.14)') : 'rgba(0,0,0,.5)'; g.fill();
      g.lineWidth = cur ? 2.2 : 1; g.strokeStyle = cur ? '#ffe066' : 'rgba(255,255,255,.22)'; g.stroke();
      if (t) outlined(g, t.pts + '', x + cw / 2, y0 + 12, 13, t.ring === 0 ? '#ffd23a' : (t.pts ? '#fff' : '#9a8a90'), '#1b0a12', 3);
      else if (i === N - 1) { g.font = '900 11px ' + FONT; g.fillStyle = '#ff7fb6'; g.fillText('×2', x + cw / 2, y0 + 12); }
    }
  }
  function drawGame(k, g) {
    var S = st.S, now = st.now, LH = V.H, playing = k.phase === 'play', shown = k.phase !== 'ready';
    var spr = dartSprite(k);
    var sh = st.shake > 0 ? (Math.random() - 0.5) * 6 * st.shake / 0.25 : 0;   // ブルの ゆれ(見た目だけ)
    g.save(); g.translate(sh, sh * 0.6);
    // 的
    var wob = st.wob > 0 ? Math.sin(st.wob * 46) * 3.2 * (st.wob / 0.45) : 0;
    var bx = S.bx, by = V.boardY + wob;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(bx + 8, by + 12, BOARD_R + 12, BOARD_R + 10, 0, 0, 6.283); g.fill();
    if (st.flash > 0) {   // ブルの ネオン
      var fa = Math.min(1, st.flash) * (0.6 + 0.4 * Math.sin(now * 30));
      g.save(); g.globalAlpha = fa; glowStroke(g, '#ff4f9a', 4, function () { g.beginPath(); g.arc(bx, by, BOARD_R + 16, 0, 6.283); }); g.restore();
    }
    var pad = BOARD_R + 16;
    g.drawImage(boardSprite(k), bx - pad, by - pad, pad * 2, pad * 2);
    for (var i = 0; i < S.stuck.length; i++) {   // 刺さった ダーツ
      var d = S.stuck[i], x = bx + d.rx, y = by + (d.robin ? 7 : 0);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 5, y + 10, 5, 12, 0.2, 0, 6.283); g.fill();   // かげ
      drawDart(g, spr, x, y, 0.46, d.tilt, 0.78);
    }
    // ねらいの線(ダーツが 飛ぶ所)
    if (playing && S.phase === 'ready') {
      g.save(); g.setLineDash([3, 9]); g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(DART_X, V.tipY - 8); g.lineTo(DART_X, V.boardY + 12); g.stroke(); g.restore();
    }
    if (shown) {   // ねらいの印(的の高さ)
      g.save(); g.globalAlpha = S.phase === 'fly' ? 0.25 : 0.7; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(DART_X, V.boardY - BOARD_R - 30); g.lineTo(DART_X, V.boardY - BOARD_R - 18); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(DART_X - 7, V.boardY - BOARD_R - 22); g.lineTo(DART_X + 7, V.boardY - BOARD_R - 22); g.lineTo(DART_X, V.boardY - BOARD_R - 13); g.closePath(); g.fill();
      g.restore();
    }
    // 落ちる ダーツ(はずれ)
    st.falls.forEach(function (f) { drawDart(g, spr, f.x, f.y, 0.5, f.rot, 1, Math.max(0, 1 - f.t / 1.3)); });
    // バナー(「スピードアップ!」など)
    if (st.banner) {
      var b = st.banner, a = b.t < 0.15 ? b.t / 0.15 : (b.t > 1.25 ? Math.max(0, 1 - (b.t - 1.25) / 0.3) : 1), sc = b.t < 0.15 ? 0.6 + b.t / 0.15 * 0.4 : 1;
      var yb = Math.max(V.boardY + BOARD_R + 46, V.tipY - 96);
      g.save(); g.globalAlpha = a; g.translate(LW / 2, yb); g.scale(sc, sc);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      roundRect(g, -158, -27, 316, 54, 14); g.fillStyle = b.big ? 'rgba(120,10,50,.82)' : 'rgba(10,4,8,.7)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = b.big ? '#ff4f9a' : 'rgba(255,224,102,.6)'; g.stroke();
      outlined(g, b.text, 0, 1, b.big ? 27 : 28, b.big ? '#ffe066' : '#fff', '#1b0a12', 5);
      g.restore();
    }
    // 飛んでいる ダーツ
    if (S.dart) {
      var p = Math.min(1, S.dart.t / T_FLY), fy = V.tipY + (V.boardY - V.tipY) * p, s = 1.15 + (0.46 - 1.15) * p;
      g.save(); g.globalAlpha = 0.25; g.strokeStyle = '#fff'; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(DART_X, fy + 60 * s); g.lineTo(DART_X, Math.min(V.tipY + 40, fy + 60 * s + 70 * (1 - p * 0.5))); g.stroke(); g.restore();
      drawDart(g, spr, DART_X, fy, s, 0, 1);
    }
    // 手元の ダーツ
    if (playing && S.phase === 'ready') {
      var rt = Math.min(1, st.readyT / 0.18), bob = Math.sin(now * 3) * 1.5;
      drawDart(g, spr, DART_X, V.tipY + (1 - rt) * 40 + bob, 1.15, 0, 1, rt);
    }
    // のこりの ダーツ(右下。左下は わくの「やめる」ボタン)。横向きは 小さすぎるので 出さない(左の ますで 分かる)
    if (playing && !V.col) {
      var left = N - S.throws.length - (S.phase === 'ready' || S.phase === 'fly' ? 1 : 0);
      for (var j = 0; j < left; j++) drawDart(g, spr, LW - 22 - j * 11, LH - V.bot - 62, 0.5, -0.12, 1);
      if (left > 0) { g.textAlign = 'right'; g.textBaseline = 'middle'; outlined(g, 'のこり ' + left, LW - 14, LH - V.bot - 74, 13, '#fff', '#1b0a12', 3, 800); }
    }
    // 「タップで投げる」・自動で投げるまでの 秒読み
    if (playing && S.phase === 'ready') {
      var rest = AUTO - S.idle, msg = rest <= 3 ? 'あと ' + Math.ceil(rest) + '秒で 自動で投げるよ' : (st.hint && S.i === 0 ? '画面をタップで 投げる!' : '');
      if (msg) {
        g.save(); g.globalAlpha = 0.55 + 0.45 * Math.sin(now * 5); g.textAlign = 'center'; g.textBaseline = 'middle';
        outlined(g, msg, LW / 2, V.tipY - 32, 19, rest <= 3 ? '#ffe066' : '#fff', '#1b0a12', 5);
        g.restore();
      }
    }
    // 点の 飛び出し・歓声
    st.fx.forEach(function (f) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (f.kind === 'pts') {
        var a2 = f.t > 1.0 ? Math.max(0, 1 - (f.t - 1.0) / 0.35) : 1, pop = f.t < 0.12 ? 0.5 + f.t / 0.12 * 0.75 : (f.t < 0.22 ? 1.25 - (f.t - 0.12) / 0.1 * 0.25 : 1);
        var yy = V.boardY - 50 - Math.min(f.t, 0.6) * 30;
        g.save(); g.globalAlpha = a2; g.translate(DART_X, yy); g.scale(pop, pop);
        var col = f.ring === 0 ? '#ffd23a' : f.ring === 1 ? '#7dff8a' : f.ring < 0 ? '#c9b8c0' : '#ffffff';
        outlined(g, f.text, 0, 0, f.ring === 0 ? 46 : 40, col, '#1b0a12', 7);
        outlined(g, f.label, 0, f.ring === 0 ? -36 : -32, f.ring === 0 ? 24 : 20, f.ring === 0 ? '#fff' : col, '#1b0a12', 5);
        if (f.robin) { outlined(g, 'ロビンフッド!', 0, 34, 22, '#3ef0ff', '#1b0a12', 5); outlined(g, '(ダーツにダーツ! +' + ROBIN_PTS + ')', 0, 58, 13, '#fff', '#1b0a12', 3, 800); }
        g.restore();
      } else if (f.kind === 'crowd') {
        var a3 = f.t > 1.2 ? Math.max(0, 1 - (f.t - 1.2) / 0.4) : Math.min(1, f.t / 0.15);
        g.save(); g.globalAlpha = a3;
        outlined(g, 'おお〜!', 50, V.boardY - 40 - f.t * 14, 21, '#ffe066', '#1b0a12', 5);
        outlined(g, 'すごい!', LW - 50, V.boardY + 8 - f.t * 14, 19, '#ffe066', '#1b0a12', 5);
        g.restore();
      }
    });
    g.restore();
    if (shown && !V.col) drawHUD(g, S, playing, false);
  }

  window.IZGAME.register({
    id: 'darts', title: '🎯 ダーツ 10投勝負', ver: 'ver.1', sec: SEC,
    maxScore: function () { return 50 * (N - 1) + 50 * 2 + ROBIN_PTS * (N - 1); },   // 全部ブル(10投目は2倍)+ 2投目からの ロビンフッドが 全部(820)
    intro: function () {
      return '<p>画面の <b>どこを押しても</b> ダーツが飛ぶ!<br>的は 左右に 動く。まん中ほど 高い点<br>10投の 合計で勝負。<b style="color:#ff7fb6">ラスト1投は 2倍!</b></p>';
    },
    init: function () { st = demo(); },
    start: function (k, seed) {
      st = fresh(newGame(seed)); k.combo('1投目');
      if (window.__izgDebug) window.__izgDebug.darts = st;   // 確認用の道具だけが使う(ふだんは 何もしない)
    },
    update: function (k, dt) {
      var S = st.S, n = 0;
      st.acc += dt;
      while (st.acc >= DT && n < 20) { step(S, DT); events(k); st.acc -= DT; n++; }   // 1/60秒ずつ 進める(わくの 時計と ずれないように、遅いスマホでも 全部 進める)
      if (n >= 20) st.acc = 0;
      fxStep(dt);
      if (st.doneT > 0) { st.doneT -= dt; if (st.doneT <= 0) { st.doneT = -1; k.combo(''); k.end(); } }
    },
    draw: function (k, g, W, H) {
      if (!st) st = demo();   // わくは init の前にも 1回 描かせる(そのとき まだ 何もないので 見本を作る)
      fit(W, H, g);
      g.drawImage(bgSprite(k, W, H), 0, 0, W, H);
      g.save(); g.translate(V.OX, V.OY); g.scale(V.SC, V.SC);
      try { drawGame(k, g); } finally { g.restore(); }   // とちゅうで 失敗しても 拡大を 次の絵に 持ちこさない
      if (V.col && k.phase !== 'ready') {   // 横向き: 10投の ますを 左の 余白に 縦に 大きく(上に並べると 字が 7px ほどに なっていた)
        g.save(); g.translate(V.colX, V.colY); g.scale(V.colS, V.colS);
        try { drawHUD(g, st.S, k.phase === 'play', true); } finally { g.restore(); }
      }
    },
    pointer: function (k, p, type) { if (type === 'down' && k.phase === 'play') tryThrow(); },
    key: function (k, key) { if (key === ' ' || key === 'Enter') tryThrow(); },
    result: function () {
      var S = st.S;
      return S.throws.length + '投 合計 ' + S.total + '点 ・ ' + rankOf(S.total)[1];
    },
    stop: function () { if (probe) { probe.remove(); probe = null; } V.key = ''; st = null; },   // お店に もどったら 片づける
    _api: { newGame: newGame, step: step, throwDart: throwDart, ringOf: ringOf, rankOf: rankOf, RINGS: RINGS, T_FLY: T_FLY, DART_X: DART_X, DT: DT, AUTO: AUTO, V: V }   // 試し(tools)用
  });
})();
