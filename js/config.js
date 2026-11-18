'use strict';
/* =====================================================================
   居酒屋の設定 —— お店の中身は、ほとんど ここを書きかえるだけで変えられる。
   ・席の数   → SEATS
   ・営業日   → SCHEDULE(曜日と時間。いくつでも足せる)
   ・メニュー → MENU(1行足せば1品増える)
   ・曲       → SONGS(1行足せば1曲増える)
   ・決まり文句の声 → PHRASES(声のファイルを置けば、その声で鳴る。なければ仮の読み上げ)
   ===================================================================== */
var SHOP = {
  NAME: '居酒屋ノブ',
  OWNER_NAME: '大将ノブ',

  /* 席の数(カウンター)。増やすと 3D のカウンターも自動で長くなる */
  SEATS: 7,

  /* 営業日。day: 0=日 1=月 2=火 3=水 4=木 5=金 6=土 / start・end は "時:分" */
  SCHEDULE: [
    { day: 5, start: '21:00', end: '22:00' }
  ],
  DOORS_OPEN_BEFORE: 10,      // 開店の何分前から入れるか
  LAST_CALL_BEFORE: 5,        // 閉店の何分前に「そろそろ閉店です」
  RESERVE_WEEKS: 4,           // 何週先まで予約できるか
  RESERVE_HOLD_MIN: 15,       // 予約の席を、開店から何分まで取っておくか

  /* 店の合言葉の「指紋」(SHA-256)。'' なら だれでも入れる。
     入れると、合言葉を知っている人だけが入れる(合言葉そのものは ここに書かない。指紋から合言葉は分からない)。
     合言葉を決めたら tools/hash.html で指紋を作って、ここに貼る */
  PASSCODE_HASH: '',

  /* 大将の合言葉の「指紋」。大将として入るとき(アドレスの最後に #owner)に聞かれる。
     '' のあいだは、#owner で開けば だれでも大将になれる(おためし用) */
  OWNER_HASH: '',

  /* つなぎ先(Firebase)。空のあいだは「おためしモード」(同じスマホ・同じパソコンの中だけで動く) */
  FIREBASE: {
    databaseURL: ''           // 例: 'https://izakaya-nobu-default-rtdb.asia-southeast1.firebasedatabase.app'
  },

  /* ---------------- メニュー ----------------
     kind: 'food'(料理)か 'drink'(飲み物)
     model: 3D の形。'mug'(ジョッキ)'glass'(グラス)'tokkuri'(とっくり)'cup'(湯のみ)
            'yakitori' 'sashimi' 'oden' 'edamame' 'karaage' 'plate'(お皿に絵文字)
            知らない形を書いても、お皿に絵文字がのって出る
     color: 飲み物の色など(なくてもいい) */
  MENU: [
    { id: 'beer',     kind: 'drink', name: '生ビール',     emoji: '🍺', model: 'mug',     color: '#f2b51c' },
    { id: 'highball', kind: 'drink', name: 'ハイボール',   emoji: '🥃', model: 'glass',   color: '#e6b45a' },
    { id: 'lemon',    kind: 'drink', name: 'レモンサワー', emoji: '🍋', model: 'glass',   color: '#f3ec9a' },
    { id: 'sake',     kind: 'drink', name: '熱燗',         emoji: '🍶', model: 'tokkuri', color: '#f4f0e6' },
    { id: 'oolong',   kind: 'drink', name: 'ウーロン茶',   emoji: '🍵', model: 'glass',   color: '#8a4b1c' },
    { id: 'cola',     kind: 'drink', name: 'コーラ',       emoji: '🥤', model: 'glass',   color: '#3a1a0c' },
    { id: 'yakitori', kind: 'food',  name: '焼き鳥',       emoji: '🍢', model: 'yakitori' },
    { id: 'sashimi',  kind: 'food',  name: 'お刺身',       emoji: '🐟', model: 'sashimi' },
    { id: 'oden',     kind: 'food',  name: 'おでん',       emoji: '🍢', model: 'oden' },
    { id: 'edamame',  kind: 'food',  name: '枝豆',         emoji: '🫛', model: 'edamame' },
    { id: 'karaage',  kind: 'food',  name: '唐揚げ',       emoji: '🍗', model: 'karaage' },
    { id: 'onigiri',  kind: 'food',  name: 'おにぎり',     emoji: '🍙', model: 'plate' }
  ],

  /* ---------------- 曲 ----------------
     src: 曲のファイルのアドレス(mp3 など)。このアプリの music/ に置いたら 'music/ファイル名.mp3' と書く */
  SONGS: [
    { id: 'kiiro-uta', title: '黄色が好き',    src: 'https://www.roguepink.com/music/kiiro-ga-suki/kiiro-ga-suki-uta.mp3' },
    { id: 'kiiro-rap', title: '黄色が好き(ラップ)', src: 'https://www.roguepink.com/music/kiiro-ga-suki/kiiro-ga-suki-rap.mp3' },
    { id: 'k01', title: '静かな灯',   src: 'https://roguepink.github.io/kyandoru/music/01-stille-lys.mp3' },
    { id: 'k02', title: '冬のあかり', src: 'https://roguepink.github.io/kyandoru/music/02-vinterljus.mp3' },
    { id: 'k03', title: '小さな炎',   src: 'https://roguepink.github.io/kyandoru/music/03-petite-flamme.mp3' },
    { id: 'k04', title: 'Candlelight', src: 'https://roguepink.github.io/kyandoru/music/04-candlelight.mp3' },
    { id: 'k05', title: 'ゆらめき',   src: 'https://roguepink.github.io/kyandoru/music/05-kerzenschein.mp3' },
    { id: 'k06', title: 'やさしい光', src: 'https://roguepink.github.io/kyandoru/music/06-piccola-luce.mp3' },
    { id: 'k07', title: 'ほのかな灯', src: 'https://roguepink.github.io/kyandoru/music/07-lucecita.mp3' },
    { id: 'k08', title: 'やすらぎ',   src: 'https://roguepink.github.io/kyandoru/music/08-nour.mp3' },
    { id: 'k09', title: '祈りの灯',   src: 'https://roguepink.github.io/kyandoru/music/09-diya.mp3' },
    { id: 'k10', title: '小さな灯り', src: 'https://roguepink.github.io/kyandoru/music/10-jageun-bulbit.mp3' },
    { id: 'r01', title: '灯心',   src: 'https://roguepink.github.io/rosoku/music/01-candle-flame-meditation.mp3' },
    { id: 'r02', title: '水月',   src: 'https://roguepink.github.io/rosoku/music/02-moonlight-over-still-water.mp3' },
    { id: 'r04', title: '夜の鈴', src: 'https://roguepink.github.io/rosoku/music/04-midnight-forest-chimes.mp3' }
  ],
  ALLOW_YOUTUBE: true,        // お客さんが YouTube のリンクを貼ってリクエストできるか
  MAX_QUEUE: 20,              // リクエストの順番待ちは何曲まで

  /* ---------------- 決まり文句(声つき) ----------------
     who: 'owner'(大将が言う)/ 'all'(その人が言う)
     voice: 声のファイル。置いてなければ、say の文を 仮の読み上げで言う
     btn: true なら お客さんのボタンに出る */
  PHRASES: [
    { id: 'irasshai', who: 'owner', say: 'いらっしゃい！',         voice: 'voice/irasshai.mp3' },
    { id: 'mataokoshi', who: 'owner', say: 'またお越しください！', voice: 'voice/mataokoshi.mp3' },
    { id: 'oyasumi', who: 'owner', say: 'おやすみなさい！',        voice: 'voice/oyasumi.mp3' },
    { id: 'lastcall', who: 'owner', say: 'そろそろ閉店です。ラストオーダー、どうぞ！', voice: 'voice/lastcall.mp3' },
    { id: 'omachi', who: 'owner', say: 'はい、お待ち！',           voice: 'voice/omachi.mp3' },
    { id: 'kanpai', who: 'all', say: 'かんぱーい！',  voice: 'voice/kanpai.mp3', btn: true, emoji: '🍻' },
    { id: 'okawari', who: 'all', say: 'おかわり！',   voice: 'voice/okawari.mp3', btn: true, emoji: '🙋' },
    { id: 'umai', who: 'all', say: 'うまい！',        voice: 'voice/umai.mp3', btn: true, emoji: '😋' },
    { id: 'gochisou', who: 'all', say: 'ごちそうさま！', voice: 'voice/gochisou.mp3', btn: true, emoji: '🙏' }
  ]
};
