#!/usr/bin/env python3
"""ノブさんの声(録音ページ owner/rec.html の「まとめて送る」で出した zip)を、お店に取りこむ。

  python3 tools/import-nobu.py            … ドライブ「居酒屋ノブの声」のいちばん新しい zip と、そのまま送られた声のファイル(<言葉のid>.m4a など)
  python3 tools/import-nobu.py 〇〇.zip   … その zip
(録音ページは、zip が送れないスマホでは 声のファイルを1つずつ そのまま送る)

やること:
  1. zip の中の <言葉のid>.m4a / .webm / .ogg を取り出す(大将用の言葉 OWNER_PHRASES のものだけ)
  2. 前後の無音を切る・音の大きさをそろえる・AAC 40k モノラルの m4a にして voice/nobu/<id>.m4a へ
  3. js/config.js の NOBU_VOICE に、取りこんだ言葉の id を並べる
前に取りこんだ言葉は、新しい zip に無ければそのまま残す(新しい zip にあれば上書き)。
"""
import os, re, subprocess, sys, tempfile, zipfile, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def _drive():   # Google ドライブ(パソコン版)の「マイドライブ/居酒屋ノブの声」。アカウント名は書かない(公開の置き場なので)
    for d in sorted(glob.glob(os.path.expanduser('~/Library/CloudStorage/GoogleDrive-*/マイドライブ/居酒屋ノブの声'))):
        return d
    return os.path.expanduser('~/居酒屋ノブの声')
DRIVE = _drive()
OUT = os.path.join(ROOT, 'voice', 'nobu')
CONFIG = os.path.join(ROOT, 'js', 'config.js')
CLONE = os.path.expanduser('~/claude-work/izakaya-voice-raw/clone')   # 声のまね用の長い録音(リポジトリの外)


def owner_ids():
    s = open(CONFIG, encoding='utf-8').read()
    m = re.search(r'OWNER_PHRASES:\s*\[(.*?)\n  \]', s, re.S)
    return re.findall(r"id:\s*'([^']+)'", m.group(1)) if m else []


AUDIO = ('.m4a', '.webm', '.ogg', '.mp4', '.wav')


def drive_sources():
    """いちばん新しい zip と、そのまま置かれた声のファイル。古い順に並べる(新しいものが上書き)"""
    zs = sorted(glob.glob(os.path.join(DRIVE, '*.zip')), key=os.path.getmtime)
    loose = [f for f in glob.glob(os.path.join(DRIVE, '*')) if os.path.splitext(f)[1].lower() in AUDIO]
    src = ([zs[-1]] if zs else []) + loose
    if not src:
        sys.exit('ドライブの「居酒屋ノブの声」に 声のファイルがありません')
    return sorted(src, key=os.path.getmtime)


def items(path):
    """(ファイル名, 中身) を順に出す。zip なら中身を、声のファイルならそれ自体を"""
    if path.lower().endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                yield os.path.basename(n), z.read(n)
    else:
        with open(path, 'rb') as f:
            yield os.path.basename(path), f.read()


def convert(src, dst):
    # 前後の無音(-50dB より小さい所)を切り(言葉の頭が切れないよう 前に0.15秒・後に0.2秒 残す)、大きさをそろえて、AAC 40k モノラルに
    # 2026-11-21 ノブさん「大将の声にエコーがかかっている」→ 部屋の響きを抑える:
    #   低いうなり(90Hz 以下)を切る・さーっという音を減らす・言葉のあとの響きを ゆるいゲートで下げる。
    #   ゲートを強くすると「いいねえ」「帰って」の頭が欠けた(文字起こしで確認)ので、この強さ(0.025)まで。
    af = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,'
          'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse,'
          'highpass=f=90,afftdn=nr=12:nf=-40,'
          'loudnorm=I=-16:TP=-1.5:LRA=11,'
          'agate=threshold=0.025:ratio=5:range=0.06:attack=1:release=60:knee=3,alimiter=limit=0.85')
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1',
                    '-af', af, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart', dst],
                   check=True)
    out = subprocess.run(['ffmpeg', '-i', dst], capture_output=True, text=True).stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out)
    return int(m.group(2)) * 60 + float(m.group(3)) if m else 0


def main():
    srcs = [sys.argv[1]] if len(sys.argv) > 1 else drive_sources()
    ids = owner_ids()
    os.makedirs(OUT, exist_ok=True)
    got, skip, empty, clone = {}, [], [], []
    with tempfile.TemporaryDirectory() as tmp:
        for zp in srcs:
            for base, data in items(zp):
                pid, ext = os.path.splitext(base)
                pid = re.sub(r'\s*\(\d+\)$', '', pid)   # ドライブが付ける「(1)」を外す
                if ext.lower() not in AUDIO:
                    continue
                if re.match(r'long\d+$', pid):   # 声のまね(クローン)用の長い台本は、公開の置き場に入れず リポジトリの外へ そのまま保存
                    os.makedirs(CLONE, exist_ok=True)
                    with open(os.path.join(CLONE, pid + ext.lower()), 'wb') as f:
                        f.write(data)
                    clone.append(pid); continue
                if pid not in ids:
                    skip.append(base); continue
                src = os.path.join(tmp, 'in' + ext.lower())
                with open(src, 'wb') as f:
                    f.write(data)
                dst = os.path.join(OUT, pid + '.m4a')
                tmpdst = os.path.join(tmp, pid + '.m4a')
                try:
                    sec = convert(src, tmpdst)
                except subprocess.CalledProcessError:
                    sec = 0
                if sec < 0.3:   # 音が入っていない(マイクが動いていなかった等)。入れない。前に取りこんだ声があれば そのまま
                    empty.append(pid); continue
                os.replace(tmpdst, dst)
                got[pid] = sec
    got = list(got.items())
    have = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.m4a'))
    have = [i for i in ids if i in have]   # 言葉の並び順で
    s = open(CONFIG, encoding='utf-8').read()
    s2 = re.sub(r"NOBU_VOICE:\s*\[[^\]]*\]", 'NOBU_VOICE: [' + ', '.join("'%s'" % i for i in have) + ']', s)
    open(CONFIG, 'w', encoding='utf-8').write(s2)
    print('取りこみ元:', ', '.join(os.path.basename(x) for x in srcs))
    for pid, sec in got:
        print('  ○ %-12s %.1f秒' % (pid, sec))
    for e in empty:
        print('  × %-12s 音が入っていなかったので入れない(録りなおしてもらう)' % e)
    for b in skip:
        print('  × %s(大将用の言葉にない名前なので飛ばした)' % b)
    for c in clone:
        print('  🎤 %-12s 声のまね用 → %s' % (c, CLONE))
    print('ノブの声がある言葉: %d / %d' % (len(have), len(ids)))


if __name__ == '__main__':
    main()
