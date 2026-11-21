'use strict';
/* =====================================================================
   居酒屋の進行係 —— 入口・アバター作り・予約・お店の中(会話・注文・曲・決まり文句の声)・閉店。
   お店の中身(席の数・メニュー・曲・営業日)は js/config.js、アバターの部品は js/avatar-data.js。
   ===================================================================== */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var OWNER_MODE = !!window.IZ_OWNER || /[#&]owner\b/.test(location.hash);
  /* 見本(ホームページの「覗いてみる」): アドレスの最後に #demo。このスマホの中だけで、作りもののお客さん4人と大将が動く。音は出さない */
  var DEMO = !OWNER_MODE && /[#&]demo\b/.test(location.hash);
  var LOCAL = DEMO || !(SHOP.FIREBASE && SHOP.FIREBASE.databaseURL) || /[#&]local\b/.test(location.hash);   // 大将用のページ(owner.html)か、アドレスの最後に #owner
  /* 席の数: 回ごとに変えられる(上限 SHOP.MAX_SEATS)。3Dのカウンターは読みこんだときの数で作るので、
     次の回の席の数がちがうときは、店に入る前に ページを読みなおして合わせる(checkSeats) */
  /* バトンタッチ(大将の交代)で 開きなおしたとき: 大将用は #take=<合図>&nm=<名前>、お客さん用は #sit=<席>&nm=<名前> */
  var TAKE = OWNER_MODE ? ((/[#&]take=([\w-]+)/.exec(location.hash) || [])[1] || '') : '', TAKE_OK = false;
  var SIT = !OWNER_MODE && !DEMO ? +((/[#&]sit=(\d+)/.exec(location.hash) || [])[1] || -1) : -1;
  var HASH_NM = (function () { try { return decodeURIComponent((/[#&]nm=([^&]*)/.exec(location.hash) || [])[1] || '').slice(0, 12); } catch (e) { return ''; } })();
  var MAXS = Math.max(1, Math.min(20, SHOP.MAX_SEATS || 12));
  function clampSeats(v) { return Math.max(1, Math.min(MAXS, (v | 0) || (SHOP.SEATS | 0) || 7)); }
  var N = clampSeats((function () { try { return +sessionStorage.getItem('iz-seats') || +localStorage.getItem('iz-seats') || SHOP.SEATS; } catch (e) { return SHOP.SEATS; } })());
  var JST = 9 * 3600e3, MIN = 60e3, DAY = 86400e3;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------------- 自分(この端末)の情報 ---------------- */
  /* 名前に「さん」をつける。名前の最後が さん・くん・ちゃん・様 などなら つけない(「たけしくんさん」にならないように) */
  var HONOR_RE = /(さん|くん|君|ちゃん|チャン|様|さま|サマ|氏|先生|せんせい|センセイ|殿|どの|たん|ちゃま|サン|クン|san|kun|chan|sama)$/i;
  function honor(n) { n = String(n || ''); return HONOR_RE.test(n) ? n : n + 'さん'; }
  function sama(n) { n = String(n || ''); return HONOR_RE.test(n) ? n : n + 'さま'; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  /* 自分の記録。大将用とお客さん用は分ける(Android だと 2つのアプリが同じ記録を見てしまい、同じ人あつかいになるため) */
  var ME_KEY = OWNER_MODE ? 'iz-me-owner' : 'iz-me';
  var ME = lsGet(ME_KEY, null);
  if (!ME && OWNER_MODE) { var g0 = lsGet('iz-me', null); if (g0) ME = { uid: '', name: g0.name || '', avatar: null }; }   // 名前だけ引きつぐ
  if (!ME || !ME.uid) {
    ME = { uid: (OWNER_MODE ? 'o' : 'u') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: (ME && ME.name) || '', avatar: null };
    lsSet(ME_KEY, ME);
  }
  ME.avatar = AVATAR.fix(ME.avatar);   // 古い形(1代目)なら null → 女性/男性 から作りなおしてもらう
  var ownerAvatar = AVATAR.fix(lsGet('iz-owner-avatar', null)) || AVATAR.fix(AVATAR.OWNER);
  function myAvatar() { return OWNER_MODE ? ownerAvatar : ME.avatar; }
  function saveMe() { lsSet(ME_KEY, ME); }

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
  function shopName() {
    var lv = tree && tree.state && tree.state.live;   // バトンタッチで その回だけ変えた名前(閉店まで。次の回には持ちこさない)
    if (lv && lv.name && lv.for && lv.for === liveKey()) return lv.name;
    var c = curSession(); return (c && c.plan && c.plan.title) || SHOP.NAME;
  }
  function liveKey() { return status(now()).key || ('d' + dayOf(now())); }   // 「その回」の目印(準備中・おためしのときは その日)
  function planName() { var c = curSession(); return (c && c.plan && c.plan.title) || SHOP.NAME; }   // 予定で決めた名前(バトンタッチの「もどす」先)
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
    scene.onAvatarTap = function (k) { if (isMe(k)) selfPick(); else if (OWNER_MODE && typeof k === 'number') ownerPick(k); else replyToSeat(k, true); };
    scene.onItemTap = function (seat, key) { if (!inside) return; if (OWNER_MODE) { serveTo(seat); return; } if (seat === mySeat) eat(key); };   // 大将が料理を押す → その席に出す
    scene.onTableTap = function (seat) { if (inside && OWNER_MODE) serveTo(seat); };   // 大将がその人のテーブルを押す → 料理を出す
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
    (function poll() { if (scene) return; if (window.IZ3D_FAIL || waited > 25000) { start3D(); return; } waited += 250; setTimeout(poll, 250); })();
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
    voicePool();
  }
  var actx = null;
  function ding() {
    if (DEMO) return;
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
  /* 決まり文句の声。voice/<声のid>/<言葉のid>.m4a を鳴らす。ない言葉はスマホの読み上げで代わりに読む。
     音を鳴らす入れ物は、入店のときに(指でさわったときに)音を出せる状態にしておく(iPhone は そうしないと鳴らない) */
  var voiceMissing = {}, vpool = [], vpoolI = 0;
  function voicePool() {
    if (vpool.length) return;
    for (var i = 0; i < 6; i++) {   // 6人まで 同時に話せる(ちがう人どうしは 重なってよい)
      var a = new Audio(); a.preload = 'auto'; vpool.push(a);
      try { a.muted = true; a.src = 'data:audio/mp4;base64,'; var p = a.play(); if (p && p.catch) p.catch(function () {}); a.pause(); a.muted = false; } catch (e) {}
    }
  }
  function speak(text, voiceId, owner, done) {   // done: 読み終わったら(同じ人の次の言葉へ)
    if (!window.speechSynthesis) { if (done) setTimeout(done, 1500); return; }
    try {
      var v = AVATAR.voiceOf(voiceId, owner);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; u.pitch = v.pitch; u.rate = v.rate; u.volume = Math.min(1, vol + 0.3);
      var jv = speechSynthesis.getVoices().filter(function (x) { return /ja/i.test(x.lang); })[0];
      if (jv) u.voice = jv;
      if (done) { u.onend = done; u.onerror = done; }
      speechSynthesis.speak(u);
    } catch (e) { if (done) done(); }
  }
  /* 大将の声: 大将の画面なら自分の、お客さんなら店にいる大将(またはマスター)の選んだ声 */
  function ownerVoiceId() {
    if (OWNER_MODE) return ownerAvatar.voice;
    var oa = (tree.state || {}).ownerAvatar; if (oa && oa.voice) return oa.voice;
    return AVATAR.fix(AVATAR.OWNER).voice;
  }
  /* 大将のスマホでは、録音ページ(owner/rec.html)で録ったノブさんの声を、取りこむ前からすぐ鳴らせる。
     ほかの人のスマホに届くのは、Claude が voice/nobu/ に取りこんでから */
  var localNobu = {};
  function loadLocalNobu() {
    if (!OWNER_MODE || !window.indexedDB) return;
    try {
      var r = indexedDB.open('izakaya-nobu-voice', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('rec'); };
      r.onsuccess = function () {
        try {
          var c = r.result.transaction('rec', 'readonly').objectStore('rec').openCursor();
          c.onsuccess = function () { var x = c.result; if (!x) return; if (x.value && x.value.blob) localNobu[x.key] = URL.createObjectURL(x.value.blob); x.continue(); };
        } catch (e) {}
      };
    } catch (e) {}
  }
  loadLocalNobu();
  function voiceFiles(ph, voiceId) {   // 鳴らす順の候補
    var owner = ph.who === 'owner', v = AVATAR.voiceOf(voiceId, owner), L = [];
    if (v.rec) { if (localNobu[ph.id]) L.push(localNobu[ph.id]); if ((SHOP.NOBU_VOICE || []).indexOf(ph.id) >= 0) L.push('voice/' + v.id + '/' + ph.id + '.m4a'); v = AVATAR.voiceOf(v.fallback, owner); }
    if (v.tts) L.push('voice/' + v.id + '/' + ph.id + '.m4a');
    return { files: L, v: v };
  }
  /* 声は 話す人ごとに 順番待ち(ノブさん 2026-11-21「自分1人の言葉は重ならないように。みんなの話は重なってもいい」)。
     key: 'owner'(大将)/ 's<席>'(お客さん・アイちゃん)。同じ人の前の声が終わってから 次を鳴らす */
  var spQ = {};
  function speakerQueue(key, job) {
    var q = spQ[key] || (spQ[key] = { busy: false, list: [] });
    if (q.list.length >= 3) q.list.shift();   // 押しすぎたときは 古いものから捨てる(ずっと しゃべり続けないように)
    q.list.push(job); if (!q.busy) runSpeaker(q);
  }
  function runSpeaker(q) {
    var job = q.list.shift(); if (!job) { q.busy = false; return; }
    q.busy = true;
    var d = false, fin = function () { if (d) return; d = true; setTimeout(function () { runSpeaker(q); }, 300); };
    setTimeout(fin, 7000);   // 鳴らなかったときも 止まらないように
    try { job(fin); } catch (e) { fin(); }
  }
  function freeAudio() { voicePool(); for (var i = 0; i < vpool.length; i++) { var a = vpool[(vpoolI + i) % vpool.length]; if (a.paused || a.ended) { vpoolI = (vpoolI + i + 1) % vpool.length; return a; } } return vpool[vpoolI++ % vpool.length]; }
  function playFiles(files, fallback, done) {   // files を順に試して 1つ鳴らす。全部だめなら fallback(読み上げ)
    files = files.filter(function (f) { return !voiceMissing[f]; });
    duck = 0.35; setVol(); setTimeout(function () { duck = 1; setVol(); }, 2400);
    (function next(i) {
      if (i >= files.length) { fallback(done); return; }
      var a = freeAudio();
      a.onended = function () { a.onended = null; done(); };
      a.onerror = function () { a.onerror = null; a.onended = null; voiceMissing[files[i]] = 1; next(i + 1); };
      a.src = files[i]; a.volume = Math.min(1, vol + 0.3);
      var p = a.play(); if (p && p.catch) p.catch(function () { done(); });
    })(0);
  }
  function playPhrase(ph, voiceId, key) {
    if (DEMO || !inside) return;
    var owner = ph.who === 'owner';
    if (owner) voiceId = ownerVoiceId();
    var c = voiceFiles(ph, voiceId);
    speakerQueue(owner ? 'owner' : (key || 'x'), function (done) { playFiles(c.files, function (d) { speak(ph.say, c.v.id, owner, d); }, done); });
  }
  function playAi(id, seat) {   // 常連のアイちゃんの言葉の声(voice/ai/)。アイちゃんの席の順番待ちに入れる
    if (DEMO || !inside) return;
    var L = ''; var T = (SHOP.REGULAR || {}).TALK || {}; Object.keys(T).forEach(function (k) { T[k].forEach(function (x) { if (x[0] === id) L = x[1]; }); });
    speakerQueue('s' + seat, function (done) { playFiles(['voice/ai/' + id + '.m4a'], function (d) { if (L) speak(L, (SHOP.REGULAR || {}).VOICE || 'g_zephyr', false, d); else d(); }, done); });
  }
  function previewVoice(voiceId, owner, phId) {   // アバター作りで 声を選んだとき・試し聞き
    var ph = SHOP.PHRASES.filter(function (p) { return p.id === (phId || (owner ? 'irasshai' : 'kanpai')); })[0] || SHOP.GUEST_PHRASES[0];
    unlockAudio();
    var c = voiceFiles(ph, voiceId), f = c.files.filter(function (x) { return !voiceMissing[x]; })[0];
    if (!f) { speak(ph.say, c.v.id, owner); return; }
    voicePool(); var a = vpool[vpoolI++ % vpool.length];
    a.onerror = function () { a.onerror = null; voiceMissing[f] = 1; speak(ph.say, c.v.id, owner); };
    a.src = f; a.volume = Math.min(1, vol + 0.3); var p = a.play(); if (p && p.catch) p.catch(function () {});
  }

  /* ---------------- 曲を みんなで そろえる ---------------- */
  var curKey = '', ytOn = false, ytState = -1, ytLoadedAt = 0;
  function musicKey(m) { return m ? m.id + '@' + m.start : ''; }
  function mDur(m) { return m && m.dur > 0 && m.durK === musicKey(m) ? m.dur : 0; }   // その曲の長さ(ほかの曲の長さが まじらないように)
  function elapsed(m) { return Math.max(0, (now() - m.start) / 1000); }
  function syncMusic() {
    var m = tree.state && tree.state.music;
    var k = musicKey(m);
    if (!inside) { if (curKey) { audio.pause(); hideYT(); curKey = ''; } return; }
    if (k !== curKey) {
      curKey = k;
      audio.pause(); hideYT();
      if (!m) { $('npTitle').textContent = '—'; tvInfo('', '', false); return; }
      $('npTitle').textContent = m.title + (m.byName ? '(' + honor(m.byName) + 'のリクエスト)' : '');
      tvInfo(m.kind === 'file' || !m.kind ? m.title : '', m.byName ? honor(m.byName) + 'のリクエスト' : '', m.kind === 'yt' || m.kind === 'video');
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
    if (DEMO) { demoVideo(); return; }   // 見本は ハンターカブの PV を くりかえす
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
    if (mDur(m) > 0 && elapsed(m) > mDur(m) - 1) return;   // もう終わっている動画は流さない(次へ進むのを待つ)
    ytOn = true; ytState = -1; ytLoadedAt = Date.now(); ytMuted = false; ytReady = false; ytDur = 0; ytLastCT = 0;
    var f = document.createElement('iframe');
    f.allow = 'autoplay; encrypted-media; fullscreen'; f.allowFullscreen = true;
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1' + (DEMO ? '&mute=1&loop=1&playlist=' + id : '') + '&playsinline=1&enablejsapi=1&controls=1&rel=0&iv_load_policy=3&fs=1&cc_load_policy=0&start=' + Math.floor(elapsed(m)) + '&origin=' + encodeURIComponent(location.origin);
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
    v.addEventListener('loadedmetadata', function () { if (tvVideo === v) { tvShape(v.videoHeight > v.videoWidth); var mm = tree.state && tree.state.music; if (mm && musicKey(mm) === curKey && !(mDur(mm) > 0) && isFinite(v.duration) && v.duration > 1) net.update('state/music', { dur: Math.round(v.duration), durK: musicKey(mm) }); } });
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
        var small = ownerCam() && window.innerWidth > window.innerHeight && window.innerHeight < 520;   // 横向きの大将の画面は 小さめ(下に会話の欄)
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
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    var yf = $('tvHolder').firstChild; if (!yf || yf.tagName !== 'IFRAME' || e.source !== yf.contentWindow) return;   // 自分で入れた動画の窓からの合図だけ
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    if (!d || !d.info) return;
    if (!ytReady) { ytReady = true; ytNoCaptions(); }
    var m = tree.state && tree.state.music, isYT = ytOn && m && m.kind === 'yt' && musicKey(m) === curKey;
    if (typeof d.info.duration === 'number' && d.info.duration > 1) { ytDur = d.info.duration; if (isYT && !(mDur(m) > 0)) net.update('state/music', { dur: Math.round(ytDur), durK: musicKey(m) }); }   // 動画の長さを みんなに知らせる
    if (typeof d.info.playerState === 'number') {
      if (d.info.playerState !== ytState) ytNoCaptions();
      ytState = d.info.playerState;
      if (ytState === 0 && isYT) { if (amLeader()) advance(curKey); else if (m.ended !== musicKey(m)) net.update('state/music', { ended: musicKey(m) }); }   // 終わった → 次へ(まとめ役でなければ「終わった」と知らせる)
    }
    if (typeof d.info.muted === 'boolean' && ytOn) { ytMuted = d.info.muted; tvBadge(); }
    var dur = mDur(m) > 0 ? mDur(m) : ytDur;
    if (isYT && dur > 0 && elapsed(m) > dur + 0.5 && ytState === 1) { ytCmd('pauseVideo'); return; }   // 時間が過ぎたら止めて待つ(最初からくり返さない)
    // 戻った(ショート動画などが勝手に最初からくり返した) → 終わったことにする
    if (isYT && typeof d.info.currentTime === 'number') {
      if (ytLastCT - d.info.currentTime > 5 && Date.now() - ytSeekAt > 3000 && dur > 0 && elapsed(m) > dur - 8) { ytCmd('pauseVideo'); if (amLeader()) advance(curKey); else if (m.ended !== musicKey(m)) net.update('state/music', { ended: musicKey(m) }); }
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
    if (DEMO) return true;   // 見本: 作りものの大将は動かないので、見ている人の画面が お店を回す(料理を出す・下げる)
    var ms = members(), best = null;
    Object.keys(ms).forEach(function (uid) {
      var m = ms[uid]; if (!fresh(m) || m.bot) return;
      var score = (m.owner ? 0 : 1e15) + (m.at || 0);
      if (!best || score < best.s || (score === best.s && uid < best.uid)) best = { uid: uid, s: score };
    });
    return best && best.uid === ME.uid;
  }
  function ownerPresent() { var ms = members(); return Object.keys(ms).some(function (u) { return ms[u].owner && fresh(ms[u]); }); }

  var phFrozen = {};
  function applyTree() {
    renderEntrance();
    if (!scene) return;
    // 回の店の名前が決まったら、ちょうちん・のれんの文字も その名前で作りなおす(店に入る前だけ)
    if (scene.name && scene.name !== shopName()) {
      if (scene.setName) { scene.setName(shopName()); $('tbName').textContent = shopName(); document.title = shopName() + (OWNER_MODE ? ' 大将' : ''); }
      else if (!inside && window.IZ3D) { try { scene.stop(); } catch (e) {} scene = null; start3D(); return; }
    }
    var ms = members();
    var seats = [];
    var st = tree.state || {};
    // 撮影の間は、姿を変えない(着がえ・仮装を撮影中に決めても、写真は 着がえる前の姿。撮影が終わったら 新しい姿に)
    var pst = st.photo, phLive = !!(pst && pst.at && now() - pst.at < ((pst.sec || 0) + 8) * 1000);
    if (!phLive) phFrozen = {};
    var frz = function (key, av) { if (!phLive) return av; if (!phFrozen[key]) phFrozen[key] = av; return phFrozen[key]; };
    for (var i = 0; i < N; i++) {
      var uid = seatUid(i), m = uid && ms[uid];
      seats.push(m && (fresh(m) || away(m)) ? { key: uid, avatar: frz(uid, withCos(m.avatar, cosOf(uid, m))), name: m.name, me: uid === ME.uid } : null);
    }
    scene.setSeats(seats);
    var ou0 = ownerUid();
    scene.setOwner(frz('_owner', withCos((st.ownerAvatar && AVATAR.fix(st.ownerAvatar)) || AVATAR.fix(AVATAR.OWNER), ou0 ? cosOf(ou0, ms[ou0]) : '')));
    applyCeleb();
    batonTick();
    photoTick();
    updateTables();
    if (!inside) return;

    // 自分が店から出された(大将に帰ってもらった・閉店で片づけられた)
    if (ms[ME.uid] && !ms[ME.uid].name) { net.remove('members/' + ME.uid); if (seenMine) { leave(true); toast('お店を出ました'); return; } }   // 消されたあとに「いるよ」だけが書きこまれた 名前のない記録(帰ってもらった・閉店のあと)
    if (ms[ME.uid] && ms[ME.uid].name) seenMine = true;
    else if (seenMine) { leave(true); toast('お店を出ました'); return; }
    // 自分の席
    var s2 = -1; for (var k = 0; k < N; k++) if (seatUid(k) === ME.uid) s2 = k;
    if (s2 !== mySeat) {
      mySeat = s2; if (!OWNER_MODE) setView(mySeat >= 0 ? (view === 'overview' ? 'first' : view) : 'overview');
      if (mySeat >= 0 && !OWNER_MODE && !DEMO && !lsGet('iz-tip-kigae')) { lsSet('iz-tip-kigae', 1); setTimeout(function () { toast('自分の名札を押すと、着がえられます 👕', 3000); }, 2500); }   // 1回だけ教える
    }
    $('pickHint').classList.toggle('hidden', OWNER_MODE || mySeat >= 0);
    document.body.classList.toggle('picking', inside && !OWNER_MODE && !DEMO && mySeat < 0);   // 座る前(横向きは 会話の欄をしまって 席を押せるように)
    var cnt = seats.filter(Boolean).length;
    $('emptyNote').classList.toggle('hidden', !(OWNER_MODE && cnt === 0));   // 大将の画面: だれもいないときの ひとこと
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
    var note = (pl.master ? '今回のマスターは <b>' + esc(honor(pl.master)) + '</b>' : '') + (pl.message ? (pl.master ? '<br>' : '') + esc(pl.message) : '');
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
    if (DEMO) startDemo();
    else if (!SHOP.PASSCODE_HASH) connect('main');
    else if ($('passInput').value) roomFor($('passInput').value).then(connect).catch(function () {});
    setInterval(function () { renderEntrance(); if (inside) tick(); }, 1000);
  }
  function msg(t) { $('entMsg').textContent = t || ''; }

  /* 大将用の入口: ノブさん(SHOP.OWNER_HASH)か、その回のマスター(schedule/<回>/masterHash)か。
     おためし(OWNER_HASH が空)のときは だれでも大将。マスターの合言葉が合えば マスターとして入る */
  var ROLE = OWNER_MODE ? 'nobu' : 'guest', MASTER = null;
  function checkOwner() {
    if (!OWNER_MODE) return Promise.resolve(true);
    if (TAKE) {   // バトンタッチ: 今の大将が「この人に」と決めて、本人が「やる」を押したことが 許可
      var bt = (tree.state || {}).baton;
      if (bt && bt.token === TAKE && bt.ans === 'yes' && now() - (bt.at || 0) < 5 * MIN) { TAKE_OK = true; ROLE = lsGet('iz-nobu-ok', 0) ? 'nobu' : 'baton'; MASTER = null; return Promise.resolve(true); }
      TAKE = '';   // 古いリンク・ちがうリンク → ふつうの入り方
      try { history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[#&]take=[\w-]+/, '').replace(/&nm=[^&]*/, '')); } catch (e) {}
    }
    var pass = $('ownerPass').value.trim();
    var nearby = function () { var n = now(); return upcoming(n - 2 * 60 * MIN, 8).filter(function (x) { return x.start - 60 * MIN <= n && n <= (x.end || x.start + 60 * MIN) + 10 * MIN; }); };   // その回の開店1時間前から閉店まで
    var asNobu = function () { ROLE = 'nobu'; MASTER = null; lsSet('iz-nobu-ok', 1); return true; };   // この端末はノブさん(バトンを返してもらったとき ノブさんとして戻る)
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
  /* 大将ノブ(ノブさん本人)のときだけ、顔と髪型を NOBU_FACE に固定する(服・頭の手ぬぐい等は選んだまま。小物なし)。バトンタッチ・マスターの人には付けない */
  function nobuLook(av) { if (!av || ROLE !== 'nobu' || av.sex !== 'm' || !SHOP.NOBU_FACE) return av; var o = JSON.parse(JSON.stringify(av)); o.special = 'nobu'; o.acc = 'none'; return o; }
  var hbTimer = null;
  function enter(name) {
    inside = true; seenMine = false; mySeat = -1; joinAt = now();
    seenChat = {}; seenEvt = {};
    Object.keys(tree.chat || {}).forEach(function (k) { seenChat[k] = 1; });
    Object.keys(tree.events || {}).forEach(function (k) { seenEvt[k] = 1; });
    net.set('members/' + ME.uid, { name: name, avatar: myAvatar(), owner: OWNER_MODE, at: TS, seen: TS, voice: myAvatar().voice || '' });
    if (OWNER_MODE) {
      net.update('state', { ownerAvatar: nobuLook(ownerAvatar), ownerName: name, ownerRole: ROLE });
      if (TAKE_OK) { net.update('state', { baton: null }); TAKE = ''; try { history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[#&]take=[\w-]+/, '').replace(/&nm=[^&]*/, '')); } catch (e) {} }
      else sys(ROLE === 'master' ? '🏮 今回のマスター ' + honor(name) + 'が店に立ちました' : '🏮 ' + (/^大将/.test(name) ? '' : '大将の') + name + 'が店に立ちました');
    }
    document.body.classList.toggle('is-nobu', OWNER_MODE && ROLE === 'nobu');
    $('entrance').classList.add('hidden');
    $('shop').classList.remove('hidden');
    $('bBot').classList.toggle('hidden', !LOCAL);
    // 大将の画面: 視点は 大将用の「接客」「全体」だけ(お客さんの目線にはならない)。お客さん用の 注文 は出さない
    $('bMenu').classList.toggle('hidden', OWNER_MODE);
    setView(OWNER_MODE ? 'owner' : (mySeat >= 0 ? 'first' : 'overview'));   // もとの席に戻ったときは 目線で
    buildPhrases();
    hbTimer = setInterval(function () { var mm = members()[ME.uid]; if (inside && mm && mm.name) net.update('members/' + ME.uid, { seen: TS }); botTick(); }, 15000);   // 名前のある自分の記録があるときだけ(消されたあとに作らない)
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
    if (window.IZGAME && IZGAME.isOpen()) IZGAME.abort();   // ゲーム中に帰ったら ゲームは終わり
    if (!kicked) {
      if (mySeat >= 0) { event({ type: 'phrase', id: 'mataokoshi', seat: mySeat }); net.remove('seats/' + mySeat); net.remove('tables/' + mySeat); }
      sys(OWNER_MODE ? (/^大将/.test(currentName()) ? '' : '大将の') + currentName() + 'が奥に下がりました' : honor(currentName()) + 'がお帰りになりました');
      net.remove('members/' + ME.uid);
      botsLeave();
    }
    var bL = (tree.state || {}).baton; if (OWNER_MODE && bL && bL.from === ME.uid && !bL.ans) net.update('state', { baton: null });   // 頼んだまま帰った → 取り消す(「やる」のあとは 新しい大将が片づける)
    inside = false; mySeat = -1; clearInterval(hbTimer);
    if (!$('maker').classList.contains('hidden') && $('maker').dataset.back === 'shop') { $('maker').dataset.back = 'entrance'; document.body.classList.remove('kigae-on'); }   // 着がえ中に店を出た: 着がえ画面はそのまま、閉じたら入口へ
    audio.pause(); hideYT(); curKey = '';
    closeSheet();
    $('bubbles').innerHTML = ''; bubbles = {}; $('log').innerHTML = ''; $('log')._h = ''; toggleLog(false);
    $('shop').classList.add('hidden'); $('entrance').classList.remove('hidden'); $('emptyNote').classList.add('hidden'); $('bCos').classList.add('hidden'); $('bGame').classList.add('hidden');
    setView('overview');
  }
  /* 「帰る」を押さずに画面を閉じた: すぐには帰さず「席を外しています」にする(3分は席と料理が残る。戻ればそのまま座れる) */
  var hereNow = function () { var mm = members()[ME.uid]; if (inside && net && document.visibilityState !== 'hidden' && mm && mm.name) net.update('members/' + ME.uid, { seen: TS }); };   // 画面にもどったら すぐ「いるよ」(席を外している扱いから もどす)
  document.addEventListener('visibilitychange', hereNow); window.addEventListener('pageshow', hereNow);
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
    if (!inside || DEMO) return;   // 見本は 座れない(見るだけ)
    var uid = seatUid(i), m = uid && members()[uid];
    if (OWNER_MODE) { if (m && fresh(m)) openSheet('seat', i); return; }
    if (mySeat >= 0) return;
    if (m && (fresh(m) || away(m))) { toast(away(m) ? 'その席の人は、少し席を外しています' : 'その席は ふさがっています'); return; }
    var r = reservationsNow()[i];
    if (r && r.uid !== ME.uid) { toast('その席は ' + sama(r.name) + 'のご予約です'); return; }
    sit(i);
  }
  function sit(i) {
    net.set('seats/' + i, ME.uid).then(function () {
      net.update('members/' + ME.uid, { seat: i });
      event({ type: 'phrase', id: 'irasshai', seat: i });
      sys('🏮 ' + honor(currentName()) + 'が来店しました');
      setTimeout(function () { if (seatUid(i) && seatUid(i) !== ME.uid) toast('ほかの人が先に座りました。別の席をえらんでください'); }, 1500);
    });
  }

  /* ---------------- 視点 ---------------- */
  var VIEW_NAMES = { first: '目線', back: '後ろ', overview: '全体', owner: '接客', ownerAll: '全体' };
  /* 大将の目線か(接客 = 座っている人だけ大きく / 全体 = お店ぜんぶ)。どちらも 会話の欄は大きく、ボタンはたたむ */
  function ownerCam() { return OWNER_MODE && (view === 'owner' || view === 'ownerAll'); }
  function setView(v) { if (OWNER_MODE && inside && v !== 'owner' && v !== 'ownerAll') v = 'owner'; view = v; document.body.classList.toggle('owner-view', ownerCam()); withScene(function (s) { s.setView(v, DEMO ? DEMO_SEAT : mySeat); if (DEMO && s.setZoom) s.setZoom(v === 'overview' ? 0.82 : 1); }); $('bViewLbl').textContent = VIEW_NAMES[v] || '目線'; }
  $('bView').onclick = function () {
    var order = OWNER_MODE ? ['owner', 'ownerAll'] : DEMO ? ['overview', 'first', 'back'] : (mySeat >= 0 ? ['first', 'back', 'overview'] : ['overview']);
    var i = order.indexOf(view); setView(order[(i + 1) % order.length]);
    toast('視点: ' + VIEW_NAMES[view] + (view === 'owner' ? '(座っている人を大きく)' : view === 'ownerAll' ? '(お店ぜんぶ)' : ''), 1500);
  };

  /* ---------------- 会話 ---------------- */
  function sys(text) { net.push('chat', { sys: true, text: text, at: TS }); }
  var lastSent = 0;
  /* 書く欄: 長く書くと下に広がる(5行くらいまで。それ以上は欄の中で動かす) */
  var chatIn = $('chatInput');
  function growInput() { chatIn.style.height = 'auto'; chatIn.style.height = Math.min(chatIn.scrollHeight, 140) + 'px'; toChip(); }
  /* だれかあてに書いているときは 入力欄の上に「〇〇さんへ ✕ 消す」。✕ で あて先を消す(まちがえて押した時にすぐ消せる) */
  var CALL_RE = /^(大将|マスター|[^、\n]{1,24}?(さん|くん|君|ちゃん|様|さま|先生))、/;   // 名前に空白があってもよい(「タロウ ヤマダさん、」)
  function toChip() {
    var m = chatIn.value.match(CALL_RE), c = $('toChip');
    if (!m) { if (!c.classList.contains('hidden')) c.classList.add('hidden'); return; }
    $('toName').textContent = '💬 ' + m[1] + 'へ';
    c.classList.remove('hidden');
  }
  $('toClear').addEventListener('pointerdown', function (e) { e.preventDefault(); });   // 押しても入力欄から外れないように(そのあと自分で閉じる)
  $('toClear').onclick = function () {
    chatIn.value = chatIn.value.replace(CALL_RE, ''); replyPick = null; growInput();
    if (!chatIn.value.trim()) { chatIn.value = ''; growInput(); try { chatIn.blur(); } catch (e) {} }   // 何も書いていなければ キーボードも閉じる
  };
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
      var u = ln.getAttribute('data-uid'), mu = u && members()[u];
      var nm = (mu && mu.name) || (ln.querySelector('b') ? ln.querySelector('b').textContent.replace(/^🏮 /, '') : '');   // 書いた本人の名前(帰っていても、書いたときの名前)
      if (k === 'owner' && OWNER_MODE) return;
      if (big) toggleLog(false);
      replyTo(nm, k === 'owner'); return;
    }
    if (!big) toggleLog(true);
  });
  /* 名札を押しても、その人あてに書ける */
  $('tags').addEventListener('click', function (e) {
    var sv = e.target.closest && e.target.closest('.tag.serve'); if (sv) { serveTo(+sv.getAttribute('data-serve')); return; }   // 大将の「🍶 出す」
    if (!DEMO && e.target.closest && (e.target.closest('.tag.me') || (OWNER_MODE && e.target.closest('.tag.owner')))) { selfPick(); return; }   // 自分の名札 → 着がえ
    var t = e.target.closest && e.target.closest('.tag[data-seat]'); if (!t) return;
    var k = t.getAttribute('data-seat');
    if (OWNER_MODE && k !== 'owner') ownerPick(+k); else replyToSeat(k === 'owner' ? 'owner' : +k, false);
  });
  $('chatForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('chatInput').value.trim().slice(0, 500);
    if (!t) return;
    if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; }
    if (Date.now() - lastSent < 1500) { toast('少し間をあけて送ってください', 1500); return; }
    lastSent = Date.now();
    var msg = { uid: ME.uid, name: currentName(), seat: OWNER_MODE ? 'owner' : mySeat, owner: OWNER_MODE, text: t, at: TS };
    var to = replyPick && t.indexOf(replyPick.call) === 0 && (replyPick.seat === 'owner' || nameOfSeat(replyPick.seat)) ? replyPick.seat : addressee(t);
    replyPick = null;
    if (to !== null && to !== msg.seat) msg.to = to;
    net.push('chat', msg);
    $('chatInput').value = ''; growInput();
  });
  /* その人あてに書く: 入力欄の頭に「〇〇さん、」を入れる(前に別の人あてが入っていれば入れかえる)。みんなにも だれあてか分かる */
  function nameOfSeat(k) {
    if (k === 'owner') return (tree.state || {}).ownerName || SHOP.OWNER_NAME;   // 大将が おまかせ中でも 話しかけられる
    var u = seatUid(+k), m = u && members()[u]; return m && fresh(m) ? m.name : '';
  }
  /* だれあてか(文の頭の「〇〇さん、」「大将、」「マスター、」)。席の番号か 'owner'。だれでもなければ null */
  function addressee(t) {
    if (/^(大将|マスター)[、,]/.test(t)) return 'owner';
    for (var i = 0; i < N; i++) { if (i === mySeat && !OWNER_MODE) continue; var nm = nameOfSeat(i); if (nm && (t.indexOf(honor(nm) + '、') === 0 || t.indexOf(honor(nm) + ',') === 0)) return i; }
    return null;
  }
  function replyTo(name, isOwner) {
    if (!name || !inside || DEMO) return;   // 見本は 見るだけ
    if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; }
    var call = isOwner ? ((tree.state || {}).ownerRole === 'master' ? 'マスター、' : '大将、') : honor(name) + '、';
    var v = chatIn.value.replace(CALL_RE, '');
    chatIn.value = call + v; growInput();
    try { chatIn.focus(); chatIn.setSelectionRange(chatIn.value.length, chatIn.value.length); } catch (e) {}
    chatIn.classList.remove('to-flash'); void chatIn.offsetWidth; chatIn.classList.add('to-flash');
  }
  var replyPick = null;   // 押した人(名前が同じ人がいても、押した席の人あてにする)
  function replyToSeat(k, fromAvatar) {
    if (k === mySeat && !OWNER_MODE) return;
    if (k === 'owner' && OWNER_MODE) return;
    var nm = nameOfSeat(k); if (!nm) return;
    replyTo(nm, k === 'owner');
    replyPick = { seat: k, call: chatIn.value.split('、')[0] + '、' };
  }
  /* 大将が お客さんを押したとき: 「話しかける」か「料理を出す」かを選ぶ(すぐ会話にならないように) */
  var lastTapXY = { x: innerWidth / 2, y: innerHeight / 2 };
  document.addEventListener('pointerdown', function (e) { lastTapXY = { x: e.clientX, y: e.clientY }; }, true);
  function serveTo(k) {
    closeWho();
    var uid = seatUid(k), m = uid && members()[uid];
    if (!m || !fresh(m)) { toast(m && away(m) ? 'その席の人は、少し席を外しています' : 'その席には だれもいません', 1800); return; }
    openSheet('seat', k);
  }
  function closeWho() { $('whoPick').classList.add('hidden'); }
  function isMe(k) { return !DEMO && inside && (OWNER_MODE ? k === 'owner' : (k === mySeat && mySeat >= 0)); }
  /* 自分(自分のアバター・自分の名札)を押したとき: 着がえ(アバターを変える)・仮装。ボタンを増やさないため、ここに置く */
  function popWho(html) {
    var w = $('whoPick'); w.innerHTML = html; w.classList.remove('hidden'); w._at = Date.now();
    var bw = w.offsetWidth, bh = w.offsetHeight, x = Math.max(8, Math.min(innerWidth - bw - 8, lastTapXY.x - bw / 2)), y = lastTapXY.y + 14;
    if (y + bh > innerHeight - 90) y = Math.max(8, lastTapXY.y - bh - 14);
    w.style.left = x + 'px'; w.style.top = y + 'px';
    return w;
  }
  function selfPick() {
    var k = celebKind();
    var w = popWho('<div class="wp-name">' + (OWNER_MODE ? '大将(あなた)' : 'あなた') + '</div><button data-w="look">👕 着がえる(アバターを変える)</button>' + (k ? '<button data-w="cos">🎭 仮装</button>' : ''));
    w.querySelector('[data-w=look]').onclick = function () { closeWho(); openMaker(); };
    var c = w.querySelector('[data-w=cos]'); if (c) c.onclick = function () { closeWho(); openSheet('costume'); };
  }
  function ownerPick(k) {
    var nm = nameOfSeat(k); if (!nm) return;
    var w = $('whoPick');
    var bm = members()[seatUid(k)] || {};
    w.innerHTML = '<div class="wp-name">' + esc(honor(nm)) + '</div><button data-w="talk">💬 話しかける</button><button data-w="serve">🍶 料理を出す</button>' + (!bm.bot && !DEMO ? '<button data-w="baton">🤝 大将を交代する</button>' : '');
    w.classList.remove('hidden'); w._at = Date.now();
    var bw = w.offsetWidth, bh = w.offsetHeight, x = Math.max(8, Math.min(innerWidth - bw - 8, lastTapXY.x - bw / 2)), y = lastTapXY.y + 14;
    if (y + bh > innerHeight - 90) y = Math.max(8, lastTapXY.y - bh - 14);
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.querySelector('[data-w=talk]').onclick = function () { closeWho(); replyToSeat(k, false); };
    w.querySelector('[data-w=serve]').onclick = function () { serveTo(k); };
    var bb = w.querySelector('[data-w=baton]'); if (bb) bb.onclick = function () { closeWho(); openSheet('baton', k); };
  }
  /* ---------------- 🤝 バトンタッチ(大将の交代) ----------------
     1) 大将がお客さんを押す →「🤝 大将を交代する」→ 店の名前を選んで「頼む」(state.baton)
     2) 頼まれた人に「大将を頼まれました。やりますか?」→「やる!」(ans:'yes')
     3) 頼まれた人: 自分の席を空けて 大将用のページへ(#take=合図。合言葉なし・今の名前とアバターに大将の服)
        前の大将: 奥に下がって お客さん用のページへ(#sit=空いた席)
     合図(token)は その1回だけ・5分まで。ことわる・1分返事がない → 取り消し */
  var batonSeen = {}, batonBusy = false;
  function batonHTML(k) {
    var uid = seatUid(k), m = uid && members()[uid];
    if (!m || !fresh(m)) return '<p>その席には だれもいません</p>';
    var cur = shopName(), mine = '居酒屋' + String(m.name || '').replace(/^居酒屋\s*/, '').slice(0, 10), plan = planName();
    var opt = function (v, label, on) { return '<button data-bname="' + esc(v) + '"' + (on ? ' class="on"' : '') + '>' + esc(label) + '</button>'; };
    return '<p class="bt-lead"><b>' + esc(honor(m.name)) + '</b>に 大将を頼みます。</p>' +
      '<div class="sh-sec">店の名前(ちょうちん・のれん・みんなの画面)</div><div class="ph-chips bt-names">' +
      opt('', 'そのまま「' + cur + '」', true) + (mine !== cur && mine !== plan ? opt(mine, '「' + mine + '」にする') : '') + (cur !== plan ? opt('=plan', '「' + plan + '」にもどす') : '') + opt('=free', '自分で決める') + '</div>' +
      '<input id="btFree" class="bt-free hidden" maxlength="16" placeholder="例: 居酒屋えみりん">' +
      '<div class="btn-row" style="margin-top:12px"><button id="btGo" class="red">🤝 頼む</button></div>' +
      '<p class="small-note">' + esc(honor(m.name)) + 'が「やる」を押すと交代します。あなたは ' + esc(honor(m.name)) + 'の席に お客さんとして座ります。<br>そのあと、同じやり方で 返してもらえます。店の名前は 今日の閉店まで(次の回には持ちこしません)。</p>';
  }
  function wireBaton(body, k) {
    var pick = '';
    body.querySelectorAll('[data-bname]').forEach(function (b) { b.onclick = function () {
      body.querySelectorAll('[data-bname]').forEach(function (x) { x.classList.toggle('on', x === b); });
      pick = b.getAttribute('data-bname'); body.querySelector('#btFree').classList.toggle('hidden', pick !== '=free');
      if (pick === '=free') body.querySelector('#btFree').focus();
    }; });
    body.querySelector('#btGo').onclick = function () {
      var uid = seatUid(k), m = uid && members()[uid];
      if (!m || !fresh(m)) { toast('その席には だれもいません'); closeSheet(); return; }
      var b0 = (tree.state || {}).baton; if (b0 && !b0.ans && now() - (b0.at || 0) < 60000) { toast('いま ほかの人の返事を待っています', 1800); return; }
      var title = pick === '=free' ? body.querySelector('#btFree').value.trim().slice(0, 16) : pick === '=plan' ? '=plan' : pick;
      if (pick === '=free' && !title) { toast('店の名前を入れてください'); return; }
      var token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      net.update('state', { baton: { token: token, to: uid, toName: m.name, toSeat: k, from: ME.uid, fromName: currentName(), title: title || '', at: TS } });
      closeSheet(); toast(honor(m.name) + 'に頼みました。返事を待っています', 2600);
    };
  }
  function batonAskHTML(b) {
    return '<p class="bt-lead">🤝 <b>' + esc(b.fromName || '大将') + '</b>から、大将を頼まれました。</p>' +
      (b.title && b.title !== '=plan' ? '<p class="small-note">店の名前が「' + esc(b.title) + '」になります。</p>' : '') +
      '<div class="btn-row"><button id="btYes" class="red">🍶 やる!</button><button id="btNo">ことわる</button></div>' +
      '<p class="small-note">「やる」を押すと、大将の画面に切りかわります(今の名前とアバターに、大将の服を着せます)。1〜2秒 画面が切りかわります。</p>';
  }
  function hashFlags() { return ['noinstall'].concat(/[#&]local\b/.test(location.hash) ? ['local'] : []).join('&'); }
  function batonTick() {   // applyTree のたびに
    var b = (tree.state || {}).baton;
    if (!b || !inside || DEMO) { if (sheetKind === 'batonAsk' && !(b && b.to === ME.uid && !b.ans)) closeSheet(); return; }
    var age = now() - (b.at || 0);
    // 頼まれた人
    if (b.to === ME.uid && !OWNER_MODE && !b.ans) {
      if (age > 60000 || !ownerPresent()) { if (sheetKind === 'batonAsk') { closeSheet(); toast('大将を頼まれていましたが、取り消されました', 2200); } return; }
      if (!batonSeen[b.token] && sheetKind !== 'batonAsk' && !document.body.classList.contains('kigae-on') && !phOn) { batonSeen[b.token] = 1; openSheet('batonAsk', b.token); }
      return;
    }
    // 頼んだ大将
    if (b.from === ME.uid && OWNER_MODE) {
      if (b.ans === 'no') { if (!batonSeen[b.token + 'n']) { batonSeen[b.token + 'n'] = 1; toast(honor(b.toName) + 'は ことわりました', 2400); net.update('state', { baton: null }); } return; }
      if (b.ans === 'yes' && !batonBusy) { batonBusy = true; batonHandOff(b); return; }
      var tm = members()[b.to];
      if (!b.ans && (!tm || !tm.name) && age > 2500 && !batonSeen[b.token + 'g']) { batonSeen[b.token + 'g'] = 1; toast(honor(b.toName) + 'は お店を出ていたので、取り消しました', 2600); net.update('state', { baton: null }); return; }
      if (!b.ans && age > 60000 && !batonSeen[b.token + 't']) { batonSeen[b.token + 't'] = 1; toast(honor(b.toName) + 'から返事がなかったので、取り消しました', 2600); net.update('state', { baton: null }); }
      return;
    }
    // だれも動かさないまま古くなった頼み(大将が出てしまった等)は、店を回す人が片づける
    if (amLeader() && age > 6 * MIN) net.update('state', { baton: null });
  }
  function batonAnswer(yes) {
    var b = (tree.state || {}).baton;
    closeSheet();
    if (!b || b.to !== ME.uid || b.ans || now() - (b.at || 0) > 60000) { toast('この頼みは もう取り消されています', 2000); return; }
    if (!yes) { net.update('state/baton', { ans: 'no' }); return; }
    if (!ownerPresent()) { toast('大将が いなくなっていました', 2000); net.update('state', { baton: null }); return; }
    batonBusy = true;
    var k = mySeat, myName = currentName();
    // 先に 自分の席を空ける(前の大将が そこに座る)→ そのあと「やる」を書く
    if (k >= 0) { net.remove('seats/' + k); net.remove('tables/' + k); }
    net.remove('members/' + ME.uid);
    var go = function () { location.href = 'owner/#' + hashFlags() + '&take=' + b.token + '&nm=' + encodeURIComponent(myName); };
    Promise.resolve(net.update('state/baton', { ans: 'yes', toSeat: k })).then(function () { leave(true); setTimeout(go, 300); }, function () { leave(true); setTimeout(go, 300); });
  }
  function batonHandOff(b) {   // 前の大将: 店の名前を決めて、奥に下がって、お客さんの席へ
    var key = liveKey();
    if (b.title === '=plan') net.update('state', { live: null });
    else if (b.title) net.update('state', { live: { name: b.title, for: key } });
    net.remove('tables'); net.remove('orders');   // 交代のたびに テーブルの料理・飲み物と 注文を リセット(2026-11-21 ノブさん)
    sys('🤝 大将が ' + honor(b.toName) + 'に交代しました' + (b.title && b.title !== '=plan' ? '(今日は「' + b.title + '」)' : ''));
    var myName = String(currentName() || '').replace(/^大将\s*/, '') || 'ノブ';
    lsSet('iz-owner-avatar', ownerAvatar);   // お客さんの画面で 同じ顔を使えるように(このスマホの中だけ)
    net.remove('members/' + ME.uid);
    net.update('state/baton', { handed: 1 });   // 出終わった合図 → 新しい大将は これを待ってから入る(大将が2人にならない)
    leave(true);
    setTimeout(function () { location.href = '../#' + hashFlags() + '&sit=' + (b.toSeat >= 0 ? b.toSeat : '') + '&nm=' + encodeURIComponent(myName); }, 400);
  }
  /* 交代のあと 開きなおしたページで、自動で店に入る(名前・アバターは 今あるものを使う) */
  function batonAutoEnter() {
    if (!TAKE && SIT < 0) return;
    if (OWNER_MODE) {
      var g = lsGet('iz-me', null) || {}, nobu = !!lsGet('iz-nobu-ok', 0);
      if (!nobu || !lsGet('iz-owner-avatar', null)) {   // 大将のアバターがない人: お客さんのアバターに 大将の服を着せる
        var base = AVATAR.fix(g.avatar) || AVATAR.fix(AVATAR.OWNER), P = base.sex === 'f' ? OWNER_PRESETS_F[0] : OWNER_PRESETS[0], a = JSON.parse(JSON.stringify(base));
        a.owner = true; a.top = P.top; a.topColor = P.topColor; a.head = P.head; a.apron = P.apron; a.voice = base.sex === 'f' ? 'o_leda' : 'o_fenrir';
        if (!nobu || !lsGet('iz-owner-avatar', null)) ownerAvatar = AVATAR.fix(a);
      }
      var nm = nobu ? (ME.ownerName || ('大将' + (HASH_NM || g.name || ''))) : (/^大将/.test(HASH_NM) ? HASH_NM : '大将' + (HASH_NM || g.name || ''));
      $('nameInput').value = nm.slice(0, 12);
    } else {
      if (!ME.avatar) { var oa = lsGet('iz-owner-avatar', null) || JSON.parse(JSON.stringify(AVATAR.OWNER)); oa.owner = false; ME.avatar = AVATAR.fix(oa); saveMe(); }   // お客さんのアバターがない → 大将の顔・髪のまま、お客さんの服に
      if (!ME.name && HASH_NM) { ME.name = HASH_NM; saveMe(); }
      $('nameInput').value = ME.name || HASH_NM;
      if (!ME.avatar) return;   // アバターがなければ ふつうに作ってもらう
    }
    var tries = 0, waitT0 = Date.now();
    (function tryEnter() {   // 入れなかったとき(つながりが切れた・書きこみが重なった)は、もう一度だけ自動で入る
      if (inside || tries >= 3) return;
      if (OWNER_MODE && !tries) {   // 新しい大将: 前の大将が出終わる(handed)のを待つ。8秒たったら 待たずに入る
        var bw = (tree.state || {}).baton;
        if (!(bw && bw.handed) && Date.now() - waitT0 < 8000) { setTimeout(tryEnter, 300); return; }
      }
      if (tries && document.querySelector('#maker:not(.hidden)')) return;
      tries++; $('enterBtn').click(); setTimeout(tryEnter, 4000);
    })();
    if (SIT >= 0) {
      var t0 = Date.now();
      (function trySit() {
        if (!inside) { if (Date.now() - t0 < 20000) setTimeout(trySit, 300); return; }
        var k = SIT; SIT = -1;
        try { history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[#&]sit=\d*/, '').replace(/&nm=[^&]*/, '')); } catch (e) {}
        setTimeout(function () {
          var u = seatUid(k);
          if (k >= 0 && k < N && !u) { net.set('seats/' + k, ME.uid).then(function () { net.update('members/' + ME.uid, { seat: k }); }); toast('お客さんの席に座りました。またバトンタッチで戻れます', 2600); }
          else toast('空いている席を押して座ってください', 2200);
        }, 600);
      })();
    }
  }
  document.addEventListener('pointerdown', function (e) {   // 外を押したら閉じる(その押した手で 開きなおした時は閉じない)
    var w = $('whoPick'), t0 = Date.now(); if (w.classList.contains('hidden') || w.contains(e.target)) return;
    setTimeout(function () { if ((w._at || 0) < t0) closeWho(); }, 350);
  }, true);
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
      return '<div class="ln' + (fresh2 ? ' new' : '') + '" data-uid="' + esc(m.uid || '') + '" data-seat="' + (okSeat(m.seat) ? m.seat : '') + '"' + (m.uid === ME.uid ? ' data-me="1"' : '') + '><b' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(m.name || '') + '</b>' + esc(m.text) + '</div>';
    }).join('');
    if (log._h !== html) { log.innerHTML = html; log._h = html; if (atBottom) log.scrollTop = log.scrollHeight; }
    keys.forEach(function (k) {
      if (seenChat[k]) return; seenChat[k] = 1;
      var m = c[k]; if (m.sys || (m.at || 0) < joinAt - 5000) return;
      if ((m.at || 0) > now() - 15000) regHear(m);
      bubble(m.seat, m.text, false);
      if (m.ai && m.uid === REG_UID && /^[a-z]{1,2}\d{1,2}$/.test(m.ai)) playAi(m.ai, m.seat);   // アイちゃんの声(2026-11-21 録音)
      withScene(function (s) {
        s.talk(m.seat);
        // 話しかけられた人が、話しかけた人のほうを数秒向く(話した人も相手を見る)
        if ((okSeat(m.to) || m.to === 'owner') && (okSeat(m.seat) || m.seat === 'owner') && m.to !== m.seat) { s.lookAt(m.to, m.seat, 4); s.lookAt(m.seat, m.to, 3); }
      });
      if (m.to === 'owner' && okSeat(m.seat)) ownerTo(m.seat, true);   // 大将あて: 大将が その人の前へ来て、向いて笑顔
      else if (!ownerPresent()) ownerTo(m.seat, false);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }

  /* 頭の上の吹き出し */
  var bubbles = {};   // seat → {el, until}
  function okSeat(v) { return typeof v === 'number' && v >= 0 && v < N && Math.floor(v) === v; }   // 席番号として正しいか(おかしな値で画面がこわれないように)
  function bubble(seat, text, phrase) {
    if (seat !== 'owner' && !okSeat(seat)) return;
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
  function kigaeNow(t) { return !!t && now() - t < 3 * MIN; }   // 着がえ中(アプリを閉じて そのままになっても 3分で消える)
  function setKigae(on) {
    if (!inside || DEMO) return;
    if (OWNER_MODE) net.update('state', { ownerKigae: on ? now() : null }); else net.update('members/' + ME.uid, { kigae: on ? now() : null });
  }
  function ownerLabel() {
    var st = tree.state || {};
    if (ownerPresent() && st.ownerName) return st.ownerRole === 'master' ? 'マスター ' + st.ownerName : st.ownerName;
    var c = curSession(); if (c && c.plan && c.plan.master) return 'マスター ' + c.plan.master;
    return SHOP.OWNER_NAME;
  }
  /* 「🍶 出す」ボタン: 見える所に置く(横向きは 左の会話の欄に かからない所だけ)。
     となりと重なるときは 小さい「🍶」だけにし、それでも重なるときは 出さない(人やテーブルを押せば出せる) */
  function placeServe(list, put) {
    if (!list.length) return;
    var L = 6, R = innerWidth - 6, lg = document.querySelector('body.owner-view .bottom');
    if (lg && innerWidth > innerHeight) { var r = lg.getBoundingClientRect(); if (r.width < innerWidth * 0.7) L = Math.max(L, r.right + 4); }
    var ok = function (bw) {
      var xs = list.map(function (it) { return { it: it, x: Math.max(L + bw / 2, Math.min(R - bw / 2, it.p.x)), out: it.p.x < L - bw * 0.2 || it.p.x > R + bw * 0.2 }; }).filter(function (q) { return !q.out; });
      xs.sort(function (p1, p2) { return p1.x - p2.x; });
      for (var k = 1; k < xs.length; k++) if (xs[k].x - xs[k - 1].x < bw + 4 && Math.abs(xs[k].it.p.y - xs[k - 1].it.p.y) < 34) return null;
      return xs;
    };
    // はしから ななめに見ている時(縦向きで人が多い)は、ボタンが ばらばらの高さになり だれのか分からないので 出さない
    var ys = list.map(function (it) { return it.p.y; });
    if (Math.max.apply(null, ys) - Math.min.apply(null, ys) > 40) return;
    var bt = lg ? lg.getBoundingClientRect().top : innerHeight;
    if (innerWidth <= innerHeight && ys[0] > bt - 40) return;   // 下の会話の欄に かかる
    var big = ok(76), xs = big || ok(40);
    if (!xs) return;
    xs.forEach(function (q) { put('v' + q.it.i, 'serve' + (big ? '' : ' mini'), big ? '🍶 出す' : '🍶', { x: q.x, y: Math.min(q.it.p.y, innerHeight - 150) }); var sb = tagEls['v' + q.it.i]; if (sb) sb.setAttribute('data-serve', q.it.i); });
  }
  function placeOverlays() {
    if (!scene) return;
    var a = scene.anchors(), ms = members(), used = {};
    var showTags = inside || true;
    var edgeR = innerWidth - (document.body.classList.contains('owner-view') ? 8 : 78);   // 右のボタンの列に かからないように
    var put = function (key, cls, text, p, click) { if (!p) return; var t = tagEl(key, cls, text, click); t.style.display = '';
      if (t._wt !== text) { t._wt = text; t._w = t.offsetWidth; }   // 名札の はば(文字が変わったときだけ測る)
      var hw = (t._w || 60) / 2, x = Math.max(6 + hw, Math.min(edgeR - hw, p.x));   // 画面のはしで切れないように
      t.style.left = x + 'px'; t.style.top = p.y + 'px'; used[key] = 1; };
    if (showTags) {
      var st = tree.state || {};
      if (!(ownerCam())) { var okg = kigaeNow((tree.state || {}).ownerKigae), ogm = !okg && gameNow((tree.state || {}).ownerGame); put('owner', (OWNER_MODE ? 'owner' : 'owner tap') + (okg ? ' kigae' : ogm ? ' gaming' : ''), okg ? '👚 ' + ownerLabel() + ' 着がえ中…' : ogm ? '🎮 ' + ownerLabel() + ' ゲーム中' : ownerLabel() + (ownerPresent() ? '' : '(おまかせ中)'), a.owner); }   // おまかせ中でも 押すと大将あてに書ける
      if (tagEls.owner) { if (OWNER_MODE) tagEls.owner.removeAttribute('data-seat'); else tagEls.owner.setAttribute('data-seat', 'owner'); }
      var resv = reservationsNow(), serveList = [];
      for (var i = 0; i < N; i++) {
        var uid = seatUid(i), m = uid && ms[uid];
        if (m && away(m)) { put('s' + i, 'away', m.name + '(席を外しています)', a.seats[i]); var tw = tagEls['s' + i]; if (tw) tw.removeAttribute('data-seat'); continue; }
        if (m && fresh(m) && OWNER_MODE && view === 'owner' && a.tables && a.tables[i]) serveList.push({ i: i, p: a.seats[i] ? { x: a.seats[i].x, y: a.tables[i].y } : a.tables[i] });   // 横は その人の頭の真下   // 大将の接客の目線: その人のテーブルの前に「出す」(あとで まとめて置く)
        if (m && fresh(m)) { var kg = kigaeNow(m.kigae), gm = !kg && gameNow(m.game); put('s' + i, (uid === ME.uid ? 'me' : 'tap') + (kg ? ' kigae' : gm ? ' gaming' : ''), kg ? '👚 ' + m.name + ' 着がえ中…' : gm ? '🎮 ' + m.name + ' ゲーム中' : m.name + (uid === ME.uid ? '(あなた)' : ''), a.seats[i]); var tg = tagEls['s' + i]; if (tg) { if (uid === ME.uid) tg.removeAttribute('data-seat'); else tg.setAttribute('data-seat', i); } continue; }
        var r = resv[i];
        if (r) {   // 予約済みの席は、だれにでも名前が見える
          (function (k, rr) { put('e' + k, rr.uid === ME.uid ? 'free mine' : 'reserved', rr.uid === ME.uid ? 'ご予約の席(あなた)' : '予約済み ' + sama(rr.name), a.empty[k], function () { onSeatTap(k); }); })(i, r);
        } else if (inside && !OWNER_MODE && !DEMO && mySeat < 0 && !document.body.classList.contains('no3d')) {
          (function (k) { put('e' + k, 'free', (k + 1) + '番 空席', a.empty[k], function () { onSeatTap(k); }); })(i);
        }
      }
    }
    if (showTags) placeServe(serveList, put);
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
      var b = bubbles[k], p = k === 'owner' ? (ownerCam() ? null : a.owner) : a.seats[+k];
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
      var ov = ownerCam();   // 大将の接客画面: 吹き出しは3行まで(全文は下の会話の欄)
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
  function event(e) { e.at = TS; e.by = ME.uid; e.voice = myAvatar().voice || ''; net.push('events', e); }
  function myPhrases() { return (OWNER_MODE ? SHOP.OWNER_PHRASES : SHOP.GUEST_PHRASES).filter(inMode); }   // お祝いの日だけの言葉は その日だけ   // 大将とお客さんで まったく別
  function sayPhrase(id) {
    if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return false; }
    event({ type: 'phrase', id: id, seat: OWNER_MODE ? 'owner' : mySeat });
    return true;
  }
  function phraseLabel(p) { return (p.emoji ? p.emoji + ' ' : '') + p.say.replace(/[！!]$/, ''); }
  function buildPhrases() {
    var box = $('phrases'); box.innerHTML = '';
    myPhrases().filter(function (p) { return p.main; }).forEach(function (p) {
      var b = document.createElement('button');
      b.textContent = phraseLabel(p);
      b.onclick = function () { sayPhrase(p.id); };
      box.appendChild(b);
    });
    var m = document.createElement('button'); m.className = 'more'; m.textContent = '💬 もっと';
    m.onclick = function () { openSheet('phrases'); };
    box.appendChild(m);
  }
  function phrasesHTML() {
    var h = '', cat = '';
    myPhrases().forEach(function (p) {
      if (p.cat !== cat) { h += (cat ? '</div>' : '') + '<div class="sh-sec">' + esc(p.cat) + '</div><div class="ph-grid">'; cat = p.cat; }
      h += '<button data-ph="' + esc(p.id) + '">' + esc(phraseLabel(p)) + '</button>';
    });
    return h + '</div><p class="small-note">押すと、みんなに声と吹き出しで届きます。' + (OWNER_MODE ? '声は「アバター」の「大きさと声」で選べます。' : '声は「アバター」の「大きさと声」で、男性3つ・女性3つから選べます。') + '</p>';
  }
  function processEvents() {
    var ev = tree.events || {};
    Object.keys(ev).sort().forEach(function (k) {
      if (seenEvt[k]) return; seenEvt[k] = 1;
      var e = ev[k]; if ((e.at || 0) < joinAt - 3000) return;
      if (e.type === 'record') { if (amLeader() && e.by !== REG_UID && regSeat() >= 0) setTimeout(function () { regLine('cheer'); }, rnd(1.5, 3) * 1000); return; }   // 本日の最高得点 → 常連の子が「すごい！」
      if (e.type === 'phrase') {
        var ph = SHOP.PHRASES.filter(function (p) { return p.id === e.id; })[0]; if (!ph) return;
        var who = ph.who === 'owner' ? 'owner' : e.seat;
        bubble(who, (ph.emoji ? ph.emoji + ' ' : '') + ph.say, true);
        var isK = ph.id === 'kanpai' || ph.id === 'o_kanpai';
        withScene(function (s) { if (isK) s.cheer(who); else s.talk(who); });
        if (ph.who === 'owner') ownerTo(e.seat, true);
        if (isK) { floater(who, '🍻'); kpStart(k, e, who); }   // 乾杯の連鎖: 声をかけた人だけ先に。ほかの人は「一緒に乾杯」で続く
        else if (ph.emoji) floater(who, ph.emoji);
        playPhrase(ph, e.voice, who === 'owner' ? 'owner' : 's' + who);
      } else if (e.type === 'kanpaiJoin') {
        kpJoined(e);
      } else if (e.type === 'boom') {   // お祝いの合図: 紙吹雪
        celebBoom();
      } else if (e.type === 'countdown') {
        showCountdown(e.to);
      } else if (e.type === 'photoReq') {
        if (OWNER_MODE && e.by !== ME.uid) toast('📸 ' + (e.name ? honor(e.name) : 'お客さん') + 'から 記念撮影のリクエスト', 9000, '📸 撮影する', startPhoto);
      } else if (e.type === 'clear') {
        ownerTo(e.seat, false);   // 下げに行く
      } else if (e.type === 'order') {
        ownerTo(e.seat, true);
        var it0 = menuItem(e.item), ph3 = SHOP.PHRASES.filter(function (p) { return p.id === 'haiyo'; })[0];
        if (ph3) { bubble('owner', ph3.say + (it0 ? ' ' + it0.emoji + ' ' + it0.name + 'ね' : ''), true); playPhrase(ph3); }
      } else if (e.type === 'serve') {
        var it = menuItem(e.item);
        ownerTo(e.seat, true);
        var ph2 = SHOP.PHRASES.filter(function (p) { return p.id === (e.svc ? 'o_service' : 'omachi'); })[0];   // サービスのときは「こちらはサービスです！」
        if (ph2) { bubble('owner', ph2.say + ' ' + (it ? it.emoji + ' ' + it.name + (it.pun && it.real ? '(中身は' + it.real + 'です)' : '') : ''), true); playPhrase(ph2); }
      }
    });
  }

  /* ---------------- 注文と料理 ---------------- */
  /* 大将の「料理の出し方」。手で出す / 自動(頼まれてから何秒かで出す)。お客さんは注文から3秒は取り消せるので、自動は5秒から */
  var AUTO_MODES = [
    { id: '', label: '✋ 手で出す', note: '注文票の「出す」を押したときに出します。' },
    { id: 'mix', label: '⏱ 自動 おすすめ', note: '飲み物は5秒、料理は10秒で自動で出します(おすすめ)。手で先に出すこともできます。' },
    { id: '5', label: '⏱ 自動 5秒', note: '頼まれてから5秒で自動で出します。手で先に出すこともできます。' },
    { id: '10', label: '⏱ 自動 10秒', note: '頼まれてから10秒で自動で出します。手で先に出すこともできます。' }
  ];
  function autoWait(mode) {   // 品物ごとの待ち時間(ミリ秒)を返す。手で出すなら null
    if (!mode) return null;
    if (mode === 'mix') return function (id) { var m = menuItem(id); return m && m.kind === 'drink' ? 5000 : 10000; };
    var sec = +mode || 5; return function () { return sec * 1000; };
  }
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
      return '<button data-eat="' + esc(x.key) + '">' + it.emoji + ' <b>' + verb + '</b></button>';
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
    event({ type: 'serve', seat: seat, item: id, svc: !orderKey && OWNER_MODE ? 1 : 0 });   // 注文なしで大将が出した = サービス
  }
  function renderOrdersBadge() {
    var o = tree.orders || {}, n = Object.keys(o).length;
    $('ordBadge').textContent = n; $('ordBadge').classList.toggle('hidden', !n);
    if (OWNER_MODE && n > lastOrders) ding();
    lastOrders = n;
  }

  /* ---------------- まとめ役の仕事(いちばん先にいる人のスマホが、1台だけでやる) ---------------- */
  var closingFor = '', autoServed = {};
  function tick() {
    if (!amLeader()) return;
    var n = now(), ms = members(), st = tree.state || {};
    autoCountdown(n);
    // いなくなった人の片づけ
    Object.keys(ms).forEach(function (uid) {
      if (ms[uid].name && (fresh(ms[uid]) || away(ms[uid]) || (ms[uid].bot && bots[uid]))) return;   // 名前のない記録(消されたあとの「いるよ」だけ)も片づける
      net.remove('members/' + uid);
      for (var i = 0; i < N; i++) if (seatUid(i) === uid) { net.remove('seats/' + i); net.remove('tables/' + i); }
    });
    for (var i = 0; i < N; i++) { var u = seatUid(i); if (u && !ms[u]) { net.remove('seats/' + i); net.remove('tables/' + i); } }
    Object.keys(tree.scores || {}).forEach(function (k) { if (k !== gameKey()) net.remove('scores/' + k); });   // 前の回の得点は消す(開店のたびにゼロから)
    regTick(n);   // 常連の子(片づけのあとに。来たばかりの子を 古い一覧で片づけないように)
    // 大将がいないとき・大将が「自動で出す」にしているときは、注文を自動で出す(お客さんは3秒は取り消せる)
    var aw = ownerPresent() ? autoWait(st.autoServe) : function () { return 3000; };
    if (aw) {
      var o = tree.orders || {};
      Object.keys(o).forEach(function (k) { if (n - (o[k].at || n) > aw(o[k].item) && !autoServed[k]) { autoServed[k] = 1; serve(o[k].seat, o[k].item, k); } });
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
    else if ((m.kind === 'yt' || m.kind === 'video') && mDur(m) > 0 && elapsed(m) > mDur(m) + 3) advance(musicKey(m));   // 動画の長さが過ぎた(どの画面で流れていても)
    else if (m.kind === 'yt' && m.ended === musicKey(m) && elapsed(m) > 5) advance(musicKey(m));   // だれかの画面で「終わった」
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
    net.update('state', { closedAt: TS, closedFor: st.openFor || 'manual', forceUntil: null, forceFrom: null, live: null, baton: null });
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
  $('shClose').onclick = function () { if (sheetKind === 'batonAsk') { batonAnswer(false); return; } closeSheet(); };   // 頼まれた画面の ✕ は「ことわる」
  $('sheetBack').onclick = function () { if (sheetKind === 'batonAsk') return; if (Date.now() - sheetOpenAt > 450) closeSheet(); };   // 頼まれた画面は 外を押しても閉じない(うっかり消さない)
  /* お品書き: 分類の見出しで切りかえ。置けない物は うすく、理由を出す */
  var menuCat = (SHOP.CATS && SHOP.CATS[0] && SHOP.CATS[0].id) || 'drink';
  function menuHTML(seat) {
    var c = seatCounts(seat), cats = (SHOP.CATS || [{ id: 'drink', name: '飲み物', emoji: '🍺' }]).filter(function (ct) { return !ct.only || celebKind(); });
    cats = cats.filter(function (ct) { return ct.only; }).concat(cats.filter(function (ct) { return !ct.only; }));   // 限定を いちばん前に
    if (!cats.some(function (ct) { return ct.id === menuCat; })) menuCat = cats[0].id;
    var h = '<div class="mn-count">' + (seat === mySeat && !OWNER_MODE ? 'あなたの前' : (seat + 1) + '番の席') +
      ' <b class="' + (c.food >= SHOP.FOOD_LIMIT ? 'full' : '') + '">料理 ' + c.food + '/' + SHOP.FOOD_LIMIT + '</b>' +
      ' <b class="' + (c.drink >= SHOP.DRINK_LIMIT ? 'full' : '') + '">飲み物 ' + c.drink + '/' + SHOP.DRINK_LIMIT + '</b>' +
      '<small>「食べる」「飲む」を2回押すと空になり、大将が下げます(押さなくても ' + SHOP.EAT_MINUTES + '分で空になります)</small></div>';
    h += '<div class="mn-tabs">';
    cats.forEach(function (ct) { h += '<button data-cat="' + ct.id + '" class="' + (ct.id === menuCat ? 'on' : '') + '">' + ct.emoji + ' ' + esc(ct.name) + '</button>'; });
    h += '</div><div class="mn-list">';
    SHOP.MENU.filter(function (m) { return inMode(m) && (m.cat || (m.kind === 'drink' ? 'drink' : 'otsumami')) === menuCat; }).forEach(function (m) {
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
      if (sheetKind === 'seat') { var u2 = seatUid(seatM), m2 = u2 && members()[u2]; if (!m2) { closeSheet(); return; } title = (seatM + 1) + '番 ' + honor(m2.name) + 'に出す'; }
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
        if (!m || !confirm(honor(m.name) + 'に帰ってもらいますか?')) return;
        net.remove('seats/' + seatM); net.remove('tables/' + seatM); net.remove('members/' + uid);
        sys(honor(m.name) + 'がお店を出ました'); closeSheet();
      };
      return;
    }
    if (sheetKind === 'music') {
      title = '曲・動画';
      var st = tree.state || {}, m = st.music, q = tree.queue || {}, qk = Object.keys(q).sort();
      html += '<div class="sh-sec">いま流れている曲</div><div class="li now"><div class="t">🎵 ' + (m ? esc(m.title) + (m.byName ? '<small>' + esc(honor(m.byName)) + 'のリクエスト</small>' : '') : '—') + '</div>' + (OWNER_MODE && m ? '<button id="skipBtn" class="red">⏭ 次の曲へ</button>' : '') + '</div>';
      if (OWNER_MODE) html += '<p class="small-note">大将だけ: 「次の曲へ」で今の曲・動画を取り消して、次へ進めます。順番待ちも全部取り消せます。</p>';
      html += '<div class="vol" style="margin-top:10px">🔈<input id="volIn" type="range" min="0" max="1" step="0.05" value="' + vol + '">🔊</div>';
      html += '<div class="sh-sec">🔋 画面の動き(熱くなる・電池が気になるとき)</div><div class="btn-row perf-row">' + ['eco', 'normal', 'smooth'].map(function (k) { return '<button data-perf="' + k + '" class="' + (k === perfMode ? 'red' : 'gray') + '">' + PERF[k].name + '</button>'; }).join('') + '</div><p class="small-note">省エネにすると、動きが少しカクッとしますが、熱と電池の減りがおさえられます。動画を大きく見ている間は、うしろのお店の絵を自動で止めて休ませます。</p>';
      html += '<p class="small-note">音の大きさは自分のスマホだけ。曲はお店にいる全員で同じものを聞きます。</p>';
      html += '<div class="sh-sec">リクエストの順番待ち(' + qk.length + ')</div><div class="list">';
      if (!qk.length) html += '<div class="li"><div class="t"><small>まだありません。下の一覧からリクエストできます。</small></div></div>';
      qk.forEach(function (k, i) { var it = q[k]; html += '<div class="li"><div class="t">' + (i + 1) + '. ' + esc(it.title) + '<small>' + esc(honor(it.byName)) + '</small></div>' + ((it.by === ME.uid || OWNER_MODE) ? '<button class="gray" data-del="' + esc(k) + '">取り消し</button>' : '') + '</div>'; });
      html += '</div>';
      if (SHOP.ALLOW_YOUTUBE) html += '<div class="sh-sec">📺 動画のリンクを貼ってリクエスト</div><div class="yt-row"><input id="ytIn" placeholder="YouTube などのリンク" inputmode="url"><button id="ytAdd">追加</button></div><label class="yt-tall"><input type="checkbox" id="ytTall"> 縦に撮った動画(モニターを縦にする)</label><p class="small-note">大将のうしろのモニターに、みんな同じ場面で映ります。モニターを押すと大きく見られます。YouTube は公式の埋めこみで流すので、広告が入ることがあります。</p>';
      if ((SHOP.VIDEOS || []).length) {
        html += '<div class="sh-sec">📺 お店の動画(大将のうしろのモニターに映ります)</div><div class="list">';
        var vrow = function (v) { return '<div class="li"><div class="t">' + esc(v.title) + '</div><button data-vreq="' + esc(v.id) + '">リクエスト</button></div>'; };
        SHOP.VIDEOS.filter(function (v) { return !v.tall; }).forEach(function (v) { html += vrow(v); });
        html += '</div>';
        var tallV = SHOP.VIDEOS.filter(function (v) { return v.tall; });
        if (tallV.length) { html += '<div class="sh-sec">📱 お店の縦の動画(モニターが縦になります)</div><div class="list">'; tallV.forEach(function (v) { html += vrow(v); }); html += '</div>'; }   // 縦に撮った動画は 分けて出す(11-21 ノブさん)
      }
      html += '<div class="sh-sec">お店の曲</div><div class="list">';
      SHOP.SONGS.forEach(function (s) { html += '<div class="li"><div class="t">' + esc(s.title) + '</div><button data-req="' + esc(s.id) + '">リクエスト</button></div>'; });
      html += '</div>';
      if (!force && body._h === html) return;
    } else if (sheetKind === 'photos') {
      $('shTitle').textContent = '📸 記念写真';
      if (force) { body.innerHTML = '<p class="small-note">読みこみ中…</p>'; body._h = ''; photosSheetFill(); }
      return;
    } else if (sheetKind === 'phrases') {
      title = OWNER_MODE ? '大将のひとこと' : 'ひとこと';
      html = phrasesHTML();
      if (!force && body._h === html) return;
    } else if (sheetKind === 'orders') {
      title = '注文票';
      var o = tree.orders || {}, ok = Object.keys(o).sort(), am = (tree.state || {}).autoServe || '';
      if (OWNER_MODE) {
        html += '<div class="sh-sec">料理の出し方</div><div class="ph-chips auto-pick">' + AUTO_MODES.map(function (m) { return '<button data-auto="' + m.id + '"' + (m.id === am ? ' class="on"' : '') + '>' + m.label + '</button>'; }).join('') + '</div>' +
          '<p class="small-note">' + (AUTO_MODES.filter(function (m) { return m.id === am; })[0] || AUTO_MODES[0]).note + '</p>';
      }
      html += '<div class="list">';
      if (!ok.length) html += '<div class="li"><div class="t"><small>注文はありません</small></div></div>';
      ok.forEach(function (k) { var it = menuItem(o[k].item) || { emoji: '🍽️', name: o[k].item }; html += '<div class="li"><div class="t">' + it.emoji + ' ' + esc(it.name) + '<small>' + (okSeat(o[k].seat) ? o[k].seat + 1 : '?') + '番 ' + esc(honor(o[k].name)) + '</small></div>' + (OWNER_MODE && am ? '<span class="auto-tag">⏱ 自動</span>' : '') + '<button data-serve="' + esc(k) + '">出す</button></div>'; });
      html += '</div>';
      if (OWNER_MODE) {   // 注文がなくても、席をえらんで出せる
        var sb2 = ''; for (var si = 0; si < N; si++) { var su = seatUid(si), sm = su && members()[su]; if (sm && fresh(sm)) sb2 += '<button data-seatserve="' + si + '">🍶 ' + (si + 1) + '番 ' + esc(honor(sm.name)) + '</button>'; }
        html += '<div class="sh-sec">席をえらんで出す(注文がなくても)</div>' + (sb2 ? '<div class="ph-chips seat-serve">' + sb2 + '</div>' : '<p class="small-note">いまは だれも座っていません</p>') +
          '<p class="small-note">お客さんのテーブル(カウンターの上)や「🍶 出す」を押しても出せます。お客さんを押すと「話しかける」か「料理を出す」を選べます。</p>';
      }
      if (!force && body._h === html) return;
    } else if (sheetKind === 'owner') {
      if (!force) return;
      title = '店主の操作';
      var s = status(now());
      html = '<div class="sh-sec">お店</div><div class="btn-row">' +
        '<button id="openBtn">🏮 臨時で開ける(1時間)</button><button id="closeBtn" class="red">🌙 閉店する</button></div>' +
        '<p class="small-note">いま: ' + (LOCAL ? 'おためしモード' : s.phase === 'open' ? '営業中(' + fmtTime(s.end) + 'まで)' : s.phase === 'doors' ? 'まもなく開店' : '準備中') + '</p>' +
        '<div class="sh-sec">片づけ</div><div class="btn-row"><button id="clearChat">💬 会話を全部消す</button><button id="clearTables">🍽️ 料理を下げる</button></div>' +
        regSheetHTML() +
        celebSheetHTML() +
        '<div class="sh-sec">大将の見た目</div><div class="btn-row"><button id="ownerLook">👕 着がえる(アバターを変える)</button></div>' +
        '<div class="sh-sec">記念写真</div><div class="btn-row"><button id="phListBtn">📸 記念写真を見る</button></div>' +
        (ROLE === 'nobu' ? '<div class="sh-sec">大将の声</div><div class="btn-row"><button id="recBtn">🎙 ノブの声を録音する</button></div><p class="small-note">大将の決まり文句を、ノブさんの声で録れます。録った声は、このスマホではすぐ流れます(大将の声を「ノブの声(録音)」にしたとき)。みんなに聞こえるようにするには「まとめて送る」→ Google ドライブの「居酒屋ノブの声」フォルダに保存 → Claude に「声入れたよ」と伝えてください。</p>' : '') +   // 録音は ノブさんだけ(バトンタッチ・マスターの人には出さない)
        (ROLE === 'nobu' ? '<div class="sh-sec">お店の予定</div><div class="btn-row"><button id="planBtn" class="red">📅 お店の予定・マスター交代・席の数</button></div>' : '<p class="small-note">お店の予定は ノブさんだけが直せます。</p>');
    } else if (sheetKind === 'baton') {
      if (!force) return;
      title = '🤝 大将を交代する';
      html = batonHTML(sheetArg);
    } else if (sheetKind === 'batonAsk') {
      if (!force) return;
      var bq = (tree.state || {}).baton;
      if (!bq || bq.token !== sheetArg) { closeSheet(); return; }
      title = '🤝 大将を頼まれました';
      html = batonAskHTML(bq);
    } else if (sheetKind === 'costume') {
      title = '🎭 仮装(今日だけ)';
      html = costumeHTML();
      if (!force && body._h === html) return;
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
        if (ytId(v.src)) pushYT(v.src, v.title, !!v.tall);
        else pushQueue({ kind: 'video', id: v.id + '-' + Date.now(), src: v.src, title: v.title });
      }; });
      body.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { net.remove('queue/' + b.getAttribute('data-del')); }; });
      var ya = q('#ytAdd'); if (ya) ya.onclick = function () {
        var url = q('#ytIn').value.trim(), id = ytId(url);
        if (id) pushYT(url, '', q('#ytTall') && q('#ytTall').checked);
        else if (/^https:\/\/[^\s]+\.(mp4|webm|m4v|mov)(\?[^\s]*)?$/i.test(url)) pushQueue({ kind: 'video', id: 'v' + Date.now(), src: url, title: '動画' });
        else { toast('リンクが読めませんでした(YouTube か、mp4 などの動画のリンク)'); return; }
        q('#ytIn').value = '';
      };
    } else if (sheetKind === 'baton') {
      wireBaton(body, sheetArg);
    } else if (sheetKind === 'batonAsk') {
      body.querySelector('#btYes').onclick = function () { batonAnswer(true); };
      body.querySelector('#btNo').onclick = function () { batonAnswer(false); };
    } else if (sheetKind === 'costume') {
      wireCostume(body);
    } else if (sheetKind === 'phrases') {
      body.querySelectorAll('[data-ph]').forEach(function (b) { b.onclick = function () { if (sayPhrase(b.getAttribute('data-ph'))) closeSheet(); }; });
    } else if (sheetKind === 'orders') {
      body.querySelectorAll('[data-serve]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-serve'), o = (tree.orders || {})[k]; if (o) serve(o.seat, o.item, k); }; });
      body.querySelectorAll('[data-seatserve]').forEach(function (b) { b.onclick = function () { serveTo(+b.getAttribute('data-seatserve')); }; });
      body.querySelectorAll('[data-auto]').forEach(function (b) { b.onclick = function () {
        var id = b.getAttribute('data-auto'); net.update('state', { autoServe: id || null });
        var m = AUTO_MODES.filter(function (x) { return x.id === id; })[0]; toast('料理の出し方: ' + (m ? m.label : '手で出す'), 1800);
        setTimeout(function () { refreshSheet(true); }, 150);
      }; });
    } else if (sheetKind === 'owner') {
      wireCeleb(q); wireReg(q);
      q('#openBtn').onclick = function () { net.update('state', { forceFrom: now(), forceUntil: now() + 60 * MIN, closedAt: null, closedFor: null }); sys('🏮 臨時で開店しました(1時間)'); closeSheet(); };
      q('#closeBtn').onclick = function () { if (confirm('閉店しますか?(会話と料理は片づけられます)')) { closeSheet(); closeShop(); } };
      q('#clearChat').onclick = function () { if (confirm('会話を全部消しますか?')) { net.remove('chat'); closeSheet(); } };
      q('#clearTables').onclick = function () { net.remove('tables'); closeSheet(); };
      q('#ownerLook').onclick = function () { closeSheet(); openMaker(); };
      q('#phListBtn').onclick = function () { openSheet('photos'); };
      if (q('#recBtn')) q('#recBtn').onclick = function () { if (inside && !confirm('録音ページへ移ります。お店からは一度出ます。よろしいですか?')) return; if (inside) leave(); location.href = 'owner/rec.html'; };
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
        '<small>' + (p.cancel ? 'お休み' : esc(p.title || SHOP.NAME) + ' ・ ' + (p.master ? 'マスター ' + esc(honor(p.master)) : 'ノブさん') + ' ・ ' + seatsFor(x) + '席') + (p.message ? '<br>' + esc(p.message) : '') + '</small></div>' +
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
      '<p class="small-note">マスターになる人は、大将用のアプリ(…/izakaya/owner/)を開いて、この合言葉で入ります。合言葉は この回だけ使えます。ノブさんは、お客さん用のアプリから お客さんとして入れます。</p></div>' +
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
  function pushYT(url, title, tall) {
    var id = ytId(url); if (!id) return false;
    var known = (SHOP.VIDEOS || []).filter(function (v) { return ytId(v.src) === id; })[0];   // お店の動画と同じなら その縦・横
    var isShort = /\/shorts\//.test(url), tallMark = !!tall || !!(known && known.tall);   // ショートでなくても 縦に撮った動画は 縦(YouTube の情報からは見分けられないので 印で)
    if (ytWaiting[id]) return true;
    ytWaiting[id] = 1; toast('動画を調べています…', 2500);
    ytMeta(id, isShort, function (t, tl) { delete ytWaiting[id]; pushQueue({ kind: 'yt', id: 'yt-' + id, src: 'https://youtu.be/' + id, title: title || t || 'YouTube の動画', tall: !!(tl || tallMark) }); });
    return true;
  }
  var ytWaiting = {};
  function pushQueue(item) {
    var q = tree.queue || {}, keys = Object.keys(q);
    if (keys.some(function (k) { return q[k].src === item.src; })) { toast('その曲は もう順番待ちに入っています', 1800); return; }   // 同じ曲を2つ入れない
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
  /* ---------------- 乾杯の連鎖 ----------------
     だれかが「かんぱーい」→ その人だけ ジョッキを上げる。ほかの人の画面に「🍻 一緒に乾杯！」が KP_WIN ミリ秒 出る。
     押した人から順に ジョッキが上がって「カチン」(そろうほど大きく)。おわりに「🍻 ◯人で かんぱーい！」と 大きなカチーン */
  var KP_WIN = 3000, kp = null, kpT = null;
  function clink(n, big) {
    if (DEMO) return;
    if (!actx) return;
    try {
      var t = actx.currentTime, fs = big ? [2093, 2637, 3136, 4186] : [2350 + Math.random() * 500, 3500 + Math.random() * 500];
      fs.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), v = (0.06 + Math.min(n, 10) * 0.025) * vol + 0.02, len = big ? 1.1 : 0.35;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * (big ? 0.02 : 0)); g.gain.exponentialRampToValueAtTime(v, t + 0.006 + i * (big ? 0.02 : 0)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + len + 0.05);
      });
    } catch (e) {}
  }
  function kpMine() { return OWNER_MODE ? 'owner' : mySeat; }
  function kpStart(key, e, who) {
    var rem = KP_WIN - (now() - (e.at || now()));
    if (rem < 600) return;
    if (kp) kpEnd(true);
    kp = { key: key, by: e.by, joined: {}, n: 1 }; kp.joined[who] = 1;
    var canJoin = e.by !== ME.uid && (OWNER_MODE || mySeat >= 0) && !document.body.classList.contains('photo-mode');
    $('kpJoin').classList.toggle('hidden', !canJoin);
    $('kpUi').classList.remove('hidden'); document.body.classList.add('kp-on'); kpCount();   // kp-on: 乾杯の間は「🍶 出す」を隠す(ボタンが重なる)
    clearTimeout(kpT); kpT = setTimeout(function () { kpEnd(false); }, rem);
    // おためし客は 少しずつ続く
    var rk = regSeat(); if (rk >= 0 && amLeader() && e.by !== REG_UID) setTimeout(function () { if (kp && kp.key === key && regSeat() === rk) { net.push('events', { type: 'kanpaiJoin', ref: key, seat: rk, at: TS, by: REG_UID }); if (Math.random() < 0.5) setTimeout(function () { regLine('kanpai'); }, 600); } }, 700 + Math.random() * 1800);   // 常連の子は ほかの人の乾杯に加わる(自分からはしない)
    if (LOCAL) Object.keys(bots).forEach(function (u) { var b = bots[u]; if (u === e.by || Math.random() < 0.15) return; setTimeout(function () { if (kp && kp.key === key) net.push('events', { type: 'kanpaiJoin', ref: key, seat: b.seat, at: TS, by: u }); }, 400 + Math.random() * 2000); });
  }
  function kpCount() { if (!kp) return; $('kpCount').textContent = '🍻 ' + kp.n + '人'; }
  $('kpJoin').onclick = function () {
    if (!kp) return;
    var me = kpMine(); if (me === -1 || kp.joined[me]) return;
    $('kpJoin').classList.add('hidden');
    event({ type: 'kanpaiJoin', ref: kp.key, seat: me });
  };
  function kpJoined(e) {
    if (!kp || e.ref !== kp.key) return;
    var seat = e.seat === 'owner' ? 'owner' : e.seat;
    if (seat !== 'owner' && !okSeat(seat)) return;
    if (kp.joined[seat]) return;
    kp.joined[seat] = 1; kp.n++;
    withScene(function (s) { s.cheer(seat); });
    floater(seat, '🍻'); clink(kp.n, false); kpCount();
    if (seat === kpMine()) $('kpJoin').classList.add('hidden');
  }
  function kpEnd(quiet) {
    clearTimeout(kpT);
    var r = kp; kp = null; $('kpUi').classList.add('hidden'); document.body.classList.remove('kp-on');
    if (!r || quiet || r.n < 2) return;
    var bn = $('kpBanner'); bn.textContent = '🍻 ' + r.n + '人で かんぱーい！'; bn.classList.remove('hidden'); bn.classList.remove('go'); void bn.offsetWidth; bn.classList.add('go');
    setTimeout(function () { bn.classList.add('hidden'); }, 1900);
    clink(r.n, true);
    Object.keys(r.joined).forEach(function (s) { floater(s === 'owner' ? 'owner' : +s, '✨'); });
  }

  /* ---------------- 見本(#demo。ホームページの「覗いてみる」) ----------------
     このスマホの中だけ(ほかの人には つながらない)。お客さん4人・大将・後ろのモニターにハンターカブの PV。
     会話は流れるが、入力・注文などのボタンは出さない。👁 で 全体 → 席から → 後ろから と 視点を変えて試せる */
  var DEMO_SEAT = 1;   // 見本の「目線」「後ろ」は 2番の人の席から(空いた席からだと 何も映らない)
  function demoVideo() { var v = SHOP.VIDEOS.filter(function (x) { return x.id === 'v-hunter'; })[0]; if (v) net.set('state/music', { kind: 'yt', id: v.id + '-' + Date.now(), src: v.src, title: v.title, by: '', byName: '', start: TS }); }
  function startDemo() {
    document.body.classList.add('demo');
    setTimeout(function () { $('demoNote').classList.add('mini'); }, 10000);   // 10秒たったら 説明を1行に(お店が よく見えるように)
    try { localStorage.removeItem('iz-local-demo'); } catch (e) {}
    ME = { uid: 'demo-viewer', name: '見学の人', avatar: AVATAR.random() };   // 見ている人(座らない・保存しない)
    connect('demo');
    setTimeout(function () {
      enter('見学の人');
      net.set('members/demo-owner', { name: SHOP.OWNER_NAME, owner: true, at: TS, seen: TS, voice: '' });
      net.update('state', { ownerAvatar: Object.assign({}, AVATAR.OWNER, SHOP.NOBU_FACE ? { special: 'nobu' } : {}), ownerName: SHOP.OWNER_NAME, ownerRole: 'nobu', autoServe: 'mix' });
      [0, 900, 1800, 2700].forEach(function (t) { setTimeout(addBot, 600 + t); });
      setTimeout(demoVideo, 1500);
      setTimeout(function () {   // はじめから 4人の前に 飲み物と料理(開いてすぐ にぎやかに)
        var D = ['beer', 'highball', 'lemon', 'beer'], F = ['yakitori', 'karaage', 'edamame', 'oden'];
        for (var i = 0; i < N; i++) { var u = seatUid(i); if (!u || !bots[u]) continue; var k = Object.keys(bots).indexOf(u);
          [D[k % 4], F[k % 4]].forEach(function (id) { if (menuItem(id)) net.set('tables/' + i + '/' + net.newKey(), { id: id, at: TS }); }); }
      }, 4500);
      setView('overview');
      setInterval(function () {   // 大将も ときどき話す(作りもの)
        net.update('members/demo-owner', { seen: TS });
        if (Math.random() < 0.35) { var L = ['irasshai', 'haiyo', 'o_iine', 'o_moriagari', 'o_arigato', 'o_kanpai']; event({ type: 'phrase', id: L[Math.floor(Math.random() * L.length)], seat: 'owner', by: 'demo-owner' }); }
      }, 9000);
    }, 400);
  }

  /* ---------------- お祝いモード(クリスマス・お正月・誕生日) ----------------
     大将が ☰ → 🏮店主 で切りかえる(state.celebrate = { kind, who: [誕生日の人の uid], at })。
     飾り(3D)・限定メニュー(MENU の only)・限定の言葉(PHRASES の only)・その日だけの仮装(members/<uid>.costume = 'かぶりもの|メガネ|たすき') */
  function celeb() { var c = (tree.state || {}).celebrate; return c && SHOP.CELEBRATE[c.kind] ? c : null; }
  function celebKind() { var c = celeb(); return c ? c.kind : ''; }
  function inMode(x) { return !x.only || x.only === celebKind(); }
  function cosOf(uid, m) {   // 今日のお祝いで使える仮装だけ(ほかの日の物は 出さない)
    var k = celebKind(); if (!k || !m) return '';
    var d = SHOP.CELEBRATE[k], mine = myCos(m, k), p = (mine || '').split('|'), has = function (L, v) { return (L || []).some(function (x) { return x[0] === v; }); };
    var h = has(d.hats, p[0]) ? p[0] : '', fc = has(SHOP.FACES, p[1]) ? p[1] : '', bd = has(d.bodies, p[2]) ? p[2] : '';
    if (k === 'birthday' && mine == null && (celeb().who || []).indexOf(uid) >= 0) { h = 'crown'; bd = 'sash'; }   // 誕生日の主役は はじめから王冠とたすき(自分でえらぶまで)
    return h || fc || bd ? h + '|' + fc + '|' + bd : '';
  }
  function myCos(m, k) {   // その日(k)に えらんだ仮装 'かぶりもの|メガネ|たすき'。まだ えらんでいなければ null(仮装は お祝いの日ごとに 覚える)
    var c = String((m && m.costume) || ''), i = c.indexOf('/');
    return i > 0 && c.slice(0, i) === k ? c.slice(i + 1) : null;
  }
  function withCos(av, cos) { return cos && av ? Object.assign({}, av, { costume: cos }) : av; }
  function celebNames() { var c = celeb(), ms = members(); return c && c.kind === 'birthday' ? (c.who || []).map(function (u) { return ms[u] ? honor(ms[u].name) : ''; }).filter(Boolean) : []; }
  var lastCeleb = null;
  function applyCeleb() {
    var k = celebKind(), names = celebNames();
    scene.setCelebrate(k, { names: names });
    document.body.classList.toggle('celeb', !!k);
    ['xmas', 'newyear', 'birthday'].forEach(function (x) { document.body.classList.toggle('celeb-' + x, k === x); });
    boardTick();
    $('bGame').classList.toggle('hidden', !inside || DEMO || !window.IZGAME || (!OWNER_MODE && mySeat < 0));   // 🎮 ミニゲーム(座ってから)
    $('bCos').classList.toggle('hidden', !inside || DEMO);   // 👕 着がえ: いつも出す(お祝いの日は 仮装も ここから)
    var lbl = $('tbCeleb'); if (lbl) { lbl.innerHTML = k ? SHOP.CELEBRATE[k].emoji + '<i>' + esc(SHOP.CELEBRATE[k].name) + '</i>' : ''; lbl.classList.toggle('hidden', !k); }
    if (lastCeleb === null) { lastCeleb = k; return; }
    if (k !== lastCeleb) {
      lastCeleb = k;
      if (inside) { buildPhrases(); if (sheetKind === 'menu' || sheetKind === 'seat' || sheetKind === 'phrases') refreshSheet(true); }
      if (k && inside) { menuCat = 'gentei'; toast(SHOP.CELEBRATE[k].hello, 6000, OWNER_MODE ? '' : '🎭 仮装する', OWNER_MODE ? null : function () { openSheet('costume'); }); withScene(function (s) { s.confetti(k); }); }
    }
  }
  /* 常連のアイちゃんを 大将が呼ぶ・帰す(ノブさん 2026-11-21)。state.aiMode = { m: 'stay'(ずっといる)| 'away'(来ない), at }。8時間で もとの「おまかせ」に戻る */
  function regMode() { var x = (tree.state || {}).aiMode; return x && x.m && now() - (x.at || 0) < 8 * 3600 * 1000 ? x.m : ''; }
  function regSheetHTML() {
    var md = regMode(), here = !!regMember();
    return '<div class="sh-sec">👧 ' + esc(REG.NAME) + '(常連さん)</div><div class="btn-row">' +
      '<button id="regCall"' + (md === 'stay' ? ' class="on"' : '') + '>👋 ' + esc(REG.NAME) + 'を呼ぶ</button>' +
      '<button id="regBye" class="red">🌙 ' + esc(REG.NAME) + 'を帰す</button></div>' +
      '<p class="small-note">いま: ' + (here ? 'お店にいます' : 'いません') + '・' + (md === 'stay' ? '呼んだので、お客さんが多くても ずっといます' : md === 'away' ? '帰したので、呼ぶまで来ません' : 'おまかせ(お客さんが ' + REG.MAX_GUESTS + '人までのとき来て、' + (REG.MAX_GUESTS + 1) + '人目が来たら帰ります)') +
      (md ? ' <a href="#" id="regAuto">おまかせに戻す</a>' : '') + '</p>' +
      '<p class="small-note" style="margin-bottom:4px">' + esc(REG.NAME) + 'が自分から話す間かく(お客さんへの話しかけ・大将への ひとこと など。だれかが話している間は 少し待ちます)</p><div class="ph-chips cel-pick">' +
      (LOCAL ? [0.5, 1, 2, 5, 10] : [1, 2, 5, 10]).map(function (v) { return '<button data-aitalk="' + v + '"' + (regEvery() === v ? ' class="on"' : '') + '>' + (v < 1 ? '30秒' : v + '分') + 'に1回</button>'; }).join('') + '</div>';
  }
  function wireReg(q) {
    var set = function (m) { net.update('state', { aiMode: m ? { m: m, at: TS } : null }); setTimeout(function () { refreshSheet(true); }, 300); };
    var a = q('#regCall'); if (a) a.onclick = function () { set('stay'); toast(REG.NAME + 'を呼びました。ずっといてくれます', 2200); };
    var b = q('#regBye'); if (b) b.onclick = function () { set('away'); toast(REG.NAME + 'に帰ってもらいます', 2200); };
    var c = q('#regAuto'); if (c) c.onclick = function (e) { e.preventDefault(); set(''); };
    document.querySelectorAll('#shBody [data-aitalk]').forEach(function (bt) { bt.onclick = function () { var v = +bt.getAttribute('data-aitalk'); net.update('state', { aiTalk: v }); regTalkAt = 0; toast(REG.NAME + 'は ' + (v < 1 ? '30秒' : v + '分') + 'に1回くらい 話します', 1800); setTimeout(function () { refreshSheet(true); }, 300); }; });
  }
  function celebSheetHTML() {
    var k = celebKind(), c = celeb(), h = '<div class="sh-sec">🎉 お祝いモード</div><div class="ph-chips cel-pick">';
    h += '<button data-cel=""' + (k ? '' : ' class="on"') + '>なし</button>';
    Object.keys(SHOP.CELEBRATE).forEach(function (id) { var d = SHOP.CELEBRATE[id]; h += '<button data-cel="' + id + '"' + (k === id ? ' class="on"' : '') + '>' + d.emoji + ' ' + esc(d.name) + '</button>'; });
    h += '</div>';
    if (k === 'birthday') {
      var ms = members(), who = c.who || [], chips = '';
      for (var i = 0; i < N; i++) { var u = seatUid(i), m = u && ms[u]; if (m && fresh(m)) chips += '<button data-bd="' + esc(u) + '"' + (who.indexOf(u) >= 0 ? ' class="on"' : '') + '>🎂 ' + esc(honor(m.name)) + '</button>'; }
      h += '<p class="small-note">今日の主役(押して えらぶ・何人でも)。名前が飾りに出て、王冠とたすきが付きます。</p><div class="ph-chips cel-pick">' + (chips || '<span class="small-note">まだ だれも座っていません</span>') + '</div>';
    }
    if (k) h += '<div class="btn-row"><button id="celBoom">🎉 お祝いの合図(紙吹雪)</button>' + (k === 'newyear' ? '<button id="celCount" class="red">⏱ カウントダウン(10秒)</button>' : '') + '</div>' +
      '<p class="small-note">' + (k === 'newyear' ? '大みそかの 23時59分50秒になると、カウントダウンが自動で始まります(お店が開いているとき)。' : 'みんなの画面に紙吹雪が舞います。') + '</p>';
    else h += '<p class="small-note">えらぶと、お店の飾り・限定メニュー・お祝いの言葉・その日だけの仮装が出ます。</p>';
    return h;
  }
  function wireCeleb(q) {
    document.querySelectorAll('#shBody [data-cel]').forEach(function (b) { b.onclick = function () {
      var id = b.getAttribute('data-cel');
      net.update('state', { celebrate: id ? { kind: id, who: [], at: TS } : null });
      var od = tree.orders || {}; Object.keys(od).forEach(function (k) { var it = menuItem(od[k].item); if (it && it.only && it.only !== id) net.remove('orders/' + k); });   // ほかの日の限定料理の注文は 取り下げる
      sys(id ? SHOP.CELEBRATE[id].emoji + ' ' + SHOP.CELEBRATE[id].name + 'の特別営業がはじまりました' : 'お祝いモードを終わりました');
      setTimeout(function () { refreshSheet(true); }, 200);
    }; });
    document.querySelectorAll('#shBody [data-bd]').forEach(function (b) { b.onclick = function () {
      var c = celeb(); if (!c) return; var u = b.getAttribute('data-bd'), who = (c.who || []).slice(), i = who.indexOf(u);
      if (i >= 0) who.splice(i, 1); else who.push(u);
      net.update('state', { celebrate: Object.assign({}, c, { who: who }) });
      setTimeout(function () { refreshSheet(true); }, 200);
    }; });
    var bb = q('#celBoom'); if (bb) bb.onclick = function () { event({ type: 'boom' }); closeSheet(); };
    var bc = q('#celCount'); if (bc) bc.onclick = function () { event({ type: 'countdown', to: now() + 10500 }); closeSheet(); };
  }
  function costumeHTML() {
    var k = celebKind(); if (!k) return '<div class="btn-row"><button id="cosLook">👕 アバターを変える</button></div><p class="small-note">いまは お祝いの日ではありません。</p>';
    var d = SHOP.CELEBRATE[k], m = members()[ME.uid] || {}, p = (cosOf(ME.uid, m) || '').split('|');
    var row = function (title, slot, list) { if (!list || !list.length) return ''; var cur = p[slot] || ''; var h2 = '<div class="sh-sec">' + title + '</div><div class="ph-chips cos-pick">';
      h2 += '<button data-cos="' + slot + ':"' + (cur ? '' : ' class="on"') + '>なし</button>';
      list.forEach(function (x) { h2 += '<button data-cos="' + slot + ':' + x[0] + '"' + (cur === x[0] ? ' class="on"' : '') + '>' + esc(x[1]) + '</button>'; });
      return h2 + '</div>'; };
    return '<div class="btn-row"><button id="cosLook">👕 アバターを変える(ふだんの姿)</button></div>' + row('かぶりもの', 0, d.hats) + row('へんなメガネ', 1, SHOP.FACES) + row('たすき', 2, d.bodies) +
      '<p class="small-note">' + d.emoji + ' ' + esc(d.name) + 'の日だけの仮装です。ふだんのアバターは そのまま。' + (OWNER_MODE ? '' : '自分の姿は「👁」で「後ろ」か「全体」にすると見えます。') + '</p>';
  }
  function wireCostume(body) {
    var cl = body.querySelector('#cosLook'); if (cl) cl.onclick = function () { closeSheet(); openMaker(); };
    body.querySelectorAll('[data-cos]').forEach(function (b) { b.onclick = function () {
      var v = b.getAttribute('data-cos').split(':'), slot = +v[0], m = members()[ME.uid] || {}, p = (cosOf(ME.uid, m) || '||').split('|');   // 今 見えている形(主役の王冠など)から変える
      while (p.length < 3) p.push(''); p[slot] = v[1] || '';
      net.update('members/' + ME.uid, { costume: celebKind() + '/' + p.join('|') });
      setTimeout(function () { refreshSheet(true); }, 150);
    }; });
  }
  function celebBoom() {
    var k = celebKind(); withScene(function (s) { s.confetti(k); });
    var bn = $('kpBanner'); bn.textContent = k === 'xmas' ? '🎄 メリークリスマス！' : k === 'newyear' ? '🎍 おめでとう！' : k === 'birthday' ? '🎂 おめでとう！' : '🎉 おめでとう！';
    bn.classList.remove('hidden'); bn.classList.remove('go'); void bn.offsetWidth; bn.classList.add('go'); setTimeout(function () { bn.classList.add('hidden'); }, 2200);
    clink(4, true);
  }
  /* カウントダウン: to(時刻)に 0。みんなの画面で同じ時刻に。0 で「あけましておめでとう！」と紙吹雪 */
  var cdTimer = null;
  function showCountdown(to) {
    var el = $('countdown'); clearInterval(cdTimer); document.body.classList.add('cd-on');
    if (to - now() < -3000) return;
    el.classList.remove('hidden');
    var step = function () {
      var r = Math.ceil((to - now()) / 1000);
      if (r > 0) { if (el.textContent !== String(r)) { el.textContent = r; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } return; }
      clearInterval(cdTimer); el.classList.add('done'); el.innerHTML = celebKind() === 'newyear' ? '🎍<br>あけまして<br>おめでとう！' : '🎉<br>おめでとう！';
      withScene(function (s) { s.confetti(celebKind() || 'birthday'); }); clink(6, true);
      setTimeout(function () { el.classList.add('hidden'); el.classList.remove('done'); el.textContent = ''; document.body.classList.remove('cd-on'); }, 5000);
    };
    step(); cdTimer = setInterval(step, 100);
  }
  var cdSent = {};
  function autoCountdown(n) {   // 大みそかの 23:59:50 に 自動で(まとめ役のスマホが1台だけ出す)
    if (celebKind() !== 'newyear') return;
    var d = new Date(n); if (d.getMonth() !== 11 || d.getDate() !== 31 || d.getHours() !== 23 || d.getMinutes() !== 59 || d.getSeconds() < 50) return;
    var y = d.getFullYear(); if (cdSent[y]) return; cdSent[y] = 1;
    var to = new Date(y + 1, 0, 1, 0, 0, 0).getTime();
    if (!Object.keys(tree.events || {}).some(function (k) { return tree.events[k].type === 'countdown' && Math.abs((tree.events[k].to || 0) - to) < 2000; })) event({ type: 'countdown', to: to });
  }

  /* ---------------- ミニゲーム「ジョッキ キャッチ」と 本日の最高得点(ノブさん 2026-11-21) ----------------
     🎮 で遊ぶ(30秒)。点数は scores/<その回>/<uid> = {name, score, at}(自分の いちばん高い点だけ)。
     モニターの右の黒板に 上位3人。開店のたびに ゼロから。1位が変わったら 会話でお知らせ + 大将「いいねえ！」+ 常連の子「すごい！」 */
  function gameKey() { return liveKey(); }
  function gameNow(t) { return !!t && now() - t < 45000; }
  function scoresToday() {
    var s = (tree.scores || {})[gameKey()] || {};
    return Object.keys(s).map(function (u) { return { uid: u, name: s[u].name, score: +s[u].score || 0, at: s[u].at || 0 }; })
      .filter(function (x) { return x.name && x.score > 0; }).sort(function (a, b) { return b.score - a.score || a.at - b.at; });
  }
  var boardKey = '';
  function boardTick() {
    var top = scoresToday().slice(0, 3), k = JSON.stringify(top.map(function (x) { return [x.name, x.score]; }));
    if (k === boardKey) return; boardKey = k;
    withScene(function (sc) { if (sc.setScores) sc.setScores(top); });
  }
  function postScore(uid, name, score) {   // 自分の最高より高ければ 記録。1位になったら お知らせ。結果の文を返す
    var mx = window.IZGAME ? IZGAME.maxScore(gameKey()) : 9999; score = Math.max(0, Math.min(score | 0, mx));   // ありえない点は 上限まで
    if (score <= 0) return '';
    var L = scoresToday(), mine = L.filter(function (x) { return x.uid === uid; })[0], top = L[0];
    var better = !mine || score > mine.score;
    if (better) net.set('scores/' + gameKey() + '/' + uid, { name: name, score: score, at: TS });
    var rank = 1 + L.filter(function (x) { return x.uid !== uid && x.score >= score; }).length;
    if (better && rank === 1 && (!top || top.uid !== uid)) {   // 1位が かわった(または はじめての記録)
      sys('🎉 ' + honor(name) + 'が 本日の最高得点!(ジョッキ キャッチ ' + score + '点)');
      net.push('events', { type: 'phrase', id: 'o_iine', seat: 'owner', at: TS, by: uid });   // 大将「いいねえ！」
      net.push('events', { type: 'record', at: TS, by: uid });
      return '🎉 本日の最高得点です!';
    }
    if (better && rank === 1) return '🎉 自分の記録を こえました!(いまも1位)';
    if (!better) return '今日の自分の最高は ' + mine.score + '点(いま ' + (1 + L.filter(function (x) { return x.uid !== uid && x.score >= mine.score; }).length) + '位)';
    return '今日の ' + rank + '位です!';
  }
  function myGameName() { return OWNER_MODE ? ownerLabel() : currentName(); }
  function setGaming(on) { if (!inside || DEMO) return; if (OWNER_MODE) net.update('state', { ownerGame: on ? now() : null }); else net.update('members/' + ME.uid, { game: on ? now() : null }); }
  var gameAlive = 0;
  function openGame() {
    if (!inside || DEMO || !window.IZGAME || IZGAME.isOpen()) return;
    if (phOn) { toast('記念撮影の あとで遊べます', 2000); return; }
    if (document.body.classList.contains('kigae-on')) return;
    closeSheet(); closeWho();
    var mine = scoresToday().filter(function (x) { return x.uid === ME.uid; })[0];
    withScene(function (sc) { if (sc.setPerf) sc.setPerf({ rest: true }); });   // 遊んでいる間は お店の 3D を休ませる(軽く)
    IZGAME.open({
      seed: gameKey(), best: mine ? mine.score : 0,
      onStart: function () { setGaming(true); clearInterval(gameAlive); gameAlive = setInterval(function () { if (IZGAME.isOpen()) setGaming(true); }, 20000); },
      onEnd: function (score, aborted) { clearInterval(gameAlive); setGaming(false); if (aborted) return ''; return postScore(ME.uid, myGameName(), score); },
      onClose: function () { clearInterval(gameAlive); setGaming(false); withScene(function (sc) { if (sc.setPerf) sc.setPerf({ rest: tvMode === 'big' }); }); }
    });
  }
  $('bGame').onclick = openGame;
  $('bCos').onclick = function () { if (celebKind()) openSheet('costume'); else openMaker(); };

  /* ---------------- 記念撮影(大将の自撮り風) ----------------
     お客さんが「📸 撮影」でリクエスト → 大将が「撮影する」→ 全員の画面でカウントダウン。
     残り PICK_FROM〜PICK_TO 秒のあいだに ポーズと表情を選ぶ(「今回は写らない」も選べる)。0秒で 全員が同じ絵を それぞれのスマホで写真にする。
     写真は送り合わない(それぞれのスマホで作る)。大将のスマホには KEEP_DAYS 日だけ とっておき、消せる */
  var PH = Object.assign({ SEC: 20, PICK_FROM: 15, PICK_TO: 3, KEEP_DAYS: 30 }, SHOP.PHOTO || {});
  var phOn = null, phShot = false, phSaid = {}, phAiSaid = '', myPick = { pose: 'peace', face: 'smile', hide: false }, phReqAt = 0, phBots = false;
  function ownerUid() { var ms = members(); return Object.keys(ms).filter(function (u) { return ms[u].owner && fresh(ms[u]); })[0] || null; }
  function photoList() {   // 写る人(席の順)。写らないを選んだ人は入れない
    var picks = tree.photo || {}, ms = members(), L = [];
    function pk(uid) { var p = uid === ME.uid ? myPick : (picks[uid] || {}); return { pose: p.pose || 'peace', face: p.face || 'smile', hide: !!p.hide }; }
    var aiIn = !!((tree.state || {}).photo || {}).ai;
    for (var i = 0; i < N; i++) { var u = seatUid(i), m = u && ms[u]; if (!m || !fresh(m) || (m.regular && !aiIn)) continue; var p = pk(u); if (!p.hide) L.push({ key: i, pose: p.pose, face: p.face }); }   // 常連の子(アイちゃん)は ふだん写らない。だれかが「アイちゃんも入れる」を押したら写る(ノブさん 2026-11-21)
    var ou = ownerUid(); if (ou) { var po = pk(ou); if (!po.hide) L.push({ key: 'owner', pose: po.pose, face: po.face }); }
    return L;
  }
  function startPhoto() {
    if (!OWNER_MODE) return;
    var st = (tree.state || {}).photo; if (st && st.at && now() - st.at < (st.sec + 8) * 1000) { toast('いま撮影中です'); return; }
    net.remove('photo');
    net.update('state', { photo: { id: 'p' + Date.now(), at: TS, sec: PH.SEC } });
    sys('📸 記念撮影をします');
  }
  $('bPhoto').onclick = function () {
    if (OWNER_MODE) { if (confirm('記念撮影をはじめますか?(' + PH.SEC + '秒のカウントダウンのあと、みんなで自撮りします)')) startPhoto(); return; }
    if (mySeat < 0) { toast('先に席に座ってください'); return; }
    if (phOn) { toast('いま撮影中です'); return; }
    if (Date.now() - phReqAt < 20000) { toast('大将にお願いしてあります。少し待ってください'); return; }
    phReqAt = Date.now();
    event({ type: 'photoReq', seat: mySeat, name: currentName() });
    sys('📸 ' + honor(currentName()) + 'が記念撮影をリクエストしました');
    toast(ownerPresent() ? '大将に記念撮影をお願いしました' : '大将がいるときに撮影できます');
  };
  function phChips() {
    var S = scene || {}, poses = S.photoPoses || [], faces = S.photoFaces || [];
    $('phPoses').innerHTML = poses.map(function (p) { return '<button data-pose="' + p[0] + '" class="' + (myPick.pose === p[0] ? 'on' : '') + '">' + esc(p[1]) + '</button>'; }).join('');
    $('phFaces').innerHTML = faces.map(function (f) { return '<button data-face="' + f[0] + '" class="' + (myPick.face === f[0] ? 'on' : '') + '">' + esc(f[1]) + '</button>'; }).join('');
    $('phPoses').querySelectorAll('[data-pose]').forEach(function (b) { b.onclick = function () { myPick.pose = b.getAttribute('data-pose'); phSend(); }; });
    $('phFaces').querySelectorAll('[data-face]').forEach(function (b) { b.onclick = function () { myPick.face = b.getAttribute('data-face'); phSend(); }; });
  }
  function phSend() { net.set('photo/' + ME.uid, { pose: myPick.pose, face: myPick.face, hide: myPick.hide, at: TS }); phChips(); photoTick(); }
  $('phHide').onclick = function () {
    if ($('phPick').classList.contains('locked')) return;
    myPick.hide = !myPick.hide; phSend();
    toast(myPick.hide ? '今回は写りません' : '写真に写ります', 1600);
  };
  $('phAi').onclick = function () {   // アイちゃんも写真に入れる / 外す(だれが押してもよい。みんなの画面で同じ)
    var st = (tree.state || {}).photo; if (!st || $('phPick').classList.contains('locked')) return;
    var on = !st.ai;
    if (on) { var P = (scene && scene.photoPoses) || [['peace']], F = (scene && scene.photoFaces) || [['smile']]; net.set('photo/' + REG_UID, { pose: P[Math.floor(Math.random() * Math.min(P.length, 6))][0], face: F[Math.floor(Math.random() * Math.min(F.length, 3))][0], hide: false, at: TS }); }
    net.set('state/photo/ai', on);
    toast(on ? REG.NAME + 'も写真に入ります' : REG.NAME + 'は今回は写りません', 1600);
  };
  function photoTick() {
    var st = (tree.state || {}).photo;
    if (!st || !st.at || !inside) { if (phOn) photoEndUI(); return; }
    var rem = st.sec - (now() - st.at) / 1000;
    if (rem < -7) { if (phOn) photoEndUI(); if (OWNER_MODE && amLeader()) net.update('state', { photo: null }); return; }
    if (phOn !== st.id) {   // 始まり
      phOn = st.id; phShot = false; phSaid = {}; myPick = { pose: 'peace', face: 'smile', hide: false };
      if (window.IZGAME && IZGAME.isOpen()) { IZGAME.abort(); toast('記念撮影が始まったので、ゲームは終わりにしました', 2600); }
      document.body.classList.add('photo-mode'); $('photoUi').classList.remove('hidden'); closeSheet();
      phChips();
      if (LOCAL && !phBots) { phBots = true; setTimeout(function () { phBots = false; Object.keys(bots).forEach(function (u) { var P = (scene && scene.photoPoses) || [['peace']], F = (scene && scene.photoFaces) || [['smile']]; net.set('photo/' + u, { pose: P[Math.floor(Math.random() * P.length)][0], face: F[Math.floor(Math.random() * 4)][0], hide: false, at: TS }); }); }, 6000); }
    }
    var picking = rem <= PH.PICK_FROM && rem > PH.PICK_TO, locked = rem <= PH.PICK_TO;
    $('phCount').textContent = rem > 0 ? Math.ceil(rem) : '📸';
    $('phTitle').textContent = rem <= 0 ? 'はい、チーズ！' : locked ? 'まもなく撮影します…' : picking ? 'ポーズと表情を選んでください' : '📸 記念撮影をします。皆さん準備してください';
    $('phPick').classList.toggle('waiting', !picking && !locked);
    $('phPick').classList.toggle('locked', locked);
    $('phPick').classList.toggle('hidden', rem <= 0);
    $('phHide').textContent = myPick.hide ? '🙈 写りません(押すと写ります)' : '🙈 今回は写らない';
    var regM = members()[REG_UID], regHere = !!(regM && fresh(regM) && regSeat() >= 0);
    $('phAi').classList.toggle('hidden', !regHere || rem <= 0);
    $('phAi').classList.toggle('on', !!st.ai);
    $('phAi').textContent = st.ai ? '👧 ' + REG.NAME + 'も写ります(押すと外す)' : '👧 ' + REG.NAME + 'も写真に入れる';
    if (st.ai && regHere && amLeader() && phAiSaid !== st.id) { phAiSaid = st.id; setTimeout(function () { regSay(['えっ、わたしもいいの？うれしい！', 'わーい、一緒に撮ろう！', 'えへへ、入れてくれて ありがとう'][Math.floor(Math.random() * 3)]); }, 900); }
    $('phHide').classList.toggle('on', myPick.hide);
    $('phChoose').classList.toggle('off', myPick.hide || !picking);
    $('phNote').textContent = myPick.hide ? 'あなたは この写真に写りません。ほかの人の写真は受けとれます。'
      : locked ? '選んだポーズで撮ります' : picking ? 'あと ' + Math.ceil(rem - PH.PICK_TO) + '秒 選べます' : 'あと ' + Math.ceil(rem - PH.PICK_FROM) + '秒で ポーズと表情を選べます。写りたくない人は「今回は写らない」を押してください';
    withScene(function (s) { if (s.photoSet) s.photoSet(photoList(), PH.LAYOUT); });
    // 大将の声(みんなのスマホで、それぞれ同じ時に鳴らす)
    var say = function (id, when) { if (!phSaid[id] && rem <= when && rem > when - 2) { phSaid[id] = 1; var ph = SHOP.PHRASES.filter(function (p) { return p.id === id; })[0]; if (ph) playPhrase(ph); } };
    say('o_photo', PH.SEC - 0.3); say('o_cheese', 1.6);
    if (rem <= 0 && !phShot) { phShot = true; photoShoot(); }
  }
  setInterval(function () { if (phOn || ((tree.state || {}).photo || {}).at) photoTick(); }, 250);
  function photoEndUI() {
    phOn = null; document.body.classList.remove('photo-mode'); $('photoUi').classList.add('hidden');
    if (Object.keys(phFrozen).length) setTimeout(function () { phFrozen = {}; applyTree(); }, 0);
    withScene(function (s) { if (s.photoEnd) s.photoEnd(); });
  }
  function shutter() {
    if (DEMO) return;
    if (!actx) return;
    try {
      var t = actx.currentTime, len = 0.12, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      var src = actx.createBufferSource(), g = actx.createGain(); src.buffer = buf; g.gain.value = 0.5 * vol + 0.1; src.connect(g); g.connect(actx.destination); src.start(t);
    } catch (e) {}
  }
  var phBlob = null, phUrl = '';
  function photoShoot() {
    var f = $('flash'); f.classList.remove('hidden'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); setTimeout(function () { f.classList.add('hidden'); }, 900);
    shutter();
    var cv = null; try { cv = scene && scene.capturePhoto && scene.capturePhoto(); } catch (e) { cv = null; }
    if (!cv) { toast('この端末では写真を作れませんでした'); return; }
    // 下に 店の名前と日付の帯
    var W = cv.width, H = cv.height, band = Math.round(W * 0.1), out = document.createElement('canvas'); out.width = W; out.height = H + band;
    var g = out.getContext('2d'); g.drawImage(cv, 0, 0);
    g.fillStyle = '#1c120c'; g.fillRect(0, H, W, band);
    g.fillStyle = '#c8261c'; g.fillRect(0, H, W, Math.max(4, band * 0.06));
    var d = new Date(), ds = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    g.fillStyle = '#f3e6cc'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(band * 0.42) + 'px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
    g.fillText('🏮 ' + shopName(), band * 0.35, H + band * 0.54);
    g.textAlign = 'right'; g.font = Math.round(band * 0.32) + 'px sans-serif'; g.fillText(ds, W - band * 0.35, H + band * 0.54);
    out.toBlob(function (blob) {
      if (!blob) return;
      phBlob = blob; if (phUrl) URL.revokeObjectURL(phUrl); phUrl = URL.createObjectURL(blob);
      setTimeout(function () {
        $('pbImg').src = phUrl; $('photoBox').classList.remove('hidden');
        $('pbNote').textContent = /Line\//i.test(navigator.userAgent) ? 'LINE の中では「保存」が効かないことがあります。写真を長押しして保存してください。' : (OWNER_MODE ? 'この写真は、大将のスマホの「🏮 店主 → 📸 記念写真」にも ' + PH.KEEP_DAYS + '日間 とっておきます。' : '保存して、みんなに送ってください。');
      }, 700);
      if (OWNER_MODE) photoSave(blob);
    }, 'image/jpeg', 0.9);
  }
  function photoName() { var d = new Date(); return 'izakaya-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.jpg'; }
  function saveBlob(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
  function shareBlob(blob, name) {
    var file = null; try { file = new File([blob], name, { type: 'image/jpeg' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: shopName() + 'の記念写真' }).catch(function () {});
    else { saveBlob(blob, name); toast('共有が使えないので、保存しました'); }
  }
  $('pbSave').onclick = function () { if (phBlob) saveBlob(phBlob, photoName()); };
  $('pbShare').onclick = function () { if (phBlob) shareBlob(phBlob, photoName()); };
  $('pbClose').onclick = function () { $('photoBox').classList.add('hidden'); };
  /* 大将のスマホに とっておく(IndexedDB)。KEEP_DAYS 日すぎたら 開いたときに自動で消す */
  function photoDB(fn) {
    try { var r = indexedDB.open('izakaya-photos', 1); r.onupgradeneeded = function () { r.result.createObjectStore('p', { keyPath: 'at' }); }; r.onsuccess = function () { fn(r.result); }; r.onerror = function () { fn(null); }; } catch (e) { fn(null); }
  }
  function photoSave(blob) { photoDB(function (db) { if (!db) return; try { db.transaction('p', 'readwrite').objectStore('p').put({ at: Date.now(), blob: blob, shop: shopName() }); } catch (e) {} }); }
  function photoAll(fn) {
    photoDB(function (db) {
      if (!db) return fn([]);
      var out = [], cut = Date.now() - PH.KEEP_DAYS * DAY, tx = db.transaction('p', 'readwrite'), st = tx.objectStore('p');
      st.openCursor().onsuccess = function (e) { var c = e.target.result; if (c) { if (c.value.at < cut) c.delete(); else out.push(c.value); c.continue(); } else fn(out.reverse()); };
    });
  }
  function photoDel(at, fn) { photoDB(function (db) { if (!db) return fn(); var tx = db.transaction('p', 'readwrite'); tx.objectStore('p').delete(at); tx.oncomplete = fn; }); }
  var phThumbs = [];
  function photosSheetFill() {
    photoAll(function (list) {
      if (sheetKind !== 'photos') return;
      phThumbs.forEach(function (u) { URL.revokeObjectURL(u); }); phThumbs = [];
      var body = $('shBody'), h = '<p class="small-note">撮った記念写真は、このスマホの中だけに とっておきます(お店のネットには置きません)。' + PH.KEEP_DAYS + '日たつと自動で消えます。</p>';
      if (!list.length) h += '<div class="li"><div class="t"><small>まだありません</small></div></div>';
      h += '<div class="ph-list">';
      list.forEach(function (p, i) {
        var u = URL.createObjectURL(p.blob); phThumbs.push(u);
        var d = new Date(p.at), left = Math.max(0, Math.ceil((p.at + PH.KEEP_DAYS * DAY - Date.now()) / DAY));
        h += '<div class="ph-item"><img src="' + u + '" alt="記念写真"><div class="ph-meta">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + '<small>あと' + left + '日で消えます</small></div>' +
          '<div class="btn-row"><button data-psave="' + i + '">保存</button><button data-pshare="' + i + '">共有</button><button class="red" data-pdel="' + i + '">削除</button></div></div>';
      });
      body.innerHTML = h + '</div>'; body._h = '';
      body.querySelectorAll('[data-psave]').forEach(function (b) { b.onclick = function () { var p = list[+b.getAttribute('data-psave')]; saveBlob(p.blob, 'izakaya-' + p.at + '.jpg'); }; });
      body.querySelectorAll('[data-pshare]').forEach(function (b) { b.onclick = function () { var p = list[+b.getAttribute('data-pshare')]; shareBlob(p.blob, 'izakaya-' + p.at + '.jpg'); }; });
      body.querySelectorAll('[data-pdel]').forEach(function (b) { b.onclick = function () { var p = list[+b.getAttribute('data-pdel')]; if (confirm('この写真を消しますか?(もとに戻せません)')) photoDel(p.at, photosSheetFill); }; });
    });
  }

  $('bMenu').onclick = function () { if (!OWNER_MODE && mySeat < 0) { toast('先に席に座ってください'); return; } openSheet('menu'); };
  $('bMusic').onclick = function () { openSheet('music'); };
  $('nowPlaying').onclick = function () { openSheet('music'); };
  /* 大将だけ: 今の曲・動画を取り消して次へ */
  var skipAt = 0;
  function ownerSkip() {
    if (!OWNER_MODE || Date.now() - skipAt < 1500) return; skipAt = Date.now();
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

  /* ---------------- 常連の女の子(ボット)「アイ」 ----------------
     お客さん(人)が1人以下の時、3分たったら 奥から2番目の席に来る。2人以上になったら 少しして帰る。
     店を回す人(まとめ役)のスマホが 1台だけで動かす(tick から)。記録は members/reg-ai(bot:true, regular:true)。
     自分から乾杯はしない(ほかの人の乾杯には加わる)・記念撮影に写らない・話しかけられたら「ありがとう、よろしくね」。
     注文 → 少しずつ食べる・飲む → 食べ終わったら たまに「うまい」「おいしい」→ お皿は大将(自動)が下げる */
  var REG = Object.assign({ NAME: 'アイちゃん', CALL: ['アイ'], MAX_GUESTS: 2, GAME_MIN: [2, 5], GAME_RATE: [0.4, 0.7], HAIR: '#c4a27e', FITS: [], ACCS: [], VOICE: '', WAIT_MIN: 3, SEAT: 1, LEAVE_SEC: [20, 40], TALK: {},
    EAT_SEC: [50, 65], ORDER_SEC: [90, 170], FIRST_ORDER_SEC: [15, 35], TALK_MIN: [6, 11] }, SHOP.REGULAR || {});
  var regGameAt = 0, regGaming = 0;   // 常連の子の ミニゲーム
  var REG_UID = 'reg-ai', regTried = 0, regSince = 0, regLeaveAt = 0, regNext = 0, regTalkAt = 0, regThanks = {}, regSeen = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function regMember() { var m = members()[REG_UID]; return m && m.name ? m : null; }
  function regSeat() { var m = regMember(); return m && okSeat(m.seat) && seatUid(m.seat) === REG_UID ? m.seat : -1; }
  function realGuests() { var ms = members(); return Object.keys(ms).filter(function (u) { var m = ms[u]; return m.name && !m.owner && !m.bot && (fresh(m) || away(m)); }).length; }
  function anyHuman() { var ms = members(); return Object.keys(ms).some(function (u) { var m = ms[u]; return m.name && !m.bot && fresh(m); }); }
  /* 顔・髪型・髪の色・前髪のヘアピンは いつも同じ(覚えてもらえるように。ふつうの可愛い女の子で、ロボットっぽくしない。ノブさん 2026-11-21)。
     服は お客さんと同じ服から毎回1つ(おそろいになることもある)+ ときどき アイちゃんだけの服。小物も毎回ちがう */
  function pickOne(L) { return L[Math.floor(Math.random() * L.length)]; }
  function regAvatar() {
    var base = Object.assign(JSON.parse(JSON.stringify((AVATAR.PRESETS.f || [])[1] || AVATAR.random('f'))), REG.FACE || {});   // 顔・髪型は REG.FACE(ノブさんが選んだ)
    base.sex = 'f'; base.owner = false; base.special = 'ai'; base.acc = 'none';
    var a = AVATAR.fix(base); a.special = 'ai'; a.aiHair = REG.HAIR; if (REG.FACE && REG.FACE.aiEyes) a.aiEyes = 1;
    var fit = (REG.FITS || []).length ? pickOne(REG.FITS) : ['turtle2', 'paleB'];
    a.aiFit = fit[0]; a.topColor = pickOne(REG.PALE || ['#f3efe8']);
    if (fit[1] === 'paleB') a.aiCol2 = pickOne(REG.PALE_B || ['#cfc4b4']); else if (fit[1] === 'calm') a.aiCol2 = pickOne(REG.CALM || ['#7a7a82']);
    if (fit[0] === 'quilt') a.aiCol3 = pickOne(['#c8bca8', '#cdd2da', '#ccd9c2', '#ddd0c0']);   // ベストの色
    var open = (REG.OPEN || []).indexOf(fit[0]) >= 0, noNeck = (REG.NO_NECK || []).indexOf(fit[0]) >= 0;
    if ((REG.NECKS || []).length && (open || (!noNeck && Math.random() < 0.3))) a.aiNeck = pickOne(REG.NECKS);   // 胸元が開いた服は必ず
    if ((REG.RIBBONS || []).length && Math.random() < (REG.RIBBON_RATE == null ? 0.8 : REG.RIBBON_RATE)) {
      a.aiRibbon = pickOne(REG.RIBBONS); var rc = (REG.RIBBON_COLORS || ['#2c3550']).filter(function (c) { return c !== a.topColor; }); a.aiRibbonC = pickOne(rc.length ? rc : REG.RIBBON_COLORS);
    }
    var mo = new Date(now() + JST).getUTCMonth() + 1, winter = mo === 12 || mo <= 2;
    var accs = (REG.ACCS || []).filter(function (x) { return (x !== 'muffler' || winter) && (x !== 'flower' || !a.aiRibbon); });
    if (accs.length && Math.random() < 0.3) a.aiAcc = pickOne(accs);   // そのほかの小物は ときどき
    if (REG.VOICE) a.voice = REG.VOICE;
    return a;
  }
  function regPhrase(id) { var m = regMember(), k = regSeat(); if (!m || k < 0) return; net.push('events', { type: 'phrase', id: id, seat: k, at: TS, by: REG_UID, voice: m.voice || '' }); }
  /* 言葉の種類から1つ選んで言う。kind: idle / eat / hello / bye / thanks / kanpai / owner / winter / summer / spring */
  var regLast = '';
  function regLine(kind, to, filter) { var L = (REG.TALK || {})[kind] || []; if (filter) L = L.filter(filter); if (L.length > 1) L = L.filter(function (x) { return x[0] !== regLast; }); if (!L.length) return false; var x = L[Math.floor(Math.random() * L.length)]; regLast = x[0]; regSay(x[1], to, x[0]); return true; }   // 同じ言葉を続けて言わない
  /* 自分から話す(ノブさん 2026-11-21「2分に1回くらい。1・5・10分も選べるように。お客さんに話しかけたり 大将に話したり を多めに」) */
  var regOnce = {};   // 来ている間に 1回だけ言う言葉(金曜・夜おそく・ラストオーダー前・年末)
  function regEvery() { var v = +((tree.state || {}).aiTalk) || (LOCAL ? 0.5 : REG.TALK_EVERY || 2); return (LOCAL ? [0.5, 1, 2, 5, 10] : [1, 2, 5, 10]).indexOf(v) >= 0 ? v : 2; }   // おためし版は はじめ30秒に1回(ノブさん 2026-11-21「お試し版では30秒に1回」)
  function regGap() { return regEvery() * MIN * rnd(0.75, 1.25); }   // きっちり同じ間にしない
  function lastHumanTalk() { var c = tree.chat || {}, t = 0; Object.keys(c).forEach(function (k) { var m = c[k]; if (m && !m.sys && m.uid !== REG_UID && (m.at || 0) > t) t = m.at; }); return t; }
  function regTalk(n) {
    if (now() - lastHumanTalk() < (LOCAL ? 8000 : 30000)) { regTalkAt = n + (LOCAL ? 5000 : 20000); return; }   // だれかが話している最中は 待つ(割りこまない。おためし版は短め)
    regTalkAt = n + regGap();
    var jst = new Date(now() + JST), st = status(n), soon = st && st.phase === 'open' && st.end && st.end - now() < 15 * MIN;
    var once = function (k) { if (regOnce[k]) return false; if (regLine(k)) { regOnce[k] = 1; return true; } return false; };
    if (soon && once('lo')) return;   // 閉店の15分前から「もうすぐラストオーダーかな」
    var r = Math.random(), guests = Object.keys(members()).filter(function (u) { var m = members()[u]; return m.name && !m.owner && !m.bot && (fresh(m) || away(m)) && okSeat(m.seat); });
    if (r < 0.15 && ((jst.getUTCDay() === 5 && once('fri')) || (jst.getUTCHours() >= 21 && once('late')) || (jst.getUTCMonth() === 11 && once('dec')) || (regSeason() && Math.random() < 0.4 && regLine(regSeason())))) return;   // 曜日・時間・季節の言葉(ときどき)
    if (r < 0.6 && guests.length) { var to = members()[guests[Math.floor(Math.random() * guests.length)]].seat; if (regLine('ask', to)) return; }   // お客さんへの話しかけ(多め)
    if (r < 0.82 && ownerPresent() && regLine('owner', 'owner')) return;   // 大将へ
    regLine('idle');
  }
  function regSeason() { var mo = new Date(now() + JST).getUTCMonth() + 1; return mo === 12 || mo <= 2 ? 'winter' : mo <= 5 ? 'spring' : mo <= 8 ? 'summer' : ''; }
  var regSayNext = 0;
  function regSay(text, to, ai) {   // ai: アイちゃんの声のファイル名(voice/ai/<ai>.m4a)。言葉が重ならないよう、前の言葉から 3.5秒あけて 順番に(ノブさん 2026-11-21)
    var t = Date.now(), at = Math.max(t, regSayNext); regSayNext = at + 3500;
    setTimeout(function () { var m = regMember(), k = regSeat(); if (!m || k < 0) return; var c = { uid: REG_UID, name: m.name, seat: k, text: text, at: TS }; if (to != null) c.to = to; if (ai) c.ai = ai; net.push('chat', c); }, at - t);
  }   // ai: アイちゃんの声のファイル名(voice/ai/<ai>.m4a)
  function regEnter(n) {
    var want = Math.min(Math.max(0, REG.SEAT), N - 1), seat = -1, res = reservationsNow();
    var order = [want]; for (var d = 0; d < N; d++) if (d !== want) order.push(d);   // 決まりは 奥から2番目。ふさがっていたら 奥(0番)から順に 空いた席(ノブさん 2026-11-21)
    for (var i = 0; i < order.length; i++) { var k = order[i], u = seatUid(k); if ((!u || !members()[u]) && !res[k]) { seat = k; break; } }
    if (seat < 0) return false;
    var av = regAvatar();
    regGameAt = 0; regGaming = 0;
    net.set('members/' + REG_UID, { name: REG.NAME, avatar: av, at: TS, seen: TS, seat: seat, bot: true, regular: true, voice: av.voice || '' });
    net.set('seats/' + seat, REG_UID);
    net.push('events', { type: 'phrase', id: 'irasshai', seat: seat, at: TS, by: REG_UID });
    sys('🏮 ' + honor(REG.NAME) + 'が来店しました');
    var someone = realGuests() > 0; setTimeout(function () { regLine('hello', null, function (x) { return someone || x[0] !== 'c3'; }); }, rnd(3, 5) * 1000);   // 来たときの あいさつ
    regNext = n + rnd(REG.FIRST_ORDER_SEC[0], REG.FIRST_ORDER_SEC[1]) * 1000; regTalkAt = n + regGap(); regSeen = n; regOnce = {};
    return true;
  }
  function regLeave(quiet) {
    var m = regMember(), k = m && okSeat(m.seat) ? m.seat : -1;
    if (k >= 0 && seatUid(k) === REG_UID) { net.remove('seats/' + k); net.remove('tables/' + k); }
    Object.keys(tree.orders || {}).forEach(function (o) { if (tree.orders[o].uid === REG_UID) net.remove('orders/' + o); });
    net.remove('members/' + REG_UID);
    if (m && !quiet) sys(honor(m.name) + 'がお帰りになりました');
    regLeaveAt = 0; regSince = 0; regGameAt = 0; regGaming = 0;
  }
  function regTick(n) {   // まとめ役のスマホで 1秒ごと
    if (DEMO) return;
    var m = regMember(), k = regSeat(), guests = realGuests(), human = anyHuman();
    var s = status(n), open = LOCAL || s.phase === 'open';
    if (!m) {
      if (members()[REG_UID]) net.remove('members/' + REG_UID);   // 名前のない記録の片づけ
      var md0 = regMode();
      if (open && human && md0 === 'stay') { if (n - regTried > 5000) { regTried = n; regEnter(n); } return; }   // 大将が呼んだ → すぐ来る
      if (open && human && md0 !== 'away' && guests <= REG.MAX_GUESTS) { if (!regSince) regSince = n; if (n - regSince >= (LOCAL ? 20000 : REG.WAIT_MIN * MIN)) regEnter(n); }   // おためし版は 20秒で来る(ノブさん 2026-11-21。本番は WAIT_MIN 分)
      else regSince = 0;
      return;
    }
    var md = regMode();
    if (md === 'away' && regLeaveAt >= 0) { regLine('bye'); regLeaveAt = -1; setTimeout(function () { if (regMember()) regLeave(false); }, 2500); return; }   // 大将が帰した
    if (k < 0) { regLeave(true); return; }   // 席がなくなった(片づけられた)
    if (!human || !open) { regLeave(false); return; }   // だれもいない・閉店
    if (n - regSeen > 15000) { regSeen = n; net.update('members/' + REG_UID, { seen: TS }); }
    if (!regNext) regNext = n + rnd(REG.FIRST_ORDER_SEC[0], REG.FIRST_ORDER_SEC[1]) * 1000;   // まとめ役が代わったとき
    if (!regTalkAt) regTalkAt = n + regGap();
    if (m.name !== REG.NAME) net.update('members/' + REG_UID, { name: REG.NAME });
    // ミニゲーム: いる間に 1回だけ遊ぶ(30秒「ゲーム中」→ ほどほどの点数)。お客さんがゲーム中のときは待つ
    if (!regGameAt) regGameAt = n + rnd(REG.GAME_MIN[0], REG.GAME_MIN[1]) * MIN;
    if (regGameAt > 0 && n >= regGameAt && !regGaming && guests <= REG.MAX_GUESTS && !phOn && window.IZGAME) { regGaming = n; net.update('members/' + REG_UID, { game: TS }); if (ownerPresent()) regLine('game', 'owner'); }   // 大将がいたら「大将、ゲームやってもいいですか？」
    if (regGaming && n - regGaming > IZGAME.SEC * 1000 + 1500) {
      regGaming = 0; regGameAt = -1; net.update('members/' + REG_UID, { game: null });
      var mx = IZGAME.maxScore(gameKey()), sc = Math.round(mx * rnd(REG.GAME_RATE[0], REG.GAME_RATE[1]) / 5) * 5;
      postScore(REG_UID, REG.NAME, sc);
    }   // 名前を変えたとき(前の記録)
    // MAX_GUESTS 人より多くなった → 少しして「そろそろ帰るね」
    if (guests > REG.MAX_GUESTS && md !== 'stay') {   // 大将が呼んだときは 多くても帰らない
      if (!regLeaveAt) regLeaveAt = n + rnd(REG.LEAVE_SEC[0], REG.LEAVE_SEC[1]) * 1000;
      else if (n >= regLeaveAt && regLeaveAt > 0) { regLine('bye'); regLeaveAt = -1; setTimeout(function () { if (regMember()) regLeave(false); }, 2500); }
      return;
    } else if (regLeaveAt > 0) regLeaveAt = 0;
    if (regLeaveAt < 0) return;
    // 食べる・飲む: 出てきてから 少しずつ(2回で空になる)
    tableItems(k).forEach(function (x) {
      if (x.empty) return;
      var it = menuItem(x.id), drink = it && it.kind === 'drink', gap = (drink ? REG.EAT_SEC[0] : REG.EAT_SEC[1]) * 1000 * (1 + (x.key.charCodeAt(x.key.length - 1) % 7) * 0.05);
      if (n < x.at + (x.bites + 1) * gap) return;
      var up = { bites: x.bites + 1 }; if (up.bites >= 2) up.emptyAt = TS;
      net.update('tables/' + k + '/' + x.key, up);
      if (up.bites >= 2 && Math.random() < (drink ? 0.25 : 0.6)) setTimeout(function () { if (Math.random() < 0.6 || !regLine('eat')) regLine('yum'); }, 1200);   // 食べ終わったら たまに(「うまい」「おいしい」の声 か、ほかの言葉)
    });
    // 注文: 飲み物がなければ飲み物、料理が1つもなければ料理(一定のリズムで)
    if (n >= regNext) {
      regNext = n + rnd(REG.ORDER_SEC[0], REG.ORDER_SEC[1]) * 1000;
      var c = seatCounts(k), ML = SHOP.MENU.filter(inMode), pick = null;
      if (c.drink < (SHOP.DRINK_LIMIT || 1)) { var D = ML.filter(function (x) { return x.kind === 'drink'; }); pick = D[Math.floor(Math.random() * D.length)]; }
      else if (c.food < 1) { var F = ML.filter(function (x) { return x.kind !== 'drink'; }); pick = F[Math.floor(Math.random() * F.length)]; }
      if (pick && !whyNot(k, pick.id)) { net.push('orders', { uid: REG_UID, name: m.name, seat: k, item: pick.id, at: TS }); net.push('events', { type: 'order', seat: k, item: pick.id, at: TS, by: REG_UID }); }
    }
    // たまに ひとこと(少なめ)
    if (n >= regTalkAt) regTalk(n);   // 自分から話す(間かくは 大将が選べる。お客さんが話している間は 少し待つ)
    // お祝いの日は 仮装(かわいく。なければ その日の帽子)
    var ck = celebKind(); if (ck && !cosOf(REG_UID, m)) { var d0 = SHOP.CELEBRATE[ck]; net.update('members/' + REG_UID, { costume: ck + '/' + d0.hats[0][0] + '||' }); }
  }
  /* 話しかけられたら(その子あて・名前が入っている)→ 少しして 必ず「ありがとう」の入った ひとこと(続けて送られた分は 6秒に1回) */
  function regHear(msg) {
    if (!amLeader() || !msg || msg.uid === REG_UID || msg.sys) return;
    var k = regSeat(); if (k < 0) return;
    var tx = String(msg.text || ''); if (!(msg.to === k || [REG.NAME].concat(REG.CALL || []).some(function (w) { return w && tx.indexOf(w) >= 0; }))) return;
    var key = msg.uid || msg.name, n = now(); if (regThanks[key] && n - regThanks[key] < 6000) return; regThanks[key] = n;   // 話しかけられたら 毎回(続けて送られた分は 6秒に1回)お礼(ノブさん 2026-11-21「必ず ありがとうと言ってもらいたい」。前は 同じ人に2分に1回)
    setTimeout(function () { regLine('thanks', msg.seat, function (x) { return x[1].indexOf('ありがとう') >= 0; }); }, rnd(2, 4) * 1000);   // 「ありがとう」が入った言葉だけ
  }

  /* ---------------- おためし客(おためしモードだけ) ---------------- */
  var bots = {};
  var BOT_NAMES = ['たけし', 'みゆき', 'ゆうじ', 'さとみ', 'げんさん', 'あやか', 'こうへい', 'まり'];
  var BOT_LINES = ['今日も一日おつかれさまでした！', '大将、いつもの！', 'ここの焼き鳥、ほんとにうまいんだよね', '最近ちょっと仕事がいそがしくて…', 'この曲いいですね', '週末なにしてました？', 'ちょっと相談してもいいですか？', 'あー、生き返る〜', 'はじめて来ました、よろしくお願いします'];
  function addBot() {
    var free = []; for (var i = 0; i < N; i++) if (!seatUid(i) || !fresh(members()[seatUid(i)])) free.push(i);
    if (!free.length) { toast('満席です'); return; }
    var seat = free[0], uid = 'bot-' + Math.random().toString(36).slice(2, 8);
    var used = {}; Object.keys(members()).forEach(function (u) { used[members()[u].name] = 1; });
    var free2 = BOT_NAMES.filter(function (n) { return !used[n]; }), name = (free2.length ? free2 : BOT_NAMES)[Math.floor(Math.random() * (free2.length || BOT_NAMES.length))];   // 名前は かぶらせない
    var av = AVATAR.random();
    bots[uid] = { seat: seat, name: name, next: Date.now() + 3000 + Math.random() * 5000 };
    net.set('members/' + uid, { name: name, avatar: av, at: TS, seen: TS, seat: seat, bot: true, voice: av.voice });
    net.set('seats/' + seat, uid);
    net.push('events', { type: 'phrase', id: 'irasshai', seat: seat, at: TS, by: uid });
  }
  function botTick() {
    Object.keys(bots).forEach(function (uid) { if (members()[uid]) net.update('members/' + uid, { seen: TS }); else delete bots[uid]; });
    var ck = celebKind();   // おためし客も お祝いの日は 仮装する
    if (ck) Object.keys(bots).forEach(function (uid) { var m = members()[uid], d = SHOP.CELEBRATE[ck]; if (!m || cosOf(uid, m) || Math.random() < 0.3) return;
      var h = d.hats[Math.floor(Math.random() * d.hats.length)][0], fc = Math.random() < 0.4 ? SHOP.FACES[Math.floor(Math.random() * SHOP.FACES.length)][0] : '';
      net.update('members/' + uid, { costume: ck + '/' + h + '|' + fc + '|' }); });
  }
  setInterval(function () {
    if (!inside) return;
    var t = Date.now();
    Object.keys(bots).forEach(function (uid) {
      var b = bots[uid]; if (t < b.next) return;
      b.next = t + 7000 + Math.random() * 9000;
      var r = Math.random();
      if (r < 0.62) net.push('chat', { uid: uid, name: b.name, seat: b.seat, text: BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)], at: TS });
      else if (r < 0.82) { var ML = SHOP.MENU.filter(inMode), it = ML[Math.floor(Math.random() * ML.length)]; if (whyNot(b.seat, it.id)) return; net.push('orders', { uid: uid, name: b.name, seat: b.seat, item: it.id, at: TS }); net.push('events', { type: 'order', seat: b.seat, item: it.id, at: TS, by: uid }); }
      else net.push('events', { type: 'phrase', id: Math.random() < 0.6 ? 'kanpai' : 'umai', seat: b.seat, at: TS, by: uid, voice: (members()[uid] && members()[uid].voice) || '' });
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
    html += '<div class="rs-me"><canvas id="rsFace" width="96" height="96"></canvas><div><b>' + esc(sama(ME.name)) + '</b><small>この名前とアバターで予約します</small></div><button id="rsAv">アバターを変える</button></div>';
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
        html += '<button class="' + cls + '" data-k="' + s.key + '" data-i="' + i + '">' + (i + 1) + '番<br>' + (x ? (x.uid === ME.uid ? 'あなた' : esc(sama(x.name))) : (seated ? '来店中' : '空き')) + '</button>';
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
    { name: '小物', build: function () { return opts('小物', 'acc') + (AVATAR.ACC_COLOR.indexOf(draft.acc) >= 0 ? swatch('小物の色', 'accColor', AVATAR.CLOTH_COLOR) : ''); } },
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
  var NOBU_TABS = [   // 大将ノブ(ノブさん本人): 顔・目・髪は 決まっているので出さない(11-21 ノブさん)。服・頭と前掛け・声だけ
    { name: 'おまかせ', build: function () {
      var h = '<div class="mk-sex">大将ノブのアバター</div><div class="mk-sec">大将の着こなし</div><div class="presets">';
      OWNER_PRESETS.forEach(function (p, i) { h += '<button data-opreset="' + i + '">' + esc(p.name) + '</button>'; });
      return h + '</div><div class="mk-sec">顔と髪型は 大将ノブ専用に決まっています(お客さんとは かぶりません)。服・頭・前掛け・声を選べます</div>';
    } },
    OWNER_TABS[4], OWNER_TABS[5], OWNER_TABS[6]
  ];
  function nobuFixed() { return OWNER_MODE && ROLE === 'nobu' && !!SHOP.NOBU_FACE && !!draft && draft.sex === 'm'; }
  function tabs() { return nobuFixed() ? NOBU_TABS : OWNER_MODE ? OWNER_TABS : GUEST_TABS; }
  var voiceTab = null;
  function voiceLabel(v) { return v.rec ? v.name : (v.sex === 'm' ? '男性・' : v.sex === 'f' ? '女性・' : 'キャラ・') + v.name; }
  function sizeVoice() {
    var h = '<div class="mk-sec">体の大きさ</div><input type="range" id="mkSize" min="' + AVATAR.SIZE_MIN + '" max="' + AVATAR.SIZE_MAX + '" step="0.01" value="' + draft.size + '">';
    var L = AVATAR.voiceList(OWNER_MODE), cur = AVATAR.voiceOf(draft.voice, OWNER_MODE);
    var tabs = OWNER_MODE ? [['m', '男性'], ['f', '女性']] : [['m', '男性'], ['f', '女性'], ['c', 'キャラ']];
    if (!voiceTab) voiceTab = cur.sex === 'c' ? 'c' : (cur.sex || draft.sex || 'm');
    var S = OWNER_MODE ? [['irasshai', 'いらっしゃい'], ['haiyo', 'はいよ']] : [['kanpai', 'かんぱーい'], ['g_sorena', 'それな']];
    h += '<div class="mk-sec">「乾杯」などの声(' + L.length + '種類) ・ いまの声: <b>' + esc(voiceLabel(cur)) + '</b></div>';
    h += '<div class="opts vc-tabs">' + tabs.map(function (t) { return '<button data-vtab="' + t[0] + '" class="' + (voiceTab === t[0] ? 'on' : '') + '">' + t[1] + '(' + L.filter(function (v) { return v.sex === t[0]; }).length + ')</button>'; }).join('') + '</div>';
    h += '<div class="vc-grid">' + L.filter(function (v) { return v.sex === voiceTab; }).map(function (v) {
      return '<div class="vc' + (cur.id === v.id ? ' on' : '') + '" data-voice="' + v.id + '"><b>' + esc(v.name) + (cur.id === v.id ? ' ✓' : '') + '</b><div class="vc-btns">' +
        S.map(function (x) { return '<button data-vs="' + v.id + '|' + x[0] + '">▶ ' + x[1] + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    return h + '<div class="mk-sec">▶ で声が聞けます。カードを押すと その声に決まります。' + (OWNER_MODE ? '大将の声は、大将用の言葉だけを話します(お客さんとは別の声です)。「ノブの声(録音)」は、録音してある言葉だけノブさんの声で、ほかは どっしりした男性の声になります。' : 'お客さんの声は、お客さん用の言葉だけを話します。') + '</div>';
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
    if (OWNER_MODE) { var o = JSON.parse(JSON.stringify(AVATAR.OWNER)); o.sex = sx; if (sx === 'f') { var fp = OWNER_PRESETS_F[0]; o.hair = 'bun'; o.bangs = 'seethrough'; o.eyes = 'big'; o.brows = 'soft'; o.mouth = 'smile'; o.face = 'egg'; o.skin = 1; o.hairColor = 1; o.lip = 1; o.cheek = 2; o.size = 1; o.voice = 'o_leda'; o.top = fp.top; o.topColor = fp.topColor; o.head = fp.head; o.apron = fp.apron; } draft = AVATAR.fix(o); }
    else { var p = JSON.parse(JSON.stringify(AVATAR.PRESETS[sx][0])); p.sex = sx; p.voice = sx === 'f' ? 'g_zephyr' : 'g_puck'; draft = AVATAR.fix(p); }
    if (keep.size) draft.size = keep.size;
    mkTab = 0; sexStep = false; updateDraft(); renderMaker();
  }
  var sexStep = false;
  function openMaker() {
    var cur = myAvatar();
    draft = cur ? AVATAR.fix(JSON.parse(JSON.stringify(cur))) : null;
    sexStep = !draft;
    $('maker').dataset.back = inside ? 'shop' : 'entrance';
    if (inside) { setKigae(true); closeSheet(); closeWho(); document.body.classList.add('kigae-on'); }
    $('entrance').classList.add('hidden');
    $('maker').classList.remove('hidden');
    document.querySelector('.mk-title').textContent = OWNER_MODE ? '大将のアバターを作る' : 'アバターを作る';
    var startPreview = function () {
      if (!window.IZ3D) return;
      if (!preview) preview = window.IZ3D.createPreview($('preview'));
      if (draft) preview.setAvatar(OWNER_MODE ? nobuLook(draft) : draft); else preview.setAvatar(null);
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
    if (tbox.children.length !== T.length || tbox._set !== T) { tbox._set = T; if (mkTab >= T.length) mkTab = 0;
      tbox.innerHTML = '';
      T.forEach(function (t, i) { var b = document.createElement('button'); b.textContent = t.name; b.onclick = function () { mkTab = i; renderMaker(); }; tbox.appendChild(b); });
    }
    Array.prototype.forEach.call(tbox.children, function (b, i) { b.classList.toggle('on', i === mkTab); });
    var keep = body.scrollTop;
    body.innerHTML = T[mkTab].build();
    body.scrollTop = keep;
    body.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { var kk = b.getAttribute('data-k'); draft[kk] = b.getAttribute('data-v'); if (kk === 'hair' && draft.sex === 'm' && AVATAR.HAIR_BANGS.m[draft.hair]) draft.bangs = AVATAR.HAIR_BANGS.m[draft.hair]; draft = AVATAR.fix(draft); updateDraft(); renderMaker(); }; });
    body.querySelectorAll('[data-voice]').forEach(function (b) {
      b.onclick = function () { draft.voice = b.getAttribute('data-voice'); draft = AVATAR.fix(draft); previewVoice(draft.voice, OWNER_MODE); updateDraft(); renderMaker(); };
    });
    body.querySelectorAll('[data-vs]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); var x = b.getAttribute('data-vs').split('|'); previewVoice(x[0], OWNER_MODE, x[1]); };
    });
    body.querySelectorAll('[data-vtab]').forEach(function (b) { b.onclick = function () { voiceTab = b.getAttribute('data-vtab'); renderMaker(); }; });
    body.querySelectorAll('[data-n]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-n'); draft[k] = +b.getAttribute('data-v'); draft = AVATAR.fix(draft);
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
  function updateDraft() { if (preview && draft) preview.setAvatar(OWNER_MODE ? nobuLook(draft) : draft); }
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
    document.body.classList.remove('kigae-on');
    if ($('maker').dataset.back === 'shop') { setKigae(false); if (!inside) $('maker').dataset.back = 'entrance'; }   // 着がえ中に 店を出された(閉店・帰ってもらった)ときは 入口へ
    if ($('maker').dataset.back !== 'shop') $('entrance').classList.remove('hidden');
    if (pendingEnter && myAvatar()) { pendingEnter = false; $('enterBtn').click(); }
    pendingEnter = false;
    if (pendingReserve) { pendingReserve = false; if (myAvatar()) { $('entrance').classList.add('hidden'); $('reserve').classList.remove('hidden'); renderReserve(); } }
  }
  var pendingEnter = false;
  $('mkBack').onclick = function () { pendingEnter = false; closeMaker(); };
  $('mkSave').onclick = function () {
    if (!draft) return;
    if (OWNER_MODE) { draft.owner = true; ownerAvatar = AVATAR.fix(draft); lsSet('iz-owner-avatar', ownerAvatar); if (inside) net.update('state', { ownerAvatar: nobuLook(ownerAvatar) }); }
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
  setTimeout(batonAutoEnter, 900);   // バトンタッチで開きなおしたときは 自動で店に入る
  window.IZ = { scene: function () { return scene; }, get tree() { return tree; }, get inside() { return inside; }, get seat() { return mySeat; }, net: function () { return net; }, addBot: addBot, status: status, upcoming: upcoming, voiceFiles: voiceFiles, reg: REG };
})();
