'use strict';
/* =====================================================================
   アバターの部品の一覧 —— ここに1行足すと、着せかえの選択肢が1つ増える。
   (形そのものは js/scene3d.js の「アバターを組み立てる」で作る。新しい形を足すときは両方を直す)
   ===================================================================== */
var AVATAR = {
  SKIN: ['#fbe3cf', '#f1c7a5', '#e0a982', '#c98a5e', '#9a6340', '#6b4128'],
  HAIR_COLOR: ['#1b1310', '#3b2418', '#6b4024', '#a86b3c', '#d9b26a', '#e8e0d0', '#8a8a8a', '#b8325a', '#3c5bb8'],
  CLOTH_COLOR: ['#2c3e66', '#8a1f24', '#2f5d3a', '#e8e3d8', '#1d1d1f', '#d9822b', '#6d3f8f', '#4fa0c8', '#c44d7a', '#7a6a52'],
  EYE_COLOR: ['#241712', '#5a3416', '#2a4a7a', '#2f6a4a', '#7a2a4a', '#6a6a6a'],
  PARTS: {
    face:  ['まる', 'たまご', 'しかく', 'ほそ顔'],
    nose:  ['なし', 'てん', 'ちょこん', 'しっかり'],
    hair:  ['短め', 'ぼうず', 'ふつう', 'ツンツン', 'ボブ', 'ロング', 'おだんご', 'ポニーテール', 'オールバック', 'なし'],
    eyes:  ['まる', 'にこにこ', 'きりっ', 'たれ目', 'ぱっちり', 'ほそ目'],
    brows: ['ふつう', '太め', 'こまり', 'きりっ', 'なし'],
    mouth: ['にっこり', 'ふつう', 'おおわらい', 'への字', 'ぽかん'],
    beard: ['なし', 'あごひげ', '口ひげ', 'ぶしょうひげ'],
    top:   ['Tシャツ', '法被(はっぴ)', '作務衣(さむえ)', 'ジャケット', 'パーカー', '着物', 'エプロン'],
    acc:   ['なし', 'はちまき', 'メガネ', 'サングラス', '帽子', '手ぬぐい', 'ほっぺ赤']
  },
  /* 体の大きさ(0.85〜1.15) */
  SIZE_MIN: 0.85, SIZE_MAX: 1.15,

  /* はじめから用意してあるアバター(「おまかせ」で選べる) */
  PRESETS: [
    { name: 'サラリーマン', skin: 1, hair: 2, hairColor: 0, eyes: 0, brows: 0, mouth: 1, beard: 0, top: 3, topColor: 0, acc: 2, size: 1 },
    { name: 'OL',           skin: 0, hair: 5, hairColor: 2, eyes: 4, brows: 0, mouth: 0, beard: 0, top: 3, topColor: 3, acc: 6, size: 0.93 },
    { name: '職人',         skin: 2, hair: 1, hairColor: 0, eyes: 2, brows: 1, mouth: 3, beard: 3, top: 2, topColor: 9, acc: 5, size: 1.05 },
    { name: '学生',         skin: 1, hair: 3, hairColor: 1, eyes: 0, brows: 0, mouth: 2, beard: 0, top: 4, topColor: 7, acc: 0, size: 0.95 },
    { name: 'おばちゃん',   skin: 1, hair: 6, hairColor: 6, eyes: 1, brows: 0, mouth: 2, beard: 0, top: 6, topColor: 8, acc: 6, size: 0.92 },
    { name: 'ご隠居',       skin: 2, hair: 9, hairColor: 5, eyes: 5, brows: 1, mouth: 0, beard: 1, top: 5, topColor: 9, acc: 2, size: 0.97 }
  ],

  /* 大将(ノブさん)のアバター。あとで VRoid で作った本人そっくりのアバターに差しかえられるようにする */
  OWNER: { skin: 2, hair: 0, hairColor: 0, eyes: 2, brows: 1, mouth: 0, beard: 3, top: 1, topColor: 0, acc: 1, size: 1.08 },

  VOICES: [
    { name: '男性・低め', pitch: 0.75, rate: 1.0 },
    { name: '男性・ふつう', pitch: 0.95, rate: 1.05 },
    { name: '女性・ふつう', pitch: 1.25, rate: 1.05 },
    { name: '女性・高め', pitch: 1.5, rate: 1.1 }
  ],

  /* 色は「一覧の番号」か、自由に選んだ色('#rrggbb') */
  color: function (list, v) { return typeof v === 'string' ? v : (list[v] || list[0]); },

  random: function () {
    function r(n) { return Math.floor(Math.random() * n); }
    var P = AVATAR.PARTS;
    return {
      skin: r(AVATAR.SKIN.length), face: r(4), nose: r(4), eyeColor: r(3), hair: r(P.hair.length - 1), hairColor: r(6), eyes: r(P.eyes.length),
      brows: r(P.brows.length - 1), mouth: r(3), beard: Math.random() < 0.25 ? 1 + r(3) : 0,
      top: r(P.top.length), topColor: r(AVATAR.CLOTH_COLOR.length), acc: Math.random() < 0.5 ? 0 : r(P.acc.length),
      size: Math.round((0.9 + Math.random() * 0.2) * 100) / 100, voice: r(AVATAR.VOICES.length)
    };
  },
  /* 足りない所・おかしな値を直す(古い保存データや、ほかの人から届いたデータでも こわれないように) */
  fix: function (a) {
    a = a || {};
    var P = AVATAR.PARTS, o = {};
    function n(v, max, d) { v = Math.floor(+v); return v >= 0 && v < max ? v : d; }
    function c(v, max, d) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : n(v, max, d); }
    o.skin = c(a.skin, AVATAR.SKIN.length, 1);
    o.face = n(a.face, P.face.length, 0);
    o.nose = n(a.nose, P.nose.length, 0);
    o.eyeColor = c(a.eyeColor, AVATAR.EYE_COLOR.length, 0);
    o.hair = n(a.hair, P.hair.length, 0);
    o.hairColor = c(a.hairColor, AVATAR.HAIR_COLOR.length, 0);
    o.eyes = n(a.eyes, P.eyes.length, 0);
    o.brows = n(a.brows, P.brows.length, 0);
    o.mouth = n(a.mouth, P.mouth.length, 0);
    o.beard = n(a.beard, P.beard.length, 0);
    o.top = n(a.top, P.top.length, 0);
    o.topColor = c(a.topColor, AVATAR.CLOTH_COLOR.length, 0);
    o.acc = n(a.acc, P.acc.length, 0);
    o.voice = n(a.voice, AVATAR.VOICES.length, 1);
    var s = +a.size; o.size = s >= AVATAR.SIZE_MIN && s <= AVATAR.SIZE_MAX ? s : 1;
    return o;
  }
};
