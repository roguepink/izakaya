#!/usr/bin/env python3
"""ノブさんの声(録音ページ owner/rec.html の「まとめて送る」で出した zip)を、お店に取りこむ。

  python3 tools/import-nobu.py            … ドライブ「居酒屋ノブの声」のいちばん新しい zip
  python3 tools/import-nobu.py 〇〇.zip   … その zip

やること:
  1. zip の中の <言葉のid>.m4a / .webm / .ogg を取り出す(大将用の言葉 OWNER_PHRASES のものだけ)
  2. 前後の無音を切る・音の大きさをそろえる・AAC 40k モノラルの m4a にして voice/nobu/<id>.m4a へ
  3. js/config.js の NOBU_VOICE に、取りこんだ言葉の id を並べる
前に取りこんだ言葉は、新しい zip に無ければそのまま残す(新しい zip にあれば上書き)。
"""
import os, re, subprocess, sys, tempfile, zipfile, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRIVE = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-*/マイドライブ/居酒屋ノブの声')
OUT = os.path.join(ROOT, 'voice', 'nobu')
CONFIG = os.path.join(ROOT, 'js', 'config.js')


def owner_ids():
    s = open(CONFIG, encoding='utf-8').read()
    m = re.search(r'OWNER_PHRASES:\s*\[(.*?)\n  \]', s, re.S)
    return re.findall(r"id:\s*'([^']+)'", m.group(1)) if m else []


def newest_zip():
    zs = sorted(glob.glob(os.path.join(DRIVE, '*.zip')), key=os.path.getmtime)
    if not zs:
        sys.exit('ドライブの「居酒屋ノブの声」に zip がありません')
    return zs[-1]


def convert(src, dst):
    # 前後の無音(-45dB より小さい所)を切り、大きさをそろえて、AAC 40k モノラルに
    af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,'
          'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,'
          'loudnorm=I=-16:TP=-1.5:LRA=11')
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1',
                    '-af', af, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart', dst],
                   check=True)
    out = subprocess.run(['ffmpeg', '-i', dst], capture_output=True, text=True).stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out)
    return int(m.group(2)) * 60 + float(m.group(3)) if m else 0


def main():
    zp = sys.argv[1] if len(sys.argv) > 1 else newest_zip()
    ids = owner_ids()
    os.makedirs(OUT, exist_ok=True)
    got, skip = [], []
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(zp) as z:
        for n in z.namelist():
            base = os.path.basename(n)
            pid, ext = os.path.splitext(base)
            if ext.lower() not in ('.m4a', '.webm', '.ogg', '.mp4', '.wav'):
                continue
            if pid not in ids:
                skip.append(base); continue
            src = os.path.join(tmp, 'in' + ext.lower())
            with open(src, 'wb') as f:
                f.write(z.read(n))
            sec = convert(src, os.path.join(OUT, pid + '.m4a'))
            got.append((pid, sec))
    have = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.m4a'))
    have = [i for i in ids if i in have]   # 言葉の並び順で
    s = open(CONFIG, encoding='utf-8').read()
    s2 = re.sub(r"NOBU_VOICE:\s*\[[^\]]*\]", 'NOBU_VOICE: [' + ', '.join("'%s'" % i for i in have) + ']', s)
    open(CONFIG, 'w', encoding='utf-8').write(s2)
    print('取りこみ元:', os.path.basename(zp))
    for pid, sec in got:
        print('  ○ %-12s %.1f秒%s' % (pid, sec, '  ← 短すぎ(聞いて確かめる)' if sec < 0.4 else ''))
    for b in skip:
        print('  × %s(大将用の言葉にない名前なので飛ばした)' % b)
    print('ノブの声がある言葉: %d / %d' % (len(have), len(ids)))


if __name__ == '__main__':
    main()
