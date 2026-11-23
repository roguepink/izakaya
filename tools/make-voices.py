#!/usr/bin/env python3
"""決まり文句の声を Google(Gemini)で作る。

使い方(Mac。mlx-whisper の入った Python で):
  ~/.local/venvs/ryokoshi/bin/python tools/make-voices.py            # まだ声のない言葉だけ作る
  ~/.local/venvs/ryokoshi/bin/python tools/make-voices.py --voices m1 om2   # その声だけ
  ~/.local/venvs/ryokoshi/bin/python tools/make-voices.py --force    # 全部作り直す
  ~/.local/venvs/ryokoshi/bin/python tools/make-voices.py --resplit  # 注文しなおさず、前の録音から切り直す
  ~/.local/venvs/ryokoshi/bin/python tools/make-voices.py --ai --chunk 8   # 常連のアイちゃんの言葉(config.js の REGULAR.TALK)→ voice/ai/<id>.m4a

やること
  1. js/config.js の GUEST_PHRASES(お客さん用)と OWNER_PHRASES(大将用)、
     js/avatar-data.js の GUEST_VOICES と OWNER_VOICES を読む
  2. 声ごとに、その声が話す言葉だけを(お客さんの声はお客さん用、大将の声は大将用)1回でまとめて読ませる
  3. 聞き起こしと無音の場所で 1つずつに切り、前後の無音を落として音量をそろえ、voice/<声>/<言葉>.m4a に置く
  4. 1つずつ聞き起こして、言葉と合っているか表に出す(こちらは音を聞けないので、文字で確かめる)

⚠ API キーは ~/.config/gemini/api_key から読む。リポジトリには絶対に入れない。
⚠ 作る前に毎回 ~/.claude/scripts/hito-pace.py --wait(人のペース)。使った量は ~/.claude/credit-log.md に書く。
"""
import base64, difflib, io, json, os, re, struct, subprocess, sys, time, urllib.error, urllib.request, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = Path(os.path.expanduser("~/.config/gemini/api_key")).read_text().strip()
MODEL = "gemini-3.8-flash-tts"
RATE = 24000
RAW = Path(os.environ.get("IZ_VOICE_RAW", os.path.expanduser("~/claude-work/izakaya-voice-raw")))   # まとめ録音の置き場(リポジトリの外)
RAW.mkdir(parents=True, exist_ok=True)
SEP = "\n\n"
HITO = os.path.expanduser("~/.claude/scripts/hito-pace.py")
CHUNK = int(sys.argv[sys.argv.index("--chunk") + 1]) if "--chunk" in sys.argv else 0   # 1回に読ませる数
FORCE_WHISPER = "--whisper" in sys.argv   # 間が短い声は 聞き起こしの時刻で切る(無音で切ると ずれる)


def js_list(src, name):
    """config.js / avatar-data.js から { id: '..', ... } の並びを読む(node がなくても読めるように)。"""
    a = src.index(name + ": [")
    b = src.index("\n  ]", a)
    out = []
    for m in re.finditer(r"\{([^{}]*)\}", src[a:b]):
        d = {k: v for k, v in re.findall(r"(\w+):\s*'([^']*)'", m.group(1))}
        if "id" in d:
            out.append(d)
    return out


def load():
    c = (ROOT / "js/config.js").read_text()
    a = (ROOT / "js/avatar-data.js").read_text()
    return js_list(c, "GUEST_PHRASES"), js_list(c, "OWNER_PHRASES"), js_list(a, "GUEST_VOICES"), js_list(a, "OWNER_VOICES")


READ = {"大将、がんばってね": "たいしょー、がんばってね", "ウケる！": "うけるー！", "はいよ！": "はいよー！", "はい、お待ち！": "はいっ、おまち！", "うーん、どうだろう…大将は どう思います？": "うーん、どうだろう。大将は、どう思います？"}   # Google の声が読みまちがえる言葉の読み方(2026-11-19「ウケる」が「来る」、威勢のいい声の「はいよ」が「あや」に聞こえた)


def spoken(t):   # 「大将」を「たいちょう」と読むことがあった(11-23 アイちゃんの声 4つ)→ ひらがなで渡す
    return READ.get(t, t).replace("〜", "ー").replace("大将", "たいしょう")


def request(text, voice, style, model=None):
    body = {"model": model or MODEL,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                       "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions",
                                 data=json.dumps(body).encode(),
                                 headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    last = ""
    for attempt in range(5):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=600)); break
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {e.read().decode()[:200]}"
            if e.code == 429 and "per day" in last:
                raise SystemExit("今日の上限: " + last)
            time.sleep(15 * (attempt + 1))
        except Exception as e:
            last = f"ERR {e}"; time.sleep(10)
    else:
        raise SystemExit("音声が返りませんでした: " + last)

    def find(o):
        if isinstance(o, dict):
            if isinstance(o.get("data"), str) and len(o["data"]) > 1000: return o
            for v in o.values():
                f = find(v)
                if f: return f
        elif isinstance(o, list):
            for v in o:
                f = find(v)
                if f: return f
    f = find(r)
    if not f: raise SystemExit("音声が入っていません: " + json.dumps(r)[:300])
    return base64.b64decode(f["data"])


def pcm_of(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes)) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def silences(pcm, frame=0.02, min_len=0.14, thresh=0.012):
    n = len(pcm) // 2; step = int(RATE * frame); quiet = []
    for i in range(0, n - step, step):
        seg = struct.unpack(f"<{step}h", pcm[i * 2:(i + step) * 2])
        quiet.append((sum(x * x for x in seg) / step) ** 0.5 / 32768.0 < thresh)
    out, start = [], None
    for k, q in enumerate(quiet + [False]):
        if q and start is None: start = k
        if not q and start is not None:
            if (k - start) * frame >= min_len: out.append((start * frame, k * frame))
            start = None
    return out


def norm(t):
    return re.sub(r"[\s、。「」『』！？!?・…〜ー,.\-]", "", t)


_whisper = None
def transcribe(path, words=False):
    global _whisper
    import mlx_whisper
    return mlx_whisper.transcribe(str(path), path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="ja", word_timestamps=words)


def split_points(pcm, texts, wav_path):
    """各言葉の始まり(秒)。いちばん長い無音を (言葉の数-1) 個えらぶのが基本。聞き起こしで並びを確かめる。"""
    total = len(pcm) / 2 / RATE
    gaps = sorted(silences(pcm), key=lambda g: -(g[1] - g[0]))
    # 端の無音は切れ目ではない
    gaps = [g for g in gaps if g[0] > 0.15 and g[1] < total - 0.15]
    need = len(texts) - 1
    if len(gaps) >= need and not FORCE_WHISPER:
        cuts = sorted((a + b) / 2 for a, b in gaps[:need])
        return [0.0] + cuts, total, "無音"
    # 無音が足りないときは、聞き起こしの時刻で
    r = transcribe(wav_path, words=True)
    words = [(w["word"], w["start"], w["end"]) for seg in r["segments"] for w in seg.get("words", [])]
    O, omap = "", []
    for i, t in enumerate(texts):
        n = norm(t); O += n; omap += [i] * len(n)
    T, tmap = "", []
    for k, (w, a, b) in enumerate(words):
        n = norm(w); T += n; tmap += [k] * len(n)
    first = {}
    sm = difflib.SequenceMatcher(None, O, T, autojunk=False)
    for blk in sm.get_matching_blocks():
        for j in range(blk.size):
            first.setdefault(omap[blk.a + j], words[tmap[blk.b + j]][1])
    starts = [0.0]
    for i in range(1, len(texts)):
        starts.append(max(first.get(i, total * i / len(texts)) - 0.05, starts[-1] + 0.3))
    # 「えへへ」「うーん」のような 字にならない声は 聞き起こしに出ないので、切れ目が その声のあとになり 前の言葉にくっつく(11-23)。
    # → 前の言葉の始まり〜この言葉の最初の字 の間で いちばん長い無音を 切れ目にする(行の間は 1秒ほど あけて読ませている)
    gaps = silences(pcm, min_len=0.2)
    out = [0.0]
    for i in range(1, len(texts)):
        lo, hi = starts[i - 1] + 0.4, starts[i] + 0.15
        cand = [g for g in gaps if g[0] >= lo and g[1] <= hi]
        out.append((lambda g: (g[0] + g[1]) / 2)(max(cand, key=lambda g: g[1] - g[0])) if cand else starts[i])
    return out, total, "聞き起こし+無音"


def encode(pcm, a, b, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    seg = pcm[int(a * RATE) * 2:int(b * RATE) * 2]
    tmp = out.with_suffix(".tmp.wav")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(seg)
    af = ("silenceremove=start_periods=1:start_threshold=-42dB,areverse,"
          "silenceremove=start_periods=1:start_threshold=-42dB,areverse,"
          "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000,afade=t=in:d=0.008,apad=pad_dur=0.06")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af", af, "-ac", "1",
                    "-c:a", "aac", "-b:a", "40k", "-movflags", "+faststart", str(out)], check=True)
    tmp.unlink()


def seconds(path):   # ffprobe がない Mac もあるので、ffmpeg の出力から長さを読む
    r = subprocess.run(["ffmpeg", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"time=(\d+):(\d+):([\d.]+)", r.stderr)
    return int(m[-1][0]) * 3600 + int(m[-1][1]) * 60 + float(m[-1][2]) if m else 0.0


def main():
    args = sys.argv[1:]
    force = "--force" in args
    resplit = "--resplit" in args
    only = []
    if "--voices" in args:
        i = args.index("--voices") + 1
        while i < len(args) and not args[i].startswith("--"):
            only.append(args[i]); i += 1
    gp, op, gv, ov = load()
    jobs = [(v, gp) for v in gv if v.get("tts")] + [(v, op) for v in ov if v.get("tts")]
    if "--ai" in args:   # 常連のアイちゃん(2026-11-21 ノブさんが 明るい声 A=Zephyr を選んだ)。言葉は REGULAR.TALK
        c = (ROOT / "js/config.js").read_text()
        a = c.index("TALK: {", c.index("REGULAR:")); b = c.index("\n    }", a)
        ai = [{"id": i, "say": t} for i, t in re.findall(r"\['(\w+)', '([^']+)'\]", c[a:b])]
        jobs = [({"id": "ai", "tts": "Zephyr", "style": "20代前半の女性。少し高めで、やわらかく明るい声。居酒屋の常連さんで、ひとりで ゆったり飲んでいる。にこにこして、親しみやすい。自然な日本語の話し言葉。"}, ai)]
    report, calls, chars = [], 0, 0
    for v, phrases in jobs:
        if only and v["id"] not in only: continue
        outdir = ROOT / "voice" / v["id"]
        todo = [p for p in phrases if force or resplit or not (outdir / f"{p['id']}.m4a").exists()]
        if not todo: continue
        if not force and not resplit and len(todo) < len(phrases):
            print(f"{v['id']}: 足りない {len(todo)} 個だけ作ります")
        # 1回に読ませる まとまり。--chunk N で N個ずつ。1〜3個だけ作り直すときは 前後の言葉も読ませて まん中だけ使う(1言だけだと くずれやすい)
        groups = []   # [(読ませる言葉の並び, 保存する印の並び)]
        if CHUNK and not resplit:
            for k in range(0, len(todo), CHUNK): groups.append((todo[k:k + CHUNK], [True] * len(todo[k:k + CHUNK])))
        elif len(todo) <= 3 and len(todo) < len(phrases) and not resplit:
            for p in todo:
                i = phrases.index(p); ctx = phrases[max(0, i - 1):i + 2]
                groups.append((ctx, [q is p for q in ctx]))
        else:
            groups.append((todo, [True] * len(todo)))
        for gi, (items, keep) in enumerate(groups):
            texts = [spoken(p["say"]) for p in items]
            raw = RAW / f"{v['id']}-{abs(hash(tuple(texts))) % 10**8}.wav"
            if resplit:
                cands = sorted(RAW.glob(f"{v['id']}-*.wav"), key=lambda x: x.stat().st_mtime)
                raw = cands[-1] if cands else raw
            if not raw.exists():
                if os.path.exists(HITO):   # 人のペース。見張りが「あけて」と止めたら、ここでやめる(2026-11-21 合図を無視して 1時間に85回 頼んでしまった反省)
                    if subprocess.run(["python3", HITO, "--wait"], check=False).returncode != 0:
                        print(f"人のペースの決まりで止まりました。ここまで {calls} 回・{chars} 字。時間をあけて、もう一度動かすと続きから作ります", flush=True)
                        sys.exit(2)
                style = v["style"] + " これは一行ずつ別々の場面のひとことです。行と行のあいだは、たっぷり一秒ほど間をあけてください。番号や記号は読まないでください。"
                print(f"{v['id']} ({v['tts']}): {len(texts)} 個を注文中…", flush=True)
                raw.write_bytes(request(SEP.join(texts), v["tts"], style, v.get("model")))
                calls += 1; chars += sum(len(t) for t in texts)
            pcm = pcm_of(raw.read_bytes())
            starts, total, how = split_points(pcm, texts, raw)
            print(f"{v['id']}: 全体 {total:.1f}秒・切り方 {how}")
            for i, p in enumerate(items):
                if not keep[i]: continue
                a = starts[i]; b = starts[i + 1] if i + 1 < len(items) else total
                out = outdir / f"{p['id']}.m4a"
                encode(pcm, a, b, out)
                heard = transcribe(out)["text"].strip()
                sim = difflib.SequenceMatcher(None, norm(p["say"]), norm(heard)).ratio()
                report.append((v["id"], p["id"], p["say"], heard, round(sim, 2), round(seconds(out), 2), out.stat().st_size))
    rp = RAW / "report.json"
    old = json.loads(rp.read_text()) if rp.exists() else {}
    for r in report: old[r[0] + "/" + r[1]] = r
    rp.write_text(json.dumps(old, ensure_ascii=False, indent=1))
    print("\n声  言葉  →  聞こえた言葉  (似ている度・秒・大きさ)")
    for r in report:
        mark = "○" if r[4] >= 0.6 else "△"
        print(f"{mark} {r[0]:4} {r[2]:22} → {r[3]:22} ({r[4]}・{r[5]}秒・{r[6] // 1024}KB)")
    print(f"\n注文 {calls} 回・{chars} 字")


if __name__ == "__main__":
    main()
