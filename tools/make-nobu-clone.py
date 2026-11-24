#!/usr/bin/env python3
"""大将ノブの声のまね(イレブンラボ)で、決まり文句をまとめて作る。

使い方(Mac。mlx-whisper の入った Python で):
  ~/.local/venvs/ryokoshi/bin/python tools/make-nobu-clone.py list            # 作る言葉の一覧と文字数だけ(お金はかからない)
  ~/.local/venvs/ryokoshi/bin/python tools/make-nobu-clone.py make --only 10  # はじめの10こだけ作る
  ~/.local/venvs/ryokoshi/bin/python tools/make-nobu-clone.py make            # まだ作っていない言葉を全部作る
  ~/.local/venvs/ryokoshi/bin/python tools/make-nobu-clone.py check           # 作った声を聞き起こして、言葉と合っているか表に出す
  ~/.local/venvs/ryokoshi/bin/python tools/make-nobu-clone.py redo <id> ...   # その言葉だけ作り直す

やること
  1. docs/kotoba/final.json(言葉えらびページの○×・直し・追加を反映した一覧)を読む
  2. 20こくらいずつ 1回にまとめて頼み(with-timestamps)、返ってきた「文字ごとの時刻」で 1こずつに切る
  3. ~/claude-work/izakaya-voice-raw/clone/out/<id>.mp3 に置く(確認が終わるまで 公開の置き場には入れない)

⚠ API キーは ~/.config/elevenlabs/api_key.txt(ノブさんが保存)。リポジトリには絶対に入れない。画面にも出さない。
⚠ 頼む前に毎回 ~/.claude/scripts/hito-pace.py --wait(人のペース)。使った量は ~/.claude/credit-log.md に書く。
"""
import base64, difflib, json, os, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONF = Path.home() / '.config/elevenlabs'
OUT = Path.home() / 'claude-work/izakaya-voice-raw/clone/out'
RAW = Path.home() / 'claude-work/izakaya-voice-raw/clone/raw'
FINAL = ROOT / 'docs/kotoba/final.json'
MODEL = 'eleven_v4'
CHUNK_CHARS = 450          # 1回に頼む文字数のめやす
HITO = Path.home() / '.claude/scripts/hito-pace.py'
# 読み方の直し(画面に出す字はそのまま。声にするときだけ置きかえる)
SAY = [('125cc', 'ひゃくにじゅうごシーシー'), ('大将', 'たいしょう')]


_mv = None


def mvmod():   # make-voices.py の 切り分け(聞き起こし+無音)を そのまま使う
    global _mv
    if _mv is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location('make_voices', ROOT / 'tools/make-voices.py')
        _mv = importlib.util.module_from_spec(spec); spec.loader.exec_module(_mv)
    return _mv


def key():
    return (CONF / 'api_key.txt').read_text().strip()


def voice():
    return (CONF / 'voice_nobu.txt').read_text().strip()


def api(path, body=None):
    req = urllib.request.Request('https://api.elevenlabs.io' + path, headers={'xi-api-key': key(), 'Content-Type': 'application/json'},
                                 data=json.dumps(body).encode() if body is not None else None)
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=180))
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'ignore')[:300]
            if e.code in (429, 500, 502, 503) and i < 3:
                time.sleep(10 * (i + 1)); continue
            sys.exit('イレブンラボの返事がエラー: %s %s' % (e.code, msg))


def used():
    s = api('/v1/user/subscription')
    return s['character_count'], s['character_limit']


def spoken(t):
    for a, b in SAY:
        t = t.replace(a, b)
    if not re.search(r'[。！？!?…〜ー]$', t):
        t += '。'
    return t


def items():
    return json.loads(FINAL.read_text())


def chunks(todo):
    out, cur, n = [], [], 0
    for it in todo:
        s = spoken(it['text'])
        if cur and n + len(s) > CHUNK_CHARS:
            out.append(cur); cur, n = [], 0
        cur.append((it, s)); n += len(s) + 1
    if cur:
        out.append(cur)
    return out


def ffmpeg(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], check=True)


def make_chunk(group, tag):
    text = '\n\n'.join(s for _, s in group)
    if HITO.exists():
        subprocess.run([sys.executable, str(HITO), '--wait'], check=False)
    r = api('/v1/text-to-speech/%s/with-timestamps?output_format=mp3_44100_128' % voice(),
            {'text': text, 'model_id': MODEL, 'language_code': 'ja'})
    RAW.mkdir(parents=True, exist_ok=True)
    mp3 = RAW / (tag + '.mp3')
    mp3.write_bytes(base64.b64decode(r['audio_base64']))
    (RAW / (tag + '.json')).write_text(json.dumps({'text': text, 'ids': [it['id'] for it, _ in group], 'al': r.get('alignment')}, ensure_ascii=False))
    mv = mvmod()
    wav = RAW / (tag + '.wav')
    ffmpeg('-i', str(mp3), '-ar', str(mv.RATE), '-ac', '1', str(wav))
    import wave
    with wave.open(str(wav)) as w:
        pcm = w.readframes(w.getnframes())
    texts = [x for _, x in group]
    starts, total = split_at(mv, pcm, texts, wav)
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (it, _) in enumerate(group):
        t0 = starts[i]; t1 = starts[i + 1] if i + 1 < len(starts) else total
        # 前後の無音を落として、音の大きさをそろえる
        ffmpeg('-ss', '%.3f' % t0, '-to', '%.3f' % t1, '-i', str(wav),
               '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
               '-ar', '44100', '-ac', '1', '-b:a', '96k', str(OUT / (it['id'] + '.mp3')))
    return len(text)


def split_at(mv, pcm, texts, wav):
    """切れ目: 聞き起こしで「次の言葉の最初の字」の時刻を出し、その直前の無音のまん中で切る。
    (いちばん長い無音を選ぶと「お一人さまですか? どうぞ」の文の中の間で切れてしまった 11-24)"""
    import difflib as dl
    total = len(pcm) / 2 / mv.RATE
    r = mv.transcribe(wav, words=True)
    words = [(w['word'], w['start'], w['end']) for seg in r['segments'] for w in seg.get('words', [])]
    O, omap = '', []
    for i, t in enumerate(texts):
        n = mv.norm(t); O += n; omap += [i] * len(n)
    T, tmap = '', []
    for k, (w, a, b) in enumerate(words):
        n = mv.norm(w); T += n; tmap += [k] * len(n)
    first = {}
    for blk in dl.SequenceMatcher(None, O, T, autojunk=False).get_matching_blocks():
        for j in range(blk.size):
            first.setdefault(omap[blk.a + j], words[tmap[blk.b + j]][1])
    gaps = mv.silences(pcm, min_len=0.12)
    out = [0.0]
    for i in range(1, len(texts)):
        guess = first.get(i, total * i / len(texts))
        cand = [g for g in gaps if guess - 1.2 <= g[1] <= guess + 0.2 and (g[0] + g[1]) / 2 > out[-1] + 0.3]
        cut = (lambda g: (g[0] + g[1]) / 2)(min(cand, key=lambda g: abs(g[1] - guess))) if cand else guess - 0.05
        out.append(max(cut, out[-1] + 0.3))
    return out, total


def cmd_list():
    L = items(); n = sum(len(spoken(x['text'])) for x in L)
    print('作る言葉 %d こ ・ 声にする文字 %d 字' % (len(L), n))
    for x in L[:10]:
        print(' ', x['id'], x['text'])


def cmd_make(only=None, ids=None):
    L = items()
    if ids:
        todo = [x for x in L if x['id'] in ids]
    else:
        todo = [x for x in L if not (OUT / (x['id'] + '.mp3')).exists()]
    if only:
        todo = todo[:only]
    if not todo:
        print('作るものはありません'); return
    u0, lim = used()
    print('はじめの使用量 %d / %d ・ 作る %d こ' % (u0, lim, len(todo)))
    sent = 0
    for i, g in enumerate(chunks(todo)):
        tag = time.strftime('%m%d-%H%M%S') + '-%02d' % i
        sent += make_chunk(g, tag)
        print('  %d回目 %dこ できた(%s〜)' % (i + 1, len(g), g[0][0]['id']), flush=True)
    u1, _ = used()
    print('おわりの使用量 %d / %d ・ 今回 %d クレジット(送った文字 %d 字)' % (u1, lim, u1 - u0, sent))


def norm(t):
    t = re.sub(r'[\s、。！？!?…〜ー・「」『』（）()]', '', t)
    return t


def cmd_check(ids=None):
    import mlx_whisper
    L = items(); bad = []
    for x in L:
        if ids and x['id'] not in ids:
            continue
        f = OUT / (x['id'] + '.mp3')
        if not f.exists():
            continue
        r = mlx_whisper.transcribe(str(f), path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language='ja')
        heard = r['text'].strip()
        sc = difflib.SequenceMatcher(None, norm(spoken(x['text']).replace('たいしょう', '大将')), norm(heard)).ratio()
        mark = '○' if sc >= 0.8 else '？' if sc >= 0.6 else '△'
        if sc < 0.6:
            bad.append(x['id'])
        print('%s %-8s %-28s → %s (%.2f)' % (mark, x['id'], x['text'], heard, sc), flush=True)
    print('△(ずれ・言いまちがいの見こみ。作り直す):', ' '.join(bad) or 'なし')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] == 'list':
        cmd_list()
    elif a[0] == 'make':
        cmd_make(only=int(a[a.index('--only') + 1]) if '--only' in a else None)
    elif a[0] == 'redo':
        for i in a[1:]:
            p = OUT / (i + '.mp3')
            if p.exists():
                p.unlink()
        cmd_make(ids=set(a[1:]))
    elif a[0] == 'check':
        cmd_check(set(a[1:]) or None)
