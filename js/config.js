'use strict';
/* =====================================================================
   居酒屋の設定 —— お店の中身は、ほとんど ここを書きかえるだけで変えられる。
   ・席の数   → SEATS
   ・営業日   → SCHEDULE(曜日と時間。いくつでも足せる)
   ・メニュー → MENU(1行足せば1品増える)
   ・曲       → SONGS(1行足せば1曲増える)
   ・決まり文句 → GUEST_PHRASES(お客さん用)と OWNER_PHRASES(大将用)。2つは混ぜない。
     言葉を足したら tools/make-voices.py で声を作る(声がないあいだは、スマホの読み上げで代わりに読む)
   ===================================================================== */
var SHOP = {
  NAME: '居酒屋ノブ',
  OWNER_NAME: '大将ノブ',

  /* 席の数(カウンター)。増やすと 3D のカウンターも自動で長くなる */
  SEATS: 7,
  /* 席の数の上限(回ごとに「お店の予定」で変えられる)。スマホの縦の画面で 全員の顔と吹き出しが読めるのは 10席くらいまで。
     12席より多いと、吹き出しの等分(1人ぶんの高さ)が2行より低くなり、カウンターも横に長すぎて 端の人が小さくなる */
  MAX_SEATS: 12,

  /* 営業日。day: 0=日 1=月 2=火 3=水 4=木 5=金 6=土 / start・end は "時:分" */
  SCHEDULE: [
    { day: 5, start: '21:00', end: '22:00' }
  ],
  DOORS_OPEN_BEFORE: 10,      // 開店の何分前から入れるか
  LAST_CALL_BEFORE: 5,        // 閉店の何分前に「そろそろ閉店です」
  RESERVE_FROM_HOURS: 3,      // 開店の何時間前から予約できるか(金曜21時開店なら18時から)
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
     cat: 分類(下の CATS の id)/ kind: 'food'(料理)か 'drink'(飲み物)
     model: 3D の形(js/scene3d.js の「料理とお酒」)。知らない形を書いても、お皿に絵文字がのって出る
     pun: true … ダジャレの名物。real に中身の名前を書くと、出すときに大将が「(中身は◯◯です)」とそえる
     desc: メニュー表に出るひとこと */
  CATS: [
    { id: 'drink',    name: '飲み物',   emoji: '🍺' },
    { id: 'meibutsu', name: '名物',     emoji: '⭐' },
    { id: 'otsumami', name: 'おつまみ', emoji: '🫛' },
    { id: 'age',      name: '揚げ物',   emoji: '🍗' },
    { id: 'sakana',   name: '魚',       emoji: '🐟' },
    { id: 'niku',     name: '肉',       emoji: '🥩' },
    { id: 'nabe',     name: '鍋・煮物', emoji: '🍲' },
    { id: 'salad',    name: 'サラダ',   emoji: '🥗' },
    { id: 'gohan',    name: 'ご飯・麺', emoji: '🍚' },
    { id: 'gentei',   name: '限定',     emoji: '🎉', only: true }   // お祝いモードの日だけ出る(いちばん前に)
  ],
  FOOD_LIMIT: 3,       // 1人の前に置ける料理の数(カウンター1人分 幅60cm・奥行き45cm に 皿3枚)
  DRINK_LIMIT: 1,      // 飲み物は1杯まで
  EAT_MINUTES: 5,      // 押し忘れても、出してから何分で 自動で空になるか(自分で「食べる」「飲む」を押せば もっと早く空になる)
  CLEAR_SECONDS: 5,    // 空になってから 何秒で下げるか
  MENU: [
    /* 飲み物 */
    { id: 'beer',     cat: 'drink', kind: 'drink', name: '生ビール',       emoji: '🍺', model: 'mug',     color: '#f2b51c', desc: 'キンキンの中ジョッキ' },
    { id: 'nonal',    cat: 'drink', kind: 'drink', name: 'ノンアルビール', emoji: '🍺', model: 'mug',     color: '#e8c25a', desc: 'アルコール0.00%' },
    { id: 'highball', cat: 'drink', kind: 'drink', name: 'ハイボール',     emoji: '🥃', model: 'glass',   color: '#e6b45a', desc: 'すっきり濃いめ' },
    { id: 'lemon',    cat: 'drink', kind: 'drink', name: 'レモンサワー',   emoji: '🍋', model: 'glass',   color: '#f3ec9a', desc: '生レモンしぼり' },
    { id: 'umeshu',   cat: 'drink', kind: 'drink', name: '梅酒ロック',     emoji: '🍑', model: 'rock',    color: '#c9852e', desc: '梅の実入り' },
    { id: 'shochu',   cat: 'drink', kind: 'drink', name: '焼酎ロック',     emoji: '🥃', model: 'rock',    color: '#f4f0e6', desc: '芋・麦どちらでも' },
    { id: 'sake',     cat: 'drink', kind: 'drink', name: '熱燗',           emoji: '🍶', model: 'tokkuri', color: '#f4f0e6', desc: 'とっくり一合' },
    { id: 'reishu',   cat: 'drink', kind: 'drink', name: '冷酒',           emoji: '🍶', model: 'masu',    color: '#f4f6f0', desc: '升にこぼれる一杯' },
    { id: 'oolong',   cat: 'drink', kind: 'drink', name: 'ウーロン茶',     emoji: '🍵', model: 'glass',   color: '#8a4b1c', desc: '' },
    { id: 'cola',     cat: 'drink', kind: 'drink', name: 'コーラ',         emoji: '🥤', model: 'glass',   color: '#3a1a0c', desc: '' },
    { id: 'orange',   cat: 'drink', kind: 'drink', name: 'オレンジジュース', emoji: '🍊', model: 'glass', color: '#f39a1c', desc: '' },
    /* 名物(ダジャレ。中身はふつうの料理) */
    { id: 'mansion',  cat: 'meibutsu', kind: 'food', name: 'マンション系ラーメン', emoji: '🍜', model: 'ramen',    pun: true, real: '家系ラーメン', desc: '家系より、ちょっと上の階' },
    { id: 'indozou',  cat: 'meibutsu', kind: 'food', name: 'インド像カレー',       emoji: '🍛', model: 'curry',    pun: true, real: 'カレーライス', desc: 'ゾウさんも びっくり' },
    { id: 'nobuya',   cat: 'meibutsu', kind: 'food', name: 'のぶ屋の牛丼',         emoji: '🍚', model: 'gyudon',   pun: true, real: '牛丼', desc: 'はやい・うまい・ノブ' },
    { id: 'shinseki', cat: 'meibutsu', kind: 'food', name: '親戚丼',               emoji: '🍳', model: 'oyakodon', pun: true, real: '親子丼', desc: '親子より ちょっと遠い' },
    { id: 'tororo',   cat: 'meibutsu', kind: 'food', name: 'とろ〜ろそば',         emoji: '🥢', model: 'tororosoba', pun: true, real: 'とろろそば', desc: 'のばすと おいしくなる' },
    { id: 'curryoton',cat: 'meibutsu', kind: 'food', name: 'カレーおとん',         emoji: '🍜', model: 'curryudon', pun: true, real: 'カレーうどん', desc: 'おかんには ないしょ' },
    { id: 'pizzakozo',cat: 'meibutsu', kind: 'food', name: 'ピザこぞう',           emoji: '🍕', model: 'pizza',    pun: true, real: 'ピザ', desc: '一人前の 小さいピザ' },
    /* おつまみ */
    { id: 'edamame',  cat: 'otsumami', kind: 'food', name: '枝豆',       emoji: '🫛', model: 'edamame',  desc: '塩ゆで' },
    { id: 'hiyayakko',cat: 'otsumami', kind: 'food', name: '冷奴',       emoji: '🧊', model: 'hiyayakko', desc: 'ねぎと かつおぶし' },
    { id: 'dashimaki',cat: 'otsumami', kind: 'food', name: 'だし巻き卵', emoji: '🍳', model: 'dashimaki', desc: '大根おろし添え' },
    { id: 'takowasa', cat: 'otsumami', kind: 'food', name: 'たこわさ',   emoji: '🐙', model: 'takowasa', desc: 'ツンとくる' },
    { id: 'motsuni',  cat: 'otsumami', kind: 'food', name: 'もつ煮込み', emoji: '🍲', model: 'motsuni',  desc: '味噌でじっくり' },
    { id: 'tsukemono',cat: 'otsumami', kind: 'food', name: 'お新香盛り', emoji: '🥒', model: 'tsukemono', desc: 'たくあん・きゅうり・しば漬け' },
    /* 揚げ物 */
    { id: 'karaage',  cat: 'age', kind: 'food', name: '唐揚げ',           emoji: '🍗', model: 'karaage', desc: 'レモン添え' },
    { id: 'fries',    cat: 'age', kind: 'food', name: 'ポテトフライ',     emoji: '🍟', model: 'fries',   desc: '一人前' },
    { id: 'friesbig', cat: 'age', kind: 'food', name: '山盛りポテトフライ', emoji: '🍟', model: 'friesbig', desc: '一人前を、上にこんもり' },
    { id: 'agedashi', cat: 'age', kind: 'food', name: '揚げ出し豆腐',     emoji: '🍢', model: 'agedashi', desc: 'あったか おだし' },
    /* 魚 */
    { id: 'sashimi',  cat: 'sakana', kind: 'food', name: 'お刺身',         emoji: '🐟', model: 'sashimi', desc: 'まぐろ・サーモン' },
    { id: 'sanma',    cat: 'sakana', kind: 'food', name: 'さんまの塩焼き', emoji: '🐟', model: 'sanma',   desc: '大根おろし・すだち' },
    { id: 'kinmedai', cat: 'sakana', kind: 'food', name: '金目鯛の煮付け', emoji: '🐠', model: 'kinmedai', desc: '甘辛く ことこと' },
    { id: 'ajifry',   cat: 'sakana', kind: 'food', name: 'アジフライ',     emoji: '🐟', model: 'ajifry',  desc: 'サクッと二枚' },
    /* 肉 */
    { id: 'yakitori', cat: 'niku', kind: 'food', name: '焼き鳥',               emoji: '🍢', model: 'yakitori', desc: 'もも・ねぎま' },
    { id: 'steak',    cat: 'niku', kind: 'food', name: 'ステーキ',             emoji: '🥩', model: 'steak',    desc: '鉄板でジュウ' },
    { id: 'yakiniku', cat: 'niku', kind: 'food', name: '高級焼肉 三種盛り',    emoji: '🥩', model: 'yakiniku', desc: 'カルビ・ロース・タン' },
    { id: 'rafute',   cat: 'niku', kind: 'food', name: 'ラフテー',             emoji: '🍖', model: 'rafute',   desc: '沖縄の豚の角煮' },
    /* 鍋・煮物 */
    { id: 'oden',     cat: 'nabe', kind: 'food', name: 'おでん',       emoji: '🍢', model: 'oden',      desc: '大根・たまご・こんにゃく' },
    { id: 'motsunabe',cat: 'nabe', kind: 'food', name: '一人もつ鍋',   emoji: '🍲', model: 'motsunabe', desc: 'キャベツ・にら たっぷり' },
    /* サラダ */
    { id: 'potesara', cat: 'salad', kind: 'food', name: 'ポテトサラダ',   emoji: '🥔', model: 'potesara', desc: '' },
    { id: 'caesar',   cat: 'salad', kind: 'food', name: 'シーザーサラダ', emoji: '🥗', model: 'caesar',   desc: 'クルトンとチーズ' },
    { id: 'daikonsalad', cat: 'salad', kind: 'food', name: '大根サラダ', emoji: '🥗', model: 'daikonsalad', desc: 'のり と ごまだれ' },
    /* ご飯・麺 */
    { id: 'onigiri',  cat: 'gohan', kind: 'food', name: 'おにぎり',   emoji: '🍙', model: 'onigiri',  desc: '鮭・梅' },
    { id: 'ochazuke', cat: 'gohan', kind: 'food', name: 'お茶漬け',   emoji: '🍵', model: 'ochazuke', desc: 'しめに' },
    /* お祝いモードの限定(only の日だけ出る) */
    { id: 'x_chicken', cat: 'gentei', only: 'xmas',     kind: 'food', name: 'フライドチキン',     emoji: '🍗', model: 'chicken',   desc: 'クリスマスの定番。骨つき' },
    { id: 'x_cake',    cat: 'gentei', only: 'xmas',     kind: 'food', name: 'クリスマスケーキ',   emoji: '🍰', model: 'cake',      desc: 'いちごのショートケーキ' },
    { id: 'x_champ',   cat: 'gentei', only: 'xmas',     kind: 'drink', name: 'シャンパン',     emoji: '🥂', model: 'champagne', color: '#f2d98a', desc: 'しゅわっと乾杯' },
    { id: 'x_champ0',  cat: 'gentei', only: 'xmas',     kind: 'drink', name: 'ノンアルシャンパン', emoji: '🥂', model: 'champagne', color: '#f6e6b0', desc: 'アルコール0%' },
    { id: 'n_soba',    cat: 'gentei', only: 'newyear',  kind: 'food', name: '年越しそば',         emoji: '🍜', model: 'soba',      desc: 'えび天のせ。細く長く' },
    { id: 'n_ozoni',   cat: 'gentei', only: 'newyear',  kind: 'food', name: 'お雑煮',             emoji: '🍲', model: 'ozoni',     desc: '角もちのすまし' },
    { id: 'n_osechi',  cat: 'gentei', only: 'newyear',  kind: 'food', name: 'おせち',             emoji: '🍱', model: 'osechi',    desc: 'お重に いろいろ' },
    { id: 'n_iwaizake',cat: 'gentei', only: 'newyear',  kind: 'drink', name: '祝い酒(升)',     emoji: '🍶', model: 'masu',      desc: '新年のお祝いに' },
    { id: 'n_amazake', cat: 'gentei', only: 'newyear',  kind: 'drink', name: '甘酒',           emoji: '🍵', model: 'amazake',   desc: 'アルコールなし。あったか' },
    { id: 'b_cake',    cat: 'gentei', only: 'birthday', kind: 'food', name: 'バースデーケーキ',   emoji: '🎂', model: 'bdcake',    desc: 'ろうそくつき。主役に' },
    { id: 'b_champ',   cat: 'gentei', only: 'birthday', kind: 'drink', name: 'シャンパン',     emoji: '🥂', model: 'champagne', color: '#f2d98a', desc: 'お祝いの乾杯に' },
    { id: 'b_champ0',  cat: 'gentei', only: 'birthday', kind: 'drink', name: 'ノンアルシャンパン', emoji: '🥂', model: 'champagne', color: '#f6e6b0', desc: 'アルコール0%' }
  ],

  /* ---------------- 曲 ----------------
     src: 曲のファイルのアドレス(mp3 など)。このアプリの music/ に置いたら 'music/ファイル名.m4a' と書く
     11-20 ドライブ「居酒屋ノブの曲」の14曲に入れ替え(96k の m4a に軽くして music/ へ) */
  SONGS: [
    { id: 'm-golden',   title: 'Golden Hour',         src: 'music/golden-hour.m4a' },
    { id: 'm-wind',     title: 'Wind of Okinawa',     src: 'music/wind-of-okinawa.m4a' },
    { id: 'm-ano',      title: 'あの三ヶ月',           src: 'music/ano-sankagetsu.m4a' },
    { id: 'm-okinawa',  title: '沖縄の風にのって',     src: 'music/okinawa-no-kaze.m4a' },
    { id: 'm-asa',      title: '朝の光に送ります',     src: 'music/asa-no-hikari.m4a' },
    { id: 'm-choki',    title: '超気持ちいい',         src: 'music/chokimochii.m4a' },
    { id: 'm-kiiro',    title: '黄色が好き',           src: 'music/kiiro-uta.m4a' },
    { id: 'm-kiiro-r',  title: '黄色が好き(ラップ)',   src: 'music/kiiro-rap.m4a' },
    { id: 'm-omocha',   title: 'ひみつのおもちゃ箱',   src: 'music/himitsu-omochabako.m4a' },
    { id: 'm-hunter',   title: 'ハンター',             src: 'music/hunter.m4a' },
    { id: 'm-hiyukko',  title: 'ひゆっこちゃんは みんなのプリンセス', src: 'music/hiyukko-princess.m4a' },
    { id: 'm-sotto',    title: 'ぶちっじゃなくて そっと', src: 'music/sotto.m4a' },
    { id: 'm-chikyu',   title: '地球へようこそ',       src: 'music/chikyu-e-youkoso.m4a' },
    { id: 'm-nidai',    title: '荷台の重さ',           src: 'music/nidai-no-omosa.m4a' }
  ],
  // お店の動画(大将のうしろのモニターで流せる。足すときは ここに1行)。11-20 ホームページの YouTube 動画を全部
  // tall: true … 縦に撮った動画(モニターを縦にする)。ショートでなくても縦の動画がある。足したら python3 tools/video-shape.py で確かめる(11-21 ノブさん)
  VIDEOS: [
    { id: 'v-kokoro', src: 'https://youtu.be/WsvsmZkaC2Q', title: '心上等', tall: true },
    { id: 'v-dear-e', src: 'https://youtu.be/pJwx7CJEMoc', title: 'dear feat. EMIRIN', tall: true },
    { id: 'v-dear',   src: 'https://youtu.be/k0y5ZOXHDFg', title: 'dear', tall: true },
    { id: 'v-mama',   src: 'https://youtu.be/EL9wC8z6ERc', title: 'ママへの想い', tall: true },
    { id: 'v-omocha', src: 'https://youtu.be/9gTNoVWstSk', title: 'ひみつのおもちゃ箱' },
    { id: 'v-code',   src: 'https://youtu.be/Ud0yZ-VS2lU', title: 'CODE LOVE', tall: true },
    { id: 'v-sena',   src: 'https://www.youtube.com/shorts/zTkUrPNrBEo', title: '聖奈のルール', tall: true },
    { id: 'v-ganba',  src: 'https://www.youtube.com/shorts/CxY3V32idt0', title: '頑張らなくていい', tall: true },
    { id: 'v-hunter', src: 'https://youtu.be/6-EKdZDA0-Q', title: 'ハンターカブ PV「ARE YOU A HUNTER?」' },
    { id: 'v-ise',    src: 'https://youtu.be/xgdnkC6Zk7E', title: '伊勢神宮巡り' },
    { id: 'v-michi',  src: 'https://youtu.be/EtXsStSuXY8', title: '道の先へ' },
    { id: 'v-kyoto',  src: 'https://youtu.be/vVNb-xA1B_4', title: '京都、六日間' }
  ],
  // 壁の木札にかならず出す品(ほかは名物から順に、入るだけ)
  TAG_ALWAYS: ['beer', 'sake', 'reishu'],
  ALLOW_YOUTUBE: true,        // お客さんが YouTube のリンクを貼ってリクエストできるか
  MAX_QUEUE: 20,              // リクエストの順番待ちは何曲まで

  /* ---------------- 決まり文句(声つき) ----------------
     who: 'owner'(大将が言う)/ 'all'(その人が言う)
     voice: 声のファイル。置いてなければ、say の文を 仮の読み上げで言う
     btn: true なら お客さんのボタンに出る */
  /* お客さん用の決まり文句。main: true は 入力らんの上にいつも並ぶ。ほかは「💬 もっと」から。
     id を変えると声のファイルが使われなくなるので、言葉を変えたら声も作り直す */
  GUEST_PHRASES: [
    { id: 'kanpai',      cat: 'のむ',     say: 'かんぱーい！',       emoji: '🍻', main: true },
    { id: 'g_merry',     cat: 'おいわい', say: 'メリークリスマス！',   emoji: '🎄', main: true, only: 'xmas' },
    { id: 'g_akeome',    cat: 'おいわい', say: 'あけましておめでとう！', emoji: '🎍', main: true, only: 'newyear' },
    { id: 'g_hbd',       cat: 'おいわい', say: 'お誕生日おめでとう！', emoji: '🎂', main: true, only: 'birthday' },
    { id: 'okawari',     cat: 'のむ',     say: 'おかわり！',         emoji: '🙋', main: true },
    { id: 'umai',        cat: 'のむ',     say: 'うまい！',           emoji: '😋', main: true },
    { id: 'g_oishii',    cat: 'のむ',     say: 'おいしい〜！',       emoji: '🤤' },
    { id: 'gochisou',    cat: 'のむ',     say: 'ごちそうさま！',     emoji: '🙏' },
    { id: 'g_otsukare',  cat: 'あいさつ', say: 'おつかれー！',       emoji: '🙌', main: true },
    { id: 'g_yaho',      cat: 'あいさつ', say: 'やっほー！',         emoji: '👋' },
    { id: 'g_hisashi',   cat: 'あいさつ', say: 'ひさしぶり！',       emoji: '😆' },
    { id: 'g_yoroshiku', cat: 'あいさつ', say: 'よろしくね！',       emoji: '🤝' },
    { id: 'g_tadaima',   cat: 'あいさつ', say: 'ただいま！',         emoji: '🏠' },
    { id: 'g_okaeri',    cat: 'あいさつ', say: 'おかえり！',         emoji: '🤗' },
    { id: 'g_sorena',    cat: 'あいづち', say: 'それな！',           emoji: '👉', main: true },
    { id: 'g_wakaru',    cat: 'あいづち', say: 'わかる〜！',         emoji: '🙆' },
    { id: 'g_iine',      cat: 'あいづち', say: 'いいね！',           emoji: '👍', main: true },
    { id: 'g_ukeru',     cat: 'あいづち', say: 'ウケる！',           emoji: '🤣', main: true },
    { id: 'g_maji',      cat: 'あいづち', say: 'え、まじで！？',     emoji: '😲' },
    { id: 'g_naruhodo',  cat: 'あいづち', say: 'なるほど〜',         emoji: '🤔' },
    { id: 'g_sugoi',     cat: 'あいづち', say: 'すごい！',           emoji: '✨' },
    { id: 'g_hakushu',   cat: 'あいづち', say: 'パチパチパチ！',     emoji: '👏' },
    { id: 'g_omedeto',   cat: 'あいづち', say: 'おめでとう！',       emoji: '🎉' },
    { id: 'g_arigato',   cat: 'あいづち', say: 'ありがとう！',       emoji: '😊' },
    { id: 'g_gomen',     cat: 'あいづち', say: 'ごめんね！',         emoji: '🙇' },
    { id: 'g_hazusu',    cat: 'かえる',   say: 'ちょっと席はずすね', emoji: '🚶' },
    { id: 'g_mata',      cat: 'かえる',   say: 'また来るね！',       emoji: '👋' },
    { id: 'g_oyasumi',   cat: 'かえる',   say: 'おやすみ〜',         emoji: '🌙' }
  ],
  /* 大将用の決まり文句(大将の画面にだけ出る)。auto: 店が自動で言うもの(ボタンにも出る) */
  OWNER_PHRASES: [
    { id: 'irasshai',   cat: 'むかえる', say: 'いらっしゃい！',               main: true },
    { id: 'o_merry',    cat: 'おいわい', say: 'メリークリスマス！',            emoji: '🎄', main: true, only: 'xmas' },
    { id: 'o_akeome',   cat: 'おいわい', say: 'あけましておめでとうございます！', emoji: '🎍', main: true, only: 'newyear' },
    { id: 'o_hbd',      cat: 'おいわい', say: 'お誕生日おめでとうございます！', emoji: '🎂', main: true, only: 'birthday' },
    { id: 'o_okaeri',   cat: 'むかえる', say: 'おかえりなさい！' },
    { id: 'o_nani',     cat: 'むかえる', say: '何にします？',                 main: true },
    { id: 'haiyo',      cat: 'だす',     say: 'はいよ！',                     main: true },
    { id: 'omachi',     cat: 'だす',     say: 'はい、お待ち！' },
    { id: 'o_service',  cat: 'だす',     say: 'こちらはサービスです！' },   // 注文がないのに大将が出すとき(自動で言う)
    { id: 'o_shosho',   cat: 'だす',     say: '少々お待ちを！' },
    { id: 'o_atsui',    cat: 'だす',     say: '熱いから気をつけてね' },
    { id: 'o_kanpai',   cat: 'もりあげ', say: 'かんぱーい！',  emoji: '🍻',   main: true },
    { id: 'o_iine',     cat: 'もりあげ', say: 'いいねえ！' },
    { id: 'o_moriagari',cat: 'もりあげ', say: '盛り上がってるねえ！' },
    { id: 'o_omedeto',  cat: 'もりあげ', say: 'おめでとうございます！' },
    { id: 'o_okawari',  cat: 'もりあげ', say: 'おかわり、どうですか？' },
    { id: 'o_arigato',  cat: 'もりあげ', say: 'ありがとうございます！',      main: true },
    { id: 'o_maido',    cat: 'もりあげ', say: '毎度！' },
    { id: 'o_goyukkuri',cat: 'もりあげ', say: 'ごゆっくりどうぞ' },
    { id: 'lastcall',   cat: 'おくる',   say: 'そろそろ閉店です。ラストオーダー、どうぞ！' },
    { id: 'mataokoshi', cat: 'おくる',   say: 'またお越しください！',        main: true },
    { id: 'o_kiwotsukete', cat: 'おくる', say: '気をつけて帰ってね！' },
    { id: 'oyasumi',    cat: 'おくる',   say: 'おやすみなさい！' },
    { id: 'o_photo',    cat: 'さつえい', say: '記念撮影しまーす！' },
    { id: 'o_cheese',   cat: 'さつえい', say: 'はい、チーズ！' }
  ],

  /* 記念撮影(大将の自撮り風)。SEC: カウントダウンの秒数 / PICK_FROM〜PICK_TO: ポーズと表情を選べる残り秒数 /
     KEEP_DAYS: 大将のスマホに写真を とっておく日数(すぎたら自動で消す)。秒数は まだ決めている途中(ノブさん 2026-11-19) */
  /* 常連の女の子(ボット)。お客さんが1人以下の時だけ、少しあとから来て 静かに飲む。2人以上になったら帰る(2026-11-21 ノブさん)
     NAME: 名前(AI を思わせる名前。候補: アイ・アン・ナノ・ピコ) / WAIT_MIN: 何分たったら来るか / SEAT: 座る席(0 から数える。1 = 奥から2番目)
     LEAVE_SEC: お客さんが多くなってから 帰るまでの秒(少し間をおく) / TALK: しゃべる言葉 */
  REGULAR: { NAME: 'アイちゃん', CALL: ['アイ', 'あいちゃん', '愛ちゃん'], MAX_GUESTS: 2,
    HAIR: '#c4a27e',   // 髪の色はいつも同じ(ミルクティー。ノブさんが選んだ 2026-11-21)
    FACE: { hair: 'shortbob', bangs: 'nagashi', eyes: 'round', brows: 'soft', mouth: 'soft', cheek: 1, lip: 3, skin: 1, face: 'egg' },   // 顔・髪型もいつも同じ(ショートボブ・前髪を流す・まる目・少し面長でほっぺ控えめ=20代前半。ノブさんが候補から選んだ 2026-11-21)
    /* 服・ネックレス・髪のリボン(アイちゃんだけのもの。ノブさんが選んだ 2026-11-21)。来るたびに組み合わせて着てくる。
       20代前半の落ち着いた可愛さ。フリル・派手な色はなし。色は うすいパステル、パンツは落ち着いた色も */
    FITS: [   // [服, 下の色('paleB'=うすい色 / 'calm'=落ち着いた色 / ''=服で決まり)]
      ['turtle', ''], ['turtle2', 'paleB'], ['knitdress', ''], ['shirtdress', ''], ['cardi', 'paleB'], ['cardi2', 'paleB'], ['denim', ''],
      ['pleats', 'paleB'], ['blouse', 'calm'], ['jacket', ''], ['vdress', ''], ['boat', 'paleB'], ['vknit', 'calm'], ['wide', 'paleB'],
      ['satin', 'calm'], ['openshirt', 'calm'], ['jacket2', 'calm'], ['quilt', 'calm'], ['hoodie', ''], ['sweat', 'calm'], ['tee', 'paleB']],
    PALE: ['#ecd6a6', '#a9c2e0', '#e3c0b6', '#b5cca8', '#e3b6c4', '#f3efe8', '#c4b6de', '#d8c8b4', '#bcc4d0'],   // 上の色(うすいパステル。お店の明かりがオレンジなので、写真で見分けがつくくらいに少しだけ はっきりめ)
    PALE_B: ['#cfc4b4', '#d8ccbc', '#c8bca8', '#d4cfc8', '#bcc4d0', '#a9c2e0'],   // スカート・パンツの うすい色
    CALM: ['#3a3a42', '#7a7a82', '#5a5048', '#5a6270', '#8a8478', '#4a4448'],   // パンツなどの 落ち着いた色
    OPEN: ['blouse', 'boat', 'openshirt', 'vdress'],   // 胸元が開いた服 → 必ずネックレス
    NO_NECK: ['hoodie', 'sweat', 'tee', 'quilt'],   // ネックレスを付けない服
    NECKS: ['pearl1', 'heart', 'flower', 'coin', 'double'],
    RIBBONS: ['big', 'big', 'small', 'tails'],   // 髪のリボン(大きなリボンを多めに)
    RIBBON_COLORS: ['#2c3550', '#d9b3b8', '#b8c8dc', '#f2ece2', '#7a2a36'],   // 紺・くすみピンク・うすい水色・白・ボルドー
    RIBBON_RATE: 0.8,   // リボンを付けてくる割合
    GAME_MIN: [2, 5], GAME_RATE: [0.06, 0.25],   // ミニゲーム: 来てから 何分後に1回遊ぶか / 取れる最高点の 何割くらいを出すか(ほどほど。お客さんが がんばれば勝てるくらい)
    ACCS: ['maru', 'flower', 'muffler'],   // そのほかの小物(丸メガネ・花の髪かざり・マフラーは冬だけ)。ときどき
    /* 大将の「👧 アイちゃん」の操作パネルで出す名前(2026-11-23)。服は 種類ごとに分けて並べる。「|」はボタンの中で 行を変える所 */
    FIT_NAMES: {
      knitdress: ['ニットの|ワンピース', 'ワンピース'], shirtdress: ['シャツ|ワンピース', 'ワンピース'], vdress: ['Vネックの|ワンピース', 'ワンピース'],
      turtle: ['タートル+|チェック', 'スカート'], turtle2: ['タートル+|スカート', 'スカート'], boat: ['ボートネック', 'スカート'], pleats: ['ニット+|プリーツ', 'スカート'],
      cardi: ['前あき|カーディガン', 'スカート'], cardi2: ['ボタンの|カーディガン', 'スカート'], denim: ['デニム|スカート', 'スカート'], blouse: ['ブラウス+|タイト', 'スカート'], jacket: ['ジャケット+|スカート', 'スカート'],
      vknit: ['Vネックの|ニット', 'パンツ'], wide: ['ワイドパンツ', 'パンツ'], satin: ['つや|ブラウス', 'パンツ'], openshirt: ['開襟シャツ', 'パンツ'], jacket2: ['ジャケット+|パンツ', 'パンツ'],
      quilt: ['キルティング|ベスト', 'ラフ'], hoodie: ['パーカー', 'ラフ'], sweat: ['スウェット', 'ラフ'], tee: ['Tシャツ', 'ラフ']
    },
    FIT_GROUPS: [['ワンピース', '👗'], ['スカート', '🩰'], ['パンツ', '👖'], ['ラフ', '🧢']],
    NECK_NAMES: { pearl1: 'パール', heart: 'ハート', flower: 'お花', coin: 'コイン', double: '2れん' },
    RIBBON_NAMES: { big: '大きいリボン', small: '小さいリボン', tails: '長いリボン' },
    ACC_NAMES: { maru: '丸メガネ', flower: '花の髪かざり', muffler: 'マフラー' },
    WAIT_MIN: 3, SEAT: 1, LEAVE_SEC: [20, 40],   // 名前はカタカナ+ひらがなの「ちゃん」(ノブさん 2026-11-21)。お客さん MAX_GUESTS 人までのとき来る
    VOICE: 'g_zephyr',   // 声: 明るい声(ノブさんが A を選んだ 2026-11-21)。言葉の声は voice/ai/(少し高め。返事はもう少し高め 11-21)
    TALK_EVERY: 2,   // 自分から話す間かく(分)のはじめの値。大将が「店主の操作」で 1・2・5・10分 から選べる(state.aiTalk)
    /* しゃべる言葉(ノブさんが選んだ 2026-11-21)。[id, 言葉]。id は あとで録る声のファイル名(voice/ai/<id>.m4a) */
    TALK: {
      idle:   [['a1', 'ここ、落ち着くなあ'], ['a2', '今日もおつかれさまです'], ['a3', 'この曲、すき'], ['a8', 'この時間が、いちばん好き'],
               ['s1', 'はあ、今日もよくがんばった'], ['s2', 'ここに来ると、ほっとするなあ'], ['s3', 'なに頼もうか、迷っちゃう'], ['s4', '明日もがんばろうっと'], ['s5', 'もう一杯だけ、いいかな'],
               ['s6', 'いい匂いがしてきた'], ['s7', '大将の料理、ほんとにおいしいんだよね'], ['s8', '今日はゆっくりしていこうかな'], ['s9', 'にぎやかなの、うれしいな'], ['s10', '今日は来てよかった']],   // ときどき言うひとこと(11-21 ノブさんが選んだ s1〜s10 を足した)
      ask:    [['q1', '今日はなに飲んでるんですか？'], ['q5', '今日はどんな一日でした？'], ['q6', '最近ハマってること、ありますか？'], ['q7', '休みの日って、なにしてるんですか？'],
               ['q9', '好きな食べ物って、なんですか？'], ['q10', '一緒に、飲みましょう'], ['q11', '最近おいしかったもの、教えてください'], ['q12', '行ってみたい場所って、ありますか？'], ['q13', '子どものころ、なにになりたかったですか？'],
               ['q14', '次はなに頼みます？'], ['m1', '私、お話するの大好きなんです'], ['m2', '記念撮影するなら、私が撮りますよ']],   // お客さんへの話しかけ(会話のきっかけ。お客さんがいるとき。11-21 ノブさん「多めに賛成」。m1・m2 はノブさんの言葉)
      fri:    [['t1', '金曜日の夜って、いいですよね'], ['t2', '一週間、おつかれさまでした']],   // 金曜の夜だけ
      late:   [['t3', '遅い時間まで、おつかれさまです']],   // 夜おそく(21時すぎ)
      lo:     [['t4', 'もうすぐラストオーダーかな'], ['t5', 'あっという間だなあ']],   // 閉店の15分前から
      dec:    [['t6', '年末って、なんだかそわそわしますね']],   // 12月だけ
      game:   [['gm1', '大将、ゲームやってもいいですか？']],   // ミニゲームを始めるとき(ノブさんの言葉)
      yum:    [['y1', 'うまい！'], ['y2', 'おいしい〜！']],   // 食べ終わったとき(アイちゃんの声で 11-21)
      svc:    [['sv1', 'わあ、大将、ありがとう！'], ['sv2', 'えっ、いいんですか？ありがとうございます！'], ['sv3', 'うれしい！大将、ありがとう！']],   // 大将がサービスで出してくれたとき(必ず お礼。11-21 ノブさん)
      eat:    [['b3', 'ごちそうさまでした'], ['b4', 'これ、また頼もうかな'], ['b6', 'あったまる〜'], ['b7', '次はなにを頼もうかな']],   // 食べ終わったとき(ほかに「うまい！」「おいしい〜！」の声)
      hello:  [['c1', 'こんばんは。おじゃまします'], ['c2', 'こんばんは〜。今日も来ちゃった'], ['c3', 'あ、こんばんは。となり、いいですか？']],   // 来たとき(c3 はお客さんがいるときだけ)
      bye:    [['d1', 'そろそろ帰るね。ごゆっくり〜'], ['d2', 'にぎやかになってきたから、お先に失礼するね'], ['d3', 'また来るね。おやすみなさい'], ['d4', 'ごちそうさまでした。またね〜']],
      thanks: [['e1', 'ありがとう！よろしくね'], ['e2', 'ありがとう〜、よろしくね！'], ['e3', 'えへへ、ありがとう。うれしいな'], ['e5', '声かけてくれて、ありがとう！']],   // 話しかけられたとき
      kanpai: [['f1', 'かんぱーい！'], ['f2', 'わたしも、かんぱい！']],   // ほかの人の乾杯に加わるとき
      owner:  [['g1', '大将、今日もおいしいです'], ['g2', '大将、いつものください'], ['g3', 'がんばってね、大将！'], ['o1', '大将、今日のおすすめはなんですか？'], ['o2', '大将、この前のあれ、おいしかったです'], ['o3', '大将、いつもありがとう'], ['o4', '大将も、一杯どうですか？']],   // 大将がいるとき(11-21 o1〜o4 を足した)
      cheer:  [['i1', 'すごーい！'], ['i2', 'おめでとう〜！']],   // だれかが本日の最高得点を出したとき(ミニゲーム)
      winter: [['h1', '寒い日は、あったかいのがいちばん']], summer: [['h2', '冷たいのが、おいしい季節だね']], spring: [['h3', '春の夜って、うきうきするね']]
    } },
  PHOTO: { SEC: 20, PICK_FROM: 15, PICK_TO: 3, KEEP_DAYS: 30, LAYOUT: 'N4' },   // LAYOUT: 並び方(js/scene3d.js の PHOTO_LAYOUTS。N1〜N4。ノブさんが N4 すき間に顔 に決めた 2026-11-20)

  /* お祝いモード(大将が ☰ → 🏮店主 で切りかえる)。飾り・限定メニュー(MENU の only)・限定の決まり文句(PHRASES の only)・仮装。
     hats / bodies: その日だけの かぶりもの・たすき。FACES: どの日でも使える 変なメガネ */
  CELEBRATE: {
    xmas:     { name: 'クリスマス', emoji: '🎄', hello: '🎄 今夜はクリスマスの特別営業！ 🎭仮装 で サンタやトナカイになれます',
                hats: [['santa', '🎅 サンタ帽'], ['reindeer', '🦌 トナカイ'], ['treehat', '🎄 ツリー帽']], bodies: [] },
    newyear:  { name: 'お正月',     emoji: '🎍', hello: '🎍 新年の特別営業！ 🎭仮装 で ひつじ(2027年は未年)や鏡餅になれます',
                hats: [['sheep', '🐑 ひつじ耳'], ['mochi', '🍊 鏡餅'], ['iwai', '🎌 祝はちまき']], bodies: [] },
    birthday: { name: '誕生日',     emoji: '🎂', hello: '🎂 今夜は誕生日のお祝い！ 🎭仮装 で とんがり帽や王冠をどうぞ',
                hats: [['party', '🥳 とんがり帽'], ['crown', '👑 王冠']], bodies: [['sash', '🎗 本日の主役']] }
  },
  FACES: [['nosegl', '🥸 鼻メガネ'], ['starglass', '⭐ 星メガネ'], ['heartglass', '💖 ハートメガネ']],

  /* ノブさんの声を録音してある言葉の id(大将の声「ノブの声(録音)」で使う)。録音ページ rec.html で録って、voice/nobu/ に置く。
     ここにない言葉は、代わりの声(落ち着いた男性)で読む */
  /* 大将ノブの顔・髪型(ノブさんが 11-21 に選んだ: 9番 + まゆ・ひげを組み合わせ)。ノブさん本人が大将のときだけ。お客さんは選べない */
  /* ミニゲームの一覧(ノブさん 2026-11-22「今日のゲームはこれ、と出したい」)。1本 = games/<id>.js の1ファイル。遊ぶときだけ読みこむ。
     今日のゲーム: 大将が決めたもの。決めていなければ 日がわり(この並びの順に 毎日1つずつ。朝5時で かわる)。
     off: true … お店には出さない(作っている途中・ためし中)。新しいゲームの作り方は games/_template.js */
  GAMES: [
    { id: 'jokki', name: 'ジョッキ キャッチ', icon: '🍺', sec: 30, file: 'games/jokki.js', note: '落ちてくる料理を お盆で受け止める。焦げは よける' },
    { id: 'tataki', name: '大将をたたくな!', icon: '🔨', sec: 30, file: 'games/tataki.js', note: '大将そっくりの にせものを たたく。本物の大将は たたかない' },
    { id: 'bowling', name: 'ハンドレッド ボウリング', icon: '🎳', sec: 60, file: 'games/bowling.js', note: 'でたらめに ならんだ 100本のピンを、1投で 何本 倒せるか' },
    { id: 'golf', name: 'ナイスショット ゴルフ', icon: '⛳', sec: 150, unit: 'ヤード', noTimer: true, file: 'games/golf.js', note: '動く目もりの まん中で 打つ!を10回。飛んだヤードが点数(最高390)' },
    { id: '_template', name: '焼き鳥タップ(お手本)', icon: '🍢', sec: 20, file: 'games/_template.js', note: '新しいゲームの お手本', off: true }
  ],
  NOBU_FACE: { hair: 'n2', brow: 'k4', eye: 'e2', nose: 2, beard: 'b1', beardColor: '#4a4542', face: 'tall', skin: 2, mouth: 'nsmile', headColor: '#2a3a6a', backText: 'のぶ' },   // 11-22 ノブさんが決めた: 顔は 髪を横に流す(8番)で統一。服の基本は 紺の法被+藍のはちまき+背中「のぶ」(6番)。はちまきの色・背中の文字は 着がえで 変えられる
  NOBU_VOICE: ['irasshai', 'o_okaeri', 'o_nani', 'haiyo', 'omachi', 'o_service', 'o_shosho', 'o_atsui', 'o_kanpai', 'o_iine', 'o_moriagari', 'o_omedeto', 'o_okawari', 'o_arigato', 'o_maido', 'o_goyukkuri', 'lastcall', 'mataokoshi', 'o_kiwotsukete', 'oyasumi', 'o_photo', 'o_cheese']
};
SHOP.GUEST_PHRASES.forEach(function (p) { p.who = 'guest'; });
SHOP.OWNER_PHRASES.forEach(function (p) { p.who = 'owner'; });
SHOP.PHRASES = SHOP.GUEST_PHRASES.concat(SHOP.OWNER_PHRASES);   // id で探す用(2つの表の id は重ねない)
