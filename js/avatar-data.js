'use strict';
/* =====================================================================
   アバターの部品の一覧(2026-11-19 作りなおし・2代目)
   ・最初に「女性/男性」を選ぶ。髪型・目・服・小物は、女性用と男性用で別
   ・お客さん用と大将用で、服と小物が別(はちまき・前掛けなどは大将だけ。お客さんに制服はない)
   ・ここに1行足すと、着せかえの選択肢が増える。形そのものは js/scene3d.js の buildAvatar で作る
     (新しい id を足したら、scene3d.js にも その形を足す)
   ===================================================================== */
var AVATAR = {
  V: 2,
  SKIN: ['#fde7d6', '#f6d2b8', '#ecbf9c', '#d9a27a', '#b87c55', '#8a5638'],
  HAIR_COLOR: ['#1c1714', '#3a2620', '#5c3a26', '#8a5a36', '#b88a5a', '#d9b98a', '#e8e2d8', '#8a8a92', '#9a3a4a', '#c46a8a', '#3a4a7a', '#4a6a5a'],
  EYE_COLOR: ['#2a1a14', '#5a3a22', '#7a5a2a', '#2a4a7a', '#3a6a4a', '#6a3a6a', '#4a4a52'],
  CLOTH_COLOR: ['#2c3550', '#1d1d22', '#f2efe8', '#8a1f2a', '#2f5a44', '#c87a3a', '#6a5a8a', '#5a8ab8', '#d98aa0', '#e8d8b8', '#7a6a52', '#3a6a8a', '#b8b8c0', '#e8c84a'],
  LIP_COLOR: ['#d88080', '#e86a7a', '#c84a5a', '#e8968a', '#b85a6a'],

  /* 男女で同じもの */
  COMMON: {
    face: [['round', 'まる'], ['egg', 'たまご'], ['sharp', 'シャープ'], ['square', 'エラはり']],
    mouth: [['smile', 'にっこり'], ['soft', 'ほほえみ'], ['grin', 'にかっ'], ['flat', 'すまし'], ['open', 'ぽかん'], ['cat', 'ねこ口']]
  },
  /* 性別ごと: [id, 名前] */
  SEX: {
    m: {
      label: '男性',
      hair: [['short', 'さわやかショート'], ['twoblock', 'ツーブロック'], ['mash', 'マッシュ'], ['medium', 'ミディアム'], ['wolf', 'ウルフ'],
             ['perm', 'ゆるパーマ'], ['spiky', 'ツンツン'], ['back', 'オールバック'], ['long', '長め・ひとつ結び'], ['buzz', 'ぼうず']],
      bangs: [['down', '下ろす'], ['sideswept', '流す'], ['center', 'センター分け'], ['up', 'かき上げ(アップバング)'], ['short', '短め'], ['long', '長め(目にかかる)']],
      ahoge: [['off', 'なし'], ['on', 'あり']],
      eyes:  [['clear', 'くっきり'], ['cool', '切れ長'], ['round', 'まる目'], ['droopy', 'たれ目'], ['sharp', 'つり目'], ['smile', 'にこにこ'], ['narrow', 'ほそ目']],
      brows: [['thick', '太め'], ['natural', 'ふつう'], ['straight', 'まっすぐ'], ['up', 'きりっ'], ['worry', 'こまり']],
      beard: [['none', 'なし'], ['stubble', 'ぶしょうひげ'], ['chin', 'あごひげ'], ['mustache', '口ひげ'], ['full', 'フルひげ']],
      top:   [['suit', 'スーツ'], ['suitopen', 'スーツ(ノーネクタイ)'], ['shirt', 'シャツ'], ['polo', 'ポロシャツ'], ['knit', 'ニット'],
              ['hoodie', 'パーカー'], ['jacket', 'ジャケット+Tシャツ'], ['denim', 'デニムジャケット'], ['work', '作業着'], ['tee', 'Tシャツ']],
      acc:   [['none', 'なし'], ['glasses', '黒ぶちメガネ'], ['thin', 'ほそぶちメガネ'], ['sun', 'サングラス'], ['cap', 'キャップ'], ['beanie', 'ニット帽'], ['necklace', 'ネックレス']]
    },
    f: {
      label: '女性',
      hair: [['bob', 'ボブ'], ['shortbob', 'ショートボブ'], ['short', 'ショート'], ['long', 'ロング'], ['wave', 'ゆるふわロング'], ['ponytail', 'ポニーテール'],
             ['twin', 'ツインテール'], ['bun', 'おだんご'], ['halfup', 'ハーフアップ'], ['side', 'サイドまとめ']],
      bangs: [['seethrough', 'シースルー'], ['patsun', 'ぱっつん'], ['nagashi', '流す'], ['center', 'センター分け'], ['long', '長め(大人っぽく)']],
      ahoge: [['off', 'なし'], ['on', 'あり']],
      eyes:  [['big', 'ぱっちり'], ['droopy', 'たれ目'], ['cat', 'ねこ目'], ['cool', '切れ長'], ['smile', 'にこにこ'], ['round', 'まる目'], ['wink', 'ウインク']],
      brows: [['soft', 'ふんわり'], ['thin', '細め'], ['straight', '平行'], ['up', 'きりっ'], ['worry', 'こまり']],
      top:   [['blouse', 'ブラウス'], ['onepiece', 'ワンピース'], ['knit', 'ニット'], ['cardigan', 'カーディガン'], ['office', 'オフィスジャケット'],
              ['pantsuit', 'パンツスーツ'], ['hoodie', 'パーカー'], ['tee', 'Tシャツ'], ['denim', 'デニムジャケット'], ['work', '作業着']],
      acc:   [['none', 'なし'], ['earring', 'イヤリング'], ['necklace', 'ネックレス'], ['glasses', 'メガネ'], ['beret', 'ベレー帽'], ['band', 'カチューシャ'], ['ribbon', 'リボン'], ['sun', 'サングラス']]
    }
  },
  /* 髪型を選んだときに いっしょに付ける前髪(あとで変えられる)。オールバック・ぼうずは前髪なし */
  HAIR_BANGS: { m: { short: 'short', twoblock: 'sideswept', mash: 'long', medium: 'center', wolf: 'down', perm: 'down', spiky: 'up', back: 'up', long: 'center', buzz: 'short' } },
  /* 大将だけの服と小物(男女どちらでも) */
  OWNER_PARTS: {
    top:   [['happi', '法被(はっぴ)'], ['samue', '作務衣(さむえ)'], ['hakui', '板前の白衣'], ['jinbei', '甚平'], ['tee', 'Tシャツ']],
    head:  [['none', 'なし'], ['hachimaki', 'はちまき'], ['nejiri', 'ねじりはちまき'], ['tenugui', '手ぬぐい'], ['itamae', '板前帽'], ['bandana', 'バンダナ']],
    apron: [['none', 'なし'], ['navy', '紺の前掛け'], ['black', '黒の前掛け'], ['white', '白の前掛け'], ['brown', '茶の前掛け']]
  },
  /* 女性の大将(女将・看板娘)だけの服と小物。かわいらしい お店の衣装。上の大将の服も そのまま選べる */
  OWNER_PARTS_F: {
    top:   [['kimono', '着物とたすき'], ['yukata', '浴衣'], ['kappogi', '割烹着(かっぽうぎ)'], ['blouse', 'ブラウス(カフェ風)'],
            ['happi', '法被(はっぴ)'], ['samue', '作務衣(さむえ)'], ['hakui', '板前の白衣'], ['jinbei', '甚平'], ['tee', 'Tシャツ']],
    head:  [['none', 'なし'], ['kanzashi', 'かんざし'], ['flower', '花の髪かざり'], ['sankaku', '三角巾'], ['ribbon', 'リボン'], ['band', 'カチューシャ'],
            ['hachimaki', 'はちまき'], ['nejiri', 'ねじりはちまき'], ['tenugui', '手ぬぐい'], ['bandana', 'バンダナ']],
    apron: [['none', 'なし'], ['frill', '白のフリルエプロン'], ['pinkfrill', 'ピンクのフリルエプロン'], ['pink', 'ピンクの前掛け'], ['red', '赤の前掛け'],
            ['navy', '紺の前掛け'], ['black', '黒の前掛け'], ['white', '白の前掛け'], ['brown', '茶の前掛け']]
  },
  SIZE_MIN: 0.88, SIZE_MAX: 1.12,
  VOICES: [
    { name: '男性・低め', pitch: 0.75, rate: 1.0 },
    { name: '男性・ふつう', pitch: 0.95, rate: 1.05 },
    { name: '女性・ふつう', pitch: 1.25, rate: 1.05 },
    { name: '女性・高め', pitch: 1.5, rate: 1.1 }
  ],

  /* はじめから用意してあるアバター(「おまかせ」で選べる)。値は id で書く */
  PRESETS: {
    m: [
      { name: 'サラリーマン', skin: 1, face: 'egg', hair: 'short', bangs: 'sideswept', hairColor: 0, eyes: 'clear', brows: 'natural', mouth: 'soft', beard: 'none', top: 'suit', topColor: 0, acc: 'thin' },
      { name: 'カフェ好き', skin: 1, face: 'sharp', hair: 'medium', bangs: 'center', hairColor: 3, eyes: 'cool', brows: 'straight', mouth: 'flat', beard: 'none', top: 'knit', topColor: 9, acc: 'none' },
      { name: '職人さん', skin: 3, face: 'square', hair: 'twoblock', bangs: 'up', hairColor: 0, eyes: 'sharp', brows: 'thick', mouth: 'grin', beard: 'stubble', top: 'work', topColor: 10, acc: 'none' },
      { name: 'ゆるパーマ', skin: 1, face: 'round', hair: 'perm', bangs: 'down', hairColor: 2, eyes: 'droopy', brows: 'natural', mouth: 'smile', beard: 'none', top: 'hoodie', topColor: 12, acc: 'cap' },
      { name: 'ダンディ', skin: 2, face: 'square', hair: 'back', hairColor: 7, eyes: 'cool', brows: 'thick', mouth: 'soft', beard: 'chin', top: 'jacket', topColor: 1, acc: 'none' },
      { name: 'デザイナー', skin: 0, face: 'egg', hair: 'mash', bangs: 'long', hairColor: 1, eyes: 'round', brows: 'straight', mouth: 'flat', beard: 'none', top: 'tee', topColor: 1, acc: 'glasses' }
    ],
    f: [
      { name: 'オフィス', skin: 0, face: 'egg', hair: 'wave', bangs: 'seethrough', hairColor: 3, eyes: 'big', brows: 'soft', mouth: 'smile', lip: 0, cheek: 1, top: 'office', topColor: 2, acc: 'earring' },
      { name: 'カフェ店員', skin: 1, face: 'round', hair: 'bob', bangs: 'patsun', hairColor: 2, eyes: 'droopy', brows: 'soft', mouth: 'soft', lip: 3, cheek: 2, top: 'cardigan', topColor: 9, acc: 'none' },
      { name: 'クール', skin: 0, face: 'sharp', hair: 'long', bangs: 'center', hairColor: 0, eyes: 'cool', brows: 'straight', mouth: 'flat', lip: 2, cheek: 0, top: 'pantsuit', topColor: 1, acc: 'necklace' },
      { name: 'ふんわり', skin: 1, face: 'round', hair: 'twin', bangs: 'seethrough', ahoge: 'on', hairColor: 4, eyes: 'smile', brows: 'soft', mouth: 'smile', lip: 1, cheek: 2, top: 'onepiece', topColor: 8, acc: 'ribbon' },
      { name: 'アクティブ', skin: 2, face: 'egg', hair: 'ponytail', bangs: 'nagashi', hairColor: 1, eyes: 'cat', brows: 'up', mouth: 'grin', lip: 3, cheek: 1, top: 'hoodie', topColor: 7, acc: 'band' },
      { name: '職人さん', skin: 2, face: 'egg', hair: 'bun', bangs: 'seethrough', hairColor: 0, eyes: 'round', brows: 'natural', mouth: 'soft', lip: 4, cheek: 1, top: 'work', topColor: 3, acc: 'none' }
    ]
  },
  /* 大将(ノブさん)のはじめのアバター。あとで VRoid で作った本人そっくりのアバターに差しかえられるようにする */
  OWNER: { owner: true, sex: 'm', skin: 3, face: 'square', hair: 'short', bangs: 'short', hairColor: 0, eyes: 'sharp', brows: 'thick', mouth: 'grin', beard: 'stubble',
           top: 'happi', topColor: 0, head: 'hachimaki', apron: 'navy', size: 1.06, voice: 0 },

  color: function (list, v) { return typeof v === 'string' && v[0] === '#' ? v : (list[v] || list[0]); },
  /* その人が選べる部品の一覧 */
  parts: function (a, key) {
    var S = AVATAR.SEX[a.sex] || AVATAR.SEX.m;
    if (a.owner && a.sex === 'f' && AVATAR.OWNER_PARTS_F[key]) return AVATAR.OWNER_PARTS_F[key];
    if (a.owner && AVATAR.OWNER_PARTS[key]) return AVATAR.OWNER_PARTS[key];
    return S[key] || AVATAR.COMMON[key] || [];
  },
  random: function (sex) {
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
    sex = sex || (Math.random() < 0.5 ? 'm' : 'f');
    var p = JSON.parse(JSON.stringify(pick(AVATAR.PRESETS[sex])));
    var S = AVATAR.SEX[sex];
    p.sex = sex; p.hair = pick(S.hair)[0]; p.bangs = pick(S.bangs)[0]; p.ahoge = sex === 'f' && Math.random() < 0.3 ? 'on' : 'off'; p.hairColor = Math.floor(Math.random() * 6); p.eyes = pick(S.eyes)[0];
    p.top = pick(S.top)[0]; p.topColor = Math.floor(Math.random() * AVATAR.CLOTH_COLOR.length);
    p.acc = Math.random() < 0.5 ? 'none' : pick(S.acc)[0]; p.skin = Math.floor(Math.random() * 4);
    p.voice = sex === 'f' ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2);
    p.size = Math.round((0.94 + Math.random() * 0.12) * 100) / 100;
    return AVATAR.fix(p);
  },
  /* 足りない所・おかしな値を直す(古い保存データや、ほかの人から届いたデータでも こわれないように)。
     古い形(1代目)のデータは null を返す(作りなおしてもらう) */
  fix: function (a) {
    if (!a || (a.v !== 2 && !a.sex)) return null;
    var o = { v: 2, sex: a.sex === 'f' ? 'f' : 'm', owner: !!a.owner };
    function id(key, d) { var list = AVATAR.parts(o, key); var v = a[key]; for (var i = 0; i < list.length; i++) if (list[i][0] === v) return v; return d != null ? d : (list[0] ? list[0][0] : ''); }
    function c(v, list, d) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : (v >= 0 && v < list.length ? Math.floor(v) : d); }
    o.skin = c(a.skin, AVATAR.SKIN, 1);
    o.face = id('face'); o.mouth = id('mouth'); o.eyes = id('eyes'); o.brows = id('brows'); o.hair = id('hair'); o.bangs = id('bangs'); o.ahoge = id('ahoge', 'off');
    o.hairColor = c(a.hairColor, AVATAR.HAIR_COLOR, 0);
    o.eyeColor = c(a.eyeColor, AVATAR.EYE_COLOR, 0);
    if (o.sex === 'm') o.beard = id('beard', 'none');
    else { o.lip = c(a.lip, AVATAR.LIP_COLOR, 0); o.cheek = a.cheek >= 0 && a.cheek <= 2 ? Math.floor(a.cheek) : 1; }
    o.top = id('top'); o.topColor = c(a.topColor, AVATAR.CLOTH_COLOR, 0);
    if (o.owner) { o.head = id('head', 'none'); o.apron = id('apron', 'none'); }
    else o.acc = id('acc', 'none');
    o.voice = a.voice >= 0 && a.voice < AVATAR.VOICES.length ? Math.floor(a.voice) : (o.sex === 'f' ? 2 : 1);
    var s = +a.size; o.size = s >= AVATAR.SIZE_MIN && s <= AVATAR.SIZE_MAX ? s : 1;
    return o;
  },
  /* 古いデータでも なにか表示するための 代わり(性別がまだ決まっていない人用) */
  fallback: function (seed) { var r = AVATAR.random(seed % 2 ? 'f' : 'm'); return r; }
};
