#!/usr/bin/env python3
"""お店の動画(js/config.js の VIDEOS)が 縦に撮った動画かを、YouTube の動画ページで確かめる。

  python3 tools/video-shape.py

YouTube の紹介情報(oembed)は どの動画も 横(200x113)と答えるので使えない。動画ページの中の 画質ごとの幅・高さを見る。
縦なのに tall: true が無い / 横なのに付いている ものを「直す」と出す。(2026-11-21 ノブさん「横長の動画だけど縦で撮っているもの」)
"""
import os, re, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
a = s.index('VIDEOS: ['); b = s.index('\n  ]', a)
for m in re.finditer(r"\{ id: '([^']+)',\s*src: '([^']+)', title: '([^']+)'([^}]*)\}", s[a:b]):
    vid, src, title, rest = m.groups()
    y = re.search(r'(?:youtu\.be/|v=|/shorts/)([A-Za-z0-9_-]{11})', src)
    if not y: print('  ?', title, '(YouTube ではない)'); continue
    req = urllib.request.Request('https://www.youtube.com/watch?v=' + y.group(1), headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja'})
    try:
        h = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
    except Exception as e:
        print('  ?', title, '(調べられない)', e); continue
    big = [(int(w), int(hh)) for w, hh in re.findall(r'"width":(\d+),"height":(\d+)', h) if int(w) >= 300 or int(hh) >= 300]
    if not big: print('  ?', title, '(大きさが見つからない)'); continue
    tall = big[0][1] > big[0][0]; mark = 'tall: true' in rest
    print(('○ ' if tall == mark else '× 直す ') + ('縦' if tall else '横'), title, big[0])
