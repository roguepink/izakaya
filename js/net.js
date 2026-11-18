'use strict';
/* =====================================================================
   つなぐ係 —— みんなのスマホで、同じお店の様子(席・会話・料理・曲)を分け合う。
   2つのやり方があり、使う側(app.js)からは同じように見える:
     ・おためしモード(LocalNet): 同じスマホ/パソコンの中だけ。タブを2つ開くと2人になる
     ・本番(FireNet): Google の Firebase(Realtime Database)を、部品なしで直接つなぐ
   お店のデータの形(1つのお店 = 1つの木):
     meta / state(営業・曲) / queue(リクエスト) / members(入っている人) / seats(席)
     chat(会話) / orders(注文) / tables(席に出ている料理) / events(乾杯などの合図) / reservations(予約)
   ===================================================================== */
var Net = (function () {

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function parts(path) { return String(path || '').split('/').filter(Boolean); }
  function getAt(tree, path) {
    var p = parts(path), cur = tree;
    for (var i = 0; i < p.length; i++) { if (cur == null || typeof cur !== 'object') return null; cur = cur[p[i]]; }
    return cur == null ? null : cur;
  }
  function prune(obj) {   // 中身が空になった枝を消す(Firebase と同じふるまい)
    if (!obj || typeof obj !== 'object') return obj;
    Object.keys(obj).forEach(function (k) {
      var v = prune(obj[k]);
      if (v == null || (typeof v === 'object' && Object.keys(v).length === 0)) delete obj[k]; else obj[k] = v;
    });
    return obj;
  }
  function setAt(tree, path, value) {
    var p = parts(path);
    if (!p.length) return value == null ? {} : clone(value);
    var cur = tree;
    for (var i = 0; i < p.length - 1; i++) {
      if (!cur[p[i]] || typeof cur[p[i]] !== 'object') cur[p[i]] = {};
      cur = cur[p[i]];
    }
    if (value == null) delete cur[p[p.length - 1]]; else cur[p[p.length - 1]] = clone(value);
    return prune(tree);
  }
  var PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  var lastPush = 0, lastRand = [];
  function pushId(now) {   // 時間の順に並ぶ名前(Firebase の push と同じ考え方)
    var dup = now === lastPush; lastPush = now;
    var s = '', t = now, i;
    for (i = 7; i >= 0; i--) { s = PUSH_CHARS.charAt(t % 64) + s; t = Math.floor(t / 64); }
    if (!dup) { for (i = 0; i < 12; i++) lastRand[i] = Math.floor(Math.random() * 64); }
    else { for (i = 11; i >= 0 && lastRand[i] === 63; i--) lastRand[i] = 0; lastRand[i]++; }
    for (i = 0; i < 12; i++) s += PUSH_CHARS.charAt(lastRand[i]);
    return s;
  }
  function resolveServer(v, now) {   // {".sv":"timestamp"} を時刻に置きかえる
    if (v && typeof v === 'object') {
      if (v['.sv'] === 'timestamp') return now;
      var o = Array.isArray(v) ? [] : {};
      Object.keys(v).forEach(function (k) { o[k] = resolveServer(v[k], now); });
      return o;
    }
    return v;
  }

  /* ---------- 共通: 木を持って、変わったら知らせる ---------- */
  function Base() { this.tree = {}; this.subs = []; this.offset = 0; this.mode = ''; this.ready = false; }
  Base.prototype.now = function () { return Date.now() + this.offset; };
  Base.prototype.TS = { '.sv': 'timestamp' };
  Base.prototype.get = function (path) { return clone(getAt(this.tree, path)); };
  Base.prototype.on = function (fn) { this.subs.push(fn); if (this.ready) fn(this.tree, ['*']); };
  Base.prototype._emit = function (changed) {
    var t = this.tree; this.subs.forEach(function (fn) { try { fn(t, changed); } catch (e) { console.error(e); } });
  };
  Base.prototype.newKey = function () { return pushId(this.now()); };

  /* ---------- おためしモード ---------- */
  function LocalNet(room) {
    Base.call(this);
    this.mode = 'local';
    this.key = 'iz-local-' + room;
    var self = this;
    this._load();
    try {
      this.ch = new BroadcastChannel(this.key);
      this.ch.onmessage = function () { self._load(); self._emit(['*']); };
    } catch (e) {
      window.addEventListener('storage', function (ev) { if (ev.key === self.key) { self._load(); self._emit(['*']); } });
    }
    this.ready = true;
    setTimeout(function () { self._emit(['*']); }, 0);
  }
  LocalNet.prototype = Object.create(Base.prototype);
  LocalNet.prototype._load = function () {
    try { this.tree = JSON.parse(localStorage.getItem(this.key) || '{}') || {}; } catch (e) { this.tree = this.tree || {}; }
  };
  LocalNet.prototype._save = function (path) {
    try { localStorage.setItem(this.key, JSON.stringify(this.tree)); } catch (e) {}
    try { if (this.ch) this.ch.postMessage(1); } catch (e) {}
    this._emit([parts(path)[0] || '*']);
  };
  LocalNet.prototype.set = function (path, value) {
    this._load(); this.tree = setAt(this.tree, path, resolveServer(value, this.now())); this._save(path);
    return Promise.resolve();
  };
  LocalNet.prototype.update = function (path, obj) {
    this._load(); var self = this, now = this.now();
    Object.keys(obj).forEach(function (k) { self.tree = setAt(self.tree, path + '/' + k, resolveServer(obj[k], now)); });
    this._save(path); return Promise.resolve();
  };
  LocalNet.prototype.push = function (path, value) {
    var k = this.newKey(); this.set(path + '/' + k, value); return Promise.resolve(k);
  };
  LocalNet.prototype.remove = function (path) { return this.set(path, null); };
  LocalNet.prototype.leaveBeacon = function (path) { this.set(path, null); };

  /* ---------- 本番: Firebase Realtime Database(部品なし・REST と EventSource) ---------- */
  function FireNet(dbURL, room) {
    Base.call(this);
    this.mode = 'firebase';
    this.base = dbURL.replace(/\/+$/, '') + '/rooms/' + room;
    this.retry = 1000;
    this._listen();
    this._syncClock();
  }
  FireNet.prototype = Object.create(Base.prototype);
  FireNet.prototype._url = function (path) { return this.base + (path ? '/' + parts(path).join('/') : '') + '.json'; };
  FireNet.prototype._listen = function () {
    var self = this;
    try { if (this.es) this.es.close(); } catch (e) {}
    var es = this.es = new EventSource(this._url(''));
    function apply(ev, merge) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg) return;
      if (merge) {
        Object.keys(msg.data || {}).forEach(function (k) {
          self.tree = setAt(self.tree, (msg.path === '/' ? '' : msg.path) + '/' + k, msg.data[k]);
        });
      } else {
        self.tree = setAt(self.tree, msg.path, msg.data);
        if (!self.tree || typeof self.tree !== 'object') self.tree = {};
      }
      self.retry = 1000;
      var first = !self.ready; self.ready = true;
      self._emit(first ? ['*'] : [parts(msg.path)[0] || '*']);
    }
    es.addEventListener('put', function (ev) { apply(ev, false); });
    es.addEventListener('patch', function (ev) { apply(ev, true); });
    es.onerror = function () {
      if (es.readyState === 2) {   // 切れたら、少し待って つなぎなおす
        setTimeout(function () { self._listen(); }, self.retry);
        self.retry = Math.min(self.retry * 2, 20000);
      }
    };
  };
  FireNet.prototype._req = function (method, path, body) {
    return fetch(this._url(path), {
      method: method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }).then(function (r) { if (!r.ok) throw new Error('net ' + r.status); return r.json(); });
  };
  FireNet.prototype._syncClock = function () {   // サーバーの時計とのずれを測る(曲を全員でそろえるため)
    var self = this, t0 = Date.now();
    this._req('PUT', 'clock/' + Math.random().toString(36).slice(2, 10), { '.sv': 'timestamp' }).then(function (v) {
      var t1 = Date.now();
      if (typeof v === 'number') self.offset = v - (t0 + t1) / 2;
    }).catch(function () {});
    // 測るのに使った書きこみは すぐ消す
    setTimeout(function () { self._req('DELETE', 'clock').catch(function () {}); }, 3000);
  };
  FireNet.prototype.set = function (path, value) { return this._req('PUT', path, value); };
  FireNet.prototype.update = function (path, obj) { return this._req('PATCH', path, obj); };
  FireNet.prototype.push = function (path, value) {
    var k = this.newKey(); return this._req('PUT', path + '/' + k, value).then(function () { return k; });
  };
  FireNet.prototype.remove = function (path) { return this._req('DELETE', path); };
  FireNet.prototype.leaveBeacon = function (path) {   // 画面を閉じるときでも届くように
    try { fetch(this._url(path), { method: 'DELETE', keepalive: true }); } catch (e) {}
  };

  /* ---------- 合言葉 → 指紋 ---------- */
  function sha256(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.reject(new Error('no crypto'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function connect(room) {
    var url = (SHOP.FIREBASE && SHOP.FIREBASE.databaseURL) || '';
    if (url && !/[#&]local\b/.test(location.hash)) return new FireNet(url, room);
    return new LocalNet(room);
  }

  return { connect: connect, sha256: sha256, _pushId: pushId, _setAt: setAt };
})();
