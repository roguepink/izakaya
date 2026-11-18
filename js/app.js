'use strict';
/* =====================================================================
   居酒屋の進行係 —— 入口・アバター作り・予約・お店の中(会話・注文・曲・決まり文句の声)・閉店。
   お店の中身(席の数・メニュー・曲・営業日)は js/config.js、アバターの部品は js/avatar-data.js。
   ===================================================================== */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LOCAL = !(SHOP.FIREBASE && SHOP.FIREBASE.databaseURL) || /[#&]local\b/.test(location.hash);
  var OWNER_MODE = /[#&]owner\b/.test(location.hash);
  var N = Math.max(1, Math.min(20, SHOP.SEATS | 0));
  var JST = 9 * 3600e3, MIN = 60e3, DAY = 86400e3;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------------- 自分(この端末)の情報 ---------------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var ME = lsGet('iz-me', null);
  if (!ME || !ME.uid) {
    ME = { uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: '', avatar: AVATAR.random() };
    lsSet('iz-me', ME);
  }
  ME.avatar = AVATAR.fix(ME.avatar);
  var ownerAvatar = AVATAR.fix(lsGet('iz-owner-avatar', AVATAR.OWNER));
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
  function upcoming(now, days) {
    var out = [];
    for (var i = -1; i <= days; i++) {
      var b = jst(now + i * DAY);
      SHOP.SCHEDULE.forEach(function (s) {
        if (b.w !== s.day) return;
        var a = hm(s.start), e = hm(s.end);
        var st = fromJst(b.y, b.m, b.d, a[0], a[1]), en = fromJst(b.y, b.m, b.d, e[0], e[1]);
        if (en <= st) en += DAY;
        if (en > now) out.push({ start: st, end: en, key: sessKey(st) });
      });
    }
    out.sort(function (x, y) { return x.start - y.start; });
    return out;
  }
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
      scene = window.IZ3D.createShop($('stage'), { seats: N });
    } catch (e) {
      console.warn('3D が使えないので 2D にします', e);
      scene = make2D();
    }
    scene.onTap = function (seat) { if (seat >= 0) onSeatTap(seat); };
    scene.onFrame = placeOverlays;
    sceneWait.forEach(function (fn) { fn(scene); }); sceneWait = [];
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
  function setVol() { audio.volume = Math.max(0, Math.min(1, vol * duck)); ytCmd('setVolume', [Math.round(vol * duck * 100)]); }
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
      if (!m) { $('npTitle').textContent = '—'; return; }
      $('npTitle').textContent = m.title + (m.byName ? '(' + m.byName + 'さんのリクエスト)' : '');
      if (m.kind === 'yt') { showYT(m); }
      else {
        audio.src = m.src;
        var go = function () { try { audio.currentTime = elapsed(m); } catch (e) {} setVol(); var p = audio.play(); if (p && p.catch) p.catch(needTap); };
        if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
      }
      return;
    }
    if (!m) return;
    if (m.kind !== 'yt' && audio.src && !audio.paused && isFinite(audio.duration)) {
      var want = elapsed(m);
      if (want < audio.duration - 1 && Math.abs(audio.currentTime - want) > 1.5) { try { audio.currentTime = want; } catch (e) {} }
    }
  }
  var tapAsked = false;
  function needTap() {
    if (tapAsked) return; tapAsked = true;
    toast('🔈 画面を一度さわると、曲が流れます', 4000);
    var f = function () { tapAsked = false; curKey = ''; syncMusic(); document.removeEventListener('pointerdown', f, true); };
    document.addEventListener('pointerdown', f, true);
  }
  audio.addEventListener('ended', function () { if (amLeader()) advance(curKey); });
  audio.addEventListener('error', function () { if (amLeader()) setTimeout(function () { advance(curKey); }, 3000); });
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
    net.set('state/music', { kind: next.kind || 'file', id: next.id || ('q' + Date.now()), src: next.src, title: next.title, by: next.by || '', byName: next.byName || '', start: TS });
  }
  /* YouTube(公式の埋めこみ。部品は読みこまず、合図だけ送る) */
  function ytId(url) {
    var m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : '');
  }
  function showYT(m) {
    var id = ytId(m.src); if (!id) return;
    ytOn = true; ytState = -1; ytLoadedAt = Date.now();
    var f = document.createElement('iframe');
    f.allow = 'autoplay; encrypted-media';
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&enablejsapi=1&controls=1&start=' + Math.floor(elapsed(m)) + '&origin=' + encodeURIComponent(location.origin);
    f.onload = function () { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) {} setVol(); };
    $('ytHolder').innerHTML = ''; $('ytHolder').appendChild(f);
    $('ytBox').classList.remove('hidden');
  }
  function hideYT() { ytOn = false; $('ytHolder').innerHTML = ''; $('ytBox').classList.add('hidden'); }
  function ytCmd(func, args) {
    var f = $('ytHolder').firstChild; if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    if (!/youtube/.test(e.origin)) return;
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    if (d && d.info && typeof d.info.playerState === 'number') {
      ytState = d.info.playerState;
      if (ytState === 0 && amLeader()) advance(curKey);
    }
  });
  $('ytMin').onclick = function () { $('ytBox').classList.toggle('min'); this.textContent = $('ytBox').classList.contains('min') ? '＋' : 'ー'; };

  /* ---------------- お店の様子が変わったら ---------------- */
  var inside = false, mySeat = -1, joinAt = 0, seenMine = false, seenChat = {}, seenEvt = {}, lastOrders = 0;
  var view = 'overview';
  function onTree(t) { tree = t || {}; applyTree(); }
  function members() { return tree.members || {}; }
  function fresh(m) { return m && now() - (m.seen || 0) < 50000; }
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
    var ms = members();
    var seats = [];
    for (var i = 0; i < N; i++) {
      var uid = seatUid(i), m = uid && ms[uid];
      seats.push(m && fresh(m) ? { key: uid, avatar: m.avatar, name: m.name, me: uid === ME.uid } : null);
    }
    scene.setSeats(seats);
    var st = tree.state || {};
    scene.setOwner(st.ownerAvatar ? AVATAR.fix(st.ownerAvatar) : AVATAR.fix(AVATAR.OWNER));
    var tb = tree.tables || {}, tables = [];
    for (var j = 0; j < N; j++) { var o = tb[j] || {}; tables.push(Object.keys(o).sort().map(function (k) { return o[k]; })); }
    scene.setTables(tables);
    if (!inside) return;

    // 自分が店から出された(大将に帰ってもらった・閉店で片づけられた)
    if (ms[ME.uid]) seenMine = true;
    else if (seenMine) { leave(true); toast('お店を出ました'); return; }
    // 自分の席
    var s2 = -1; for (var k = 0; k < N; k++) if (seatUid(k) === ME.uid) s2 = k;
    if (s2 !== mySeat) { mySeat = s2; if (!OWNER_MODE) setView(mySeat >= 0 ? (view === 'overview' ? 'first' : view) : 'overview'); }
    $('pickHint').classList.toggle('hidden', OWNER_MODE || mySeat >= 0);
    var cnt = seats.filter(Boolean).length;
    $('tbCount').textContent = '👥 ' + cnt + '/' + N + (ownerPresent() ? ' ・大将あり' : '');
    // 閉店
    if (st.closedAt && st.closedAt > joinAt && !$('closing').classList.contains('show')) showClosing();
    renderLog(); processEvents(); renderOrdersBadge();
    syncMusic();
    if (sheetKind) refreshSheet();
  }

  /* ---------------- 入口 ---------------- */
  function renderEntrance() {
    var n = now(), s = status(n);
    var el = $('openState');
    el.className = 'open-state' + (s.phase === 'open' ? ' on' : s.phase === 'doors' ? ' soon' : '');
    if (LOCAL) { el.textContent = 'おためし営業中'; el.className = 'open-state on'; }
    else if (s.phase === 'open') el.textContent = '営業中 ・ ' + fmtTime(s.end) + 'まで';
    else if (s.phase === 'doors') el.textContent = 'まもなく開店 ・ ' + fmtTime(s.start) + 'から';
    else el.textContent = s.next ? '準備中 ・ 次は ' + fmtDay(s.next.start) + ' ' + fmtTime(s.next.start) : '準備中';
    $('enterBtn').disabled = !LOCAL && !OWNER_MODE && s.phase === 'closed';
    $('enterBtn').textContent = OWNER_MODE ? '🏮 大将として店に立つ' : (s.phase === 'closed' && !LOCAL ? '準備中です' : '🏮 のれんをくぐる');
    if (inside) {
      var left = s.phase === 'open' && !LOCAL ? Math.max(0, Math.ceil((s.end - n) / MIN)) : null;
      $('tbState').textContent = LOCAL ? 'おためし' : s.phase === 'open' ? (s.lastCall ? 'ラストオーダー ・ あと' + left + '分' : 'あと' + left + '分') : s.phase === 'doors' ? 'まもなく開店' : '準備中(仕込み)';
    }
  }
  function scheduleText() {
    var days = SHOP.SCHEDULE.map(function (s) { return '毎週' + WEEK[s.day] + '曜 ' + s.start + '〜' + s.end; });
    return days.join(' / ') + '<br>カウンター' + N + '席 ・ 相談ごとも世間話も、なんでもどうぞ';
  }
  function initEntrance() {
    document.title = SHOP.NAME;
    $('shopName').textContent = SHOP.NAME; $('tbName').textContent = SHOP.NAME;
    $('schedule').innerHTML = scheduleText();
    $('holdMin').textContent = SHOP.RESERVE_HOLD_MIN;
    $('nameInput').value = OWNER_MODE ? (ME.ownerName || SHOP.OWNER_NAME) : (ME.name || '');
    if (SHOP.PASSCODE_HASH && !OWNER_MODE) $('passRow').classList.remove('hidden');
    if (OWNER_MODE && SHOP.OWNER_HASH) $('ownerRow').classList.remove('hidden');
    $('passInput').value = lsGet('iz-pass', '');
    if (OWNER_MODE) document.body.classList.add('is-owner');
    $('modeNote').textContent = LOCAL ? 'いまは「おためしモード」です。このスマホ(パソコン)の中だけで動きます。タブを2つ開くと2人で試せます。' : (OWNER_MODE && !SHOP.OWNER_HASH ? '大将の合言葉がまだ決まっていません(おためし中)' : '');
    drawFace2D($('meFace'), myAvatar());
    // 合言葉がいらない店なら、すぐ店の様子を読みこむ(営業中かどうか・予約を見るため)
    if (!SHOP.PASSCODE_HASH) connect('main');
    else if ($('passInput').value) roomFor($('passInput').value).then(connect).catch(function () {});
    setInterval(function () { renderEntrance(); if (inside) tick(); }, 1000);
  }
  function msg(t) { $('entMsg').textContent = t || ''; }

  function checkOwner() {
    if (!OWNER_MODE) return Promise.resolve(true);
    if (!SHOP.OWNER_HASH) return Promise.resolve(true);
    return Net.sha256($('ownerPass').value).then(function (h) { return h === SHOP.OWNER_HASH; }).catch(function () { return false; });
  }
  $('enterBtn').onclick = function () {
    unlockAudio();
    var name = $('nameInput').value.trim().slice(0, 12);
    if (!name) { msg('お名前を入れてください'); $('nameInput').focus(); return; }
    if (OWNER_MODE) ME.ownerName = name; else ME.name = name;
    saveMe();
    var pass = $('passInput').value.trim();
    msg('');
    checkOwner().then(function (ok) {
      if (!ok) { msg('大将の合言葉がちがいます'); return; }
      return roomFor(pass).then(function (room) {
        if (SHOP.PASSCODE_HASH) lsSet('iz-pass', pass);
        connect(room);
        var wait = 0;
        (function go() {   // つながるのを少し待つ
          if (!net.ready && wait++ < 40) { setTimeout(go, 150); return; }
          var s = status(now());
          if (!LOCAL && !OWNER_MODE && s.phase === 'closed') { msg('いまは準備中です'); return; }
          enter(name);
        })();
      }).catch(function () { msg('合言葉がちがいます'); });
    });
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
      net.update('state', { ownerAvatar: ownerAvatar, ownerName: name });
      sys('🏮 大将の' + name + 'が店に立ちました');
    }
    $('entrance').classList.add('hidden');
    $('shop').classList.remove('hidden');
    $('bBot').classList.toggle('hidden', !LOCAL);
    setView(OWNER_MODE ? 'owner' : 'overview');
    buildPhrases();
    hbTimer = setInterval(function () { if (inside && members()[ME.uid]) net.update('members/' + ME.uid, { seen: TS }); botTick(); }, 15000);
    if (!OWNER_MODE) {
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
  window.addEventListener('pagehide', function () {
    if (!inside || !net) return;
    if (mySeat >= 0) net.leaveBeacon('seats/' + mySeat);
    net.leaveBeacon('members/' + ME.uid);
  });
  function currentName() { var m = members()[ME.uid]; return (m && m.name) || ME.name; }
  $('bLeave').onclick = function () {
    if (!confirm(OWNER_MODE ? '奥に下がりますか?' : 'お店を出ますか?')) return;
    leave(false);
  };

  /* ---------------- 席 ---------------- */
  function reservationsNow() {
    var s = status(now()); if (s.phase === 'closed') return {};
    var r = (tree.reservations || {})[s.key] || {};
    if (now() > s.start + SHOP.RESERVE_HOLD_MIN * MIN) return {};
    return r;
  }
  function myReservation() { var r = reservationsNow(); for (var i = 0; i < N; i++) if (r[i] && r[i].uid === ME.uid) return i; return -1; }
  function onSeatTap(i) {
    if (!inside) return;
    var uid = seatUid(i), m = uid && members()[uid];
    if (OWNER_MODE) { if (m && fresh(m)) openSheet('seat', i); return; }
    if (mySeat >= 0) return;
    if (m && fresh(m)) { toast('その席は ふさがっています'); return; }
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
  function setView(v) { view = v; withScene(function (s) { s.setView(v, mySeat); }); $('bViewLbl').textContent = VIEW_NAMES[v] || '目線'; }
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
  $('log').addEventListener('click', function () { if (!document.querySelector('.log-wrap').classList.contains('big')) toggleLog(true); });
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
  function renderLog() {
    var c = tree.chat || {}, keys = Object.keys(c).sort();
    var shown = keys.filter(function (k) { return (c[k].at || 0) >= joinAt - 10 * MIN; }).slice(-120);
    var log = $('log'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    var html = shown.map(function (k) {
      var m = c[k];
      if (m.sys) return '<div class="ln sys">' + esc(m.text) + '</div>';
      return '<div class="ln' + (m.owner ? ' owner' : '') + '"><b>' + esc(m.name || '') + '</b>' + esc(m.text) + '</div>';
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
    if (!b.el.parentNode) b.el.style.display = 'none';   // 置き場所が決まるまでは隠す
    $('bubbles').appendChild(b.el);   // いちばん新しい吹き出しを、いちばん手前に
    b.el.className = 'bubble' + (phrase ? ' phrase' : '') + (text.length > 50 ? ' long' : '');
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
  function placeOverlays() {
    if (!scene) return;
    var a = scene.anchors(), ms = members(), used = {};
    var showTags = inside || true;
    var put = function (key, cls, text, p, click) { if (!p) return; var t = tagEl(key, cls, text, click); t.style.left = p.x + 'px'; t.style.top = p.y + 'px'; t.style.display = ''; used[key] = 1; };
    if (showTags) {
      var st = tree.state || {};
      put('owner', 'owner', (st.ownerName || SHOP.OWNER_NAME) + (ownerPresent() ? '' : '(おまかせ中)'), a.owner);
      var resv = inside ? reservationsNow() : {};
      for (var i = 0; i < N; i++) {
        var uid = seatUid(i), m = uid && ms[uid];
        if (m && fresh(m)) put('s' + i, uid === ME.uid ? 'me' : '', m.name + (uid === ME.uid ? '(あなた)' : ''), a.seats[i]);
        else if (inside && !OWNER_MODE && mySeat < 0 && !document.body.classList.contains('no3d')) {
          var r = resv[i];
          (function (k) { put('e' + k, r && r.uid !== ME.uid ? 'reserved' : 'free', r ? (r.uid === ME.uid ? 'ご予約の席' : '予約席') : (k + 1) + '番 空席', a.empty[k], function () { onSeatTap(k); }); })(i);
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
    var list = [];
    Object.keys(bubbles).forEach(function (k) {
      var b = bubbles[k], p = k === 'owner' ? a.owner : a.seats[+k];
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
      var nm = it.k === 'owner' ? ((tree.state && tree.state.ownerName) || SHOP.OWNER_NAME) : (function () { var u = seatUid(+it.k), m = u && ms[u]; return m ? m.name : ''; })();
      if (b.bn.textContent !== nm) b.bn.textContent = nm;
      b.el.style.display = '';
      b.el.classList.remove('moved');   // 測る前に、名前の行を消しておく(ずらすときに付けて、測りなおす)
      // まず、頭の上から上の端までを使える高さにして、自然な大きさを測る
      var T = p.y;                                   // 吹き出しの「しっぽの先」の位置
      b.bt.style.maxHeight = Math.max(MIN_TEXT, Math.min(T - TAIL - topLimit - 16, share - 16)) + 'px';
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
      if (over > 2) {
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
      } else if (e.type === 'order') {
        ownerTo(e.seat, true);
        var it0 = menuItem(e.item), ph3 = SHOP.PHRASES.filter(function (p) { return p.id === 'haiyo'; })[0];
        if (ph3) { bubble('owner', ph3.say + (it0 ? ' ' + it0.emoji + ' ' + it0.name + 'ね' : ''), true); playPhrase(ph3, 0); }
      } else if (e.type === 'serve') {
        var it = menuItem(e.item);
        ownerTo(e.seat, true);
        var ph2 = SHOP.PHRASES.filter(function (p) { return p.id === 'omachi'; })[0];
        if (ph2) { bubble('owner', ph2.say + ' ' + (it ? it.emoji + ' ' + it.name : ''), true); playPhrase(ph2, 0); }
      }
    });
  }

  /* ---------------- 注文と料理 ---------------- */
  function menuItem(id) { return SHOP.MENU.filter(function (m) { return m.id === id; })[0]; }
  function order(id) {
    if (mySeat < 0) { toast('先に席に座ってください'); return; }
    net.push('orders', { uid: ME.uid, name: currentName(), seat: mySeat, item: id, at: TS });
    event({ type: 'order', seat: mySeat, item: id });
    var it = menuItem(id);
    toast((it ? it.emoji + ' ' + it.name : '') + ' を注文しました', 1600);
    closeSheet();
  }
  function serve(seat, id, orderKey) {
    var k = net.newKey();
    net.set('tables/' + seat + '/' + k, id);
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
      if (fresh(ms[uid]) || (ms[uid].bot && bots[uid])) return;
      net.remove('members/' + uid);
      for (var i = 0; i < N; i++) if (seatUid(i) === uid) { net.remove('seats/' + i); net.remove('tables/' + i); }
    });
    for (var i = 0; i < N; i++) { var u = seatUid(i); if (u && !ms[u]) { net.remove('seats/' + i); net.remove('tables/' + i); } }
    // 大将がいないときは、注文を自動で出す
    if (!ownerPresent()) {
      var o = tree.orders || {};
      Object.keys(o).forEach(function (k) { if (n - (o[k].at || n) > 2500) serve(o[k].seat, o[k].item, k); });
    }
    // 古い合図・会話を整理
    var ev = tree.events || {};
    Object.keys(ev).forEach(function (k) { if (n - (ev[k].at || 0) > 120000) net.remove('events/' + k); });
    var ck = Object.keys(tree.chat || {}).sort();
    if (ck.length > 200) ck.slice(0, ck.length - 150).forEach(function (k) { net.remove('chat/' + k); });
    // 曲
    var m = st.music;
    if (!m) advance('');
    else if (m.kind === 'yt' && elapsed(m) > 12 * 60) advance(musicKey(m));
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
  function openSheet(kind, arg) { sheetKind = kind; sheetArg = arg; $('sheet').classList.remove('hidden'); $('sheetBack').classList.remove('hidden'); refreshSheet(true); }
  function closeSheet() { sheetKind = ''; $('sheet').classList.add('hidden'); $('sheetBack').classList.add('hidden'); }
  $('shClose').onclick = closeSheet; $('sheetBack').onclick = closeSheet;
  function menuGrid(onPick) {
    var html = '';
    [['drink', '🍺 飲み物'], ['food', '🍢 料理']].forEach(function (g) {
      html += '<div class="sh-sec">' + g[1] + '</div><div class="menu-grid">';
      SHOP.MENU.filter(function (m) { return m.kind === g[0]; }).forEach(function (m) {
        html += '<button data-id="' + esc(m.id) + '"><span>' + m.emoji + '</span>' + esc(m.name) + '</button>';
      });
      html += '</div>';
    });
    return html;
  }
  function refreshSheet(force) {
    var body = $('shBody'), html = '', title = '';
    if (sheetKind === 'menu') {
      if (!force) return;
      title = 'お品書き';
      html = menuGrid() + '<p class="small-note">' + (ownerPresent() ? '大将に注文が届きます。' : 'いまは大将がおまかせ中なので、すぐに出てきます。') + '</p>';
      body.innerHTML = html; $('shTitle').textContent = title;
      body.querySelectorAll('.menu-grid button').forEach(function (b) { b.onclick = function () { order(b.getAttribute('data-id')); }; });
      return;
    }
    if (sheetKind === 'music') {
      title = '曲';
      var st = tree.state || {}, m = st.music, q = tree.queue || {}, qk = Object.keys(q).sort();
      html += '<div class="sh-sec">いま流れている曲</div><div class="li now"><div class="t">🎵 ' + (m ? esc(m.title) + (m.byName ? '<small>' + esc(m.byName) + 'さんのリクエスト</small>' : '') : '—') + '</div>' + (OWNER_MODE ? '<button id="skipBtn" class="gray">次へ</button>' : '') + '</div>';
      html += '<div class="vol" style="margin-top:10px">🔈<input id="volIn" type="range" min="0" max="1" step="0.05" value="' + vol + '">🔊</div>';
      html += '<p class="small-note">音の大きさは自分のスマホだけ。曲はお店にいる全員で同じものを聞きます。</p>';
      html += '<div class="sh-sec">リクエストの順番待ち(' + qk.length + ')</div><div class="list">';
      if (!qk.length) html += '<div class="li"><div class="t"><small>まだありません。下の一覧からリクエストできます。</small></div></div>';
      qk.forEach(function (k, i) { var it = q[k]; html += '<div class="li"><div class="t">' + (i + 1) + '. ' + esc(it.title) + '<small>' + esc(it.byName || '') + 'さん</small></div>' + ((it.by === ME.uid || OWNER_MODE) ? '<button class="gray" data-del="' + k + '">取り消し</button>' : '') + '</div>'; });
      html += '</div>';
      if (SHOP.ALLOW_YOUTUBE) html += '<div class="sh-sec">YouTube のリンクを貼ってリクエスト</div><div class="yt-row"><input id="ytIn" placeholder="https://youtu.be/…" inputmode="url"><button id="ytAdd">追加</button></div><p class="small-note">YouTube の公式の埋めこみで流します。広告が入ることがあります。</p>';
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
    } else if (sheetKind === 'seat') {
      var uid = seatUid(sheetArg), mm = uid && members()[uid];
      if (!mm) { closeSheet(); return; }
      if (!force) return;
      title = (sheetArg + 1) + '番 ' + mm.name + 'さん';
      html = '<div class="sh-sec">この人に出す</div>' + menuGrid() + '<div class="sh-sec">そのほか</div><div class="btn-row"><button id="kickBtn" class="red">帰ってもらう</button></div>';
    } else if (sheetKind === 'owner') {
      if (!force) return;
      title = '店主の操作';
      var s = status(now());
      html = '<div class="sh-sec">お店</div><div class="btn-row">' +
        '<button id="openBtn">🏮 臨時で開ける(1時間)</button><button id="closeBtn" class="red">🌙 閉店する</button></div>' +
        '<p class="small-note">いま: ' + (LOCAL ? 'おためしモード' : s.phase === 'open' ? '営業中(' + fmtTime(s.end) + 'まで)' : s.phase === 'doors' ? 'まもなく開店' : '準備中') + '</p>' +
        '<div class="sh-sec">片づけ</div><div class="btn-row"><button id="clearChat">💬 会話を全部消す</button><button id="clearTables">🍽️ 料理を下げる</button></div>' +
        '<div class="sh-sec">大将の見た目</div><div class="btn-row"><button id="ownerLook">🎨 アバターを作りなおす</button></div>';
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
      var sk = q('#skipBtn'); if (sk) sk.onclick = function () { advance(curKey); };
      body.querySelectorAll('[data-req]').forEach(function (b) { b.onclick = function () { requestSong(b.getAttribute('data-req')); }; });
      body.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { net.remove('queue/' + b.getAttribute('data-del')); }; });
      var ya = q('#ytAdd'); if (ya) ya.onclick = function () {
        var id = ytId(q('#ytIn').value.trim());
        if (!id) { toast('YouTube のリンクが読めませんでした'); return; }
        pushQueue({ kind: 'yt', id: 'yt-' + id, src: 'https://youtu.be/' + id, title: 'YouTube の動画' });
        q('#ytIn').value = '';
      };
    } else if (sheetKind === 'orders') {
      body.querySelectorAll('[data-serve]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-serve'), o = (tree.orders || {})[k]; if (o) serve(o.seat, o.item, k); }; });
    } else if (sheetKind === 'seat') {
      var seat = sheetArg;
      body.querySelectorAll('.menu-grid button').forEach(function (b) { b.onclick = function () { serve(seat, b.getAttribute('data-id')); closeSheet(); }; });
      q('#kickBtn').onclick = function () {
        var uid = seatUid(seat), m = uid && members()[uid];
        if (!m || !confirm(m.name + 'さんに帰ってもらいますか?')) return;
        net.remove('seats/' + seat); net.remove('tables/' + seat); net.remove('members/' + uid);
        sys(m.name + 'さんがお店を出ました'); closeSheet();
      };
    } else if (sheetKind === 'owner') {
      q('#openBtn').onclick = function () { net.update('state', { forceFrom: now(), forceUntil: now() + 60 * MIN, closedAt: null, closedFor: null }); sys('🏮 臨時で開店しました(1時間)'); closeSheet(); };
      q('#closeBtn').onclick = function () { if (confirm('閉店しますか?(会話と料理は片づけられます)')) { closeSheet(); closeShop(); } };
      q('#clearChat').onclick = function () { if (confirm('会話を全部消しますか?')) { net.remove('chat'); closeSheet(); } };
      q('#clearTables').onclick = function () { net.remove('tables'); closeSheet(); };
      q('#ownerLook').onclick = function () { closeSheet(); openMaker(); };
    } else if (sheetKind === 'bot') {
      q('#botAdd').onclick = function () { addBot(); };
      q('#botAll').onclick = function () { for (var i = 0; i < N; i++) addBot(); };
      q('#botOut').onclick = function () { botsLeave(); closeSheet(); };
    }
  }
  function pushQueue(item) {
    var q = tree.queue || {}, keys = Object.keys(q);
    if (keys.length >= SHOP.MAX_QUEUE) { toast('順番待ちがいっぱいです'); return; }
    if (!OWNER_MODE && keys.filter(function (k) { return q[k].by === ME.uid; }).length >= 3) { toast('リクエストは1人3曲までです'); return; }
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
  $('bOrders').onclick = function () { openSheet('orders'); };
  $('bOwner').onclick = function () { openSheet('owner'); };
  $('bBot').onclick = function () { openSheet('bot'); };

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
      else if (r < 0.82) { var it = SHOP.MENU[Math.floor(Math.random() * SHOP.MENU.length)]; net.push('orders', { uid: uid, name: b.name, seat: b.seat, item: it.id, at: TS }); net.push('events', { type: 'order', seat: b.seat, item: it.id, at: TS, by: uid }); }
      else net.push('events', { type: 'phrase', id: Math.random() < 0.6 ? 'kanpai' : 'umai', seat: b.seat, at: TS, by: uid, voice: 2 });
    });
  }, 1000);
  function botsLeave() {
    Object.keys(bots).forEach(function (uid) { var b = bots[uid]; net.remove('seats/' + b.seat); net.remove('tables/' + b.seat); net.remove('members/' + uid); });
    bots = {};
  }

  /* ---------------- 予約 ---------------- */
  $('reserveBtn').onclick = function () {
    var name = $('nameInput').value.trim().slice(0, 12);
    if (!name) { msg('先にお名前を入れてください'); return; }
    ME.name = name; saveMe();
    var go = function () { $('entrance').classList.add('hidden'); $('reserve').classList.remove('hidden'); renderReserve(); };
    if (SHOP.PASSCODE_HASH) roomFor($('passInput').value.trim()).then(function (r) { lsSet('iz-pass', $('passInput').value.trim()); connect(r); setTimeout(go, 400); }).catch(function () { msg('合言葉がちがいます'); });
    else go();
  };
  $('rsBack').onclick = function () { $('reserve').classList.add('hidden'); $('entrance').classList.remove('hidden'); };
  function renderReserve() {
    var list = upcoming(now(), SHOP.RESERVE_WEEKS * 7).filter(function (s) { return s.start > now() - 30 * MIN; });
    var rv = tree.reservations || {}, html = '';
    if (!list.length) html = '<p class="rs-help">予約できる日がありません。</p>';
    list.forEach(function (s) {
      var r = rv[s.key] || {};
      html += '<div class="rs-day"><div class="rs-date">' + fmtDay(s.start) + ' ' + fmtTime(s.start) + '〜' + fmtTime(s.end) + '</div><div class="rs-seats">';
      for (var i = 0; i < N; i++) {
        var x = r[i];
        var cls = x ? (x.uid === ME.uid ? 'mine' : 'taken') : '';
        html += '<button class="' + cls + '" data-k="' + s.key + '" data-i="' + i + '">' + (i + 1) + '番<br>' + (x ? (x.uid === ME.uid ? 'あなた' : esc(x.name) + 'さま') : '空き') + '</button>';
      }
      html += '</div></div>';
    });
    $('rsList').innerHTML = html;
    $('rsList').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-k'), i = +b.getAttribute('data-i');
        var cur = ((tree.reservations || {})[k] || {})[i];
        if (cur && cur.uid !== ME.uid) { toast('その席は予約ずみです'); return; }
        if (cur) { net.remove('reservations/' + k + '/' + i).then(renderReserve); toast('予約を取り消しました'); return; }
        var mine = (tree.reservations || {})[k] || {};
        for (var j = 0; j < N; j++) if (mine[j] && mine[j].uid === ME.uid) { toast('1回に予約できるのは1席です'); return; }
        net.set('reservations/' + k + '/' + i, { uid: ME.uid, name: ME.name, at: TS }).then(renderReserve);
        toast(fmtDay(upcoming(now(), 60).filter(function (s) { return s.key === k; })[0].start) + ' ' + (i + 1) + '番の席を予約しました');
      };
    });
  }

  /* ---------------- アバターを作る ---------------- */
  var preview = null, draft = null, mkTab = 0;
  var TABS = [
    { name: 'おまかせ', build: function () {
      var h = '<div class="mk-sec">はじめから用意してあるアバター</div><div class="presets">';
      AVATAR.PRESETS.forEach(function (p, i) { h += '<button data-preset="' + i + '">' + esc(p.name) + '</button>'; });
      return h + '</div><div class="mk-sec">ほかのタブで、顔・髪・服を細かく直せます</div>';
    } },
    { name: '顔', build: function () { return opts('顔の形', 'face') + opts('目', 'eyes') + swatch('目の色', 'eyeColor', AVATAR.EYE_COLOR) + opts('まゆ', 'brows') + opts('鼻', 'nose') + opts('口', 'mouth') + opts('ひげ', 'beard') + swatch('はだの色', 'skin', AVATAR.SKIN); } },
    { name: '髪', build: function () { return opts('髪型', 'hair') + swatch('髪の色', 'hairColor', AVATAR.HAIR_COLOR); } },
    { name: '服', build: function () { return opts('服', 'top') + swatch('服の色', 'topColor', AVATAR.CLOTH_COLOR); } },
    { name: '小物', build: function () { return opts('小物', 'acc'); } },
    { name: '体と声', build: function () {
      var h = '<div class="mk-sec">体の大きさ</div><input type="range" id="mkSize" min="' + AVATAR.SIZE_MIN + '" max="' + AVATAR.SIZE_MAX + '" step="0.01" value="' + draft.size + '">';
      h += '<div class="mk-sec">「乾杯」などの声</div><div class="opts">';
      AVATAR.VOICES.forEach(function (v, i) { h += '<button data-k="voice" data-v="' + i + '" class="' + (draft.voice === i ? 'on' : '') + '">' + esc(v.name) + '</button>'; });
      h += '</div><div class="mk-sec">いまは仮の読み上げの声です。あとで本物の声に差しかえられます。</div>';
      return h;
    } }
  ];
  function opts(label, key) {
    var h = '<div class="mk-sec">' + label + '</div><div class="opts">';
    AVATAR.PARTS[key].forEach(function (n, i) { h += '<button data-k="' + key + '" data-v="' + i + '" class="' + (draft[key] === i ? 'on' : '') + '">' + esc(n) + '</button>'; });
    return h + '</div>';
  }
  function swatch(label, key, colors) {
    var h = '<div class="mk-sec">' + label + '</div><div class="swatches">';
    colors.forEach(function (c, i) { h += '<button data-k="' + key + '" data-v="' + i + '" class="' + (draft[key] === i ? 'on' : '') + '" style="background:' + c + '"></button>'; });
    var cur = AVATAR.color(colors, draft[key]);
    h += '<label class="free-color' + (typeof draft[key] === 'string' ? ' on' : '') + '">🎨 自由な色<input type="color" data-free="' + key + '" value="' + cur + '"></label>';
    return h + '</div>';
  }
  function openMaker() {
    draft = AVATAR.fix(JSON.parse(JSON.stringify(myAvatar())));
    var back = inside ? 'shop' : 'entrance';
    $('maker').dataset.back = back;
    $('entrance').classList.add('hidden');
    $('maker').classList.remove('hidden');
    var tabs = $('mkTabs'); tabs.innerHTML = '';
    TABS.forEach(function (t, i) {
      var b = document.createElement('button'); b.textContent = t.name;
      b.onclick = function () { mkTab = i; renderMaker(); };
      tabs.appendChild(b);
    });
    var startPreview = function () {
      if (!window.IZ3D) return;
      if (!preview) preview = window.IZ3D.createPreview($('preview'));
      preview.setAvatar(draft);
    };
    if (window.IZ3D) startPreview(); else window.addEventListener('iz3d-ready', startPreview, { once: true });
    renderMaker();
  }
  function renderMaker() {
    Array.prototype.forEach.call($('mkTabs').children, function (b, i) { b.classList.toggle('on', i === mkTab); });
    var body = $('mkBody');
    body.innerHTML = TABS[mkTab].build();
    body.querySelectorAll('[data-k]').forEach(function (b) {
      b.onclick = function () {
        draft[b.getAttribute('data-k')] = +b.getAttribute('data-v');
        if (b.getAttribute('data-k') === 'voice') speak('かんぱーい！', draft.voice);
        updateDraft(); renderMaker();
      };
    });
    body.querySelectorAll('[data-preset]').forEach(function (b) {
      b.onclick = function () { var p = AVATAR.PRESETS[+b.getAttribute('data-preset')]; var v = draft.voice; draft = AVATAR.fix(p); draft.voice = v; updateDraft(); renderMaker(); };
    });
    body.querySelectorAll('[data-free]').forEach(function (inp) {
      inp.oninput = function () { draft[inp.getAttribute('data-free')] = inp.value; updateDraft(); };
      inp.onchange = function () { renderMaker(); };
    });
    var sz = $('mkSize'); if (sz) sz.oninput = function () { draft.size = +sz.value; updateDraft(); };
  }
  function updateDraft() { if (preview) preview.setAvatar(draft); }
  $('makerBtn').onclick = function () { unlockAudio(); openMaker(); };
  $('mkRandom').onclick = function () { var v = draft.voice; draft = AVATAR.fix(AVATAR.random()); draft.voice = v; updateDraft(); renderMaker(); };
  $('mkZoom').onclick = function () { var z = this.classList.toggle('on'); if (preview) preview.setZoom(z); this.textContent = z ? '🔍 全身' : '🔍 顔を大きく'; };
  $('mkCheer').onclick = function () { if (preview) preview.cheer(); };
  function closeMaker() {
    $('maker').classList.add('hidden');
    if ($('maker').dataset.back !== 'shop') $('entrance').classList.remove('hidden');
  }
  $('mkBack').onclick = closeMaker;
  $('mkSave').onclick = function () {
    if (OWNER_MODE) { ownerAvatar = AVATAR.fix(draft); lsSet('iz-owner-avatar', ownerAvatar); if (inside) net.update('state', { ownerAvatar: ownerAvatar }); }
    else { ME.avatar = AVATAR.fix(draft); saveMe(); }
    if (inside) net.update('members/' + ME.uid, { avatar: myAvatar(), voice: myAvatar().voice });
    drawFace2D($('meFace'), myAvatar());
    toast('アバターを決めました', 1400);
    closeMaker();
  };

  /* 入口に出す 小さな顔(2D) */
  function drawFace2D(cv, a) {
    var g = cv.getContext('2d'), w = cv.width;
    g.clearRect(0, 0, w, w);
    g.fillStyle = AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor); g.beginPath(); g.ellipse(w / 2, w * 1.02, w * 0.42, w * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = AVATAR.color(AVATAR.SKIN, a.skin); g.beginPath(); g.arc(w / 2, w * 0.5, w * 0.3, 0, Math.PI * 2); g.fill();
    if (a.hair !== 9) { g.fillStyle = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor); g.beginPath(); g.arc(w / 2, w * 0.46, w * 0.32, Math.PI * 1.05, Math.PI * 1.95); g.fill(); }
    g.fillStyle = '#241712';
    [0.4, 0.6].forEach(function (x) { g.beginPath(); g.arc(w * x, w * 0.52, w * 0.035, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#5a2a20'; g.lineWidth = w * 0.03; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, w * 0.6, w * 0.07, 0.2, Math.PI - 0.2); g.stroke();
  }

  /* ---------------- お知らせ ---------------- */
  var toastT = 0;
  function toast(t, ms) {
    var el = $('toast'); el.textContent = t; el.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.add('hidden'); }, ms || 2600);
  }

  initEntrance();
  // 確認用(画面の自動テストから使う)
  window.IZ = { get tree() { return tree; }, get inside() { return inside; }, get seat() { return mySeat; }, net: function () { return net; }, addBot: addBot, status: status, upcoming: upcoming };
})();
