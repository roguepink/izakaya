#!/usr/bin/env python3
"""大将ノブの声のまね(イレブンラボ)で作った決まり文句を、お店に入れる。

  python3 tools/make-owner-lib.py            # js/owner-lib.js を作り、声を voice/nobu/n_<id>.m4a に置く
  python3 tools/make-owner-lib.py --no-audio # 一覧(js/owner-lib.js)だけ作り直す

元: docs/kotoba/final.json(言葉えらびの最終一覧)と ~/claude-work/izakaya-voice-raw/clone/out/<id>.mp3(make-nobu-clone.py で作った声)
はずすもの: docs/kotoba/drop.txt(1行に1つ id。聞き比べで × のまま作り直さないもの)

いつ出すか(w):
  ''            いつでも(「💬 もっと」の中の棚だけ)
  'MMDD-MMDD'   その期間だけ「いまの時期」に出る(年をまたいでもよい)
  'dow:N'       その曜日だけ(0=日〜6=土)
  'nth:M,K,D,B' M月の 第K D曜日(0=日)の B日前から当日まで(母の日・父の日・敬老の日)
"""
import json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/claude-work/izakaya-voice-raw/clone/out')
FINAL = os.path.join(ROOT, 'docs/kotoba/final.json')
DROP = os.path.join(ROOT, 'docs/kotoba/drop.txt')
OUTJS = os.path.join(ROOT, 'js/owner-lib.js')
VOICE = os.path.join(ROOT, 'voice/nobu')

SEASON = {'ha': '0301-0531', 'na': '0601-0915', 'ak': '0901-1130', 'fu': '1115-0228'}
CAT_W = {'sh': '0101-0115', 'se': '0128-0203', 'va': '0207-0214', 'hi': '0225-0303', 'gw': '0427-0506', 'ts': '0601-0715',
         'ob': '0715-0831', 'tu': '0907-1007', 'hw': '1020-1031', 'bo': '1201-1231', 'xm': '1210-1225'}
CAT_W.update(SEASON)
ID_W = {   # 言葉ごとの細かい期間
    'sh-11': '0104-0112', 'sh-13': '0105-0108', 'va-5': '0307-0314', 'va-6': '0307-0314',
    'hi-4': '0301-0331', 'hi-5': '0325-0415', 'hi-6': '0301-0415', 'hi-7': '0301-0430', 'hi-8': '0325-0430',
    'gw-4': '0501-0505', 'gw-5': '0501-0505', 'gw-6': 'nth:5,2,0,6', 'gw-7': 'nth:5,2,0,6', 'gw-8': 'nth:6,3,0,6',
    'ts-3': '0701-0707', 'ts-4': '0701-0707', 'ts-5': '0701-0707', 'ts-6': '0701-0707',
    'ob-1': '0808-0818', 'ob-2': '0808-0820', 'ob-3': '0808-0825', 'tu-4': 'nth:9,3,1,6', 'tu-5': 'nth:9,3,1,6',
    'bo-10': '1220-1231', 'bo-11': '1230-1231', 'bo-12': '1231-1231', 'bo-13': '1231-1231',
    'yo-1': 'dow:1', 'yo-2': 'dow:1', 'yo-3': 'dow:2', 'yo-4': 'dow:3', 'yo-5': 'dow:3', 'yo-6': 'dow:4',
    'yo-7': 'dow:5', 'yo-8': 'dow:5', 'yo-9': 'dow:5', 'yo-10': 'dow:6', 'yo-11': 'dow:0', 'yo-12': 'dow:0',
    'te-5': '1201-0228', 'te-6': '1101-0331', 'te-7': '0615-0915', 'te-9': '0801-1015', 'te-10': '0601-0731', 'te-a1': '1215-0215',
    'ha-a1': '0320-0531', 'ak-12': '0907-1007', 'na-12': '0715-0831', 'na-13': '0715-0815',
}
ICON = {'いつもの': '🏮', '時間・曜日': '🕰', '季節': '🍂', '行事': '🎌', '料理・飲み物': '🍶', 'おしゃべり': '💬', '趣味': '🏍', 'お店のこと': '📣'}


def norm(t):
    return re.sub(r'[\s、。！？!?…〜ー]', '', t)


def owner_says():
    s = open(os.path.join(ROOT, 'js/config.js'), encoding='utf-8').read()
    m = re.search(r'OWNER_PHRASES:\s*\[(.*?)\n  \]', s, re.S)
    return {norm(x) for x in re.findall(r"say:\s*'([^']+)'", m.group(1))}


def main():
    items = json.load(open(FINAL, encoding='utf-8'))
    drop = set(open(DROP).read().split()) if os.path.exists(DROP) else set()
    have = owner_says()
    out, skipped = [], []
    for it in items:
        if it['id'] in drop:
            continue
        if norm(it['text']) in have:   # いつもの決まり文句(ノブさん本人の録音がある)と同じ言葉は 入れない
            skipped.append(it['text']); continue
        code = it['id'].split('-')[0]
        w = ID_W.get(it['id'], CAT_W.get(code, ''))
        if code == 'se' and it['id'] in ('se-1', 'se-2'):
            w = 'nth:1,2,1,6'
        out.append({'id': 'n_' + it['id'].replace('-', '_'), 'g': it['group'], 'c': it['cat'], 'say': it['text'], 'w': w})
    js = ('/* 大将ノブの声のまね(イレブンラボ 11-24)で作った決まり文句。tools/make-owner-lib.py が作る。手で直さない。\n'
          '   声は voice/nobu/<id>.m4a。w: いつ「いまの時期」に出すか(説明は make-owner-lib.py) */\n'
          'window.OWNER_LIB = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('},{', '},\n{') + ';\n'
          'window.OWNER_LIB_ICON = ' + json.dumps(ICON, ensure_ascii=False) + ';\n')
    open(OUTJS, 'w', encoding='utf-8').write(js)
    print('一覧: %d こ(本人の録音と同じ言葉 %d こは入れない: %s)' % (len(out), len(skipped), '・'.join(skipped)))
    if '--no-audio' in sys.argv:
        return
    os.makedirs(VOICE, exist_ok=True)
    n = 0
    for x in out:
        src = os.path.join(SRC, x['id'][2:].replace('_', '-') + '.mp3')
        dst = os.path.join(VOICE, x['id'] + '.m4a')
        if not os.path.exists(src):
            print('  声がない:', x['id']); continue
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart', dst], check=True)
        n += 1
    print('声: %d こ 作った(voice/nobu/)' % n)


if __name__ == '__main__':
    main()
