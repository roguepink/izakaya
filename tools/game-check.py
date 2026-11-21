#!/usr/bin/env python3
"""ミニゲームの重さを測る(2026-11-22)。出す前に 毎回 これで合格を確かめる。
   使い方: ~/.local/venvs/ryokoshi/bin/python tools/game-check.py [ゲームの id ...](なしなら 全部)
   合格の目安: ファイル 60KB 以下 / スマホくらい(4倍おそく)でも なめらか(1秒に50回以上)/ 3回遊んでも メモリが ふえつづけない / エラー 0
"""
import functools, http.server, json, os, socketserver, sys, threading, re
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
cfg = open(os.path.join(ROOT, 'js/config.js'), encoding='utf-8').read()
ids = sys.argv[1:] or re.findall(r"\{ id: '([\w-]+)', name:", cfg[cfg.index('GAMES: ['):])
FPS = "new Promise(r=>{let n=0,t0=performance.now();function f(t){n++;if(t-t0<4000)requestAnimationFrame(f);else r(Math.round(n*1000/(t-t0)))}requestAnimationFrame(f)})"
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True, args=['--mute-audio'])
    for gid in ids:
        f = os.path.join(ROOT, 'games', gid + '.js'); kb = round(os.path.getsize(f) / 1024, 1) if os.path.exists(f) else -1
        c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        cdp = c.new_cdp_session(pg); cdp.send('Performance.enable'); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        heap = lambda: round({m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}['JSHeapUsedSize'] / 1048576, 1)
        pg.goto(f'http://127.0.0.1:{port}/tools/game-play.html?g={gid}'); pg.wait_for_timeout(2500)
        fps, mem = [], []
        for k in range(3):
            pg.evaluate("[...document.querySelectorAll('#izg .izg-go')].find(b=>/スタート|もう一回/.test(b.textContent)).click()"); pg.wait_for_timeout(1500)
            for j in range(6): pg.mouse.click(60 + j * 50, 400 + (j % 3) * 120); pg.wait_for_timeout(120)
            fps.append(pg.evaluate(FPS)); sec = pg.evaluate(f"IZGAME.sec('{gid}')"); pg.wait_for_timeout(int(sec * 1000))
            cdp.send('HeapProfiler.collectGarbage'); mem.append(heap())
        res = pg.evaluate("(document.querySelector('#izg .izg-panel')||{}).textContent||''")
        ok = 0 <= kb <= 60 and min(fps) >= 50 and not errs and mem[-1] <= mem[0] + 3 and 'おしまい' in res
        bad += not ok
        print(('○ 合格' if ok else '× だめ'), gid, f'ファイル {kb}KB ・ なめらかさ {fps}(1秒に何回)・ メモリ {mem}MB ・ エラー {len(errs)}', ('' if ok else ' ' + ' / '.join(errs[:3])))
        c.close()
    b.close()
sys.exit(1 if bad else 0)
