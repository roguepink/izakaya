#!/usr/bin/env python3
"""大将用のページ owner.html を index.html から作る(index.html を直したら、毎回これを動かす)。
   ・ホーム画面に入れると「居酒屋ノブ 大将」という別のアプリになる(アイコンに「大将」の帯)
   ・中身は同じ。window.IZ_OWNER = true で大将として動く
   使い方: python3 tools/make-owner.py """
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'index.html').read_text()
rep = [
    ('<title>居酒屋ノブ</title>', '<title>居酒屋ノブ 大将</title>'),
    ('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="owner/manifest.webmanifest">'),
    ('<link rel="apple-touch-icon" href="apple-touch-icon.png">', '<link rel="apple-touch-icon" href="owner/apple-touch-icon.png">'),
    ('<link rel="icon" href="icon-192.png">', '<link rel="icon" href="owner/icon-192.png">'),
    ('<meta name="apple-mobile-web-app-title" content="居酒屋ノブ">', '<meta name="apple-mobile-web-app-title" content="ノブ大将">'),
    ('<script src="js/config.js"></script>', '<script>window.IZ_OWNER = true;</script>\n<script src="js/config.js"></script>'),
    ("window.INSTALL_GATE = { id: 'izakaya', name: '居酒屋ノブ', icon: 'icon-192.png',", "window.INSTALL_GATE = { id: 'izakaya-owner', name: '居酒屋ノブ 大将', icon: 'owner/icon-192.png',"),
]
for a, b in rep:
    assert a in s, a
    s = s.replace(a, b)
s = re.sub(r"tagline: '[^']*'", "tagline: '大将の店に立つためのアプリ'", s, count=1)
s = re.sub(r"desc: '[^']*'", "desc: 'すべて無料です。居酒屋ノブの大将(お店の人)と、その回のマスター用です。お客さん用とは別のアプリとしてホーム画面に入ります。注文票・料理を出す・開け閉めができます。'", s, count=1)
s = re.sub(r"points: \[[^\]]*\]", "points: ['注文票と ベルの音で 注文が分かる', 'お客さんの席を押して 料理を出せる', '臨時の開店・閉店ができる']", s, count=1)
s = s.replace("playLabel: '▶ このまま入る'", "playLabel: '▶ このまま店に立つ'")
(root / 'owner.html').write_text('<!-- このファイルは tools/make-owner.py が index.html から作る。直接直さない -->\n' + s)
print('owner.html を作りました')
