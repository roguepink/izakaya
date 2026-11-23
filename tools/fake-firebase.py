# にせの Firebase Realtime Database(REST + EventSource)。本番のつなぎ方(FireNet)を 手元で試すため(11-22)
# 使い方: python3 tools/fake-firebase.py 8791 0.25  → config.js の databaseURL を http://127.0.0.1:8791 にした ページで試す(遅れ 0.25秒)
# 書きこみ・知らせに わざと 遅れ(LAT 秒)を入れる
import json, threading, time, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

LAT = float(sys.argv[2]) if len(sys.argv) > 2 else 0.15
lock = threading.Lock()
tree = {}
subs = []   # (wfile, lock)

def parts(p): return [x for x in p.split('/') if x]
def prune(o):
    if not isinstance(o, dict): return o
    for k in list(o.keys()):
        v = prune(o[k])
        if v is None or (isinstance(v, dict) and not v): del o[k]
        else: o[k] = v
    return o
def resolve(v, now):
    if isinstance(v, dict):
        if v.get('.sv') == 'timestamp': return now
        return {k: resolve(x, now) for k, x in v.items()}
    return v
def set_at(p, val):
    global tree
    ps = parts(p)
    if not ps: tree = val if isinstance(val, dict) else {}; return
    cur = tree
    for k in ps[:-1]:
        if not isinstance(cur.get(k), dict): cur[k] = {}
        cur = cur[k]
    if val is None: cur.pop(ps[-1], None)
    else: cur[ps[-1]] = val
    prune(tree)

def broadcast(ev, path, data):
    msg = ('event: %s\ndata: %s\n\n' % (ev, json.dumps({'path': path, 'data': data}))).encode()
    def send():
        time.sleep(LAT)
        dead = []
        for s in list(subs):
            try:
                with s[1]: s[0].write(msg); s[0].flush()
            except Exception: dead.append(s)
        for d in dead:
            if d in subs: subs.remove(d)
    threading.Thread(target=send, daemon=True).start()

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,PUT,PATCH,DELETE,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header('Content-Length', '0'); self.end_headers()
    def path_of(self):
        p = self.path.split('?')[0]
        assert p.endswith('.json'); p = p[:-5]
        ps = parts(p)   # rooms/<room>/...
        return '/'.join(ps[2:])
    def reply(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200); self.cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if 'text/event-stream' in (self.headers.get('Accept') or ''):
            self.send_response(200); self.cors(); self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-cache'); self.end_headers()
            with lock: snap = json.loads(json.dumps(tree))
            self.wfile.write(('event: put\ndata: %s\n\n' % json.dumps({'path': '/', 'data': snap})).encode()); self.wfile.flush()
            me = (self.wfile, threading.Lock()); subs.append(me)
            while me in subs:
                time.sleep(15)
                try:
                    with me[1]: self.wfile.write(b'event: keep-alive\ndata: null\n\n'); self.wfile.flush()
                except Exception: break
            return
        with lock:
            cur = tree
            for k in parts(self.path_of()): cur = cur.get(k) if isinstance(cur, dict) else None
        self.reply(cur)
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'null') if n else None
    def do_PUT(self):
        p = self.path_of(); v = self.body(); time.sleep(LAT)
        with lock:
            v = resolve(v, int(time.time() * 1000)); set_at(p, json.loads(json.dumps(v)))
        broadcast('put', '/' + p, v); self.reply(v)
    def do_PATCH(self):
        p = self.path_of(); v = self.body() or {}; time.sleep(LAT)
        with lock:
            v = resolve(v, int(time.time() * 1000))
            for k, x in v.items(): set_at(p + '/' + k, json.loads(json.dumps(x)))
        broadcast('patch', '/' + p, v); self.reply(v)
    def do_POST(self):   # 本物の Firebase と同じく ?x-http-method-override=DELETE|PATCH|PUT を受ける(sendBeacon 用)
        q = self.path.split('?', 1)[1] if '?' in self.path else ''
        m = dict(x.split('=', 1) for x in q.split('&') if '=' in x).get('x-http-method-override', '').upper()
        if m == 'DELETE': return self.do_DELETE()
        if m == 'PATCH': return self.do_PATCH()
        if m == 'PUT': return self.do_PUT()
        self.send_response(400); self.cors(); self.end_headers()
    def do_DELETE(self):
        p = self.path_of(); time.sleep(LAT)
        with lock: set_at(p, None)
        broadcast('put', '/' + p, None); self.reply(None)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
