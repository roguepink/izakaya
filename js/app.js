'use strict';
/* =====================================================================
   居酒屋の進行係 —— 入口・アバター作り・予約・お店の中(会話・注文・曲・決まり文句の声)・閉店。
   お店の中身(席の数・メニュー・曲・営業日)は js/config.js、アバターの部品は js/avatar-data.js。
   ===================================================================== */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LOCAL = !(SHOP.FIREBASE && SHOP.FIREBASE.databaseURL) || /[#&]local\b/.test(location.hash);
  var OWNER_MODE = !!window.IZ_OWNER || /[#&]owner\b/.test(location.hash);   // 大将用のページ(owner.html)か、アドレスの最後に #owner
  /* 席の数: 回ごとに変えられる(上限 SHOP.MAX_SEATS)。3Dのカウンターは読みこんだときの数で作るので、
     次の回の席の数がちがうときは、店に入る前に ページを読みなおして合わせる(checkSeats) */
  var MAXS = Math.max(1, Math.min(20, SHOP.MAX_SEATS || 12));
  function clampSeats(v) { return Math.max(1, Math.min(MAXS, (v | 0) || (SHOP.SEATS | 0) || 7)); }
  var N = clampSeats((function () { try { return +sessionStorage.getItem('iz-seats') || +localStorage.getItem('iz-seats') || SHOP.SEATS; } catch (e) { return SHOP.SEATS; } })());
  var JST = 9 * 3600e3, MIN = 60e3, DAY = 86400e3;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------------- 自分(この端末)の情報 ---------------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var ME = lsGet('iz-me', null);
  if (!ME || !ME.uid) {
    ME = { uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: '', avatar: null };
    lsSet('iz-me', ME);
  }
  ME.avatar = AVATAR.fix(ME.avatar);   // 古い形(1代目)なら null → 女性/男性 から作りなおしてもらう
  var ownerAvatar = AVATAR.fix(lsGet('iz-owner-avatar', null)) || AVATAR.fix(AVATAR.OWNER);
  function myAvatar() { return OWNER_MODE ? ownerAvatar : ME.avatar; }
  function saveMe() { lsSet('iz-me', ME); }

  /* ---------------- 時間(日本時間で計算する) ---------------- */
  function jst(ts) { var d = new Date(ts + JST); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay(), hh: d.getUTCHours(), mi: d.getUTCMinutes() }; }
  function fromJst(y, m, d, hh, mi) { return Date.UTC(y, m, d, hh, mi) - JST; }
  function hm(s) { var p = String(s).split(':'); return [+p[0] || 0, +p[1] || 0]; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDay(ts) { var j = jst(ts); return (j.m + 1) + '月' + j.d + '日(' + WEEK[j.w] + ')'; }
  function fmtTime(ts) { var j = jst(ts); return j.hh + ':' + pad(j.mi); }
  function sessKey(start) { var j = jst(start); return j.y + pad(j.m + 1) + pad(j.d) + '-' + pad(j.hh) + pad(j.mi); }
  function keyTs(key) { var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(key || ''); return m ? fromJst(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : 0; }
  function dayOf(ts) { var j = jst(ts); return j.y + '-' + j.m + '-' + j.d; }

  /* ---------------- お知らせ(news.json)と 回ごとの予定 ----------------
     news.json はホームページと同じものを読む。店のデータの schedule/<回のキー> があれば そちらが勝つ */
  var NEWS = null;
  function weekly() { return NEWS && NEWS.weekly && NEWS.weekly.length ? NEWS.weekly : SHOP.SCHEDULE; }
  function newsEvents() {   // news.json の events を {key,start,end,plan} に
    return ((NEWS && NEWS.events) || []).map(function (ev) {
      var d = String(ev.date || '').split('-'), a = hm(ev.start || '21:00'), e = hm(ev.end || '22:00');
      if (d.length !== 3) return null;
      var st = fromJst(+d[0], +d[1] - 1, +d[2], a[0], a[1]), en = fromJst(+d[0], +d[1] - 1, +d[2], e[0], e[1]);
      if (en <= st) en += DAY;
      return { key: sessKey(st), start: st, end: en, plan: { title: ev.title || '', master: ev.master || '', seats: ev.seats || 0, message: ev.message || '', cancel: !!ev.cancel } };
    }).filter(Boolean);
  }
  /* その回の決まり(店の名前・マスター・席の数・ひとこと・休み)。news.json の上に 店のデータを重ねる */
  function plan(key) {
    var o = {};
    newsEvents().forEach(function (e) { if (e.key === key) o = Object.assign(o, e.plan); });
    var t = ((tree && tree.schedule) || {})[key];
    if (t) Object.keys(t).forEach(function (k) { if (t[k] !== null && t[k] !== undefined) o[k] = t[k]; });
    return o;
  }
  function upcoming(now, days, withCancelled) {
    var out = [], seen = {};
    function add(x) { if (seen[x.key] || x.end <= now || x.start > now + (days + 1) * DAY) return; seen[x.key] = 1; out.push(x); }
    var evs = newsEvents(), evDays = {};
    evs.forEach(function (e) { evDays[dayOf(e.start)] = 1; });
    var sched = (tree && tree.schedule) || {};
    Object.keys(sched).forEach(function (k) { if (sched[k] && sched[k].extra && sched[k].replace) evDays[dayOf(keyTs(k))] = 1; });
    for (var i = -1; i <= days; i++) {
      var b = jst(now + i * DAY);
      weekly().forEach(function (s) {
        if (b.w !== s.day) return;
        var a = hm(s.start), e = hm(s.end);
        var st = fromJst(b.y, b.m, b.d, a[0], a[1]), en = fromJst(b.y, b.m, b.d, e[0], e[1]);
        if (en <= st) en += DAY;
        var k = sessKey(st);
        if (evDays[dayOf(st)] && !evs.some(function (x) { return x.key === k; })) return;   // その日はお知らせの回に置きかえ
        add({ start: st, end: en, key: k });
      });
    }
    evs.forEach(function (e) { add({ start: e.start, end: e.end, key: e.key }); });
    Object.keys(sched).forEach(function (k) {   // 臨時の日
      var t = sched[k]; if (!t || !t.extra) return;
      var st = keyTs(k); if (!st) return;
      var e = hm(t.end || '23:00'), j = jst(st), en = fromJst(j.y, j.m, j.d, e[0], e[1]); if (en <= st) en += DAY;
      add({ start: st, end: en, key: k });
    });
    out.forEach(function (x) { x.plan = plan(x.key); });
    if (!withCancelled) out = out.filter(function (x) { return !x.plan.cancel; });
    out.sort(function (x, y) { return x.start - y.start; });
    return out;
  }
  /* いまの回か、次の回 */
  var csMemo = null, csAt = 0, csTree = null, csNews = null;
  function curSession() {   // 毎フレーム呼ばれるので、1秒は 前の答えを使う
    var t = Date.now();
    if (csMemo !== null && t - csAt < 1000 && csTree === tree && csNews === NEWS) return csMemo;
    csAt = t; csTree = tree; csNews = NEWS;
    return (csMemo = curSession0());
  }
  function curSession0() {
    var n = now(), st0 = status(n);
    if (st0.phase !== 'closed' && st0.key) { var p0 = upcoming(n - DAY, 2).filter(function (x) { return x.key === st0.key; })[0]; if (p0) return p0; }
    return st0.next || null;
  }
  function shopName() { var c = curSession(); return (c && c.plan && c.plan.title) || SHOP.NAME; }
  function seatsFor(sess) { return clampSeats((sess && sess.plan && sess.plan.seats) || SHOP.SEATS); }

  function status(now) {
    var st = (tree && tree.state) || {};
    if (st.forceUntil && st.forceUntil > now && !(st.closedAt > st.forceFrom)) {
      return { phase: 'open', start: st.forceFrom, end: st.forceUntil, key: 'f' + st.forceFrom, forced: true, lastCall: now >= st.forceUntil - SHOP.LAST_CALL_BEFORE * MIN };
    }
    var list = upcoming(now, 8);
    var s = list[0];
    if (s && st.closedAt && st.closedAt >= s.start - SHOP.DOORS_OPEN_BEFORE * MIN && st.closedAt < s.end) { s = list[1]; }   // 早じまいした回
    if (s && now >= s.start - SHOP.DOORS_OPEN_BEFORE * MIN) {
      return { phase: now >= s.start ? 'open' : 'doors', start: s.start, end: s.end, key: s.key, lastCall: now >= s.end - SHOP.LAST_CALL_BEFORE * MIN };
    }
    return { phase: 'closed', next: s || null };
  }

  /* ---------------- つなぐ ---------------- */
  var net = null, tree = {}, roomName = '';
  function connect(room) {
    if (net && roomName === room) return;
    roomName = room;
    net = Net.connect(room);
    net.on(onTree);
  }
  function roomFor(pass) {
    if (!SHOP.PASSCODE_HASH) return Promise.resolve('main');
    return Net.sha256(pass).then(function (h) {
      if (h !== SHOP.PASSCODE_HASH) throw new Error('pass');
      return Net.sha256('room:' + pass).then(function (r) { return 'r' + r.slice(0, 20); });
    });
  }
  function now() { return net ? net.now() : Date.now(); }
  var TS = { '.sv': 'timestamp' };

  /* ---------------- 3D(動かなければ 2D の代わり) ---------------- */
  var scene = null, sceneWait = [];
  function withScene(fn) { if (scene) fn(scene); else sceneWait.push(fn); }
  function start3D() {
    if (scene) return;
    try {
      if (!window.IZ3D) throw new Error('no 3d');
      scene = window.IZ3D.createShop($('stage'), { seats: N, name: shopName() });
    } catch (e) {
      console.warn('3D が使えないので 2D にします', e);
      scene = make2D();
    }
    scene.onTap = function (seat) { if (seat >= 0) onSeatTap(seat); };
    scene.onAvatarTap = function (k) { replyToSeat(k, true); };
    scene.onItemTap = function (seat, key) { if (inside && seat === mySeat && !OWNER_MODE) eat(key); };
    scene.onTagTap = function (id) {   // 壁の木札を押すと、すぐ注文(取り消しもできる)
      if (!inside || OWNER_MODE) return;
      order(id);
    };
    scene.onFrame = function () { placeOverlays(); placeTV(); };
    scene.onMonitorTap = function () { if ($('tv').classList.contains('hidden')) { if (inside) openSheet('music'); } else tvBig(true); };   // 何も流れていない時は、動画を選ぶ画面
    sceneWait.forEach(function (fn) { fn(scene); }); sceneWait = [];
    if (typeof PERF !== 'undefined' && PERF && scene.setPerf) scene.setPerf({ fps: PERF[perfMode].fps, ratio: PERF[perfMode].ratio });
    applyTree();
  }
  if (window.IZ3D) setTimeout(start3D, 0);
  else {
    window.addEventListener('iz3d-ready', start3D);
    var waited = 0;
    (function poll() { if (scene) return; if (window.IZ3D_FAIL || waited > 5000) { start3D(); return; } waited += 250; setTimeout(poll, 250); })();
  }
  function make2D() {
    document.body.classList.add('no3d');
    var strip = $('strip2d'); strip.classList.remove('hidden');
    var els = [];
    var ownerEl = document.createElement('div'); ownerEl.className = 's2 on'; ownerEl.style.width = '100%';
    ownerEl.innerHTML = '<div class="f">👨‍🍳</div>'; strip.appendChild(ownerEl);
    for (var i = 0; i < N; i++) {
      var d = document.createElement('div'); d.className = 's2'; d.innerHTML = '<div class="f">🪑</div><div class="n">' + (i + 1) + '番</div>';
      (function (k) { d.addEventListener('click', function () { if (api.onTap) api.onTap(k); }); })(i);
      strip.appendChild(d); els.push(d);
    }
    function pos(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top, d: 3 }; }
    var seated = [];
    var api = {
      onTap: null, onFrame: null,
      setSeats: function (list) { seated = list; list.forEach(function (s, i) { els[i].classList.toggle('on', !!s); els[i].firstChild.textContent = s ? '🙂' : '🪑'; }); },
      setOwner: function () {}, ownerGoTo: function () {}, setTables: function () {}, setView: function () {},
      cheer: function () {}, cheerAll: function () {}, talk: function () {},
      anchors: function () { return { seats: els.map(function (e, i) { return seated[i] ? pos(e) : null; }), owner: pos(ownerEl), empty: els.map(pos) }; }
    };
    (function loop() { requestAnimationFrame(loop); if (api.onFrame) api.onFrame(); })();
    return api;
  }

  /* ---------------- 音(曲・決まり文句の声・合図の音) ---------------- */
  var vol = lsGet('iz-vol', 0.6);
  var audio = new Audio(); audio.preload = 'auto'; audio.crossOrigin = null;
  var audioUnlocked = false, duck = 1;
  function setVol() { var v = Math.max(0, Math.min(1, vol * duck)); audio.volume = v; if (tvVideo) tvVideo.volume = v; ytCmd('setVolume', [Math.round(v * 100)]); }
  function unlockAudio() {
    if (audioUnlocked) return; audioUnlocked = true;
    try { audio.muted = true; var p = audio.play(); if (p && p.then) p.then(function () { audio.pause(); audio.muted = false; }).catch(function () { audio.muted = false; }); } catch (e) {}
    try { if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  var actx = null;
  function ding() {
    if (!actx) return;
    try {
      var t = actx.currentTime;
      [880, 1320].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.25 * vol + 0.02, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
        o.connect(g); g.connect(actx.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.55);
      });
    } catch (e) {}
  }
  var voiceMissing = {};
  function speak(text, voiceIdx) {
    if (!window.speechSynthesis) return;
    try {
      var v = AVATAR.VOICES[voiceIdx] || AVATAR.VOICES[1];
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; u.pitch = v.pitch; u.rate = v.rate; u.volume = Math.min(1, vol + 0.3);
      var jv = speechSynthesis.getVoices().filter(function (x) { return /ja/i.test(x.lang); })[0];
      if (jv) u.voice = jv;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function playPhrase(ph, voiceIdx) {
    if (!inside) return;
    duck = 0.35; setVol();
    setTimeout(function () { duck = 1; setVol(); }, 2200);
    if (ph.voice && !voiceMissing[ph.voice]) {
      var a = new Audio(ph.voice);
      a.volume = Math.min(1, vol + 0.3);
      a.onerror = function () { voiceMissing[ph.voice] = 1; speak(ph.say, ph.who === 'owner' ? 0 : voiceIdx); };
      var p = a.play(); if (p && p.catch) p.catch(function () {});
      return;
    }
    speak(ph.say, ph.who === 'owner' ? 0 : voiceIdx);
  }

  /* ---------------- 曲を みんなで そろえる ---------------- */
  var curKey = '', ytOn = false, ytState = -1, ytLoadedAt = 0;
  function musicKey(m) { return m ? m.id + '@' + m.start : ''; }
  function elapsed(m) { return Math.max(0, (now() - m.start) / 1000); }
  function syncMusic() {
    var m = tree.state && tree.state.music;
    var k = musicKey(m);
    if (!inside) { if (curKey) { audio.pause(); hideYT(); curKey = ''; } return; }
    if (k !== curKey) {
      curKey = k;
      audio.pause(); hideYT();
      if (!m) { $('npTitle').textContent = '—'; tvInfo('', '', false); return; }
      $('npTitle').textContent = m.title + (m.byName ? '(' + m.byName + 'さんのリクエスト)' : '');
      tvInfo(m.kind === 'file' || !m.kind ? m.title : '', m.byName ? m.byName + 'さんのリクエスト' : '', m.kind === 'yt' || m.kind === 'video');
      tvShape(m.kind === 'yt' && m.tall);
      if (m.kind === 'yt') { showYT(m); }
      else if (m.kind === 'video') { showVideo(m); }
      else {
        audio.src = m.src;
        var go = function () { try { audio.currentTime = elapsed(m); } catch (e) {} setVol(); var p = audio.play(); if (p && p.catch) p.catch(needTap); };
        if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
      }
      return;
    }
    if (!m) return;
    var el = m.kind === 'video' ? tvVideo : m.kind === 'yt' ? null : audio;
    if (el && el.src && !el.paused && isFinite(el.duration)) {
      var want = elapsed(m);
      if (want < el.duration - 1 && Math.abs(el.currentTime - want) > 1.5) { try { el.currentTime = want; } catch (e) {} }
    }
  }
  function tvInfo(title, sub, playing) { withScene(function (sc) { if (sc.setMonitor) sc.setMonitor({ title: title, sub: sub, playing: !!playing }); }); }
  var tapAsked = false;
  function needTap() {
    if (tapAsked) return; tapAsked = true;
    toast('🔈 画面を一度さわると、曲が流れます', 4000);
    var f = function () { tapAsked = false; curKey = ''; syncMusic(); document.removeEventListener('pointerdown', f, true); };
    document.addEventListener('pointerdown', f, true);
  }
  audio.addEventListener('ended', function () { if (amLeader()) advance(curKey); });
  audio.addEventListener('error', function () { var k = curKey; if (amLeader()) setTimeout(function () { advance(k); }, 3000); });   // 3秒のあいだに次の曲に変わっていたら、それは飛ばさない
  function advance(fromKey) {
    var st = tree.state || {};
    if (musicKey(st.music) !== fromKey) return;
    var q = tree.queue || {}, keys = Object.keys(q).sort();
    var next;
    if (keys.length) { next = q[keys[0]]; net.remove('queue/' + keys[0]); }
    else {
      var pool = SHOP.SONGS.filter(function (s) { return !st.music || s.id !== st.music.id; });
      if (!pool.length) pool = SHOP.SONGS;
      if (!pool.length) return;
      var s = pool[Math.floor(Math.random() * pool.length)];
      next = { kind: 'file', id: s.id, src: s.src, title: s.title };
    }
    net.set('state/music', { kind: next.kind || 'file', id: next.id || ('q' + Date.now()), src: next.src, title: next.title, tall: !!next.tall, by: next.by || '', byName: next.byName || '', start: TS });
  }
  /* YouTube(公式の埋めこみ。部品は読みこまず、合図だけ送る) */
  function ytId(url) {
    var m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : '');
  }
  /* 動画は「大将のうしろのモニター」に重ねて流す。
     モニターが見えない向き(大将の目線など)では左上の小窓、モニターを押すと大きく */
  var tvMode = 'monitor', tvVideo = null, ytMuted = false, ytSeekAt = 0, tvCss = '';
  var TVW = 640, TVH = 360, tvBigAt = 0, tvTall = false;
  function tvShape(tall) {   // 縦長の動画はモニターも縦に
    tall = !!tall; if (tall === tvTall) return; tvTall = tall;
    TVW = tall ? 360 : 640; TVH = tall ? 640 : 360;
    $('tv').style.width = TVW + 'px'; $('tv').style.height = TVH + 'px'; tvCss = ''; tvClip = '';
    withScene(function (sc) { if (sc.setMonitorShape) sc.setMonitorShape(tall); });
  }
  function tvShow(on) { $('tv').classList.toggle('hidden', !on); if (!on) tvBig(false); }
  function showYT(m) {
    var id = ytId(m.src); if (!id) return;
    if (m.dur > 0 && elapsed(m) > m.dur - 1) return;   // もう終わっている動画は流さない(次へ進むのを待つ)
    ytOn = true; ytState = -1; ytLoadedAt = Date.now(); ytMuted = false; ytReady = false; ytDur = 0; ytLastCT = 0;
    var f = document.createElement('iframe');
    f.allow = 'autoplay; encrypted-media; fullscreen'; f.allowFullscreen = true;
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&enablejsapi=1&controls=1&rel=0&iv_load_policy=3&fs=1&cc_load_policy=0&start=' + Math.floor(elapsed(m)) + '&origin=' + encodeURIComponent(location.origin);
    f.onload = function () { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) {} setVol(); [800, 2500, 6000].forEach(function (t) { setTimeout(ytNoCaptions, t); }); };
    $('tvHolder').innerHTML = ''; $('tvHolder').appendChild(f);
    tvShow(true);
    // 音つきで始まらないスマホでは、音を消して絵だけ先に動かす(モニターを押すと音が出る)
    setTimeout(function () { if (ytOn && ytState !== 1 && ytState !== 0 && ytState !== 2 && $('tvHolder').firstChild === f) { ytCmd('mute'); ytCmd('playVideo'); ytMuted = true; tvBadge(); } }, 5000);
  }
  function showVideo(m) {
    var v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = m.src;
    v.addEventListener('ended', function () { if (amLeader()) advance(curKey); });
    v.addEventListener('error', function () { var k = curKey; if (amLeader()) setTimeout(function () { advance(k); }, 3000); });
    v.addEventListener('loadedmetadata', function () { if (tvVideo === v) { tvShape(v.videoHeight > v.videoWidth); var mm = tree.state && tree.state.music; if (mm && musicKey(mm) === curKey && !(mm.dur > 0) && isFinite(v.duration) && v.duration > 1) net.update('state/music', { dur: Math.round(v.duration) }); } });
    var go = function () { try { v.currentTime = elapsed(m); } catch (e) {} setVol(); var p = v.play(); if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); tvBadge(); }); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    tvVideo = v;
    $('tvHolder').innerHTML = ''; $('tvHolder').appendChild(v);
    tvShow(true);
  }
  function hideYT() {
    ytOn = false; ytMuted = false;
    if (tvVideo) { try { tvVideo.pause(); } catch (e) {} tvVideo.removeAttribute('src'); tvVideo = null; }
    $('tvHolder').innerHTML = ''; tvShow(false); tvBadge(); tvShape(false);
  }
  function tvBadge() { $('tvBadge').classList.toggle('hidden', !(ytMuted || (tvVideo && tvVideo.muted)) || tvMode === 'big'); }
  function tvUnmute() {
    if (ytOn) { ytCmd('unMute'); if (ytState !== 0) ytCmd('playVideo'); ytMuted = false; setVol(); }
    if (tvVideo) { tvVideo.muted = false; var p = tvVideo.play(); if (p && p.catch) p.catch(function () {}); }
    tvBadge();
  }
  function tvBig(on) {
    if (on && $('tv').classList.contains('hidden')) return;
    var was = tvMode === 'big';
    if (on === was) return;
    tvMode = on ? 'big' : 'monitor'; if (on) tvBigAt = Date.now();
    $('tv').classList.add('anim'); setTimeout(function () { $('tv').classList.remove('anim'); }, 380);
    $('tv').classList.toggle('big', on); $('tvBack').classList.toggle('hidden', !on); $('tvClose').classList.toggle('hidden', !on);
    if (on) tvUnmute(); else document.body.classList.remove('tv-land');
    withScene(function (sc) { if (sc.setPerf) sc.setPerf({ rest: on }); });
    tvBadge(); tvCss = ''; placeTV();
  }
  /* 640×360 の箱を、画面の上の4つの点にぴったり合わせる(遠近もつける) */
  function quadMatrix(q) {
    var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var a, b, c = x0, d, e, f = y0, g = 0, h = 0;
    var den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-9 && (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6)) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3;
    var r = function (n) { return Math.round(n * 1e6) / 1e6; };
    return 'matrix3d(' + [a / TVW, d / TVW, 0, g / TVW, b / TVH, e / TVH, 0, h / TVH, 0, 0, 1, 0, c, f, 0, 1].map(r).join(',') + ')';
  }
  function placeTV() {
    var box = $('tv'), hid = box.classList.contains('hidden'); if (document.body.classList.contains('has-tv') === hid) document.body.classList.toggle('has-tv', !hid);
    if (hid) return;
    var css, mode;
    if (tvMode === 'big') {
      var vw = window.innerWidth, vh = window.innerHeight;
      var land = vw > vh, ar = TVW / TVH;   // 横向きは画面いっぱい(もどすボタンは右上)
      var w = land ? Math.min(vw, vh * ar) : Math.min(vw, (vh - 140) * ar), hh = w / ar;
      document.body.classList.toggle('tv-land', land);
      css = 'translate(' + Math.round((vw - w) / 2) + 'px,' + Math.round((vh - hh) / 2) + 'px) scale(' + (w / TVW).toFixed(4) + ')'; mode = 'big';
    } else {
      var q = scene && scene.monitorQuad ? scene.monitorQuad() : null;
      var wpx = q ? Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) : 0;
      var headHull = q && q.main && scene.ownerHeadHull ? scene.ownerHeadHull() : null;
      var seen = q ? shownPart(q) : 0;
      if (q && wpx > 56 && seen > 0.72 && seen * (1 - hiddenByHead(q, headHull)) > 0.6) { css = quadMatrix(q); mode = 'monitor'; }   // 帯や大将の頭で半分近く隠れるなら小窓
      else {   // モニターが見えない向きは左上の小窓
        var sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
        var small = OWNER_MODE && view === 'owner' && window.innerWidth > window.innerHeight && window.innerHeight < 520;   // 横向きの大将の画面は 小さめ(下に会話の欄)
        css = 'translate(10px,' + Math.round(sat + (small ? 84 : 92)) + 'px) scale(' + ((tvTall ? (small ? 60 : 100) : (small ? 136 : 168)) / TVW).toFixed(4) + ')'; mode = 'pip';
      }
    }
    box.classList.toggle('pip', mode === 'pip');
    if (css !== tvCss) { tvCss = css; box.style.transform = css; }
    // 大将の頭がモニターの前にあるときは、動画を頭の形に切りぬく
    var clip = 'none';
    if (mode === 'monitor') {
      var hull = headHull;
      if (hull && hull.length > 2) {
        var inv = quadInverse(q), loc = [], hit = false;
        hull.forEach(function (p) {
          var w = inv[6] * p.x + inv[7] * p.y + inv[8], u = (inv[0] * p.x + inv[1] * p.y + inv[2]) / w, v = (inv[3] * p.x + inv[4] * p.y + inv[5]) / w;
          if (u > -40 && u < TVW + 40 && v > -40 && v < TVH + 40) hit = true;
          loc.push(Math.round(u) + 'px ' + Math.round(v) + 'px');
        });
        if (hit) clip = 'polygon(evenodd, 0 0, ' + TVW + 'px 0, ' + TVW + 'px ' + TVH + 'px, 0 ' + TVH + 'px, 0 0, ' + loc.join(', ') + ', ' + loc[0] + ', 0 0)';
      }
    }
    if (clip !== tvClip) { tvClip = clip; box.style.clipPath = clip; box.style.webkitClipPath = clip; }
  }
  var tvClip = 'none';
  function hiddenByHead(q, hull) {   // 大将の頭でモニターがどのくらい隠れるか(だいたい)
    if (!hull || hull.length < 3) return 0;
    var bb = function (pts) { var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; }); return [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)]; };
    var a = bb(q), h = bb(hull);
    var ix = Math.max(0, Math.min(a[2], h[2]) - Math.max(a[0], h[0])), iy = Math.max(0, Math.min(a[3], h[3]) - Math.max(a[1], h[1]));
    return ix * iy * 0.8 / Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));   // 頭は丸いので四角の8割
  }
  function shownPart(q) {   // モニターが画面に入っている割合(だいたい)
    var xs = q.map(function (p) { return p.x; }), ys = q.map(function (p) { return p.y; });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    var a = (x1 - x0) * (y1 - y0); if (a <= 0) return 0;
    var top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0) + 96;   // 上の帯(店の名前・曲名)の下だけを「見えている」とする
    if (window.innerHeight < 520) top = 0;
    var ix = Math.max(0, Math.min(x1, window.innerWidth) - Math.max(x0, 0)), iy = Math.max(0, Math.min(y1, window.innerHeight) - Math.max(y0, top));
    return ix * iy / a;
  }
  function quadInverse(q) {   // 画面の点 → 640×360 の箱の中の点
    var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var g = 0, h = 0, den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-9 && (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6)) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
    var A = (x1 - x0 + g * x1) / TVW, B = (x3 - x0 + h * x3) / TVH, C = x0, D = (y1 - y0 + g * y1) / TVW, E = (y3 - y0 + h * y3) / TVH, F = y0, G = g / TVW, H = h / TVH;
    // [A B C; D E F; G H 1] の逆
    var i0 = E - F * H, i1 = C * H - B, i2 = B * F - C * E, i3 = F * G - D, i4 = A - C * G, i5 = C * D - A * F, i6 = D * H - E * G, i7 = B * G - A * H, i8 = A * E - B * D;
    return [i0, i1, i2, i3, i4, i5, i6, i7, i8];
  }
  $('tvCatch').onclick = function () { tvBig(true); };
  $('tvClose').onclick = function () { tvBig(false); };
  $('tvBack').onclick = function () { if (Date.now() - tvBigAt > 450) tvBig(false); };
  /* YouTube の字幕(CC)はいつも消す。見る人の YouTube の設定で勝手に出ることがあるので、始まり・切りかえのたびに消す合図を送る */
  var ytReady = false, ytDur = 0, ytLastCT = 0;
  function ytNoCaptions() { if (!ytReady) return; ytCmd('unloadModule', ['captions']); ytCmd('unloadModule', ['cc']); ytCmd('setOption', ['captions', 'track', {}]); }
  function ytCmd(func, args) {
    var f = $('tvHolder').firstChild; if (!f || !f.contentWindow || f.tagName !== 'IFRAME') return;
    try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    if (!/youtube/.test(e.origin)) return;
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    if (!d || !d.info) return;
    if (!ytReady) { ytReady = true; ytNoCaptions(); }
    var m = tree.state && tree.state.music, isYT = ytOn && m && m.kind === 'yt' && musicKey(m) === curKey;
    if (typeof d.info.duration === 'number' && d.info.duration > 1) { ytDur = d.info.duration; if (isYT && !(m.dur > 0)) net.update('state/music', { dur: Math.round(ytDur) }); }   // 動画の長さを みんなに知らせる
    if (typeof d.info.playerState === 'number') {
      if (d.info.playerState !== ytState) ytNoCaptions();
      ytState = d.info.playerState;
      if (ytState === 0 && isYT) { if (amLeader()) advance(curKey); else if (!m.ended) net.update('state/music', { ended: true }); }   // 終わった → 次へ(まとめ役でなければ「終わった」と知らせる)
    }
    if (typeof d.info.muted === 'boolean' && ytOn) { ytMuted = d.info.muted; tvBadge(); }
    var dur = (m && m.dur > 0) ? m.dur : ytDur;
    if (isYT && dur > 0 && elapsed(m) > dur + 0.5 && ytState === 1) { ytCmd('pauseVideo'); return; }   // 時間が過ぎたら止めて待つ(最初からくり返さない)
    // 戻った(ショート動画などが勝手に最初からくり返した) → 終わったことにする
    if (isYT && typeof d.info.currentTime === 'number') {
      if (ytLastCT - d.info.currentTime > 5 && Date.now() - ytSeekAt > 3000 && dur > 0 && elapsed(m) > dur - 8) { ytCmd('pauseVideo'); if (amLeader()) advance(curKey); else if (!m.ended) net.update('state/music', { ended: true }); }
      ytLastCT = d.info.currentTime;
    }
    // みんなと同じ所を見る(4秒以上ずれたら合わせる)。終わりの近く・終わったあとは合わせない
    if (isYT && typeof d.info.currentTime === 'number' && ytState === 1 && Date.now() - ytLoadedAt > 8000 && Date.now() - ytSeekAt > 10000 && !(dur > 0 && elapsed(m) > dur - 3)) {
      if (Math.abs(d.info.currentTime - elapsed(m)) > 4) { ytSeekAt = Date.now(); ytCmd('seekTo', [elapsed(m), true]); }
    }
  });

  /* ---------------- お店の様子が変わったら ---------------- */
  var inside = false, mySeat = -1, joinAt = 0, seenMine = false, seenChat = {}, seenEvt = {}, lastOrders = 0;
  var view = 'overview';
  function onTree(t) { tree = t || {}; applyTree(); }
  function members() { return tree.members || {}; }
  function fresh(m) { return m && now() - (m.seen || 0) < 50000; }
  var AWAY_MS = 3 * MIN;   // 自分で「帰る」を押さずに画面を閉じた人は、3分は席を取っておく(戻ればそのまま座れる)
  function away(m) { return m && !m.bot && !fresh(m) && now() - (m.seen || 0) < AWAY_MS; }
  function seatUid(i) { var s = tree.seats || {}; return s[i] || null; }
  function amLeader() {
    if (!inside) return false;
    var ms = members(), best = null;
    Object.keys(ms).forEach(function (uid) {
      var m = ms[uid]; if (!fresh(m) || m.bot) return;
      var score = (m.owner ? 0 : 1e15) + (m.at || 0);
      if (!best || score < best.s || (score === best.s && uid < best.uid)) best = { uid: uid, s: score };
    });
    return best && best.uid === ME.uid;
  }
  function ownerPresent() { var ms = members(); return Object.keys(ms).some(function (u) { return ms[u].owner && fresh(ms[u]); }); }

  function applyTree() {
    renderEntrance();
    if (!scene) return;
    // 回の店の名前が決まったら、ちょうちん・のれんの文字も その名前で作りなおす(店に入る前だけ)
    if (!inside && scene.name && scene.name !== shopName() && window.IZ3D) { try { scene.stop(); } catch (e) {} scene = null; start3D(); return; }
    var ms = members();
    var seats = [];
    for (var i = 0; i < N; i++) {
      var uid = seatUid(i), m = uid && ms[uid];
      seats.push(m && (fresh(m) || away(m)) ? { key: uid, avatar: m.avatar, name: m.name, me: uid === ME.uid } : null);
    }
    scene.setSeats(seats);
    var st = tree.state || {};
    scene.setOwner((st.ownerAvatar && AVATAR.fix(st.ownerAvatar)) || AVATAR.fix(AVATAR.OWNER));
    updateTables();
    if (!inside) return;

    // 自分が店から出された(大将に帰ってもらった・閉店で片づけられた)
    if (ms[ME.uid]) seenMine = true;
    else if (seenMine) { leave(true); toast('お店を出ました'); return; }
    // 自分の席
    var s2 = -1; for (var k = 0; k < N; k++) if (seatUid(k) === ME.uid) s2 = k;
    if (s2 !== mySeat) { mySeat = s2; if (!OWNER_MODE) setView(mySeat >= 0 ? (view === 'overview' ? 'first' : view) : 'overview'); }
    $('pickHint').classList.toggle('hidden', OWNER_MODE || mySeat >= 0);
    var cnt = seats.filter(Boolean).length;
    $('tbCount').textContent = '👥 ' + cnt + '/' + N + (ownerPresent() ? ((tree.state || {}).ownerRole === 'master' ? ' ・マスターあり' : ' ・大将あり') : '');
    // 閉店
    if (st.closedAt && st.closedAt > joinAt && !$('closing').classList.contains('show')) showClosing();
    renderLog(); processEvents(); renderOrdersBadge();
    syncMusic();
    if (sheetKind) refreshSheet();
  }

  /* ---------------- 入口 ---------------- */
  var lastNameShown = '';
  function renderEntrance() {
    var n = now(), s = status(n);
    // 回ごとの店の名前・マスター・ひとこと
    var nm = shopName();
    if (nm !== lastNameShown) { lastNameShown = nm; document.title = nm + (OWNER_MODE ? ' 大将' : ''); $('shopName').textContent = nm; $('tbName').textContent = nm; }
    var cs = curSession(), pl = (cs && cs.plan) || {};
    var note = (pl.master ? '今回のマスターは <b>' + esc(pl.master) + 'さん</b>' : '') + (pl.message ? (pl.master ? '<br>' : '') + esc(pl.message) : '');
    if (cs && !LOCAL && s.phase === 'closed') note = '次は <b>' + fmtDay(cs.start) + ' ' + fmtTime(cs.start) + '〜' + fmtTime(cs.end) + '</b>' + (note ? '<br>' + note : '');
    if ($('masterNote')._h !== note) { $('masterNote')._h = note; $('masterNote').innerHTML = note; $('masterNote').classList.toggle('hidden', !note); }
    var sc = scheduleText(); if ($('schedule')._h !== sc) { $('schedule')._h = sc; $('schedule').innerHTML = sc; }
    if (!inside) checkSeats();
    var el = $('openState');
    el.className = 'open-state' + (s.phase === 'open' ? ' on' : s.phase === 'doors' ? ' soon' : '');
    if (LOCAL) { el.textContent = 'おためし営業中'; el.className = 'open-state on'; }
    else if (s.phase === 'open') el.textContent = '営業中 ・ ' + fmtTime(s.end) + 'まで';
    else if (s.phase === 'doors') el.textContent = 'まもなく開店 ・ ' + fmtTime(s.start) + 'から';
    else el.textContent = s.next ? '準備中 ・ 次は ' + fmtDay(s.next.start) + ' ' + fmtTime(s.next.start) : '準備中';
    $('enterBtn').disabled = !LOCAL && !OWNER_MODE && s.phase === 'closed';
    $('enterBtn').textContent = OWNER_MODE ? '🏮 店に立つ' : (s.phase === 'closed' && !LOCAL ? '準備中です' : '🏮 のれんをくぐる');
    if (inside) {
      var left = s.phase === 'open' && !LOCAL ? Math.max(0, Math.ceil((s.end - n) / MIN)) : null;
      $('tbState').textContent = LOCAL ? 'おためし' : s.phase === 'open' ? (s.lastCall ? 'ラストオーダー ・ あと' + left + '分' : 'あと' + left + '分') : s.phase === 'doors' ? 'まもなく開店' : '準備中(仕込み)';
    }
  }
  function scheduleText() {
    var days = weekly().map(function (s) { return '毎週' + WEEK[s.day] + '曜 ' + s.start + '〜' + s.end; });
    return days.join(' / ') + '<br>カウンター' + N + '席 ・ 相談ごとも世間話も、なんでもどうぞ';
  }
  /* 次の回の席の数が いまの3Dとちがえば、店に入る前に読みなおす(何度もくり返さないように見張る) */
  function checkSeats() {
    if (inside || !NEWS && !(tree && tree.schedule)) return;
    var want = seatsFor(curSession());
    try { localStorage.setItem('iz-seats', want); } catch (e) {}
    if (want === N) return;
    var tries = 0; try { tries = +sessionStorage.getItem('iz-seats-reload') || 0; sessionStorage.setItem('iz-seats-reload', tries + 1); sessionStorage.setItem('iz-seats', want); } catch (e) {}
    if (tries < 3 && !document.querySelector('#maker:not(.hidden), #reserve:not(.hidden)')) location.reload();
  }
  /* お知らせ(news.json)を読む。ホームページと同じファイル */
  function loadNews() {
    fetch('news.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j) { NEWS = j; applyTree(); }
    }).catch(function () {});
  }
  function initEntrance() {
    loadNews();
    try { if (+sessionStorage.getItem('iz-seats-reload') > 0) setTimeout(function () { sessionStorage.removeItem('iz-seats-reload'); }, 8000); } catch (e) {}
    document.title = SHOP.NAME;
    $('shopName').textContent = SHOP.NAME; $('tbName').textContent = SHOP.NAME;
    $('schedule').innerHTML = scheduleText();
    $('holdMin').textContent = SHOP.RESERVE_HOLD_MIN;
    $('nameInput').value = OWNER_MODE ? (ME.ownerName || SHOP.OWNER_NAME) : (ME.name || '');
    if (SHOP.PASSCODE_HASH) $('passRow').classList.remove('hidden');
    if (OWNER_MODE) { $('ownerRow').classList.remove('hidden'); if (!SHOP.OWNER_HASH) $('ownerPass').placeholder = '(おためし中は 空のままで入れます)'; }
    $('passInput').value = lsGet('iz-pass', '');
    if (OWNER_MODE) document.body.classList.add('is-owner');
    $('modeNote').textContent = LOCAL ? 'いまは「おためしモード」です。このスマホ(パソコン)の中だけで動きます。タブを2つ開くと2人で試せます。' : (OWNER_MODE && !SHOP.OWNER_HASH ? '大将の合言葉がまだ決まっていません(おためし中)' : '');
    if (OWNER_MODE) $('modeNote').textContent += (OWNER_MODE ? ' その回のマスターは、ノブさんから聞いた合言葉で入れます。' : '');
    drawFace2D($('meFace'), myAvatar());
    // 合言葉がいらない店なら、すぐ店の様子を読みこむ(営業中かどうか・予約を見るため)
    if (!SHOP.PASSCODE_HASH) connect('main');
    else if ($('passInput').value) roomFor($('passInput').value).then(connect).catch(function () {});
    setInterval(function () { renderEntrance(); if (inside) tick(); }, 1000);
  }
  function msg(t) { $('entMsg').textContent = t || ''; }

  /* 大将用の入口: ノブさん(SHOP.OWNER_HASH)か、その回のマスター(schedule/<回>/masterHash)か。
     おためし(OWNER_HASH が空)のときは だれでも大将。マスターの合言葉が合えば マスターとして入る */
  var ROLE = OWNER_MODE ? 'nobu' : 'guest', MASTER = null;
  function checkOwner() {
    if (!OWNER_MODE) return Promise.resolve(true);
    var pass = $('ownerPass').value.trim();
    var nearby = function () { var n = now(); return upcoming(n - 2 * 60 * MIN, 8).filter(function (x) { return x.start - n < 7 * DAY; }); };
    var asNobu = function () { ROLE = 'nobu'; MASTER = null; return true; };
    if (!pass) return Promise.resolve(SHOP.OWNER_HASH ? false : asNobu());
    return Net.sha256(pass).then(function (h) {
      var m = nearby().filter(function (x) { return x.plan.masterHash && x.plan.masterHash === h; })[0];
      if (m) { ROLE = 'master'; MASTER = { key: m.key, name: m.plan.master || '', title: m.plan.title || '' }; return true; }
      if (!SHOP.OWNER_HASH || h === SHOP.OWNER_HASH) return asNobu();
      return false;
    }).catch(function () { return false; });
  }
  $('enterBtn').onclick = function () {
    unlockAudio();
    var name = $('nameInput').value.trim().slice(0, 12);
    if (!name) { msg('お名前を入れてください'); $('nameInput').focus(); return; }
    if (!myAvatar()) { pendingEnter = true; if (OWNER_MODE) ME.ownerName = name; else ME.name = name; saveMe(); toast('はじめに アバターを作ってください', 2200); openMaker(); return; }
    if (OWNER_MODE) ME.ownerName = name; else ME.name = name;
    saveMe();
    var pass = $('passInput').value.trim();
    msg('');
    roomFor(pass).then(function (room) {
      if (SHOP.PASSCODE_HASH) lsSet('iz-pass', pass);
      connect(room);
      var wait = 0;
      (function go() {   // つながるのを少し待つ(マスターの合言葉は 店のデータの予定と くらべるので)
        if (!net.ready && wait++ < 40) { setTimeout(go, 150); return; }
        checkOwner().then(function (ok) {
          if (!ok) { msg(SHOP.OWNER_HASH && !$('ownerPass').value.trim() ? '合言葉を入れてください' : '合言葉がちがいます'); return; }
          var s = status(now());
          if (!LOCAL && !OWNER_MODE && s.phase === 'closed') { msg('いまは準備中です'); return; }
          enter(name);
        });
      })();
    }).catch(function () { msg('お店の合言葉がちがいます'); });
  };

  /* ---------------- 店に入る・出る ---------------- */
  var hbTimer = null;
  function enter(name) {
    inside = true; seenMine = false; mySeat = -1; joinAt = now();
    seenChat = {}; seenEvt = {};
    Object.keys(tree.chat || {}).forEach(function (k) { seenChat[k] = 1; });
    Object.keys(tree.events || {}).forEach(function (k) { seenEvt[k] = 1; });
    net.set('members/' + ME.uid, { name: name, avatar: myAvatar(), owner: OWNER_MODE, at: TS, seen: TS, voice: myAvatar().voice || 0 });
    if (OWNER_MODE) {
      net.update('state', { ownerAvatar: ownerAvatar, ownerName: name, ownerRole: ROLE });
      sys(ROLE === 'master' ? '🏮 今回のマスター ' + name + 'さんが店に立ちました' : '🏮 大将の' + name + 'が店に立ちました');
    }
    document.body.classList.toggle('is-nobu', OWNER_MODE && ROLE === 'nobu');
    $('entrance').classList.add('hidden');
    $('shop').classList.remove('hidden');
    $('bBot').classList.toggle('hidden', !LOCAL);
    setView(OWNER_MODE ? 'owner' : (mySeat >= 0 ? 'first' : 'overview'));   // もとの席に戻ったときは 目線で
    buildPhrases();
    hbTimer = setInterval(function () { if (inside && members()[ME.uid]) net.update('members/' + ME.uid, { seen: TS }); botTick(); }, 15000);
    var back = -1; for (var bi = 0; bi < N; bi++) if (seatUid(bi) === ME.uid) back = bi;
    if (back >= 0 && !OWNER_MODE) setTimeout(function () { toast('おかえりなさい。もとの席にもどりました'); }, 600);
    if (!OWNER_MODE && back < 0) {
      var r = myReservation();
      if (r >= 0 && !seatUid(r)) setTimeout(function () { sit(r); toast('ご予約の席にご案内しました'); }, 400);
    }
    setTimeout(function () { curKey = ''; syncMusic(); if (amLeader() && !(tree.state && tree.state.music)) advance(''); }, 800);
  }
  function leave(kicked) {
    if (!inside) return;
    if (!kicked) {
      if (mySeat >= 0) { event({ type: 'phrase', id: 'mataokoshi', seat: mySeat }); net.remove('seats/' + mySeat); net.remove('tables/' + mySeat); }
      sys((OWNER_MODE ? '大将の' : '') + currentName() + (OWNER_MODE ? 'が奥に下がりました' : 'さんがお帰りになりました'));
      net.remove('members/' + ME.uid);
      botsLeave();
    }
    inside = false; mySeat = -1; clearInterval(hbTimer);
    audio.pause(); hideYT(); curKey = '';
    closeSheet();
    $('bubbles').innerHTML = ''; bubbles = {}; $('log').innerHTML = ''; $('log')._h = ''; toggleLog(false);
    $('shop').classList.add('hidden'); $('entrance').classList.remove('hidden');
    setView('overview');
  }
  /* 「帰る」を押さずに画面を閉じた: すぐには帰さず「席を外しています」にする(3分は席と料理が残る。戻ればそのまま座れる) */
  window.addEventListener('pagehide', function () {
    if (!inside || !net) return;
    if (OWNER_MODE || mySeat < 0) { if (mySeat >= 0) net.leaveBeacon('seats/' + mySeat); net.leaveBeacon('members/' + ME.uid); return; }
    if (net.patchBeacon) net.patchBeacon('members/' + ME.uid, { seen: now() - 51000 });
  });
  function currentName() { var m = members()[ME.uid]; return (m && m.name) || ME.name; }
  $('bLeave').onclick = function () {
    if (!confirm(OWNER_MODE ? '奥に下がりますか?' : 'お店を出ますか?')) return;
    leave(false);
  };

  /* ---------------- 席 ---------------- */
  /* 予約の回: 次の(または いまの)営業。予約は 開店の3時間前から、開店して15分まで 席を取っておく */
  function reserveSession() {
    var n = now(), list = upcoming(n - SHOP.RESERVE_HOLD_MIN * MIN, 8);
    return list.filter(function (s) { return n < s.start + SHOP.RESERVE_HOLD_MIN * MIN; })[0] || null;
  }
  function reserveOpenAt(s) { return s.start - (SHOP.RESERVE_FROM_HOURS || 3) * 60 * MIN; }
  function reservationsNow() {
    var s = reserveSession(); if (!s) return {};
    return (tree.reservations || {})[s.key] || {};
  }
  function myReservation() { var r = reservationsNow(); for (var i = 0; i < N; i++) if (r[i] && r[i].uid === ME.uid) return i; return -1; }
  function onSeatTap(i) {
    if (!inside) return;
    var uid = seatUid(i), m = uid && members()[uid];
    if (OWNER_MODE) { if (m && fresh(m)) openSheet('seat', i); return; }
    if (mySeat >= 0) return;
    if (m && (fresh(m) || away(m))) { toast(away(m) ? 'その席の人は、少し席を外しています' : 'その席は ふさがっています'); return; }
    var r = reservationsNow()[i];
    if (r && r.uid !== ME.uid) { toast('その席は ' + r.name + 'さまのご予約です'); return; }
    sit(i);
  }
  function sit(i) {
    net.set('seats/' + i, ME.uid).then(function () {
      net.update('members/' + ME.uid, { seat: i });
      event({ type: 'phrase', id: 'irasshai', seat: i });
      sys('🏮 ' + currentName() + 'さんが来店しました');
      setTimeout(function () { if (seatUid(i) && seatUid(i) !== ME.uid) toast('ほかの人が先に座りました。別の席をえらんでください'); }, 1500);
    });
  }

  /* ---------------- 視点 ---------------- */
  var VIEW_NAMES = { first: '目線', back: '後ろ', overview: '全体', owner: '大将' };
  function setView(v) { view = v; document.body.classList.toggle('owner-view', OWNER_MODE && v === 'owner'); withScene(function (s) { s.setView(v, mySeat); }); $('bViewLbl').textContent = VIEW_NAMES[v] || '目線'; }
  $('bView').onclick = function () {
    var order = OWNER_MODE ? ['owner', 'overview'] : (mySeat >= 0 ? ['first', 'back', 'overview'] : ['overview']);
    var i = order.indexOf(view); setView(order[(i + 1) % order.length]);
    toast('視点: ' + VIEW_NAMES[view], 1200);
  };

  /* ---------------- 会話 ---------------- */
  function sys(text) { net.push('chat', { sys: true, text: text, at: TS }); }
  var lastSent = 0;
  /* 書く欄: 長く書くと下に広がる(5行くらいまで。それ以上は欄の中で動かす) */
  var chatIn = $('chatInput');
  function growInput() { chatIn.style.height = 'auto'; chatIn.style.height = Math.min(chatIn.scrollHeight, 140) + 'px'; }
  chatIn.addEventListener('input', growInput);
  chatIn.addEventListener('keydown', function (e) {   // パソコンは Enter で送る(Shift+Enter で改行)。スマホの改行キーは改行
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); $('chatForm').requestSubmit ? $('chatForm').requestSubmit() : $('sendBtn').click(); }
  });
  /* 会話の記録: 押すと画面いっぱいに広がる */
  function toggleLog(open) {
    var w = document.querySelector('.log-wrap'), big = open == null ? !w.classList.contains('big') : open;
    w.classList.toggle('big', big);
    $('logBtn').textContent = big ? '閉じる ✕' : '全部見る ▲';
    var log = $('log'); log.scrollTop = log.scrollHeight;
  }
  $('logBtn').onclick = function () { toggleLog(); };
  $('log').addEventListener('click', function (e) {
    var ln = e.target.closest && e.target.closest('.ln[data-seat]'), big = document.querySelector('.log-wrap').classList.contains('big');
    if (ln && !ln.getAttribute('data-me') && ln.getAttribute('data-seat') !== '') {
      var k = ln.getAttribute('data-seat'); if (k !== 'owner') k = +k;
      var nm = nameOfSeat(k) || (ln.querySelector('b') ? ln.querySelector('b').textContent.replace(/^🏮 /, '') : '');
      if (k === 'owner' && OWNER_MODE) return;
      if (big) toggleLog(false);
      replyTo(nm, k === 'owner'); return;
    }
    if (!big) toggleLog(true);
  });
  /* 名札を押しても、その人あてに書ける */
  $('tags').addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('.tag[data-seat]'); if (t) { var k = t.getAttribute('data-seat'); replyToSeat(k === 'owner' ? 'owner' : +k, false); } });
  $('chatForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('chatInput').value.trim().slice(0, 500);
    if (!t) return;
    if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; }
    if (Date.now() - lastSent < 1500) { toast('少し間をあけて送ってください', 1500); return; }
    lastSent = Date.now();
    net.push('chat', { uid: ME.uid, name: currentName(), seat: OWNER_MODE ? 'owner' : mySeat, owner: OWNER_MODE, text: t, at: TS });
    $('chatInput').value = ''; growInput();
  });
  /* その人あてに書く: 入力欄の頭に「〇〇さん、」を入れる(前に別の人あてが入っていれば入れかえる)。みんなにも だれあてか分かる */
  function nameOfSeat(k) {
    if (k === 'owner') return ownerPresent() ? ((tree.state || {}).ownerName || SHOP.OWNER_NAME) : '';
    var u = seatUid(+k), m = u && members()[u]; return m && fresh(m) ? m.name : '';
  }
  function replyTo(name, isOwner) {
    if (!name || !inside) return;
    if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; }
    var call = isOwner ? ((tree.state || {}).ownerRole === 'master' ? 'マスター、' : '大将、') : name + 'さん、';
    var v = chatIn.value.replace(/^(大将|マスター|[^、\s]{1,16}さん)、/, '');
    chatIn.value = call + v; growInput();
    try { chatIn.focus(); chatIn.setSelectionRange(chatIn.value.length, chatIn.value.length); } catch (e) {}
    chatIn.classList.remove('to-flash'); void chatIn.offsetWidth; chatIn.classList.add('to-flash');
  }
  function replyToSeat(k, fromAvatar) {
    if (k === mySeat && !OWNER_MODE) return;
    if (k === 'owner' && OWNER_MODE) return;
    var nm = nameOfSeat(k); if (!nm) return;
    replyTo(nm, k === 'owner');
    if (OWNER_MODE && fromAvatar && typeof k === 'number') toast(nm + 'さんへ書けます', 2600, '🍶 料理を出す', function () { openSheet('seat', k); });
  }
  var SEAT_COLORS = ['#7ec8ff', '#ff9ec4', '#8fe39a', '#ffd36a', '#c9a8ff', '#7fe0d8', '#ffb07a', '#b8d86a', '#f0a0a0', '#a0c0f0'];
  var lastOwnerAt = 0;
  function renderLog() {
    var c = tree.chat || {}, keys = Object.keys(c).sort(); lastOwnerAt = 0;
    var shown = keys.filter(function (k) { return (c[k].at || 0) >= joinAt - 10 * MIN; }).slice(-120);
    shown.forEach(function (k) { if (c[k].owner) lastOwnerAt = Math.max(lastOwnerAt, c[k].at || 0); });
    var log = $('log'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    var html = shown.map(function (k) {
      var m = c[k];
      if (m.sys) return '<div class="ln sys">' + esc(m.text) + '</div>';
      if (m.owner) { return '<div class="ln owner" data-seat="owner"><b>🏮 ' + esc(m.name || '') + '</b>' + esc(m.text) + '</div>'; }
      var col = typeof m.seat === 'number' ? SEAT_COLORS[m.seat % SEAT_COLORS.length] : '';
      var fresh2 = OWNER_MODE && (m.at || 0) > lastOwnerAt && m.uid !== ME.uid;   // 大将が まだ返事していない新しいコメント
      return '<div class="ln' + (fresh2 ? ' new' : '') + '" data-seat="' + (typeof m.seat === 'number' ? m.seat : '') + '"' + (m.uid === ME.uid ? ' data-me="1"' : '') + '><b' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(m.name || '') + '</b>' + esc(m.text) + '</div>';
    }).join('');
    if (log._h !== html) { log.innerHTML = html; log._h = html; if (atBottom || true) log.scrollTop = log.scrollHeight; }
    keys.forEach(function (k) {
      if (seenChat[k]) return; seenChat[k] = 1;
      var m = c[k]; if (m.sys || (m.at || 0) < joinAt - 5000) return;
      bubble(m.seat, m.text, false);
      withScene(function (s) { s.talk(m.seat); }); if (!ownerPresent()) ownerTo(m.seat, false);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }

  /* 頭の上の吹き出し */
  var bubbles = {};   // seat → {el, until}
  function bubble(seat, text, phrase) {
    if (seat == null) return;
    var key = String(seat);
    var b = bubbles[key];
    if (!b) { b = bubbles[key] = { el: document.createElement('div'), bn: document.createElement('div'), bt: document.createElement('div') }; b.bn.className = 'bn'; b.bt.className = 'bt'; b.el.appendChild(b.bn); b.el.appendChild(b.bt); }
    b.el.style.display = 'none';   // 中身が変わったら、次に置き場所が決まるまで隠す(古い場所で一瞬重ならないように)
    $('bubbles').appendChild(b.el);   // いちばん新しい吹き出しを、いちばん手前に
    b.el.className = 'bubble' + (phrase ? ' phrase' : '') + (key === 'owner' ? ' owner' : '') + (text.length > 50 ? ' long' : '');
    b.bt.textContent = text; b.bt.scrollTop = 0;
    b.start = Date.now();
    b.until = b.start + Math.min(20000, 3500 + text.length * 90);
  }
  function floater(seat, emoji) {
    var a = scene && scene.anchors(); if (!a) return;
    var p = seat === 'owner' ? a.owner : a.seats[seat];
    if (!p) return;
    var f = document.createElement('div'); f.className = 'floater'; f.textContent = emoji;
    f.style.left = p.x + 'px'; f.style.top = (p.y - 30) + 'px';
    $('floaters').appendChild(f); setTimeout(function () { f.remove(); }, 1900);
  }
  /* 名札・空席の札・吹き出しを、毎フレーム 頭の上に置く */
  var tagEls = {};
  function tagEl(key, cls, text, onclick) {
    var t = tagEls[key];
    if (!t) { t = tagEls[key] = document.createElement('div'); $('tags').appendChild(t); if (onclick) t.addEventListener('click', onclick); }
    if (t.className !== 'tag ' + cls) t.className = 'tag ' + cls;
    if (t.textContent !== text) t.textContent = text;
    return t;
  }
  /* カウンターの中の人の名前: いれば その人、いなければ 今回のマスターか 大将 */
  function ownerLabel() {
    var st = tree.state || {};
    if (ownerPresent() && st.ownerName) return st.ownerRole === 'master' ? 'マスター ' + st.ownerName : st.ownerName;
    var c = curSession(); if (c && c.plan && c.plan.master) return 'マスター ' + c.plan.master;
    return SHOP.OWNER_NAME;
  }
  function placeOverlays() {
    if (!scene) return;
    var a = scene.anchors(), ms = members(), used = {};
    var showTags = inside || true;
    var put = function (key, cls, text, p, click) { if (!p) return; var t = tagEl(key, cls, text, click); t.style.left = p.x + 'px'; t.style.top = p.y + 'px'; t.style.display = ''; used[key] = 1; };
    if (showTags) {
      var st = tree.state || {};
      if (!(OWNER_MODE && view === 'owner')) put('owner', OWNER_MODE || !ownerPresent() ? 'owner' : 'owner tap', ownerLabel() + (ownerPresent() ? '' : '(おまかせ中)'), a.owner);
      if (tagEls.owner) { if (OWNER_MODE || !ownerPresent()) tagEls.owner.removeAttribute('data-seat'); else tagEls.owner.setAttribute('data-seat', 'owner'); }
      var resv = reservationsNow();
      for (var i = 0; i < N; i++) {
        var uid = seatUid(i), m = uid && ms[uid];
        if (m && away(m)) { put('s' + i, 'away', m.name + '(席を外しています)', a.seats[i]); var tw = tagEls['s' + i]; if (tw) tw.removeAttribute('data-seat'); continue; }
        if (m && fresh(m)) { put('s' + i, uid === ME.uid ? 'me' : 'tap', m.name + (uid === ME.uid ? '(あなた)' : ''), a.seats[i]); var tg = tagEls['s' + i]; if (tg) { if (uid === ME.uid) tg.removeAttribute('data-seat'); else tg.setAttribute('data-seat', i); } continue; }
        var r = resv[i];
        if (r) {   // 予約済みの席は、だれにでも名前が見える
          (function (k, rr) { put('e' + k, rr.uid === ME.uid ? 'free mine' : 'reserved', rr.uid === ME.uid ? 'ご予約の席(あなた)' : '予約済み ' + rr.name + 'さま', a.empty[k], function () { onSeatTap(k); }); })(i, r);
        } else if (inside && !OWNER_MODE && mySeat < 0 && !document.body.classList.contains('no3d')) {
          (function (k) { put('e' + k, 'free', (k + 1) + '番 空席', a.empty[k], function () { onSeatTap(k); }); })(i);
        }
      }
    }
    Object.keys(tagEls).forEach(function (k) { if (!used[k]) tagEls[k].style.display = 'none'; });
    placeBubbles(a, ms);
  }

  /* 吹き出しを置く —— ぜったいに重ならないように。
     新しい吹き出しほど先に、頭のすぐ上に置く。ぶつかる古い吹き出しは、その上へずらす(ずらしたものには名前を出す)。
     上の端まで入りきらないときは、古いほうを低くして中で文字を流す。それでも入らなければ消す(会話の記録には残る) */
  var GAP = 8, TAIL = 22, MIN_H = 46, MIN_TEXT = 46, SPEED = 24, WAIT = 1800;   // MIN_TEXT: 文字は最低2行ぶん見せる
  function placeBubbles(a, ms) {
    var t = Date.now();
    var topEl = document.querySelector('.topbar');
    var topLimit = (topEl && topEl.offsetParent ? topEl.getBoundingClientRect().bottom : 50) + 6;
    var npEl = document.querySelector('.np-row');   // 曲名の帯にも かぶらないように
    if (npEl && npEl.offsetParent && npEl.getBoundingClientRect().height) topLimit = Math.max(topLimit, npEl.getBoundingClientRect().bottom + 4);
    var list = [];
    Object.keys(bubbles).forEach(function (k) {
      var b = bubbles[k], p = k === 'owner' ? (OWNER_MODE && view === 'owner' ? null : a.owner) : a.seats[+k];
      if (!p || t > b.until + 500) { b.el.remove(); delete bubbles[k]; return; }
      list.push({ k: k, b: b, p: p });
    });
    list.sort(function (x, y) { return y.b.start - x.b.start; });   // 新しい順
    var placed = [];
    // ひとりじめさせない: 話している人数で、使える高さを等分する(1人なら上まで、4人なら4分の1ずつ)
    var lowest = 0; list.forEach(function (it) { lowest = Math.max(lowest, it.p.y); });
    var share = (Math.min(lowest, window.innerHeight) - TAIL - topLimit) / Math.max(1, list.length) - GAP;
    list.forEach(function (it) {
      var b = it.b, p = it.p;
      // 名前(ずらしたときだけ見える)
      var nm = it.k === 'owner' ? ownerLabel() : (function () { var u = seatUid(+it.k), m = u && ms[u]; return m ? m.name : ''; })();
      if (b.bn.textContent !== nm) b.bn.textContent = nm;
      b.el.style.display = '';
      b.el.classList.remove('moved');   // 測る前に、名前の行を消しておく(ずらすときに付けて、測りなおす)
      // まず、頭の上から上の端までを使える高さにして、自然な大きさを測る
      var T = p.y;                                   // 吹き出しの「しっぽの先」の位置
      var ov = OWNER_MODE && view === 'owner';   // 大将の接客画面: 吹き出しは3行まで(全文は下の会話の欄)
      b.bt.style.maxHeight = (ov ? 62 : Math.max(MIN_TEXT, Math.min(T - TAIL - topLimit - 16, share - 16))) + 'px';
      b.el.classList.toggle('clamp', ov);
      var w = b.el.offsetWidth, h = b.el.offsetHeight;
      var land = window.innerWidth > window.innerHeight && window.innerHeight < 520;   // 横向きはボタンが上に並ぶので右も使える
      var hw = Math.min(w, window.innerWidth - 100) / 2 + 6;
      var cx = Math.max(hw, Math.min(window.innerWidth - (land ? 10 : 72) - hw, p.x));
      var x0 = cx - w / 2, x1 = cx + w / 2;
      // ほかの吹き出しとぶつかる間は、上へずらす
      var moved = false, guard = 0, hit = true;
      while (hit && guard++ < 20) {
        hit = false;
        for (var i = 0; i < placed.length; i++) {
          var q = placed[i];
          var top = T - TAIL - h, bottom = T - TAIL + (moved ? 0 : 10);
          if (x0 < q.x1 + GAP && x1 > q.x0 - GAP && top < q.bottom + GAP && bottom > q.top - GAP) {
            T = q.top - GAP + TAIL;   // q の上へ
            if (!moved) { moved = true; b.el.classList.add('moved'); h = b.el.offsetHeight; }   // 名前の行の分 高くなる
            hit = true;
          }
        }
      }
      // 上の端に入りきらないときは、低くする。低くしても入らなければ消す
      var bottom2 = T - TAIL, space = bottom2 - topLimit;
      if (space < MIN_H + 20) { b.el.style.display = 'none'; return; }
      if (h > space) {
        b.bt.style.maxHeight = Math.max(MIN_TEXT, b.bt.clientHeight - (h - space)) + 'px';
        h = b.el.offsetHeight;
        if (h > space) { b.el.style.display = 'none'; return; }
      }
      // 入りきらない文字は、中でゆっくり上に流す
      var over = b.bt.scrollHeight - b.bt.clientHeight;
      if (over > 2 && !ov) {
        b.el.classList.add('scroll');
        b.bt.scrollTop = Math.max(0, Math.min(over, (t - b.start - WAIT) / 1000 * SPEED));
        b.until = Math.max(b.until, b.start + WAIT + over / SPEED * 1000 + 3500);
      } else b.el.classList.remove('scroll');
      b.el.classList.toggle('moved', moved);
      b.el.classList.toggle('fade', t > b.until);
      b.el.style.left = cx + 'px';
      b.el.style.top = T + 'px';
      placed.push({ x0: x0, x1: x1, top: T - TAIL - h, bottom: T - TAIL + (moved ? 0 : 10) });
    });
  }

  /* 大将を席の前へ。いらっしゃい・注文・料理・またお越しください のときは必ず行き、5秒は留まる(会話につられて動かない) */
  var ownerHold = 0;
  function ownerTo(seat, important) {
    if (typeof seat !== 'number') return;
    if (!important && Date.now() < ownerHold) return;
    if (important) ownerHold = Date.now() + 5000;
    withScene(function (s) { s.ownerGoTo(seat); });
  }

  /* ---------------- 決まり文句・乾杯などの合図 ---------------- */
  function event(e) { e.at = TS; e.by = ME.uid; e.voice = myAvatar().voice || 0; net.push('events', e); }
  function buildPhrases() {
    var box = $('phrases'); box.innerHTML = '';
    var list = SHOP.PHRASES.filter(function (p) { return p.btn || (OWNER_MODE && p.who === 'owner'); });
    list.forEach(function (p) {
      var b = document.createElement('button');
      b.textContent = (p.emoji ? p.emoji + ' ' : '') + p.say.replace(/！$/, '');
      b.onclick = function () {
        if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; }
        event({ type: 'phrase', id: p.id, seat: OWNER_MODE ? 'owner' : mySeat });
      };
      box.appendChild(b);
    });
  }
  function processEvents() {
    var ev = tree.events || {};
    Object.keys(ev).sort().forEach(function (k) {
      if (seenEvt[k]) return; seenEvt[k] = 1;
      var e = ev[k]; if ((e.at || 0) < joinAt - 3000) return;
      if (e.type === 'phrase') {
        var ph = SHOP.PHRASES.filter(function (p) { return p.id === e.id; })[0]; if (!ph) return;
        var who = ph.who === 'owner' ? 'owner' : e.seat;
        bubble(who, (ph.emoji ? ph.emoji + ' ' : '') + ph.say, true);
        withScene(function (s) { if (ph.id === 'kanpai') { s.cheerAll(); } else s.talk(who); });
        if (ph.who === 'owner') ownerTo(e.seat, true);
        if (ph.id === 'kanpai') { for (var i = 0; i < N; i++) if (seatUid(i)) floater(i, '🍻'); floater('owner', '🍻'); }
        else if (ph.emoji) floater(who, ph.emoji);
        playPhrase(ph, e.voice);
      } else if (e.type === 'clear') {
        ownerTo(e.seat, false);   // 下げに行く
      } else if (e.type === 'order') {
        ownerTo(e.seat, true);
        var it0 = menuItem(e.item), ph3 = SHOP.PHRASES.filter(function (p) { return p.id === 'haiyo'; })[0];
        if (ph3) { bubble('owner', ph3.say + (it0 ? ' ' + it0.emoji + ' ' + it0.name + 'ね' : ''), true); playPhrase(ph3, 0); }
      } else if (e.type === 'serve') {
        var it = menuItem(e.item);
        ownerTo(e.seat, true);
        var ph2 = SHOP.PHRASES.filter(function (p) { return p.id === 'omachi'; })[0];
        if (ph2) { bubble('owner', ph2.say + ' ' + (it ? it.emoji + ' ' + it.name + (it.pun && it.real ? '(中身は' + it.real + 'です)' : '') : ''), true); playPhrase(ph2, 0); }
      }
    });
  }

  /* ---------------- 注文と料理 ---------------- */
  function menuItem(id) { return SHOP.MENU.filter(function (m) { return m.id === id; })[0]; }
  var EAT_MS = (SHOP.EAT_MINUTES || 3) * MIN, CLEAR_MS = (SHOP.CLEAR_SECONDS || 5) * 1000;
  function tableItems(seat) {   // その席に出ている物 [{key, id, at, empty}]
    var o = (tree.tables || {})[seat] || {}, n = now();
    return Object.keys(o).sort().map(function (k) {
      var v = o[k]; if (typeof v === 'string') v = { id: v, at: n };   // 古い形のデータ
      var at = v.at || n, bites = v.bites || 0;
      var emptyAt = bites >= 2 ? (v.emptyAt || n) : at + EAT_MS;   // 自分で食べ終わった時か、押し忘れの5分後
      return { key: k, id: v.id, at: at, bites: bites, half: bites === 1, emptyAt: emptyAt, empty: n >= emptyAt };
    });
  }
  function updateTables() {
    if (!scene) return;
    var tables = []; for (var j = 0; j < N; j++) tables.push(tableItems(j));
    scene.setTables(tables);
    renderMine();
  }
  /* 自分の前の料理・飲み物: 1回押すと半分、2回で 食べ終わる・飲み干す */
  function eat(key) {
    var x = tableItems(mySeat).filter(function (y) { return y.key === key; })[0];
    if (!x || x.empty) return;
    var it = menuItem(x.id), drink = it && it.kind === 'drink', b = x.bites + 1;
    var up = { bites: b }; if (b >= 2) up.emptyAt = TS;
    net.update('tables/' + mySeat + '/' + key, up);
    withScene(function (sc) { if (sc.bump) sc.bump(key); if (drink) sc.cheer(mySeat); else sc.talk(mySeat); });
    floater(mySeat, b >= 2 ? (drink ? '😆' : '😋') : (drink ? '🍻' : '😊'));
    if (b >= 2) toast((it ? it.emoji + ' ' + it.name : '') + (drink ? ' を飲み干しました' : ' を食べ終わりました') + '。おかわりは「注文」から', 2200);
  }
  var tipShown = !!lsGet('iz-tip-eat', 0);
  function renderMine() {
    var box = $('mine'); if (!box) return;
    var list = inside && mySeat >= 0 ? tableItems(mySeat).filter(function (x) { return !x.empty; }) : [];
    var h = list.map(function (x) {
      var it = menuItem(x.id) || { emoji: '🍽️', name: x.id }, drink = it.kind === 'drink';
      var verb = drink ? (x.half ? '飲み干す' : '飲む') : (x.half ? '食べ終わる' : '食べる');
      return '<button data-eat="' + x.key + '">' + it.emoji + ' <b>' + verb + '</b></button>';
    }).join('');
    if (h && !tipShown) { tipShown = true; lsSet('iz-tip-eat', 1); setTimeout(function () { toast('料理や飲み物を そのまま押しても、食べたり飲んだりできます', 3500); }, 1500); }
    if (box._h !== h) { box._h = h; box.innerHTML = h; box.classList.toggle('hidden', !h);
      box.querySelectorAll('[data-eat]').forEach(function (b) { b.onclick = function () { eat(b.getAttribute('data-eat')); }; }); }
  }
  setInterval(function () { updateTables(); if (sheetKind === 'menu' || sheetKind === 'seat') refreshSheet(false); }, 1000);   // 時間がたつと空になるので、1秒ごとに見なおす
  /* 置ける数: テーブルの上(空のお皿も、下げるまでは場所をとる)+ まだ出ていない注文 */
  function seatCounts(seat) {
    var c = { food: 0, drink: 0 };
    tableItems(seat).forEach(function (x) { var it = menuItem(x.id); c[it && it.kind === 'drink' ? 'drink' : 'food']++; });
    var o = tree.orders || {};
    Object.keys(o).forEach(function (k) { if (o[k].seat === seat) { var it = menuItem(o[k].item); c[it && it.kind === 'drink' ? 'drink' : 'food']++; } });
    return c;
  }
  function whyNot(seat, id) {
    var it = menuItem(id); if (!it) return 'ありません';
    var c = seatCounts(seat);
    if (it.kind === 'drink' && c.drink >= (SHOP.DRINK_LIMIT || 1)) return '飲み物は1杯ずつ';
    if (it.kind !== 'drink' && c.food >= (SHOP.FOOD_LIMIT || 3)) return 'テーブルがいっぱい';
    return '';
  }
  function order(id) {
    if (mySeat < 0) { toast('先に席に座ってください'); return; }
    var why = whyNot(mySeat, id);
    if (why) { toast(why === '飲み物は1杯ずつ' ? '飲み物は1杯ずつです。飲み終わったら頼めます' : 'テーブルがいっぱいです。食べ終わったら頼めます', 2400); return; }
    var it = menuItem(id);
    closeSheet();
    net.push('orders', { uid: ME.uid, name: currentName(), seat: mySeat, item: id, at: TS }).then(function (key) {
      toast((it ? it.emoji + ' ' + it.name : '') + ' を注文しました', 3000, '取り消す', function () {
        if ((tree.orders || {})[key]) { net.remove('orders/' + key); toast('注文を取り消しました', 1500); }
        else toast('もう出てきました(食べ終わると、また頼めます)', 2000);
      });
    });
    event({ type: 'order', seat: mySeat, item: id });
  }
  function serve(seat, id, orderKey) {
    var o = tree.orders || {};
    if (!orderKey && whyNot(seat, id)) { toast('その席は いまは置けません(' + whyNot(seat, id) + ')'); return; }
    if (orderKey) {   // 注文の分は、自分の注文を数えないで見る
      var c = seatCounts(seat), it = menuItem(id), lim = it && it.kind === 'drink' ? (SHOP.DRINK_LIMIT || 1) : (SHOP.FOOD_LIMIT || 3);
      var onTable = tableItems(seat).filter(function (x) { var m = menuItem(x.id); return (m && m.kind === 'drink') === (it && it.kind === 'drink'); }).length;
      if (onTable >= lim) { net.remove('orders/' + orderKey); return; }
    }
    var k = net.newKey();
    net.set('tables/' + seat + '/' + k, { id: id, at: TS });
    if (orderKey) net.remove('orders/' + orderKey);
    event({ type: 'serve', seat: seat, item: id });
  }
  function renderOrdersBadge() {
    var o = tree.orders || {}, n = Object.keys(o).length;
    $('ordBadge').textContent = n; $('ordBadge').classList.toggle('hidden', !n);
    if (OWNER_MODE && n > lastOrders) ding();
    lastOrders = n;
  }

  /* ---------------- まとめ役の仕事(いちばん先にいる人のスマホが、1台だけでやる) ---------------- */
  var closingFor = '';
  function tick() {
    if (!amLeader()) return;
    var n = now(), ms = members(), st = tree.state || {};
    // いなくなった人の片づけ
    Object.keys(ms).forEach(function (uid) {
      if (fresh(ms[uid]) || away(ms[uid]) || (ms[uid].bot && bots[uid])) return;
      net.remove('members/' + uid);
      for (var i = 0; i < N; i++) if (seatUid(i) === uid) { net.remove('seats/' + i); net.remove('tables/' + i); }
    });
    for (var i = 0; i < N; i++) { var u = seatUid(i); if (u && !ms[u]) { net.remove('seats/' + i); net.remove('tables/' + i); } }
    // 大将がいないときは、注文を自動で出す
    if (!ownerPresent()) {
      var o = tree.orders || {};
      Object.keys(o).forEach(function (k) { if (n - (o[k].at || n) > 3000) serve(o[k].seat, o[k].item, k); });   // 3秒は取り消せる
    }
    // 食べ終わって(空になって)5秒たった物を下げる
    for (var t2 = 0; t2 < N; t2++) {
      var cleared = false;
      tableItems(t2).forEach(function (x) { if (n - x.emptyAt >= CLEAR_MS) { net.remove('tables/' + t2 + '/' + x.key); cleared = true; } });
      if (cleared) event({ type: 'clear', seat: t2 });
    }
    // 古い合図・会話を整理
    var ev = tree.events || {};
    Object.keys(ev).forEach(function (k) { if (n - (ev[k].at || 0) > 120000) net.remove('events/' + k); });
    var ck = Object.keys(tree.chat || {}).sort();
    if (ck.length > 200) ck.slice(0, ck.length - 150).forEach(function (k) { net.remove('chat/' + k); });
    // 曲
    var m = st.music;
    if (!m) advance('');
    else if ((m.kind === 'yt' || m.kind === 'video') && m.dur > 0 && elapsed(m) > m.dur + 3) advance(musicKey(m));   // 動画の長さが過ぎた(どの画面で流れていても)
    else if (m.kind === 'yt' && m.ended && elapsed(m) > 5) advance(musicKey(m));   // だれかの画面で「終わった」
    else if (m.kind === 'yt' && elapsed(m) > 12 * 60) advance(musicKey(m));
    else if (m.kind === 'video') { if (tvVideo && isFinite(tvVideo.duration) && tvVideo.duration > 0 && elapsed(m) > tvVideo.duration + 4) advance(musicKey(m)); else if (elapsed(m) > 30 * 60) advance(musicKey(m)); }
    else if (m.kind !== 'yt' && audio.src && isFinite(audio.duration) && audio.duration > 0 && elapsed(m) > audio.duration + 4) advance(musicKey(m));
    // ラストオーダーと閉店(おためしモードでは時間で閉めない)
    if (LOCAL) return;
    var s = status(n);
    if (s.phase === 'open' && s.lastCall && st.lastCallFor !== s.key) {
      net.update('state', { lastCallFor: s.key });
      event({ type: 'phrase', id: 'lastcall', seat: 'owner' });
    }
    if (s.phase === 'open') { if (st.openFor !== s.key) net.update('state', { openFor: s.key, openEnd: s.end }); }
    else if (st.openFor && st.openEnd && n >= st.openEnd && st.closedFor !== st.openFor && closingFor !== st.openFor) {
      closingFor = st.openFor;
      closeShop();
    }
    // 予約の古いものを消す
    var rv = tree.reservations || {}, cut = sessKey(n - DAY);
    Object.keys(rv).forEach(function (k) { if (k < cut && k[0] !== 'f') net.remove('reservations/' + k); });
  }
  function closeShop() {
    var st = tree.state || {};
    event({ type: 'phrase', id: 'oyasumi', seat: 'owner' });
    net.update('state', { closedAt: TS, closedFor: st.openFor || 'manual', forceUntil: null, forceFrom: null });
    setTimeout(function () { ['chat', 'orders', 'tables', 'seats', 'queue', 'members'].forEach(function (p) { net.remove(p); }); }, 6000);
  }
  function showClosing() {
    var c = $('closing'); c.classList.remove('hidden'); c.classList.add('show');
    $('closingTitle').textContent = '本日は閉店です';
    $('closingText').textContent = 'ありがとうございました。おやすみなさい。またお越しください。';
  }
  $('closingOk').onclick = function () { var c = $('closing'); c.classList.add('hidden'); c.classList.remove('show'); leave(true); };

  /* ---------------- 下から出る板 ---------------- */
  var sheetKind = '', sheetArg = null;
  function openSheet(kind, arg) { sheetOpenAt = Date.now(); sheetKind = kind; sheetArg = arg; $('sheet').classList.remove('hidden'); $('sheetBack').classList.remove('hidden'); refreshSheet(true); }
  function closeSheet() { sheetKind = ''; $('sheet').classList.add('hidden'); $('sheetBack').classList.add('hidden'); }
  var sheetOpenAt = 0;
  $('shClose').onclick = closeSheet; $('sheetBack').onclick = function () { if (Date.now() - sheetOpenAt > 450) closeSheet(); };
  /* お品書き: 分類の見出しで切りかえ。置けない物は うすく、理由を出す */
  var menuCat = (SHOP.CATS && SHOP.CATS[0] && SHOP.CATS[0].id) || 'drink';
  function menuHTML(seat) {
    var c = seatCounts(seat), cats = SHOP.CATS || [{ id: 'drink', name: '飲み物', emoji: '🍺' }];
    var h = '<div class="mn-count">' + (seat === mySeat && !OWNER_MODE ? 'あなたの前' : (seat + 1) + '番の席') +
      ' <b class="' + (c.food >= SHOP.FOOD_LIMIT ? 'full' : '') + '">料理 ' + c.food + '/' + SHOP.FOOD_LIMIT + '</b>' +
      ' <b class="' + (c.drink >= SHOP.DRINK_LIMIT ? 'full' : '') + '">飲み物 ' + c.drink + '/' + SHOP.DRINK_LIMIT + '</b>' +
      '<small>「食べる」「飲む」を2回押すと空になり、大将が下げます(押さなくても ' + SHOP.EAT_MINUTES + '分で空になります)</small></div>';
    h += '<div class="mn-tabs">';
    cats.forEach(function (ct) { h += '<button data-cat="' + ct.id + '" class="' + (ct.id === menuCat ? 'on' : '') + '">' + ct.emoji + ' ' + esc(ct.name) + '</button>'; });
    h += '</div><div class="mn-list">';
    SHOP.MENU.filter(function (m) { return (m.cat || (m.kind === 'drink' ? 'drink' : 'otsumami')) === menuCat; }).forEach(function (m) {
      var why = whyNot(seat, m.id);
      h += '<button class="mn-card' + (m.pun ? ' pun' : '') + (why ? ' off' : '') + '" data-id="' + esc(m.id) + '">' +
        (m.pun ? '<i class="mn-badge">名物</i>' : '') +
        '<span class="mn-emoji">' + m.emoji + '</span><span class="mn-name">' + esc(m.name) + '</span>' +
        '<span class="mn-desc">' + esc(why || m.desc || '') + '</span></button>';
    });
    return h + '</div>';
  }
  function wireMenu(body, onPick) {
    body.querySelectorAll('[data-cat]').forEach(function (b) { b.onclick = function () { menuCat = b.getAttribute('data-cat'); refreshSheet(true); }; });
    body.querySelectorAll('.mn-card').forEach(function (b) { b.onclick = function () { onPick(b.getAttribute('data-id')); }; });
  }
  function refreshSheet(force) {
    var body = $('shBody'), html = '', title = '';
    if (sheetKind === 'menu' || sheetKind === 'seat') {
      var seatM = sheetKind === 'menu' ? mySeat : sheetArg;
      if (sheetKind === 'seat') { var u2 = seatUid(seatM), m2 = u2 && members()[u2]; if (!m2) { closeSheet(); return; } title = (seatM + 1) + '番 ' + m2.name + 'さんに出す'; }
      else title = 'お品書き';
      html = menuHTML(seatM) + (sheetKind === 'menu' ? '<p class="small-note">' + (ownerPresent() ? '大将に注文が届きます。' : 'いまは大将がおまかせ中なので、すぐに出てきます。') + '</p>'
        : '<div class="sh-sec">そのほか</div><div class="btn-row"><button id="kickBtn" class="red">帰ってもらう</button></div>');
      if (!force && body._h === html) return;
      var list0 = body.querySelector('.mn-list'), keep = list0 ? list0.scrollTop : 0, keepB = body.scrollTop;
      body._h = html; body.innerHTML = html; $('shTitle').textContent = title;
      var list1 = body.querySelector('.mn-list'); if (list1 && !force) list1.scrollTop = keep; if (!force) body.scrollTop = keepB;
      wireMenu(body, sheetKind === 'menu' ? function (id) { order(id); } : function (id) { serve(seatM, id); closeSheet(); });
      var kb = body.querySelector('#kickBtn');
      if (kb) kb.onclick = function () {
        var uid = seatUid(seatM), m = uid && members()[uid];
        if (!m || !confirm(m.name + 'さんに帰ってもらいますか?')) return;
        net.remove('seats/' + seatM); net.remove('tables/' + seatM); net.remove('members/' + uid);
        sys(m.name + 'さんがお店を出ました'); closeSheet();
      };
      return;
    }
    if (sheetKind === 'music') {
      title = '曲・動画';
      var st = tree.state || {}, m = st.music, q = tree.queue || {}, qk = Object.keys(q).sort();
      html += '<div class="sh-sec">いま流れている曲</div><div class="li now"><div class="t">🎵 ' + (m ? esc(m.title) + (m.byName ? '<small>' + esc(m.byName) + 'さんのリクエスト</small>' : '') : '—') + '</div>' + (OWNER_MODE && m ? '<button id="skipBtn" class="red">⏭ 次の曲へ</button>' : '') + '</div>';
      if (OWNER_MODE) html += '<p class="small-note">大将だけ: 「次の曲へ」で今の曲・動画を取り消して、次へ進めます。順番待ちも全部取り消せます。</p>';
      html += '<div class="vol" style="margin-top:10px">🔈<input id="volIn" type="range" min="0" max="1" step="0.05" value="' + vol + '">🔊</div>';
      html += '<div class="sh-sec">🔋 画面の動き(熱くなる・電池が気になるとき)</div><div class="btn-row perf-row">' + ['eco', 'normal', 'smooth'].map(function (k) { return '<button data-perf="' + k + '" class="' + (k === perfMode ? 'red' : 'gray') + '">' + PERF[k].name + '</button>'; }).join('') + '</div><p class="small-note">省エネにすると、動きが少しカクッとしますが、熱と電池の減りがおさえられます。動画を大きく見ている間は、うしろのお店の絵を自動で止めて休ませます。</p>';
      html += '<p class="small-note">音の大きさは自分のスマホだけ。曲はお店にいる全員で同じものを聞きます。</p>';
      html += '<div class="sh-sec">リクエストの順番待ち(' + qk.length + ')</div><div class="list">';
      if (!qk.length) html += '<div class="li"><div class="t"><small>まだありません。下の一覧からリクエストできます。</small></div></div>';
      qk.forEach(function (k, i) { var it = q[k]; html += '<div class="li"><div class="t">' + (i + 1) + '. ' + esc(it.title) + '<small>' + esc(it.byName || '') + 'さん</small></div>' + ((it.by === ME.uid || OWNER_MODE) ? '<button class="gray" data-del="' + k + '">取り消し</button>' : '') + '</div>'; });
      html += '</div>';
      if (SHOP.ALLOW_YOUTUBE) html += '<div class="sh-sec">📺 動画のリンクを貼ってリクエスト</div><div class="yt-row"><input id="ytIn" placeholder="YouTube などのリンク" inputmode="url"><button id="ytAdd">追加</button></div><p class="small-note">大将のうしろのモニターに、みんな同じ場面で映ります。モニターを押すと大きく見られます。YouTube は公式の埋めこみで流すので、広告が入ることがあります。</p>';
      if ((SHOP.VIDEOS || []).length) {
        html += '<div class="sh-sec">📺 お店の動画(大将のうしろのモニターに映ります)</div><div class="list">';
        SHOP.VIDEOS.forEach(function (v) { html += '<div class="li"><div class="t">' + esc(v.title) + '</div><button data-vreq="' + esc(v.id) + '">リクエスト</button></div>'; });
        html += '</div>';
      }
      html += '<div class="sh-sec">お店の曲</div><div class="list">';
      SHOP.SONGS.forEach(function (s) { html += '<div class="li"><div class="t">' + esc(s.title) + '</div><button data-req="' + esc(s.id) + '">リクエスト</button></div>'; });
      html += '</div>';
      if (!force && body._h === html) return;
    } else if (sheetKind === 'orders') {
      title = '注文票';
      var o = tree.orders || {}, ok = Object.keys(o).sort();
      html += '<div class="list">';
      if (!ok.length) html += '<div class="li"><div class="t"><small>注文はありません</small></div></div>';
      ok.forEach(function (k) { var it = menuItem(o[k].item) || { emoji: '🍽️', name: o[k].item }; html += '<div class="li"><div class="t">' + it.emoji + ' ' + esc(it.name) + '<small>' + (o[k].seat + 1) + '番 ' + esc(o[k].name) + 'さん</small></div><button data-serve="' + k + '">出す</button></div>'; });
      html += '</div><p class="small-note">お客さんの席を押すと、注文がなくても好きな物を出せます。</p>';
      if (!force && body._h === html) return;
    } else if (sheetKind === 'owner') {
      if (!force) return;
      title = '店主の操作';
      var s = status(now());
      html = '<div class="sh-sec">お店</div><div class="btn-row">' +
        '<button id="openBtn">🏮 臨時で開ける(1時間)</button><button id="closeBtn" class="red">🌙 閉店する</button></div>' +
        '<p class="small-note">いま: ' + (LOCAL ? 'おためしモード' : s.phase === 'open' ? '営業中(' + fmtTime(s.end) + 'まで)' : s.phase === 'doors' ? 'まもなく開店' : '準備中') + '</p>' +
        '<div class="sh-sec">片づけ</div><div class="btn-row"><button id="clearChat">💬 会話を全部消す</button><button id="clearTables">🍽️ 料理を下げる</button></div>' +
        '<div class="sh-sec">大将の見た目</div><div class="btn-row"><button id="ownerLook">🎨 アバターを作りなおす</button></div>' +
        (ROLE === 'nobu' ? '<div class="sh-sec">お店の予定</div><div class="btn-row"><button id="planBtn" class="red">📅 お店の予定・マスター交代・席の数</button></div>' : '<p class="small-note">お店の予定は ノブさんだけが直せます。</p>');
    } else if (sheetKind === 'plan') {
      title = 'お店の予定';
      html = planListHTML();
      if (!force && body._h === html) return;
    } else if (sheetKind === 'planEdit') {
      if (!force) return;
      title = '回の決まりを直す';
      html = planEditHTML(sheetArg);
    } else if (sheetKind === 'planAdd') {
      if (!force) return;
      title = '臨時の日を足す';
      html = '<div class="pl-form"><label>日にち<input type="date" id="paDate"></label><label>はじまり<input type="time" id="paStart" value="21:00"></label><label>おわり<input type="time" id="paEnd" value="22:00"></label>' +
        '<div class="btn-row"><button id="paSave" class="red">足す</button><button id="paBack">もどる</button></div><p class="small-note">足したあと、その日の店の名前・マスター・席の数を決められます。</p></div>';
    } else if (sheetKind === 'bot') {
      if (!force) return;
      title = 'おためし客';
      html = '<p class="small-note">ひとりでも試せるように、作りもののお客さんを呼べます(おためしモードだけ)。</p><div class="btn-row"><button id="botAdd">🙋 1人呼ぶ</button><button id="botAll">👥 満席にする</button><button id="botOut" class="red">👋 全員帰す</button></div>';
    }
    body._h = html; body.innerHTML = html; $('shTitle').textContent = title;
    wireSheet();
  }
  function wireSheet() {
    var body = $('shBody');
    var q = function (sel) { return body.querySelector(sel); };
    if (sheetKind === 'music') {
      var vi = q('#volIn'); if (vi) vi.oninput = function () { vol = +vi.value; lsSet('iz-vol', vol); setVol(); };
      var sk = q('#skipBtn'); if (sk) sk.onclick = ownerSkip;
      body.querySelectorAll('[data-perf]').forEach(function (b) { b.onclick = function () { perfMode = b.getAttribute('data-perf'); lsSet('iz-perf', perfMode); applyPerf(); toast('画面の動き: ' + PERF[perfMode].name, 1500); refreshSheet(true); }; });
      body.querySelectorAll('[data-req]').forEach(function (b) { b.onclick = function () { requestSong(b.getAttribute('data-req')); }; });
      body.querySelectorAll('[data-vreq]').forEach(function (b) { b.onclick = function () {
        var v = SHOP.VIDEOS.filter(function (x) { return x.id === b.getAttribute('data-vreq'); })[0]; if (!v) return;
        if (ytId(v.src)) pushYT(v.src, v.title);
        else pushQueue({ kind: 'video', id: v.id + '-' + Date.now(), src: v.src, title: v.title });
      }; });
      body.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { net.remove('queue/' + b.getAttribute('data-del')); }; });
      var ya = q('#ytAdd'); if (ya) ya.onclick = function () {
        var url = q('#ytIn').value.trim(), id = ytId(url);
        if (id) pushYT(url);
        else if (/^https:\/\/[^\s]+\.(mp4|webm|m4v|mov)(\?[^\s]*)?$/i.test(url)) pushQueue({ kind: 'video', id: 'v' + Date.now(), src: url, title: '動画' });
        else { toast('リンクが読めませんでした(YouTube か、mp4 などの動画のリンク)'); return; }
        q('#ytIn').value = '';
      };
    } else if (sheetKind === 'orders') {
      body.querySelectorAll('[data-serve]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-serve'), o = (tree.orders || {})[k]; if (o) serve(o.seat, o.item, k); }; });
    } else if (sheetKind === 'owner') {
      q('#openBtn').onclick = function () { net.update('state', { forceFrom: now(), forceUntil: now() + 60 * MIN, closedAt: null, closedFor: null }); sys('🏮 臨時で開店しました(1時間)'); closeSheet(); };
      q('#closeBtn').onclick = function () { if (confirm('閉店しますか?(会話と料理は片づけられます)')) { closeSheet(); closeShop(); } };
      q('#clearChat').onclick = function () { if (confirm('会話を全部消しますか?')) { net.remove('chat'); closeSheet(); } };
      q('#clearTables').onclick = function () { net.remove('tables'); closeSheet(); };
      q('#ownerLook').onclick = function () { closeSheet(); openMaker(); };
      var pb = q('#planBtn'); if (pb) pb.onclick = function () { openSheet('plan'); };
    } else if (sheetKind === 'plan') {
      body.querySelectorAll('[data-pedit]').forEach(function (b) { b.onclick = function () { openSheet('planEdit', b.getAttribute('data-pedit')); }; });
      q('#plAdd').onclick = function () { openSheet('planAdd'); };
      var cp = q('#plCopy'); if (cp) cp.onclick = function () {
        var ta = q('#plNews'); ta.select();
        try { (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { toast('写しました。Claude に送ってください', 2200); }, function () { document.execCommand('copy'); toast('写しました', 1500); }); } catch (e) { toast('長押しで写してください'); }
      };
    } else if (sheetKind === 'planEdit') {
      wirePlanEdit(sheetArg);
    } else if (sheetKind === 'planAdd') {
      q('#paBack').onclick = function () { openSheet('plan'); };
      q('#paSave').onclick = function () {
        var d = (q('#paDate').value || '').split('-'), a = hm(q('#paStart').value || '21:00');
        if (d.length !== 3) { toast('日にちを選んでください'); return; }
        var st = fromJst(+d[0], +d[1] - 1, +d[2], a[0], a[1]);
        if (st < now() - 60 * MIN) { toast('すぎた日には足せません'); return; }
        var k = sessKey(st);
        net.update('schedule/' + k, { extra: true, end: q('#paEnd').value || '22:00', cancel: null }).then(function () { toast('臨時の日を足しました', 1500); openSheet('planEdit', k); });
      };
    } else if (sheetKind === 'bot') {
      q('#botAdd').onclick = function () { addBot(); };
      q('#botAll').onclick = function () { for (var i = 0; i < N; i++) addBot(); };
      q('#botOut').onclick = function () { botsLeave(); closeSheet(); };
    }
  }
  /* ---------------- お店の予定(ノブさんだけ) ---------------- */
  function planList() { return upcoming(now() - 60 * MIN, 35, true).slice(0, 4).concat(extraLater()).filter(function (x, i, a) { return a.findIndex(function (y) { return y.key === x.key; }) === i; }).sort(function (x, y) { return x.start - y.start; }); }
  function extraLater() { return upcoming(now() - 60 * MIN, 60, true).filter(function (x) { return x.plan.extra; }); }
  function planListHTML() {
    var h = '<p class="small-note">これから4回ぶんの予定です。回ごとに 店の名前・マスター・席の数・ひとことを決められます。</p><div class="list">';
    planList().forEach(function (x) {
      var p = x.plan;
      h += '<div class="li' + (p.cancel ? ' off' : '') + '"><div class="t"><b>' + fmtDay(x.start) + ' ' + fmtTime(x.start) + '〜' + fmtTime(x.end) + '</b>' + (p.extra ? ' <i class="pl-tag">臨時</i>' : '') +
        '<small>' + (p.cancel ? 'お休み' : esc(p.title || SHOP.NAME) + ' ・ ' + (p.master ? 'マスター ' + esc(p.master) + 'さん' : 'ノブさん') + ' ・ ' + seatsFor(x) + '席') + (p.message ? '<br>' + esc(p.message) : '') + '</small></div>' +
        '<button data-pedit="' + x.key + '">直す</button></div>';
    });
    h += '</div><div class="btn-row" style="margin-top:10px"><button id="plAdd">➕ 臨時の日を足す</button></div>';
    var nt = newsText();
    h += '<div class="sh-sec">ホームページのお知らせに出す文</div><p class="small-note">予定を変えたら、この文を写して Claude に送ってください。ホームページの「居酒屋ノブ」のお知らせと、アプリの予定にのせます。</p>' +
      '<textarea id="plNews" class="pl-news" readonly>' + esc(nt) + '</textarea><div class="btn-row"><button id="plCopy">📋 写す</button></div>';
    return h;
  }
  /* news.json と同じ形の文(ホームページ用)。合言葉の指紋は のせない */
  function newsText() {
    var evs = upcoming(now() - 60 * MIN, 60, true).filter(function (x) { var p = x.plan; return p.extra || p.cancel || p.title || p.master || p.message || (p.seats && p.seats !== SHOP.SEATS); }).map(function (x) {
      var p = x.plan, j = jst(x.start);
      return { date: j.y + '-' + pad(j.m + 1) + '-' + pad(j.d), start: fmtTime(x.start).replace(/^(\d):/, '0$1:'), end: fmtTime(x.end).replace(/^(\d):/, '0$1:'),
        title: p.title || SHOP.NAME, master: p.master || '', seats: seatsFor(x), message: p.message || '', cancel: !!p.cancel };
    });
    return JSON.stringify({ shop: SHOP.NAME, free: 'すべて無料です', weekly: weekly(), events: evs, notice: (NEWS && NEWS.notice) || '', app: (NEWS && NEWS.app) || 'https://roguepink.github.io/izakaya/', firebase: (NEWS && NEWS.firebase) || '' }, null, 1);
  }
  function findSess(key) { return upcoming(now() - DAY, 70, true).filter(function (x) { return x.key === key; })[0]; }
  function planEditHTML(key) {
    var x = findSess(key); if (!x) return '<p>その回は見つかりませんでした</p>';
    var p = x.plan, other = !!p.master, opts = '';
    for (var i = 1; i <= MAXS; i++) opts += '<option value="' + i + '"' + (i === seatsFor(x) ? ' selected' : '') + '>' + i + '席' + (i === SHOP.SEATS ? '(いつも)' : '') + (i > 10 ? '(スマホだと見にくい)' : '') + '</option>';
    return '<div class="pl-form"><div class="pl-when">' + fmtDay(x.start) + ' ' + fmtTime(x.start) + '〜' + fmtTime(x.end) + (p.extra ? ' ・ 臨時' : '') + '</div>' +
      '<label>店の名前<input id="peTitle" maxlength="16" value="' + esc(p.title || SHOP.NAME) + '"></label>' +
      '<div class="pl-lbl">マスター(カウンターの中に立つ人)</div><div class="opts pl-opts"><button data-master="me" class="' + (other ? '' : 'on') + '">ノブさん(自分)</button><button data-master="other" class="' + (other ? 'on' : '') + '">ほかの人</button></div>' +
      '<div id="peOther" class="' + (other ? '' : 'hidden') + '"><label>マスターの名前<input id="peMaster" maxlength="12" value="' + esc(p.master || '') + '" placeholder="例: さくら"></label>' +
      '<label>マスターの合言葉<input id="pePass" maxlength="40" placeholder="' + (p.masterHash ? '(決めてあります。変えるときだけ入れる)' : 'その人にだけ教える合言葉') + '" autocomplete="off"></label>' +
      '<p class="small-note">マスターになる人は、大将用のアプリ(owner.html)を開いて、この合言葉で入ります。合言葉は この回だけ使えます。ノブさんは、お客さん用のアプリから お客さんとして入れます。</p></div>' +
      '<label>席の数<select id="peSeats">' + opts + '</select></label>' +
      '<label>ひとこと(お知らせ)<textarea id="peMsg" maxlength="120" placeholder="例: さくらさんの誕生日会です！">' + esc(p.message || '') + '</textarea></label>' +
      '<label class="pl-check"><input type="checkbox" id="peCancel"' + (p.cancel ? ' checked' : '') + '> この回はお休みにする</label>' +
      '<div class="btn-row"><button id="peSave" class="red">保存する</button><button id="peBack">もどる</button>' + (p.extra ? '<button id="peDel">この臨時の日を消す</button>' : '') + '</div></div>';
  }
  function wirePlanEdit(key) {
    var body = $('shBody'), q = function (sel) { return body.querySelector(sel); };
    var x = findSess(key); if (!x) return;
    var mode = x.plan.master ? 'other' : 'me';
    body.querySelectorAll('[data-master]').forEach(function (b) { b.onclick = function () { mode = b.getAttribute('data-master'); body.querySelectorAll('[data-master]').forEach(function (c) { c.classList.toggle('on', c === b); }); q('#peOther').classList.toggle('hidden', mode !== 'other'); }; });
    q('#peBack').onclick = function () { openSheet('plan'); };
    var dl = q('#peDel'); if (dl) dl.onclick = function () { if (confirm('この臨時の日を消しますか?')) net.remove('schedule/' + key).then(function () { openSheet('plan'); }); };
    q('#peSave').onclick = function () {
      var title = q('#peTitle').value.trim(), seats = +q('#peSeats').value, msgT = q('#peMsg').value.trim(), cancel = q('#peCancel').checked;
      var up = { title: title && title !== SHOP.NAME ? title : null, seats: seats !== SHOP.SEATS ? seats : null, message: msgT || null, cancel: cancel || null };
      var done = function () { net.update('schedule/' + key, up).then(function () { toast('保存しました', 1500); openSheet('plan'); }); };
      if (mode === 'me') { up.master = null; up.masterHash = null; done(); return; }
      var mn = q('#peMaster').value.trim(), pw = q('#pePass').value.trim();
      if (!mn) { toast('マスターの名前を入れてください'); return; }
      if (!pw && !x.plan.masterHash) { toast('マスターの合言葉を決めてください'); return; }
      if (pw && pw.length < 4) { toast('合言葉は4文字以上にしてください'); return; }
      up.master = mn;
      if (!pw) { done(); return; }
      Net.sha256(pw).then(function (h) {
        if (SHOP.OWNER_HASH && h === SHOP.OWNER_HASH) { toast('ノブさんの合言葉とは別のものにしてください'); return; }
        up.masterHash = h; done();
      }).catch(function () { toast('この端末では合言葉を作れませんでした(https で開いてください)'); });
    };
  }

  function ytMeta(id, isShort, cb) {
    var done = false, fin = function (t, tall) { if (done) return; done = true; cb(t, tall); };
    setTimeout(function () { fin('', isShort); }, 3000);
    try {
      fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/' + (isShort ? 'shorts/' : 'watch?v=') + id))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!j) return fin('', isShort); fin(String(j.title || '').slice(0, 60), isShort || j.height > j.width); })
        .catch(function () { fin('', isShort); });
    } catch (e) { fin('', isShort); }
  }
  function pushYT(url, title) {
    var id = ytId(url); if (!id) return false;
    var isShort = /\/shorts\//.test(url);
    ytMeta(id, isShort, function (t, tall) { pushQueue({ kind: 'yt', id: 'yt-' + id, src: 'https://youtu.be/' + id, title: title || t || 'YouTube の動画', tall: !!tall }); });
    return true;
  }
  function pushQueue(item) {
    var q = tree.queue || {}, keys = Object.keys(q);
    if (keys.length >= SHOP.MAX_QUEUE) { toast('順番待ちがいっぱいです'); return; }
    if (!OWNER_MODE && keys.filter(function (k) { return q[k].by === ME.uid; }).length >= 3) { toast('リクエストは1人3つまでです'); return; }
    item.by = ME.uid; item.byName = currentName(); item.at = TS;
    net.push('queue', item);
    toast('🎵 「' + item.title + '」をリクエストしました', 1800);
  }
  function requestSong(id) {
    var s = SHOP.SONGS.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    pushQueue({ kind: 'file', id: s.id, src: s.src, title: s.title });
  }
  $('bMenu').onclick = function () { if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; } openSheet('menu'); };
  $('bMusic').onclick = function () { openSheet('music'); };
  $('nowPlaying').onclick = function () { openSheet('music'); };
  /* 大将だけ: 今の曲・動画を取り消して次へ */
  function ownerSkip() {
    if (!OWNER_MODE) return;
    var m = tree.state && tree.state.music; if (!m) return;
    advance(musicKey(m));
    toast('⏭ 「' + m.title + '」を取り消して、次へ進めました', 2200);
  }
  $('npSkip').onclick = ownerSkip;
  /* 画面の動き(電池・熱): 自分のスマホだけ。なめらか=60回/秒・細かい、ふつう=30回、省エネ=20回・あらめ */
  var PERF = { smooth: { fps: 60, ratio: 2, name: 'なめらか' }, normal: { fps: 30, ratio: 1.5, name: 'ふつう' }, eco: { fps: 20, ratio: 1, name: '省エネ' } };
  var perfMode = lsGet('iz-perf', 'normal'); if (!PERF[perfMode]) perfMode = 'normal';
  function applyPerf() { withScene(function (sc) { if (sc.setPerf) sc.setPerf({ fps: PERF[perfMode].fps, ratio: PERF[perfMode].ratio }); }); }
  applyPerf();
  $('bOrders').onclick = function () { openSheet('orders'); };
  $('bOwner').onclick = function () { openSheet('owner'); };
  $('bBot').onclick = function () { openSheet('bot'); };
  /* 大将の接客画面の「☰」: 右のボタンを出す・しまう。ほかのボタンを押したら しまう */
  $('bMore').onclick = function () { var o = document.body.classList.toggle('side-open'); $('bMoreLbl').textContent = o ? 'しまう' : 'メニュー'; };
  document.querySelectorAll('.side > .sbtn').forEach(function (b) { if (b.id !== 'bMore') b.addEventListener('click', function () { document.body.classList.remove('side-open'); $('bMoreLbl').textContent = 'メニュー'; }); });

  /* ---------------- おためし客(おためしモードだけ) ---------------- */
  var bots = {};
  var BOT_NAMES = ['たけし', 'みゆき', 'ゆうじ', 'さとみ', 'げんさん', 'あやか', 'こうへい', 'まり'];
  var BOT_LINES = ['今日も一日おつかれさまでした！', '大将、いつもの！', 'ここの焼き鳥、ほんとにうまいんだよね', '最近ちょっと仕事がいそがしくて…', 'この曲いいですね', '週末なにしてました？', 'ちょっと相談してもいいですか？', 'あー、生き返る〜', 'はじめて来ました、よろしくお願いします'];
  function addBot() {
    var free = []; for (var i = 0; i < N; i++) if (!seatUid(i) || !fresh(members()[seatUid(i)])) free.push(i);
    if (!free.length) { toast('満席です'); return; }
    var seat = free[0], uid = 'bot-' + Math.random().toString(36).slice(2, 8);
    var name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    var av = AVATAR.random();
    bots[uid] = { seat: seat, name: name, next: Date.now() + 3000 + Math.random() * 5000 };
    net.set('members/' + uid, { name: name, avatar: av, at: TS, seen: TS, seat: seat, bot: true, voice: av.voice });
    net.set('seats/' + seat, uid);
    net.push('events', { type: 'phrase', id: 'irasshai', seat: seat, at: TS, by: uid });
  }
  function botTick() {
    Object.keys(bots).forEach(function (uid) { if (members()[uid]) net.update('members/' + uid, { seen: TS }); else delete bots[uid]; });
  }
  setInterval(function () {
    if (!inside) return;
    var t = Date.now();
    Object.keys(bots).forEach(function (uid) {
      var b = bots[uid]; if (t < b.next) return;
      b.next = t + 7000 + Math.random() * 9000;
      var r = Math.random();
      if (r < 0.62) net.push('chat', { uid: uid, name: b.name, seat: b.seat, text: BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)], at: TS });
      else if (r < 0.82) { var it = SHOP.MENU[Math.floor(Math.random() * SHOP.MENU.length)]; if (whyNot(b.seat, it.id)) return; net.push('orders', { uid: uid, name: b.name, seat: b.seat, item: it.id, at: TS }); net.push('events', { type: 'order', seat: b.seat, item: it.id, at: TS, by: uid }); }
      else net.push('events', { type: 'phrase', id: Math.random() < 0.6 ? 'kanpai' : 'umai', seat: b.seat, at: TS, by: uid, voice: 2 });
    });
  }, 1000);
  function botsLeave() {
    Object.keys(bots).forEach(function (uid) { var b = bots[uid]; net.remove('seats/' + b.seat); net.remove('tables/' + b.seat); net.remove('members/' + uid); });
    bots = {};
  }

  /* ---------------- 予約 ----------------
     開店の3時間前から予約できる。予約するときに 名前とアバターも登録(前に作ったものがあれば そのまま) */
  var pendingReserve = false;
  $('reserveBtn').onclick = function () {
    var name = $('nameInput').value.trim().slice(0, 12);
    if (!name) { msg('先にお名前を入れてください'); return; }
    ME.name = name; saveMe();
    if (!myAvatar()) { pendingReserve = true; toast('予約の前に、アバターを作ってください', 2200); openMaker(); return; }
    var go = function () { $('entrance').classList.add('hidden'); $('reserve').classList.remove('hidden'); renderReserve(); };
    if (SHOP.PASSCODE_HASH) roomFor($('passInput').value.trim()).then(function (r) { lsSet('iz-pass', $('passInput').value.trim()); connect(r); setTimeout(go, 400); }).catch(function () { msg('合言葉がちがいます'); });
    else go();
  };
  $('rsBack').onclick = function () { $('reserve').classList.add('hidden'); $('entrance').classList.remove('hidden'); };
  function renderReserve() {
    var s = reserveSession(), n = now(), html = '';
    var me = myAvatar();
    html += '<div class="rs-me"><canvas id="rsFace" width="96" height="96"></canvas><div><b>' + esc(ME.name || '') + 'さま</b><small>この名前とアバターで予約します</small></div><button id="rsAv">アバターを変える</button></div>';
    if (!s) html += '<p class="rs-help">予約できる回がありません。</p>';
    else if (!LOCAL && n < reserveOpenAt(s)) {
      html += '<div class="rs-day"><div class="rs-date">' + fmtDay(s.start) + ' ' + fmtTime(s.start) + '〜' + fmtTime(s.end) + '</div>' +
        '<p class="rs-help">予約は <b>' + fmtDay(reserveOpenAt(s)) + ' ' + fmtTime(reserveOpenAt(s)) + '</b> から受け付けます(開店の' + SHOP.RESERVE_FROM_HOURS + '時間前から)。</p></div>';
    } else {
      var r = (tree.reservations || {})[s.key] || {};
      html += '<div class="rs-day"><div class="rs-date">' + fmtDay(s.start) + ' ' + fmtTime(s.start) + '〜' + fmtTime(s.end) + '</div><div class="rs-seats">';
      for (var i = 0; i < N; i++) {
        var x = r[i], seated = seatUid(i) && fresh(members()[seatUid(i)]);
        var cls = x ? (x.uid === ME.uid ? 'mine' : 'taken') : (seated ? 'taken' : '');
        html += '<button class="' + cls + '" data-k="' + s.key + '" data-i="' + i + '">' + (i + 1) + '番<br>' + (x ? (x.uid === ME.uid ? 'あなた' : esc(x.name) + 'さま') : (seated ? '来店中' : '空き')) + '</button>';
      }
      html += '</div>' + (LOCAL ? '<p class="small-note" style="color:#c9b38a">おためしモードなので、時間に関係なく予約できます。</p>' : '') + '</div>';
    }
    $('rsList').innerHTML = html;
    drawFace2D($('rsFace'), me);
    $('rsAv').onclick = function () { pendingReserve = true; $('reserve').classList.add('hidden'); openMaker(); };
    $('rsList').querySelectorAll('.rs-seats button').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-k'), i = +b.getAttribute('data-i');
        var cur = ((tree.reservations || {})[k] || {})[i];
        if (cur && cur.uid !== ME.uid) { toast('その席は予約ずみです'); return; }
        if (cur) { net.remove('reservations/' + k + '/' + i).then(renderReserve); toast('予約を取り消しました'); return; }
        if (seatUid(i) && fresh(members()[seatUid(i)])) { toast('その席には、いまお客さんがいます'); return; }
        var mine = (tree.reservations || {})[k] || {};
        for (var j = 0; j < N; j++) if (mine[j] && mine[j].uid === ME.uid) { toast('1回に予約できるのは1席です'); return; }
        net.set('reservations/' + k + '/' + i, { uid: ME.uid, name: ME.name, avatar: myAvatar(), at: TS }).then(renderReserve);
        toast((i + 1) + '番の席を予約しました。来店すると その席にご案内します', 2600);
      };
    });
  }

  /* ---------------- アバターを作る ----------------
     お客さん: まず 女性/男性 を選ぶ → 顔・目・髪・服・小物。大将: 大将だけの服(法被・白衣…)・頭(はちまき…)・前掛け */
  var OWNER_PRESETS = [
    { name: '法被の大将', top: 'happi', topColor: 0, head: 'hachimaki', apron: 'navy' },
    { name: '板前', top: 'hakui', topColor: 2, head: 'itamae', apron: 'white' },
    { name: '作務衣', top: 'samue', topColor: 10, head: 'tenugui', apron: 'brown' },
    { name: '甚平', top: 'jinbei', topColor: 4, head: 'nejiri', apron: 'none' },
    { name: 'Tシャツと前掛け', top: 'tee', topColor: 1, head: 'bandana', apron: 'black' }
  ];
  /* 女性の大将(女将・看板娘)の着こなし。かわいらしい お店の衣装 */
  var OWNER_PRESETS_F = [
    { name: '看板娘(着物)', top: 'kimono', topColor: 8, head: 'kanzashi', apron: 'frill' },
    { name: '割烹着の女将', top: 'kappogi', topColor: 2, head: 'sankaku', apron: 'none' },
    { name: '浴衣', top: 'yukata', topColor: 7, head: 'flower', apron: 'none' },
    { name: 'はっぴ娘', top: 'happi', topColor: 8, head: 'hachimaki', apron: 'pink' },
    { name: 'カフェ風', top: 'blouse', topColor: 9, head: 'ribbon', apron: 'pinkfrill' },
    { name: '作務衣', top: 'samue', topColor: 4, head: 'band', apron: 'red' }
  ];
  function ownerPresets() { return draft && draft.sex === 'f' ? OWNER_PRESETS_F : OWNER_PRESETS; }
  var preview = null, draft = null, mkTab = 0;
  function sexLabel(x) { return x === 'f' ? '女性' : '男性'; }
  var GUEST_TABS = [
    { name: 'おまかせ', build: function () {
      var h = '<div class="mk-sex">' + sexLabel(draft.sex) + 'のアバター <button data-resex="1">女性/男性を選びなおす</button></div>';
      h += '<div class="mk-sec">はじめから用意してあるアバター</div><div class="presets">';
      AVATAR.PRESETS[draft.sex].forEach(function (p, i) { h += '<button data-preset="' + i + '">' + esc(p.name) + '</button>'; });
      return h + '</div><div class="mk-sec">ほかのタブで、顔・目・髪・服・小物を細かく直せます</div>';
    } },
    { name: '顔', build: function () {
      var h = opts('顔の形', 'face') + opts('まゆ', 'brows') + opts('口', 'mouth');
      if (draft.sex === 'm') h += opts('ひげ', 'beard');
      else h += swatch('くちびるの色', 'lip', AVATAR.LIP_COLOR, true) + numOpts('ほっぺ', 'cheek', ['なし', 'ほんのり', 'しっかり']);
      return h + swatch('はだの色', 'skin', AVATAR.SKIN);
    } },
    { name: '目', build: function () { return opts('目', 'eyes') + swatch('目の色', 'eyeColor', AVATAR.EYE_COLOR); } },
    { name: '髪', build: function () { return opts('髪型', 'hair') + (draft.sex === 'm' && draft.hair === 'back' ? '' : opts('前髪', 'bangs')) + opts('アホ毛', 'ahoge') + swatch('髪の色', 'hairColor', AVATAR.HAIR_COLOR); } },
    { name: '服', build: function () { return opts('服', 'top') + swatch('服の色', 'topColor', AVATAR.CLOTH_COLOR); } },
    { name: '小物', build: function () { return opts('小物', 'acc'); } },
    { name: '体と声', build: function () { return sizeVoice(); } }
  ];
  var OWNER_TABS = [
    { name: 'おまかせ', build: function () {
      var h = '<div class="mk-sex">大将のアバター(' + sexLabel(draft.sex) + ') <button data-resex="1">女性/男性を選びなおす</button></div>';
      h += '<div class="mk-sec">大将の着こなし</div><div class="presets">';
      ownerPresets().forEach(function (p, i) { h += '<button data-opreset="' + i + '">' + esc(p.name) + '</button>'; });
      return h + '</div><div class="mk-sec">' + (draft.sex === 'f' ? '着物・割烹着・フリルエプロンなど、女将・看板娘の服も選べます。' : '') + 'はちまき・前掛けなど お店の人の服は、大将だけが着られます</div>';
    } },
    GUEST_TABS[1], GUEST_TABS[2], GUEST_TABS[3],
    { name: '大将の服', build: function () { return opts('服', 'top') + swatch('服の色', 'topColor', AVATAR.CLOTH_COLOR); } },
    { name: '頭と前掛け', build: function () { return opts('頭', 'head') + opts('前掛け', 'apron'); } },
    GUEST_TABS[6]
  ];
  function tabs() { return OWNER_MODE ? OWNER_TABS : GUEST_TABS; }
  function sizeVoice() {
    var h = '<div class="mk-sec">体の大きさ</div><input type="range" id="mkSize" min="' + AVATAR.SIZE_MIN + '" max="' + AVATAR.SIZE_MAX + '" step="0.01" value="' + draft.size + '">';
    h += '<div class="mk-sec">「乾杯」などの声</div><div class="opts">';
    AVATAR.VOICES.forEach(function (v, i) { h += '<button data-n="voice" data-v="' + i + '" class="' + (draft.voice === i ? 'on' : '') + '">' + esc(v.name) + '</button>'; });
    return h + '</div><div class="mk-sec">いまは仮の読み上げの声です。あとで本物の声に差しかえられます。</div>';
  }
  function opts(label, key) {   // 形を選ぶ(値は id)
    var h = '<div class="mk-sec">' + label + '</div><div class="opts">';
    AVATAR.parts(draft, key).forEach(function (it) { h += '<button data-k="' + key + '" data-v="' + it[0] + '" class="' + (draft[key] === it[0] ? 'on' : '') + '">' + esc(it[1]) + '</button>'; });
    return h + '</div>';
  }
  function numOpts(label, key, names) {
    var h = '<div class="mk-sec">' + label + '</div><div class="opts">';
    names.forEach(function (n, i) { h += '<button data-n="' + key + '" data-v="' + i + '" class="' + (draft[key] === i ? 'on' : '') + '">' + esc(n) + '</button>'; });
    return h + '</div>';
  }
  function swatch(label, key, colors, noFree) {
    var h = '<div class="mk-sec">' + label + '</div><div class="swatches">';
    colors.forEach(function (c, i) { h += '<button data-n="' + key + '" data-v="' + i + '" class="' + (draft[key] === i ? 'on' : '') + '" style="background:' + c + '"></button>'; });
    if (!noFree) { var cur = AVATAR.color(colors, draft[key]); h += '<label class="free-color' + (typeof draft[key] === 'string' ? ' on' : '') + '">🎨 自由な色<input type="color" data-free="' + key + '" value="' + cur + '"></label>'; }
    return h + '</div>';
  }
  function chooseSex(sx) {
    var keep = draft ? { voice: draft.voice, size: draft.size } : {};
    if (OWNER_MODE) { var o = JSON.parse(JSON.stringify(AVATAR.OWNER)); o.sex = sx; if (sx === 'f') { var fp = OWNER_PRESETS_F[0]; o.hair = 'bun'; o.bangs = 'seethrough'; o.eyes = 'big'; o.brows = 'soft'; o.mouth = 'smile'; o.face = 'egg'; o.skin = 1; o.hairColor = 1; o.lip = 1; o.cheek = 2; o.size = 1; o.voice = 2; o.top = fp.top; o.topColor = fp.topColor; o.head = fp.head; o.apron = fp.apron; } draft = AVATAR.fix(o); }
    else { var p = JSON.parse(JSON.stringify(AVATAR.PRESETS[sx][0])); p.sex = sx; p.voice = sx === 'f' ? 2 : 1; draft = AVATAR.fix(p); }
    if (keep.size) draft.size = keep.size;
    mkTab = 0; sexStep = false; updateDraft(); renderMaker();
  }
  var sexStep = false;
  function openMaker() {
    var cur = myAvatar();
    draft = cur ? AVATAR.fix(JSON.parse(JSON.stringify(cur))) : null;
    sexStep = !draft;
    $('maker').dataset.back = inside ? 'shop' : 'entrance';
    $('entrance').classList.add('hidden');
    $('maker').classList.remove('hidden');
    document.querySelector('.mk-title').textContent = OWNER_MODE ? '大将のアバターを作る' : 'アバターを作る';
    var startPreview = function () {
      if (!window.IZ3D) return;
      if (!preview) preview = window.IZ3D.createPreview($('preview'));
      if (draft) preview.setAvatar(draft); else preview.setAvatar(null);
    };
    if (window.IZ3D) startPreview(); else window.addEventListener('iz3d-ready', startPreview, { once: true });
    renderMaker();
  }
  function renderMaker() {
    var tbox = $('mkTabs'), body = $('mkBody');
    $('mkSave').disabled = sexStep;
    document.querySelector('.mk-tools').classList.toggle('hidden', sexStep);
    if (sexStep) {   // さいしょに 女性/男性 を選ぶ
      tbox.innerHTML = '';
      body.innerHTML = '<div class="mk-sexpick"><p>' + (OWNER_MODE ? '大将の' : '') + 'アバターを作ります。<br>まず、どちらかを選んでください。</p>' +
        '<button data-sex="f"><span>👩</span>女性</button><button data-sex="m"><span>👨</span>男性</button>' +
        '<small>髪型・目・服・小物が、それぞれ女性用・男性用になります。</small></div>';
      body.querySelectorAll('[data-sex]').forEach(function (b) { b.onclick = function () { chooseSex(b.getAttribute('data-sex')); }; });
      return;
    }
    var T = tabs();
    if (tbox.children.length !== T.length) {
      tbox.innerHTML = '';
      T.forEach(function (t, i) { var b = document.createElement('button'); b.textContent = t.name; b.onclick = function () { mkTab = i; renderMaker(); }; tbox.appendChild(b); });
    }
    Array.prototype.forEach.call(tbox.children, function (b, i) { b.classList.toggle('on', i === mkTab); });
    var keep = body.scrollTop;
    body.innerHTML = T[mkTab].build();
    body.scrollTop = keep;
    body.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { draft[b.getAttribute('data-k')] = b.getAttribute('data-v'); draft = AVATAR.fix(draft); updateDraft(); renderMaker(); }; });
    body.querySelectorAll('[data-n]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-n'); draft[k] = +b.getAttribute('data-v'); draft = AVATAR.fix(draft);
        if (k === 'voice') speak('かんぱーい！', draft.voice);
        updateDraft(); renderMaker();
      };
    });
    body.querySelectorAll('[data-preset]').forEach(function (b) {
      b.onclick = function () { var p = JSON.parse(JSON.stringify(AVATAR.PRESETS[draft.sex][+b.getAttribute('data-preset')])); p.sex = draft.sex; p.voice = draft.voice; p.size = draft.size; draft = AVATAR.fix(p); updateDraft(); renderMaker(); };
    });
    body.querySelectorAll('[data-opreset]').forEach(function (b) {
      b.onclick = function () { var p = ownerPresets()[+b.getAttribute('data-opreset')]; ['top', 'topColor', 'head', 'apron'].forEach(function (k) { draft[k] = p[k]; }); draft = AVATAR.fix(draft); updateDraft(); renderMaker(); };
    });
    var rs = body.querySelector('[data-resex]'); if (rs) rs.onclick = function () { sexStep = true; renderMaker(); };
    body.querySelectorAll('[data-free]').forEach(function (inp) {
      inp.oninput = function () { draft[inp.getAttribute('data-free')] = inp.value; draft = AVATAR.fix(draft); updateDraft(); };
      inp.onchange = function () { renderMaker(); };
    });
    var sz = $('mkSize'); if (sz) sz.oninput = function () { draft.size = +sz.value; updateDraft(); };
  }
  function updateDraft() { if (preview && draft) preview.setAvatar(draft); }
  $('makerBtn').onclick = function () { unlockAudio(); openMaker(); };
  $('mkRandom').onclick = function () {
    if (!draft) return;
    if (OWNER_MODE) { var OP = ownerPresets(), p = OP[Math.floor(Math.random() * OP.length)]; ['top', 'topColor', 'head', 'apron'].forEach(function (k) { draft[k] = p[k]; }); var r = AVATAR.random(draft.sex); ['hair', 'hairColor', 'eyes', 'brows', 'mouth', 'face', 'skin'].forEach(function (k) { draft[k] = r[k]; }); draft = AVATAR.fix(draft); }
    else { var v = draft.voice; draft = AVATAR.random(draft.sex); draft.voice = v; }
    updateDraft(); renderMaker();
  };
  $('mkZoom').onclick = function () { var z = this.classList.toggle('on'); if (preview) preview.setZoom(z); this.textContent = z ? '🔍 全身' : '🔍 顔を大きく'; };
  $('mkCheer').onclick = function () { if (preview) preview.cheer(); };
  function closeMaker() {
    $('maker').classList.add('hidden');
    if ($('maker').dataset.back !== 'shop') $('entrance').classList.remove('hidden');
    if (pendingEnter && myAvatar()) { pendingEnter = false; $('enterBtn').click(); }
    pendingEnter = false;
    if (pendingReserve) { pendingReserve = false; if (myAvatar()) { $('entrance').classList.add('hidden'); $('reserve').classList.remove('hidden'); renderReserve(); } }
  }
  var pendingEnter = false;
  $('mkBack').onclick = function () { pendingEnter = false; closeMaker(); };
  $('mkSave').onclick = function () {
    if (!draft) return;
    if (OWNER_MODE) { draft.owner = true; ownerAvatar = AVATAR.fix(draft); lsSet('iz-owner-avatar', ownerAvatar); if (inside) net.update('state', { ownerAvatar: ownerAvatar }); }
    else { draft.owner = false; ME.avatar = AVATAR.fix(draft); saveMe(); }
    if (inside) net.update('members/' + ME.uid, { avatar: myAvatar(), voice: myAvatar().voice });
    drawFace2D($('meFace'), myAvatar());
    toast('アバターを決めました', 1400);
    closeMaker();
  };

  /* 入口に出す 小さな顔(2D) */
  function drawFace2D(cv, a) {
    var g = cv.getContext('2d'), w = cv.width;
    g.clearRect(0, 0, w, w);
    if (!a) { g.fillStyle = '#b8a07a'; g.font = (w * 0.5) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, w / 2); return; }
    g.fillStyle = AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor); g.beginPath(); g.ellipse(w / 2, w * 1.02, w * 0.42, w * 0.3, 0, 0, Math.PI * 2); g.fill();
    var hc = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
    if (a.sex === 'f' && a.hair !== 'short' && a.hair !== 'bun' && a.hair !== 'ponytail') { g.fillStyle = hc; g.beginPath(); g.ellipse(w / 2, w * 0.58, w * 0.36, w * 0.36, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = AVATAR.color(AVATAR.SKIN, a.skin); g.beginPath(); g.arc(w / 2, w * 0.5, w * 0.3, 0, Math.PI * 2); g.fill();
    if (a.hair !== 'buzz') { g.fillStyle = hc; g.beginPath(); g.arc(w / 2, w * 0.46, w * 0.32, Math.PI * 1.02, Math.PI * 1.98); g.fill(); }
    g.fillStyle = '#241712';
    [0.4, 0.6].forEach(function (x) { g.beginPath(); g.ellipse(w * x, w * 0.53, w * 0.035, w * (a.sex === 'f' ? 0.05 : 0.04), 0, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#5a2a20'; g.lineWidth = w * 0.03; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, w * 0.6, w * 0.07, 0.2, Math.PI - 0.2); g.stroke();
  }

  /* ---------------- お知らせ ---------------- */
  var toastT = 0;
  /* お知らせ。label と fn を渡すと、ボタン(「取り消す」など)が付く */
  function toast(t, ms, label, fn) {
    var el = $('toast'); el.textContent = t; el.classList.remove('hidden');
    if (label) { var b = document.createElement('button'); b.className = 'toast-btn'; b.textContent = label; b.onclick = function (e) { e.stopPropagation(); el.classList.add('hidden'); fn(); }; el.appendChild(b); }
    el.classList.toggle('has-btn', !!label);
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.add('hidden'); }, ms || 2600);
  }

  initEntrance();
  // 確認用(画面の自動テストから使う)
  window.IZ = { scene: function () { return scene; }, get tree() { return tree; }, get inside() { return inside; }, get seat() { return mySeat; }, net: function () { return net; }, addBot: addBot, status: status, upcoming: upcoming };
})();
