/* =====================================================================
   ミニゲーム「真剣白刃取り 20本勝負」(ノブさん 2026-11-23。単独のゲーム roguepink/shirahadori を移した)
   相手がふりおろす刀を、手にとどく瞬間にタップして受け止める。1本にタップは1回。
   早すぎると「スキあり」、おそいと髪を切られる。相手は4人×5本=20本。受け止めた本数が点数(0〜20)。
   並び(相手のためる長さ・刀の速さ・フェイント・飛んでくる物)は seed で決める(同じ seed なら みんな同じ)。
   元の論理座標(幅360・高さ420〜780)のまま描き、画面に合わせて拡大して まん中に置く。
   音は使わない(お店の音とぶつかるため)。スタート画面・点数・おしまい画面は js/game-kit.js(わく)。
   ===================================================================== */
(function () {
'use strict';
var TAU = Math.PI * 2, W = 360, H = 700, N = 20, DT = 1 / 60;
var ctx = null, K = null;
var SC = 1, OX = 0, OY = 0, DPR = 1, CW = 0, CH = 0, VX = 0, VY = 0, VW = 0, VH = 0, BX0 = 0, BY0 = 0, BX1 = 0, BY1 = 0;
var L = { sc: 1, top: 0, left: 0, fy: 500 };
var INK = '#2a1712', SKIN = '#f6d3b2', SKIN2 = '#efc39c', HAIR = '#1c1411';
var FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
var FONT_M = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Noto Serif CJK JP",serif';

function rnd(a, b) { return a + Math.random() * (b - a); }   // 見た目だけ(火花・髪など)
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function shuf(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }

/* ===== 画面の大きさ(幅 360 で固定、高さは画面に合わせる。横向きは 低くして 字を大きく) ===== */
function layout(cw, ch) {
  CW = cw; CH = ch; DPR = Math.min(window.devicePixelRatio || 1, 2);
  H = Math.round(clamp(ch / Math.max(1, cw) * W, 420, 780));
  SC = Math.min(cw / W, ch / H) || 1; OX = (cw - W * SC) / 2; OY = (ch - H * SC) / 2;
  VX = -OX / SC; VY = -OY / SC; VW = cw / SC; VH = ch / SC;   // 画面全体(余白をふくむ)
  BX0 = Math.max(-60, VX - 8); BY0 = Math.max(-60, VY - 8); BX1 = Math.min(W + 60, VX + VW + 8); BY1 = Math.min(H + 60, VY + VH + 8);   // 背景を描く はんい
  var hudB = 60, botA = H >= 560 ? Math.max(96, H * 0.15) : Math.max(40, H * 0.1);
  var avail = H - hudB - botA, sc = clamp(avail / 470, 0.62, 1.12), extra = Math.max(0, avail - 470 * sc);
  L.sc = sc; L.left = W / 2 - 180 * sc; L.top = hudB + 20 * sc + extra * 0.55; L.fy = L.top + 434 * sc;
  bgKey = '';
}
function sx(x) { return L.left + x * L.sc; }
function sy(y) { return L.top + y * L.sc; }
function full() { ctx.fillRect(VX - 10, VY - 10, VW + 20, VH + 20); }

/* ===== 相手 ===== */
var OPPS = [
  { name: '見習い 剣太郎', no: '第一試合', line: 'よ、よろしくおねがいします!', look: 'kentaro', bg: 0,
    win: ['なにっ!?', 'す、すごい…', 'まいりました!'], lose: ['あっ、当たっちゃった!', 'ご、ごめんなさい!', 'スキあり…です!'] },
  { name: 'くせ者 チラ丸', no: '第二試合', line: 'ひっかかるなよ〜?', look: 'chiramaru', bg: 1,
    win: ['ちぇっ', '見破ったか', 'やるねぇ'], lose: ['ひっかかった〜', 'スキあり〜♪', 'まだまだだねぇ'], feint: ['…なんてね', 'チラッ', 'まだだよ〜'] },
  { name: 'いたずら忍者 ドロン', no: '第三試合', line: 'なにが飛んでくるかな?', look: 'doron', bg: 2,
    win: ['ドロン!?', 'やるでござる', 'むむっ'], lose: ['ニンニン♪', 'いただき!', 'スキありでござる'], feint: ['…ニン', 'まだでござる'] },
  { name: '剣豪 鬼丸', no: '最終試合', line: 'わしの剣、見切れるか!', look: 'onimaru', bg: 3,
    win: ['ぬうっ!?', '見事…!', 'ほう…やるな'], lose: ['甘いわ!', 'スキありィ!', 'まだまだ!'], feint: ['フン', '…どうした?'] }
];
var OBJ_NAME = { negi: 'ネギ!?', daikon: '大根!?', harisen: 'ハリセン!?', sanma: 'サンマ!?' };

/* ===== 刀の通り道(場面の座標: 幅 360・床 434) ===== */
var A0 = { x: 278, y: 116 }, AQ = { x: 238, y: 118 }, A1 = { x: 222, y: 240 };
var TH0 = -60 * Math.PI / 180, TH1 = -184.3 * Math.PI / 180;
var PC = 0.9, CATCH_DIST = 74, PITA = 0.035;
var SN = { x: 146, y: 362 }, SF = { x: 132, y: 356 };
function handAt(p) { var q = 1 - p; return { x: q * q * A0.x + 2 * q * p * AQ.x + p * p * A1.x, y: q * q * A0.y + 2 * q * p * AQ.y + p * p * A1.y }; }
function angAt(p) { return TH0 + (TH1 - TH0) * p; }
function bladePt(p, dist) { var h = handAt(p), a = angAt(p); return { x: h.x + Math.cos(a) * dist, y: h.y + Math.sin(a) * dist }; }

/* ===== ゲームの状態(start のたびに 作り直す) ===== */
var G = null, R = null, P = [], POPS = [], BUB = null, acc = 0, lastNow = 0;
function fresh() { return { state: 'title', phase: '', round: 0, caught: 0, pita: 0, res: [], hair: 0, bumps: 0, at: 0, pt: 0, shake: 0, flash: 0, flashCol: '255,255,255', hitstop: 0, opp: 0, plan: [], hint: 1 }; }

/* 20本の並び。r は seed から作った乱数(同じ seed なら同じ並び) */
function buildPlan(r) {
  var plan = [], i;
  function rv(a, b) { return a + r() * (b - a); }
  function z() { return [r(), r(), r()]; }   // フェイントの間の長さ など(makeSegs で使う)
  var d1 = shuf([0.64, 0.61, 0.58, 0.55, 0.52], r);
  for (i = 0; i < 5; i++) plan.push({ stage: 0, obj: 'katana', D: d1[i], hold: rv(0.9, 1.8), feint: null, clapOn: 0.13, z: z() });
  var f2 = ['stop'].concat(shuf(['pull', 'double', null, null], r));
  for (i = 0; i < 5; i++) plan.push({ stage: 1, obj: 'katana', D: rv(0.44, 0.5), hold: rv(0.7, 1.6), feint: f2[i], clapOn: 0.12, z: z() });
  var objs = shuf(['negi', 'daikon', 'harisen', 'sanma', 'katana'], r);
  if (objs[0] === 'katana') { objs[0] = objs[1]; objs[1] = 'katana'; }
  var fi = 1 + Math.floor(r() * 4);
  for (i = 0; i < 5; i++) plan.push({ stage: 2, obj: objs[i], D: rv(0.38, 0.56), hold: rv(0.6, 1.7), feint: i === fi ? 'stop' : null, clapOn: 0.115, z: z() });
  var d4 = [0.40, 0.38, 0.36, 0.35], f4 = shuf(['jirashi', 'stop', null, null], r);
  for (i = 0; i < 4; i++) plan.push({ stage: 3, obj: 'katana', D: d4[i], hold: rv(0.45, 1.25), feint: f4[i], clapOn: 0.105, z: z() });
  plan.push({ stage: 3, obj: 'katana', D: 0.31, hold: rv(1.3, 2.4), feint: null, clapOn: 0.105, ougi: true, z: z() });
  return plan;
}
function mv(p0, p1, dur, e) { return { k: 'move', p0: p0, p1: p1, dur: dur, e: e }; }
function ps(p, dur) { return { k: 'pause', p0: p, p1: p, dur: dur, feint: true }; }
function makeSegs(c) {
  var s = [], D = c.D, z = c.z;
  s.push({ k: 'hold', p0: 0, p1: 0, dur: c.feint === 'jirashi' ? 2.4 + z[0] * 0.8 : c.hold });
  if (c.feint === 'stop') { s.push(mv(0, 0.42, D * 0.55, 1.3)); s.push(ps(0.42, 0.4 + z[1] * 0.35)); s.push(mv(0.42, 1, D * 0.64, 1.8)); }
  else if (c.feint === 'pull') { s.push(mv(0, 0.5, D * 0.55, 1.3)); s.push(mv(0.5, 0.12, 0.24, 0.55)); s.push(ps(0.12, 0.25 + z[1] * 0.25)); s.push(mv(0.12, 1, D * 0.86, 1.7)); }
  else if (c.feint === 'double') { s.push(mv(0, 0.3, D * 0.45, 1.3)); s.push(ps(0.3, 0.3 + z[1] * 0.2)); s.push(mv(0.3, 0.56, D * 0.32, 1.2)); s.push(ps(0.56, 0.3 + z[2] * 0.2)); s.push(mv(0.56, 1, D * 0.58, 1.8)); }
  else s.push(mv(0, 1, D, 1.7));
  return s;
}
function timeSegs(segs, t0) {
  var t = t0;
  for (var i = 0; i < segs.length; i++) { segs[i].t0 = t; t += segs[i].dur; }
  var f = segs[segs.length - 1];
  return { fin: f, T1: f.t0 + f.dur, Tc: f.t0 + f.dur * Math.pow((PC - f.p0) / (f.p1 - f.p0), 1 / f.e) };
}
function progAt(segs, tau) {
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (tau < s.t0 + s.dur || i === segs.length - 1) {
      if (s.k === 'move') { var u = clamp((tau - s.t0) / s.dur, 0, 1); return { p: s.p0 + (s.p1 - s.p0) * Math.pow(u, s.e), seg: s }; }
      return { p: s.p0, seg: s };
    }
  }
  return { p: 0, seg: segs[0] };
}
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

/* ===== 進行 ===== */
function startIntro(stage) { G.phase = 'intro'; G.pt = 0; G.opp = stage; R = null; BUB = null; }
function startRound() {
  var c = G.plan[G.round];
  if (c.ougi && G.phase !== 'ougi') { G.phase = 'ougi'; G.pt = 0; R = null; return; }
  R = { cfg: c, tau: 0, segs: makeSegs(c), p: 0, clap: null, pending: null, outcome: null, grade: null, whiff: false,
        cur: null, nextGlint: rnd(0.25, 0.6), glint: null, trail: [], catchP: 0, moved: false };
  var tm = timeSegs(R.segs, 0); R.fin = tm.fin; R.T1 = tm.T1; R.Tc = tm.Tc;
  G.phase = 'round'; G.pt = 0;
}
function nextRound() {
  G.round++;
  if (G.round >= N) { G.state = 'over'; G.phase = 'end'; R = null; BUB = null; K.end(); return; }   // 20本 おわり → わくの おしまい画面
  if (G.round % 5 === 0) startIntro(G.round / 5); else startRound();
}
function clap() {
  if (!G || G.state !== 'play') return;
  if (G.phase === 'intro') { if (G.pt > 0.45) startRound(); return; }
  if (G.phase === 'ougi') { if (G.pt > 0.6) startRound(); return; }
  if (G.phase !== 'round' || !R || R.clap || R.outcome) return;
  var tau = R.tau, cur = progAt(R.segs, tau), p = cur.p;
  R.clap = { t: tau };
  if (p >= PC && tau < R.T1) {
    catchNow(p, Math.abs(tau - R.Tc) <= PITA ? 'pita' : 'giri');
  } else if (cur.seg === R.fin && R.Tc - tau <= R.cfg.clapOn && R.Tc >= tau) {
    R.pending = (R.Tc - tau <= PITA) ? 'pita' : 'ok';
  } else {
    R.whiff = true; buzz(15);
    pop('スカッ', sx(130), sy(150), '#cfe3ff', 30);
    if (cur.seg !== R.fin) {   // 相手は スキを見のがさない
      var segs = [{ k: 'pause', p0: p, p1: p, dur: 0.14 }, mv(p, 1, 0.2 + (1 - p) * 0.12, 1.5)];
      var tm = timeSegs(segs, tau); R.segs = segs; R.fin = tm.fin; R.T1 = tm.T1; R.Tc = tm.Tc;
      say(pick(['スキあり!', 'そこだ!', 'もらった!']), 0.9);
    }
  }
}
function catchNow(p, grade) {
  var c = R.cfg, op = OPPS[G.opp];
  R.outcome = 'catch'; R.grade = grade; R.catchP = p; R.p = p;
  G.caught++; if (grade === 'pita') G.pita++;
  K.add(1);
  G.res.push(grade); G.phase = 'resolve'; G.pt = 0;
  G.hitstop = 0.09; G.shake = 7; G.flash = grade === 'pita' ? 0.85 : 0.55; G.flashCol = grade === 'pita' ? '255,226,120' : '255,255,255';
  var bp = bladePt(p, CATCH_DIST);
  for (var i = 0; i < 18; i++) { var a = rnd(0, TAU), v = rnd(80, 260); P.push({ t: 'spark', x: bp.x, y: bp.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.5), age: 0 }); }
  if (grade === 'pita') pop('ピタッ!!', sx(bp.x), sy(bp.y) - 64, '#ffd34d', 50);
  else pop(grade === 'giri' ? 'ギリギリ!' : 'パシッ!', sx(bp.x), sy(bp.y) - 64, '#ffffff', 44);
  if (c.obj !== 'katana') pop(OBJ_NAME[c.obj], sx(bp.x), sy(bp.y) - 22, '#a6f08a', 24, 0.2);
  buzz(30);
  say(pick(op.win), 1.2);
  G.hint = Math.max(0, G.hint - 0.25);
}
function hitNow() {
  var c = R.cfg, op = OPPS[G.opp];
  R.outcome = 'hit'; R.p = 1; G.res.push('x'); G.phase = 'resolve'; G.pt = 0;
  G.shake = 9; G.flash = 0.5; G.flashCol = '255,120,120';
  if (c.obj === 'katana') {
    var hs = Math.min(G.hair, 5);
    spawnHair(hs);
    G.hair++;
    pop('スパッ!', sx(110), sy(206), '#ff6b5e', 46);
    say(hs >= 4 ? pick(['もう切る髪がない…', 'まぶしい…!', 'ピカピカだな']) : pick(op.lose), 1.2);
  } else {
    G.bumps++;
    pop('ポコッ!', sx(116), sy(206), '#ff9f43', 44);
    say(pick(op.lose), 1.2);
  }
  buzz([50, 40, 60]);
}
function spawnHair(hs) {
  var base = { x: 108, y: 250 };
  if (hs === 0) P.push({ t: 'mage', x: base.x, y: base.y - 4, vx: -90, vy: -260, r: 0, vr: -7, life: 1.4, age: 0, g: 620 });
  else if (hs <= 3) for (var i = 0; i < (hs === 1 ? 7 : 5); i++) P.push({ t: 'strand', x: base.x + rnd(-30, 10), y: base.y + rnd(-6, 20), vx: rnd(-160, 40), vy: rnd(-260, -120), r: rnd(0, TAU), vr: rnd(-9, 9), life: 1.3, age: 0, g: 560, len: rnd(12, 22) });
  else for (var j = 0; j < 8; j++) { var a = rnd(0, TAU); P.push({ t: 'star', x: base.x + 8, y: base.y - 10, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, life: 0.8, age: 0, g: 0 }); }
}
function say(s, dur) { BUB = { s: s, t: 0, dur: dur || 1 }; }
function pop(s, x, y, col, size, delay) { POPS.push({ s: s, x: x, y: y, col: col, size: size, t: -(delay || 0) }); }
function rankOf(n) {
  if (n >= 20) return ['免許皆伝', 'すべて見切った!伝説の達人'];
  if (n >= 18) return ['剣聖', 'ほぼ完ぺき!おそれいりました'];
  if (n >= 15) return ['師範代', 'かなりの腕前!'];
  if (n >= 11) return ['一人前', 'なかなかやるな'];
  if (n >= 7) return ['見習い', 'まだまだ修行が足りぬ'];
  if (n >= 3) return ['入門したて', 'まずは素振りから'];
  return ['つるつる名人', '髪が…ない!'];
}

/* ===== 1コマ進める(1/60秒ずつ) ===== */
function step(dt) {
  G.at += dt;
  updateFx(dt);
  if (G.state !== 'play') return;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  G.pt += dt;
  if (G.phase === 'intro') { if (G.pt >= 2.1) startRound(); return; }
  if (G.phase === 'ougi') { if (G.pt >= 1.9) startRound(); return; }
  if (G.phase === 'resolve') { if (G.pt >= (R && R.outcome === 'hit' ? 1.5 : 1.4)) nextRound(); return; }
  if (G.phase !== 'round' || !R) return;
  R.tau += dt;
  var cur = progAt(R.segs, R.tau), p = cur.p;
  if (cur.seg !== R.cur) { onSeg(cur.seg); R.cur = cur.seg; }
  if (R.pending && p >= PC) { catchNow(PC, R.pending); return; }
  if (R.tau >= R.T1) { hitNow(); return; }
  R.trail.push(p); if (R.trail.length > 6) R.trail.shift();
  R.p = p;
  if (cur.seg.k === 'hold') {
    R.nextGlint -= dt;
    if (R.nextGlint <= 0) { R.glint = { t: 0, at: rnd(70, 150) }; R.nextGlint = rnd(0.55, 1.0); }
  }
  if (R.glint) { R.glint.t += dt; if (R.glint.t > 0.3) R.glint = null; }
}
function onSeg(s) {
  var op = OPPS[G.opp];
  if (s.k === 'move' && s.p1 > s.p0 && !R.moved) { R.moved = true; if (!R.whiff) say(R.cfg.ougi ? '稲妻斬り!!' : pick(['はっ!', 'えいっ!', 'とうっ!']), 0.5); }
  if (s.k === 'move' && s.p1 < s.p0) say('おっと〜', 0.6);
  if (s.k === 'pause' && s.feint && op.feint) say(pick(op.feint), s.dur);
  if (s.k === 'move' && R.cfg.ougi && s.p1 > s.p0) { G.flash = 0.6; G.flashCol = '220,230,255'; }
}
function updateFx(dt) {
  for (var i = P.length - 1; i >= 0; i--) {
    var q = P[i]; q.age += dt;
    if (q.age >= q.life) { P.splice(i, 1); continue; }
    q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.vr) q.r += q.vr * dt;
    if (q.t === 'spark') { q.vx *= 0.9; q.vy *= 0.9; }
  }
  for (var j = POPS.length - 1; j >= 0; j--) { POPS[j].t += dt; if (POPS[j].t > 0.95) POPS.splice(j, 1); }
  if (BUB) { BUB.t += dt; if (BUB.t > BUB.dur) BUB = null; }
  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt * 3.2);
  var bg = OPPS[curStage()].bg;
  if (bg === 3 && Math.random() < dt * 6) P.push({ t: 'petal', x: rnd(-20, 380), y: -20, vx: rnd(10, 40), vy: rnd(30, 60), r: rnd(0, TAU), vr: rnd(-3, 3), life: 9, age: 0, g: 0, scr: true });
  if (bg === 1 && Math.random() < dt * 1.5) P.push({ t: 'leaf', x: rnd(0, 360), y: -20, vx: rnd(-20, 20), vy: rnd(25, 45), r: rnd(0, TAU), vr: rnd(-2, 2), life: 12, age: 0, g: 0, scr: true });
}
function curStage() { return G.state === 'title' ? 0 : G.opp; }

/* ===== 描くための小道具 ===== */
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function ell(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fs(fill, stroke, lw) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke(); } }
function line(x1, y1, x2, y2, col, lw) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }
function txt(s, x, y, size, col, align, stroke, font, weight) {
  ctx.font = (weight || 900) + ' ' + size + 'px ' + (font || FONT); ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(30,8,8,.92)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
}
function star4(x, y, r, col) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = col; ctx.fill();
}

/* ===== 背景(動かないので 1枚の絵に 先に描いて 使い回す。試合が変わる・画面の大きさが変わるときだけ 描き直す) ===== */
var bgC = null, bgKey = '';
function bgImage(b) {
  var key = b + ':' + SC + ':' + DPR + ':' + BX0 + ':' + BY0 + ':' + BX1 + ':' + BY1;
  if (key === bgKey && bgC) return bgC;
  bgKey = key;
  var s = SC * DPR; bgC = bgC || document.createElement('canvas');
  bgC.width = Math.max(1, Math.ceil((BX1 - BX0) * s)); bgC.height = Math.max(1, Math.ceil((BY1 - BY0) * s));
  var keep = ctx; ctx = bgC.getContext('2d'); ctx.setTransform(s, 0, 0, s, -BX0 * s, -BY0 * s);
  drawBG(b); ctx = keep;
  return bgC;
}
function drawBG(b) {
  var fy = L.fy, sc = L.sc, i, x, y;
  if (b === 0) {   // 道場
    var g = ctx.createLinearGradient(0, 0, 0, fy); g.addColorStop(0, '#b98d58'); g.addColorStop(1, '#dcb880');
    ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, fy + 60);
    ctx.fillStyle = 'rgba(255,240,200,.18)'; ctx.fillRect(-60, sy(30), W + 120, 6 * sc);
    ctx.fillStyle = '#6e4423'; [6, 124, 236, 354].forEach(function (px) { ctx.fillRect(px - 8, -60, 16, fy + 60); });
    ctx.fillStyle = '#5a361b'; ctx.fillRect(-60, sy(0) - 34 * sc, W + 120, 12 * sc);
    ctx.fillStyle = '#a77846'; ctx.fillRect(-60, fy - 70 * sc, W + 120, 70 * sc);
    for (x = -40; x < W + 40; x += 22) line(x, fy - 70 * sc, x, fy, 'rgba(60,30,10,.25)', 2);
    ctx.fillStyle = '#5a361b'; ctx.fillRect(-60, fy - 74 * sc, W + 120, 6 * sc);
    // かけ軸
    var kx = W / 2 - 4, ky = sy(4), kw = 66 * sc, kh = 150 * sc;
    ctx.fillStyle = '#28324f'; ctx.fillRect(kx - kw / 2 - 5, ky - 6, kw + 10, kh + 18);
    ctx.fillStyle = '#f6efdc'; ctx.fillRect(kx - kw / 2, ky + 4, kw, kh - 6);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(kx - kw / 2 - 8, ky + kh + 8, kw + 16, 6);
    txt('心', kx, ky + kh * 0.45, 58 * sc, '#1a1310', 'center', 0, FONT_M, 900);
    ctx.fillStyle = '#b3261e'; ctx.fillRect(kx + kw * 0.12, ky + kh * 0.78, 9 * sc, 11 * sc);
    var fg = ctx.createLinearGradient(0, fy, 0, H); fg.addColorStop(0, '#b47c45'); fg.addColorStop(1, '#7c5029');
    ctx.fillStyle = fg; ctx.fillRect(-60, fy, W + 120, H - fy + 60);
    for (i = 1; i < 9; i++) { y = fy + Math.pow(i / 8, 1.5) * (H - fy); line(-60, y, W + 60, y, 'rgba(50,25,8,.25)', 1.5); }
    ctx.fillStyle = 'rgba(255,240,200,.10)'; ctx.beginPath(); ctx.moveTo(40, fy); ctx.lineTo(120, fy); ctx.lineTo(60, H); ctx.lineTo(-40, H); ctx.fill();
  } else if (b === 1) {   // 竹林
    var g1 = ctx.createLinearGradient(0, 0, 0, fy); g1.addColorStop(0, '#e9f5cf'); g1.addColorStop(1, '#9cc77a');
    ctx.fillStyle = g1; ctx.fillRect(-60, -60, W + 120, fy + 60);
    var bam = [[-6, 10, .45], [40, 14, .55], [96, 9, .4], [150, 12, .5], [205, 10, .42], [262, 15, .55], [318, 11, .45], [362, 13, .5],
      [18, 22, .8], [128, 20, .78], [300, 24, .82], [70, 30, 1], [230, 28, 1], [345, 30, 1]];
    bam.forEach(function (b2, k) {
      var bx = b2[0], bw = b2[1], dep = b2[2];
      ctx.fillStyle = 'rgba(' + Math.round(70 + 60 * (1 - dep)) + ',' + Math.round(130 + 50 * (1 - dep)) + ',' + Math.round(50 + 50 * (1 - dep)) + ',1)'; ctx.fillRect(bx - bw / 2, -60, bw, fy + 70);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx - bw / 2 + bw * 0.18, -60, bw * 0.18, fy + 70);
      for (var ny = ((k * 37) % 70) - 40; ny < fy; ny += 78 * dep + 30) { ctx.fillStyle = 'rgba(30,70,20,.45)'; ctx.fillRect(bx - bw / 2 - 1, ny, bw + 2, 3); }
    });
    ctx.fillStyle = 'rgba(255,255,230,.16)'; ctx.beginPath(); ctx.moveTo(160, -60); ctx.lineTo(230, -60); ctx.lineTo(150, fy); ctx.lineTo(60, fy); ctx.fill();
    var gg = ctx.createLinearGradient(0, fy, 0, H); gg.addColorStop(0, '#5f7f3c'); gg.addColorStop(1, '#3a5124');
    ctx.fillStyle = gg; ctx.fillRect(-60, fy, W + 120, H - fy + 60);
    for (i = 0; i < 26; i++) { x = (i * 53) % 380 - 10; y = fy + 8 + (i * 29) % Math.max(20, H - fy - 20); ctx.strokeStyle = 'rgba(160,200,90,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 9); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 10); ctx.stroke(); }
  } else if (b === 2) {   // 夜の屋根(星は drawStars で 毎回 またたかせる)
    var g2 = ctx.createLinearGradient(0, 0, 0, fy); g2.addColorStop(0, '#0b0e2c'); g2.addColorStop(0.6, '#24205a'); g2.addColorStop(1, '#4d3576');
    ctx.fillStyle = g2; ctx.fillRect(-60, -60, W + 120, fy + 60);
    var mx = 78, my = sy(70);
    var mg = ctx.createRadialGradient(mx, my, 20, mx, my, 110); mg.addColorStop(0, 'rgba(255,248,210,.55)'); mg.addColorStop(1, 'rgba(255,248,210,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 120, my - 120, 240, 240);
    circ(mx, my, 40); ctx.fillStyle = '#fff6cf'; ctx.fill();
    circ(mx + 12, my - 8, 7); ctx.fillStyle = 'rgba(220,205,150,.5)'; ctx.fill(); circ(mx - 14, my + 12, 5); ctx.fill();
    ctx.fillStyle = '#17163a'; for (i = 0; i < 9; i++) { x = i * 44 - 10; var hh = 26 + (i * 17) % 34; ctx.fillRect(x, fy - 44 * sc - hh, 40, hh + 50); ctx.beginPath(); ctx.moveTo(x - 6, fy - 44 * sc - hh); ctx.lineTo(x + 20, fy - 44 * sc - hh - 14); ctx.lineTo(x + 46, fy - 44 * sc - hh); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,210,120,.7)'; for (i = 0; i < 9; i++) if (i % 3 !== 1) ctx.fillRect(i * 44 + 8, fy - 44 * sc - 16, 6, 8);
    var rg = ctx.createLinearGradient(0, fy - 10, 0, H); rg.addColorStop(0, '#3a3f5c'); rg.addColorStop(1, '#1d2034');
    ctx.fillStyle = rg; ctx.fillRect(-60, fy - 6, W + 120, H - fy + 66);
    ctx.fillStyle = '#545a7e'; ctx.fillRect(-60, fy - 10, W + 120, 8);
    ctx.strokeStyle = 'rgba(20,22,40,.65)'; ctx.lineWidth = 2; ctx.beginPath();   // 瓦(まとめて1回で描く)
    for (y = fy + 12; y < H + 70; y += 16) { for (x = -60 + ((y / 16) % 2) * 12; x < W + 70; x += 24) { ctx.moveTo(x + 12, y); ctx.arc(x, y, 12, 0, Math.PI, true); } }
    ctx.stroke();
  } else {   // 夕焼けの桜
    var g3 = ctx.createLinearGradient(0, 0, 0, fy); g3.addColorStop(0, '#ff9e7a'); g3.addColorStop(0.55, '#ff7f8e'); g3.addColorStop(1, '#ffc6a8');
    ctx.fillStyle = g3; ctx.fillRect(-60, -60, W + 120, fy + 60);
    circ(250, fy - 92 * sc, 46); ctx.fillStyle = 'rgba(255,240,190,.85)'; ctx.fill();
    ctx.fillStyle = '#b25a7a'; ctx.beginPath(); ctx.moveTo(-60, fy - 30 * sc); ctx.lineTo(40, fy - 110 * sc); ctx.lineTo(120, fy - 50 * sc); ctx.lineTo(200, fy - 120 * sc); ctx.lineTo(300, fy - 40 * sc); ctx.lineTo(420, fy - 90 * sc); ctx.lineTo(420, fy); ctx.lineTo(-60, fy); ctx.fill();
    ctx.fillStyle = '#8f4366'; ctx.beginPath(); ctx.moveTo(-60, fy - 10 * sc); ctx.lineTo(80, fy - 60 * sc); ctx.lineTo(170, fy - 20 * sc); ctx.lineTo(260, fy - 70 * sc); ctx.lineTo(420, fy - 15 * sc); ctx.lineTo(420, fy); ctx.lineTo(-60, fy); ctx.fill();
    // 桜の枝
    ctx.strokeStyle = '#4a2a2a'; ctx.lineCap = 'round';
    [[-10, sy(-30), 120, sy(40), 9], [60, sy(10), 90, sy(80), 5], [370, sy(-20), 270, sy(30), 8], [320, sy(5), 330, sy(70), 4]].forEach(function (br) { ctx.lineWidth = br[4]; ctx.beginPath(); ctx.moveTo(br[0], br[1]); ctx.lineTo(br[2], br[3]); ctx.stroke(); });
    var bl = [[20, -20], [50, 0], [85, 18], [115, 38], [95, 70], [70, 40], [5, 10], [355, -10], [320, 12], [290, 30], [330, 60], [265, 20], [345, 30]];
    bl.forEach(function (b3, k) { var bx = b3[0], by = sy(b3[1]); circ(bx, by, 16); ctx.fillStyle = k % 2 ? '#ffd1dc' : '#ffb7c9'; ctx.fill(); circ(bx + 9, by - 5, 10); ctx.fillStyle = '#ffe3ea'; ctx.fill(); });
    var gd = ctx.createLinearGradient(0, fy, 0, H); gd.addColorStop(0, '#7b5544'); gd.addColorStop(1, '#4b3127');
    ctx.fillStyle = gd; ctx.fillRect(-60, fy, W + 120, H - fy + 60);
    ctx.fillStyle = 'rgba(255,190,205,.55)'; for (i = 0; i < 30; i++) { x = (i * 71) % 370; y = fy + 6 + (i * 37) % Math.max(20, H - fy - 10); ell(x, y, 3, 1.6, i); ctx.fill(); }
  }
}
function drawStars() {   // 夜の星(月と屋根には かからないように)
  var top = L.fy - 44 * L.sc - 76, my = sy(70);
  for (var i = 0; i < 40; i++) {
    var x = (i * 97) % 360, y = (i * 61) % Math.max(60, L.fy - 80);
    if (y > top || Math.abs(x - 78) < 50 && Math.abs(y - my) < 50) continue;
    ctx.fillStyle = 'rgba(255,255,230,' + (0.3 + 0.6 * (0.5 + 0.5 * Math.sin(G.at * 2 + i))) + ')'; ctx.fillRect(x, y, 2, 2);
  }
}

/* ===== 受け手(自分)。右を向いて正座 ===== */
function drawDefBody() {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(48, 436); ctx.quadraticCurveTo(40, 398, 80, 391); ctx.lineTo(150, 395); ctx.quadraticCurveTo(182, 399, 182, 421); ctx.quadraticCurveTo(182, 438, 164, 438); ctx.lineTo(48, 438); ctx.closePath(); fs('#2a3150', INK, 3);
  line(98, 399, 95, 434, 'rgba(0,0,0,.35)', 2); line(128, 399, 131, 434, 'rgba(0,0,0,.35)', 2);
  ctx.beginPath(); ctx.moveTo(72, 404); ctx.lineTo(82, 362); ctx.quadraticCurveTo(108, 342, 138, 356); ctx.lineTo(150, 404); ctx.closePath(); fs('#3e6fb5', INK, 3);
  ctx.beginPath(); ctx.moveTo(96, 352); ctx.quadraticCurveTo(116, 340, 136, 356); ctx.lineTo(141, 398); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 5.5; ctx.stroke();
  rr(73, 389, 76, 13, 3); fs('#1d2440', INK, 2);
}
function drawDefHead(face) {
  var x = 108, y = 300, r = 48, hs = Math.min(G.hair, 5);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (hs === 1 || hs === 2) {   // ざんばら(切られて落ちた髪)
    var len = hs === 1 ? 54 : 30;
    ctx.beginPath(); ctx.moveTo(62, 278); ctx.quadraticCurveTo(52, 300, 56, 300 + len);
    for (var k = 0; k < 6; k++) ctx.lineTo(60 + k * 7 + 3, 300 + len - (k % 2 ? 12 : 0));
    ctx.lineTo(102, 300); ctx.closePath(); fs(HAIR, INK, 2.5);
  }
  circ(x, y, r); fs(SKIN);
  ctx.save(); circ(x, y, r); ctx.clip();
  if (hs <= 3) { ell(x + 4, y - 38, 40, 22, -0.12); ctx.fillStyle = hs <= 2 ? '#e8ccb5' : SKIN2; ctx.fill(); }
  ctx.fillStyle = HAIR;
  if (hs === 0) { ell(x - 34, y + 2, 26, 46, 0.1); ctx.fill(); rr(x - 16, y - 12, 9, 28, 4); ctx.fill(); }
  else if (hs === 1) { ell(x - 34, y + 2, 26, 46, 0.1); ctx.fill(); }
  else if (hs === 2) { ell(x - 40, y + 6, 18, 38, 0.1); ctx.fill(); }
  else if (hs === 3) { ctx.fillStyle = 'rgba(28,20,17,.55)'; ell(x - 45, y + 10, 8, 26, 0.1); ctx.fill(); }
  ctx.restore();
  circ(x, y, r); fs(null, INK, 3);
  if (hs >= 4) {
    ell(x + 8, y - 34, 15, 6, -0.3); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill(); ell(x - 10, y - 39, 5, 3, -0.3); ctx.fill();
    if (hs >= 5) { var pz = 0.6 + 0.4 * Math.sin(G.at * 8); star4(x + 30, y - 46, 9 * pz, '#fff'); star4(x - 22, y - 52, 6 * (1.4 - pz), '#fff7c0'); star4(x + 44, y - 20, 5 * pz, '#fff'); }
  }
  if (hs === 0) {   // ちょんまげ
    ctx.save(); ctx.translate(x - 8, y - r + 3); ctx.rotate(-0.2);
    rr(-4, -11, 42, 11, 5.5); fs(HAIR, INK, 2.5); rr(-2, -12.5, 6, 14, 2); fs('#f4efe4', INK, 1.5);
    ctx.restore();
  }
  if (hs === 1) { ctx.fillStyle = HAIR; ctx.beginPath(); ctx.moveTo(92, 256); ctx.lineTo(97, 238); ctx.lineTo(102, 255); ctx.lineTo(108, 236); ctx.lineTo(113, 254); ctx.lineTo(119, 240); ctx.lineTo(122, 257); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); }
  // 耳
  ell(x - 16, y + 6, 8, 11, 0); fs(SKIN, INK, 2.5); ctx.beginPath(); ctx.arc(x - 16, y + 6, 4, -1, 1.6); ctx.strokeStyle = 'rgba(120,60,40,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  // たんこぶ
  for (var b = 0; b < Math.min(G.bumps, 4); b++) { var bx = x + 14 - b * 15, by = y - r - 2 - (b % 2) * 6; circ(bx, by, 10 - b); fs('#f7c6a8', INK, 2.5); ell(bx - 3, by - 4, 3, 2); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill(); }
  drawDefFace(face);
}
function drawDefFace(face) {
  var x = 108, y = 300;
  var e1 = { x: x + 20, y: y - 2 }, e2 = { x: x + 41, y: y - 4 };
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 47, y + 2); ctx.quadraticCurveTo(x + 53, y + 9, x + 46, y + 13); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
  if (face === 'hit') {
    circ(e1.x, e1.y, 7.5); fs('#fff', INK, 2); circ(e2.x, e2.y, 6); fs('#fff', INK, 2);
    circ(e1.x + 1, e1.y, 1.6); fs(INK); circ(e2.x + 1, e2.y, 1.4); fs(INK);
    ctx.beginPath(); ctx.moveTo(x + 22, y + 24); for (var i = 0; i < 4; i++) ctx.lineTo(x + 26 + i * 5, y + 24 + (i % 2 ? -3 : 3)); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    for (var j = 0; j < 4; j++) line(x + 8 + j * 9, y - 32, x + 8 + j * 9, y - 18, 'rgba(70,110,230,.75)', 2.5);
    ell(x + 52, y - 18, 4, 6.5, 0.3); fs('#bfe6ff', INK, 1.5);
  } else if (face === 'whiff') {
    circ(e1.x, e1.y, 6.5); fs('#fff', INK, 2); circ(e2.x, e2.y, 5.2); fs('#fff', INK, 2);
    circ(e1.x + 2, e1.y, 2.6); fs(INK); circ(e2.x + 2, e2.y, 2.2); fs(INK);
    line(e1.x - 7, e1.y - 13, e1.x + 6, e1.y - 15, INK, 3); line(e2.x - 5, e2.y - 14, e2.x + 5, e2.y - 13, INK, 3);
    circ(x + 34, y + 22, 4.5); fs('#7a2a2a', INK, 2);
    ell(x + 54, y - 16, 4, 6.5, 0.3); fs('#bfe6ff', INK, 1.5);
  } else if (face === 'proud') {
    ctx.beginPath(); ctx.arc(e1.x, e1.y + 3, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(e2.x, e2.y + 3, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    line(e1.x - 7, e1.y - 12, e1.x + 6, e1.y - 15, INK, 3.2); line(e2.x - 5, e2.y - 15, e2.x + 5, e2.y - 13, INK, 3.2);
    ctx.beginPath(); ctx.arc(x + 32, y + 15, 9, 0.25, Math.PI - 0.6); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ell(x + 12, y + 14, 6, 3.5); ctx.fillStyle = 'rgba(255,120,120,.45)'; ctx.fill();
  } else {
    ell(e1.x, e1.y, 4.4, 6.6); fs(INK); ell(e2.x, e2.y, 3.6, 5.6); fs(INK);
    circ(e1.x + 1.5, e1.y - 2.5, 1.6); fs('#fff'); circ(e2.x + 1.2, e2.y - 2.2, 1.3); fs('#fff');
    line(e1.x - 8, e1.y - 15, e1.x + 6, e1.y - 10, INK, 3.6); line(e2.x - 4, e2.y - 11, e2.x + 6, e2.y - 15, INK, 3.4);
    line(x + 28, y + 22, x + 40, y + 21, INK, 2.6);
  }
}
function drawDefArms(pc) {
  var d = { x: Math.cos(pc.a), y: Math.sin(pc.a) }, n = { x: -d.y, y: d.x };
  var P1 = { x: pc.x + n.x * pc.gap, y: pc.y + n.y * pc.gap }, P2 = { x: pc.x - n.x * pc.gap, y: pc.y - n.y * pc.gap };
  var fd = { x: -d.x, y: -d.y };
  arm(SF, P1, fd, true, 34); palm(P1, fd, 1);
  arm(SN, P2, fd, false, 40); palm(P2, fd, -1);
}
function arm(S, Pm, fd, far, bend) {
  var wr = { x: Pm.x - fd.x * 13, y: Pm.y - fd.y * 13 };
  var mx = (S.x + wr.x) / 2, my = (S.y + wr.y) / 2, vx = wr.x - S.x, vy = wr.y - S.y, ln = Math.hypot(vx, vy) || 1;
  var px = -vy / ln, py = vx / ln; if (px < 0) { px = -px; py = -py; }
  var el = { x: mx + px * bend, y: my + py * bend };
  ctx.lineCap = 'round';
  line(S.x, S.y, el.x, el.y, INK, 25); line(S.x, S.y, el.x, el.y, far ? '#2f5895' : '#3e6fb5', 19.5);
  line(el.x, el.y, wr.x, wr.y, INK, 15); line(el.x, el.y, wr.x, wr.y, far ? SKIN2 : SKIN, 10.5);
}
function palm(Pm, fd, side) {   // 手(指の方向 fd)。side: 1=奥の手 / -1=手前の手
  var col = side > 0 ? SKIN2 : SKIN;
  ctx.save(); ctx.translate(Pm.x, Pm.y); ctx.rotate(Math.atan2(fd.y, fd.x));
  var lens = [17, 21, 22, 19];
  for (var i = 0; i < 4; i++) { var y = -7.2 + i * 4.8; rr(0, y - 2.6, lens[i], 5.2, 2.6); fs(col, INK, 1.7); }
  rr(-15, -9.5, 21, 19, 7); fs(col, INK, 2.3);
  ell(-5, side * 9.5, 8.5, 4.2, side * 0.55); fs(col, INK, 2);
  ctx.restore();
}

/* ===== 斬る人。左を向いて立つ ===== */
var LOOKS = {
  kentaro: { kimono: '#f3f0e6', kimono2: '#d9d4c4', hakama: '#29365f' },
  chiramaru: { kimono: '#7246a8', kimono2: '#5a3589', hakama: '#55505e' },
  doron: { kimono: '#252a48', kimono2: '#1a1e36', hakama: '#1e2240' },
  onimaru: { kimono: '#b3261e', kimono2: '#8c1b15', hakama: '#262326' }
};
function oppShoulders(bob) { return { n: { x: 248, y: 252 + bob }, f: { x: 278, y: 248 + bob } }; }
function drawOppBody(look, bob) {
  var o = LOOKS[look];
  ctx.lineJoin = 'round';
  ell(228, 436, 13, 6); fs('#f4efe4', INK, 2); ell(300, 436, 13, 6); fs('#f4efe4', INK, 2);
  ctx.beginPath(); ctx.moveTo(220, 434); ctx.lineTo(236, 332 + bob); ctx.lineTo(292, 332 + bob); ctx.lineTo(308, 434); ctx.closePath(); fs(o.hakama, INK, 3);
  line(252, 340 + bob, 248, 432, 'rgba(0,0,0,.3)', 2); line(276, 340 + bob, 280, 432, 'rgba(0,0,0,.3)', 2);
  ctx.beginPath(); ctx.moveTo(234, 340 + bob); ctx.lineTo(240, 240 + bob); ctx.quadraticCurveTo(264, 224 + bob, 290, 240 + bob); ctx.lineTo(296, 340 + bob); ctx.closePath(); fs(o.kimono, INK, 3);
  var cc = look === 'kentaro' ? '#d8d1bf' : '#f4efe4';   // 着物の合わせ(左前にならないように 右の衿が下)
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(244, 240 + bob); ctx.lineTo(268, 270 + bob); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = cc; ctx.lineWidth = 5.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(286, 238 + bob); ctx.lineTo(252, 300 + bob); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = cc; ctx.lineWidth = 5.5; ctx.stroke();
  rr(232, 326 + bob, 66, 13, 3); fs(look === 'onimaru' ? '#f0c040' : '#1b1b2a', INK, 2);
}
function drawOppHead(look, ex, bob) {
  var x = 262, y = 180 + bob, r = 46;
  if (look === 'onimaru') { y = 176 + bob; r = 50; }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // うしろ髪・飾り(頭の前に描くと顔にかかるので先に)
  if (look === 'chiramaru') {
    var sw = Math.sin(G.at * 3) * 4;
    ctx.beginPath(); ctx.moveTo(300, 160 + bob); ctx.quadraticCurveTo(346, 178 + bob + sw, 334, 236 + bob + sw); ctx.quadraticCurveTo(326, 214 + bob, 302, 190 + bob); ctx.closePath(); fs('#4a2e1f', INK, 2.5);
  }
  if (look === 'onimaru') {
    ctx.beginPath(); ctx.moveTo(240, 140 + bob);
    var spk = [[262, 108], [282, 124], [306, 110], [312, 140], [338, 138], [324, 166], [346, 184], [318, 196], [330, 222], [300, 214]];
    spk.forEach(function (q) { ctx.lineTo(q[0], q[1] + bob); });
    ctx.lineTo(290, 200 + bob); ctx.closePath(); fs(HAIR, INK, 2.5);
  }
  if (look === 'doron' || look === 'kentaro') {
    var wv = Math.sin(G.at * 5) * 3, hc = look === 'doron' ? '#c0392b' : '#d23a3a';
    ctx.beginPath(); ctx.moveTo(300, 170 + bob); ctx.quadraticCurveTo(326, 160 + bob + wv, 340, 172 + bob + wv); ctx.lineTo(332, 178 + bob); ctx.quadraticCurveTo(320, 172 + bob, 302, 178 + bob); ctx.closePath(); fs(hc, INK, 2);
    ctx.beginPath(); ctx.moveTo(300, 176 + bob); ctx.quadraticCurveTo(322, 190 + bob - wv, 334, 196 + bob - wv); ctx.lineTo(328, 202 + bob); ctx.quadraticCurveTo(316, 194 + bob, 300, 184 + bob); ctx.closePath(); fs(hc, INK, 2);
  }
  circ(x, y, r); fs(look === 'doron' ? '#252a48' : SKIN);
  ctx.save(); circ(x, y, r); ctx.clip();
  if (look === 'kentaro') { ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(x, y, r + 2, Math.PI * 1.03, Math.PI * 2.3); ctx.quadraticCurveTo(x + 14, y - 6, x - 30, y - 22); ctx.closePath(); ctx.fill(); }
  if (look === 'chiramaru') { ctx.fillStyle = '#4a2e1f'; ctx.beginPath(); ctx.arc(x, y, r + 2, Math.PI * 1.05, Math.PI * 2.25); ctx.quadraticCurveTo(x + 10, y - 12, x - 36, y - 18); ctx.closePath(); ctx.fill(); }
  if (look === 'onimaru') { ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(x, y, r + 2, Math.PI * 1.05, Math.PI * 2.2); ctx.quadraticCurveTo(x + 8, y - 16, x - 38, y - 22); ctx.closePath(); ctx.fill(); }
  if (look === 'doron') { ctx.fillStyle = SKIN; ctx.fillRect(x - 50, y - 14, 76, 25); }
  ctx.restore();
  circ(x, y, r); fs(null, INK, 3);
  if (look === 'kentaro') {   // はちまき
    ctx.beginPath(); ctx.moveTo(x - 47, y - 16); ctx.quadraticCurveTo(x, y - 30, x + 44, y - 14); ctx.lineTo(x + 45, y - 4); ctx.quadraticCurveTo(x, y - 20, x - 47, y - 6); ctx.closePath(); fs('#d23a3a', INK, 2.5);
    for (var s2 = 0; s2 < 5; s2++) { ctx.beginPath(); ctx.moveTo(x - 30 + s2 * 13, y - r + 4); ctx.lineTo(x - 22 + s2 * 13, y - r - 8); ctx.lineTo(x - 16 + s2 * 13, y - r + 6); ctx.fillStyle = HAIR; ctx.fill(); }
  }
  if (look === 'onimaru') {   // ひげ
    ctx.beginPath(); ctx.moveTo(x - 42, y + 8); ctx.quadraticCurveTo(x - 46, y + 44, x - 18, y + 52); ctx.quadraticCurveTo(x + 10, y + 58, x + 30, y + 36); ctx.quadraticCurveTo(x + 6, y + 30, x - 4, y + 26); ctx.quadraticCurveTo(x - 24, y + 22, x - 42, y + 8); ctx.closePath(); fs('#2b211d', INK, 2.5);
  }
  if (look !== 'doron') { ell(x + 18, y + 6, 8, 11); fs(SKIN, INK, 2.5); }
  // 顔(左向き)
  var e1 = { x: x - 20, y: y - 1 }, e2 = { x: x - 40, y: y - 3 };
  if (look !== 'doron' && look !== 'onimaru') { ctx.beginPath(); ctx.moveTo(x - 46, y + 2); ctx.quadraticCurveTo(x - 52, y + 9, x - 45, y + 13); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke(); }
  var mouthY = y + 22;
  if (ex === 'shock') {
    circ(e1.x, e1.y, 7); fs('#fff', INK, 2); circ(e2.x, e2.y, 5.6); fs('#fff', INK, 2);
    circ(e1.x - 1, e1.y, 2); fs(INK); circ(e2.x - 1, e2.y, 1.8); fs(INK);
    if (look !== 'doron') { ell(x - 30, mouthY + (look === 'onimaru' ? 6 : 0), 6, 8); fs('#7a2a2a', INK, 2); }
    ell(x - 56, y - 22, 4, 6.5, -0.3); fs('#bfe6ff', INK, 1.5);
    return;
  }
  var fierce = ex === 'swing';
  if (look === 'chiramaru') {
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(e1.x, e1.y + 4, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(e2.x, e2.y + 4, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    line(e1.x - 6, e1.y - 12, e1.x + 7, e1.y - 9, INK, 2.6); line(e2.x - 5, e2.y - 9, e2.x + 4, e2.y - 11, INK, 2.6);
    if (fierce) { ell(x - 30, mouthY, 6, 5); fs('#7a2a2a', INK, 2); }
    else { ctx.beginPath(); ctx.moveTo(x - 38, mouthY); ctx.quadraticCurveTo(x - 30, mouthY + 6, x - 20, mouthY - 4); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke(); }
    return;
  }
  if (look === 'doron') {
    ctx.beginPath(); ctx.moveTo(e1.x - 7, e1.y + 1); ctx.quadraticCurveTo(e1.x, e1.y - 7, e1.x + 7, e1.y); ctx.quadraticCurveTo(e1.x, e1.y + 5, e1.x - 7, e1.y + 1); fs('#fff', INK, 1.8);
    ctx.beginPath(); ctx.moveTo(e2.x - 6, e2.y + 1); ctx.quadraticCurveTo(e2.x, e2.y - 6, e2.x + 5, e2.y); ctx.quadraticCurveTo(e2.x, e2.y + 4, e2.x - 6, e2.y + 1); fs('#fff', INK, 1.8);
    circ(e1.x - 1.5, e1.y, 2.6); fs(INK); circ(e2.x - 1.5, e2.y, 2.2); fs(INK);
    line(e1.x - 8, e1.y - 9, e1.x + 7, e1.y - (fierce ? 4 : 7), '#f4efe4', 2.4); line(e2.x - 6, e2.y - (fierce ? 4 : 7), e2.x + 5, e2.y - 9, '#f4efe4', 2.4);
    return;
  }
  if (look === 'onimaru') {
    ell(e1.x, e1.y, 5, 4.2); fs('#fff', INK, 2); ell(e2.x, e2.y, 4, 3.6); fs('#fff', INK, 2);
    circ(e1.x - 1, e1.y, 2.2); fs(INK); circ(e2.x - 1, e2.y, 1.9); fs(INK);
    line(e1.x - 10, e1.y - 7, e1.x + 9, e1.y - 15, INK, 5.5); line(e2.x - 7, e2.y - 14, e2.x + 6, e2.y - 7, INK, 5);
    ctx.beginPath(); ctx.moveTo(x - 50, y + 4); ctx.quadraticCurveTo(x - 58, y + 12, x - 48, y + 16); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    if (fierce || ex === 'smug') { rr(x - 40, y + 26, 22, 10, 3); fs('#fff', INK, 2); line(x - 29, y + 26, x - 29, y + 36, INK, 1.5); }
    else line(x - 38, y + 30, x - 22, y + 30, '#f0e0d0', 2.4);
    return;
  }
  // 剣太郎
  ell(e1.x, e1.y, 4.6, 7); fs(INK); ell(e2.x, e2.y, 3.8, 6); fs(INK);
  circ(e1.x - 1.4, e1.y - 2.6, 1.7); fs('#fff'); circ(e2.x - 1.2, e2.y - 2.3, 1.4); fs('#fff');
  if (fierce) { line(e1.x - 8, e1.y - 15, e1.x + 7, e1.y - 10, INK, 3.4); line(e2.x - 6, e2.y - 10, e2.x + 5, e2.y - 15, INK, 3.2); ell(x - 30, mouthY, 6, 6); fs('#7a2a2a', INK, 2); }
  else {
    line(e1.x - 7, e1.y - 12, e1.x + 7, e1.y - 15, INK, 3); line(e2.x - 5, e2.y - 15, e2.x + 5, e2.y - 12, INK, 3);
    ctx.beginPath(); ctx.moveTo(x - 36, mouthY); ctx.quadraticCurveTo(x - 30, mouthY - 3, x - 24, mouthY); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    if (ex === 'idle') { ell(x + 30, y - 30, 4, 6.5, 0.3); fs('#bfe6ff', INK, 1.5); }
  }
}
function oppArm(S, F, look, far) {
  var o = LOOKS[look];
  var mx = (S.x + F.x) / 2, my = (S.y + F.y) / 2, vx = F.x - S.x, vy = F.y - S.y, ln = Math.hypot(vx, vy) || 1;
  var px = -vy / ln, py = vx / ln; if (px < 0) { px = -px; py = -py; }
  var el = { x: mx + px * 14, y: my + py * 14 };
  line(S.x, S.y, el.x, el.y, INK, 25); line(S.x, S.y, el.x, el.y, far ? o.kimono2 : o.kimono, 19.5);
  line(el.x, el.y, F.x, F.y, INK, 14.5); line(el.x, el.y, F.x, F.y, look === 'doron' ? '#1a1e36' : (far ? SKIN2 : SKIN), 10);
}
function oppFist(F, look, far) { circ(F.x, F.y, 8.5); fs(look === 'doron' ? '#1a1e36' : (far ? SKIN2 : SKIN), INK, 2.5); }

/* ===== 刀・いたずらの品 ===== */
function drawWeapon(obj, h, a, glint) {
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (obj === 'katana') {
    rr(-36, -4.6, 40, 9.2, 3); fs('#1d1a2c', INK, 2);
    ctx.strokeStyle = '#c9b27a'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var i = -32; i < 0; i += 7) { ctx.moveTo(i, -4); ctx.lineTo(i + 3.5, 4); ctx.moveTo(i + 3.5, -4); ctx.lineTo(i, 4); } ctx.stroke();
    rr(-40, -5, 5, 10, 2); fs('#c9a54a');
    ell(6, 0, 3.6, 11.5); fs('#3a2f22', '#c9a54a', 1.8);
    rr(9, -4.6, 6, 9.2, 1); fs('#d8b452');
    var BL = 150, g = ctx.createLinearGradient(0, -5, 0, 5);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, '#d7dfea'); g.addColorStop(0.58, '#a9b5c6'); g.addColorStop(1, '#f1f5fb');
    ctx.beginPath(); ctx.moveTo(15, -4.2); ctx.quadraticCurveTo(15 + BL * 0.55, -6.4, 15 + BL - 12, -4.4); ctx.quadraticCurveTo(15 + BL, -3.2, 15 + BL + 3, 1.2);
    ctx.quadraticCurveTo(15 + BL - 6, 4.4, 15 + BL - 16, 4.2); ctx.quadraticCurveTo(15 + BL * 0.55, 3.6, 15, 4.2); ctx.closePath(); fs(g, INK, 1.6);
    ctx.beginPath(); ctx.moveTo(20, 1.8); for (var w = 26; w < BL; w += 8) ctx.quadraticCurveTo(w - 4, 0.4, w, 1.8); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2; ctx.stroke();
  } else if (obj === 'negi') {
    rr(-30, -4.5, 92, 9, 4.5); fs('#f6f8ee', INK, 2);
    ctx.beginPath(); ctx.moveTo(60, -4.5); ctx.lineTo(150, -3); ctx.lineTo(166, -9); ctx.lineTo(156, 0); ctx.lineTo(168, 7); ctx.lineTo(150, 3); ctx.lineTo(60, 4.5); ctx.closePath(); fs('#4caf50', INK, 2);
    line(64, 0, 146, 0, 'rgba(255,255,255,.35)', 2);
    ctx.strokeStyle = '#d8d0b0'; ctx.lineWidth = 1.2; ctx.beginPath(); for (var k = 0; k < 5; k++) { ctx.moveTo(-30, -3 + k * 1.5); ctx.lineTo(-38, -6 + k * 3); } ctx.stroke();
  } else if (obj === 'daikon') {
    [-0.5, 0, 0.5].forEach(function (aa) { ctx.save(); ctx.rotate(aa); ell(-22, 0, 20, 6); fs('#58a845', INK, 1.8); ctx.restore(); });
    ctx.beginPath(); ctx.moveTo(4, -14); ctx.quadraticCurveTo(80, -15, 146, -2); ctx.quadraticCurveTo(152, 0, 146, 2); ctx.quadraticCurveTo(80, 15, 4, 14); ctx.quadraticCurveTo(-4, 0, 4, -14); ctx.closePath(); fs('#fbfaf2', INK, 2);
    ctx.strokeStyle = 'rgba(160,150,120,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(40, -6); ctx.lineTo(52, -6); ctx.moveTo(80, 5); ctx.lineTo(96, 5); ctx.moveTo(110, -3); ctx.lineTo(120, -3); ctx.stroke();
    ell(14, 0, 9, 12); ctx.fillStyle = 'rgba(160,210,120,.45)'; ctx.fill();
  } else if (obj === 'harisen') {
    rr(-34, -5, 44, 10, 3); fs('#e74c3c', INK, 2); line(-20, -5, -20, 5, '#fff', 3); line(-6, -5, -6, 5, '#fff', 3);
    ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(150, -24); ctx.lineTo(150, 24); ctx.lineTo(10, 6); ctx.closePath(); fs('#fffdf4', INK, 2);
    ctx.strokeStyle = 'rgba(120,110,90,.55)'; ctx.lineWidth = 1.3; ctx.beginPath(); for (var f = -4; f <= 4; f++) { ctx.moveTo(12, f * 1.3); ctx.lineTo(150, f * 5.5); } ctx.stroke();
  } else if (obj === 'sanma') {
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-26, -11); ctx.lineTo(-22, 0); ctx.lineTo(-26, 11); ctx.closePath(); fs('#4d5d78', INK, 2);
    var sg = ctx.createLinearGradient(0, -9, 0, 9); sg.addColorStop(0, '#3b4a66'); sg.addColorStop(0.5, '#9fb0c8'); sg.addColorStop(1, '#eef2f7');
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(70, -11, 140, -6); ctx.quadraticCurveTo(162, -2, 168, 1); ctx.quadraticCurveTo(160, 5, 140, 7); ctx.quadraticCurveTo(70, 10, -6, 2); ctx.closePath(); fs(sg, INK, 2);
    circ(148, -1, 3.2); fs('#fff', INK, 1.4); circ(148.5, -1, 1.5); fs(INK);
    line(136, -6, 132, 6, 'rgba(40,40,60,.6)', 1.5);
  }
  if (glint) {
    var gs = Math.sin(clamp(glint.t / 0.3, 0, 1) * Math.PI);
    ctx.save(); ctx.translate(glint.at, -2); ctx.rotate(-a + 0.3);
    var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 22 * gs + 0.01); rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-24, -24, 48, 48); star4(0, 0, 18 * gs, '#fff');
    ctx.restore();
  }
  ctx.restore();
}
function drawTrail() {
  if (!R || R.outcome || R.trail.length < 2) return;
  var tr = R.trail;
  for (var i = 1; i < tr.length; i++) {
    var p0 = tr[i - 1], p1 = tr[i]; if (p1 - p0 < 0.004) continue;
    var h0 = handAt(p0), h1 = handAt(p1), a0 = angAt(p0), a1 = angAt(p1);
    ctx.beginPath();
    ctx.moveTo(h0.x + Math.cos(a0) * 30, h0.y + Math.sin(a0) * 30); ctx.lineTo(h0.x + Math.cos(a0) * 168, h0.y + Math.sin(a0) * 168);
    ctx.lineTo(h1.x + Math.cos(a1) * 168, h1.y + Math.sin(a1) * 168); ctx.lineTo(h1.x + Math.cos(a1) * 30, h1.y + Math.sin(a1) * 30); ctx.closePath();
    ctx.fillStyle = R.cfg.ougi ? 'rgba(255,240,140,' + (0.12 + 0.1 * i) + ')' : 'rgba(255,255,255,' + (0.06 + 0.07 * i) + ')'; ctx.fill();
  }
}

/* ===== 場面をまとめて描く ===== */
function sceneState() {
  var st = { p: 0, jitter: 0, opEx: 'idle', face: 'ready', palm: null, obj: 'katana', glint: null };
  var c0 = bladePt(PC, CATCH_DIST), aC = angAt(PC);
  var gapOpen = 30, gapShut = 8;
  st.palm = { x: c0.x, y: c0.y, a: aC, gap: gapOpen + Math.sin(G.at * 3) * 1.5 };
  if (G.state !== 'play' || !R) { if (G.state === 'over') st.face = G.caught >= 11 ? 'proud' : 'hit'; return st; }
  st.obj = R.cfg.obj; st.glint = R.glint;
  var p = R.p;
  if (G.phase === 'round') {
    var cur = progAt(R.segs, R.tau);
    st.opEx = cur.seg.k === 'move' ? 'swing' : cur.seg.k === 'pause' ? 'smug' : 'idle';
    if (R.whiff) st.face = 'whiff';
    if (R.clap) {
      var since = R.tau - R.clap.t;
      var shut = R.pending ? 1 : (since < 0.12 ? 1 : clamp(1 - (since - 0.12) / 0.12, 0, 1));
      st.palm.gap = lerp(gapOpen, gapShut, shut * clamp(since / 0.04, 0, 1));
    }
  } else if (G.phase === 'resolve') {
    var t = G.pt;
    if (R.outcome === 'catch') {
      st.face = 'proud'; st.opEx = 'shock';
      var hold = t < 0.8;
      if (hold) { st.jitter = Math.sin(G.at * 70) * 0.012 * (t > 0.15 ? 1 : 0); }
      else p = lerp(R.catchP, 0, easeOut((t - 0.8) / 0.5));
      var bp = bladePt(R.catchP, CATCH_DIST);
      st.palm = { x: bp.x, y: bp.y, a: angAt(R.catchP) + st.jitter, gap: hold ? gapShut : lerp(gapShut, gapOpen, clamp((t - 0.8) / 0.2, 0, 1)) };
      if (hold) st.palm.x += Math.sin(G.at * 70) * 1.2;
    } else {
      st.face = 'hit'; st.opEx = 'smug';
      if (t > 0.5) p = lerp(1, 0, easeOut((t - 0.5) / 0.55));
      if (R.whiff) st.palm.gap = gapOpen;
    }
  }
  st.p = p;
  return st;
}
function drawScene() {
  var st = sceneState(), look = OPPS[curStage()].look, bob = Math.sin(G.at * 2.6) * 1.6;
  var p = st.p, h = handAt(p), a = angAt(p) + st.jitter, u = { x: Math.cos(a), y: Math.sin(a) };
  var sh = oppShoulders(bob);
  var f1 = { x: h.x - u.x * 6, y: h.y - u.y * 6 }, f2 = { x: h.x - u.x * 24, y: h.y - u.y * 24 };
  ctx.save();
  ctx.translate(L.left, L.top); ctx.scale(L.sc, L.sc);
  ell(112, 440, 72, 9); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(); ell(264, 440, 58, 9); ctx.fill();   // かげ
  if (R && R.cfg.ougi && G.phase !== 'resolve') {   // 奥義のオーラ
    var pul = 0.6 + 0.4 * Math.sin(G.at * 12);
    var og = ctx.createRadialGradient(264, 260, 30, 264, 260, 190); og.addColorStop(0, 'rgba(255,50,30,' + 0.75 * pul + ')'); og.addColorStop(0.55, 'rgba(255,90,40,' + 0.3 * pul + ')'); og.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = og; ctx.fillRect(60, 60, 400, 400);
  }
  drawOppBody(look, bob);
  oppArm(sh.f, f2, look, true);
  oppArm(sh.n, f1, look, false);
  drawOppHead(look, st.opEx, bob);   // 腕は頭のうしろ(顔がかくれないように)。こぶしだけ 刀の上に描く
  drawDefBody();
  drawDefHead(st.face);
  drawTrail();
  drawWeapon(st.obj, h, a, st.glint);
  oppFist(f2, look, true); oppFist(f1, look, false);
  drawDefArms(st.palm);
  for (var i = 0; i < P.length; i++) {   // 場面のつぶ(髪・火花)
    var q = P[i]; if (q.scr) continue;
    var al = 1 - q.age / q.life;
    if (q.t === 'spark') { line(q.x, q.y, q.x - q.vx * 0.04, q.y - q.vy * 0.04, 'rgba(255,230,120,' + al + ')', 3); }
    else if (q.t === 'mage') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.globalAlpha = Math.min(1, al * 2); rr(-20, -5.5, 40, 11, 5.5); fs(HAIR, INK, 2.5); rr(-18, -7, 6, 14, 2); fs('#f4efe4', INK, 1.5); ctx.restore(); ctx.globalAlpha = 1; }
    else if (q.t === 'strand') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.globalAlpha = Math.min(1, al * 2); ctx.strokeStyle = HAIR; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-q.len / 2, 0); ctx.quadraticCurveTo(0, -5, q.len / 2, 0); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; }
    else if (q.t === 'star') { star4(q.x, q.y, 9 * al + 2, 'rgba(255,255,220,' + al + ')'); }
  }
  ctx.restore();
}
function drawScreenParticles() {
  for (var i = 0; i < P.length; i++) {
    var q = P[i]; if (!q.scr) continue;
    q.x += Math.sin(G.at * 1.5 + i) * 0.3;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r);
    if (q.t === 'petal') { ell(0, 0, 5, 3); ctx.fillStyle = 'rgba(255,200,215,.95)'; ctx.fill(); }
    else { ell(0, 0, 7, 2.2); ctx.fillStyle = 'rgba(90,150,60,.85)'; ctx.fill(); }
    ctx.restore();
  }
}
function drawBubble() {
  if (!BUB) return;
  var a = clamp(BUB.t / 0.08, 0, 1) * clamp((BUB.dur - BUB.t) / 0.15, 0, 1);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = '900 17px ' + FONT;
  var w = Math.max(70, ctx.measureText(BUB.s).width + 26), bx = clamp(sx(226), w / 2 + 6, W - w / 2 - 6), by = sy(44);
  var tail = { x: sx(240), y: sy(118) };
  rr(bx - w / 2, by - 18, w, 36, 18); fs('#fffdf6', INK, 3);
  ctx.beginPath(); ctx.moveTo(bx + 4, by + 16); ctx.lineTo(tail.x, Math.min(tail.y, by + 34)); ctx.lineTo(bx + 20, by + 14); ctx.closePath(); fs('#fffdf6');
  ctx.beginPath(); ctx.moveTo(bx + 4, by + 18); ctx.lineTo(tail.x, Math.min(tail.y, by + 34)); ctx.lineTo(bx + 20, by + 17); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  txt(BUB.s, bx, by + 1, 17, '#2a1712', 'center');
  ctx.restore();
}
function drawPops() {
  for (var i = 0; i < POPS.length; i++) {
    var q = POPS[i]; if (q.t < 0) continue;
    var k = q.t < 0.12 ? lerp(1.7, 1, q.t / 0.12) : 1, al = clamp((0.95 - q.t) / 0.25, 0, 1);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(clamp(q.x, 80, W - 80), q.y - q.t * 18); ctx.rotate(-0.06); ctx.scale(k, k);
    txt(q.s, 0, 0, q.size, q.col, 'center', Math.max(6, q.size * 0.2));
    ctx.restore();
  }
}
function drawHUD() {   // 上: 何試合目・相手の名前・何本目。その下に 20個の丸(点数は わくの帯に出る)
  var op = OPPS[G.opp];
  var g = ctx.createLinearGradient(0, VY, 0, 84); g.addColorStop(0, 'rgba(20,6,8,.78)'); g.addColorStop(0.7, 'rgba(20,6,8,.45)'); g.addColorStop(1, 'rgba(20,6,8,0)');
  ctx.fillStyle = g; ctx.fillRect(VX - 10, VY - 10, VW + 20, 94 - VY);
  txt(op.no, 14, 17, 13, '#f4c542', 'left', 0, FONT, 800);
  ctx.font = '800 13px ' + FONT; var nw = ctx.measureText(op.no).width;
  txt(op.name, 20 + nw, 17, 15, '#fff', 'left', 0, FONT, 900);
  txt((Math.min(G.round, N - 1) + 1) + '本目 / ' + N, W - 14, 17, 14, '#fff6e6', 'right', 0, FONT, 800);
  var dot = 11, gap = 3.2, grp = 9, tw = 20 * dot + 19 * gap + 3 * grp, x0 = (W - tw) / 2, yd = 42;
  for (var i = 0; i < N; i++) {
    var x = x0 + i * (dot + gap) + Math.floor(i / 5) * grp + dot / 2, r = G.res[i];
    if (r === 'pita') { circ(x, yd, dot / 2 + 0.5); fs('#ffd34d', '#fff', 1.6); }
    else if (r === 'ok' || r === 'giri') { circ(x, yd, dot / 2); fs('#f4c542'); }
    else if (r === 'x') { circ(x, yd, dot / 2); fs('#c0392b'); line(x - 2.6, yd - 2.6, x + 2.6, yd + 2.6, '#fff', 1.8); line(x + 2.6, yd - 2.6, x - 2.6, yd + 2.6, '#fff', 1.8); }
    else if (i === G.round) { circ(x, yd, dot / 2 + Math.sin(G.at * 6) * 0.8); fs('rgba(255,255,255,.25)', '#fff', 2); }
    else { circ(x, yd, dot / 2 - 0.5); fs(null, 'rgba(255,255,255,.4)', 1.5); }
  }
}
function drawHint() {
  if (G.hint <= 0.02 || !(G.phase === 'round' || G.phase === 'resolve')) return;
  var y = L.fy + clamp((H - L.fy) * 0.3, 18, 40);   // 床のすぐ下(左下の「やめる」に かからないように)
  ctx.save(); ctx.globalAlpha = Math.min(1, G.hint);
  var s = G.round < 2 ? '刀が 手にとどく瞬間に タップ!' : '早すぎると「スキあり」!';
  ctx.font = '900 16px ' + FONT; var w = ctx.measureText(s).width + 34;
  rr(W / 2 - w / 2, y - 19, w, 38, 19); fs('rgba(20,6,8,.62)', 'rgba(255,255,255,.5)', 1.5);
  txt(s, W / 2, y + 1, 16, '#fff6e6', 'center');
  ctx.restore();
}
function drawIntro() {   // 「第一試合 見習い 剣太郎」の紹介
  var op = OPPS[G.opp], t = G.pt, D = 2.1;
  var a = clamp(t / 0.2, 0, 1) * clamp((D - t) / 0.25, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(10,3,4,' + 0.55 * a + ')'; full();
  var off = (1 - easeOut(t / 0.35)) * W, cy = H * 0.42;
  ctx.translate(off, 0); ctx.globalAlpha = a;
  var bg = ctx.createLinearGradient(0, cy - 80, 0, cy + 80); bg.addColorStop(0, '#3a0b0b'); bg.addColorStop(0.5, '#140405'); bg.addColorStop(1, '#3a0b0b');
  ctx.fillStyle = bg; ctx.fillRect(VX - 10, cy - 78, VW + 20, 156);
  ctx.fillStyle = '#f4c542'; ctx.fillRect(VX - 10, cy - 80, VW + 20, 3); ctx.fillRect(VX - 10, cy + 77, VW + 20, 3);
  txt(op.no, W / 2, cy - 44, 22, '#f4c542', 'center', 0, FONT_M, 900);
  txt(op.name, W / 2, cy + 2, 36, '#fff', 'center', 7, FONT_M, 900);
  txt('「' + op.line + '」', W / 2, cy + 48, 16, '#ffe9d0', 'center', 0, FONT, 800);
  ctx.restore();
  if (t > 0.5) { ctx.save(); ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(G.at * 5)); txt('タップで はじめる', W / 2, cy + 112, 14, '#fff', 'center', 4); ctx.restore(); }
}
function drawOugi() {   // 最後の1本の前の「奥義 稲妻斬り」
  var t = G.pt, a = clamp(t / 0.15, 0, 1) * clamp((1.9 - t) / 0.25, 0, 1), cy = H * 0.4;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + 0.6 * a + ')'; full();
  if (t < 0.25) { ctx.fillStyle = 'rgba(230,235,255,' + (0.25 - t) * 3 + ')'; full(); }
  ctx.globalAlpha = a;
  txt('最後の1本', W / 2, cy - 50, 22, '#f4c542', 'center', 5, FONT_M, 900);
  var k = t < 0.3 ? lerp(1.6, 1, t / 0.3) : 1;
  ctx.translate(W / 2, cy + 10); ctx.scale(k, k);
  txt('奥義 稲妻斬り', 0, 0, 40, '#ff4b3a', 'center', 8, FONT_M, 900);
  ctx.restore();
  if ((t * 7) % 1 < 0.3) {   // いなずま
    ctx.save(); ctx.strokeStyle = 'rgba(255,250,200,.9)'; ctx.lineWidth = 3; ctx.beginPath();
    var lx = 40 + ((t * 977) % 280), ly = -10; ctx.moveTo(lx, ly);
    for (var i = 0; i < 6; i++) { lx += rnd(-24, 24); ly += H * 0.08; ctx.lineTo(lx, ly); }
    ctx.stroke(); ctx.restore();
  }
}

/* ===== 描く(cw・ch = 画面の大きさ。論理座標に 拡大して まん中へ) ===== */
function render(cw, ch) {
  if (cw !== CW || ch !== CH || Math.min(window.devicePixelRatio || 1, 2) !== DPR) layout(cw, ch);
  var stg = OPPS[curStage()].bg, play = G.state === 'play';
  ctx.fillStyle = '#140c0d'; ctx.fillRect(-10, -10, cw + 20, ch + 20);   // 横向きの 左右の余白
  ctx.save(); ctx.translate(OX, OY); ctx.scale(SC, SC);
  ctx.save(); ctx.beginPath(); ctx.rect(BX0, BY0, BX1 - BX0, BY1 - BY0); ctx.clip();   // 横向きで 花びらが 余白に出ないように
  if (G.shake > 0) ctx.translate(rnd(-G.shake, G.shake) * 0.5, rnd(-G.shake, G.shake) * 0.5);
  var im = bgImage(stg), s = SC * DPR; ctx.drawImage(im, BX0, BY0, im.width / s, im.height / s);
  if (stg === 2) drawStars();
  if (R && R.cfg.ougi && G.phase === 'round') {
    ctx.fillStyle = 'rgba(10,0,10,.55)'; full();
    if ((G.at * 3.1) % 1 < 0.06) { ctx.fillStyle = 'rgba(230,235,255,.25)'; full(); }   // ときどき いなびかり
  }
  drawScene();
  drawScreenParticles();
  ctx.restore();
  if (play) { drawBubble(); drawPops(); drawHint(); }
  if (G.flash > 0) { ctx.fillStyle = 'rgba(' + G.flashCol + ',' + Math.min(0.8, G.flash) + ')'; full(); }
  if (play) {
    drawHUD();
    if (G.phase === 'intro') drawIntro();
    if (G.phase === 'ougi') drawOugi();
  }
  ctx.restore();
}

window.IZGAME.register({
  id: 'shirahadori', title: '🗡️ 真剣白刃取り', ver: '20本勝負', sec: 120,
  maxScore: function () { return N; },
  intro: function () {
    return '<p>ふりおろされる刀を、手にとどく瞬間に<br><b>タップ</b>して受け止める!(1本に1回)<br>早すぎると「スキあり」でやられる。<br>相手は4人、全部で <b>20本</b>勝負。</p>';
  },
  init: function (k) { K = k; G = fresh(); R = null; P = []; POPS = []; BUB = null; },
  start: function (k, seed) {   // もう一回でも 全部 作り直す
    K = k; G = fresh(); G.state = 'play'; G.plan = buildPlan(k.rng('shirahadori:' + seed));
    R = null; P = []; POPS = []; BUB = null; acc = 0; lastNow = 0;
    startIntro(0);
    if (window.__izgDebug) window.__izgDebug.shirahadori = { G: G, R: function () { return R; }, PC: PC };   // 確認用の道具だけが使う
  },
  update: function (k, dt) {
    var now = performance.now();
    if (lastNow && now - lastNow > 400 && G.phase === 'round' && R && !R.outcome && !R.clap) startRound();   // 画面を はなれていた → その1本は やりなおし(公平に)
    lastNow = now;
    acc = Math.min(acc + dt, 0.1);
    while (acc >= DT) { step(DT); acc -= DT; }
  },
  draw: function (k, g, cw, ch) { ctx = g; render(cw, ch); },
  pointer: function (k, p, type) { if (type === 'down' && k.phase === 'play') clap(); },
  key: function (k, key) { if (key === ' ' || key === 'Enter' || key === 'ArrowUp') clap(); },
  stop: function () { if (bgC) { bgC.width = bgC.height = 0; bgC = null; } bgKey = ''; CW = CH = 0; },   // お店に もどるとき 背景の絵を 手ばなす
  result: function () { var n = G ? G.caught : 0; return '受け止めた ' + n + '本 / ' + N + '本 ・ 【' + rankOf(n)[0] + '】'; }
});
})();
