/* =====================================================================
   3D の係 —— 居酒屋の店内・アバター・料理を描く。
   app.js からは window.IZ3D を通して使う(この係が動かない古いスマホでは、app.js が 2D の代わりを出す)。
   ===================================================================== */
import * as THREE from '../vendor/three/build/three.module.js';

const SEAT_GAP = 0.8;
const STOOL_Y = 0.7;            // 座面の高さ
const COUNTER_Y = 1.02;         // カウンターの天板の高さ
const GUEST_Z = 0.78;           // お客さんが座る位置(手前)
const OWNER_Z = -0.95;          // 大将が立つ位置(奥)
const FONT_JP = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
const FONT_GO = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';

function makeClock() {   // 前の時間との差(秒)を測る小さな時計
  let last = performance.now(), el = 0;
  return { getDelta() { const t = performance.now(), d = (t - last) / 1000; last = t; el += d; return d; }, get elapsedTime() { return el; } };
}
const seatX = (i, n) => (i - (n - 1) / 2) * SEAT_GAP;
const lam = (color, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color }, o));
const MATS = {};
function mat(color, o) { const k = color + JSON.stringify(o || {}); return MATS[k] || (MATS[k] = lam(color, o)); }

function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); return m; }
/* =====================================================================
   奥の棚の物 —— 1つずつ ちがう物(一升瓶・焼酎・ウイスキー・梅酒・ワイン・ビール・徳利・招き猫・ボトルキープの札)。
   形は粗くていい(スマホでは小さい)。輪郭・色・ラベルで見分けがつくようにする。
   銘柄はすべて架空(実在の商品名は使わない)。全部まとめて焼き固め、描く回数は2回だけ(重くしない)
   ===================================================================== */
function vcolor(geo, hex, o = {}) {   // 頂点に色をぬる。gloss: 左前からの光の すじ(ガラスのつや)、band: 高さで色を変える
  geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.normal, p = g.attributes.position;
  const c = new THREE.Color(hex), arr = new Float32Array(n.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    let cc = c;
    if (o.band) for (const [y0, y1, h2] of o.band) if (p.getY(i) >= y0 && p.getY(i) <= y1) { cc = tmp.set(h2); break; }
    const hl = o.gloss ? Math.pow(Math.max(0, -n.getX(i) * 0.5 + n.getZ(i) * 0.87), 10) * o.gloss : 0;
    arr[i * 3] = Math.min(1, cc.r + hl); arr[i * 3 + 1] = Math.min(1, cc.g + hl); arr[i * 3 + 2] = Math.min(1, cc.b + hl);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); g.deleteAttribute('uv'); return g;
}
function lathe(pts, seg = 10, phi = 0) { const P = [new THREE.Vector2(0, pts[0][1])].concat(pts.map(([r, y]) => new THREE.Vector2(r, y)), [new THREE.Vector2(0, pts[pts.length - 1][1])]); return new THREE.LatheGeometry(P, seg, phi); }
function mergeGeos(list, keys) {   // 同じ種類の属性をもつ形を1つに
  const out = new THREE.BufferGeometry();
  keys.forEach((k) => {
    const size = list[0].attributes[k].itemSize, total = list.reduce((s, g) => s + g.attributes[k].count, 0), arr = new Float32Array(total * size);
    let off = 0; list.forEach((g) => { arr.set(g.attributes[k].array, off); off += g.attributes[k].count * size; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  });
  return out;
}
const SHELF_LABELS = [   // [地の色, 字の色, 字(縦書き), 小さい字, はんこ色]
  ['#f4efe2', '#1a1410', 'ノブ', '純米', '#c8261c'], ['#efe6cc', '#1a1410', '辛口', '本醸造', ''], ['#fbe8ee', '#5a1a2a', '夜桜', '吟醸', '#d84a7a'],
  ['#d8e6f2', '#14284a', '吟醸', '四合', ''], ['#16120e', '#f4efe2', '芋', '本格焼酎', '#c8261c'], ['#d9c49a', '#2a1a10', '麦', '本格焼酎', ''],
  ['#f2f2ee', '#1a1410', '米', '本格焼酎', '#2a6a3a'], ['#141414', '#d8b45a', 'WHISKY', '12', ''], ['#fbf8f0', '#c8261c', '梅', '梅酒', ''],
  ['#efe4c8', '#5a1a2a', 'ROUGE', 'vin', ''], ['#f4e8c8', '#8a5a10', '生', 'BEER', ''],
  ['#fffdf6', '#1a1410', 'ノブ', '', ''], ['#fffdf6', '#1a1410', 'げんさん', '', ''], ['#fffdf6', '#1a1410', 'たけし', '', ''], ['#fffdf6', '#1a1410', 'みゆき', '', ''],
  ['#f4ead0', '#c8261c', '祝', '', '']
];
function shelfAtlas() {   // ラベルを1枚の絵にまとめる(8列×2段、1つ 128×256)
  return canvasTex(1024, 512, (g) => {
    SHELF_LABELS.forEach(([bg, fg, big, small, stamp], i) => {
      const x = (i % 8) * 128, y = Math.floor(i / 8) * 256, tag = i >= 11 && i <= 14;
      g.fillStyle = bg; g.fillRect(x, y, 128, 256);
      if (!tag) { g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, 112, 240); g.globalAlpha = 1; }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (/^[A-Z]/.test(big)) {   // 横文字は横に
        g.font = 'bold 30px Georgia,serif'; g.fillText(big, x + 64, y + 110);
        g.font = 'bold 44px Georgia,serif'; g.fillText(small, x + 64, y + 165);
        g.strokeStyle = fg; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 24, y + 70); g.lineTo(x + 104, y + 70); g.moveTo(x + 24, y + 200); g.lineTo(x + 104, y + 200); g.stroke();
      } else {
        const ch = Array.from(big), sz = tag ? (ch.length > 3 ? 46 : 60) : ch.length === 1 ? 110 : 76;
        g.font = 'bold ' + sz + 'px ' + FONT_JP;
        const y0 = y + (tag ? 128 : 112) - (ch.length - 1) * sz * 0.52;
        ch.forEach((c, k) => g.fillText(c, x + 64, y0 + k * sz * 1.04));
        if (small) { g.font = '22px ' + FONT_JP; Array.from(small).forEach((c, k) => g.fillText(c, x + 104, y + 40 + k * 24)); }
        if (stamp) { g.fillStyle = stamp; g.fillRect(x + 18, y + 196, 34, 34); g.fillStyle = '#fff'; g.font = 'bold 22px ' + FONT_JP; g.fillText('印', x + 35, y + 214); }
      }
      if (tag) { g.fillStyle = '#c8261c'; g.beginPath(); g.arc(x + 64, y + 22, 8, 0, Math.PI * 2); g.fill(); }
    });
  });
}
function buildShelfStuff(scene, gap, len) {
  const bodies = [], labels = [];
  const put = (geo, x, y, z, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, y, z); return geo; };
  const label = (cell, w, h, r, yc, x, y, z, flat) => {   // 体に巻くラベル(flat なら平らな札)
    const g = flat ? new THREE.PlaneGeometry(w, h) : new THREE.CylinderGeometry(r, r, h, 6, 1, true, -w / r / 2, w / r);
    if (flat) g.translate(0, 0, r);
    const uv = g.attributes.uv, cx = (cell % 8) / 8, cy = 1 - (Math.floor(cell / 8) + 1) / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) / 8, cy + uv.getY(i) / 2);
    g.computeVertexNormals();
    labels.push(put(g.index ? g.toNonIndexed() : g, x, y + yc, z));
  };
  const keepTag = (cell, x, y, z, ry) => { const g = new THREE.PlaneGeometry(0.034, 0.05); g.rotateZ(0.12); const uv = g.attributes.uv, cx = (cell % 8) / 8, cy = 1 - (Math.floor(cell / 8) + 1) / 2; for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) / 8, cy + uv.getY(i) / 2); labels.push(put(g.toNonIndexed(), x, y, z, ry)); };
  const B = {   // 物の作り方 [幅, 作る関数(x, 床の y, z)]
    issho: (col, cell) => [0.11, (x, y, z) => {   // 一升瓶(高さ40cm)
      bodies.push(put(vcolor(lathe([[0.052, 0], [0.054, 0.012], [0.054, 0.25], [0.049, 0.285], [0.028, 0.325], [0.017, 0.35], [0.017, 0.385], [0.02, 0.39], [0.02, 0.4]], 8), col, { gloss: 0.5 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.021, 0], [0.021, 0.025]], 8), '#c8b06a'), x, y + 0.385, z));   // 金の口
      label(cell, 0.085, 0.15, 0.0555, 0.13, x, y, z);
    }],
    shigo: (col, cell) => [0.09, (x, y, z) => {   // 四合瓶
      bodies.push(put(vcolor(lathe([[0.04, 0], [0.042, 0.01], [0.042, 0.19], [0.037, 0.215], [0.02, 0.245], [0.014, 0.265], [0.014, 0.29], [0.016, 0.3]], 8), col, { gloss: 0.5 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.017, 0], [0.017, 0.02]], 8), '#1a1a1a'), x, y + 0.29, z));
      label(cell, 0.066, 0.11, 0.0435, 0.1, x, y, z);
    }],
    shochu: (col, cell, keep) => [0.11, (x, y, z) => {   // 焼酎(ずんぐり)+ボトルキープの札
      bodies.push(put(vcolor(lathe([[0.048, 0], [0.05, 0.01], [0.05, 0.2], [0.044, 0.232], [0.024, 0.258], [0.019, 0.27], [0.019, 0.29]], 8), col, { gloss: 0.45 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.021, 0], [0.021, 0.03]], 8), '#1a1a1a'), x, y + 0.282, z));
      label(cell, 0.075, 0.12, 0.0515, 0.105, x, y, z);
      if (keep != null) keepTag(keep, x + 0.012, y + 0.215, z + 0.05, 0);
    }],
    whisky: (col, cell) => [0.11, (x, y, z) => {   // 四角いウイスキー(4角の回転体を45度まわす)
      bodies.push(put(vcolor(lathe([[0.066, 0], [0.068, 0.01], [0.068, 0.17], [0.058, 0.195], [0.024, 0.212], [0.018, 0.22], [0.018, 0.255]], 4, Math.PI / 4), col, { gloss: 0.6 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.022, 0], [0.022, 0.03]], 8), '#2a1a10'), x, y + 0.245, z));
      label(cell, 0.07, 0.09, 0.0485, 0.09, x, y, z, true);
    }],
    ume: (cell) => [0.17, (x, y, z) => {   // 梅酒の びん(梅の実が見える)
      bodies.push(put(vcolor(lathe([[0.075, 0], [0.078, 0.01], [0.078, 0.17], [0.07, 0.19], [0.05, 0.2], [0.05, 0.225]], 10), '#e0a840', { gloss: 0.6, band: [[0.13, 0.2, '#f2d9a0']] }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.054, 0], [0.054, 0.03], [0.04, 0.035]], 12), '#c8261c'), x, y + 0.222, z));
      [[-0.04, 0.03], [0.035, 0.05], [-0.01, 0.08], [0.045, 0.1], [-0.05, 0.11], [0.01, 0.035]].forEach(([dx, dy]) => bodies.push(put(vcolor(new THREE.SphereGeometry(0.016, 6, 4), '#c9a02a'), x + dx, y + dy + 0.01, z + Math.sqrt(0.078 * 0.078 - dx * dx) - 0.006)));
      label(cell, 0.06, 0.07, 0.0795, 0.09, x, y, z);
    }],
    wine: (col, cell) => [0.09, (x, y, z) => {
      bodies.push(put(vcolor(lathe([[0.038, 0], [0.04, 0.01], [0.04, 0.19], [0.036, 0.215], [0.016, 0.245], [0.014, 0.3]], 8), col, { gloss: 0.55 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.016, 0], [0.016, 0.05]], 8), '#7a1a2a'), x, y + 0.26, z));
      label(cell, 0.062, 0.08, 0.0415, 0.09, x, y, z);
    }],
    beer: (cell) => [0.085, (x, y, z) => {
      bodies.push(put(vcolor(lathe([[0.036, 0], [0.037, 0.01], [0.037, 0.16], [0.03, 0.19], [0.015, 0.222], [0.013, 0.25]], 8), '#5a2e10', { gloss: 0.55 }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.016, 0], [0.016, 0.012]], 8), '#d8b45a'), x, y + 0.247, z));
      label(cell, 0.058, 0.07, 0.0385, 0.08, x, y, z);
    }],
    tokkuri: () => [0.1, (x, y, z) => {   // 徳利と おちょこ
      bodies.push(put(vcolor(lathe([[0.03, 0], [0.045, 0.04], [0.05, 0.08], [0.04, 0.12], [0.018, 0.155], [0.016, 0.17], [0.024, 0.18]], 8), '#f2ece0', { gloss: 0.3, band: [[0.06, 0.09, '#2a4a8a']] }), x - 0.015, y, z));
      bodies.push(put(vcolor(lathe([[0.012, 0], [0.024, 0.03]], 8), '#f2ece0', { band: [[0.02, 0.03, '#2a4a8a']] }), x + 0.035, y, z + 0.02));
    }],
    masu: () => [0.1, (x, y, z) => {   // 升を3つ重ねる(木の色を少しずつ変える)
      [['#d9b67a', 0], ['#cfa96a', 0.055], ['#e3c48a', 0.11]].forEach(([c, dy], k) => { const g = new THREE.BoxGeometry(0.075, 0.052, 0.075); bodies.push(put(vcolor(g, c), x + (k === 1 ? 0.006 : 0), y + 0.026 + dy, z, k * 0.25)); });
    }],
    daruma: () => [0.1, (x, y, z) => {   // だるま(赤・白い顔・金の模様)
      const g = new THREE.SphereGeometry(0.045, 8, 6); g.scale(1, 1.08, 0.95);
      bodies.push(put(vcolor(g, '#c8261c', { gloss: 0.35 }), x, y + 0.048, z));
      const f = new THREE.SphereGeometry(0.03, 8, 6, -0.9, 1.8, 0.7, 1.2); f.scale(1, 1, 0.6); bodies.push(put(vcolor(f, '#fbf4e6'), x, y + 0.058, z + 0.025));
      [-1, 1].forEach((sd) => bodies.push(put(vcolor(new THREE.SphereGeometry(0.006, 4, 3), '#1a1a1a'), x + sd * 0.011, y + 0.066, z + 0.046)));
      const gd = new THREE.TorusGeometry(0.03, 0.004, 3, 10, Math.PI); gd.rotateZ(Math.PI); gd.rotateX(0.35); bodies.push(put(vcolor(gd, '#e8c040'), x, y + 0.03, z + 0.03));
    }],
    taru: () => [0.13, (x, y, z) => {   // 小さな酒樽(こも巻き・赤い縄・「祝」)
      bodies.push(put(vcolor(lathe([[0.05, 0], [0.056, 0.03], [0.058, 0.07], [0.056, 0.11], [0.05, 0.14]], 8), '#e8dcb8', { band: [[0.02, 0.03, '#c8261c'], [0.11, 0.12, '#c8261c']] }), x, y, z));
      bodies.push(put(vcolor(lathe([[0.048, 0], [0.048, 0.008]], 8), '#a8844a'), x, y + 0.14, z));
      label(15, 0.06, 0.06, 0.0585, 0.07, x, y, z);
    }],
    neko: () => [0.12, (x, y, z) => {   // 招き猫(右手を上げる)
      const W = '#fbf8f2';
      bodies.push(put(vcolor(lathe([[0.045, 0], [0.05, 0.03], [0.045, 0.07], [0.03, 0.09]], 8), W), x, y, z));
      const hd = new THREE.SphereGeometry(0.042, 8, 6); hd.scale(1.1, 0.95, 1); bodies.push(put(vcolor(hd, W), x, y + 0.115, z));
      [-1, 1].forEach((sd) => { const e = new THREE.ConeGeometry(0.014, 0.025, 4); e.rotateZ(-sd * 0.3); bodies.push(put(vcolor(e, sd > 0 ? '#2a2a2a' : '#e88a2a'), x + sd * 0.028, y + 0.155, z)); });
      bodies.push(put(vcolor(new THREE.SphereGeometry(0.014, 6, 4), W), x + 0.045, y + 0.13, z + 0.01));   // 上げた手
      { const cl = new THREE.TorusGeometry(0.033, 0.006, 4, 12); cl.rotateX(Math.PI / 2); bodies.push(put(vcolor(cl, '#c8261c'), x, y + 0.085, z)); }   // 赤い首輪
      const bell = new THREE.SphereGeometry(0.009, 6, 4); bodies.push(put(vcolor(bell, '#e8c040'), x, y + 0.078, z + 0.035));
      [-1, 1].forEach((sd) => bodies.push(put(vcolor(new THREE.SphereGeometry(0.005, 4, 3), '#1a1a1a'), x + sd * 0.016, y + 0.12, z + 0.04)));   // 目
      const coin = new THREE.CylinderGeometry(0.018, 0.018, 0.004, 8); coin.rotateX(Math.PI / 2); coin.scale(1.4, 1, 1); bodies.push(put(vcolor(coin, '#e8c040'), x - 0.01, y + 0.04, z + 0.05));   // 小判
    }]
  };
  const G = '#2d5a2d', BR = '#5a2e10', BL = '#1a3a6a', CL = '#cfe0d0', DK = '#2a1a20';
  // 棚ごとの並び(となりが同じにならないように)。足りなければ くり返す
  // 下の段は背の高い一升瓶も。上の段は背の低い物だけ(うしろの品書きの木札を隠さない)
  const ROWS = {
    '-1,0': [B.issho(G, 0), B.issho(BR, 1), B.shigo(BL, 3), B.tokkuri(), B.ume(8), B.issho(G, 2), B.neko(), B.shigo(CL, 3), B.issho(BR, 0), B.taru(), B.issho(G, 1), B.shigo(BL, 3)],
    '1,0': [B.shochu('#3a2a1a', 4, 11), B.shochu('#8a6a3a', 5, 12), B.shochu(CL, 6, 13), B.whisky('#a8641a', 7), B.shochu('#1a1a1a', 4, 14), B.shochu('#6a4a2a', 5), B.masu(), B.shochu(CL, 6), B.whisky('#6a3010', 7), B.shochu('#3a2a1a', 4, 12), B.shochu('#8a6a3a', 5)],
    '-1,1': [B.wine(DK, 9), B.beer(10), B.daruma(), B.wine('#2a3a1a', 9), B.tokkuri(), B.beer(10), B.masu(), B.wine(DK, 9), B.taru(), B.beer(10)],
    '1,1': [B.whisky('#a8641a', 7), B.tokkuri(), B.whisky('#6a3010', 7), B.daruma(), B.shigo(BL, 3), B.masu(), B.wine(DK, 9), B.neko(), B.shigo(G, 3), B.beer(10)]
  };
  for (let r = 0; r < 2; r++) [-1, 1].forEach((sd) => {
    const list = ROWS[sd + ',' + r], y = 1.47 + r * 0.45, z = -1.94;
    let pos = 0.06, i = 0;
    while (true) {
      const [w, make] = list[i % list.length];
      if (pos + w > len - 0.04) break;
      const x = sd * (gap + 0.06 + pos + w / 2);
      make(x, y, z); pos += w + 0.02 + ((i * 7 + r * 3) % 4) * 0.008; i++;   // すき間を少しずつ変える(きっちり並びすぎないように)
      if (i > 40) break;
    }
  });
  const bm = new THREE.Mesh(mergeGeos(bodies, ['position', 'normal', 'color']), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const lm = new THREE.Mesh(mergeGeos(labels, ['position', 'normal', 'uv']), new THREE.MeshLambertMaterial({ map: shelfAtlas() }));
  scene.add(bm, lm);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function woodTex(base, line, w = 512, h = 128, rep = 1) {
  const t = canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = line; g.globalAlpha = 0.08 + Math.random() * 0.12; g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1);
  return t;
}

/* =====================================================================
   アバターを組み立てる(3代目・アニメ風。頭の形・髪の土台+毛の束・体を作りこみ)
   ・塗りは「トゥーン」(影を3段で塗る)+ ふちに細い線
   ・顔はキャンバスに描いて、頭の前に貼る。髪は毛の束を1本ずつ形にして並べる
   ===================================================================== */
const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const TOONS = {};
/* 肌は影をうすく・なめらかに(3段のくっきりした影だと、顔の半分が暗く見える) */
const SKIN_GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255, 228, 228, 228, 255, 246, 246, 246, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })();
const SKIN_SET = new Set();
function toon(color, o) {
  const skin = typeof color === 'string' && SKIN_SET.has(color.toLowerCase());
  const k = (skin ? 's:' : '') + color + JSON.stringify(o || {});
  return TOONS[k] || (TOONS[k] = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: skin ? SKIN_GRAD : GRAD }, o)));
}
const LINE_M = new THREE.MeshBasicMaterial({ color: '#2a1810', side: THREE.BackSide });
/* ふち線: 形を 面の向きに少し ふくらませた黒い殻(内がわだけ描く)。細かい部品でも きれいに出る */
function outlineOf(geo, th) {
  const g = geo.index ? geo.clone() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  // 角のある形(箱など)は 頂点が分かれているので、同じ場所の頂点の向きを まとめてから ふくらませる
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map();
  for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4); const v = acc.get(k) || [0, 0, 0]; v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i); acc.set(k, v); }
  for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4); const v = acc.get(k); const l = Math.hypot(v[0], v[1], v[2]) || 1; p.setXYZ(i, p.getX(i) + v[0] / l * th, p.getY(i) + v[1] / l * th, p.getZ(i) + v[2] / l * th); }
  return new THREE.Mesh(g, LINE_M);
}
function tm(geo, color, x = 0, y = 0, z = 0, line = 0) {   // トゥーンの部品。line = ふち線の太さ(メートル。0 で なし)
  const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z);
  if (line) m.add(outlineOf(geo, line));
  return m;
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
function lighten(hex, f) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), f); return '#' + c.getHexString(); }

/* ---------- 顔(キャンバス 512×512 に描く) ---------- */
const FACE_CACHE = {}, FACE_ORDER = [], FACE_MAX = 64;   // 顔の絵は 新しい順に 64枚まで とっておく(ずっと ためると スマホの絵の入れ物が いっぱいになって 3D が落ちる 11-22)
function faceTexture(a) {
  const key = JSON.stringify([a.sex, a.eyes, a.eyeColor, a.brows, a.mouth, a.beard, a.lip, a.cheek, a.hairColor, a.skin, a.nBeard || '', a.nBeardC || '', a.blink ? 1 : 0]);
  if (FACE_CACHE[key]) { const i = FACE_ORDER.indexOf(key); if (i >= 0 && i < FACE_ORDER.length - 1) { FACE_ORDER.splice(i, 1); FACE_ORDER.push(key); } return FACE_CACHE[key]; }
  const t = canvasTex(512, 512, (g) => {
    const F = a.sex === 'f';
    const ink = '#2a1a14', EY = 272, LX = 174, RX = 338;
    const eyeC = AVATAR.color(AVATAR.EYE_COLOR, a.eyeColor);
    const hairC = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // ほっぺ
    const ck = F ? a.cheek : (a.mouth === 'grin' ? 1 : 0);
    if (ck) {
      [[128, 318], [384, 318]].forEach(([x, y]) => {
        const gr = g.createRadialGradient(x, y, 4, x, y, 40); gr.addColorStop(0, `rgba(245,120,120,${ck === 2 ? 0.55 : 0.32})`); gr.addColorStop(1, 'rgba(245,120,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 44, 26, 0, 0, Math.PI * 2); g.fill();
        if (ck === 2) { g.strokeStyle = 'rgba(220,90,90,0.5)'; g.lineWidth = 3; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 12 - 4, y + 6); g.lineTo(x + k * 12 + 4, y - 6); g.stroke(); } }
      });
    }
    const NB = a.special === 'nobu' || /^ne/.test(a.eyes || '');   // 大将ノブ: ほかの人より 細かく描く(11-22 ノブさん「大将の顔だけ 作りこんで」)
    let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;   // いつも同じ形になる でたらめ
    if (NB) {
      [[150, 330], [362, 330]].forEach(([x, y]) => {   // ほんのり血色(お酒の場の あたたかさ)
        const gr = g.createRadialGradient(x, y, 4, x, y, 46); gr.addColorStop(0, 'rgba(232,120,96,0.2)'); gr.addColorStop(1, 'rgba(232,120,96,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 50, 30, 0, 0, Math.PI * 2); g.fill();
      });
      const bcol = a.nBeardC || '#4a4542';   // ひげの そりあと(口のまわりと あご。ごく うすく)
      const gr2 = g.createRadialGradient(256, 392, 20, 256, 392, 120); gr2.addColorStop(0, 'rgba(70,66,64,0.05)'); gr2.addColorStop(1, 'rgba(70,66,64,0)');
      g.fillStyle = gr2; g.beginPath(); g.ellipse(256, 392, 120, 80, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = bcol; g.globalAlpha = 0.1;
      for (let k = 0; k < 420; k++) { const an = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()); const x = 256 + Math.cos(an) * rr * 96, y = 386 + Math.sin(an) * rr * 58; if (Math.abs(x - 256) < 34 && Math.abs(y - 366) < 12) continue; g.fillRect(x, y, 1.6, 1.6); }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(150,84,64,0.2)'; g.lineWidth = 3;   // 笑いじわ(小鼻から口角へ。うすく)
      [-1, 1].forEach((d) => { g.beginPath(); g.moveTo(256 + d * 30, 332); g.quadraticCurveTo(256 + d * 44, 350, 256 + d * 40, 370); g.stroke(); });
    }
    // ひげ(男性)
    const bc = shade(hairC, 0.9);
    if (a.beard === 'stubble') {
      g.fillStyle = 'rgba(60,45,40,0.22)'; g.beginPath(); g.moveTo(150, 340); g.quadraticCurveTo(256, 470, 362, 340); g.quadraticCurveTo(256, 400, 150, 340); g.fill();
      g.fillStyle = 'rgba(40,30,28,0.35)'; for (let k = 0; k < 260; k++) { const tt = Math.random() * Math.PI, r = 70 + Math.random() * 40; g.fillRect(256 + Math.cos(tt) * r * 1.2, 330 + Math.sin(tt) * r * 0.75, 2, 2); }
    }
    if (a.nBeard === 'b2' || a.nBeard === 'b3') { g.fillStyle = bc; g.beginPath(); g.ellipse(256, 404, 13, 9, 0, 0, Math.PI * 2); g.fill(); }   // 大将ノブ: 下くちびるの下の ちょびひげ
    if (a.nBeard === 'b3') { g.fillStyle = 'rgba(28,23,20,0.75)'; g.beginPath(); g.moveTo(214, 352); g.quadraticCurveTo(256, 336, 298, 352); g.quadraticCurveTo(256, 346, 214, 352); g.fill(); }   // 大将ノブ: うすい口ひげ
    if (a.beard === 'mustache' || a.beard === 'full') { g.fillStyle = bc; g.beginPath(); g.moveTo(206, 356); g.quadraticCurveTo(232, 336, 256, 348); g.quadraticCurveTo(280, 336, 306, 356); g.quadraticCurveTo(256, 352, 206, 356); g.fill(); }
    // まゆ
    const browC = shade(hairC === '#e8e2d8' ? '#9a8a7a' : hairC, 0.85);
    g.strokeStyle = browC; g.fillStyle = browC;
    const bw = { thick: 11, natural: 7, straight: 8, up: 8, worry: 7, soft: 6, thin: 4, nk1: 11, nk2: 9, nk3: 12, nk4: 11 }[a.brows] || 7;
    g.lineWidth = bw;
    [[LX, -1], [RX, 1]].forEach(([x, s]) => {
      const by = EY - (F ? 92 : 80);
      g.beginPath();
      switch (a.brows) {
        case 'up': g.moveTo(x - 30 * s, by + 8); g.quadraticCurveTo(x, by - 8, x + 32 * s, by - 10); break;
        case 'nk1': g.moveTo(x - 34 * s, by + 10); g.lineTo(x + 8 * s, by - 6); g.quadraticCurveTo(x + 24 * s, by - 10, x + 36 * s, by - 2); break;   // 大将ノブ: きりっ(山のある まゆ)
        case 'nk2': g.moveTo(x - 32 * s, by + 8); g.lineTo(x + 34 * s, by - 8); break;   // 大将ノブ: きりっ(まっすぐ上がる)
        case 'nk3': g.moveTo(x - 34 * s, by + 6); g.quadraticCurveTo(x - 4 * s, by - 8, x + 36 * s, by - 6); break;   // 大将ノブ: きりっ(太く ゆるい弧)
        case 'nk4': g.moveTo(x - 34 * s, by - 2); g.quadraticCurveTo(x, by - 12, x + 36 * s, by + 7); break;   // 大将ノブ: 太く、ほんの少し ハの字(外がわが 少し下がる。やさしく楽しそう)
        case 'worry': g.moveTo(x - 30 * s, by - 4); g.quadraticCurveTo(x, by - 4, x + 30 * s, by + 10); break;
        case 'straight': g.moveTo(x - 30 * s, by); g.lineTo(x + 30 * s, by - 2); break;
        case 'soft': g.moveTo(x - 28 * s, by + 4); g.quadraticCurveTo(x, by - 10, x + 28 * s, by + 2); break;
        default: g.moveTo(x - 32 * s, by + 4); g.quadraticCurveTo(x, by - 10, x + 32 * s, by);
      }
      if (!NB) { g.stroke(); return; }
      const P = { nk1: [[-34, 10], [8, -8], [36, -2]], nk2: [[-32, 8], [1, 0], [34, -8]], nk3: [[-34, 6], [-4, -8], [36, -6]], nk4: [[-34, -2], [0, -12], [36, 7]] }[a.brows] || [[-32, 4], [0, -10], [32, 0]];
      const pt = (t) => { const u = 1 - t; return [x + s * (u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0]), by + u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]]; };
      const N = 26, up = [], dn = [];
      for (let k = 0; k <= N; k++) { const t = k / N, [px, py] = pt(t), [qx, qy] = pt(Math.min(1, t + 0.01)), [rx, ry] = pt(Math.max(0, t - 0.01)); let tx = qx - rx, ty = qy - ry; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; const w = bw * (1.35 - 0.8 * t) * (t < 0.08 ? 0.75 + t * 3 : 1); up.push([px + ty * w * 0.5, py - tx * w * 0.5 * Math.sign(s) * Math.sign(s)]); dn.push([px - ty * w * 0.5, py + tx * w * 0.5]); }
      g.globalAlpha = 0.92; g.beginPath(); up.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); for (let k = dn.length - 1; k >= 0; k--) g.lineTo(dn[k][0], dn[k][1]); g.closePath(); g.fill();
      g.globalAlpha = 0.9; g.lineWidth = 2.2;   // 毛を1本ずつ(内がわは 上向き、外がわは 外へ ねる)
      for (let k = 0; k < 40; k++) { const t = rnd(), [px, py] = pt(t), w = bw * (1.35 - 0.8 * t), o = (rnd() - 0.5) * w * 0.8; const ang = -Math.PI / 2 + s * (0.5 + t * 0.9), L = 6 + rnd() * 5;
        g.beginPath(); g.moveTo(px, py + o + 2); g.lineTo(px + Math.cos(ang) * L, py + o + 2 + Math.sin(ang) * L * 0.7); g.stroke(); }
      g.globalAlpha = 1;
    });
    // 目
    [[LX, -1], [RX, 1]].forEach(([cx, s]) => drawEye(g, cx, EY, s, a, eyeC, ink));
    // 鼻
    if (NB) {   // 大将ノブ: 鼻すじの かげ と 小鼻(立体の鼻に なじませる)
      const gr = g.createLinearGradient(240, 0, 272, 0); gr.addColorStop(0, 'rgba(160,90,70,0.16)'); gr.addColorStop(1, 'rgba(160,90,70,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(248, 262); g.lineTo(256, 262); g.lineTo(262, 322); g.lineTo(242, 322); g.closePath(); g.fill();
      g.fillStyle = 'rgba(120,60,48,0.35)'; [-1, 1].forEach((d) => { g.beginPath(); g.ellipse(256 + d * 11, 330, 5, 3, d * 0.3, 0, Math.PI * 2); g.fill(); });
      g.strokeStyle = 'rgba(150,80,60,0.38)'; g.lineWidth = 2.5; [-1, 1].forEach((d) => { g.beginPath(); g.arc(256 + d * 16, 326, 8, d > 0 ? -0.6 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 0.6); g.stroke(); });
    } else {
    g.strokeStyle = 'rgba(150,80,60,0.55)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(258, 308); g.lineTo(252, 322); g.stroke();
    }
    // 口
    const lip = F ? AVATAR.color(AVATAR.LIP_COLOR, a.lip) : '#b8605a';
    const MY = 366;
    g.strokeStyle = '#6a2a24'; g.lineWidth = 5;
    switch (a.mouth) {
      case 'grin':
        g.fillStyle = '#7a2a28'; g.beginPath(); g.moveTo(222, MY - 6); g.quadraticCurveTo(256, MY + 44, 290, MY - 6); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(226, MY - 4); g.quadraticCurveTo(256, MY + 8, 286, MY - 4); g.closePath(); g.fill();
        g.fillStyle = '#e8707a'; g.beginPath(); g.ellipse(256, MY + 22, 16, 8, 0, 0, Math.PI * 2); g.fill(); break;
      case 'open':
        g.fillStyle = '#7a2a28'; g.beginPath(); g.ellipse(256, MY + 6, 14, 18, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8707a'; g.beginPath(); g.ellipse(256, MY + 14, 9, 7, 0, 0, Math.PI * 2); g.fill(); break;
      case 'tk_open':   // おしゃべり画面: 話している口(大きく あける。小さい カードでも 分かるように)
        g.fillStyle = '#6a2422'; g.beginPath(); g.ellipse(256, MY + 10, 38, 34, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2f0ea'; g.beginPath(); g.ellipse(256, MY - 14, 27, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e06a74'; g.beginPath(); g.ellipse(256, MY + 30, 23, 11, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 5; g.beginPath(); g.ellipse(256, MY + 10, 38, 34, 0, 0, Math.PI * 2); g.stroke(); break;
      case 'tk_laugh':   // おしゃべり画面: 大きく笑う口
        g.fillStyle = '#6a2422'; g.beginPath(); g.moveTo(190, MY - 14); g.quadraticCurveTo(256, MY + 96, 322, MY - 14); g.closePath(); g.fill();
        g.fillStyle = '#f6f4ee'; g.beginPath(); g.moveTo(198, MY - 12); g.quadraticCurveTo(256, MY + 14, 314, MY - 12); g.closePath(); g.fill();
        g.fillStyle = '#e06a74'; g.beginPath(); g.ellipse(256, MY + 46, 32, 14, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 5.5; g.beginPath(); g.moveTo(190, MY - 14); g.quadraticCurveTo(256, MY + 96, 322, MY - 14); g.closePath(); g.stroke(); break;
      case 'flat': g.beginPath(); g.moveTo(236, MY + 2); g.lineTo(276, MY + 2); g.stroke(); break;
      case 'cat': g.beginPath(); g.moveTo(226, MY - 6); g.quadraticCurveTo(241, MY + 12, 256, MY - 2); g.quadraticCurveTo(271, MY + 12, 286, MY - 6); g.stroke(); break;
      case 'soft': g.beginPath(); g.moveTo(232, MY); g.quadraticCurveTo(256, MY + 12, 280, MY); g.stroke(); break;
      case 'nsmile': g.beginPath(); g.moveTo(226, MY - 7); g.quadraticCurveTo(256, MY + 15, 286, MY - 7); g.stroke();   // 大将ノブ: 笑顔の手前(口を閉じて 口角を上げる。楽しそう)
        g.lineWidth = 3.5; [[-1, 226], [1, 286]].forEach(([d, x]) => { g.beginPath(); g.moveTo(x, MY - 7); g.quadraticCurveTo(x + d * 5, MY - 9, x + d * 7, MY - 14); g.stroke(); });
        if (NB) {   // 下くちびる(ほんのり赤み と かげ)・えくぼ
          g.fillStyle = 'rgba(196,104,92,0.32)'; g.beginPath(); g.moveTo(238, MY + 6); g.quadraticCurveTo(256, MY + 20, 274, MY + 6); g.quadraticCurveTo(256, MY + 11, 238, MY + 6); g.fill();
          g.strokeStyle = 'rgba(120,60,50,0.28)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(244, MY + 22); g.quadraticCurveTo(256, MY + 26, 268, MY + 22); g.stroke();
          g.strokeStyle = 'rgba(140,72,58,0.3)'; [-1, 1].forEach((d) => { g.beginPath(); g.arc(256 + d * 40, MY - 6, 5, d > 0 ? -0.4 : Math.PI - 1.2, d > 0 ? 1.2 : Math.PI + 0.4); g.stroke(); });
        }
        break;
      default: g.beginPath(); g.moveTo(222, MY - 6); g.quadraticCurveTo(256, MY + 26, 290, MY - 6); g.stroke();
    }
    if (F && a.mouth !== 'grin' && a.mouth !== 'open') { g.strokeStyle = lip; g.globalAlpha = 0.75; g.lineWidth = 7; g.beginPath(); g.moveTo(240, MY + 6); g.quadraticCurveTo(256, MY + 14, 272, MY + 6); g.stroke(); g.globalAlpha = 1; }
  });
  FACE_CACHE[key] = t; FACE_ORDER.push(key);
  while (FACE_ORDER.length > FACE_MAX) { const old = FACE_ORDER.shift(), ot = FACE_CACHE[old]; delete FACE_CACHE[old]; if (ot) ot.dispose(); }   // まだ使っている人がいても、次に描くとき 自動で 読みこみ直される
  return t;
}
function drawEye(g, cx, cy, s, a, eyeC, ink) {
  const F = a.sex === 'f';
  let w = F ? 50 : 42, h = F ? 62 : 46, tilt = 0, closed = false, lid = 1;
  switch (a.eyes) {
    case 'big': h *= 1.12; w *= 1.06; break;
    case 'round': h = w * 1.05; break;
    case 'droopy': tilt = 0.18; break;
    case 'cat': case 'sharp': tilt = -0.2; h *= 0.85; break;
    case 'cool': w *= 1.15; h *= 0.6; tilt = -0.08; break;
    case 'narrow': h *= 0.32; break;
    case 'smile': closed = true; break;
    case 'wink': if (s === 1) closed = true; break;
    case 'ai': h *= 1.16; w *= 1.08; tilt = 0.08; break;   // アイちゃん: 大きく まるい目(少したれ目)
    case 'ne1': w *= 1.12; h *= 1.12; tilt = 0.1; break;   // 大将ノブ: やさしい大きめの目(少したれ目)
    case 'ne2': w *= 1.18; h *= 1.0; tilt = 0.14; break;   // 大将ノブ: やさしい横長の大きめの目
    case 'ne3': w *= 1.08; h *= 1.2; tilt = 0.06; break;   // 大将ノブ: くりっと大きい目
  }
  g.save(); g.translate(cx, cy); g.rotate(tilt * s);
  if (a.blink) {   // まばたき(目を とじた 線。おしゃべり画面の顔写真だけ)
    g.strokeStyle = ink; g.lineWidth = F ? 7 : 6.5;
    g.beginPath(); g.arc(0, -w * 0.55, w * 1.0, Math.PI * 0.28, Math.PI * 0.72); g.stroke();
    if (F) { g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.92 * s, -2); g.lineTo(w * 1.18 * s, -8); g.stroke(); }
    g.restore(); return;
  }
  if (closed) {   // にこにこ・ウインクは 弧を描く
    g.strokeStyle = ink; g.lineWidth = F ? 8 : 7;
    g.beginPath(); g.arc(0, 10, w * 0.95, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    if (F) { g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.85 * s, -6); g.lineTo(w * 1.15 * s, -14); g.stroke(); }
    g.restore(); return;
  }
  // 白目
  g.fillStyle = '#fffdf8'; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.clip();
  // 黒目(上が濃く、下が明るい)
  const ir = Math.min(w * 0.78, h * 0.95), iy = h * 0.08;
  const gr = g.createLinearGradient(0, iy - ir, 0, iy + ir);
  gr.addColorStop(0, shade(eyeC, 0.45)); gr.addColorStop(0.55, eyeC); gr.addColorStop(1, lighten(eyeC, 0.45));
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, iy, ir * 0.82, ir, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(eyeC, 0.3); g.beginPath(); g.ellipse(0, iy + 2, ir * 0.36, ir * 0.46, 0, 0, Math.PI * 2); g.fill();
  if (/^ne/.test(a.eyes)) {   // 大将ノブ: 黒目のふち と すじ(深みのある目)
    g.strokeStyle = shade(eyeC, 0.25); g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, iy, ir * 0.82, ir, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,230,200,0.22)'; g.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) { const an = k / 14 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(an) * ir * 0.42, iy + Math.sin(an) * ir * 0.5); g.lineTo(Math.cos(an) * ir * 0.74, iy + Math.sin(an) * ir * 0.9); g.stroke(); }
  }
  // 上まぶたの影
  g.fillStyle = 'rgba(80,40,30,0.18)'; g.fillRect(-w, -h, w * 2, h * 0.45);
  g.restore();
  // ひかり
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-ir * 0.3 * s * -1 - ir * 0.15, iy - ir * 0.42, ir * 0.26, ir * 0.3, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(ir * 0.3, iy + ir * 0.4, ir * 0.12, 0, Math.PI * 2); g.fill();
  if (a.eyes === 'ai') {   // アイちゃん: きらっとした ひし形の光
    const kx = ir * 0.42, ky = iy - ir * 0.05, kr = ir * 0.2; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(kx, ky - kr); g.lineTo(kx + kr * 0.35, ky); g.lineTo(kx, ky + kr); g.lineTo(kx - kr * 0.35, ky); g.closePath(); g.fill();
  }
  // 上まぶたの線(太く)と まつげ
  g.strokeStyle = ink; g.lineWidth = F ? 9 : 7;
  g.beginPath(); g.ellipse(0, 0, w * 1.02, h * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  if (F) {
    g.lineWidth = 5;
    for (let k = 0; k < 3; k++) { const ang = (s > 0 ? Math.PI * 1.88 : Math.PI * 1.12) + (s > 0 ? -1 : 1) * k * 0.12; const x0 = Math.cos(ang) * w, y0 = Math.sin(ang) * h; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 14 * s * (1 - k * 0.2), y0 - 10 + k * 3); g.stroke(); }
  }
  if (/^ne/.test(a.eyes)) {   // 大将ノブ: 二重の線・目じりを少し下げる・目じりの笑いじわ(やさしく楽しそう)
    g.strokeStyle = 'rgba(70,36,28,0.45)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -4, w * 1.0, h * 1.12, 0, Math.PI * 1.18, Math.PI * 1.85); g.stroke();
    g.strokeStyle = ink; g.lineWidth = 6; g.beginPath(); g.moveTo(Math.cos(Math.PI * (s > 0 ? 1.92 : 1.08)) * w * 1.02, Math.sin(Math.PI * 1.92) * h * 1.02); g.quadraticCurveTo(w * 1.1 * s, -h * 0.1, w * 1.12 * s, h * 0.12); g.stroke();
    g.strokeStyle = 'rgba(150,84,64,0.32)'; g.lineWidth = 2.2;
    for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(w * (1.22 + k * 0.05) * s, h * (0.05 + k * 0.32)); g.lineTo(w * (1.42 + k * 0.04) * s, h * (-0.1 + k * 0.45)); g.stroke(); }
    g.strokeStyle = 'rgba(180,110,90,0.3)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, h * 0.25, w * 0.75, h * 0.95, 0, Math.PI * 0.28, Math.PI * 0.72); g.stroke();   // ふっくらした 下まぶた(笑ったときの ふくらみ)
  }
  // 下まぶた(うすく)
  g.strokeStyle = 'rgba(60,30,24,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, w * 0.9, h * 1.0, 0, Math.PI * 0.25, Math.PI * 0.75); g.stroke();
  g.restore();
}

/* ---------- 頭の形(ただの丸ではなく、上が広く あごに向かって細いアニメの頭) ---------- */
function headDeform(face) {
  const a = { round: 0.12, egg: 0.21, sharp: 0.29, square: 0.08, long: 0.2, tall: 0.22 }[face] ?? 0.18;
  const sq = face === 'square', lg = face === 'long', tl = face === 'tall';   // tall: たまご型を 縦に のばした形(大将ノブ。11-22 ノブさん「もう少し 長細く 縦に」)   // long: 面長(大将ノブ専用。11-21 ノブさん)
  return (x, y, z, R) => {
    const ny = y / R;
    if (ny < 0) {
      const t = Math.min(1, -ny);
      x *= (1 - a * Math.pow(t, 1.5)) * (sq ? 1 + 0.05 * t : 1);
      z *= z > 0 ? 1 - 0.06 * t : 1 - 0.22 * t;
      y *= 1 + (sq ? 0.02 : lg ? 0.3 : tl ? 0.32 : 0.1) * t; if (lg) x *= 0.92; if (tl) x *= 0.92;   // 11-22 ノブさん「もう少し面長に」で 0.16→0.3・はば 0.96→0.92
    } else { x *= (1 + 0.035 * ny) * (lg ? 0.94 : tl ? 0.94 : 1); y *= lg ? 1.05 : tl ? 1.07 : 1.02; z *= 1 + 0.02 * ny; }
    return [x, y, z];
  };
}
function deformGeo(geo, D, R) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = D(p.getX(i), p.getY(i), p.getZ(i), R); p.setXYZ(i, v[0], v[1], v[2]); }
  geo.computeVertexNormals(); return geo;
}
/* 頭の表面の点(θ: 真上0、φ: 正面0・右が+) */
function sp(D, R, th, ph, r) { return new THREE.Vector3(...D(r * Math.sin(th) * Math.sin(ph), r * Math.cos(th), r * Math.sin(th) * Math.cos(ph), R)); }

/* ---------- 髪の土台(頭にかぶせる かたまり)。生えぎわは 前・横・後ろで高さがちがう ---------- */
function hairShell(D, R, o) {
  const SP = 44, ST = 16, pos = [], idx = [];
  for (let j = 0; j <= ST; j++) for (let i = 0; i <= SP; i++) {
    const ph = (i / SP) * Math.PI * 2 - Math.PI, a = Math.cos(ph);
    let hl = a >= 0 ? o.s + (o.f - o.s) * Math.pow(a, 1.4) : o.s + (o.b - o.s) * Math.pow(-a, 1.1);
    if (o.part != null) hl -= 0.12 * Math.exp(-Math.pow((ph - o.part) * 4, 2));   // 分け目のところは 少し上がる
    const th = (j / ST) * hl;
    const top = Math.max(0, Math.cos(th));
    let r = R * (1.04 + o.vol * Math.pow(top, 1.4) + (a < 0 ? o.crown * Math.pow(Math.sin(th * 1.6), 2) * (-a) : 0));
    const v = sp(D, R, th, ph, r); pos.push(v.x, v.y, v.z);
  }
  for (let j = 0; j < ST; j++) for (let i = 0; i < SP; i++) { const a = j * (SP + 1) + i, b = a + SP + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* ---------- 毛の束: 根もとが太く、先が とがった 平たい束 ---------- */
function strandGeo(pts, w0, flat = 0.4, blunt = 0, wave = 0) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
  // 段の数は束の長さに合わせる(短い前髪は6段、長い髪は14段まで)。前は全部14段だった(2026-11-19 軽くした)
  const S = window.__strandFull ? 14 : Math.max(6, Math.min(14, Math.ceil(curve.getLength() / 0.022))), A = 6, pos = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    C.set(0, Math.min(P.y, 0), 0); N.copy(P).sub(C).normalize(); N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    let w = w0 * (t < 0.12 ? 0.8 + t / 0.12 * 0.2 : 1 - Math.pow((t - 0.12) / 0.88, 1.7) * (1 - blunt));
    w = Math.max(w, w0 * 0.03);
    const wv = wave ? Math.sin(t * Math.PI * 3) * wave : 0;
    for (let k = 0; k < A; k++) {
      const an = (k / A) * Math.PI * 2;
      pos.push(P.x + B.x * (Math.cos(an) * w + wv) + N.x * Math.sin(an) * w * flat,
               P.y + B.y * (Math.cos(an) * w + wv) + N.y * Math.sin(an) * w * flat,
               P.z + B.z * (Math.cos(an) * w + wv) + N.z * Math.sin(an) * w * flat);
    }
  }
  for (let i = 0; i < S; i++) for (let k = 0; k < A; k++) { const a = i * A + k, b = i * A + (k + 1) % A, c = a + A, d = b + A; idx.push(a, c, b, b, c, d); }
  const tip = pos.length / 3; const L = curve.getPointAt(1); pos.push(L.x, L.y, L.z);
  for (let k = 0; k < A; k++) idx.push(S * A + k, tip, S * A + (k + 1) % A);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* 束の道すじ。頭に そって進み(hug)、頭の いちばん広い所を こえたら 下へ たれる */
function strandPath(D, R, s) {
  const pts = [];
  const rs = (th) => R * (1.045 + (s.vol || 0) * Math.pow(Math.max(0, Math.cos(th)), 1.4) + 0.022 + (s.lift || 0));   // 土台の表面より 少し外
  const leave = s.leave ?? 1.55;
  let th = s.th, ph = s.ph, pos = null, onHead = true;
  if (s.endY != null) {   // 頭に そって 進み、いちばん広い所を こえたら endY の高さまで たれる
    const ds = R * 0.1; let k = 0, hang = 0;
    while (k++ < 60) {
      if (onHead) {
        pos = sp(D, R, th, ph, rs(th) * (1 + (s.puff || 0) * Math.sin(Math.min(1, (th - s.th) / Math.max(0.01, leave - s.th)) * Math.PI)));
        th += ds / rs(th); ph += (s.sweep || 0) * ds / R;
        if (th > leave) onHead = false;
      } else {
        const out = new THREE.Vector3(pos.x, 0, pos.z).normalize();
        pos = pos.clone(); pos.y -= ds; hang += ds;
        pos.addScaledVector(out, (s.flare ?? 0.08) * ds * Math.max(0, 1 - hang / (R * 1.2)));   // 上のほうは ふくらみ、下は まっすぐ
        if (s.fwd) pos.z += s.fwd * ds;
        if (s.inward) { pos.x *= 1 - s.inward * 0.02; }
      }
      pts.push(pos.clone());
      if (!onHead && pos.y <= s.endY * R) break;
    }
  } else {
    const N = 12, ds = s.len / N, r0 = rs(s.th);
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      if (onHead) {
        const r = s.up ? rs(th) * (1 + (s.rise || 0.3) * t) : rs(th) * (1 + (s.puff || 0) * Math.sin(t * Math.PI));
        pos = sp(D, R, th, ph, r);
        th += (s.up ? -1 : 1) * ds / r0; ph += (s.sweep || 0) * ds / R;
        if (!s.up && th > leave) onHead = false;
      } else {
        const out = new THREE.Vector3(pos.x, 0, pos.z).normalize();
        pos = pos.clone(); pos.y -= ds; pos.addScaledVector(out, (s.flare ?? 0.12) * ds);
        if (s.fwd) pos.z += s.fwd * ds;
      }
      pts.push(pos.clone());
    }
  }
  if (s.curl) {   // 毛先を 内(−)か 外(+)へ はねる
    const n = pts.length;
    for (let k = Math.floor(n * 0.7); k < n; k++) { const e = (k - n * 0.7) / (n * 0.3); const out = new THREE.Vector3(pts[k].x, 0, pts[k].z).normalize(); pts[k].addScaledVector(out, s.curl * e * e * R * 0.45); pts[k].y += Math.abs(s.curl) * e * e * R * 0.2; }
  }
  return pts;
}
/* 髪の「天使の輪」(つやの帯)と、内がわの影を 頂点の色で入れる */
function hairTint(geo, R) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ph = Math.atan2(x, z);
    const band = y / R - (0.5 + 0.035 * Math.sin(ph * 14));   // ぎざぎざの帯
    let k = 1;
    if (Math.abs(band) < 0.055 && z > -0.55 * R) k = 1.42 - Math.abs(band) * 4;
    if (y < -0.2 * R) k *= Math.max(0.72, 1 + (y / R + 0.2) * 0.22);   // 下のほうは 少し暗く
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function buildHair(head, a, R, D) {
  const HAT = ((!a.owner || a._decoy) && (a.acc === 'cap' || a.acc === 'beanie' || a.acc === 'beret')) || a._cosHat;   // 帽子をかぶっているときは、帽子の中に入る てっぺんの毛は作らない(帽子から突きぬけないように)
  const hc = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
  const dark = shade(hc, 0.78);
  const F = a.sex === 'f';
  const add = (geo, color = hc, line = 0.0035) => { hairTint(geo, R); const m = tm(geo, color, 0, 0, 0, line); m.material = toon(color, { vertexColors: true }); head.add(m); return m; };
  let VOL = 0.07;
  const shell = (o) => { VOL = o.vol ?? 0.07; const m = add(hairShell(D, R, Object.assign({ f: 0.95, s: 1.65, b: 2.0, vol: 0.07, crown: 0.03 }, o)), o.color || hc, 0); m.material = toon(o.color || hc, { side: THREE.DoubleSide, vertexColors: true }); return m; };
  const st = (s, w = 0.03, flat = 0.4, blunt = 0, color) => { if (s.vol == null) s.vol = VOL; return add(strandGeo(strandPath(D, R, s), w, flat, blunt, s.wave || 0), color); };
  const spike = (th, ph, len, w = 0.05, back = 0.35) => {   // ツンツン: 根もとから 外へ、少し上・後ろへ
    if (HAT) return;
    const r = R * (1.06 + VOL * Math.pow(Math.max(0, Math.cos(th)), 1.4)); const p0 = sp(D, R, th, ph, r * 0.97);
    const n = p0.clone().normalize(); const up = new THREE.Vector3(0, 1, -back).normalize();
    const pts = [p0, p0.clone().addScaledVector(n, len * 0.45).addScaledVector(up, len * 0.15), p0.clone().addScaledVector(n, len * 0.8).addScaledVector(up, len * 0.35), p0.clone().addScaledVector(n, len).addScaledVector(up, len * 0.55)];
    add(strandGeo(pts, w, 0.55));
  };
  const row = (n, from, to, f) => { for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); f(from + (to - from) * t, t, k); } };
  const jit = (k, amt) => (Math.sin(k * 12.9898) * 43758.5453 % 1) * amt;
  const endLen = (th0, thEnd, lift = 0) => (thEnd - th0) * R * (1.065 + lift);

  /* ---- 横と後ろ(髪型ごと) ---- */
  const sides = (len, n = 3, curl = -0.25, w = 0.045, wave = 0, from = 1.15, to = 1.75) => [-1, 1].forEach((sg) => row(n, from, to, (ph, t, k) => st({ th: 0.75 + t * 0.15, ph: sg * ph, len: len * (1 - t * 0.12) + jit(k, 0.01), curl, flare: 0.05, wave }, w)));
  const backs = (len, n = 9, curl = -0.25, w = 0.055, layer2 = true, wave = 0, spread = 2.4) => {
    row(n, Math.PI - spread / 2, Math.PI + spread / 2, (ph, t, k) => st({ th: 0.55 + Math.abs(t - 0.5) * 0.4, ph, len: len * (0.95 + jit(k, 0.08)), curl, flare: 0.1, wave }, w));
    if (layer2) row(n - 2, Math.PI - spread / 2.4, Math.PI + spread / 2.4, (ph, t, k) => st({ th: 0.3, ph, len: len * 0.82, curl: curl * 0.8, flare: 0.14, lift: 0.03, wave }, w * 1.05));
  };
  const nape = (len = R * 0.9) => row(7, Math.PI - 1.1, Math.PI + 1.1, (ph, t, k) => st({ th: 0.9, ph, len, curl: 0.05, flare: 0.02 }, 0.04));
  const topTex = (n = 7, back = true) => HAT ? 0 : row(n, -0.9, 0.9, (ph, t, k) => st({ th: 0.12, ph: ph + (back ? Math.PI : 0), len: R * 0.9, leave: 3, lift: 0.025, sweep: 0 }, 0.05, 0.3));

  /* ---- 前髪 ---- */
  const bangs = () => {
    const b = a.bangs || (F ? 'seethrough' : 'down');
    switch (b) {
      case 'patsun': row(12, -0.95, 0.95, (ph, t, k) => st({ th: 0.32, ph, len: endLen(0.32, 1.33), leave: 3 }, 0.034, 0.35, 0.55)); break;
      case 'seethrough': row(8, -0.9, 0.9, (ph, t, k) => st({ th: 0.38, ph, len: endLen(0.38, 1.42 - Math.abs(t - 0.5) * 0.12 + jit(k, 0.06)), leave: 3, curl: -0.04 }, 0.026, 0.35)); break;
      case 'nagashi': row(9, -0.95, 0.8, (ph, t, k) => st({ th: 0.32, ph, len: endLen(0.32, 1.3 + t * 0.25), leave: 3, sweep: 0.55 }, 0.034, 0.38)); break;
      case 'center': [-1, 1].forEach((sg) => row(4, 0.12, 0.9, (ph, t, k) => st({ th: 0.3, ph: sg * ph, len: endLen(0.3, 1.38 + t * 0.12), leave: 3, sweep: sg * 0.6, puff: 0.05 }, 0.036, 0.38))); break;
      case 'long': row(9, -0.9, 0.9, (ph, t, k) => st({ th: 0.35, ph, len: endLen(0.35, 1.6 + jit(k, 0.05)), leave: 3, sweep: 0.15 }, 0.032, 0.38)); break;
      case 'up': row(8, -0.75, 0.75, (ph, t, k) => st({ th: 0.95, ph, len: R * 0.95, up: true, rise: 0.35 + jit(k, 0.1), sweep: (t - 0.5) * 0.4 }, 0.05, 0.35)); break;   // かき上げ(アップバング)
      case 'short': row(8, -0.8, 0.8, (ph, t, k) => st({ th: 0.4, ph, len: endLen(0.4, 1.12 + jit(k, 0.06)), leave: 3, sweep: 0.2 }, 0.04, 0.4)); break;
      case 'sideswept': row(8, -0.9, 0.7, (ph, t, k) => st({ th: 0.3, ph, len: endLen(0.3, 1.25 + t * 0.2), leave: 3, sweep: 0.75, puff: 0.06 }, 0.042, 0.38)); break;
      default: row(9, -0.85, 0.85, (ph, t, k) => st({ th: 0.4, ph, len: endLen(0.4, 1.3 + jit(k, 0.08)), leave: 3, sweep: 0.05 * Math.sin(k), wave: a.hair === 'perm' ? 0.01 : 0, curl: a.hair === 'perm' ? 0.15 : 0 }, 0.036, 0.4)); // down: 下ろす(ぎざぎざ)
    }
  };
  const ahoge = () => {   // アホ毛: てっぺんから くるっと
    const p = [new THREE.Vector3(0, R * 1.08, R * 0.05), new THREE.Vector3(R * 0.05, R * 1.35, R * 0.15), new THREE.Vector3(R * 0.18, R * 1.42, R * 0.3), new THREE.Vector3(R * 0.22, R * 1.3, R * 0.42)];
    add(strandGeo(p, 0.022, 0.4));
  };
  const tail = (x, y, z, len, n = 6, w = 0.05, curl = 0.2, side = 0, wave = 0) => {   // 結んだ毛たば(ポニーテール・ツインテール)
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.012, p = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; p.push(new THREE.Vector3(x + off + side * Math.sin(t * 2) * 0.06 + (wave ? Math.sin(t * 9 + k) * wave : 0), y + 0.02 - t * len, z - 0.04 - Math.sin(t * Math.PI * 0.6) * 0.08 + curl * t * t * 0.1)); }
      add(strandGeo(p, w, 0.6));
    }
    const tie = tm(new THREE.TorusGeometry(0.026, 0.011, 8, 16), '#c8263a', x, y + 0.01, z - 0.03); tie.rotation.x = Math.PI / 2 - 0.3; head.add(tie);
  };
  const L = (d) => d * R;   // 長さ(頭の半径の何倍)

  /* ---- 女性用の部品 ---- */
  // 横: 顔の横〜耳の後ろ。endY まで たらす
  const fSides = (endY, n = 4, curl = -0.3, w = 0.048, wave = 0, from = 1.2, to = 1.95) => [-1, 1].forEach((sg) => row(n, from, to, (ph, t, k) => st({ th: 0.62 + t * 0.12, ph: sg * ph, endY: endY + jit(k, 0.06), curl, flare: 0.07, wave, leave: 1.45 }, w)));
  // 後ろ: 2段(内がわの短い段と、外がわの長い段)
  const fBacks = (endY, n = 11, curl = -0.3, w = 0.058, wave = 0, spread = 2.5) => {
    row(n, Math.PI - spread / 2, Math.PI + spread / 2, (ph, t, k) => st({ th: 0.5 + Math.abs(t - 0.5) * 0.35, ph, endY: endY + jit(k, 0.07), curl, flare: 0.09, wave, leave: 1.5 }, w));
    row(n - 2, Math.PI - spread / 2.3, Math.PI + spread / 2.3, (ph, t, k) => st({ th: 0.22, ph, endY: endY + 0.12 + jit(k + 5, 0.05), curl: curl * 0.8, flare: 0.13, lift: 0.025, wave, leave: 1.45 }, w * 1.08));
  };
  // 顔まわり(触角): 顔の横に そう 長めの毛。あると顔が小さく かわいく見える
  const frame = (endY = -0.95, w = 0.032, curl = -0.15, wave = 0) => [-1, 1].forEach((sg) => { [0.98, 1.12].forEach((ph, k) => st({ th: 0.5 + k * 0.08, ph: sg * ph, endY: endY + k * 0.12, curl, flare: -0.05, sweep: -sg * 0.05, wave, leave: 1.35, inward: 1 }, w - k * 0.004)); });
  // てっぺん: つむじ(後ろの上)から 流れる毛
  const crown = (n = 14, len = 1.0) => { if (HAT) return; for (let k = 0; k < n; k++) { const ph = Math.PI + (k / n - 0.5) * Math.PI * 1.9; st({ th: 0.24, ph, endY: null, len: R * len, leave: 3, lift: -0.012, sweep: 0 }, 0.06, 0.28); } };
  // 結び目へ 引っぱられる毛(ポニーテール・ツインテール・おだんご): 生えぎわから 結び目まで 頭の表面を通る
  const pull = (tieTh, tiePh, n = 16, w = 0.05) => {
    const T = sp(D, R, tieTh, tiePh, 1).normalize();
    for (let k = 0; k < n; k++) {
      const ph = (k / n) * Math.PI * 2;
      const a = Math.cos(ph); const th0 = a >= 0 ? 0.85 + (1 - a) * 0.5 : 1.35 + (-a) * 0.75;   // 生えぎわ
      const S = sp(D, R, th0, ph, 1).normalize();
      if (S.angleTo(T) < 0.35) continue;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, v = S.clone().lerp(T, t).normalize();
        const th = Math.acos(Math.max(-1, Math.min(1, v.y))), r = R * (1.06 + VOL * Math.pow(Math.max(0, Math.cos(th)), 1.4)) * (1 + 0.04 * Math.sin(t * Math.PI));
        pts.push(new THREE.Vector3(...D(v.x * r, v.y * r, v.z * r, R)));
      }
      add(strandGeo(pts, w * 1.25, 0.2), hc, 0);   // 線は付けない(放射状の すじが目立たないように)
    }
  };
  // 丸い毛たば(ポニーテール・ツインテール): 結び目から すぼまり→ふくらみ→毛先へ
  const roundTail = (x, y, z, len, dir = 0, n = 11, w = 0.03, wave = 0, swing = 0.12) => {
    const tie = new THREE.Vector3(x, y, z);
    for (let k = 0; k < n; k++) {
      const an = (k / n) * Math.PI * 2, pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = 0.012 + 0.036 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.75) * (1 - t * 0.55);
        const ax = new THREE.Vector3(x + dir * Math.sin(t * 1.6) * swing * R * 2, y - t * len, z - Math.sin(t * Math.PI * 0.55) * swing * R * 1.4 + t * t * 0.02);
        pts.push(ax.add(new THREE.Vector3(Math.cos(an) * r + (wave ? Math.sin(t * 8 + k) * wave : 0), 0, Math.sin(an) * r)));
      }
      add(strandGeo(pts, w, 0.55));
    }
    const sc = tm(new THREE.TorusGeometry(0.022, 0.012, 8, 18), '#d8475e', tie.x, tie.y, tie.z, 0.002); sc.rotation.x = Math.PI / 2 - 0.4; head.add(sc);   // シュシュ
  };
  // おだんご: 玉に 巻きつく毛
  const bun = (x, y, z, r) => {
    head.add(tm(new THREE.SphereGeometry(r * 0.92, 20, 14), shade(hc, 0.92), x, y, z, 0.003));
    for (let k = 0; k < 9; k++) {
      const tilt = (k / 9) * Math.PI, pts = [];
      for (let i = 0; i <= 14; i++) { const a2 = (i / 14) * Math.PI * 1.5 + k; pts.push(new THREE.Vector3(x + Math.cos(a2) * r * Math.cos(tilt), y + Math.sin(a2) * r, z + Math.cos(a2) * r * Math.sin(tilt) * 0.9)); }
      add(strandGeo(pts, 0.03, 0.5));
    }
    const pin = tm(new THREE.CylinderGeometry(0.004, 0.004, r * 2.4, 6), '#e8b84a', x, y + r * 0.3, z, 0.001); pin.rotation.z = 1.1; head.add(pin);
  };

  if (F) switch (a.hair) {
    case 'bob':      shell({ f: 0.85, s: 1.9, b: 2.35, vol: 0.08 }); crown(); frame(-0.85); fSides(-0.95, 4, -0.4); fBacks(-0.95, 11, -0.4); break;
    case 'shortbob': shell({ f: 0.85, s: 1.85, b: 2.25, vol: 0.08 }); crown(); frame(-0.6); fSides(-0.62, 4, -0.35); fBacks(-0.62, 11, -0.35); break;
    case 'short':    shell({ f: 0.9, s: 1.75, b: 2.25, vol: 0.07, part: 0.5 }); crown(13, 0.95); frame(-0.4, 0.028, -0.05); fSides(-0.35, 3, -0.15, 0.04, 0, 1.25, 1.8); fBacks(-0.6, 11, -0.2, 0.052, 0, 2.4); break;
    case 'long':     shell({ f: 0.85, s: 1.9, b: 2.35, vol: 0.07 }); crown(); frame(-1.5); fSides(-2.3, 4, -0.2); fBacks(-2.6, 12, -0.15); break;
    case 'wave':     shell({ f: 0.85, s: 1.9, b: 2.35, vol: 0.1 }); crown(); frame(-1.4, 0.034, 0.15, 0.01); fSides(-2.2, 4, 0.25, 0.052, 0.014); fBacks(-2.45, 12, 0.3, 0.062, 0.016); break;
    case 'ponytail': shell({ f: 0.92, s: 1.65, b: 2.0, vol: 0.05, crown: 0 }); pull(0.95, Math.PI, 18); frame(-0.7, 0.028); roundTail(0, R * 0.6, -R * 1.02, R * 2.1, 0, 12, 0.032, 0, 0.16); break;
    case 'twin':     shell({ f: 0.9, s: 1.72, b: 2.05, vol: 0.06, part: Math.PI }); pull(1.0, Math.PI * 0.72, 9, 0.042); pull(1.0, -Math.PI * 0.72, 9, 0.042); frame(-0.75, 0.028); [-1, 1].forEach((sg) => roundTail(sg * R * 0.82, R * 0.42, -R * 0.5, R * 1.9, sg, 10, 0.03, 0, 0.11)); break;
    case 'bun':      shell({ f: 0.92, s: 1.65, b: 2.0, vol: 0.05 }); pull(0.4, Math.PI, 18); frame(-0.7, 0.026); bun(0, R * 1.02, -R * 0.38, R * 0.42); break;
    case 'halfup':   shell({ f: 0.85, s: 1.9, b: 2.35, vol: 0.07 }); crown(); frame(-1.3); fSides(-2.0, 4, -0.2); fBacks(-2.3, 12, -0.15); roundTail(0, R * 0.5, -R * 1.05, R * 0.75, 0, 7, 0.026, 0, 0.08); break;
    case 'side':     shell({ f: 0.88, s: 1.75, b: 2.05, vol: 0.07, part: -0.6 }); crown(); frame(-0.6, 0.028, -0.05);
      for (let k = 0; k < 8; k++) st({ th: 0.6 + k * 0.07, ph: 1.35 + k * 0.13, endY: -2.1 + jit(k, 0.1), curl: -0.2, flare: -0.02, fwd: 0.22, wave: 0.008, leave: 1.4 }, 0.055);
      roundTail(R * 0.95, -R * 0.35, R * 0.15, R * 0.01, 0, 1, 0.01); break;
    default: shell({}); crown(); fSides(-0.9); fBacks(-0.9);
  }
  else {   /* 男性(2026-11-19 作りなおし): 女性と同じく「束」を重ねる。前・横・後ろ・上で組み立て、髪型ごとに合う前髪を付ける */
    const skinC = AVATAR.color(AVATAR.SKIN, a.skin);
    const mixC = (c1, c2, t) => { const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = h(c1), B = h(c2); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };   // 見た目どおりの色で まぜる
    // オールバック: 額の生えぎわから てっぺんを通って 後ろへ なでつけた束
    const comb = (ph0, w = 0.05, endTh = 2.0, startTh = 0.72) => {
      const pts = [], n = 16;
      for (let i = 0; i <= n; i++) {
        const u = -startTh + (endTh + startTh) * (i / n), th = Math.abs(u), ph = u < 0 ? ph0 : Math.PI - ph0 * 0.85;
        const r = R * (1.06 + 0.08 * Math.pow(Math.max(0, Math.cos(th)), 1.4)) * (1 + 0.035 * Math.sin((i / n) * Math.PI));
        pts.push(sp(D, R, Math.max(th, 0.02), ph, r));
      }
      add(strandGeo(pts, w, 0.25, 0.3));
    };
    switch (a.hair) {
      case 'short':    shell({ f: 0.92, s: 1.62, b: 1.95, vol: 0.075, part: -0.5 }); crown(13, 0.9); fSides(-0.12, 3, -0.15, 0.042, 0, 1.3, 1.9); fBacks(-0.42, 10, -0.12, 0.05, 0, 2.3); break;
      case 'twoblock': { const sd = add(hairShell(D, R, { f: 0.95, s: 1.78, b: 2.05, vol: 0, crown: 0 }), mixC(hc, skinC, 0.22), 0); sd.scale.setScalar(1.0); }   // 刈り上げた横と後ろ
        shell({ f: 0.88, s: 1.12, b: 1.25, vol: 0.13 }); crown(15, 1.12); break;
      case 'mash':     shell({ f: 0.78, s: 1.85, b: 2.15, vol: 0.13 }); crown(15, 1.0); fSides(-0.3, 4, -0.45, 0.05, 0, 1.25, 1.95); fBacks(-0.55, 11, -0.4, 0.056); break;
      case 'medium':   shell({ f: 0.85, s: 1.85, b: 2.2, vol: 0.09, part: -0.4 }); crown(); frame(-0.7, 0.03, -0.1); fSides(-0.75, 4, -0.2, 0.046); fBacks(-0.85, 11, -0.15, 0.054); break;
      case 'wolf':     shell({ f: 0.88, s: 1.75, b: 2.2, vol: 0.1, crown: 0.05 }); crown(13, 0.95); fSides(-0.35, 3, 0.28, 0.045, 0, 1.25, 1.85); fBacks(-1.3, 10, 0.4, 0.05); break;
      case 'perm':     shell({ f: 0.85, s: 1.8, b: 2.15, vol: 0.15 }); crown(14, 1.0); fSides(-0.42, 4, 0.22, 0.05, 0.013); fBacks(-0.62, 11, 0.28, 0.058, 0.015);
        if (!HAT) for (let k = 0; k < 10; k++) st({ th: 0.3 + (k % 2) * 0.3, ph: (k / 10) * Math.PI * 2, len: L(0.55), lift: 0.05, puff: 0.12, curl: 0.35, wave: 0.012, leave: 1.3 }, 0.045); break;
      case 'spiky':    shell({ f: 0.92, s: 1.6, b: 1.95, vol: 0.07 }); fSides(-0.08, 3, 0.1, 0.04, 0, 1.3, 1.9); fBacks(-0.38, 9, 0.12, 0.05, 0, 2.2);
        row(6, -Math.PI * 0.85, Math.PI * 0.85, (ph, t, k) => spike(0.35, ph + Math.PI, L(0.5) + jit(k, 0.03), 0.075, 0.8));   // てっぺん: 後ろへ
        row(8, -Math.PI * 0.9, Math.PI * 0.9, (ph, t, k) => spike(0.8, ph + Math.PI, L(0.42) + jit(k + 3, 0.03), 0.07, 0.5)); spike(0.05, 0, L(0.5), 0.08, 0.6); break;
      case 'back':     shell({ f: 0.62, s: 1.6, b: 2.05, vol: 0.09 }); row(11, -1.05, 1.05, (ph) => comb(ph, 0.05, 2.0, 0.62)); [-1, 1].forEach((sg) => row(3, 1.2, 1.6, (ph) => comb(sg * ph, 0.045, 1.9, 1.25)));
        fBacks(-0.5, 9, -0.1, 0.05, 0, 2.2); break;
      case 'long':     shell({ f: 0.85, s: 1.75, b: 2.05, vol: 0.06, part: 0 }); pull(1.35, Math.PI, 16); frame(-0.8, 0.03, -0.1); roundTail(0, -R * 0.32, -R * 1.0, L(1.3), 0, 9, 0.028, 0, 0.1); break;
      case 'buzz':     { const m = add(hairShell(D, R, { f: 0.98, s: 1.6, b: 1.95, vol: 0.012, crown: 0 }), mixC(hc, skinC, 0.15), 0.003); m.scale.setScalar(1.0); } head.userData.hairR = R * 1.07; return;   // ぼうず: 地肌に近い色の短い毛
      case 'nobu': {   // 大将ノブ専用(2026-11-21): 前髪を上げて おでこを見せる(ツンツンでも オールバックでもない)。横は短め、えり足なし。黒
        const v = a.nHair || 'n1';
        const sd = add(hairShell(D, R, { f: 0.95, s: 1.66, b: 1.9, vol: 0.016, crown: 0 }), mixC(hc, skinC, 0.03), 0.003); sd.scale.setScalar(1.0);   // 横と後ろ: 短く そろえた毛
        const P = { n1: { f: 0.74, vol: 0.1, rise: 0.2, len: 0.6, sw: 0.08, n: 10, w: 0.072 }, n2: { f: 0.74, vol: 0.09, rise: 0.17, len: 0.66, sw: 0.5, n: 10, w: 0.07 },
          n3: { f: 0.77, vol: 0.12, rise: 0.3, len: 0.42, sw: 0.12, n: 12, w: 0.06 }, n4: { f: 0.72, vol: 0.08, rise: 0.12, len: 0.82, sw: 0.0, n: 11, w: 0.074 },
          n5: { f: 0.74, vol: 0.1, rise: 0.22, len: 0.58, sw: -0.45, n: 10, w: 0.07 } }[v] || {};
        shell({ f: P.f, s: 1.45, b: 1.72, vol: P.vol });   // 上: ふんわり(横・後ろとの段差は小さく)
        crown(15, 0.8);
        if (!HAT) {
          row(P.n, -1.0, 1.0, (ph, t, k) => st({ th: P.f + 0.03, ph, len: R * (P.len + jit(k, 0.06)), up: true, rise: P.rise + jit(k + 2, 0.05), sweep: P.sw + (t - 0.5) * 0.3 }, P.w, 0.3, 0.3));   // 前髪: 根もとから 立ち上げて 後ろへ流す(てっぺんで まとまらない長さ)
          row(P.n - 3, -0.75, 0.75, (ph, t, k) => st({ th: P.f + 0.2, ph: ph + 0.06, len: R * (P.len * 0.75 + jit(k + 4, 0.05)), up: true, rise: P.rise * 0.6, sweep: P.sw * 0.8 }, P.w * 0.95, 0.3, 0.3));   // 2段目(厚み)
        }
        VOL = P.vol; break; }
      default: shell({}); crown();
    }
  }
  head.userData.hairR = R * (1.045 + VOL + 0.04);   // 髪のいちばん外がわ(帽子・カチューシャの大きさの目安)
  if (a.hair !== 'buzz' && !HAT) { const cp = new THREE.Mesh(hairTint(new THREE.SphereGeometry(R * (1.045 + VOL + 0.032), 28, 6, 0, Math.PI * 2, 0, 0.4), R), toon(hc, { vertexColors: true })); cp.rotation.x = -0.12; head.add(cp); }   // つむじ
  if (!(a.sex === 'm' && (a.hair === 'back' || a.hair === 'buzz' || a.hair === 'nobu'))) bangs();
  if (a.ahoge === 'on' && !HAT) ahoge();
}

/* ---------- 体と服 ---------- */
function torsoGeo(f) {
  const pts = TORSO_PTS[f ? 'f' : 'm'].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i) * 0.7;
    if (f && z > 0) z += 0.03 * Math.exp(-Math.pow((y - 0.3) / 0.045, 2)) * Math.max(0, 1 - Math.abs(x) / 0.11);   // 胸のふくらみ(ひかえめ)
    if (!f && z > 0) z += 0.012 * Math.exp(-Math.pow((y - 0.31) / 0.06, 2));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}
function shapeGeo(pts, depth = 0.005, bevel = 0.0015) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2); return tessellate(g.index ? g.toNonIndexed() : g, window.__tessLen || 0.03);   // 3cm ごとに切る(前は1.4cm。前掛け1枚で2万三角になっていた。2026-11-19 軽くした)
}
/* 長い三角形を こまかく分ける(曲げたとき 板の中が沈まないように) */
function tessellate(geo, maxLen) {
  const src = geo.attributes.position.array, out = [];
  const stack = [];
  for (let i = 0; i < src.length; i += 9) stack.push([src[i], src[i + 1], src[i + 2], src[i + 3], src[i + 4], src[i + 5], src[i + 6], src[i + 7], src[i + 8]]);
  let guard = 0;
  while (stack.length && guard++ < 200000) {
    const t = stack.pop();
    const d = (a, b) => Math.hypot(t[a] - t[b], t[a + 1] - t[b + 1], t[a + 2] - t[b + 2]);
    const e = [d(0, 3), d(3, 6), d(6, 0)], m = Math.max(...e);
    if (m <= maxLen) { out.push(...t); continue; }
    const k = e.indexOf(m), A = [0, 3, 6][k], B = [3, 6, 0][k], C = [6, 0, 3][k];
    const M = [(t[A] + t[B]) / 2, (t[A + 1] + t[B + 1]) / 2, (t[A + 2] + t[B + 2]) / 2];
    const P = (i) => [t[i], t[i + 1], t[i + 2]];
    stack.push([...P(A), ...M, ...P(C)], [...M, ...P(B), ...P(C)]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.computeVertexNormals();
  return g;
}
/* 胸の前の面に そわせる(ネクタイ・えりなどを 体のカーブに合わせて曲げる) */
const TORSO_PTS = { f: [[0.13, 0], [0.14, 0.04], [0.118, 0.15], [0.112, 0.2], [0.125, 0.29], [0.128, 0.34], [0.1, 0.39], [0.06, 0.42], [0.036, 0.43]],
                    m: [[0.135, 0], [0.142, 0.04], [0.138, 0.15], [0.145, 0.24], [0.158, 0.32], [0.16, 0.36], [0.125, 0.4], [0.065, 0.428], [0.04, 0.435]] };
function torsoR(f, y) { const P = TORSO_PTS[f ? 'f' : 'm']; if (y <= P[0][1]) return P[0][0]; for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const t = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t; } return P[P.length - 1][0] * 0.6; }
function chestZ(f, y, x = 0) {   // 胴の前の面の z(lathe の形 × 0.7 + 胸のふくらみ)
  const r = torsoR(f, y), xx = Math.min(Math.abs(x), r * 0.98);
  let z = Math.sqrt(r * r - xx * xx) * 0.7;
  if (f) z += 0.03 * Math.exp(-Math.pow((y - 0.3) / 0.045, 2)) * Math.max(0, 1 - xx / 0.11); else z += 0.012 * Math.exp(-Math.pow((y - 0.31) / 0.06, 2));
  return z;
}
function onChest(geo, f, x0, y0, lift = 0.004) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + x0, y = p.getY(i) + y0; p.setXYZ(i, x, y, p.getZ(i) + chestZ(f, y, x) + lift); }
  geo.computeVertexNormals(); return geo;
}
const TOP_DEF = {
  suit: { sleeve: 'long' }, suitopen: { sleeve: 'long' }, shirt: { sleeve: 'long' }, polo: { sleeve: 'short' }, knit: { sleeve: 'long', tex: 'rib' }, hoodie: { sleeve: 'long' },
  jacket: { sleeve: 'long' }, denim: { sleeve: 'long', color: '#4a6a9a', tex: 'denim' }, work: { sleeve: 'long' }, tee: { sleeve: 'short' },
  blouse: { sleeve: 'puff' }, onepiece: { sleeve: 'short', skirt: true }, cardigan: { sleeve: 'long', tex: 'rib' }, office: { sleeve: 'long', skirt: true }, pantsuit: { sleeve: 'long', pants: 'same' },
  happi: { sleeve: 'wide' }, samue: { sleeve: 'long' }, hakui: { sleeve: 'long', color: '#f4f2ec' }, jinbei: { sleeve: 'wide' },
  kimono: { sleeve: 'long' }, yukata: { sleeve: 'wide' }, kappogi: { sleeve: 'long', color: '#f8f6f0' },
  ai: { sleeve: 'puff', skirt: true },   // アイちゃん専用: 大きな白いえりの ワンピース
  /* ---- アイちゃん専用の服(お客さんは選べない。ノブさん 2026-11-21)。skirtC: スカートの色(関数なら服の色から決める)・skirtTex: スカートの がら・
     tights: タイツの色・socks: くつしたの色・long: 長めのスカート・pantsC: ズボンの色・shorts: ショートパンツ・wide: ワイドパンツ */
  ai_turtle:  { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#cbbfae', skirtTex: 'check', tights: '#4a4650' },   // タートル + うすいチェックのスカート
  ai_turtle2: { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#d8ccbc', socks: '#e8dccb' },   // タートル + 無地のスカート
  /* ---- 2回目(ノブさん 2026-11-21): 20代前半の落ち着いた可愛さ。フリル・派手な色はなし。色は うすいパステル、パンツは落ち着いた色も */
  ai_boat:    { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#d8ccbc', socks: '#e8dccb' },   // ボートネックのニット + スカート(胸元が少し開く → ネックレス)
  ai_openshirt: { sleeve: 'long', pantsC: '#8a8a90', wide: true },   // 開襟シャツ + ワイドパンツ(胸元が少し開く → ネックレス)
  ai_sweat:   { sleeve: 'long', pantsC: '#7a7a82' },   // スウェット + グレーのパンツ(ラフ)
  ai_pleats:  { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#d4cfc8', skirtTex: 'pleat', socks: '#e8dccb' },   // うすいニット + プリーツスカート
  ai_cardi2:  { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#cfc4b4', socks: '#e8dccb' },   // ボタンを留めたカーディガン(パールのボタン) + スカート
  ai_tee:     { sleeve: 'short', pantsC: '#c8b89a' },   // Tシャツ + ベージュのパンツ(ラフ)
  ai_quilt:   { sleeve: 'long', tex: 'rib', pantsC: '#3a3a42' },   // タートル + キルティングのベスト + パンツ
  ai_vdress:  { sleeve: 'long', skirt: true, skirtC: (a, cc) => cc, socks: '#e8dccb' },   // 浅いVネックのワンピース(胸元が少し開く → ネックレス)
  ai_jacket2: { sleeve: 'long', pantsC: '#8a8a90' },   // えりのないジャケット + グレーのパンツ(きれいめ)
  ai_knitdress: { sleeve: 'long', tex: 'rib', skirt: true, skirtC: (a, cc) => cc, skirtTex: 'rib', socks: '#f2ece4' },   // ニットのワンピース(制服っぽい服は作らない。ノブさん 2026-11-21)
  ai_denim:   { sleeve: 'puff', skirt: true, skirtC: '#4a6a9a', skirtTex: 'denim', socks: '#f6f4ee' },   // ふんわり袖のトップス + デニムのスカート
  ai_vknit:   { sleeve: 'long', tex: 'rib', pantsC: '#2c3044' },   // Vネックのニット + 細身のパンツ(大人っぽく。子どもっぽい服は作らない ノブさん 2026-11-21)
  ai_shirtdress: { sleeve: 'long', skirt: true, skirtC: (a, cc) => cc, socks: '#e8dccb' },   // シャツワンピース + 細いベルト
  ai_vdeep:   { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#2c2c34', socks: '#2a2630' },   // 深めのVネックのニット(胸元が少し開いた服 ノブさん 2026-11-21)
  ai_square:  { sleeve: 'puff', skirt: true, skirtC: '#5a4a3a', socks: '#e8dccb' },   // スクエアネックのトップス
  ai_wrap:    { sleeve: 'long', skirt: true, skirtC: (a, cc) => cc, socks: '#e8dccb' },   // 前で重ねるワンピース(カシュクール)
  ai_blouse:  { sleeve: 'long', skirt: true, skirtC: '#24242c', socks: '#2a2630' },   // とろみブラウス + 黒のタイトスカート(きれいめ ノブさん 2026-11-21)
  ai_jacket:  { sleeve: 'long', skirt: true, skirtC: (a, cc) => cc, socks: '#e8dccb' },   // えりのないジャケット + 同じ色のスカート(きれいめ)
  ai_satin:   { sleeve: 'long', pantsC: '#2c3044', wide: true },   // つやのあるブラウス + ワイドパンツ(きれいめ)
  ai_hoodie:  { sleeve: 'long', pantsC: '#4a6a9a' },   // パーカー + デニムのパンツ(ラフ)
  ai_zip:     { sleeve: 'long', pantsC: '#8a8a92' },   // 前開きのパーカー + グレーのパンツ(ラフ)
  ai_cardi:   { sleeve: 'long', tex: 'rib', skirt: true, skirtC: '#2c2c34', socks: '#2a2630' },   // 前を開けたカーディガン(中は白) + 黒のスカート
  ai_wide:    { sleeve: 'long', tex: 'rib', pantsC: '#c8b08a', wide: true }
};
const AI_C = '#c8424e';   // アイちゃんの服の しるしの色(居酒屋に合う赤)
const AI_OPEN = ['ai_blouse', 'ai_boat', 'ai_openshirt', 'ai_vdress', 'ai_vdeep', 'ai_square', 'ai_wrap'];   // 胸元が開いた服(必ず ネックレスをつける ノブさん 2026-11-21)
const TEX_CACHE = {};
function fabricTex(kind) {
  if (TEX_CACHE[kind]) return TEX_CACHE[kind];
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    if (kind === 'rib') { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64); }
    if (kind === 'check') {   // チェック: 太い帯と 細い線
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 20, 64, 24); g.fillRect(20, 0, 24, 64);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(28, 28, 8, 8);
      g.fillStyle = 'rgba(255,240,200,0.55)'; g.fillRect(0, 50, 64, 2); g.fillRect(50, 0, 2, 64);
    }
    if (kind === 'pleat') { g.fillStyle = 'rgba(0,0,0,0.22)'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 3, 64); }   // プリーツの折り目
    if (kind === 'border') { g.fillStyle = '#2c3550'; g.fillRect(0, 0, 64, 22); }   // ボーダー(紺)
    if (kind === 'denim') { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; for (let k = -64; k < 64; k += 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); } }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...({ rib: [10, 1], check: [5, 2], pleat: [10, 1], border: [1, 7] }[kind] || [6, 3]));
  return (TEX_CACHE[kind] = t);
}
function buildTop(body, a, f, cc) {
  const W = '#f6f4ee';
  const put = (geo, color, line = 0.002) => { const m = tm(geo, color, 0, 0, 0, line); body.add(m); return m; };
  const tie = (color) => {   // ネクタイ: 結び目(台形)+ 下に広がって 先が とがった剣先
    put(onChest(shapeGeo([[-0.013, 0.012], [0.013, 0.012], [0.009, -0.012], [-0.009, -0.012]], 0.012, 0.002), f, 0, 0.405, 0.006), shade(color, 0.85));
    put(onChest(shapeGeo([[-0.008, 0], [0.008, 0], [0.021, -0.15], [0, -0.178], [-0.021, -0.15]], 0.004, 0.0015), f, 0, 0.393, 0.006), color);
  };
  const collarWings = (color, spread = 1) => [-1, 1].forEach((s) => {   // シャツのえり(とがった三角)
    const g = shapeGeo([[0, 0], [s * 0.05 * spread, -0.008], [s * 0.022, -0.06]], 0.004, 0.0015);
    const m = put(onChest(g, f, s * 0.012, 0.432, 0.012), color); m.rotation.x = -0.05;
  });
  const vShirt = (color = W, h = 0.15) => put(onChest(shapeGeo([[-0.05, 0], [0.05, 0], [0, -h]], 0.002, 0), f, 0, 0.43, 0.002), color, 0);
  const lapels = (color, low = 0.21) => [-1, 1].forEach((s) => {   // ジャケットのえり(切れこみの入った形)
    const g = shapeGeo([[s * 0.032, 0.0], [s * 0.056, 0.004], [s * 0.07, -0.03], [s * 0.056, -0.04], [s * 0.092, -0.068], [s * 0.05, -low * 0.8], [s * 0.004, -low], [s * 0.012, -low * 0.7]], 0.005, 0.0015);
    put(onChest(g, f, 0, 0.43, 0.01), shade(color, 0.88));
  });
  const buttons = (n, x = 0, color = '#2a2a2a', y0 = 0.27, gap = 0.055) => { for (let k = 0; k < n; k++) { const y = y0 - k * gap; body.add(tm(new THREE.SphereGeometry(0.0065, 8, 6), color, x, y, chestZ(f, y, x) + 0.007, 0)); } };
  const placket = (color, y0 = 0.42, y1 = 0.05) => put(onChest(shapeGeo([[-0.011, y0], [0.011, y0], [0.011, y1], [-0.011, y1]], 0.002, 0), f, 0, 0, 0.003), color, 0);
  const pocket = (x, y, color, flap = false) => { put(onChest(shapeGeo([[-0.025, 0.02], [0.025, 0.02], [0.025, -0.02], [0, -0.026], [-0.025, -0.02]], 0.002, 0.001), f, x, y, 0.004), color); if (flap) put(onChest(shapeGeo([[-0.027, 0.024], [0.027, 0.024], [0.027, 0.008], [-0.027, 0.008]], 0.003, 0.001), f, x, y, 0.007), shade(color, 0.9)); };
  const neckRib = (color, r = 0.046) => { const n = tm(new THREE.TorusGeometry(r, 0.01, 8, 24), color, 0, 0.43, 0.004, 0.002); n.rotation.x = Math.PI / 2 + 0.25; n.scale.y = 0.8; body.add(n); };
  const hem = (color) => { const r = tm(new THREE.CylinderGeometry(f ? 0.132 : 0.137, f ? 0.132 : 0.137, 0.035, 28, 1, true), color, 0, 0.02, 0, 0); r.scale.z = 0.71; body.add(r); };
  const crossCollar = (color, w = 0.034) => [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.0, 0.0], [s * w, 0.0], [-s * 0.07 + s * w, -0.3], [-s * 0.07, -0.3]], 0.004, 0.001), f, s * 0.035, 0.43, 0.004 + (s > 0 ? 0.004 : 0)), color));
  const roundCollar = (color) => [-1, 1].forEach((s) => { const g = new THREE.CircleGeometry(0.035, 24, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI); put(onChest(g, f, s * 0.004, 0.425, 0.012), color, 0.002); });
  const ribbon = (color) => { [-1, 1].forEach((s) => put(onChest(shapeGeo([[0, 0], [s * 0.035, 0.016], [s * 0.035, -0.016]], 0.006, 0.002), f, 0, 0.4, 0.016), color)); body.add(tm(new THREE.SphereGeometry(0.009, 8, 6), shade(color, 0.85), 0, 0.4, chestZ(f, 0.4) + 0.02, 0)); };
  const turtle = (color) => { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.075, 20), toon(shade(color, 0.92), { map: fabricTex('rib') })); n.position.set(0, 0.455, 0); n.add(outlineOf(n.geometry, 0.002)); body.add(n); };   // タートルネック
  const ribbon2 = (y, color) => { [-1, 1].forEach((s) => put(onChest(shapeGeo([[0, 0], [s * 0.04, 0.02], [s * 0.04, -0.02]], 0.007, 0.002), f, 0, y, 0.03), color)); body.add(tm(new THREE.SphereGeometry(0.011, 8, 6), shade(color, 0.85), 0, y, chestZ(f, y) + 0.034, 0)); };   // 腰の リボン
  /* パーカーのフード(2026-11-21 ノブさん「半分しか描かれず 輪切りに見える」→ 切れ目のない形に): 首まわりの 太い輪 + 背中に たれる ふくらんだフード + フードの口の 影 */
  const addHood = (cc) => {
    const ring = tm(new THREE.TorusGeometry(0.066, 0.026, 10, 28), cc, 0, 0.425, -0.012, 0.003); ring.rotation.x = Math.PI / 2 - 0.22; body.add(ring);
    const back = tm(new THREE.SphereGeometry(0.1, 18, 12), cc, 0, 0.37, -0.082, 0.003); back.scale.set(0.92, 0.95, 0.58); back.rotation.x = -0.18; body.add(back);
    const tip = tm(new THREE.ConeGeometry(0.045, 0.07, 12), cc, 0, 0.29, -0.1, 0.002); tip.rotation.x = Math.PI + 0.2; tip.scale.z = 0.6; body.add(tip);   // フードの先(下に すぼまる)
    const seam = tm(new THREE.TorusGeometry(0.06, 0.006, 6, 20, Math.PI), shade(cc, 0.82), 0, 0.36, -0.13, 0); seam.rotation.set(0, 0, Math.PI); seam.scale.set(1, 1.1, 1); body.add(seam);   // フードの ぬい目(まん中に たて)
  };
  switch (a.top) {
    case 'suit': vShirt(W, 0.22); collarWings(W, 0.8); tie(['#8a1f2a', '#2a3a6a', '#3a5a3a', '#6a2a6a'][typeof a.topColor === 'number' ? a.topColor % 4 : 0]); lapels(cc); buttons(2, 0.028, '#151515', 0.17); pocket(-0.07, 0.14, shade(cc, 0.9), true); break;
    case 'suitopen': vShirt(W, 0.22); collarWings(W, 1.1); lapels(cc); buttons(2, 0.028, '#151515', 0.17); break;
    case 'office': vShirt(W, 0.19); roundCollar(W); lapels(cc, 0.18); buttons(1, 0.02, '#151515', 0.2); break;
    case 'pantsuit': vShirt('#e8e2d8', 0.22); lapels(cc); buttons(2, 0.02, '#151515', 0.2); break;
    case 'shirt': collarWings(lighten(cc, 0.12)); placket(shade(cc, 0.95), 0.41, 0.0); buttons(5, 0, lighten(cc, 0.55), 0.39, 0.07); pocket(-0.06, 0.3, shade(cc, 0.94)); break;
    case 'polo': collarWings(lighten(cc, 0.1), 1.1); placket(shade(cc, 0.92), 0.42, 0.33); buttons(2, 0, '#f2f2f2', 0.405, 0.04); break;
    case 'knit': neckRib(shade(cc, 0.85)); hem(shade(cc, 0.82)); break;
    case 'hoodie': { addHood(cc);
      [-1, 1].forEach((s) => { const y = 0.33; body.add(tm(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5), W, s * 0.028, 0.37, chestZ(f, 0.37, s * 0.028) + 0.006, 0)); body.add(tm(new THREE.CylinderGeometry(0.005, 0.005, 0.014, 6), '#c8c8c8', s * 0.028, 0.32, chestZ(f, 0.32, s * 0.028) + 0.006, 0)); });
      put(onChest(shapeGeo([[-0.075, 0.06], [0.075, 0.06], [0.085, -0.01], [-0.085, -0.01]], 0.003, 0.0015), f, 0, 0.1, 0.004), shade(cc, 0.92)); hem(shade(cc, 0.86)); break; }
    case 'jacket': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.02], [-0.045, 0.02]], 0.002, 0), f, 0, 0, 0.002), W, 0); neckRib(W, 0.042); lapels(cc, 0.3); break;
    case 'denim': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.02], [-0.045, 0.02]], 0.002, 0), f, 0, 0, 0.002), W, 0); collarWings(shade(cc, 0.85), 1.2); pocket(-0.062, 0.29, shade(cc, 0.88), true); pocket(0.062, 0.29, shade(cc, 0.88), true); buttons(3, 0.052, '#c8a04a', 0.24, 0.07); break;
    case 'work': collarWings(shade(cc, 0.85)); put(onChest(shapeGeo([[-0.003, 0.42], [0.003, 0.42], [0.003, 0.02], [-0.003, 0.02]], 0.002, 0), f, 0, 0, 0.004), '#9a9a9a', 0); pocket(-0.065, 0.29, shade(cc, 0.9), true); pocket(0.065, 0.29, shade(cc, 0.9), true); hem(shade(cc, 0.82)); break;
    case 'tee': neckRib(shade(cc, 0.86), 0.044); break;
    case 'blouse': roundCollar(lighten(cc, 0.45)); ribbon(shade(cc, 0.7)); buttons(3, 0, lighten(cc, 0.6), 0.36, 0.06); break;
    case 'onepiece': roundCollar(W); body.add(tm(new THREE.CylinderGeometry(0.113, 0.115, 0.03, 28), shade(cc, 0.72), 0, 0.17, 0, 0.002)); ribbon(shade(cc, 0.6)); break;
    case 'ai': {   // アイちゃん専用: 大きな白い丸えり + 水色のリボン + 白いベルトに 水色の丸い留め具
      [-1, 1].forEach((s) => { const g = new THREE.CircleGeometry(0.078, 26, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI); put(onChest(g, f, s * 0.004, 0.425, 0.012), W, 0.002); });
      [-1, 1].forEach((s) => { const g = new THREE.RingGeometry(0.064, 0.071, 26, 1, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI); put(onChest(g, f, s * 0.004, 0.425, 0.0135), AI_C, 0); });   // えりの ふちの線
      body.add(tm(new THREE.CylinderGeometry(0.113, 0.115, 0.03, 28), W, 0, 0.17, 0, 0.002));
      body.add(tm(new THREE.SphereGeometry(0.011, 10, 8), AI_C, 0, 0.17, chestZ(f, 0.17) + 0.014, 0.0015));
      break; }
    case 'ai_turtle': case 'ai_wide': turtle(cc); hem(shade(cc, 0.86)); if (a.top === 'ai_wide') { body.add(tm(new THREE.CylinderGeometry(0.135, 0.138, 0.03, 28), '#8a6a4a', 0, 0.045, 0, 0.002)); ribbon2(0.045, '#8a6a4a'); } break;
    case 'ai_knitdress': neckRib(shade(cc, 0.85), 0.046); body.add(tm(new THREE.CylinderGeometry(0.114, 0.116, 0.014, 28), '#6a3a22', 0, 0.16, 0, 0.0015)); body.add(tm(new THREE.BoxGeometry(0.022, 0.018, 0.006), '#e8c04a', 0, 0.16, chestZ(f, 0.16) + 0.006, 0.001)); break;   // ニットのワンピース: 細い茶色のベルト + 金の留め具
    case 'ai_denim': neckRib(shade(cc, 0.88), 0.044); buttons(3, 0, lighten(cc, 0.55), 0.38, 0.055); break;   // ふんわり袖のトップス(胸元のリボンは つけない。ノブさん 2026-11-21)
    case 'ai_vdeep': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // 深めのV: 首から胸元まで 肌
      put(onChest(shapeGeo([[-0.05, 0.435], [0.05, 0.435], [0, 0.3]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.05, 0.437], [s * 0.06, 0.435], [s * 0.004, 0.288], [0, 0.3]], 0.003, 0.001), f, 0, 0, 0.006), shade(cc, 0.85))); hem(shade(cc, 0.86)); break; }
    case 'ai_square': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // スクエアネック: 四角く開いた えりぐり
      put(onChest(shapeGeo([[-0.062, 0.435], [0.062, 0.435], [0.062, 0.37], [-0.062, 0.37]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      put(onChest(shapeGeo([[-0.07, 0.375], [0.07, 0.375], [0.07, 0.362], [-0.07, 0.362]], 0.002, 0), f, 0, 0, 0.005), shade(cc, 0.8), 0); break; }
    case 'ai_wrap': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // カシュクール: 左右の布を前で重ねる(胸元に少し 肌)
      put(onChest(shapeGeo([[-0.05, 0.435], [0.05, 0.435], [0, 0.31]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      put(onChest(shapeGeo([[-0.06, 0.435], [-0.045, 0.437], [0.03, 0.29], [0.11, 0.2], [0.11, 0.17], [0.0, 0.25]], 0.003, 0.001), f, 0, 0, 0.007), shade(cc, 0.9));
      put(onChest(shapeGeo([[0.06, 0.435], [0.045, 0.437], [-0.006, 0.315], [0.01, 0.3]], 0.003, 0.001), f, 0, 0, 0.006), shade(cc, 0.82));
      body.add(tm(new THREE.CylinderGeometry(0.114, 0.116, 0.016, 28), shade(cc, 0.7), 0, 0.17, 0, 0.0015)); break; }
    case 'ai_blouse': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // とろみブラウス: 小さなVの えりもと + やわらかい ひだ
      put(onChest(shapeGeo([[-0.03, 0.435], [0.03, 0.435], [0, 0.37]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.03, 0.436], [s * 0.04, 0.434], [s * 0.003, 0.36], [0, 0.37]], 0.002, 0.001), f, 0, 0, 0.005), lighten(cc, 0.15)));
      [-0.05, 0.05].forEach((x) => put(onChest(shapeGeo([[x - 0.002, 0.34], [x + 0.002, 0.34], [x + 0.004, 0.12], [x - 0.004, 0.12]], 0.001, 0), f, 0, 0, 0.003), shade(cc, 0.9), 0)); break; }
    case 'ai_jacket': {   // えりのないジャケット: 中は白、前のふちの線、ボタン2つ
      put(onChest(shapeGeo([[-0.05, 0.43], [0.05, 0.43], [0.02, 0.24], [-0.02, 0.24]], 0.002, 0), f, 0, 0, 0.003), '#f6f2ea', 0);
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.05, 0.432], [s * 0.06, 0.432], [s * 0.026, 0.235], [s * 0.016, 0.238]], 0.002, 0.001), f, 0, 0, 0.006), shade(cc, 0.78)));
      buttons(2, 0, '#e8d8a8', 0.2, 0.06); pocket(-0.07, 0.12, shade(cc, 0.92), true); pocket(0.07, 0.12, shade(cc, 0.92), true); break; }
    case 'ai_satin': neckRib(lighten(cc, 0.12), 0.044); put(onChest(shapeGeo([[-0.004, 0.42], [0.004, 0.42], [0.004, 0.3], [-0.004, 0.3]], 0.001, 0), f, 0, 0, 0.003), shade(cc, 0.85), 0); buttons(1, 0, '#f6f2ea', 0.41); break;   // つやのあるブラウス(えりもとに小さな ボタン)
    case 'ai_hoodie': case 'ai_zip': { addHood(cc);   // パーカー(ラフ)
      if (a.top === 'ai_zip') { put(onChest(shapeGeo([[-0.03, 0.43], [0.03, 0.43], [0.03, 0.02], [-0.03, 0.02]], 0.002, 0), f, 0, 0, 0.002), '#f2ece2', 0); [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.03, 0.43], [s * 0.036, 0.43], [s * 0.036, 0.02], [s * 0.03, 0.02]], 0.002, 0), f, 0, 0, 0.004), '#b8b8c0', 0)); }
      else { [-1, 1].forEach((s) => body.add(tm(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5), '#f6f4ee', s * 0.028, 0.37, chestZ(f, 0.37, s * 0.028) + 0.006, 0))); put(onChest(shapeGeo([[-0.075, 0.06], [0.075, 0.06], [0.085, -0.01], [-0.085, -0.01]], 0.003, 0.0015), f, 0, 0.1, 0.004), shade(cc, 0.92)); }
      hem(shade(cc, 0.86)); break; }
    case 'ai_turtle2': turtle(cc); hem(shade(cc, 0.86)); break;
    case 'ai_boat': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // ボートネック: 横に広く 浅く開いた えりぐり
      put(onChest(shapeGeo([[-0.082, 0.437], [0.082, 0.437], [0.06, 0.4], [-0.06, 0.4]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      put(onChest(shapeGeo([[-0.064, 0.404], [0.064, 0.404], [0.06, 0.394], [-0.06, 0.394]], 0.002, 0), f, 0, 0, 0.005), shade(cc, 0.86), 0); hem(shade(cc, 0.86)); break; }
    case 'ai_openshirt': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // 開襟シャツ: えりを開いて 胸元に少し 肌
      put(onChest(shapeGeo([[-0.04, 0.435], [0.04, 0.435], [0, 0.35]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.04, 0.437], [s * 0.085, 0.425], [s * 0.04, 0.36], [s * 0.004, 0.345]], 0.003, 0.001), f, 0, 0, 0.008), lighten(cc, 0.12)));
      buttons(3, 0, lighten(cc, 0.55), 0.31, 0.07); pocket(-0.062, 0.3, shade(cc, 0.94)); break; }
    case 'ai_sweat': neckRib(shade(cc, 0.86), 0.046); hem(shade(cc, 0.84)); put(onChest(shapeGeo([[-0.012, 0.415], [0.012, 0.415], [0, 0.385]], 0.002, 0), f, 0, 0, 0.004), shade(cc, 0.82), 0); break;   // スウェット(えりもとに小さな三角)
    case 'ai_pleats': neckRib(shade(cc, 0.86), 0.045); hem(shade(cc, 0.86)); break;   // うすいニット(丸首)
    case 'ai_cardi2': neckRib(shade(cc, 0.85), 0.045); placket(shade(cc, 0.93), 0.42, 0.03); buttons(5, 0, '#fbf6ee', 0.39, 0.07); hem(shade(cc, 0.86)); break;   // ボタンを留めたカーディガン(パールのボタン)
    case 'ai_tee': neckRib(shade(cc, 0.88), 0.044); break;   // Tシャツ
    case 'ai_quilt': { turtle(cc); const vc = a.aiCol3 || '#d8d0c4';   // キルティングのベスト(前を留める)
      [-1, 1].forEach((s) => { const vm = put(onChest(shapeGeo([[s * 0.002, 0.4], [s * 0.05, 0.43], [s * 0.115, 0.4], [s * 0.115, 0.03], [s * 0.002, 0.03]], 0.004, 0.0015), f, 0, 0, 0.007), vc);
        for (let k = 0; k < 6; k++) put(onChest(shapeGeo([[s * 0.006, 0.07 + k * 0.055], [s * 0.112, 0.07 + k * 0.055], [s * 0.112, 0.073 + k * 0.055], [s * 0.006, 0.073 + k * 0.055]], 0.001, 0), f, 0, 0, 0.012), shade(vc, 0.85), 0); });
      break; }
    case 'ai_vdress': { const sk = AVATAR.color(AVATAR.SKIN, a.skin);   // 浅いVネックのワンピース + 同じ色の細いベルト
      put(onChest(shapeGeo([[-0.04, 0.435], [0.04, 0.435], [0, 0.36]], 0.002, 0), f, 0, 0, 0.003), sk, 0);
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.04, 0.437], [s * 0.05, 0.435], [s * 0.003, 0.35], [0, 0.36]], 0.002, 0.001), f, 0, 0, 0.005), shade(cc, 0.88)));
      body.add(tm(new THREE.CylinderGeometry(0.114, 0.116, 0.016, 28), shade(cc, 0.8), 0, 0.16, 0, 0.0015)); break; }
    case 'ai_jacket2': put(onChest(shapeGeo([[-0.05, 0.43], [0.05, 0.43], [0.02, 0.24], [-0.02, 0.24]], 0.002, 0), f, 0, 0, 0.003), '#f6f2ea', 0);   // えりのないジャケット(パンツ用)
      [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.05, 0.432], [s * 0.06, 0.432], [s * 0.026, 0.235], [s * 0.016, 0.238]], 0.002, 0.001), f, 0, 0, 0.006), shade(cc, 0.78)));
      buttons(2, 0, '#e8d8a8', 0.2, 0.06); pocket(-0.07, 0.12, shade(cc, 0.92), true); pocket(0.07, 0.12, shade(cc, 0.92), true); break;
    case 'ai_vknit': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0, 0.33]], 0.002, 0), f, 0, 0, 0.003), '#f2e6da', 0); [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.045, 0.432], [s * 0.056, 0.43], [s * 0.004, 0.318], [0, 0.33]], 0.003, 0.001), f, 0, 0, 0.006), shade(cc, 0.85))); hem(shade(cc, 0.86)); break;   // Vネック(中に うすい色)
    case 'ai_shirtdress': collarWings(lighten(cc, 0.1)); placket(shade(cc, 0.94), 0.41, 0.17); buttons(4, 0, lighten(cc, 0.5), 0.39, 0.06); body.add(tm(new THREE.CylinderGeometry(0.114, 0.116, 0.014, 28), shade(cc, 0.55), 0, 0.16, 0, 0.0015)); break;   // シャツワンピース
    case 'ai_cardi': put(onChest(shapeGeo([[-0.05, 0.43], [0.05, 0.43], [0.05, 0.03], [-0.05, 0.03]], 0.002, 0), f, 0, 0, 0.002), '#f6f2ea', 0); put(onChest(shapeGeo([[-0.04, 0.43], [0.04, 0.43], [0.04, 0.4], [-0.04, 0.4]], 0.002, 0), f, 0, 0, 0.003), '#f6f2ea', 0); [-1, 1].forEach((s) => put(onChest(shapeGeo([[s * 0.05, 0.43], [s * 0.058, 0.43], [s * 0.058, 0.03], [s * 0.05, 0.03]], 0.002, 0), f, 0, 0, 0.004), shade(cc, 0.82), 0)); hem(shade(cc, 0.86)); break;   // 前を開けたカーディガン(中は白いトップス)
    case 'cardigan': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.03], [-0.045, 0.03]], 0.002, 0), f, 0, 0, 0.002), '#f6efe4', 0); neckRib('#f6efe4', 0.042); buttons(4, 0.05, '#c8b89a', 0.34, 0.075); hem(shade(cc, 0.86)); break;
    case 'happi': crossCollar(W); body.add(tm(new THREE.CylinderGeometry(0.143, 0.146, 0.05, 28), '#2a2018', 0, 0.06, 0, 0.002));
      put(onChest(new THREE.CircleGeometry(0.03, 20), f, 0.07, 0.24, 0.006), W, 0.002); break;
    case 'samue': crossCollar(shade(cc, 0.72), 0.026); body.add(tm(new THREE.CylinderGeometry(0.145, 0.146, 0.02, 28), shade(cc, 0.7), 0, 0.12, 0, 0.002)); break;
    case 'hakui': crossCollar('#e8e4da', 0.03); { const st = tm(new THREE.CylinderGeometry(0.05, 0.054, 0.035, 18, 1, true), '#f4f2ec', 0, 0.44, 0, 0.002); body.add(st); } buttons(3, 0.06, '#d8d4c8', 0.3, 0.07); break;
    case 'kimono': case 'yukata': {   // 着物・浴衣: えり + 帯(+ 帯じめ)。着物は赤いたすき、浴衣は白い花のがら
      const kim = a.top === 'kimono';
      if (kim) crossCollar('#f8f4ea', 0.03); crossCollar(shade(cc, 0.78), kim ? 0.016 : 0.026);
      const obi = (y, h, color, out) => { const r = torsoR(f, y) + out; const m = tm(new THREE.CylinderGeometry(r, r, h, 28, 1, true), color, 0, y, 0, 0.002); m.scale.z = 0.74; body.add(m); };
      obi(0.17, kim ? 0.1 : 0.075, kim ? '#e8c06a' : '#c8304a', 0.01); obi(0.17, 0.012, kim ? '#c8304a' : '#f6e27a', 0.016);
      if (kim) [-1, 1].forEach((s2) => put(onChest(shapeGeo([[s2 * 0.088, 0.405], [s2 * 0.104, 0.41], [s2 * 0.134, 0.29], [s2 * 0.12, 0.285]], 0.003, 0.001), f, 0, 0, 0.012), '#d0283a'));
      else [[-0.07, 0.33], [0.055, 0.3], [-0.035, 0.07], [0.08, 0.06], [0.0, 0.37]].forEach(([x, y]) => {
        for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; put(onChest(new THREE.CircleGeometry(0.008, 10), f, x + Math.cos(an) * 0.009, y + Math.sin(an) * 0.009, 0.005), '#fbf6ee', 0); }
        put(onChest(new THREE.CircleGeometry(0.005, 8), f, x, y, 0.007), '#f2c84a', 0);
      });
      break; }
    case 'kappogi': neckRib('#e8e4da', 0.047); pocket(0.065, 0.12, '#ece8de'); hem('#e8e4da'); break;
    case 'jinbei': crossCollar(shade(cc, 0.8), 0.028); [-1, 1].forEach((s) => put(onChest(shapeGeo([[-0.022, 0.003], [0.022, 0.003], [0.022, -0.003], [-0.022, -0.003]], 0.003, 0), f, s * 0.05, 0.2, 0.008), shade(cc, 0.65), 0)); break;
  }
  return TOP_DEF[a.top] && TOP_DEF[a.top].skirt ? 'skirt' : '';
}

/* 同じ色(同じ材料)の部品を、動く単位(体・頭・左右の腕)ごとに 1つにまとめる。見た目は同じで、描く回数が 1/10 ほどになる */
function bakeAvatar(root, pivots, skip) {
  root.updateMatrixWorld(true);
  const groups = new Map();   // pivot → Map(material → [mesh])
  const isPivot = new Set(pivots);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let q = o; q; q = q.parent) if (skip.has(q)) return;
    const m = o.material;
    if (!(m === LINE_M || (m.isMeshToonMaterial && !m.map))) return;
    let pv = o.parent; while (pv && !isPivot.has(pv)) pv = pv.parent;
    if (!pv) return;
    if (!groups.has(pv)) groups.set(pv, new Map());
    const g = groups.get(pv); if (!g.has(m)) g.set(m, []); g.get(m).push(o);
  });
  const inv = new THREE.Matrix4(), M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3();
  groups.forEach((byMat, pv) => {
    inv.copy(pv.matrixWorld).invert();
    byMat.forEach((list, m) => {
      if (list.length < 2) return;
      const useColor = !!m.vertexColors, P = [], NN = [], C = [];
      list.forEach((o) => {
        let g = o.geometry; if (g.index) g = g.toNonIndexed();
        if (!g.attributes.normal) g.computeVertexNormals();
        M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
        const pa = g.attributes.position, na = g.attributes.normal, ca = g.attributes.color;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(M); P.push(v.x, v.y, v.z);
          v.fromBufferAttribute(na, i).applyMatrix3(N).normalize(); NN.push(v.x, v.y, v.z);
          if (useColor) { if (ca) C.push(ca.getX(i), ca.getY(i), ca.getZ(i)); else C.push(1, 1, 1); }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
      if (useColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      const merged = new THREE.Mesh(geo, m);
      list.forEach((o) => { o.parent.remove(o); });
      pv.add(merged);
    });
  });
}
function buildAvatar(raw, opt = {}) {
  const a = AVATAR.fix(raw) || AVATAR.fallback(1);
  if (a.special === 'ai') {   // 常連のアイちゃん(ふつうの可愛い女の子。ロボットっぽくしない): 顔・髪型・髪の色・前髪のヘアピンは いつも同じ(覚えてもらえるように)。服と小物は 毎回ちがう(js/app.js の regAvatar)
    if (raw.aiEyes) a.eyes = 'ai';   // きらっとした大きな目(アイちゃんだけ)
    if (typeof raw.aiHair === 'string' && /^#[0-9a-f]{6}$/i.test(raw.aiHair)) a.hairColor = raw.aiHair;
    if (raw.aiDress) a.top = 'ai';   // ときどき アイちゃんだけの服
    if (typeof raw.aiFit === 'string') { const t = raw.aiFit === 'dress' ? 'ai' : 'ai_' + raw.aiFit; if (TOP_DEF[t]) a.top = t; }   // アイちゃん専用の服
    if (typeof raw.aiAcc === 'string' && raw.aiAcc) { a.aiAcc = raw.aiAcc; a.acc = 'none'; }   // アイちゃん専用の小物
    ['aiCol2', 'aiCol3', 'aiRibbonC'].forEach((k) => { if (/^#[0-9a-f]{6}$/i.test(raw[k] || '')) a[k] = raw[k]; });   // 下・ベスト・リボンの色
    if (typeof raw.aiNeck === 'string' && raw.aiNeck) { a.aiNeck = raw.aiNeck; if (/^neck/.test(a.acc || '') || a.acc === 'necklace') a.acc = 'none'; }   // ネックレス
    if (AI_OPEN.includes(a.top) && !a.aiNeck) a.aiNeck = 'pearl1';   // 胸元が開いた服は 必ずネックレス
    if (typeof raw.aiRibbon === 'string' && raw.aiRibbon) a.aiRibbon = raw.aiRibbon;   // 髪のリボン(形)
  }
  if (raw && raw.special === 'nobu' && a.owner && a.sex === 'm') {   // 大将ノブ専用の顔・髪型(ノブさん 2026-11-21)。お客さんは選べない。服・頭の手ぬぐい等は これまでどおり選べる。小物は付けない
    const N = Object.assign({ hair: 'n1', brow: 'k1', eye: 'e1', nose: 1, beard: 'b1', face: 'egg', skin: 2 }, (window.SHOP && SHOP.NOBU_FACE) || {}, raw.nobuFace || {});
    a.special = 'nobu'; a.hair = 'nobu'; a.nHair = N.hair; a.hairColor = 0; a.brows = 'n' + N.brow; a.eyes = 'n' + N.eye; a.beard = N.beard === 'b0' ? 'none' : 'chin'; a.nBeard = N.beard === 'b0' ? '' : N.beard; a.nNose = N.nose; a.nBeardC = N.beardColor || '';
    const col = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '';   // 大将だけの目印: はちまきの色・背中の文字(11-22)
    a.headColor = col(raw.headColor) || col(N.headColor); a.backTextColor = col(raw.backTextColor) || col(N.backTextColor);
    a.backText = Array.from(String(raw.backText != null ? raw.backText : N.backText || '')).slice(0, 3).join('');
    if (['round', 'egg', 'sharp', 'square', 'long', 'tall'].includes(N.face)) a.face = N.face; if (N.mouth) a.mouth = N.mouth; if (N.skin >= 0 && N.skin <= 5) a.skin = N.skin; a.acc = 'none';
  }
  if (raw && raw._face) Object.assign(a, raw._face);   // おしゃべり画面の顔写真だけ: まばたき・笑顔・口をあける(大将ノブの決まった顔より あとに)
  const cos = raw && raw.costume; costumePrep(a, cos);   // お祝いモードの かぶりもの
  const f = a.sex === 'f';
  const skinC = AVATAR.color(AVATAR.SKIN, a.skin); SKIN_SET.add(String(skinC).toLowerCase());
  const def = TOP_DEF[a.top] || { sleeve: 'long' };
  const cc = def.color || AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const R = f ? 0.185 : 0.19;
  const LN = 0.004;   // ふち線の太さ

  // 胴(服)
  const torsoMat = def.tex ? toon(cc, { map: fabricTex(def.tex) }) : toon(cc);
  const torso = new THREE.Mesh(torsoGeo(f), torsoMat); torso.add(outlineOf(torso.geometry, LN)); body.add(torso);
  const lower = buildTop(body, a, f, cc);
  if (a.backText && a.owner && ['happi', 'samue', 'jinbei'].includes(a.top)) {   // 大将の 法被の背中の大きな文字(11-22 ノブさん 大将だけの目印)。縦書き。背中の丸みに そわせる
    const tx = canvasTex(256, 384, (g) => {   // (この人だけの絵 → own 印。作り直すとき 捨てる)
      g.fillStyle = a.backTextColor || '#f6f2e8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ch = Array.from(String(a.backText)).slice(0, 3), fs = ch.length > 2 ? 118 : 172;
      g.font = '900 ' + fs + 'px "Hiragino Sans","Hiragino Kaku Gothic StdN","Noto Sans JP",sans-serif';
      g.lineJoin = 'round'; g.lineWidth = fs * 0.08; g.strokeStyle = 'rgba(0,0,0,.35)';
      ch.forEach((c, i) => { const y = 192 + (i - (ch.length - 1) / 2) * fs * 0.98; g.strokeText(c, 128, y); g.fillText(c, 128, y); });
    });
    tx.userData.own = 1; const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.27, 16, 1, true, Math.PI - 0.6, 1.2), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, side: THREE.FrontSide }));
    bk.position.y = 0.25; body.add(bk);
  }
  // 首・肩
  body.add(tm(new THREE.CylinderGeometry(0.032, 0.038, 0.09, 14), skinC, 0, 0.465, 0, LN));
  [-1, 1].forEach((s) => { const sh = tm(new THREE.SphereGeometry(f ? 0.042 : 0.05, 16, 12), cc, (f ? 0.112 : 0.13) * s, 0.37, -0.008, LN); sh.scale.set(1, 0.85, 0.9); body.add(sh); });
  // 腕(袖の形は服で変わる)。 肩から 前へ出して カウンターに置く形
  const arms = [], fores = [], hands = [];
  [-1, 1].forEach((s) => {
    const sh = new THREE.Group(); sh.position.set((f ? 0.125 : 0.145) * s, 0.375, 0);
    const wide = def.sleeve === 'wide', puff = def.sleeve === 'puff', short = def.sleeve === 'short' || puff;
    const upper = new THREE.Group(); sh.add(upper);
    upper.add(tm(new THREE.CapsuleGeometry(wide ? 0.052 : puff ? 0.05 : (f ? 0.036 : 0.042), 0.085, 6, 12), cc, 0, -0.065, 0, LN));
    if (short) upper.add(tm(new THREE.CylinderGeometry(puff ? 0.05 : 0.044, puff ? 0.042 : 0.044, 0.02, 14, 1, true), shade(cc, 0.88), 0, -0.1, 0, 0));
    const fore = new THREE.Group(); fore.position.y = -0.135; fore.rotation.x = -0.55; upper.add(fore);
    fore.add(tm(new THREE.SphereGeometry(short ? (f ? 0.03 : 0.034) : (wide ? 0.05 : 0.04), 12, 10), short ? skinC : cc, 0, 0, 0, LN));
    fore.add(tm(new THREE.CapsuleGeometry(wide ? 0.048 : short ? (f ? 0.028 : 0.032) : (f ? 0.033 : 0.038), 0.085, 6, 12), short ? skinC : cc, 0, -0.06, 0, LN));
    if (!short) fore.add(tm(new THREE.CylinderGeometry(wide ? 0.052 : 0.04, wide ? 0.05 : 0.04, 0.018, 14), shade(cc, 0.86), 0, -0.11, 0, 0));
    // 手(ミトン形+親指)
    const hand = new THREE.Group(); hand.position.set(0, -0.135, 0.005); fore.add(hand);
    const palm = tm(new THREE.SphereGeometry(0.032, 14, 10), skinC, 0, 0, 0, LN); palm.scale.set(0.95, 1.15, 0.7); hand.add(palm);
    const thumb = tm(new THREE.CapsuleGeometry(0.011, 0.02, 4, 8), skinC, -s * 0.026, 0.008, 0.012, LN); thumb.rotation.z = s * 0.7; hand.add(thumb);
    sh.rotation.x = -0.45; sh.rotation.z = 0.06 * s;
    body.add(sh); arms.push(sh); fores.push(fore); hands.push(hand);
  });
  /* 乾杯のジョッキ: 手に持つ(取っ手を にぎる)。ガラス + ビール + もこもこの あわ */
  const cheerMug = new THREE.Group(), mugIn = new THREE.Group(); cheerMug.add(mugIn); mugIn.position.set(0, 0.035, 0.055);
  mugIn.add(tm(new THREE.CylinderGeometry(0.044, 0.04, 0.11, 16), '#f2b51c', 0, 0, 0, 0.003));
  mugIn.add(mesh(new THREE.CylinderGeometry(0.047, 0.043, 0.112, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, side: THREE.DoubleSide })));
  for (let k = 0; k < 7; k++) { const an = k / 7 * Math.PI * 2; mugIn.add(tm(new THREE.SphereGeometry(0.019, 8, 6), '#fbf7ec', Math.cos(an) * 0.026, 0.062, Math.sin(an) * 0.026)); }
  mugIn.add(tm(new THREE.SphereGeometry(0.026, 10, 8), '#fffdf6', 0, 0.07, 0));
  const hdl = tm(new THREE.TorusGeometry(0.027, 0.008, 8, 14, Math.PI), '#e8eef2', 0, 0, -0.046, 0.002); hdl.rotation.z = -Math.PI / 2; hdl.rotation.y = Math.PI / 2; mugIn.add(hdl);
  cheerMug.visible = false; hands[1].add(cheerMug);

  // 足(座っている形)。記念撮影のときは消せるように、体とは別のまとまり(legs)にする
  const legs = new THREE.Group(); body.add(legs);
  if (!opt.standing) {
    const pantsC = a.aiCol2 || def.pantsC || (def.pants === 'same' ? cc : (a.top === 'work' ? cc : (f ? '#3a3a4a' : '#2a2c38')));
    const skirt = lower === 'skirt';
    const legC = skirt ? (def.tights || skinC) : def.shorts ? (def.tights || skinC) : pantsC;
    const skc = a.aiCol2 && skirt ? a.aiCol2 : typeof def.skirtC === 'function' ? def.skirtC(a, cc) : def.skirtC || (a.top === 'office' ? '#2c2c36' : cc);   // スカートの色
    [-1, 1].forEach((s) => {
      const x = (f ? 0.062 : 0.072) * s;
      if (!skirt) { const th = tm(new THREE.CapsuleGeometry(def.wide ? 0.064 : (f ? 0.055 : 0.06), 0.2, 6, 12), def.shorts ? pantsC : legC, x, 0.04, 0.13, LN); th.rotation.x = Math.PI / 2; legs.add(th); }
      if (!skirt) legs.add(tm(new THREE.SphereGeometry(f ? 0.048 : 0.054, 12, 10), legC, x, 0.035, 0.27, LN));   // ひざ(スカートのときは 布が おおうので 作らない。玉が 布から つき出ていた 11-22)
      legs.add(tm(new THREE.CapsuleGeometry(def.wide ? 0.058 : (f ? 0.04 : 0.046), 0.24, 6, 12), legC, x, -0.13, 0.285, LN));
      const lr = def.wide ? 0.058 : (f ? 0.04 : 0.046);
      if (skirt && !def.tights) legs.add(tm(new THREE.CylinderGeometry(lr + 0.003, lr + 0.002, 0.08, 16), def.socks || (f ? '#f2ece4' : legC), x, -0.265, 0.285, LN));   // くつした(脚より 少し太く。前は 細くて 脚に うまり、足首が ぎざぎざに見えた 11-22)
      // くつ: 底 + つま先の丸い甲 + かかと(足首まで つながる)。前の「平たい玉 + 白い板」は 粗く見えた(11-22 ノブさん)
      const shoeC = f ? (skirt ? '#6a2a2a' : '#3a2a22') : '#1d1a18', soleC = shade(shoeC, 0.55);
      const sole = tm(new THREE.CylinderGeometry(1, 1, 1, 24), soleC, x, -0.368, 0.318, LN); sole.scale.set(0.043, 0.014, 0.082); legs.add(sole);
      const up = tm(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), shoeC, x, -0.361, 0.33, LN); up.scale.set(0.04, 0.042, 0.07); legs.add(up);
      legs.add(tm(new THREE.CylinderGeometry(0.035, 0.037, 0.06, 16), shoeC, x, -0.335, 0.29, LN));   // かかと〜足首(上は くつした・脚の中に かくれる)
      if (f && skirt) { const st = tm(new THREE.TorusGeometry(0.043, 0.0055, 6, 20, Math.PI), soleC, x, -0.362, 0.332, 0); st.scale.y = 1.02; legs.add(st); }   // ストラップ(甲の上の細いベルト)
    });
    if (skirt) {   // ひざの上にかかる布 + 前に垂れる すそ
      const skMap = def.skirtTex ? { map: fabricTex(def.skirtTex) } : {};
      /* 座ったときのスカート: ももと ひざを すっぽり おおう つまった形(足が布から出ないように)+ ひざの前に少しだけ たれる 短い すそ(ノブさん 2026-11-21) */
      const mat = () => toon(skc, skMap);
      /* 11-22 作り直し(ノブさん「スカートのところに服が出てたり 透けてる」): 前は 腰の輪が 胴と同じ太さで 服が横から つき出ていた・ひざの上が 大きな玉で すき間から ももが見えた。
         いまは ① 腰の輪を 胴より太く(服が出ない)② もも2本ぶんの 布(つつ)を 腰から ひざまで つなげる ③ ひざの前に 短い すそ */
      { const W2 = 0.106, z0 = -0.02, z1 = 0.27, rr = 0.07, sh = new THREE.Shape();   // ひざの上の布: 角の丸い 1枚の板(上から見た形)を 少し厚くして ふちを丸める
        sh.moveTo(-W2 + rr, -z0); sh.lineTo(W2 - rr, -z0); sh.quadraticCurveTo(W2, -z0, W2, -z0 - rr); sh.lineTo(W2, -z1 + rr); sh.quadraticCurveTo(W2, -z1, W2 - rr, -z1);
        sh.lineTo(-W2 + rr, -z1); sh.quadraticCurveTo(-W2, -z1, -W2, -z1 + rr); sh.lineTo(-W2, -z0 - rr); sh.quadraticCurveTo(-W2, -z0, -W2 + rr, -z0);
        const lg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.042, bevelSize: 0.042, bevelSegments: 6, curveSegments: 10 }); lg.rotateX(-Math.PI / 2);
        const lap = new THREE.Mesh(lg, mat()); lap.position.set(0, 0.012, 0); lap.add(outlineOf(lg, LN)); body.add(lap); }
      const hip = tm(new THREE.CylinderGeometry(0.152, 0.158, 0.095, 28), skc, 0, 0.03, 0, LN); hip.scale.z = 0.8; body.add(hip);   // 腰(胴の いちばん太い所 0.14 より 太く)
      const dh = def.long ? 0.1 : 0.05;
      const hemG = new THREE.CylinderGeometry(0.148, 0.158, dh, 28, 1, false, -Math.PI / 2, Math.PI);
      const hemM = new THREE.Mesh(hemG, toon(skc, Object.assign({ side: THREE.DoubleSide }, skMap))); hemM.position.set(0, 0.0 - dh / 2, 0.195); hemM.scale.z = 1.0;   // すそは ひざより 前に(脚が すそを つきぬけないように) hemM.add(outlineOf(hemG, LN)); body.add(hemM);
    }
  }

  // 頭(アニメの頭の形)
  const head = new THREE.Group(); head.position.set(0, 0.69, 0); body.add(head);
  const D = headDeform(a.face);
  const skull = new THREE.Group(); head.add(skull);
  const skullGeo = deformGeo(new THREE.SphereGeometry(R, window.__strandFull ? 40 : 32, window.__strandFull ? 30 : 24), D, R);
  const sk = new THREE.Mesh(skullGeo, toon(skinC)); sk.add(outlineOf(skullGeo, LN)); skull.add(sk);
  [-1, 1].forEach((s) => { const ep = sp(D, R, Math.PI / 2 + 0.1, s * Math.PI / 2 * 0.97, R * 0.97); const ear = tm(new THREE.SphereGeometry(R * 0.17, 12, 10), skinC, ep.x, ep.y, ep.z - R * 0.04, LN); ear.scale.set(0.55, 1, 0.8); skull.add(ear); });
  const faceGeo = deformGeo(new THREE.SphereGeometry(R * 1.004, 36, 28, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6), D, R);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTexture(a), transparent: true, depthWrite: false }));
  skull.add(face);
  if (a.special === 'nobu') {   // 大将ノブ: 高い鼻(顔から少し出た形)
    const big = a.nNose === 2 ? 1.18 : 1, np = sp(D, R, 1.68, 0, R * 0.99), nose = tm(new THREE.SphereGeometry(R * 0.075 * big, 14, 10), shade(skinC, 0.97), np.x, np.y, np.z, LN * 0.6);
    nose.scale.set(0.6, 1.3, 1.25); nose.rotation.x = -0.3; skull.add(nose);
  }
  if (!f && a.beard && a.beard !== 'none' && a.beard !== 'mustache') {   // ひげ: あごの形に そった殻(あごひげ=あごの先、フル=もみあげから あご全体、ぶしょう=うすく)
    const hcB = a.nBeardC ? a.nBeardC : a.nBeard === 'b5' ? '#5a4a40' : shade(AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor), 0.92);   // b5 は うすい色(地肌が少し すける感じ)
    const kind = a.beard, ph = kind === 'chin' ? (a.nBeard === 'b4' ? 0.95 : a.nBeard === 'b5' ? 0.46 : 0.62) : 1.45, th0 = kind === 'chin' ? (a.nBeard === 'b4' ? 2.18 : a.nBeard === 'b5' ? 2.36 : 2.25) : kind === 'full' ? 1.95 : 1.9;   // b5: 大将ノブの うすく小さい あごひげ   // b4: 大将ノブの 広めの あごひげ
    const bg = new THREE.SphereGeometry(R * (kind === 'stubble' ? 1.006 : 1.03), 28, 14, Math.PI / 2 - ph, ph * 2, th0, Math.PI - 0.1 - th0), bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) {   // 上のふちを ぎざぎざに、あご先は 少し ふくらませる
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), th = Math.acos(Math.max(-1, Math.min(1, y / (R * 1.03))));
      const bulge = kind === 'stubble' ? 1 : 1 + 0.07 * Math.pow(Math.max(0, (th - th0) / (Math.PI - th0)), 1.2) * Math.max(0, z / R);
      bp.setXYZ(i, x * bulge, y * (kind === 'stubble' ? 1 : 1.02), z * bulge);
      if (a.nBeard) {   // 大将ノブ: 横のはしを あご先へ下げて、Uの字の やわらかい形に(ななめから見て 縦に切れて見えないように 11-22)
        const X = bp.getX(i), Y = bp.getY(i), Z = bp.getZ(i), r = Math.hypot(X, Y, Z), t0 = Math.acos(Math.max(-1, Math.min(1, Y / r)));
        const e = Math.min(1, Math.abs(Math.atan2(X, Z)) / ph), t1 = t0 + (Math.PI - 0.12 - t0) * 0.42 * Math.pow(e, 3), sr = Math.sin(t1) / Math.max(1e-4, Math.sin(t0));
        bp.setXYZ(i, X * sr, r * Math.cos(t1), Z * sr);
      }
    }
    deformGeo(bg, D, R);
    if (kind === 'stubble') skull.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#3a2a24', transparent: true, opacity: 0.2, depthWrite: false })));
    else if (a.nBeard === 'b5') skull.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#2a1e18', transparent: true, opacity: 0.5, depthWrite: false })));   // 大将ノブ: うすい あごひげ(地肌が すける)
    else { const bm = tm(bg, hcB, 0, 0, 0, LN); skull.add(bm); }
  }
  const nHair0 = skull.children.length;
  buildHair(skull, a, R, D);
  const hairObjs = skull.children.slice(nHair0);
  buildAcc(skull, body, a, R, f);
  buildCostume(skull, body, a, R, f, cos, skinC, D);
  tuckHair(skull, hairObjs);
  root.scale.setScalar(a.size);
  root.userData = { body, head, arms, fores, hands, legs, cheerMug, torso, t: Math.random() * 10, cheer: 0, talk: 0, face, faceA: a, skin: skinC };
  if (!window.__nobake) bakeAvatar(root, [body, head, arms[0], arms[1], fores[0], fores[1], legs], new Set([cheerMug]));
  return root;
}

/* ---------- 帽子の中へ 髪を しまう ----------
   帽子ごとに「内がわの形」(丸い帽子 dome・平たい帽子 ell・筒の帽子 cyl)を登録し、
   その外へ はみ出した髪の点を、帽子の内がわへ 押しこむ(どの髪型・どの帽子でも 髪が突きぬけない) */
function regHat(head, obj, d) { (head.userData.hats || (head.userData.hats = [])).push(Object.assign({ obj }, d)); }
const HAT_STATS = { before: 0, after: 0, max: 0 };
function hatOut(h, w) {   // 帽子の内がわから どれだけ はみ出しているか(はみ出していなければ 0 以下)と、押しこんだ点
  if (h.kind === 'dome') {
    const x = w.x, y = w.y / h.sy, z = w.z, len = Math.hypot(x, y, z) || 1e-6, th = Math.acos(Math.max(-1, Math.min(1, y / len)));
    if (th > h.th + 0.03) return [0, null];
    const k = h.r * 0.962 / len; return [len - h.r * 0.985, new THREE.Vector3(x * k, y * k * h.sy, z * k)];
  }
  if (h.kind === 'ell') {   // 平たい丸(ベレー帽): 上半分に出た点を 中へ
    const len = w.length() || 1e-6; if (w.y < -h.r * 0.15 || Math.hypot(w.x, w.z) > h.r) return [0, null];
    const k = h.r * 0.95 / len; return [len - h.r * 0.98, w.clone().multiplyScalar(k)];
  }
  if (h.kind === 'cyl') {   // 筒(板前帽): 筒の下より上で、外に出た点を 中へ
    if (w.y < -h.h / 2) return [0, null];
    const rr = Math.hypot(w.x, w.z) || 1e-6, out = Math.max(rr - h.r * 0.97, w.y - h.h / 2 * 0.97);   // 横か 天井から 出ている
    const k = Math.min(rr, h.r * 0.94) / rr; return [out, new THREE.Vector3(w.x * k, Math.min(w.y, h.h / 2 * 0.92), w.z * k)];
  }
  return [0, null];
}
function tuckHair(skull, hairObjs) {
  const hats = skull.userData.hats; if (!hats || !hats.length) return;
  skull.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(skull.matrixWorld).invert();
  const H = hats.map((h) => { const m = new THREE.Matrix4().multiplyMatrices(inv, h.obj.matrixWorld); return { h, toHat: m.clone().invert(), fromHat: m }; });
  const v = new THREE.Vector3();
  hairObjs.forEach((o) => o.traverse((ms) => {
    if (!ms.isMesh || !ms.geometry || !ms.geometry.attributes.position) return;
    const toSkull = new THREE.Matrix4().multiplyMatrices(inv, ms.matrixWorld), fromSkull = toSkull.clone().invert();
    const p = ms.geometry.attributes.position; let changed = false;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(toSkull);
      for (const X of H) {
        const w = v.clone().applyMatrix4(X.toHat), [out, fix] = hatOut(X.h, w);
        if (out > 0) { HAT_STATS.before++; HAT_STATS.max = Math.max(HAT_STATS.max, out); if (!window.__noTuck && fix) { v.copy(fix.applyMatrix4(X.fromHat)); changed = true; } }
      }
      if (changed) { const q = v.clone().applyMatrix4(fromSkull); p.setXYZ(i, q.x, q.y, q.z); }
    }
    if (changed) { p.needsUpdate = true; ms.geometry.computeVertexNormals(); }
    // 押しこんだあとに もう一度 数える(確認用)
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(toSkull); for (const X of H) { const [out] = hatOut(X.h, v.clone().applyMatrix4(X.toHat)); if (out > 0.0005) HAT_STATS.after++; } }
  }));
}

/* ---------- お祝いモードの限定のかぶりもの・メガネ・たすき ----------
   cos = 'かぶりもの|メガネ|たすき'(どれも なしでよい)。その日だけ。保存したアバターは変えない */
const COS_HATS = ['santa', 'reindeer', 'treehat', 'sheep', 'mochi', 'iwai', 'party', 'crown'];
function parseCos(cos) { const p = String(cos || '').split('|'); return { head: p[0] || '', face: p[1] || '', body: p[2] || '' }; }
function costumePrep(a, cos) {   // 髪や ふだんの小物と ぶつからないように 先に整える
  const c = parseCos(cos); if (!c.head && !c.face) return;
  if (c.head) { if (a.owner) a.head = 'none'; else if (['cap', 'beanie', 'beret', 'band', 'ribbon'].includes(a.acc)) a.acc = 'none'; }
  if (c.head === 'santa') a._cosHat = true;
  if (c.face && !a.owner && ['glasses', 'thin', 'sun'].includes(a.acc)) a.acc = 'none';
}
function buildCostume(head, body, a, R, f, cos, skinC, D) {
  const c = parseCos(cos); if (!c.head && !c.face && !c.body) return;
  const HR = head.userData.hairR || R * 1.12, LN = 0.003, top = HR * 0.98;
  const bm = (col) => new THREE.MeshBasicMaterial({ color: col });
  const starShape = (r) => { const sh = new THREE.Shape(); for (let k = 0; k < 10; k++) { const an = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; const x = Math.cos(an) * rr, y = Math.sin(an) * rr; if (k) sh.lineTo(x, y); else sh.moveTo(x, y); } return sh; };
  const heartShape = (r) => { const sh = new THREE.Shape(); for (let k = 0; k <= 28; k++) { const t = (k / 28) * Math.PI * 2, x = 16 * Math.pow(Math.sin(t), 3) * r / 17, y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r / 17; if (k) sh.lineTo(x, y); else sh.moveTo(x, y); } return sh; };
  const band = (col) => { const h = new THREE.Group(); h.rotation.x = 0.25; h.position.y = R * 0.05; h.add(new THREE.Mesh(new THREE.TorusGeometry(HR * 1.02, 0.012, 6, 30, Math.PI), toon(col))); head.add(h); return h; };
  switch (c.head) {
    case 'santa': {   // サンタ帽: 赤い帽子 + 白いふち + 先が横にたれる + ぼんぼり
      const g = new THREE.Group(); g.position.set(0, R * 0.06, -R * 0.03); g.rotation.x = -0.12; head.add(g); regHat(head, g, { kind: 'dome', r: HR * 1.12, sy: 1.06, th: 1.3 });
      const dome = tm(new THREE.SphereGeometry(HR * 1.12, 26, 14, 0, Math.PI * 2, 0, 1.3), '#d42a2a', 0, 0, 0, LN); dome.scale.y = 1.06; g.add(dome);
      const brim = tm(new THREE.TorusGeometry(HR * 1.13, 0.034, 10, 30), '#fbfaf4', 0, Math.cos(1.3) * HR * 1.12 * 1.06, 0, LN); brim.rotation.x = Math.PI / 2; brim.scale.set(1, 1, 0.9); g.add(brim);
      const tip = new THREE.Group(); tip.position.set(0, HR * 1.0, 0); tip.rotation.z = -0.9; g.add(tip);
      tip.add(tm(new THREE.ConeGeometry(HR * 0.62, HR * 1.0, 18), '#d42a2a', 0, HR * 0.45, 0, LN));
      tip.add(tm(new THREE.SphereGeometry(0.035, 12, 10), '#fbfaf4', 0, HR * 0.98, 0, LN));
      break; }
    case 'reindeer': {   // トナカイ: 茶色のカチューシャ + 枝分かれの角 + 赤い鼻
      band('#6a4428');
      [-1, 1].forEach((s) => { const g = new THREE.Group(); g.position.set(s * HR * 0.62, HR * 0.78, 0); g.rotation.z = -s * 0.35; head.add(g);
        g.add(tm(new THREE.CylinderGeometry(0.011, 0.015, 0.16, 8), '#8a5a30', 0, 0.08, 0, LN));
        [[0.05, 0.6], [0.11, -0.7], [0.14, 0.5]].forEach(([y, rz]) => { const br = tm(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 6), '#8a5a30', Math.sin(rz) * 0.03, y + 0.03, 0, LN); br.rotation.z = -rz; g.add(br); });
        const ear = tm(new THREE.SphereGeometry(0.03, 10, 8), '#8a5a30', -s * 0.03, -0.02, 0, LN); ear.scale.set(1.5, 0.6, 0.5); g.add(ear); });
      head.add(tm(new THREE.SphereGeometry(R * 0.13, 14, 10), '#e01818', 0, -R * 0.2, R * 1.0, LN));
      break; }
    case 'treehat': {   // ツリーの帽子: 緑の三角 + 飾り玉 + 金の星
      const g = new THREE.Group(); g.position.set(0, top, 0); head.add(g);
      [[0.13, 0.12, 0.05], [0.1, 0.1, 0.12], [0.07, 0.09, 0.18]].forEach(([r, h, y]) => g.add(tm(new THREE.ConeGeometry(r, h, 14), '#237a3c', 0, y, 0, LN)));
      for (let k = 0; k < 9; k++) { const an = k * 2.2, y = 0.02 + (k / 9) * 0.17, r = 0.11 - (k / 9) * 0.07; g.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), bm(['#ff3b3b', '#ffd23b', '#3bb8ff'][k % 3]), Math.cos(an) * r, y, Math.sin(an) * r)); }
      const st = mesh(new THREE.ExtrudeGeometry(starShape(0.035), { depth: 0.008, bevelEnabled: false }), bm('#ffd23b'), 0, 0.25, -0.004); g.add(st);
      break; }
    case 'sheep': {   // ひつじの耳(2027年は未年): 白いカチューシャ + もこもこ + 横に出る耳 + くるっとした角
      band('#f6f2e6');
      for (let k = 0; k < 7; k++) { const an = -0.9 + k * 0.3; head.add(tm(new THREE.SphereGeometry(0.03, 10, 8), '#fbf8f0', Math.sin(an) * HR * 1.0, Math.cos(an) * HR * 1.0 + R * 0.05, R * 0.15, LN)); }
      [-1, 1].forEach((s) => { const ear = tm(new THREE.SphereGeometry(0.05, 12, 8), '#f4ead8', s * HR * 1.05, HR * 0.35, 0, LN); ear.scale.set(1.3, 0.45, 0.7); ear.rotation.z = s * 0.3; head.add(ear);
        const horn = tm(new THREE.TorusGeometry(0.04, 0.014, 8, 16, Math.PI * 1.5), '#c8a070', s * HR * 0.9, HR * 0.62, -R * 0.05, LN); horn.rotation.y = s * Math.PI / 2; head.add(horn); });
      break; }
    case 'mochi': {   // 鏡餅の帽子: 白いおもち2段 + だいだい + 葉っぱ
      const g = new THREE.Group(); g.position.set(0, top - 0.01, 0); head.add(g);
      const m1 = tm(new THREE.SphereGeometry(0.11, 18, 10), '#fbf6e8', 0, 0.03, 0, LN); m1.scale.y = 0.45; g.add(m1);
      const m2 = tm(new THREE.SphereGeometry(0.085, 18, 10), '#fbf6e8', 0, 0.085, 0, LN); m2.scale.y = 0.5; g.add(m2);
      g.add(tm(new THREE.SphereGeometry(0.045, 14, 10), '#f08a1a', 0, 0.14, 0, LN));
      const lf = tm(new THREE.SphereGeometry(0.03, 8, 6), '#2a7a3a', 0.025, 0.185, 0, LN); lf.scale.set(1.2, 0.3, 0.6); g.add(lf);
      break; }
    case 'iwai': {   // 紅白のはちまき「祝」
      const Rb = f ? R * 0.98 : R;
      const b = tm(new THREE.TorusGeometry(Rb * 1.04, 0.018, 8, 36), '#fbfaf4', 0, Rb * 0.3, 0, LN); b.rotation.x = Math.PI / 2 + 0.15; head.add(b);
      const b2 = tm(new THREE.TorusGeometry(Rb * 1.045, 0.007, 6, 36), '#d01e28', 0, Rb * 0.3, 0); b2.rotation.x = Math.PI / 2 + 0.15; head.add(b2);
      const t = canvasTex(128, 128, (g) => { g.fillStyle = '#fbfaf4'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d01e28'; g.font = 'bold 100px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('祝', 64, 70); }); t.userData.own = 1;
      const lab = mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshBasicMaterial({ map: t }), 0, Rb * 0.42, Rb * 1.03); lab.rotation.x = -0.18; head.add(lab);
      [-1, 1].forEach((s) => { const tl = tm(new THREE.BoxGeometry(0.03, 0.1, 0.006), s > 0 ? '#d01e28' : '#fbfaf4', s * 0.03, Rb * 0.12, -Rb * 1.05); tl.rotation.z = s * 0.4; head.add(tl); });
      break; }
    case 'party': {   // とんがり帽子: しま模様 + ぼんぼり(少しななめ)
      const t = canvasTex(128, 128, (g) => { const C = ['#ff4a8a', '#ffd23b', '#4ac8ff', '#8ae04a']; for (let k = 0; k < 8; k++) { g.fillStyle = C[k % 4]; g.fillRect(0, k * 16, 128, 16); } }); t.userData.own = 1;
      const g = new THREE.Group(); g.position.set(R * 0.15, top - 0.02, 0); g.rotation.z = -0.3; head.add(g);
      g.add(mesh(new THREE.ConeGeometry(0.075, 0.2, 18), toon('#ffffff', { map: t }), 0, 0.1, 0));
      g.add(tm(new THREE.SphereGeometry(0.025, 10, 8), '#ffd23b', 0, 0.21, 0, LN));
      const rim = tm(new THREE.TorusGeometry(0.075, 0.008, 6, 18), '#ffffff', 0, 0, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
      const pts = []; for (let k = 0; k <= 24; k++) { const u = -Math.PI / 2 + Math.PI * k / 24; pts.push(D ? sp(D, R, Math.PI / 2 + (Math.PI / 2 - 0.42) * Math.cos(u), u, R * 1.012) : new THREE.Vector3(Math.sin(u) * R, -Math.cos(u) * R, 0)); }
      head.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0015, 4), new THREE.MeshBasicMaterial({ color: '#f6f4ee' })));   // あごひも: 耳から耳へ、顔の形にそって あごの下を通す(前は 顔のまん中を縦に通って 線に見えた 11-22 ノブさん)
      break; }
    case 'crown': {   // 王冠: 金の輪 + とがった山 + 宝石
      const g = new THREE.Group(); g.position.set(0, top - 0.015, 0); head.add(g);
      g.add(tm(new THREE.CylinderGeometry(0.085, 0.08, 0.05, 20, 1, true), '#e8b830', 0, 0.025, 0, LN));
      for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2; g.add(tm(new THREE.ConeGeometry(0.018, 0.045, 6), '#e8b830', Math.cos(an) * 0.08, 0.07, Math.sin(an) * 0.08)); g.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), bm(['#e0203a', '#2a8ae0', '#2ac860'][k % 3]), Math.cos(an) * 0.086, 0.025, Math.sin(an) * 0.086)); }
      break; }
  }
  const ex = R * 0.29, ez = R * 0.97 + 0.014;
  switch (c.face) {
    case 'nosegl': {   // 鼻メガネ: 黒ぶち + 大きな鼻 + ふさふさの ひげ
      [-1, 1].forEach((s) => { const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.21, 0.008, 6, 22), bm('#141414')); rim.position.set(ex * s, -R * 0.02, ez); head.add(rim);
        const tp = mesh(new THREE.BoxGeometry(0.005, 0.005, R * 0.8), bm('#141414'), s * R * 0.52, 0, R * 0.55); tp.rotation.y = s * 0.25; head.add(tp); });
      head.add(mesh(new THREE.BoxGeometry(R * 0.16, 0.006, 0.006), bm('#141414'), 0, 0, ez + 0.002));
      const nose = tm(new THREE.SphereGeometry(R * 0.16, 14, 10), shade(skinC, 0.95), 0, -R * 0.2, R * 1.04, LN); nose.scale.set(0.9, 1.2, 1.1); head.add(nose);
      [-1, 1].forEach((s) => { const mu = tm(new THREE.CapsuleGeometry(0.014, 0.05, 4, 8), '#1e1612', s * 0.032, -R * 0.38, R * 0.98, LN); mu.rotation.z = s * 1.25; head.add(mu); });
      break; }
    case 'starglass': case 'heartglass': {   // 星メガネ・ハートメガネ(パーティー用)
      const star = c.face === 'starglass', col = star ? '#ffd23b' : '#ff4a8a';
      [-1, 1].forEach((s) => {
        const fr = mesh(new THREE.ExtrudeGeometry(star ? starShape(R * 0.34) : heartShape(R * 0.32), { depth: 0.006, bevelEnabled: false }), bm(col), ex * s * 1.15, -R * 0.02 + (star ? 0 : R * 0.04), ez - 0.004); head.add(fr);
        const ln = mesh(new THREE.ShapeGeometry(star ? starShape(R * 0.22) : heartShape(R * 0.2)), new THREE.MeshBasicMaterial({ color: star ? '#3a2a6a' : '#5a1030', transparent: true, opacity: 0.7 }), ex * s * 1.15, -R * 0.02 + (star ? 0 : R * 0.04), ez + 0.004); head.add(ln);
        const tp = mesh(new THREE.BoxGeometry(0.005, 0.005, R * 0.8), bm(col), s * R * 0.55, 0, R * 0.55); tp.rotation.y = s * 0.25; head.add(tp); });
      break; }
  }
  if (c.body === 'sash') {   // たすき「本日の主役」: 右肩から左の腰へ
    const t = canvasTex(64, 512, (g) => { g.fillStyle = '#d01e28'; g.fillRect(0, 0, 64, 512); g.fillStyle = '#ffe9a8'; g.fillRect(4, 0, 4, 512); g.fillRect(56, 0, 4, 512); g.fillStyle = '#ffffff'; g.font = 'bold 50px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'middle'; Array.from('本日の主役').forEach((ch, k) => g.fillText(ch, 32, 70 + k * 80)); }); t.userData.own = 1;
    const sw = mesh(new THREE.PlaneGeometry(0.055, 0.42), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }), 0, 0.2, f ? 0.125 : 0.14); sw.rotation.z = 0.62; sw.rotation.x = -0.12; body.add(sw);
    const bk = mesh(new THREE.PlaneGeometry(0.055, 0.42), new THREE.MeshBasicMaterial({ color: '#d01e28', side: THREE.DoubleSide }), 0, 0.2, -(f ? 0.12 : 0.135)); bk.rotation.z = -0.62; body.add(bk);
  }
}

/* ---------- 小物(お客さん)・頭のもの(大将) ---------- */
function buildAcc(head, body, a, R, f) {
  const ex = R * 0.29, ez = R * 0.97;   // 目の位置
  const glasses = (color, thin, dark) => {
    [-1, 1].forEach((s) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, thin ? 0.003 : 0.0065, 6, 22), new THREE.MeshBasicMaterial({ color })); rim.position.set(ex * s, -R * 0.02, ez + 0.012); rim.scale.y = 0.82; head.add(rim);
      if (dark) { const l = new THREE.Mesh(new THREE.CircleGeometry(R * 0.2, 20), new THREE.MeshBasicMaterial({ color: '#141418', transparent: true, opacity: 0.88 })); l.position.set(ex * s, -R * 0.02, ez + 0.013); l.scale.y = 0.82; head.add(l); }
      const tp = mesh(new THREE.BoxGeometry(0.004, 0.004, R * 0.8), new THREE.MeshBasicMaterial({ color }), s * R * 0.5, -R * 0.0, R * 0.55); tp.rotation.y = s * 0.25; head.add(tp);
    });
    head.add(mesh(new THREE.BoxGeometry(R * 0.18, 0.004, 0.004), new THREE.MeshBasicMaterial({ color }), 0, -R * 0.0, ez + 0.016));
  };
  if (!a.owner || a._decoy) switch (a.acc) {   // _decoy: ゲーム「大将をたたくな!」の にせもの顔だけ、大将にも メガネ・帽子を付ける
    case 'glasses': glasses('#1a1414'); break;
    case 'thin': glasses('#b8963a', true); break;
    case 'sun': glasses('#1a1414', false, true); break;
    case 'cap': {   // キャップ: 前が高く後ろが低い山(6枚はぎ)+ てっぺんのボタン + 前に出る つば
      const HR = head.userData.hairR || R * 1.12, cc = AVATAR.color(AVATAR.CLOTH_COLOR, a.accColor), g = new THREE.Group();
      g.position.set(0, R * 0.12, -R * 0.02); g.rotation.x = -0.18; head.add(g); regHat(head, g, { kind: 'dome', r: HR * 1.1, sy: 0.86, th: 1.42 });
      const dome = new THREE.SphereGeometry(HR * 1.1, 30, 14, 0, Math.PI * 2, 0, 1.42), dp = dome.attributes.position;
      for (let i = 0; i < dp.count; i++) { const z = dp.getZ(i), y = dp.getY(i); dp.setY(i, y * 0.86 + Math.max(0, z / HR) * 0.04 * HR); }   // 前を少し高く、全体は少し平たく
      dome.computeVertexNormals(); g.add(tm(dome, cc, 0, 0, 0, 0.003));
      { const sg = new THREE.Group(); sg.scale.set(1, 0.86, 1); g.add(sg);   // 6枚はぎの縫い目(帽子と同じだけ平たくする)
        for (let k = 0; k < 6; k++) { const seam = new THREE.Mesh(new THREE.TorusGeometry(HR * 1.104, 0.0022, 4, 24, 1.4), new THREE.MeshBasicMaterial({ color: shade(cc, 0.6) })); seam.rotation.set(0, (k / 6) * Math.PI * 2 + Math.PI / 2, Math.PI / 2 - 1.4); sg.add(seam); } }
      g.add(tm(new THREE.SphereGeometry(HR * 0.09, 10, 6), shade(cc, 0.8), 0, HR * 0.95, 0, 0.002));   // てっぺんのボタン
      const brim = new THREE.CylinderGeometry(HR * 0.9, HR * 0.9, 0.012, 28, 1, false, -Math.PI * 0.45, Math.PI * 0.9), bp = brim.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setZ(i, z * 0.82); bp.setY(i, bp.getY(i) - Math.pow(x / HR, 2) * 0.05 * HR); }   // 左右が少し下がる、ゆるいカーブ
      brim.computeVertexNormals();
      const bm = tm(brim, shade(cc, 0.85), 0, HR * 0.16, HR * 0.62, 0.003); bm.rotation.x = 0.14; g.add(bm);
      break; }
    case 'beanie': {   // ニット帽: 頭を深くおおう 編み目の帽子 + 折り返しのふち + ぼんぼり
      const HR = head.userData.hairR || R * 1.12, bc = AVATAR.color(AVATAR.CLOTH_COLOR, a.accColor), g = new THREE.Group(); g.position.set(0, R * 0.06, -R * 0.03); g.rotation.x = -0.12; head.add(g); regHat(head, g, { kind: 'dome', r: HR * 1.12, sy: 1.06, th: 1.62 });
      const dome = new THREE.SphereGeometry(HR * 1.12, 32, 16, 0, Math.PI * 2, 0, 1.62), dp = dome.attributes.position;
      for (let i = 0; i < dp.count; i++) dp.setY(i, dp.getY(i) * 1.06);
      dome.computeVertexNormals();
      const dm = new THREE.Mesh(dome, toon(bc, { map: fabricTex('rib') })); dm.add(outlineOf(dome, 0.003)); g.add(dm);
      const cuffY = Math.cos(1.62) * HR * 1.12 * 1.06 + R * 0.12, cr = HR * 1.15;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr * 1.01, R * 0.32, 32, 1, true), toon(shade(bc, 0.88), { map: fabricTex('rib'), side: THREE.DoubleSide })); cuff.position.y = cuffY; cuff.add(outlineOf(cuff.geometry, 0.003)); g.add(cuff);
      g.add(tm(new THREE.SphereGeometry(HR * 0.22, 12, 10), '#f2ece0', 0, HR * 1.2, 0, 0.003));   // ぼんぼり
      break; }
    case 'necklace': case 'earring': break;
    case 'beret': {   // ベレー帽: 平たい丸い帽子を 少しななめに。てっぺんに小さな つまみ
      const HR = head.userData.hairR || R * 1.15, g = new THREE.Group(); g.position.set(R * 0.08, HR * 0.62, -R * 0.08); g.rotation.set(-0.15, 0, -0.28); head.add(g);
      const btc = AVATAR.color(AVATAR.CLOTH_COLOR, a.accColor); const b2 = tm(new THREE.SphereGeometry(HR * 1.08, 28, 14), btc, 0, 0, 0, 0.003); b2.scale.set(1.1, 0.4, 1.08); g.add(b2); regHat(head, b2, { kind: 'ell', r: HR * 1.08 });
      g.add(tm(new THREE.CylinderGeometry(HR * 0.82, HR * 0.85, HR * 0.08, 28), shade(btc, 0.85), 0, -HR * 0.2, 0, 0.002));   // かぶり口
      g.add(tm(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 6), shade(btc, 0.6), 0, HR * 0.38, 0)); break; }
    case 'band': { const HR = head.userData.hairR || R * 1.12, holder = new THREE.Group(); holder.rotation.x = -0.32; holder.position.set(0, R * 0.05, -R * 0.02);   // カチューシャ: 耳から耳へ、前髪の うしろを通す
      const arc = new THREE.Mesh(new THREE.TorusGeometry(HR * 1.05, 0.016, 8, 36, Math.PI), toon(AVATAR.color(AVATAR.CLOTH_COLOR, a.accColor))); arc.scale.z = 1.6; holder.add(arc); head.add(holder); break; }
    case 'ribbon': { const HR = head.userData.hairR || R * 1.12, g = new THREE.Group(); g.position.set(HR * 0.7, HR * 0.78, HR * 0.08); g.rotation.set(0, 0.55, -0.6);   // リボン: 頭の右上(前から見える)
      const rc = AVATAR.color(AVATAR.CLOTH_COLOR, a.accColor);
      [-1, 1].forEach((s2) => { const w = tm(new THREE.ConeGeometry(0.05, 0.085, 4), rc, s2 * 0.038, 0, 0, 0.003); w.rotation.z = s2 * Math.PI / 2; w.scale.z = 0.5; g.add(w); });
      g.add(tm(new THREE.SphereGeometry(0.018, 8, 6), shade(rc, 0.85))); head.add(g); break; }
  }
  if (a.special === 'ai') {   // アイちゃんの目印: 前髪に「×」にとめた ヘアピン2本(どの服・小物でも いつも同じ所に)
    const HR = head.userData.hairR || R * 1.12, g = new THREE.Group();
    g.position.set(-HR * 0.5, HR * 0.42, HR * 0.9); g.rotation.set(-0.35, -0.5, 0); head.add(g);
    [[0.6, '#f2c14e'], [-0.6, '#e8707a']].forEach(([rz, col]) => { const p = tm(new THREE.BoxGeometry(0.011, 0.075, 0.007), col, 0, 0, 0, 0.0015); p.rotation.z = rz; g.add(p); });
  }
  if (a.special === 'ai' && a.aiRibbon) {   // 髪のリボン(後ろ頭。お客さんの席からは 後ろ姿が よく見えるので目立つ)
    const HR = head.userData.hairR || R * 1.12, rc = a.aiRibbonC || '#2c3550', g = new THREE.Group(); g.position.set(-HR * 0.3, HR * 0.26, -HR * 1.06); g.rotation.y = Math.PI - 0.28; head.add(g);   // 羽が2つとも 髪から出るように 少し後ろへ(11-21)。後ろ向きに付ける(結び目が外側)   // 後ろ頭の 少し横(お客さんの席が多い側)に、斜めに向けて付ける。横の席からも よく見えるように
    // 羽: ふっくらした輪(どの向きから見ても リボンに見えるように。2026-11-21 ノブさん「後ろから見ると リボンじゃなくなっている」。前は とがった四角すいで、後ろ・横からは 三角に見えた)
    const wing = (sz, x) => { const sd = Math.sign(x) || 1, w = new THREE.Group(); w.position.set(x * 1.12, 0.004 * sz, 0); w.rotation.z = sd * 0.22; g.add(w);
      const loop = tm(new THREE.TorusGeometry(0.04 * sz, 0.017 * sz, 10, 22), rc, 0, 0, 0, 0.0025); loop.scale.set(1.35, 0.92, 1.25); w.add(loop);
      const fill = tm(new THREE.SphereGeometry(0.04 * sz, 14, 10), shade(rc, 0.86), 0, 0, -0.002 * sz); fill.scale.set(1.3, 0.85, 0.42); w.add(fill); };
    const tail = (len, x, rz, wd = 0.03) => { const t = tm(new THREE.BoxGeometry(wd, len, 0.006), rc, x, -len * 0.62, 0.005, 0.002); t.rotation.z = rz; g.add(t); };
    switch (a.aiRibbon) {
      case 'big': [-1, 1].forEach((s) => { wing(1, s * 0.06); tail(0.1, s * 0.03, s * 0.35); }); g.add(tm(new THREE.SphereGeometry(0.024, 10, 8), shade(rc, 0.82), 0, 0, 0.01)); break;   // 大きなリボン
      case 'small': [-1, 1].forEach((s) => { wing(0.62, s * 0.037); tail(0.06, s * 0.02, s * 0.35, 0.02); }); g.add(tm(new THREE.SphereGeometry(0.015, 10, 8), shade(rc, 0.82), 0, 0, 0.008)); break;   // 小さなリボン
      case 'tails': [-1, 1].forEach((s) => { wing(0.9, s * 0.054); tail(0.2, s * 0.028, s * 0.18, 0.026); }); g.add(tm(new THREE.SphereGeometry(0.022, 10, 8), shade(rc, 0.82), 0, 0, 0.01)); break;   // 長くたれる リボン
      case 'thin': [-1, 1].forEach((s) => { const w = tm(new THREE.ConeGeometry(0.03, 0.085, 4), rc, s * 0.04, 0, 0, 0.002); w.rotation.z = s * Math.PI / 2; w.scale.z = 0.35; g.add(w); tail(0.17, s * 0.012, s * 0.12, 0.012); }); g.add(tm(new THREE.SphereGeometry(0.011, 8, 6), shade(rc, 0.82), 0, 0, 0.006)); break;   // 細いリボン(細長い羽 + 長い ひも)
      case 'barrette': { const b = tm(new THREE.BoxGeometry(0.11, 0.026, 0.012), rc, 0, 0, 0, 0.002); g.add(b); for (let k = -2; k <= 2; k++) g.add(tm(new THREE.SphereGeometry(0.006, 8, 6), '#fbf6ee', k * 0.02, 0, 0.008)); break; }   // バレッタ(髪どめ)
    }
  }
  if (a.special === 'ai' && a.aiAcc) {   // アイちゃん専用の小物
    const HR = head.userData.hairR || R * 1.12;
    switch (a.aiAcc) {
      case 'neko': { const h = new THREE.Group(); h.rotation.x = -0.32; h.position.set(0, R * 0.05, -R * 0.02);   // ねこ耳カチューシャ
        const arc = new THREE.Mesh(new THREE.TorusGeometry(HR * 1.05, 0.013, 8, 36, Math.PI), toon('#2a2228')); arc.scale.z = 1.6; h.add(arc); head.add(h);
        [-1, 1].forEach((s) => { const e = tm(new THREE.ConeGeometry(0.05, 0.075, 4), '#2a2228', s * HR * 0.62, HR * 0.95, -R * 0.05, 0.003); e.rotation.set(0, Math.PI / 4, -s * 0.38); e.scale.z = 0.45; head.add(e);
          const ie = tm(new THREE.ConeGeometry(0.028, 0.045, 4), '#e8909c', s * HR * 0.62, HR * 0.94, -R * 0.03); ie.rotation.set(0, Math.PI / 4, -s * 0.38); ie.scale.z = 0.3; head.add(ie); });
        break; }
      case 'bigribbon': { const g = new THREE.Group(); g.position.set(0, HR * 0.25, -HR * 1.0); head.add(g);   // 後ろの 大きなリボン
        [-1, 1].forEach((s) => { const w = tm(new THREE.ConeGeometry(0.075, 0.13, 4), '#c8424e', s * 0.06, 0, 0, 0.003); w.rotation.z = s * Math.PI / 2; w.scale.z = 0.45; g.add(w);
          const t = tm(new THREE.BoxGeometry(0.03, 0.1, 0.006), '#c8424e', s * 0.03, -0.07, 0.005, 0.002); t.rotation.z = s * 0.35; g.add(t); });
        g.add(tm(new THREE.SphereGeometry(0.024, 10, 8), '#a8323e', 0, 0, 0.01)); break; }
      case 'flower': { const g = new THREE.Group(); g.position.set(HR * 0.78, HR * 0.38, HR * 0.4); g.rotation.y = 0.9; head.add(g);   // 花の髪かざり
        for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; const p = tm(new THREE.SphereGeometry(0.026, 10, 8), '#f6a8bc', Math.cos(an) * 0.03, Math.sin(an) * 0.03, 0, 0.0015); p.scale.z = 0.45; g.add(p); }
        g.add(tm(new THREE.SphereGeometry(0.018, 10, 8), '#f6d25a', 0, 0, 0.008)); break; }
      case 'pearl': { const h = new THREE.Group(); h.rotation.x = -0.32; h.position.set(0, R * 0.05, -R * 0.02); head.add(h);   // パールのカチューシャ
        for (let k = 0; k <= 16; k++) { const an = k / 16 * Math.PI; h.add(tm(new THREE.SphereGeometry(0.014, 10, 8), '#fbf6ee', Math.cos(an) * HR * 1.05, Math.sin(an) * HR * 1.05, 0, 0.001)); } break; }
      case 'maru': glasses('#9a6a3a', true); break;   // 丸メガネ(細い茶色のふち)
      case 'choker': { const c = tm(new THREE.TorusGeometry(0.036, 0.007, 8, 24), '#2a2228', 0, 0.47, 0.004, 0); c.rotation.x = Math.PI / 2 + 0.2; body.add(c);   // リボンのチョーカー
        [-1, 1].forEach((s) => { const w = tm(new THREE.ConeGeometry(0.014, 0.024, 4), '#c8424e', s * 0.011, 0.462, 0.04, 0.001); w.rotation.z = s * Math.PI / 2; w.scale.z = 0.5; body.add(w); }); break; }
      case 'pochette': { const st = tm(new THREE.BoxGeometry(0.014, 0.46, 0.008), '#6a3a22', 0, 0.24, 0, 0.0015); st.rotation.z = 0.62;   // ななめがけの ポシェット
        const sg = new THREE.Group(); sg.position.set(0, 0, chestZ(f, 0.25) + 0.008); sg.add(st); body.add(sg);
        const bag = tm(new THREE.BoxGeometry(0.09, 0.07, 0.035), '#c8424e', 0.13, 0.09, 0.07, 0.002); body.add(bag); body.add(tm(new THREE.SphereGeometry(0.007, 8, 6), '#e8c04a', 0.13, 0.1, 0.087, 0)); break; }
      case 'muffler': { const mc = '#c8424e', m = tm(new THREE.TorusGeometry(0.06, 0.03, 10, 24), mc, 0, 0.445, 0, 0.003); m.rotation.x = Math.PI / 2 + 0.15; body.add(m);   // マフラー
        const tail = tm(new THREE.BoxGeometry(0.05, 0.16, 0.02), mc, 0.04, 0.34, chestZ(f, 0.34, 0.04) + 0.02, 0.003); tail.rotation.z = 0.12; body.add(tail);
        for (let k = 0; k < 4; k++) body.add(tm(new THREE.BoxGeometry(0.006, 0.02, 0.006), mc, 0.025 + k * 0.011, 0.255, chestZ(f, 0.26, 0.04) + 0.02, 0)); break; }
    }
  }
  /* ---- イヤリング・ネックレス(キャラクターなので 大きめ・はっきりした形に) ---- */
  const heartGeo = (sz, d = 0.006) => { const pts = []; for (let k = 0; k < 28; k++) { const t = (k / 28) * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3) * sz / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * sz / 17]); } return shapeGeo(pts, d, 0.0015); };
  const starGeo = (sz, d = 0.006) => { const pts = []; for (let k = 0; k < 10; k++) { const an = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? sz * 0.45 : sz; pts.push([Math.cos(an) * r, Math.sin(an) * r]); } return shapeGeo(pts, d, 0.0015); };
  const flower = (sz, c1, c2) => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; const pt = tm(new THREE.SphereGeometry(sz * 0.42, 10, 8), c1, Math.cos(an) * sz * 0.5, Math.sin(an) * sz * 0.5, 0, 0.0015); pt.scale.z = 0.45; g.add(pt); } g.add(tm(new THREE.SphereGeometry(sz * 0.3, 10, 8), c2, 0, 0, sz * 0.1)); return g; };
  const GOLD = '#f0c84a', SILVER = '#d8dce6';
  if (a.special === 'ai' && a.aiNeck) {   // アイちゃんの ネックレス: 細い鎖に 小さな飾り(大人しめ ノブさん 2026-11-21)
    const open = AI_OPEN.includes(a.top), SG = '#e6c878';
    const chain = (drop) => { const pts = []; for (let k = 0; k <= 20; k++) { const u = -1 + k / 10, x = u * 0.06, y = 0.428 - drop * (1 - u * u); pts.push(new THREE.Vector3(x, y, chestZ(f, y, x) + 0.008 - Math.pow(Math.abs(u), 3) * 0.02)); }
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0024, 5, false), new THREE.MeshBasicMaterial({ color: SG }))); const py = 0.428 - drop; return [py, chestZ(f, py - 0.012, 0) + 0.012]; };
    const [py, pz] = chain(open ? 0.07 : 0.12);
    switch (a.aiNeck) {
      case 'pearl1': body.add(tm(new THREE.SphereGeometry(0.011, 12, 10), '#fbf6ee', 0, py - 0.01, pz, 0.001)); break;   // 小さな真珠ひとつぶ
      case 'heart': body.add(tm(heartGeo(0.018, 0.004), '#eab4c0', 0, py - 0.018, pz, 0.001)); break;   // 小さなハート(うすいピンク)
      case 'flower': { const g = new THREE.Group(); g.position.set(0, py - 0.014, pz); body.add(g); for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; const p = tm(new THREE.SphereGeometry(0.0065, 8, 6), '#fbf3f2', Math.cos(an) * 0.008, Math.sin(an) * 0.008, 0); p.scale.z = 0.5; g.add(p); } g.add(tm(new THREE.SphereGeometry(0.004, 8, 6), SG, 0, 0, 0.003)); break; }   // 小さな花
      case 'coin': { const c = tm(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 18), SG, 0, py - 0.013, pz, 0.001); c.rotation.x = Math.PI / 2; body.add(c); break; }   // 小さな丸いプレート
      case 'drop': { const d = tm(new THREE.OctahedronGeometry(0.009, 0), '#b8d2e6', 0, py - 0.014, pz, 0.001); d.scale.y = 1.5; body.add(d); break; }   // しずく形の石(うすい水色)
      case 'bar': body.add(tm(new THREE.BoxGeometry(0.032, 0.005, 0.004), SG, 0, py - 0.002, pz, 0.001)); break;   // 横長の小さなバー
      case 'double': { const [py2, pz2] = chain(open ? 0.095 : 0.145); body.add(tm(new THREE.SphereGeometry(0.008, 10, 8), '#fbf6ee', 0, py2 - 0.008, pz2, 0.001)); break; }   // 2れんの鎖 + 小さな真珠
    }
  }
  if (!a.owner && /^ear/.test(a.acc || '')) [-1, 1].forEach((s2) => {   // イヤリング: 耳たぶから 下がる(髪の外がわ・あごの横)
    const x = s2 * (head.userData.hairR || R * 1.1) * 0.95, y = -R * 0.5, z = R * 0.3;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = s2 * 0.5; head.add(g);
    g.add(tm(new THREE.SphereGeometry(0.008, 8, 6), GOLD, 0, 0.012, 0));   // 耳たぶの金具
    switch (a.acc) {
      case 'earring': { const hp = tm(new THREE.TorusGeometry(0.03, 0.005, 8, 24), GOLD, 0, -0.022, 0, 0.0015); g.add(hp); break; }   // 大きな金の輪
      case 'ear_heart': { g.add(tm(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 4), GOLD, 0, 0.0, 0)); const h = tm(heartGeo(0.024), '#ff5a8a', 0, -0.03, 0, 0.0015); g.add(h); break; }
      case 'ear_star': { g.add(tm(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 4), GOLD, 0, 0.0, 0)); g.add(tm(starGeo(0.026), GOLD, 0, -0.03, 0, 0.0015)); break; }
      case 'ear_pearl': { g.add(tm(new THREE.CylinderGeometry(0.0015, 0.0015, 0.024, 4), GOLD, 0, -0.002, 0)); const pl = tm(new THREE.SphereGeometry(0.016, 14, 10), '#fbf6ee', 0, -0.03, 0, 0.0015); pl.scale.y = 1.25; g.add(pl); break; }
      case 'ear_flower': { const fl = flower(0.028, '#ff9ec4', GOLD); fl.position.y = -0.016; g.add(fl); break; }
      case 'ear_stud': { const st2 = tm(new THREE.OctahedronGeometry(0.012, 0), '#bfe6ff', 0, 0.012, 0.004, 0.0015); g.add(st2); break; }   // ピアス(男性)
    }
  });
  if (!a.owner && /^neck/.test(a.acc || '')) {   // ネックレス: 首の付け根から胸へ、体に そって たれる鎖 + 大きめの飾り
    const thick = a.acc === 'neck_chain', drop = a.acc === 'neck_pearl' ? 0.07 : 0.085, pts = [];
    for (let k = 0; k <= 20; k++) { const u = -1 + k / 10, x = u * 0.064, y = 0.425 - drop * (1 - u * u); pts.push(new THREE.Vector3(x, y, chestZ(f, y, x) + 0.007 - Math.pow(Math.abs(u), 3) * 0.02)); }
    const curve = new THREE.CatmullRomCurve3(pts), py = 0.425 - drop, pz = chestZ(f, py - 0.02, 0) + 0.014;
    const metal = a.acc === 'necklace' && !f ? SILVER : a.acc === 'neck_tag' ? SILVER : GOLD;
    if (a.acc === 'neck_pearl') { for (let k = 0; k <= 22; k++) { const p = curve.getPointAt(k / 22); body.add(tm(new THREE.SphereGeometry(0.0085, 10, 8), '#fbf6ee', p.x, p.y, p.z + 0.003)); } }   // 真珠のつぶ
    else body.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, thick ? 0.007 : 0.0042, 6, false), new THREE.MeshBasicMaterial({ color: metal })));
    switch (a.acc) {
      case 'necklace': if (f) { const md = tm(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 20), GOLD, 0, py - 0.022, pz, 0.0015); md.rotation.x = Math.PI / 2; body.add(md); body.add(tm(new THREE.OctahedronGeometry(0.01, 0), '#ff6a8a', 0, py - 0.022, pz + 0.006)); }
        else { const gm = tm(new THREE.OctahedronGeometry(0.014, 0), SILVER, 0, py - 0.016, pz, 0.0015); gm.scale.y = 1.4; body.add(gm); } break;
      case 'neck_heart': body.add(tm(heartGeo(0.032), '#ff4a7a', 0, py - 0.03, pz, 0.0015)); break;
      case 'neck_star': body.add(tm(starGeo(0.034), GOLD, 0, py - 0.03, pz, 0.0015)); break;
      case 'neck_pearl': body.add(tm(new THREE.SphereGeometry(0.014, 12, 10), '#fbf6ee', 0, py - 0.012, pz, 0.0015)); break;
      case 'neck_tag': { const tg = tm(new THREE.BoxGeometry(0.03, 0.045, 0.004), SILVER, 0, py - 0.028, pz, 0.0015); body.add(tg); break; }
      case 'neck_chain': break;
    }
  }
  if (a.owner) {
    const Rh = f ? R * 1.2 : R;   // 女性は髪がふくらんでいるので、頭の飾りを ひとまわり大きく(髪にうもれないように)
    switch (a.head) {
      case 'hachimaki': case 'nejiri': { const Rb = f ? R * 0.98 : R, up = a.special === 'nobu' ? 0.07 : 0, tlt = a.special === 'nobu' ? 0.06 : 0.15;   // 大将ノブ: おでこを出した髪なので 少し上に巻く(まゆを隠さない)
        const band = tm(new THREE.TorusGeometry(Rb * (a.special === 'nobu' ? (a.face === 'long' ? 0.97 : a.face === 'tall' ? 0.97 : 0.995) : 1.03), a.head === 'nejiri' ? 0.02 : 0.016, 8, 36), a.headColor || '#f6f4ee', 0, Rb * (0.3 + up), 0, 0.003); band.rotation.x = Math.PI / 2 + tlt; if (a.special === 'nobu') band.scale.x = a.face === 'long' ? 0.93 : a.face === 'tall' ? 0.92 : 0.955; head.add(band);   // 大将ノブ: 面長のときは横はばが せまいので 横を しぼる(浮かないように)。卵型は ほぼ そのまま(しぼると髪に うまる 11-22)
        if (a.head === 'nejiri') for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2; head.add(tm(new THREE.BoxGeometry(0.006, 0.03, 0.01), '#2a3a6a', Math.sin(ang) * Rb * 1.04, Rb * (0.3 + up) + Math.cos(ang) * Rb * tlt * 0.98, Math.cos(ang) * Rb * 1.04)); }
        const knot = tm(new THREE.SphereGeometry(0.025, 8, 6), a.headColor || '#f6f4ee', 0, Rb * (0.25 + up), -Rb * 1.02, 0.003); head.add(knot);
        [-1, 1].forEach((s) => { const tl = tm(new THREE.BoxGeometry(0.03, 0.09, 0.006), a.headColor || '#f6f4ee', s * 0.03, Rb * (0.12 + up), -Rb * 1.04); tl.rotation.z = s * 0.4; head.add(tl); });
        break; }
      case 'tenugui': { const c = tm(new THREE.SphereGeometry(Rh * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.2), '#2a3a6a', 0, 0, 0, 0.003); c.rotation.x = -0.25; head.add(c); regHat(head, c, { kind: 'dome', r: Rh * 1.1, sy: 1, th: 1.2 });
        for (let k = 0; k < 10; k++) head.add(tm(new THREE.SphereGeometry(0.01, 6, 5), '#f6f4ee', Math.sin(k * 1.9) * Rh * 0.6, Rh * 0.8 + Math.cos(k * 2.3) * Rh * 0.1, Math.cos(k * 1.9) * Rh * 0.5));
        head.add(tm(new THREE.SphereGeometry(0.025, 8, 6), '#2a3a6a', 0, Rh * 0.35, -Rh * 1.02, 0.003)); break; }
      case 'itamae': { const c = tm(new THREE.CylinderGeometry(Rh * 0.95, Rh * 1.0, Rh * 0.9, 24), '#f6f4ee', 0, Rh * 0.8, -Rh * 0.05, 0.003); head.add(c); regHat(head, c, { kind: 'cyl', r: Rh * 0.95, h: Rh * 0.9 }); break; }
      case 'kanzashi': { const g = new THREE.Group(); g.position.set(Rh * 0.42, Rh * 0.74, -Rh * 0.5); g.rotation.z = -0.9; g.scale.setScalar(1.5);   // かんざし: 金の棒 + 赤い玉 + 下がる飾り
        g.add(tm(new THREE.CylinderGeometry(0.005, 0.005, Rh * 1.1, 6), '#d8b04a', 0, 0, 0)); g.add(tm(new THREE.SphereGeometry(Rh * 0.13, 12, 10), '#d8304a', 0, Rh * 0.55, 0, 0.002));
        for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; g.add(tm(new THREE.SphereGeometry(Rh * 0.07, 8, 6), '#f6a8c0', Math.cos(an) * Rh * 0.13, Rh * 0.55 + Math.sin(an) * Rh * 0.13, Rh * 0.06)); }
        [-1, 1].forEach((s2) => { g.add(tm(new THREE.CylinderGeometry(0.0015, 0.0015, Rh * 0.35, 4), '#d8b04a', s2 * Rh * 0.08, Rh * 0.32, Rh * 0.05)); g.add(tm(new THREE.SphereGeometry(Rh * 0.045, 8, 6), '#f2d64a', s2 * Rh * 0.08, Rh * 0.14, Rh * 0.05)); });
        head.add(g); break; }
      case 'flower': { const g = new THREE.Group(); g.position.set(Rh * 0.78, Rh * 0.52, Rh * 0.28); g.rotation.y = 1.0; g.scale.setScalar(1.45);   // 花の髪かざり(耳の上)
        for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; const pt = tm(new THREE.SphereGeometry(Rh * 0.13, 12, 8), '#f28aa8', Math.cos(an) * Rh * 0.15, Math.sin(an) * Rh * 0.15, 0, 0.002); pt.scale.z = 0.45; g.add(pt); }
        g.add(tm(new THREE.SphereGeometry(Rh * 0.09, 10, 8), '#f6d64a', 0, 0, Rh * 0.04)); head.add(g); break; }
      case 'sankaku': { const c = tm(new THREE.SphereGeometry(Rh * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.25), '#fbf4f0', 0, 0, 0, 0.003); c.rotation.x = -0.22; head.add(c); regHat(head, c, { kind: 'dome', r: Rh * 1.1, sy: 1, th: 1.25 });   // 三角巾(白にピンクの水玉)
        for (let k = 0; k < 18; k++) { const th = 0.25 + (k % 4) * 0.24, ph = k * 2.4, rr = Rh * 1.1 * 1.01; c.add(tm(new THREE.SphereGeometry(0.011, 6, 5), '#ee7a9a', Math.sin(th) * Math.cos(ph) * rr, Math.cos(th) * rr, Math.sin(th) * Math.sin(ph) * rr)); }
        head.add(tm(new THREE.ConeGeometry(0.032, 0.085, 4), '#fbf4f0', 0, Rh * 0.22, -Rh * 1.08, 0.003)); break; }
      case 'ribbon': { const g = new THREE.Group(); g.position.set(Rh * 0.55, Rh * 0.8, Rh * 0.05); g.rotation.set(0, 0.5, -0.55); g.scale.setScalar(1.4); [-1, 1].forEach((s2) => { const w = tm(new THREE.ConeGeometry(0.045, 0.08, 4), '#e86a8a', s2 * 0.04, 0, 0, 0.003); w.rotation.z = s2 * Math.PI / 2; g.add(w); }); g.add(tm(new THREE.SphereGeometry(0.017, 8, 6), '#c84a6a')); head.add(g); break; }
      case 'band': { const holder = new THREE.Group(); holder.rotation.x = 0.3; holder.position.y = Rh * 0.02; holder.add(new THREE.Mesh(new THREE.TorusGeometry(f ? R * 1.13 : R * 1.15, 0.015, 6, 30, Math.PI), toon('#e85a7a'))); head.add(holder); break; }
      case 'bandana': { const c = tm(new THREE.SphereGeometry(Rh * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.3), '#8a1f2a', 0, 0, 0, 0.003); c.rotation.x = -0.2; head.add(c); regHat(head, c, { kind: 'dome', r: Rh * 1.1, sy: 1, th: 1.3 });
        for (let k = 0; k < 14; k++) head.add(tm(new THREE.SphereGeometry(0.008, 6, 5), '#f6f4ee', Math.sin(k * 2.1) * Rh * 0.7, Rh * 0.7 + Math.cos(k * 1.3) * Rh * 0.15, Math.cos(k * 2.1) * Rh * 0.6));
        head.add(tm(new THREE.ConeGeometry(0.03, 0.08, 4), '#8a1f2a', 0, Rh * 0.2, -Rh * 1.08, 0.003)); break; }
    }
    const put2 = (geo, color) => { const m = tm(geo, color, 0, 0, 0, 0.002); body.add(m); return m; };
    if (a.apron && a.apron !== 'none') {   // 前掛け: 下の角が丸く、体に そって 曲がった布 + 腰ひも + ポケット
      const ac = { navy: '#1f2a4a', black: '#1a1a1e', white: '#f2efe6', brown: '#6a4428', pink: '#e88aa8', red: '#b8282c', frill: '#fbf8f2', pinkfrill: '#f4b0c2' }[a.apron] || '#1f2a4a';
      const W2 = 0.15, top = 0.13, bot = -0.3, rc = 0.03, pts = [];
      pts.push([-W2, top], [W2, top]);
      for (let k = 0; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([W2 - rc + Math.sin(an) * rc * 0, bot + rc - Math.sin(an) * rc]); }
      pts.length = 2; pts.push([W2, bot + rc]); for (let k = 1; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([W2 - rc + Math.cos(an) * rc, bot + rc - Math.sin(an) * rc]); }
      pts.push([-W2 + rc, bot]); for (let k = 1; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([-W2 + rc - Math.sin(an) * rc, bot + rc - Math.cos(an) * rc]); }
      const g = shapeGeo(pts, 0.006, 0.002), p = g.attributes.position, Rr = 0.16;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), an = x / Rr; const sway = y < 0 ? -y * 0.15 : 0; p.setXYZ(i, Math.sin(an) * (Rr + z), y, Math.cos(an) * (Rr + z) * 0.78 + sway + 0.012); }
      g.computeVertexNormals();
      const ap = tm(g, ac, 0, 0, 0, 0.003); body.add(ap);
      { const rw = torsoR(f, top) + 0.012, wb = tm(new THREE.CylinderGeometry(rw, rw, 0.028, 28, 1, true), shade(ac, 0.85), 0, top, 0, 0.002); wb.scale.z = 0.74; body.add(wb); }   // 腰ひも(体にそわせる)
      const knot = tm(new THREE.SphereGeometry(0.018, 10, 8), shade(ac, 0.85), 0, top, -0.115, 0.002); body.add(knot);
      [-1, 1].forEach((s2) => { const tl = tm(new THREE.BoxGeometry(0.02, 0.09, 0.006), shade(ac, 0.85), s2 * 0.02, top - 0.05, -0.118, 0.002); tl.rotation.z = s2 * 0.25; body.add(tl); });
      const pk = shapeGeo([[-0.05, 0.03], [0.05, 0.03], [0.05, -0.03], [-0.05, -0.03]], 0.003, 0.001), pp = pk.attributes.position;
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i) - 0.08, z = pp.getZ(i), an = x / Rr; pp.setXYZ(i, Math.sin(an) * (Rr + 0.006 + z), y, Math.cos(an) * (Rr + 0.006 + z) * 0.78 + 0.08 * 0.15 + 0.014); }
      pk.computeVertexNormals(); body.add(tm(pk, lighten(ac, 0.12), 0, 0, 0, 0.002));
      if (/frill/.test(a.apron)) {   // フリルエプロン: 胸当て + 肩ひも + すそと胸のフリル
        const fc = lighten(ac, 0.25);
        put2(onChest(shapeGeo([[-0.072, 0.2], [0.072, 0.2], [0.062, 0], [-0.062, 0]], 0.004, 0.0015), f, 0, top, 0.012), ac);
        [-1, 1].forEach((s2) => put2(onChest(shapeGeo([[s2 * 0.058, 0.33], [s2 * 0.072, 0.33], [s2 * 0.1, 0.43], [s2 * 0.086, 0.43]], 0.003, 0.001), f, 0, 0, 0.013), ac));
        for (let k = 0; k <= 9; k++) { const x = -0.072 + k * 0.016, y = top + 0.205; body.add(tm(new THREE.SphereGeometry(0.011, 8, 6), fc, x, y, chestZ(f, y, x) + 0.018)); }
        for (let k = 0; k <= 16; k++) { const x = -W2 + k * (W2 * 2 / 16), an = x / Rr; const r = tm(new THREE.SphereGeometry(0.018, 8, 6), fc, Math.sin(an) * (Rr + 0.01), bot - 0.004, Math.cos(an) * (Rr + 0.01) * 0.78 - bot * 0.15 + 0.014); r.scale.set(1, 0.7, 0.6); body.add(r); }
      }
    }
  }
}

/* ---------- 見えない所を描かない ----------
   大将の体(胴と前掛け)のうち、高さ y より下の三角を消す。腕・頭・ジョッキは動くので消さない。
   y は、すべての目線で「消す前と後が1点もちがわない」ことを確かめて決めた(scratchpad t40.py) */
const OWNER_HIDE_Y = window.__hideY || 0.80;   // 0.86 まで134の目線で写らないことを確かめ、6cm 余裕をとった
function cullBelow(root, yCut) {
  const u = root.userData, moving = new Set([u.head, ...(u.arms || []), ...(u.fores || []), u.cheerMug].filter(Boolean));
  const v = new THREE.Vector3(), stats = { before: 0, after: 0 };
  const list = []; root.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.attributes.position) list.push(m); });   // 先に集める(途中で足す物を また調べないように)
  list.forEach((m) => {
    for (let q = m; q && q !== root; q = q.parent) if (moving.has(q)) return;
    const g = m.geometry, pa = g.attributes.position, idx = g.index, keep = [];
    const n = idx ? idx.count : pa.count;
    const y = (k) => v.fromBufferAttribute(pa, idx ? idx.getX(k) : k).applyMatrix4(m.matrixWorld).y;
    for (let k = 0; k < n; k += 3) if (y(k) >= yCut || y(k + 1) >= yCut || y(k + 2) >= yCut) keep.push(k);
    stats.before += n / 3; stats.after += keep.length;
    if (keep.length === n / 3) return;
    if (window.__cullProbe) {   // 確認用: 消すはずの三角を 赤むらさきで上にぬる(写ったら 見えている)
      const keepSet = new Set(keep), pos = [];
      for (let k = 0; k < n; k += 3) if (!keepSet.has(k)) for (let c = 0; c < 3; c++) { v.fromBufferAttribute(pa, idx ? idx.getX(k + c) : k + c); pos.push(v.x, v.y, v.z); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      m.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#ff00ff', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })));
      return;
    }
    if (!keep.length) { m.visible = false; return; }
    if (idx) { const ni = []; keep.forEach((k) => ni.push(idx.getX(k), idx.getX(k + 1), idx.getX(k + 2))); g.setIndex(ni); }
    else {
      const ng = new THREE.BufferGeometry();
      Object.keys(g.attributes).forEach((name) => {
        const at = g.attributes[name], sz = at.itemSize, arr = new Float32Array(keep.length * 3 * sz);
        keep.forEach((k, j) => { for (let c = 0; c < 3; c++) for (let d = 0; d < sz; d++) arr[(j * 3 + c) * sz + d] = at.array[(k + c) * sz + d]; });
        ng.setAttribute(name, new THREE.BufferAttribute(arr, sz));
      });
      m.geometry = ng; g.dispose();
    }
  });
  window.__cullStats = stats;
}
function disposeAvatar(o) {   // 形と、その人だけの絵(背中の文字・仮装の絵)を 捨てる。みんなで使う材料・絵は 捨てない(11-22 作り直すたびに たまっていた)
  if (!o) return;
  o.traverse((m) => {
    if (m.isMesh && m.geometry) m.geometry.dispose();
    if (m.material) [].concat(m.material).forEach((mt) => { if (mt && mt.map && mt.map.userData && mt.map.userData.own) { mt.map.dispose(); mt.dispose(); } });
  });
}
/* ---------- 記念撮影のポーズと表情 ----------
   腕の形 [肩の前後, 肩の外むき, ひじ]。外むきは 左右で向きを合わせて使う。指をさすポーズは入れない(ノブさん) */
const ARM = { down: [-0.12, 0.1, -0.2], cheek: [-0.95, 0.22, -2.25], high: [-2.85, 0.28, -0.15], cheer: [-1.85, 0.6, -0.7], guts: [-0.3, 0.42, -2.35],
              thumb: [-1.05, 0.12, -1.0], heart: [-2.55, -0.05, -1.25], cross: [-0.85, -0.42, -1.75], selfie: [-1.62, 0.3, -0.12] };
const PHOTO_POSES = [['normal', '🙂 ふつう', 'down', 'down'], ['peace', '✌️ ピース', 'cheek', 'down', 'v'], ['wpeace', '✌️ ダブルピース', 'cheek', 'cheek', 'v'],
  ['wave', '👋 手をふる', 'high', 'down'], ['banzai', '🙌 バンザイ', 'high', 'high'], ['kanpai', '🍻 かんぱい', 'cheer', 'down', 'mug'],
  ['guts', '💪 ガッツポーズ', 'guts', 'down'], ['thumb', '👍 いいね', 'thumb', 'down', 'thumb'], ['heart', '🫶 ハート', 'heart', 'heart'], ['cross', '😎 腕組み', 'cross', 'cross']];
const PHOTO_FACES = [['smile', '😊 にっこり', { eyes: 'smile', mouth: 'grin' }], ['wink', '😉 ウインク', { eyes: 'wink', mouth: 'grin' }], ['laugh', '😆 大笑い', { eyes: 'smile', mouth: 'open' }],
  ['surprise', '😲 びっくり', { eyes: 'round', mouth: 'open' }], ['normal', '🙂 いつもの顔', null]];
/* ---------- 記念撮影の並び方(パターン) ----------
   slots: [横, 前後, 顔の高さ]。0番は大将(まん中で みんなに埋もれる。顔は少し出す)。1番から順に お客さんで埋める
   lean: まん中へ寄せる強さ / w,h: 写真の大きさ / bot: 写真の下のはし(足元を かくす高さ) / edge: 横のはしの余白 */
const PHOTO_LAYOUTS = {
  /* なかよし ぎゅうぎゅう(ノブさん 2026-11-20): 全員(大将も)の顔を見せる。髪どうしは重なってよい。前の列は胸から上。大将は まん中。
     cam: カメラ(大将のスマホ)の高さ。高く持って見下ろすと、うしろの段が かくれにくい。under: 前の列の顔から どこまで下を写すか。
     高さ・横は目安。実際は1人ずつ頭の大きさを測って、顔が かくれないように 横へずらす・上げる(photoSet) */
  N1: { name: 'N1 なかよし3だん', w: 1080, h: 1350, edge: 0.22, lean: 0.18, tilt: 0.5, cam: 1.95, under: 0.42,
        slots: [[0, 1.5, 1.4], [-0.25, 1.62, 1.3], [0.25, 1.62, 1.3], [-0.31, 1.38, 1.66], [0.31, 1.38, 1.66], [-0.17, 1.22, 2.0], [0.17, 1.22, 2.0],
                [0, 1.36, 1.72], [-0.48, 1.2, 1.98], [0.48, 1.2, 1.98], [-0.6, 1.38, 1.64], [0.6, 1.38, 1.64], [-0.52, 1.62, 1.28], [0.52, 1.62, 1.28]] },
  N2: { name: 'N2 ほっぺくっつけ', w: 1080, h: 1350, edge: 0.24, lean: 0.3, tilt: 0.8, cam: 1.95, under: 0.42,
        slots: [[0, 1.5, 1.4], [-0.24, 1.62, 1.31], [0.24, 1.62, 1.31], [-0.3, 1.38, 1.65], [0.3, 1.38, 1.65], [-0.17, 1.22, 1.99], [0.17, 1.22, 1.99],
                [0, 1.36, 1.72], [-0.47, 1.2, 1.97], [0.47, 1.2, 1.97], [-0.58, 1.38, 1.63], [0.58, 1.38, 1.63], [-0.51, 1.62, 1.29], [0.51, 1.62, 1.29]] },
  N3: { name: 'N3 なかよし2だん', w: 1080, h: 1350, edge: 0.22, lean: 0.18, tilt: 0.5, cam: 1.95, under: 0.42,   // れんが積み2だん(まえ4人・うしろ 大将+4人)。人数が多いと3だん目
        slots: [[0, 1.42, 1.6], [-0.15, 1.62, 1.31], [0.15, 1.62, 1.31], [-0.3, 1.42, 1.6], [0.3, 1.42, 1.6], [-0.45, 1.62, 1.31], [0.45, 1.62, 1.31],
                [-0.6, 1.42, 1.6], [0.6, 1.42, 1.6], [-0.15, 1.22, 1.92], [0.15, 1.22, 1.92], [-0.45, 1.22, 1.92], [0.45, 1.22, 1.92], [-0.75, 1.62, 1.31]] },
  N4: { name: 'N4 すき間に顔', w: 1080, h: 1350, edge: 0.24, lean: 0.1, tilt: 0.28, cam: 1.95, under: 0.42, underMany: 0.3, auto: true,
        // お客さん1人+大将のときは ツーショット(横にならんで 頭を寄せ合う。大将は右で、スマホを持つ手は写真の外へ)
        duo: { slots: [[0.21, 1.52, 1.5], [-0.21, 1.56, 1.46]], under: 0.55, tilt: 0.45, lean: 0.25, selfie: 'down' },
        /* れんが積み(ノブさん 2026-11-20 これに決定)。同じ段のとなりは 0.52m(顔1つぶん あける)。上の段の顔は 下の2人の すき間へ。
           0番は大将(2だん目のまん中)。お客さんは 人数がふえるほど 外がわ・上へ */
        slots: [[0, 1.46, 1.56],
                [-0.26, 1.62, 1.3], [0.26, 1.62, 1.3],        // 1だん目(前)
                [-0.26, 1.28, 1.84], [0.26, 1.28, 1.84],      // 3だん目(大将の上の すき間)
                [-0.52, 1.46, 1.56], [0.52, 1.46, 1.56],      // 2だん目(大将の となり)
                [0, 1.12, 2.12],                              // 4だん目(まん中)
                [-0.78, 1.62, 1.3], [0.78, 1.62, 1.3],        // 1だん目の外
                [-0.78, 1.28, 1.84], [0.78, 1.28, 1.84],      // 3だん目の外
                [-0.52, 1.12, 2.1], [0.52, 1.12, 2.1]] }      // 4だん目の外
};
function photoAttach(av, list) {   // 指(ピースの2本・いいねの親指)を その時だけ手につける。list = [[種類, 手], ...]
  const u = av.userData;
  (u.atts || []).forEach((g) => { g.parent && g.parent.remove(g); g.traverse((m) => m.geometry && m.geometry.dispose()); });
  u.atts = [];
  if (!u.hands) return;
  const sk = u.skin || '#f6d2b8';
  list.forEach(([kind, hi]) => {
    const g = new THREE.Group();
    if (kind === 'v') [-1, 1].forEach((sd) => { const f = tm(new THREE.CapsuleGeometry(0.0085, 0.036, 4, 6), sk, sd * 0.011, -0.05, 0.004, 0.002); f.rotation.z = sd * 0.25; g.add(f); });
    if (kind === 'thumb') { const f = tm(new THREE.CapsuleGeometry(0.01, 0.026, 4, 6), sk, 0, -0.012, 0.032, 0.002); f.rotation.x = Math.PI / 2; g.add(f); }
    u.hands[hi].add(g); u.atts.push(g);
  });
}
function photoPose(av, dt) {
  const u = av.userData, P = u.photo; u.t += dt;
  u.body.position.y = Math.sin(u.t * 2.1) * 0.004; u.body.rotation.set(0, 0, P.lean || 0);   // まん中へ寄りそう
  if (u.legs) u.legs.visible = false;   // 座った足は写さない(うしろの段の足が 前へ突き出して見えるため)
  const pose = PHOTO_POSES.find((p) => p[0] === P.pose) || PHOTO_POSES[0], wave = pose[0] === 'wave';
  const setArm = (i, key, wv) => { const sd = i === 1 ? 1 : -1, A = ARM[key]; u.arms[i].rotation.set(A[0], 0, sd * A[1] + (wv ? Math.sin(u.t * 9) * 0.28 * sd : 0)); if (u.fores) u.fores[i].rotation.x = A[2]; };
  let main = 1;
  if (P.owner) { setArm(1, P.selfie || 'selfie'); setArm(0, pose[2], wave); main = 0; }   // 大将は 片手でスマホ(自撮り)、もう片方でポーズ
  else { setArm(1, pose[2], wave); setArm(0, pose[3]); }
  const list = !pose[4] || pose[4] === 'mug' ? [] : pose[0] === 'wpeace' && !P.owner ? [['v', 1], ['v', 0]] : [[pose[4], main]], key = JSON.stringify(list);
  if (key !== u.attKey) { photoAttach(av, list); u.attKey = key; }
  u.head.rotation.set(-0.05 + Math.sin(u.t * 0.7) * 0.012, 0, P.tilt || 0);
  const mug = pose[4] === 'mug' && !P.owner;
  u.cheerMug.visible = mug; if (mug) u.cheerMug.rotation.set(-(ARM.cheer[0] + ARM.cheer[2]), 0, -ARM.cheer[1]);
  const fk = P.face + '|' + P.pose;
  if (u.face && u.faceKey !== fk) {
    u.faceKey = fk; u.smiling = false;
    const fd = (PHOTO_FACES.find((f) => f[0] === P.face) || PHOTO_FACES[0])[2];
    u.face.material.map = faceTexture(fd ? Object.assign({}, u.faceA, fd) : u.faceA); u.face.material.needsUpdate = true;
  }
}
function photoClear(av) {   // 撮影が終わったら もとの形へ
  const u = av.userData; if (!u.photo) return;
  u.photo = null; photoAttach(av, []); if (u.legs) u.legs.visible = true;
  u.attKey = null; u.faceKey = null; u.cheerMug.visible = false;
  if (u.face) { u.face.material.map = faceTexture(u.faceA); u.face.material.needsUpdate = true; }
  [0, 1].forEach((i) => { u.arms[i].rotation.set(-0.45, 0, 0.06 * (i ? 1 : -1)); if (u.fores) u.fores[i].rotation.x = -0.55; });
}
function animateAvatar(av, dt) {
  if (av.userData.photo) { photoPose(av, dt); return; }
  const u = av.userData; u.t += dt;
  u.cheer = Math.max(0, u.cheer - dt); u.talk = Math.max(0, u.talk - dt);
  const breath = Math.sin(u.t * 2.1) * 0.006;
  u.body.position.y = breath;
  let hx = Math.sin(u.t * 0.7) * 0.035, hy = Math.sin(u.t * 0.43) * 0.12;
  if (u.talk > 0) hx += Math.sin(u.t * 14) * 0.06;
  /* 話しかけられたら 相手のほうを向く(体を少しひねって、残りは首で)。ゆっくり向いて、ゆっくり戻る */
  u.lookT = Math.max(0, (u.lookT || 0) - dt);
  u.lw = (u.lw || 0) + ((u.lookT > 0 ? 1 : 0) - (u.lw || 0)) * Math.min(1, dt * (u.lookT > 0 ? 5 : 3));
  const ly = u.lookYaw || 0, ld = u.lw * u.lw * (3 - 2 * u.lw);
  const bodyY = Math.max(-0.85, Math.min(0.85, ly * 0.45)), headY = Math.max(-1.0, Math.min(1.0, ly - bodyY));
  hy = hy * (1 - ld) + headY * ld; hx += 0.05 * ld;
  u.body.rotation.y = bodyY * ld;
  u.head.rotation.set(hx, hy, Math.sin(u.t * 0.5) * 0.03 * (1 - ld));
  /* 向いている間は笑顔(目は にこにこ、口は にかっ)。終わったら もとの顔 */
  const smile = u.lookT > 0.3;
  if (u.face && smile !== !!u.smiling) {
    u.smiling = smile;
    u.face.material.map = smile ? faceTexture(Object.assign({}, u.faceA, { eyes: 'smile', mouth: u.faceA.mouth === 'grin' ? 'smile' : 'grin' })) : faceTexture(u.faceA);
    u.face.material.needsUpdate = true;
  }
  /* 乾杯(2.2秒): 持ち上げる → 前へ出して カチン → 掲げる → 口へ運んで ひと口 → 下ろす */
  const e = u.cheer > 0 ? CHEER_T - u.cheer : -1;
  const P = e < 0 ? CHEER_KEYS[0] : cheerPose(e);
  u.arms[1].rotation.x = P[0] + (e > 0.55 && e < 1.25 ? Math.sin(e * 9) * 0.03 : 0);
  u.arms[1].rotation.z = P[1];
  if (u.fores) u.fores[1].rotation.x = P[2];
  u.head.rotation.x += P[4];
  u.body.rotation.x = P[5];
  if (e >= 0) {   // ジョッキは いつも まっすぐ(飲むときだけ 口のほうへ かたむける)
    u.cheerMug.rotation.set(-(P[0] + P[2]) + P[3], 0, -P[1]);
  }
  u.cheerMug.visible = e >= 0 && e < CHEER_T - 0.12;
}
const CHEER_T = 2.2;
// [肩の前後, 肩の内外, ひじ, ジョッキのかたむき, 頭の上下, 体の前後] を時間ごとに
// 掲げるときは 顔の横の上(顔は かくさない)、飲むときだけ 口の前へ
const CHEER_KEYS = [[-0.75, 0.1, -0.55, 0, 0, 0], [-1.85, 0.6, -0.7, 0, -0.06, 0.02], [-2.12, 0.34, -0.5, 0.15, -0.1, 0.05], [-1.9, 0.52, -0.65, 0, -0.12, -0.02], [-1.9, 0.52, -0.65, 0, -0.12, -0.02],
                    [-1.42, -0.08, -1.88, -0.85, -0.3, -0.05], [-1.42, -0.08, -1.88, -0.85, -0.3, -0.05], [-0.75, 0.1, -0.55, 0, 0, 0]];
const CHEER_AT = [0, 0.32, 0.46, 0.6, 1.15, 1.45, 1.8, 2.2];
function cheerPose(e) {
  let i = 0; while (i < CHEER_AT.length - 2 && e > CHEER_AT[i + 1]) i++;
  const t = Math.min(1, Math.max(0, (e - CHEER_AT[i]) / (CHEER_AT[i + 1] - CHEER_AT[i]))), k = t * t * (3 - 2 * t);
  return CHEER_KEYS[i].map((v, j) => v + (CHEER_KEYS[i + 1][j] - v) * k);
}

/* =====================================================================
   料理とお酒(MENU の model で形が決まる。知らない形は お皿に絵文字)
   ===================================================================== */
const SPRITE_CACHE = {};
function emojiSprite(emoji, size = 0.14) {
  const tex = SPRITE_CACHE[emoji] || (SPRITE_CACHE[emoji] = canvasTex(128, 128, (g) => {
    g.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 64, 70);
  }));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(size, size, size); return s;
}
/* ---- 料理の部品 ---- */
const DS = THREE.DoubleSide;
function P(r = 0.1, color = '#f5f1e8') { return mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.016, 28), mat(color), 0, 0.008, 0); }
function plate(r, color) { return P(r, color); }
function oval(w, d, color = '#f5f1e8') { const m = P(0.5, color); m.scale.set(w, 1, d); return m; }
function rectPlate(w, d, color = '#f5f1e8', h = 0.016) { return mesh(new THREE.BoxGeometry(w, h, d), mat(color), 0, h / 2, 0); }
function bowl(r = 0.075, h = 0.055, color = '#3a2a24', inner) {
  const pts = [[r * 0.42, 0], [r * 0.5, 0.004], [r * 0.86, h * 0.55], [r, h], [r * 0.94, h], [r * 0.8, h * 0.55], [r * 0.45, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat(color, { side: DS })));
  if (inner) g.add(mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.5, h * 0.95, 28, 1, true), mat(inner, { side: THREE.BackSide }), 0, h * 0.52, 0));
  return g;
}
function disc(r, y, color, o) { return mesh(new THREE.CylinderGeometry(r, r, 0.004, 28), mat(color, o), 0, y, 0); }
function blob(r, sx, sy, sz, color, x = 0, y = 0, z = 0) { const m = mesh(new THREE.SphereGeometry(r, 14, 10), mat(color), x, y, z); m.scale.set(sx, sy, sz); return m; }
function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat(color), x, y, z); m.rotation.y = ry; return m; }
function stick(len, r, color, x, y, z, rx = 0, ry = 0, rz = Math.PI / 2) { const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat(color), x, y, z); m.rotation.set(rx, ry, rz); return m; }
function noodles(n, R, y, color, thick = 0.004) {   // どんぶりの中のめん(弧を何本も)
  const g = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R * (0.35 + 0.6 * ((k * 37) % 10) / 10), thick, 5, 18, Math.PI * (0.7 + ((k * 13) % 5) / 10)), mat(color));
    t.rotation.set(Math.PI / 2, 0, k * 1.9); t.position.y = y + (k % 3) * 0.002; g.add(t);
  }
  return g;
}
function lemon(x, y, z) { const m = mesh(new THREE.SphereGeometry(0.02, 10, 8, 0, Math.PI), mat('#f3e04a'), x, y, z); m.rotation.x = -Math.PI / 2; return m; }
function rnd(k) { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); }   // いつも同じ形になる でたらめ

/* ---- 料理とお酒を作る。food = 食べると消える所 / left = 食べ終わったあとに残る所 ---- */
function buildItem(item, empty, half) {
  const g = new THREE.Group(), food = new THREE.Group(), left = new THREE.Group();
  g.add(food); g.add(left);
  const glassM = mat('#ddeeff', { transparent: true, opacity: 0.28 });
  const liquid = (c) => mat(c || '#f2b51c', { transparent: true, opacity: 0.88 });
  const W = '#f3efe6';
  switch (item.model) {
    /* ---------- 飲み物 ---------- */
    case 'mug': {
      g.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 16), glassM, 0, 0.07, 0));
      const h = mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 14, Math.PI), glassM, 0.05, 0.07, 0); h.rotation.z = -Math.PI / 2; g.add(h);
      food.add(mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.11, 16), liquid(item.color), 0, 0.058, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.03, 16), mat('#fbf7ec'), 0, 0.125, 0));
      left.add(mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.008, 16), mat('#fbf7ec', { transparent: true, opacity: 0.6 }), 0, 0.012, 0));
      break; }
    case 'glass':
      g.add(mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.15, 16), glassM, 0, 0.075, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.034, 0.031, 0.11, 16), liquid(item.color), 0, 0.058, 0));
      for (let k = 0; k < 3; k++) food.add(box(0.025, 0.025, 0.025, '#ffffff', (k - 1) * 0.012, 0.1 + k * 0.01, (k % 2) * 0.01));
      if (item.id === 'lemon') food.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 12), mat('#f3e04a'), 0, 0.12, 0.01));
      left.add(box(0.018, 0.018, 0.018, '#ffffff', 0, 0.012, 0));
      break;
    case 'rock':
      g.add(mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.08, 16), glassM, 0, 0.04, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.05, 16), liquid(item.color), 0, 0.028, 0));
      food.add(blob(0.028, 1, 1, 1, '#ffffff', 0, 0.05, 0));
      if (item.id === 'umeshu') food.add(blob(0.012, 1, 1, 1, '#b8862a', 0.015, 0.018, 0.01));
      left.add(blob(0.015, 1, 0.8, 1, '#ffffff', 0, 0.015, 0));
      break;
    case 'tokkuri': {
      const pts = [[0, 0], [0.035, 0], [0.045, 0.04], [0.04, 0.09], [0.018, 0.13], [0.016, 0.16], [0.022, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
      const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat(item.color || '#f4f0e6'));
      if (empty) { t.rotation.z = Math.PI / 2; t.position.set(0.08, 0.045, -0.02); }   // 飲み終わると寝かせる
      g.add(t);
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.03, 14), mat('#f4f0e6'), -0.06, 0.015, 0.03));
      break; }
    case 'masu':
      g.add(box(0.085, 0.06, 0.085, '#e2c28a', 0, 0.03, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.1, 16), glassM, 0, 0.08, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.025, 0.023, 0.09, 16), liquid('#eef4ea'), 0, 0.08, 0));
      food.add(box(0.075, 0.004, 0.075, '#eef4ea', 0, 0.055, 0));
      break;
    case 'cup':
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 16), mat(item.color || '#6f8f6a'), 0, 0.04, 0));
      break;

    /* ---------- 名物(ダジャレ。見た目はふつうの料理) ---------- */
    case 'ramen': {
      g.add(bowl(0.09, 0.06, '#9a1f1a', '#f3efe6'));
      food.add(disc(0.08, 0.05, '#c98a3a', { transparent: true, opacity: 0.92 }));
      food.add(noodles(7, 0.07, 0.053, '#f0d27a'));
      [[-0.03, 0.02], [0.0, 0.035]].forEach(([x, z], k) => { const c = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 16), mat('#d9a07a'), x, 0.056 + k * 0.002, z); c.rotation.x = 0.2; food.add(c); });
      [0, 1, 2].forEach((k) => { const n = box(0.04, 0.05, 0.002, '#1b2a1a', -0.035 + k * 0.025, 0.07, -0.055); n.rotation.x = -0.25; food.add(n); });
      food.add(blob(0.022, 1.3, 0.35, 1, '#3f7a2a', 0.04, 0.057, -0.01));
      food.add(blob(0.014, 1, 0.8, 1, '#ffffff', 0.035, 0.058, 0.03)); food.add(blob(0.008, 1, 0.6, 1, '#f5a623', 0.035, 0.064, 0.03));
      left.add(disc(0.05, 0.02, '#c98a3a', { transparent: true, opacity: 0.6 }));
      break; }
    case 'curry':
      g.add(oval(0.22, 0.15));
      food.add(blob(0.05, 1.2, 0.45, 1, '#fbfaf5', -0.04, 0.02, 0));
      food.add(blob(0.055, 1.1, 0.2, 1.1, '#8a4a16', 0.035, 0.018, 0));
      [[0.03, 0.01], [0.05, -0.02], [0.02, -0.025]].forEach(([x, z]) => food.add(box(0.014, 0.012, 0.014, '#e09a3a', x, 0.026, z)));
      food.add(blob(0.012, 1.4, 0.5, 1, '#c8263a', -0.075, 0.02, 0.04));
      left.add(blob(0.04, 1.3, 0.05, 0.9, '#8a4a16', 0.02, 0.017, 0));
      break;
    case 'gyudon':
      g.add(bowl(0.075, 0.06, '#e8e2d6', '#2a2a3a'));
      food.add(blob(0.065, 1, 0.3, 1, '#fbfaf5', 0, 0.05, 0));
      food.add(blob(0.06, 1, 0.18, 1, '#7a4a26', 0, 0.062, 0));
      for (let k = 0; k < 6; k++) food.add(box(0.03, 0.003, 0.006, '#e8d29a', Math.cos(k) * 0.03, 0.07, Math.sin(k * 2) * 0.03, k));
      food.add(blob(0.012, 1.3, 0.5, 1, '#e0304a', 0.035, 0.07, 0.025));
      break;
    case 'oyakodon':
      g.add(bowl(0.075, 0.06, '#2a2a3a', '#2a2a3a'));
      food.add(blob(0.065, 1, 0.3, 1, '#fbfaf5', 0, 0.05, 0));
      food.add(blob(0.062, 1, 0.16, 1, '#f2c94c', 0, 0.062, 0));
      for (let k = 0; k < 5; k++) food.add(box(0.016, 0.012, 0.016, '#e6c49a', Math.cos(k * 1.3) * 0.03, 0.068, Math.sin(k * 1.3) * 0.03, k));
      for (let k = 0; k < 3; k++) food.add(box(0.02, 0.002, 0.008, '#5aa83a', -0.01 + k * 0.012, 0.072, 0.01, k));
      break;
    case 'tororosoba':
      g.add(bowl(0.085, 0.06, '#1f1a18', '#1f1a18'));
      food.add(disc(0.076, 0.048, '#5a3418'));
      food.add(noodles(8, 0.068, 0.05, '#8a7a66', 0.0035));
      food.add(blob(0.04, 1, 0.3, 1, '#f4f0e2', 0, 0.056, 0));
      food.add(blob(0.01, 1, 0.8, 1, '#f5b623', 0, 0.066, 0));
      for (let k = 0; k < 6; k++) food.add(box(0.025, 0.001, 0.004, '#111', -0.03 + rnd(k) * 0.06, 0.062, -0.03 + rnd(k + 9) * 0.06, k));
      left.add(disc(0.045, 0.018, '#5a3418'));
      break;
    case 'curryudon':
      g.add(bowl(0.085, 0.06, '#7a2a1a', '#f3efe6'));
      food.add(disc(0.076, 0.05, '#b8781e'));
      food.add(noodles(6, 0.068, 0.052, '#fbf8ee', 0.007));
      for (let k = 0; k < 8; k++) food.add(mesh(new THREE.TorusGeometry(0.005, 0.002, 4, 8), mat('#4f9a3a'), -0.03 + rnd(k) * 0.06, 0.056, -0.03 + rnd(k + 5) * 0.06));
      left.add(disc(0.045, 0.02, '#b8781e'));
      break;
    case 'pizza':
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 28), mat('#a87a48'), 0, 0.007, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 28), mat('#d9a35a'), 0, 0.02, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.004, 28), mat('#f2d27a'), 0, 0.027, 0));
      for (let k = 0; k < 7; k++) food.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), mat('#b8302a'), Math.cos(k * 0.9) * 0.045 * (k % 2 ? 1 : 0.5), 0.03, Math.sin(k * 0.9) * 0.045 * (k % 2 ? 1 : 0.5)));
      for (let k = 0; k < 6; k++) food.add(box(0.012, 0.004, 0.006, '#3a8a2a', -0.05 + rnd(k) * 0.1, 0.031, -0.05 + rnd(k + 3) * 0.1, k));
      for (let k = 0; k < 3; k++) food.add(box(0.17, 0.002, 0.002, '#8a5a2a', 0, 0.03, 0, k * Math.PI / 3));
      left.add(box(0.03, 0.006, 0.02, '#d9a35a', 0.03, 0.017, 0.02, 0.4));
      break;

    /* ---------- おつまみ ---------- */
    case 'edamame':
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.035, 18), mat('#e9e2d2'), 0, 0.017, 0));
      for (let k = 0; k < 9; k++) { const e = mesh(new THREE.CapsuleGeometry(0.009, 0.03, 3, 6), mat('#6ea83c'), (rnd(k) - 0.5) * 0.08, 0.04, (rnd(k + 20) - 0.5) * 0.08); e.rotation.set(Math.PI / 2, 0, rnd(k + 40) * 3); food.add(e); }
      for (let k = 0; k < 4; k++) { const e = mesh(new THREE.CapsuleGeometry(0.008, 0.028, 3, 6), mat('#a8c27a'), (rnd(k + 60) - 0.5) * 0.06, 0.037, (rnd(k + 70) - 0.5) * 0.06); e.rotation.set(Math.PI / 2, 0, k); left.add(e); }
      break;
    case 'hiyayakko':
      g.add(rectPlate(0.11, 0.11, '#3c5a8a'));
      food.add(box(0.065, 0.04, 0.05, '#fbfaf2', 0, 0.036, 0));
      food.add(blob(0.012, 1.4, 0.4, 1, '#5aa83a', 0, 0.058, 0));
      for (let k = 0; k < 6; k++) food.add(box(0.014, 0.002, 0.01, '#d9a46a', -0.02 + rnd(k) * 0.04, 0.06, -0.015 + rnd(k + 3) * 0.03, k));
      break;
    case 'dashimaki':
      g.add(rectPlate(0.15, 0.08));
      for (let k = 0; k < 3; k++) { food.add(box(0.03, 0.035, 0.05, '#f2c94c', -0.04 + k * 0.032, 0.033, 0)); food.add(box(0.031, 0.004, 0.051, '#e0a83a', -0.04 + k * 0.032, 0.028, 0)); }
      food.add(blob(0.016, 1.2, 0.8, 1, '#f8f8f2', 0.055, 0.025, 0.01));
      break;
    case 'takowasa':
      g.add(bowl(0.045, 0.035, '#3c5a8a', '#3c5a8a'));
      for (let k = 0; k < 8; k++) food.add(blob(0.01, 1, 0.7, 1, k % 3 ? '#c8a0a8' : '#8a4a5a', -0.02 + rnd(k) * 0.04, 0.032, -0.02 + rnd(k + 4) * 0.04));
      food.add(blob(0.008, 1, 0.7, 1, '#7ab83a', 0.012, 0.04, 0.008));
      break;
    case 'motsuni':
      g.add(bowl(0.06, 0.045, '#2a2a2a', '#2a2a2a'));
      food.add(disc(0.053, 0.038, '#8a5a2a'));
      for (let k = 0; k < 7; k++) food.add(blob(0.012, 1.2, 0.6, 1, k % 2 ? '#c8a07a' : '#e8d0b0', -0.03 + rnd(k) * 0.06, 0.042, -0.03 + rnd(k + 2) * 0.06));
      for (let k = 0; k < 7; k++) food.add(mesh(new THREE.TorusGeometry(0.004, 0.0018, 4, 8), mat('#4f9a3a'), -0.02 + rnd(k + 9) * 0.04, 0.047, -0.02 + rnd(k + 11) * 0.04));
      left.add(disc(0.03, 0.015, '#8a5a2a'));
      break;
    case 'tsukemono':
      g.add(rectPlate(0.12, 0.07, '#e8e2d6'));
      for (let k = 0; k < 3; k++) { const t = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 14, 1, false, 0, Math.PI), mat('#f2d23a'), -0.04 + k * 0.012, 0.024, 0); t.rotation.z = Math.PI / 2; food.add(t); }
      for (let k = 0; k < 3; k++) { const c = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), mat('#7ab84a'), 0.005 + k * 0.01, 0.02 + k * 0.002, 0.005); c.rotation.x = 0.3; food.add(c); }
      food.add(blob(0.014, 1.3, 0.6, 1, '#8a2a6a', 0.042, 0.022, 0));
      break;

    /* ---------- 揚げ物 ---------- */
    /* ---------- お祝いモードの限定 ---------- */
    case 'champagne': {   // シャンパン(細長いグラス + 泡)
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.006, 0.02, 14), glassM, 0, 0.003, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 8), glassM, 0, 0.04, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.016, 0.1, 16, 1, true), glassM, 0, 0.12, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.024, 0.015, 0.08, 16), liquid(item.color || '#f2d98a'), 0, 0.112, 0));
      for (let k = 0; k < 6; k++) food.add(blob(0.0035, 1, 1, 1, '#fffbe8', Math.sin(k * 2) * 0.01, 0.085 + k * 0.009, Math.cos(k * 2) * 0.01));
      left.add(mesh(new THREE.CylinderGeometry(0.016, 0.015, 0.006, 12), liquid(item.color || '#f2d98a'), 0, 0.075, 0));
      break; }
    case 'amazake':   // 甘酒(湯のみ + 白い甘酒 + しょうが)
      g.add(mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.075, 16), mat('#e8dcc8'), 0, 0.038, 0));
      food.add(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.006, 16), mat('#fbf6ea'), 0, 0.068, 0));
      food.add(blob(0.007, 1, 0.4, 1, '#f2c84a', 0.008, 0.072, 0));
      left.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.003, 16), mat('#efe6d6'), 0, 0.012, 0));
      break;
    case 'chicken': {   // フライドチキン(骨つき + 紙のひらひら)
      g.add(P(0.1));
      [[-0.025, -0.01, 0.4], [0.03, 0.02, -0.5]].forEach(([x, z, r]) => { const c = new THREE.Group(); c.position.set(x, 0.03, z); c.rotation.y = r; food.add(c);
        c.add(blob(0.034, 1.25, 0.8, 0.95, '#a85a20')); c.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), mat('#f6efe0'), 0.05, 0.004, 0)).children; });
      food.children.forEach((c) => { if (c.children[1]) c.children[1].rotation.z = Math.PI / 2; });
      food.add(blob(0.022, 1.3, 0.4, 1, '#9ad06a', 0.0, 0.016, 0.055));
      left.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), mat('#f6efe0'), 0, 0.015, 0)); left.children[0].rotation.z = Math.PI / 2;
      break; }
    case 'cake': {   // ショートケーキ(三角 + いちご)
      g.add(P(0.08, '#fbfaf6'));
      const w = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16, 1, false, 0, Math.PI / 3.2), mat('#fbf6ec'), -0.03, 0.045, -0.02); food.add(w);
      const sp = mesh(new THREE.CylinderGeometry(0.0755, 0.0755, 0.012, 16, 1, false, 0, Math.PI / 3.2), mat('#f2d48a'), -0.03, 0.038, -0.02); food.add(sp);
      const st = mesh(new THREE.ConeGeometry(0.014, 0.026, 10), mat('#e0283a'), 0.0, 0.088, 0.02); food.add(st);
      food.add(blob(0.012, 1, 0.6, 1, '#fbfaf2', 0.0, 0.078, 0.02));
      left.add(blob(0.012, 1.4, 0.3, 1, '#fbf6ec', 0, 0.015, 0));
      break; }
    case 'bdcake': {   // バースデーケーキ(丸いホール + いちご + ろうそく + 火)
      g.add(P(0.12, '#fbfaf6'));
      food.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 24), mat('#fbf6ec'), 0, 0.05, 0));
      food.add(mesh(new THREE.TorusGeometry(0.088, 0.008, 6, 24), mat('#fffaf0'), 0, 0.086, 0)).children; food.children[food.children.length - 1].rotation.x = Math.PI / 2;
      for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2; food.add(mesh(new THREE.ConeGeometry(0.011, 0.02, 8), mat('#e0283a'), Math.cos(an) * 0.068, 0.096, Math.sin(an) * 0.068)); }
      for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2 + 0.3; const x = Math.cos(an) * 0.035, z = Math.sin(an) * 0.035;
        food.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.045, 6), mat(['#ff7aa8', '#7ac8ff', '#ffd23b', '#9ae07a', '#c8a0ff'][k]), x, 0.108, z));
        food.add(mesh(new THREE.ConeGeometry(0.006, 0.016, 8), new THREE.MeshBasicMaterial({ color: '#ffb02a' }), x, 0.139, z)); }
      left.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16, 1, false, 0, Math.PI / 2.5), mat('#fbf6ec'), 0, 0.02, 0));
      break; }
    case 'soba': {   // 年越しそば(どんぶり + そば + えび天)
      g.add(bowl(0.085, 0.06, '#1f1a18', '#1f1a18'));
      food.add(disc(0.076, 0.048, '#6a3a1a'));
      food.add(noodles(8, 0.068, 0.05, '#8a7a66', 0.0035));
      const ebi = mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 10), mat('#e8a040'), 0.0, 0.062, 0.0); ebi.rotation.z = Math.PI / 2; ebi.rotation.y = 0.5; food.add(ebi);
      food.add(blob(0.01, 1.3, 0.4, 1, '#e03a2a', 0.045, 0.062, -0.022));
      for (let k = 0; k < 5; k++) food.add(blob(0.006, 1, 0.3, 1, '#5aa83a', -0.03 + k * 0.012, 0.058, 0.035));
      left.add(disc(0.045, 0.018, '#6a3a1a'));
      break; }
    case 'ozoni': {   // お雑煮(赤いおわん + 角もち + 青み + にんじん)
      g.add(bowl(0.075, 0.05, '#a01a1a', '#2a0c0c'));
      food.add(disc(0.068, 0.04, '#e8dcc0'));
      food.add(box(0.04, 0.02, 0.035, '#fbf8f0', -0.01, 0.048, 0, 0.3));
      food.add(blob(0.015, 1.4, 0.3, 1, '#3a9a3a', 0.03, 0.046, 0.02)); food.add(blob(0.01, 1.2, 0.4, 1, '#f08a2a', 0.025, 0.046, -0.025));
      left.add(disc(0.04, 0.012, '#e8dcc0'));
      break; }
    case 'osechi': {   // おせち(重箱: 黒い箱・赤い内がわ・しきりに色とりどり)
      g.add(box(0.15, 0.05, 0.15, '#141012', 0, 0.025, 0));
      g.add(box(0.14, 0.004, 0.14, '#a01a1a', 0, 0.05, 0));
      const C = [['#f2c84a', 'kuri'], ['#e8303a', 'ebi'], ['#1a1a1a', 'kuromame'], ['#fbf4e0', 'kamaboko'], ['#f5d64a', 'datemaki'], ['#3a8a3a', 'ao'], ['#c85a2a', 'ninjin'], ['#f0e0c0', 'renkon'], ['#e86a8a', 'kohaku']];
      C.forEach(([col], k) => { const x = (k % 3 - 1) * 0.045, z = (Math.floor(k / 3) - 1) * 0.045; for (let j = 0; j < 3; j++) food.add(blob(0.011, 1, 0.7, 1, col, x + (j - 1) * 0.011, 0.06, z + (j % 2) * 0.008)); });
      left.add(box(0.13, 0.002, 0.13, '#a01a1a', 0, 0.052, 0));
      break; }
    case 'karaage':
      g.add(P(0.1));
      for (let k = 0; k < 5; k++) { const c = mesh(new THREE.DodecahedronGeometry(0.024, 0), mat('#b5682a'), Math.cos(k * 1.3) * 0.04, 0.035, Math.sin(k * 1.3) * 0.04); c.rotation.set(k, k * 2, 0); food.add(c); }
      food.add(blob(0.03, 1.4, 0.5, 1, '#9ad06a', -0.05, 0.02, -0.04));
      g.add(lemon(0.06, 0.03, 0.04));
      break;
    case 'fries': case 'friesbig': {
      g.add(rectPlate(0.13, 0.13, '#3a2a20'));
      g.add(box(0.11, 0.002, 0.11, '#f6f0dc', 0, 0.017, 0, 0.3));   // 紙
      const big = item.model === 'friesbig';
      /* ポテト: 長さはばらばら、両はしは少しこげ茶。下は寝かせて重ね、上ほど いろいろな角度で立てかけて山にする。
         全部を1つの形にまとめる(1本ずつだと 描く回数が多くなる) */
      const n = big ? 44 : 16, fr = [];
      for (let k = 0; k < n; k++) {
        const len = (big && k > n * 0.3 ? 0.045 : 0.036) + rnd(k + 7) * 0.03, th = 0.0085 + rnd(k + 11) * 0.002;
        const geo = new THREE.BoxGeometry(th, len, th, 1, 3, 1), gp = geo.attributes.position;
        for (let i = 0; i < gp.count; i++) { const yy = gp.getY(i); if (Math.abs(Math.abs(yy) - len / 6) < 1e-6) gp.setY(i, Math.sign(yy) * (len / 2 - 0.004)); }   // 両はしの近くに 色の境目
        const fg = vcolor(geo, rnd(k + 3) < 0.3 ? '#f0c862' : '#f8da7a', { band: [[-1, -len / 2 + 0.001, '#cf9440'], [len / 2 - 0.001, 1, '#cf9440']] });
        let tilt, yaw = rnd(k + 19) * Math.PI * 2, x, y, z;
        const lvl = big ? k / n : 0, a = k * 2.39 + rnd(k + 23), rad = big ? 0.048 * (1 - lvl * 0.8) * (0.3 + rnd(k + 29) * 0.7) : 0.035 + rnd(k + 29) * 0.012 * 0;
        if (!big || lvl < 0.3) { tilt = Math.PI / 2 - 0.15 + rnd(k + 31) * 0.3; x = Math.cos(a) * (big ? rad : (rnd(k) - 0.5) * 0.09 / 0.9); z = Math.sin(a) * (big ? rad : (rnd(k + 30) - 0.5) * 0.09 / 0.9); if (!big) { x = (rnd(k) - 0.5) * 0.08; z = (rnd(k + 30) - 0.5) * 0.08; } y = 0.024 + (big ? lvl * 0.04 : (k % 3) * 0.006); }
        else { tilt = 1.12 + rnd(k + 31) * 0.38; x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = 0.03 + lvl * 0.075; yaw = rnd(k + 37) * Math.PI * 2; }   // 寝かせ気味に いろんな向きで 交差させて積む(上ほど小さく)
        fg.rotateZ(tilt); fg.rotateY(yaw); fg.translate(x, y, z); fr.push(fg);
      }
      food.add(new THREE.Mesh(mergeGeos(fr, ['position', 'normal', 'color']), new THREE.MeshLambertMaterial({ vertexColors: true })));
      if (big) food.add(box(0.003, 0.05, 0.002, '#8a6a4a', 0, 0.125, 0));
      if (big) food.add(box(0.025, 0.016, 0.001, '#c8261c', 0.013, 0.143, 0));   // 小さな旗
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.012, 14), mat(W), 0.07, 0.022, 0.06));
      food.add(disc(0.015, 0.029, '#c8261c'));
      food.children[food.children.length - 1].position.set(0.07, 0.029, 0.06);
      left.add(box(0.008, 0.04, 0.008, '#f2c24a', 0.01, 0.024, 0, 0)); left.children[0].rotation.set(Math.PI / 2, 0, 0.6);
      break; }
    case 'agedashi':
      g.add(bowl(0.065, 0.045, '#2a2a2a', '#2a2a2a'));
      food.add(disc(0.058, 0.035, '#b8803a', { transparent: true, opacity: 0.9 }));
      for (let k = 0; k < 3; k++) food.add(box(0.032, 0.03, 0.032, '#d9963a', Math.cos(k * 2.1) * 0.02, 0.048, Math.sin(k * 2.1) * 0.02, k));
      food.add(blob(0.012, 1, 0.6, 1, '#f8f8f2', 0, 0.066, 0)); food.add(blob(0.007, 1, 0.5, 1, '#5aa83a', 0.005, 0.072, 0));
      left.add(disc(0.035, 0.015, '#b8803a'));
      break;

    /* ---------- 魚 ---------- */
    case 'sashimi': {
      g.add(box(0.22, 0.016, 0.13, '#2a2a2a', 0, 0.008, 0));
      g.add(blob(0.03, 1, 1, 1, '#f2f2ee', -0.07, 0.03, 0));
      g.add(box(0.04, 0.004, 0.05, '#4f9a3a', -0.03, 0.02, -0.03));
      for (let k = 0; k < 4; k++) { const sl = box(0.04, 0.012, 0.07, k < 2 ? '#c8303a' : '#f0905a', -0.02 + k * 0.03, 0.026, 0); sl.rotation.z = 0.35; food.add(sl); }
      food.add(blob(0.008, 1, 0.7, 1, '#7ab83a', 0.085, 0.022, 0.035));
      break; }
    case 'sanma':
      g.add(rectPlate(0.27, 0.08, '#e8e2d6'));
      { const body = mesh(new THREE.CapsuleGeometry(0.014, 0.17, 4, 10), mat('#6a6e74'), 0, 0.03, 0); body.rotation.z = Math.PI / 2; body.scale.z = 1.3; food.add(body); }
      for (let k = 0; k < 4; k++) food.add(box(0.012, 0.002, 0.02, '#2a2420', -0.06 + k * 0.035, 0.045, 0, 0.5));
      { const head = mesh(new THREE.ConeGeometry(0.018, 0.04, 10), mat('#5a5e64'), -0.11, 0.03, 0); head.rotation.z = Math.PI / 2; g.add(head); }
      { const tail = mesh(new THREE.ConeGeometry(0.016, 0.03, 3), mat('#4a4e54'), 0.115, 0.03, 0); tail.rotation.z = -Math.PI / 2; g.add(tail); }
      left.add(box(0.17, 0.003, 0.004, '#e8e0d0', 0, 0.022, 0));
      for (let k = 0; k < 8; k++) left.add(box(0.002, 0.002, 0.018, '#e8e0d0', -0.07 + k * 0.02, 0.022, 0));
      g.add(blob(0.016, 1.2, 0.7, 1, '#f8f8f2', 0.06, 0.024, 0.028));
      g.add(mesh(new THREE.SphereGeometry(0.012, 10, 8, 0, Math.PI), mat('#6ab83a'), 0.085, 0.022, 0.028));
      break;
    case 'kinmedai':
      g.add(bowl(0.1, 0.03, '#2a2420', '#2a2420'));
      food.add(disc(0.085, 0.02, '#5a2e12', { transparent: true, opacity: 0.95 }));
      { const fish = new THREE.Group();
        fish.add(box(0.1, 0.024, 0.055, '#f2e6d0', 0, 0.034, 0));          // 白い身
        fish.add(box(0.1, 0.008, 0.055, '#d8402a', 0, 0.05, 0));           // 赤い皮
        fish.add(box(0.1, 0.004, 0.056, '#8a3a1a', 0, 0.0545, 0));         // たれのつや
        for (let k = 0; k < 3; k++) fish.add(box(0.004, 0.002, 0.05, '#f2e6d0', -0.03 + k * 0.03, 0.056, 0));   // 切れ目
        fish.rotation.y = 0.3; food.add(fish); }
      for (let k = 0; k < 4; k++) food.add(box(0.03, 0.004, 0.004, '#f2d87a', 0.05, 0.06 + k * 0.003, -0.03 + k * 0.006, k));
      for (let k = 0; k < 3; k++) food.add(box(0.05, 0.008, 0.008, '#6a4a2a', -0.035, 0.026, 0.045 + k * 0.01, 0.3));
      left.add(disc(0.05, 0.016, '#5a2e12')); left.add(box(0.07, 0.003, 0.003, '#e8e0d0', 0, 0.022, 0));
      break;
    case 'ajifry':
      g.add(P(0.11));
      for (let k = 0; k < 2; k++) {
        const f = blob(0.04, 1.4, 0.25, 0.85, '#d99a3a', -0.02 + k * 0.035, 0.03 + k * 0.006, -0.015 + k * 0.03); f.rotation.y = 0.4; food.add(f);
        const t = mesh(new THREE.ConeGeometry(0.014, 0.025, 3), mat('#c8882a'), 0.04 + k * 0.035, 0.03 + k * 0.006, -0.03 + k * 0.03); t.rotation.z = -Math.PI / 2; food.add(t);
      }
      food.add(blob(0.035, 1.2, 0.5, 1, '#b8d88a', -0.05, 0.025, -0.045));
      g.add(lemon(0.065, 0.026, 0.05));
      left.add(mesh(new THREE.ConeGeometry(0.012, 0.022, 3), mat('#c8882a'), 0.04, 0.024, 0)); left.children[0].rotation.z = -Math.PI / 2;
      break;

    /* ---------- 肉 ---------- */
    case 'yakitori':
      g.add(P(0.1));
      for (let s = 0; s < 2; s++) {
        const sk = new THREE.Group(), meat = new THREE.Group();
        sk.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 5), mat('#d8c39a'), 0, 0, 0));
        for (let k = 0; k < 4; k++) meat.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), mat(k % 2 ? '#8a4a22' : (s ? '#f2f0e0' : '#6e3818')), 0, -0.05 + k * 0.032, 0));
        sk.add(meat); sk.rotation.z = Math.PI / 2; sk.rotation.y = 0.25 - s * 0.5; sk.position.set(0, 0.03, -0.025 + s * 0.05); g.add(sk);
        meat.userData.food = true;
      }
      break;
    case 'steak':
      g.add(box(0.2, 0.016, 0.14, '#8a5a2a', 0, 0.008, 0));
      { const ir = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 28), mat('#1a1a1a'), 0, 0.022, 0); ir.scale.set(0.17, 1, 0.12); g.add(ir); }
      food.add(blob(0.05, 1.3, 0.28, 1, '#6a3216', -0.01, 0.038, 0));
      for (let k = 0; k < 4; k++) food.add(box(0.004, 0.002, 0.07, '#3a1a08', -0.04 + k * 0.022, 0.052, 0));
      food.add(blob(0.012, 1, 1, 1, '#3a8a2a', 0.06, 0.035, 0.02)); food.add(blob(0.01, 1, 0.6, 1, '#f2c84a', 0.06, 0.032, -0.02));
      for (let k = 0; k < 3; k++) food.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 8), mat('#e8d0a0'), -0.02 + k * 0.012, 0.055, 0.01));
      break;
    case 'yakiniku':
      g.add(box(0.2, 0.014, 0.13, '#1a1a1a', 0, 0.007, 0));
      for (let k = 0; k < 3; k++) { const sl = box(0.045, 0.006, 0.07, '#a8302a', -0.06, 0.018 + k * 0.004, -0.01 + k * 0.012, 0.2); food.add(sl); food.add(box(0.045, 0.0062, 0.006, '#f2e0d8', -0.06, 0.018 + k * 0.004, -0.0 + k * 0.012, 0.2)); }
      for (let k = 0; k < 3; k++) food.add(box(0.045, 0.006, 0.07, '#c8403a', 0.0, 0.018 + k * 0.004, -0.01 + k * 0.012, -0.1));
      for (let k = 0; k < 3; k++) food.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16), mat('#e8a0a0'), 0.06, 0.018 + k * 0.004, -0.02 + k * 0.018));
      g.add(lemon(0.07, 0.02, -0.045));
      break;
    case 'rafute':
      g.add(bowl(0.065, 0.04, '#e8e2d6', '#e8e2d6'));
      for (let k = 0; k < 2; k++) {
        food.add(box(0.04, 0.026, 0.04, '#6a3416', -0.018 + k * 0.036, 0.035, 0, 0.2 * k));
        food.add(box(0.041, 0.01, 0.041, '#d8a878', -0.018 + k * 0.036, 0.052, 0, 0.2 * k));
      }
      food.add(blob(0.007, 1, 0.6, 1, '#e8b81a', 0.0, 0.02, 0.045)); food.add(blob(0.012, 1.3, 0.4, 1, '#4f9a3a', -0.04, 0.03, 0.03));
      break;

    /* ---------- 鍋・煮物 ---------- */
    case 'oden':
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.04, 20), mat('#3a2a20'), 0, 0.02, 0));
      food.add(disc(0.084, 0.035, '#c9933f', { transparent: true, opacity: 0.85 }));
      food.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 14), mat('#e9d9a8'), -0.035, 0.045, 0));
      food.add(blob(0.022, 1, 1.3, 1, '#c58e48', 0.03, 0.05, 0.02));
      food.add(mesh(new THREE.ConeGeometry(0.03, 0.012, 3), mat('#5b5550'), 0.02, 0.045, -0.035));
      g.add(blob(0.006, 1, 0.6, 1, '#e8b81a', 0.07, 0.044, 0.04));
      left.add(disc(0.05, 0.02, '#c9933f'));
      break;
    case 'motsunabe':
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.05, 24), mat('#3a3a3a'), 0, 0.025, 0));
      [-1, 1].forEach((sx) => g.add(box(0.03, 0.008, 0.015, '#2a2a2a', sx * 0.09, 0.045, 0)));
      food.add(disc(0.074, 0.046, '#c8a070'));
      for (let k = 0; k < 6; k++) food.add(blob(0.02, 1.4, 0.3, 1, '#c8e0a0', -0.04 + rnd(k) * 0.08, 0.052, -0.04 + rnd(k + 3) * 0.08));
      for (let k = 0; k < 8; k++) food.add(box(0.04, 0.002, 0.005, '#3a8a2a', -0.02 + rnd(k + 6) * 0.04, 0.056, -0.02 + rnd(k + 8) * 0.04, k));
      for (let k = 0; k < 6; k++) food.add(blob(0.01, 1.3, 0.7, 1, '#f2e8d8', -0.03 + rnd(k + 12) * 0.06, 0.054, -0.03 + rnd(k + 14) * 0.06));
      left.add(disc(0.05, 0.02, '#c8a070'));
      break;

    /* ---------- サラダ ---------- */
    case 'potesara':
      g.add(P(0.08, '#e8e2d6'));
      food.add(blob(0.045, 1, 0.55, 1, '#f2e6b8', 0, 0.03, 0));
      for (let k = 0; k < 5; k++) food.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 10), mat('#7ab84a'), Math.cos(k * 1.4) * 0.03, 0.046, Math.sin(k * 1.4) * 0.03));
      for (let k = 0; k < 4; k++) food.add(box(0.006, 0.006, 0.006, '#e88a3a', Math.cos(k * 2) * 0.022, 0.05, Math.sin(k * 2) * 0.022));
      g.add(blob(0.02, 1.4, 0.4, 1, '#9ad06a', 0.055, 0.02, -0.03));
      break;
    case 'caesar':
      g.add(bowl(0.085, 0.045, '#f3efe6', '#f3efe6'));
      for (let k = 0; k < 10; k++) { const l = blob(0.028, 1.2, 0.35, 0.9, k % 3 ? '#6ab83a' : '#9ad06a', Math.cos(k * 2.3) * 0.035, 0.04 + (k % 3) * 0.008, Math.sin(k * 2.3) * 0.035); l.rotation.set(rnd(k) - 0.5, k, rnd(k + 1) - 0.5); food.add(l); }
      for (let k = 0; k < 6; k++) food.add(box(0.012, 0.012, 0.012, '#d9a35a', -0.03 + rnd(k + 20) * 0.06, 0.065, -0.03 + rnd(k + 22) * 0.06, k));
      for (let k = 0; k < 4; k++) food.add(blob(0.012, 1.2, 0.3, 1, '#fbf8ee', -0.02 + rnd(k + 30) * 0.04, 0.068, -0.02 + rnd(k + 32) * 0.04));
      break;
    case 'daikonsalad':
      g.add(P(0.09, '#3c5a8a'));
      for (let k = 0; k < 30; k++) { const d = box(0.003, 0.003, 0.06, '#fbfaf2', (rnd(k) - 0.5) * 0.06, 0.02 + rnd(k + 50) * 0.03, (rnd(k + 90) - 0.5) * 0.05, rnd(k + 7) * 3); d.rotation.x = rnd(k + 3) - 0.5; food.add(d); }
      for (let k = 0; k < 6; k++) food.add(box(0.002, 0.03, 0.002, '#7ab84a', (rnd(k + 33) - 0.5) * 0.03, 0.055, (rnd(k + 44) - 0.5) * 0.03));
      for (let k = 0; k < 8; k++) food.add(box(0.02, 0.001, 0.004, '#111', (rnd(k + 60) - 0.5) * 0.05, 0.052, (rnd(k + 66) - 0.5) * 0.05, k));
      break;

    /* ---------- ご飯 ---------- */
    case 'onigiri': {
      g.add(rectPlate(0.14, 0.08, '#e8e2d6'));
      const tri = new THREE.Shape(); const r = 0.034;
      tri.moveTo(0, r); tri.quadraticCurveTo(r * 0.12, r * 1.08, r * 0.2, r * 0.9);
      tri.lineTo(r * 0.92, -r * 0.42); tri.quadraticCurveTo(r * 1.05, -r * 0.62, r * 0.8, -r * 0.62);
      tri.lineTo(-r * 0.8, -r * 0.62); tri.quadraticCurveTo(-r * 1.05, -r * 0.62, -r * 0.92, -r * 0.42);
      tri.lineTo(-r * 0.2, r * 0.9); tri.quadraticCurveTo(-r * 0.12, r * 1.08, 0, r);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3 });
      geo.translate(0, 0, -0.011);
      for (let k = 0; k < 2; k++) {
        const o = new THREE.Group(); o.position.set(-0.03 + k * 0.055, 0.016 + r * 0.62, 0); o.rotation.y = -0.25 + k * 0.5;
        o.add(new THREE.Mesh(geo, mat('#fbfaf5')));
        o.add(box(0.036, 0.024, 0.036, '#1b2a1a', 0, -r * 0.62 + 0.012, 0));   // のり
        if (k === 0) o.add(blob(0.007, 1, 0.6, 0.4, '#e86a5a', 0, r * 0.25, 0.018)); else o.add(blob(0.007, 1, 1, 0.4, '#b8203a', 0, r * 0.25, 0.018));
        food.add(o);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.005, 12), mat('#f2d23a'), 0.055, 0.02, 0.028));
      break; }
    case 'ochazuke':
      g.add(bowl(0.07, 0.055, '#e8e2d6', '#e8e2d6'));
      food.add(blob(0.055, 1, 0.25, 1, '#fbfaf5', 0, 0.035, 0));
      food.add(disc(0.062, 0.042, '#b8b86a', { transparent: true, opacity: 0.55 }));
      food.add(blob(0.01, 1, 0.9, 1, '#b8203a', 0, 0.05, 0));
      for (let k = 0; k < 6; k++) food.add(box(0.02, 0.001, 0.004, '#111', -0.02 + rnd(k) * 0.04, 0.046, -0.02 + rnd(k + 3) * 0.04, k));
      food.add(blob(0.006, 1, 0.6, 1, '#7ab83a', 0.025, 0.046, 0.01));
      break;

    default: {
      g.add(P(0.09));
      const s = emojiSprite(item.emoji || '🍽️', 0.13); s.position.set(0, 0.07, 0); food.add(s);
    }
  }
  // 焼き鳥は 串に刺さった肉だけ消す
  let meatN = 0;
  if (item.model === 'yakitori') g.traverse((o) => { if (o.userData && o.userData.food) { o.visible = !empty && !(half && meatN === 1); meatN++; } });
  food.visible = !empty; left.visible = !!empty;
  if (half && !empty) {   // 半分: 飲み物は量を半分に、料理は ひと回り小さく低く
    if (item.kind === 'drink') food.scale.set(1, 0.5, 1);
    else { food.scale.set(0.85, 1, 0.85); food.children.forEach((c, k) => { if (k >= 3 && k % 2 === 1) c.visible = false; }); }   // 具を半分に(下の汁やご飯は残す)
  }
  return g;
}
/* 1人の前の置き場所(カウンター1人分: 幅60cm・奥行き45cm)。料理3皿と飲み物1杯 */
const FOOD_SLOTS = [[-0.17, 0.05], [0.04, -0.11], [0.07, 0.14]];
const DRINK_SLOT = [0.26, 0.1];

/* =====================================================================
   お店
   ===================================================================== */
function createShop(canvas, opts) {
  const N = opts.seats;
  let SHOPNAME = opts.name || SHOP.NAME;   // バトンタッチで その場で変わる(setName)   // 回ごとの店の名前(ちょうちん・のれんの文字)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); window.__iz3dLost = 1; window.dispatchEvent(new Event('iz3d-lost')); });
  canvas.addEventListener('webglcontextrestored', () => { window.__iz3dLost = 0; });   // もどったら そのまま(three.js が 描き直す)   // スマホの都合で 3D が落ちた(絵の入れ物が いっぱい・長く裏にいた)→ app.js が 読みこみ直す(11-22 まっ黒のまま もどらなかった)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#140c08');
  scene.fog = new THREE.Fog('#140c08', 7, 14);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 40);

  // 明かり
  scene.add(new THREE.HemisphereLight('#ffd9a8', '#3a2010', 0.9));
  const L = N * SEAT_GAP + 1.8;
  [-L / 4, L / 4].forEach((x) => { const p = new THREE.PointLight('#ffb766', 6, 7, 1.6); p.position.set(x, 2.2, 0.1); scene.add(p); });
  const back = new THREE.PointLight('#ffcf8a', 3, 5, 1.8); back.position.set(0, 2.0, -1.6); scene.add(back);

  // 床・かべ・天井
  const floorT = canvasTex(256, 256, (g) => {
    g.fillStyle = '#3b2a1e'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#24170f'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); }
  });
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(L, 4);
  const W = L + 2.4;
  const floor = mesh(new THREE.PlaneGeometry(W, 7), new THREE.MeshLambertMaterial({ map: floorT }), 0, 0, 0.6); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wallT = woodTex('#5a3a22', '#2a180c', 512, 256, 3);
  const wallM = new THREE.MeshLambertMaterial({ map: wallT });
  const backWall = mesh(new THREE.PlaneGeometry(W, 3.2), wallM, 0, 1.6, -2.1); scene.add(backWall);
  [-1, 1].forEach((s) => { const w = mesh(new THREE.PlaneGeometry(7, 3.2), wallM, (W / 2) * s, 1.6, 0.6); w.rotation.y = -Math.PI / 2 * s; scene.add(w); });
  const frontWall = mesh(new THREE.PlaneGeometry(W, 3.2), mat('#2b1b10'), 0, 1.6, 3.6); frontWall.rotation.y = Math.PI; scene.add(frontWall);
  const ceil = mesh(new THREE.PlaneGeometry(W, 7), mat('#1e130c'), 0, 3.0, 0.6); ceil.rotation.x = Math.PI / 2; scene.add(ceil);
  for (let k = -3; k <= 3; k++) { const beam = mesh(new THREE.BoxGeometry(W, 0.12, 0.14), mat('#2a1a10'), 0, 2.92, k * 0.9 + 0.6); scene.add(beam); }

  // カウンター
  const topT = woodTex('#b98a55', '#6b4422', 1024, 128, 2);
  const counterTop = mesh(new THREE.BoxGeometry(L, 0.07, 0.72), new THREE.MeshLambertMaterial({ map: topT }), 0, COUNTER_Y - 0.035, 0);
  scene.add(counterTop);
  scene.add(mesh(new THREE.BoxGeometry(L - 0.04, COUNTER_Y - 0.07, 0.06), new THREE.MeshLambertMaterial({ map: woodTex('#4a2e1a', '#22140a', 512, 128, 2) }), 0, (COUNTER_Y - 0.07) / 2, 0.3));
  scene.add(mesh(new THREE.BoxGeometry(L, 0.86, 0.5), mat('#3a2616'), 0, 0.43, -0.6));       // 中の調理台
  scene.add(mesh(new THREE.BoxGeometry(L, 0.04, 0.5), mat('#9a9a96'), 0, 0.88, -0.6));        // ステンレス
  // おでん鍋
  const nabe = new THREE.Group();
  nabe.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), mat('#a9a9a4'), 0, 0.06, 0));
  nabe.add(mesh(new THREE.BoxGeometry(0.46, 0.01, 0.26), mat('#c08a3a'), 0, 0.115, 0));
  for (let k = 0; k < 8; k++) nabe.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(['#e9d9a8', '#c58e48', '#5b5550', '#d9b27a'][k % 4]), -0.18 + (k % 4) * 0.12, 0.12, k < 4 ? -0.06 : 0.06));
  nabe.position.set(-L / 2 + 0.6, 0.9, -0.62); scene.add(nabe);

  // 奥の棚とお酒
  const TV_GAP = 0.72;   // 真ん中はモニターの場所(棚も木札も置かない)
  const shelfLen = L / 2 - 0.2 - TV_GAP;
  for (let r = 0; r < 2; r++) {
    [-1, 1].forEach((sd) => scene.add(mesh(new THREE.BoxGeometry(shelfLen, 0.04, 0.3), mat('#6b4728'), sd * (TV_GAP + shelfLen / 2), 1.45 + r * 0.45, -1.95)));
  }
  buildShelfStuff(scene, TV_GAP, shelfLen);
  // 品書き(壁の木札) — MENU から自動で作る
  const tagList = [];
  // 壁に入る数だけ(名物が先、つぎに料理、飲み物はあと)
  const tagW = 0.17, tagH = 0.5;
  const tagXs = [];
  for (let x = TV_GAP + 0.06 + tagW / 2; x < L / 2 - 0.2 - tagW / 2 + 0.001; x += tagW + 0.03) tagXs.push(x, -x);
  const BOARD_X = TV_GAP + 0.06 + tagW + 0.015;   // モニターの右どなりの 木札2枚ぶんは「本日の最高得点」の黒板にする(ノブさん 2026-11-21)
  for (let i = tagXs.length - 1; i >= 0; i--) if (tagXs[i] > 0 && tagXs[i] < BOARD_X + tagW + 0.02) tagXs.splice(i, 1);
  const must = (SHOP.TAG_ALWAYS || []).map((id) => SHOP.MENU.find((m) => m.id === id)).filter(Boolean);
  const items = must.concat(SHOP.MENU.filter((m) => m.pun), SHOP.MENU.filter((m) => !m.pun && m.kind !== 'drink'), SHOP.MENU.filter((m) => m.kind === 'drink')).filter((m) => !m.only)   // お祝いの日だけの品は 木札にしない
    .filter((m, i, a) => a.indexOf(m) === i).slice(0, tagXs.length);
  items.forEach((it, i) => {
    const t = canvasTex(64, 200, (g) => {
      g.fillStyle = '#e8d3a6'; g.fillRect(0, 0, 64, 200);
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 196);
      g.fillStyle = '#2a1a10'; g.font = '30px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'top';
      const chars = Array.from(it.name).slice(0, 6);
      const sz = chars.length > 5 ? 26 : 30; g.font = sz + 'px ' + FONT_JP;
      chars.forEach((ch, k) => { if (ch === 'ー') { g.save(); g.translate(32, 14 + k * (sz + 2) + sz / 2); g.rotate(Math.PI / 2); g.fillText(ch, 0, -sz / 2); g.restore(); } else g.fillText(ch, 32, 12 + k * (sz + 2)); });
    });
    const tag = mesh(new THREE.PlaneGeometry(tagW, tagH), new THREE.MeshLambertMaterial({ map: t }), tagXs[i], 2.45, -2.08);
    tag.userData.menuId = it.id; tagList.push(tag);   // 押すと注文できる
    scene.add(tag);
  });

  // 本日の最高得点の黒板(今日のミニゲーム。上位3人。上に ゲームの名前 11-22)
  const boardTex = canvasTex(256, 336, () => {});
  let boardList = null, boardTitle = '';
  function drawBoard() {
    const c = boardTex.image, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#6b4728'; g.fillRect(0, 0, W, H);   // 木のわく
    g.fillStyle = '#23382c'; g.fillRect(10, 10, W - 20, H - 20);   // 黒板
    g.fillStyle = '#f6f0e0'; g.textAlign = 'center'; g.textBaseline = 'top';
    if (boardTitle) {   // 今日のゲームの名前(長いときは 字を小さく)
      const tt = Array.from(boardTitle).slice(0, 12).join(''); g.font = 'bold ' + (tt.length > 9 ? 17 : 20) + 'px ' + FONT_JP; g.fillStyle = '#f5c04a'; g.fillText(tt, W / 2, 20);
      g.fillStyle = '#f6f0e0'; g.font = 'bold 24px ' + FONT_JP; g.fillText('本日の最高得点', W / 2, 52);
    } else { g.font = 'bold 26px ' + FONT_JP; g.fillText('本日の', W / 2, 22); g.fillText('最高得点', W / 2, 52); }
    g.strokeStyle = 'rgba(246,240,224,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(28, 92); g.lineTo(W - 28, 92); g.stroke();
    const L = boardList || [];
    if (!L.length) { g.font = '22px ' + FONT_JP; g.fillText('まだ記録なし', W / 2, 140); g.font = '20px ' + FONT_JP; g.fillStyle = '#f5c04a'; g.fillText('🎮で挑戦!', W / 2, 180); }
    L.slice(0, 3).forEach((x, i) => {
      const y = 108 + i * 72;
      g.textAlign = 'left'; g.fillStyle = ['#f5c04a', '#e8e8f0', '#e0a070'][i]; g.font = 'bold 26px ' + FONT_JP; g.fillText((i + 1) + '', 24, y + 4);
      g.fillStyle = '#f6f0e0'; g.font = '22px ' + FONT_JP; g.fillText(Array.from(String(x.name || '')).slice(0, 7).join(''), 52, y + 2);
      g.textAlign = 'right'; g.font = 'bold 24px ' + FONT_JP; g.fillText((x.score | 0) + '点', W - 22, y + 34);
    });
    boardTex.needsUpdate = true;
  }
  drawBoard();
  scene.add(mesh(new THREE.PlaneGeometry(tagW * 2 + 0.03, tagH * 1.05), new THREE.MeshLambertMaterial({ map: boardTex }), BOARD_X, 2.45, -2.075));

  // 大将のうしろのモニター(動画はこの画面の上に重ねて流す。何もない時は店の名前と曲名)
  const TV_W = 1.1, TV_H = 0.62;
  const tv = new THREE.Group(); tv.position.set(0, 2.16, -2.0); tv.rotation.x = 0.12;   // 少し下向き=座っている人に見やすい
  const tvBezel = mesh(new THREE.BoxGeometry(TV_W + 0.08, TV_H + 0.08, 0.05), mat('#141210'), 0, 0, 0); tv.add(tvBezel);
  const TV_TALL = { w: 0.45, h: 0.8, y: 0 }, TV_WIDE = { w: TV_W, h: TV_H, y: 0 };
  const tvCur = { w: TV_W, h: TV_H, y: 0 }; let tvWant = TV_WIDE;
  tv.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), mat('#2a2622'), 0, 0, -0.07));   // 壁の金具
  let tvInfo = { title: '', sub: '', playing: false };
  const tvCanvas = document.createElement('canvas'); tvCanvas.width = 640; tvCanvas.height = 360;
  const tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace;
  function drawTV() {
    const g = tvCanvas.getContext('2d');
    if (tvInfo.playing) { g.fillStyle = '#000'; g.fillRect(0, 0, 640, 360); tvTex.needsUpdate = true; return; }
    const gr = g.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#1c2a3a'); gr.addColorStop(1, '#0b0f16');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffcf8a'; g.font = 'bold 64px ' + FONT_JP; g.fillText(SHOPNAME.slice(0, 8), 320, 120);
    g.fillStyle = '#f3efe6'; g.font = '30px ' + FONT_JP;
    const t = tvInfo.title ? '♪ ' + tvInfo.title : '';
    g.fillText(Array.from(t).slice(0, 18).join(''), 320, 215);
    g.fillStyle = '#9fb3c8'; g.font = '24px ' + FONT_JP; g.fillText(tvInfo.sub || '動画のリクエスト受付中', 320, 280);
    tvTex.needsUpdate = true;
  }
  drawTV();
  const tvScreen = mesh(new THREE.PlaneGeometry(TV_W, TV_H), new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false }), 0, 0, 0.027);
  tv.add(tvScreen); scene.add(tv);
  // お客さんの後ろ(入口の横の上)にも1台。大将の目線から、いま何が流れているか見える
  const tv2 = new THREE.Group(); tv2.rotation.set(0.08, Math.PI + 0.42, 0, 'YXZ'); tv2.position.set(Math.min(L * 0.47, W / 2 - 1.1), 1.85, 3.4); tv2.scale.setScalar(1.6);   // 大将のほうへ少し向ける
  const tv2Bezel = new THREE.Mesh(tvBezel.geometry, tvBezel.material); tv2.add(tv2Bezel);
  tv2.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), mat('#2a2622'), 0, 0, -0.07));
  const tv2Screen = mesh(tvScreen.geometry, tvScreen.material, 0, 0, 0.027); tv2.add(tv2Screen); scene.add(tv2);
  const tvScreens = [tvScreen, tv2Screen], tvBezels = [tvBezel, tv2Bezel];
  const tvCorner = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].map((c) => new THREE.Vector3(c[0] * TV_W, c[1] * TV_H, 0.028));   // 画面の大きさに合わせて伸びる(スクリーンの scale)
  function tvStep(dt) {   // 縦⇔横へ なめらかに形を変える
    const k = Math.min(1, dt * 5);
    let moved = false;
    ['w', 'h', 'y'].forEach((n) => { const d = tvWant[n] - tvCur[n]; if (Math.abs(d) > 0.0005) { tvCur[n] += d * k; moved = true; } else tvCur[n] = tvWant[n]; });
    if (!moved && tvScreen.scale.x === tvCur.w / TV_W) return;
    tvScreens.forEach((sc) => sc.scale.set(tvCur.w / TV_W, tvCur.h / TV_H, 1));
    tvBezels.forEach((bz) => bz.scale.set((tvCur.w + 0.08) / (TV_W + 0.08), (tvCur.h + 0.08) / (TV_H + 0.08), 1));
  }

  // ちょうちん
  const drawLantern = (g) => {
    g.fillStyle = '#c8261c'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    for (let y = 16; y < 256; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.fillStyle = '#1a0a06'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = Array.from(SHOPNAME.replace(/^居酒屋\s*/, '') || '酒').slice(0, 3);
    const sz = chars.length === 1 ? 120 : chars.length === 2 ? 78 : 58;
    g.font = 'bold ' + sz + 'px ' + FONT_JP;
    [64, 192].forEach((cx) => chars.forEach((ch, k) => g.fillText(ch, cx, 128 + (k - (chars.length - 1) / 2) * sz * 1.02)));
  };
  const lanternTex = canvasTex(256, 256, drawLantern);
  const lanterns = [];
  // 真ん中(モニターと お祝いの垂れ幕)の前には 提灯を下げない。左右に同じ数ずつ、等しい間で(ノブさん 2026-11-21「真ん中の提灯が じゃまで 映像が見づらい」)
  const LGAP = 1.0, nside = Math.max(1, Math.round((L / 2 - LGAP) / 1.5)), nl = nside * 2;
  for (let k = 0; k < nl; k++) {
    const kk = k < nside ? k : k - nside, sgn = k < nside ? -1 : 1;
    const x = sgn * (LGAP + (kk + 0.5) * ((L / 2 - LGAP) / nside));
    const lg = new THREE.Group(); lg.position.set(x, 2.58, -0.05);
    const body = mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshLambertMaterial({ map: lanternTex, emissive: '#ff5a2a', emissiveIntensity: 0.55, emissiveMap: lanternTex }));
    body.scale.y = 1.35; lg.add(body);
    lg.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), mat('#1a1a1a'), 0, 0.23, 0));
    lg.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), mat('#1a1a1a'), 0, -0.23, 0));
    lg.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), mat('#111'), 0, 0.5, 0));
    scene.add(lg); lanterns.push(lg);
  }
  // 入口ののれん(お客さんの後ろ)
  const drawNoren = (g) => {
    g.fillStyle = '#1f2a4a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#f3efe6'; g.font = 'bold 120px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'middle';
    const nm = SHOPNAME.replace(/^居酒屋\s*/, '') || SHOPNAME;
    g.fillText(nm.slice(0, 4), 256, 140);
  };
  const norenT = canvasTex(512, 256, drawNoren), norenTexs = [norenT];
  for (let k = 0; k < 3; k++) {
    const piece = mesh(new THREE.PlaneGeometry(0.42, 0.75), new THREE.MeshLambertMaterial({ map: norenT, side: THREE.DoubleSide }), -0.44 + k * 0.44, 2.15, 3.55);
    piece.material = piece.material.clone(); piece.material.map = norenT.clone(); piece.material.map.needsUpdate = true;
    norenTexs.push(piece.material.map); piece.material.map.repeat.set(1 / 3, 1); piece.material.map.offset.set((2 - k) / 3, 0);   // 大将から見て 左から読めるように(右から3枚目が 文字の頭)
    piece.rotation.y = Math.PI; scene.add(piece);
  }
  { const door = mesh(new THREE.PlaneGeometry(1.4, 2.4), mat('#a88a5a'), 0, 1.2, 3.58); door.rotation.y = Math.PI; scene.add(door); }

  // いす
  const stools = [];
  const stoolTop = mat('#7a2a1e'), stoolLeg = mat('#2a2a2a');
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group(); g.position.set(seatX(i, N), 0, GUEST_Z);
    const top = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 22), stoolTop, 0, STOOL_Y - 0.035, 0); g.add(top);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, STOOL_Y - 0.07, 8), stoolLeg, 0, (STOOL_Y - 0.07) / 2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.03, 16), stoolLeg, 0, 0.015, 0));
    const hit = mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.8, 0);
    hit.userData.seat = i; g.add(hit);
    scene.add(g); stools.push({ g, hit });
  }

  // 人と料理の入れもの
  const seatAvatars = new Array(N).fill(null), seatKeys = new Array(N).fill('');
  const tableGroups = [], tableKeys = new Array(N).fill('');
  for (let i = 0; i < N; i++) { const t = new THREE.Group(); t.position.set(seatX(i, N), COUNTER_Y, 0.08); scene.add(t); tableGroups.push(t); }
  /* その人のテーブル(カウンターの上の、席の前の分)。大将が押すと 料理を出す */
  const tableHits = [];
  for (let i = 0; i < N; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(SEAT_GAP * 0.96, 0.16, 0.76), new THREE.MeshBasicMaterial({ visible: false })); h.position.set(seatX(i, N), COUNTER_Y, 0); h.userData.seat = i; scene.add(h); tableHits.push(h); }
  let owner = null, ownerKey = '', ownerTargetX = 0, ownerHeadPts = null;
  let itemHitList = [], bumpKey = '', bumpAt = 0;
  const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

  // カメラ
  const view = { mode: 'overview', seat: -1, yaw: 0, pitch: 0, zoom: 1 };
  const camPos = new THREE.Vector3(0, 2.4, 4.4), camLook = new THREE.Vector3(0, 1.1, -0.5);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  /* カメラの置き場所。縦向き(スマホを立てて持つ)は横に7人が入らないので、カウンターの端から斜めに見る。
     横向きは正面から、7人全員が入る広さに自動で合わせる */
  let wantFov = 60;
  function fitFov(dist, k = 1) {   // カウンターの端から端までが横に入る広さ(k: 使える横はばの割合)
    const half = L / 2 - 0.15;
    const h = 2 * Math.atan(half / dist);
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / (baseAspect * k))), 42, 88);
  }
  /* 大将の目線(接客用): 座っている人だけが入るように、正面から寄ったり引いたりする。
     1人なら その人を大きく、2〜3人なら横一列、多いときは全体(縦向きで正面に入りきらないときは、はしから斜めに) */
  const HEAD_Y = 1.36, CAM_Y = 1.58;
  let viewShift = 0, baseAspect = 1, viewApplied = -1;   // 横向きの大将の画面: 左に会話の欄があるので、絵の中心を右へずらす(0 = ずらさない)
  function ownerFrame(portrait) {
    const xs = []; seatAvatars.forEach((a, i) => { if (a) xs.push(seatX(i, N)); });
    if (!xs.length) xs.push(seatX(0, N), seatX(N - 1, N));   // だれも座っていないときは 空いている席を全部
    const x0 = xs.length ? Math.min(...xs) : -SEAT_GAP, x1 = xs.length ? Math.max(...xs) : SEAT_GAP;
    const span = x1 - x0, cx = (x0 + x1) / 2;
    viewShift = portrait ? 0 : 0.69;
    const asp = baseAspect * (portrait ? 1 : 0.62);
    const p = portrait ? 0.38 : 0.52;          // 頭を画面の上から何割の高さに置くか(下は会話の欄、上は吹き出しの場所)
    const needW = span + (portrait ? Math.max(0.8, 1.25 - span * 0.15) : 1.5), needH = portrait ? 1.3 : 1.15;
    const dMax = GUEST_Z - (portrait ? -4.15 : -1.85);   // 縦向きは 奥の壁の向こうまで下がれる(壁ぎわの物は隠す)
    const fit = (fov) => { const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)); return Math.max(needW / (2 * t * asp), needH / (2 * t)); };
    let fov = portrait ? 66 : 46, d = fit(fov);
    while (d > dMax && fov < (portrait ? 88 : 80)) { fov += 2; d = fit(fov); }
    if (d <= dMax || !portrait) {
      d = Math.min(Math.max(d, 1.7), dMax);
      const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      wantFov = fov; wantPos.set(cx, CAM_Y + Math.max(0, d - 2.6) * 0.12, GUEST_Z - d);
      wantLook.set(cx, HEAD_Y - (1 - 2 * p) * t * d, GUEST_Z);   // 頭が上から p の高さに来るように、見る点を下げる
      return;
    }
    // 縦向きで人数が多い・はなれているとき: はしから斜めに見る(前からの形)
    const ex = Math.max(0, N - 7) * 0.22;
    wantPos.set(-L / 2 - 0.1 - ex * 0.5, 2.1 + ex * 0.4, -1.25 - ex * 0.3); wantLook.set(L * 0.12, 0.95, 1.45); wantFov = 64 + Math.max(0, N - 7) * 1.5;
  }
  /* 奥の壁ぎわの物(棚・木札・モニター・のれん)。大将の画面で 壁の向こうから映すときは隠す */
  let backStuff = null;
  function backList() {
    if (backStuff) return backStuff;
    backStuff = []; const bx = new THREE.Box3();
    scene.children.forEach((o) => { if (o.isLight || o === owner || seatAvatars.includes(o)) return; bx.setFromObject(o); if (!bx.isEmpty() && bx.max.z < -1.3) backStuff.push(o); });
    return backStuff;
  }
  function target() {
    const x = view.seat >= 0 ? seatX(view.seat, N) : 0;
    const portrait = baseAspect < 1;
    wantFov = portrait ? 70 : 55;
    switch (view.mode) {
      case 'first': wantPos.set(x, 1.5, GUEST_Z + 0.22); wantLook.set(x, portrait ? 1.08 : 1.24, -0.95); break;   // 勝手に動かさない(大将がほかの席へ行っても まっすぐ前のまま)   // 横向きは少し上を見る(モニターが入るように)   // 向きすぎると となりの頭でふさがる
      case 'back': wantPos.set(x * 0.85, 2.3, GUEST_Z + 1.35); wantLook.set(x * 0.75, 1.0, -0.45); break;   // 頭ごしに 自分の料理が見える高さ
      case 'owner': ownerFrame(portrait); break;
      case 'ownerAll': viewShift = portrait ? 0 : 0.69;   // 大将の「全体」: お客さんの全体と同じ映し方。横向きは左の会話の欄の分 右へずらす
      // fall through
      default:
        if (portrait) { const ex = Math.max(0, N - 7) * 0.32; wantPos.set(L / 2 + 0.75 + ex * 0.4, 2.55 + ex * 0.35, 2.75 + ex); wantLook.set(-L * 0.12, 1.0, -0.35); wantFov = 64 + Math.max(0, N - 7) * 1.5; }
        else { wantPos.set(0, 2.6, 3.25); wantLook.set(0, 1.0, -0.8); wantFov = fitFov(3.25, view.mode === 'ownerAll' ? 0.62 : 1); }
    }
    // 指でぐるっと見回す分
    const dir = wantLook.clone().sub(wantPos);
    const len = dir.length();
    const yaw = Math.atan2(dir.x, -dir.z) + view.yaw;
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y / len, -1, 1)) + view.pitch;
    wantLook.set(wantPos.x + Math.sin(yaw) * Math.cos(pitch) * len, wantPos.y + Math.sin(pitch) * len, wantPos.z - Math.cos(yaw) * Math.cos(pitch) * len);
  }

  // 指の操作(見回す・席をタップ)
  let drag = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });   // 指で押したあとの「おまけのクリック」が、開いたばかりの画面に当たって閉じてしまうのを防ぐ
  /* 2本の指: 広げるとアップ、すぼめると ふつうの大きさまで戻る(パソコンはホイール) */
  const fingers = new Map(); let pinch = null;
  const fdist = () => { const p = [...fingers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  canvas.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) { pinch = { d: fdist(), z: view.zoom }; drag = null; return; }
    if (fingers.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false };
  });
  const fingerUp = (e) => { fingers.delete(e.pointerId); if (fingers.size < 2 && pinch) { pinch = null; drag = null; } };
  window.addEventListener('pointercancel', fingerUp);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 1, 2.6); }, { passive: false });
  window.addEventListener('pointermove', (e) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2) { view.zoom = THREE.MathUtils.clamp(pinch.z * fdist() / Math.max(1, pinch.d), 1, 2.6); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 14) drag.moved = true;   // 指が少しずれても「押した」にする
    const lim = view.mode === 'first' ? 1.65 : view.mode === 'back' ? 1.2 : 0.75;   // 目線は 横の奥の席まで見回せる
    const sp = 0.004 / view.zoom;   // アップのときは ゆっくり
    view.yaw = THREE.MathUtils.clamp(drag.yaw - dx * sp, -lim, lim);
    view.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.003 / view.zoom, -0.45, 0.35);
  });
  window.addEventListener('pointerup', (e) => {
    const wasPinch = !!pinch || fingers.size > 1; fingerUp(e);
    if (wasPinch) { drag = null; return; }
    if (drag && !drag.moved && api.onTap) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // 押した物のうち、いちばん手前のもの(人のうしろのモニターや木札が先に当たらないように)
      if (!running) { drag = null; return; }
      const cand = [];
      if (api.onMonitorTap) { const h = ray.intersectObjects(tvScreens.filter((t) => t.parent.visible), false); if (h.length) cand.push({ d: h[0].distance, go: () => api.onMonitorTap() }); }
      const tagHits = ray.intersectObjects(tagList, false);
      if (tagHits.length && api.onTagTap) { const tg = tagHits[0].object; cand.push({ d: tagHits[0].distance, go: () => { tg.userData.flash = performance.now(); api.onTagTap(tg.userData.menuId); } }); }
      const itemHits = ray.intersectObjects(itemHitList, false);
      const ownerCam = view.mode === 'owner' || view.mode === 'ownerAll';
      const mine = itemHits.filter((h) => ownerCam || h.object.userData.seat === view.seat);   // お客さんは自分の席の料理だけ。大将はどの席の料理でも(押すと その席に出す)
      if (mine.length && api.onItemTap) { const u = mine[0].object.userData; cand.push({ d: mine[0].distance - 0.05, go: () => api.onItemTap(u.seat, u.key) }); }
      if (ownerCam && api.onTableTap) {   // 大将: その人のテーブルを押す → 料理を出す(人より手前なら こちら)
        const th = ray.intersectObjects(tableHits.filter((h) => seatAvatars[h.userData.seat]), false);
        if (th.length) cand.push({ d: th[0].distance - 0.02, go: () => api.onTableTap(th[0].object.userData.seat) });
      }
      if (api.onAvatarTap) {   // 人を押す → その人あてに書く(見えている部品だけ。帽子の中の髪など 見えない部品には当たらない)
        const shown = (h) => { if (h.object.material && h.object.material.visible === false) return false; for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return true; };
        const ppl = seatAvatars.map((a, i) => (a && a.visible ? { a, k: i } : null)).filter(Boolean);
        if (owner && owner.visible) ppl.push({ a: owner, k: 'owner' });
        const tagFirst = tagHits.length && api.onTagTap;   // 木札と大将が重なっている所は 木札(注文)を先に(大将あては 大将だけを押した時)
        ppl.forEach((pp) => { if (pp.k === 'owner' && tagFirst) return; const h = ray.intersectObject(pp.a, true).filter(shown); if (h.length) cand.push({ d: h[0].distance, go: () => api.onAvatarTap(pp.k) }); });
      }
      if (cand.length) { cand.sort((x, y) => x.d - y.d); cand[0].go(); drag = null; return; }
      const hits = ray.intersectObjects(stools.map((s) => s.hit));
      api.onTap(hits.length ? hits[0].object.userData.seat : -1);
    }
    drag = null;
  });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    baseAspect = w / h; camera.aspect = baseAspect; viewApplied = -1;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const clock = makeClock();
  const tmp = new THREE.Vector3();
  let running = true;
  // 電池・熱の調整: 1秒に描く回数と、細かさ。動画を大きく見ている間は 3D を休ませる
  const perf = { fps: 30, ratio: 1.5, rest: false }; let lastDraw = 0, backHidden = false;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const tDraw = performance.now();
    if (perf.rest) { if (api.onFrame) api.onFrame(); return; }
    if (tDraw - lastDraw < 1000 / perf.fps - 3) return;
    lastDraw = tDraw;
    const dt = Math.min(clock.getDelta(), 0.1);
    target();
    const k = 1 - Math.pow(0.002, dt);
    camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (photo) { if (viewApplied) { viewApplied = 0; camera.clearViewOffset(); } photoCam(camera, baseAspect, true); }
    if (window.__cam) { camera.position.set(...window.__cam[0]); camera.lookAt(...window.__cam[1]); camera.fov = window.__cam[2] || camera.fov; camera.updateProjectionMatrix(); }   // 確認用(棚などを近くで撮る)
    if (!photo) { const zf = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(wantFov / 2)) / view.zoom));   // アップ = 見る広さをせまく
      if (Math.abs(camera.fov - zf) > 0.05) { camera.fov += (zf - camera.fov) * Math.min(1, k * 2.5); camera.updateProjectionMatrix(); } }
    if (!photo) { const sh = (view.mode === 'owner' || view.mode === 'ownerAll') ? viewShift : 0;   // 絵の中心を 画面の横 sh の位置へ(ゆがまないように、広い絵の左側を切りとる)
      if (sh !== viewApplied) { viewApplied = sh; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
        if (sh) { camera.aspect = baseAspect * sh * 2; camera.setViewOffset(w * sh * 2, h, 0, 0, w, h); } else { camera.aspect = baseAspect; camera.clearViewOffset(); } } }
    { const hb = camPos.z < -1.8; if (hb !== backHidden) { backHidden = hb; backList().forEach((o) => { o.visible = !hb; }); scene.fog.near = hb ? 9 : 7; scene.fog.far = hb ? 18 : 14; } }
    seatAvatars.forEach((a) => { if (a) { animateAvatar(a, dt); lookNext(a); } });
    tagList.forEach((tg) => { const f = tg.userData.flash; if (!f) return; const e = (performance.now() - f) / 500; if (e >= 1) { tg.rotation.z = 0; tg.userData.flash = 0; return; } tg.rotation.z = Math.sin(e * Math.PI * 4) * 0.12 * (1 - e); });
    // 押した料理が「ぽよん」とはねる
    const tnow = performance.now();
    tableGroups.forEach((tg) => tg.children.forEach((m) => {
      const b = m.userData.bump; if (!b) return;
      const e = (tnow - b) / 450;
      if (e >= 1) { m.scale.setScalar(1); m.position.y = 0; m.userData.bump = 0; return; }
      const k2 = Math.sin(e * Math.PI);
      m.scale.set(1 + k2 * 0.18, 1 - k2 * 0.12 + Math.sin(e * Math.PI * 2) * 0.05, 1 + k2 * 0.18); m.position.y = k2 * 0.03;
    }));
    tvStep(dt);
    if (owner) { animateAvatar(owner, dt); lookNext(owner); if (!photo) owner.position.x += (ownerTargetX - owner.position.x) * Math.min(1, dt * 3); }
    const ov = view.mode === 'owner' && !photo;   // 大将の目線では、ちょうちんと壁のモニターは出さない(動画は左上の小窓)
    lanterns.forEach((l, i) => { l.visible = !ov; l.rotation.z = Math.sin(clock.elapsedTime * 0.8 + i) * 0.03; });
    tv2.visible = !ov;
    if (celeb) celeb.tick(clock.elapsedTime, dt);
    confettiStep(dt);
    renderer.render(scene, camera);
    if (api.onFrame) api.onFrame();
  }
  requestAnimationFrame(frame);

  const LOOK_BUSY = 2;   // 話しかけが集中したときの 1人あたりの秒数
  function lookStart(a, target, secs) {
    const t = target === 'owner' ? owner : seatAvatars[target]; if (!t) return;
    let yaw = Math.atan2(t.position.x - a.position.x, t.position.z - a.position.z) - a.rotation.y;
    while (yaw > Math.PI) yaw -= Math.PI * 2; while (yaw < -Math.PI) yaw += Math.PI * 2;
    a.userData.lookYaw = Math.max(-1.75, Math.min(1.75, yaw)); a.userData.lookT = secs; a.userData.lookTo = target;
  }
  function lookNext(a) {   // 向いている間は 相手の いまの場所へ向きなおす(大将が歩いて来るときも)。向き終わったら 順番待ちの次の人へ
    const u = a && a.userData; if (!u) return;
    if (u.lookT > 0 && u.lookTo != null && !photo) {
      const t = u.lookTo === 'owner' ? owner : seatAvatars[u.lookTo];
      if (t && t !== a) { let yaw = Math.atan2(t.position.x - a.position.x, t.position.z - a.position.z) - a.rotation.y; while (yaw > Math.PI) yaw -= Math.PI * 2; while (yaw < -Math.PI) yaw += Math.PI * 2; u.lookYaw = Math.max(-1.75, Math.min(1.75, yaw)); }
    }
    if (!u.lookQ || !u.lookQ.length || u.lookT > 0) return;
    const q = u.lookQ.shift(); lookStart(a, q.target, q.secs);
  }
  /* 記念撮影のカメラ(大将のスマホの位置)。みんなの顔が横いっぱいに入る広さ */
  let photo = null;
  function photoCam(cam, aspect, live) {
    const d = photo.cam.distanceTo(photo.look), vf = 2 * Math.atan((photo.top - photo.bot) / 2 / d), hf = 2 * Math.atan(photo.half / d);
    const fv = Math.max(vf, 2 * Math.atan(Math.tan(hf / 2) / aspect));
    // 横に合わせて広くなったぶんは 上(背景)へ回し、下のはし(前の列の胸)は動かさない
    const extra = d * Math.tan(fv / 2) - (photo.top - photo.bot) / 2;
    // 画面で見ている間(たて長のスマホ)は、下の「選ぶ」パネルに かくれないよう 集合を画面の上寄りに出す
    const up = live && aspect < 0.85 ? 0.24 * 2 * d * Math.tan(fv / 2) : 0;
    cam.position.copy(photo.cam); cam.lookAt(photo.look.x, photo.look.y + Math.max(0, extra) - up, photo.look.z);
    cam.fov = THREE.MathUtils.radToDeg(fv); cam.aspect = aspect; cam.updateProjectionMatrix();
  }
  function headPos(obj) {
    if (!obj) return null;
    obj.userData.head.getWorldPosition(tmp);
    tmp.y += 0.3 * obj.scale.y;
    const v = tmp.clone().project(camera);
    if (v.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, d: camera.position.distanceTo(tmp) };
  }

  /* ---------- お祝いモードの飾り(クリスマス・お正月・誕生日) ----------
     奥の壁(お客さんから見える)と、入口の壁(大将から見える)の両方に飾る。派手に。
     back: 奥の壁ぎわの物(大将の画面で 壁の向こうから映すときは隠す) */
  const BULB = ['#ff3b3b', '#ffd23b', '#3bff6a', '#3bb8ff', '#ff6ae0'];
  let celeb = null, celebKey = '';
  function makeCeleb(kind, opts) {
    const back = new THREE.Group(), front = new THREE.Group(), mid = new THREE.Group(), blink = [], bob = [], fall = [];
    const bm = (c) => new THREE.MeshBasicMaterial({ color: c });
    const ZB = -2.0, ZF = 3.5, top = 2.9;
    const sagPts = (x0, x1, y, z, drop, segs = 10) => { const p = []; for (let k = 0; k <= segs; k++) { const t = k / segs; p.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * drop, z)); } return p; };
    // 電球のひも(たるんだ形を いくつも)
    const lights = (g, x0, x1, y, z, swags, drop) => {
      const w = (x1 - x0) / swags;
      for (let s = 0; s < swags; s++) {
        const curve = new THREE.CatmullRomCurve3(sagPts(x0 + s * w, x0 + (s + 1) * w, y, z, drop));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 4, false), mat('#203a20')));
        const n = 7; for (let k = 0; k < n; k++) { const p = curve.getPointAt((k + 0.5) / n), c = BULB[(k + s * 2) % BULB.length]; const b = mesh(new THREE.SphereGeometry(0.032, 8, 6), bm(c), p.x, p.y - 0.035, p.z); b.scale.y = 1.3; b.userData = { c: new THREE.Color(c), ph: k + s * 3 }; g.add(b); blink.push(b); }
      }
    };
    // 字の札(横書き)
    const banner = (g, text, x, y, z, w, h, bg, fg, ry = 0, font = 'bold 120px ' + FONT_JP) => {
      const t = canvasTex(1024, Math.round(1024 * h / w), (c) => { c.fillStyle = bg; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
        let fs = parseInt(font.match(/(\d+)px/)[1], 10); c.font = font; while (c.measureText(text).width > c.canvas.width * 0.92 && fs > 20) { fs -= 6; c.font = font.replace(/\d+px/, fs + 'px'); } c.fillText(text, 512, c.canvas.height / 2 + 4); });
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }), x, y, z); m.rotation.y = ry; g.add(m);
      [-1, 1].forEach((s) => g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.25, 4), mat('#222'), x + s * w * 0.42, y + h / 2 + 0.12, z)));
      return m;
    };
    // 舞い落ちる物(雪・金の粉)
    const flakes = (color, n, size, speed) => {
      const pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { pos[k * 3] = (Math.random() - 0.5) * L; pos[k * 3 + 1] = 0.9 + Math.random() * 2.0; pos[k * 3 + 2] = -1.6 + Math.random() * 4.6; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const dot = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: dot, transparent: true, opacity: 0.95, depthWrite: false }));
      pts.userData.speed = speed; mid.add(pts); fall.push(pts);
    };
    const shelves = (fn) => { [-1, 1].forEach((sd) => { const x0 = sd * TV_GAP, x1 = sd * (TV_GAP + shelfLen); [1.47, 1.92].forEach((y) => fn(Math.min(x0, x1), Math.max(x0, x1), y, -1.785)); }); };   // 棚のふち(お客さんの正面)
    const star = (r, depth) => { const sh = new THREE.Shape(); for (let k = 0; k < 10; k++) { const an = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; const x = Math.cos(an) * rr, y = Math.sin(an) * rr; if (k) sh.lineTo(x, y); else sh.moveTo(x, y); } return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); };

    if (kind === 'xmas') {
      const tree = (x, z, h) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); const s = h / 1.9;
        g.add(mesh(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.26 * s, 14), mat('#a82a22'), 0, 0.13 * s, 0));
        for (let k = 0; k < 4; k++) { const r = (0.62 - k * 0.13) * s, hh = 0.62 * s, y = (0.45 + k * 0.33) * s + hh / 2; g.add(mesh(new THREE.ConeGeometry(r, hh, 16), mat(k % 2 ? '#1d6b34' : '#237a3c'), 0, y, 0)); }
        for (let k = 0; k < 30; k++) { const t = k / 30, y = (0.55 + t * 1.25) * s, r = (0.6 - t * 0.5) * s * 0.92, an = k * 2.39; const o = mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), bm(BULB[k % 5]), Math.cos(an) * r, y, Math.sin(an) * r); o.userData = { c: new THREE.Color(BULB[k % 5]), ph: k }; g.add(o); blink.push(o); }
        const st = mesh(star(0.14 * s, 0.03 * s), bm('#ffd23b'), 0, 1.98 * s, -0.015 * s); g.add(st); st.userData = { spin: 1 }; bob.push(st);
        [['#d8302a', '#f2d64a'], ['#2a6ad8', '#f6f4ee'], ['#f2d64a', '#d8302a'], ['#ea7ac0', '#f6f4ee']].forEach((c, k) => { const w = 0.22 + (k % 2) * 0.08, hb = 0.16 + (k % 3) * 0.05, an = k * 1.6 + 0.4, b = mesh(new THREE.BoxGeometry(w, hb, w), mat(c[0]), Math.cos(an) * 0.42 * s, hb / 2, Math.sin(an) * 0.42 * s); b.rotation.y = an; g.add(b);
          b.add(mesh(new THREE.BoxGeometry(w * 1.02, hb * 1.02, 0.04), mat(c[1]))); b.add(mesh(new THREE.BoxGeometry(0.04, hb * 1.02, w * 1.02), mat(c[1]))); });
        return g;
      };
      const wreath = (g, x, y, z, r, ry = 0) => { const w = new THREE.Group(); w.position.set(x, y, z); w.rotation.y = ry;
        w.add(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 24), mat('#1f6a32')));
        for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2; w.add(mesh(new THREE.SphereGeometry(r * 0.12, 8, 6), bm(k % 3 ? '#e02a2a' : '#ffd23b'), Math.cos(an) * r, Math.sin(an) * r, r * 0.2)); }
        [-1, 1].forEach((s2) => { const lp = mesh(new THREE.ConeGeometry(r * 0.25, r * 0.5, 4), mat('#d8202a'), s2 * r * 0.25, -r, r * 0.25); lp.rotation.z = s2 * Math.PI / 2; w.add(lp); }); g.add(w); };
      back.add(tree(-L / 2 - 0.55, -1.45, 2.1)); back.add(tree(L / 2 + 0.55, -1.45, 1.6));
      lights(back, -W / 2 + 0.3, W / 2 - 0.3, top, ZB, 6, 0.16);
      banner(back, 'Merry Christmas', 0, 2.72, ZB + 0.02, 1.4, 0.26, '#a8181c', '#fff3c8', 0, 'bold italic 150px Georgia, serif');
      wreath(back, 0, 1.68, ZB + 0.06, 0.13);
      front.add(tree(-W / 2 + 0.75, 3.0, 1.9));
      lights(front, -W / 2 + 0.3, W / 2 - 0.3, 2.85, ZF, 6, 0.16);
      banner(front, 'Merry Christmas', 0, 2.72, ZF, 1.6, 0.3, '#a8181c', '#fff3c8', Math.PI, 'bold italic 150px Georgia, serif');
      wreath(front, -1.35, 2.05, ZF - 0.04, 0.2, Math.PI); wreath(front, 1.35, 2.05, ZF - 0.04, 0.2, Math.PI);
      shelves((x0, x1, y, z) => { const curve = new THREE.CatmullRomCurve3(sagPts(x0, x1, y - 0.01, z, 0.05, 12)); back.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 6, false), mat('#1f6a32'))); lights(back, x0, x1, y - 0.02, z + 0.025, 2, 0.05); });
      flakes('#ffffff', 260, 0.05, 0.28);
    } else if (kind === 'newyear') {
      const kadomatsu = (x, z) => { const g = new THREE.Group(); g.position.set(x, 0, z);
        g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.42, 16), mat('#8a6a3a'), 0, 0.21, 0));   // 台(わらで巻いた桶)
        for (let k = 0; k < 3; k++) { const rg = mesh(new THREE.TorusGeometry(0.215, 0.012, 6, 20), mat('#3a2a14'), 0, 0.08 + k * 0.13, 0); rg.rotation.x = Math.PI / 2; g.add(rg); }
        [[0, 1.25, 0], [-0.08, 1.0, 0.06], [0.08, 0.85, 0.06]].forEach(([dx, h, dz]) => { const b = mesh(new THREE.CylinderGeometry(0.045, 0.05, h, 12), mat('#4a8a3a'), dx, 0.4 + h / 2, dz); g.add(b);
          const cut = mesh(new THREE.CircleGeometry(0.046, 12), mat('#d8e8b0'), dx, 0.4 + h + 0.005, dz); cut.rotation.x = -Math.PI / 2 + 0.7; g.add(cut); });
        for (let k = 0; k < 14; k++) { const an = k / 14 * Math.PI * 2, n = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), mat('#1f5a2a'), Math.cos(an) * 0.17, 0.5, Math.sin(an) * 0.17); n.rotation.z = Math.cos(an) * 0.9; n.rotation.x = -Math.sin(an) * 0.9; g.add(n); }   // 松
        for (let k = 0; k < 4; k++) { const an = k * 1.7, u = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('#e02a2a'), Math.cos(an) * 0.13, 0.55, Math.sin(an) * 0.13); g.add(u); }   // 南天
        return g; };
      const shime = (g, x, y, z, ry = 0) => { const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = ry;
        const rope = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 24), mat('#d8b860')); s.add(rope);
        for (let k = 0; k < 3; k++) s.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.005), mat('#fbfaf4'), -0.1 + k * 0.1, -0.24, 0.03));   // 紙垂
        s.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), mat('#f08a1a'), 0, 0.05, 0.05));   // だいだい
        [-1, 1].forEach((s2) => { const lf = mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#2a7a3a'), s2 * 0.08, 0.12, 0.03); lf.scale.set(1, 0.4, 0.3); lf.rotation.z = s2 * 0.6; s.add(lf); });
        s.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.01), mat('#c8202a'), 0, -0.1, 0.04)); g.add(s); };
      const kohaku = (g, y, z, ry) => { const t = canvasTex(512, 64, (c) => { for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? '#fbfaf4' : '#d01e28'; c.fillRect(k * 32, 0, 32, 64); } });
        t.wrapS = THREE.RepeatWrapping; t.repeat.set(W / 1.2, 1); const m = mesh(new THREE.PlaneGeometry(W - 0.1, 0.3), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }), 0, y, z); m.rotation.y = ry; g.add(m);
        for (let k = 0; k < 12; k++) { const sw = mesh(new THREE.SphereGeometry(0.035, 6, 5), mat('#d8b860'), -W / 2 + 0.4 + k * (W - 0.8) / 11, y + 0.15, z + (ry ? -0.02 : 0.02)); g.add(sw); } };
      const mochi = (x, y, z, s = 1) => { const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
        g.add(mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), mat('#c8a060'), 0, 0.03, 0));   // 三方
        g.add(mesh(new THREE.BoxGeometry(0.24, 0.006, 0.24), mat('#fbfaf4'), 0, 0.063, 0));
        const m1 = mesh(new THREE.SphereGeometry(0.1, 16, 10), mat('#fbf6e8'), 0, 0.1, 0); m1.scale.y = 0.5; g.add(m1);
        const m2 = mesh(new THREE.SphereGeometry(0.075, 16, 10), mat('#fbf6e8'), 0, 0.15, 0); m2.scale.y = 0.55; g.add(m2);
        g.add(mesh(new THREE.SphereGeometry(0.04, 12, 10), mat('#f08a1a'), 0, 0.2, 0)); const lf = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('#2a7a3a'), 0.02, 0.24, 0); lf.scale.set(1, 0.3, 0.6); g.add(lf); return g; };
      const sheep = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -0.6;   // 2027年は未(ひつじ)年
        for (let k = 0; k < 9; k++) g.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), mat('#fbf8f0'), (k % 3 - 1) * 0.05, 0.1 + Math.floor(k / 3) * 0.02, (Math.floor(k / 3) - 1) * 0.04));
        g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), mat('#3a2a24'), 0.1, 0.13, 0)); [-1, 1].forEach((s2) => { const hn = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.009, 6, 12, Math.PI * 1.4), mat('#c8a070')); hn.position.set(0.1, 0.16, s2 * 0.035); g.add(hn); });
        [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), mat('#3a2a24'), sx * 0.05, 0.035, sz * 0.03)))); return g; };
      back.add(kadomatsu(-L / 2 - 0.5, -1.6)); back.add(kadomatsu(L / 2 + 0.5, -1.6));
      shime(back, 0, 2.72, ZB + 0.04); kohaku(back, 2.88, ZB + 0.01, 0);
      banner(back, '謹賀新年', -0.0, 1.55, ZB + 0.04, 0.6, 0.16, '#c8202a', '#ffe9a8');
      mid.add(mochi(-L / 2 + 0.3, COUNTER_Y, 0)); mid.add(sheep(L / 2 - 0.3, COUNTER_Y, 0.02));
      front.add(kadomatsu(-1.05, 3.25)); front.add(kadomatsu(1.05, 3.25));
      shime(front, 0, 2.72, ZF - 0.05, Math.PI); kohaku(front, 2.9, ZF - 0.02, Math.PI);
      banner(front, '謹賀新年', -2.3, 2.55, ZF - 0.02, 1.2, 0.34, '#c8202a', '#ffe9a8', Math.PI); banner(front, '2027', 2.3, 2.55, ZF - 0.02, 0.9, 0.34, '#1a1a1e', '#f2d64a', Math.PI);
      shelves((x0, x1, y, z) => { const t = canvasTex(256, 32, (c) => { for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? '#fbfaf4' : '#d01e28'; c.fillRect(k * 16, 0, 16, 32); } }); t.wrapS = THREE.RepeatWrapping; t.repeat.set((x1 - x0) / 0.5, 1);
        back.add(mesh(new THREE.PlaneGeometry(x1 - x0, 0.07), new THREE.MeshBasicMaterial({ map: t }), (x0 + x1) / 2, y - 0.05, z + 0.012));
        for (let k = 0; k < 3; k++) { const xx = x0 + (k + 0.5) * (x1 - x0) / 3; back.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), mat('#d8b860'), xx, y - 0.05, z + 0.03)); back.add(mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.09, 6), mat('#d8b860'), xx, y - 0.11, z + 0.03)); } });
      flakes('#ffd86a', 140, 0.045, 0.18);
    } else if (kind === 'birthday') {
      const COL = ['#ff4a6a', '#ffd23b', '#4ac8ff', '#8ae04a', '#c87aff', '#ff9a3a'];
      const balloons = (g, x, y, z, n) => { const cl = new THREE.Group(); cl.position.set(x, y, z);
        for (let k = 0; k < n; k++) { const an = k / n * Math.PI * 2, bx = Math.cos(an) * 0.13, bz = Math.sin(an) * 0.1, by = (k % 2) * 0.12;
          const b = mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshPhongMaterial({ color: COL[k % COL.length], shininess: 80 }), bx, by, bz); b.scale.y = 1.18; cl.add(b);
          const pts = [new THREE.Vector3(bx, by - 0.14, bz), new THREE.Vector3(bx * 0.4, by - 0.4, bz * 0.4), new THREE.Vector3(0, -0.75, 0)];
          cl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.002, 3), mat('#f6f4ee'))); }
        cl.userData = { y0: y, ph: x }; bob.push(cl); g.add(cl); };
      const flags = (g, x0, x1, y, z, ry, drop = 0.18, sz = 1) => { const n = Math.max(2, Math.round((x1 - x0) / (0.24 * sz))); const curve = new THREE.CatmullRomCurve3(sagPts(x0, x1, y, z, drop, 12));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.004, 3), mat('#f6f4ee')));
        for (let k = 0; k < n; k++) { const p = curve.getPointAt((k + 0.5) / n), tri = mesh(new THREE.ConeGeometry(0.08 * sz, 0.16 * sz, 3), mat(COL[k % COL.length]), p.x, p.y - 0.08 * sz, p.z); tri.rotation.set(Math.PI, ry, 0); tri.scale.z = 0.12; g.add(tri); } };
      balloons(back, -L / 2 - 0.35, 2.25, -1.75, 6); balloons(back, L / 2 + 0.35, 2.3, -1.75, 6); balloons(back, -1.0, 2.55, -1.9, 3); balloons(back, 1.0, 2.55, -1.9, 3);
      flags(back, -W / 2 + 0.3, -0.75, 2.92, ZB + 0.02, 0); flags(back, 0.75, W / 2 - 0.3, 2.92, ZB + 0.02, 0);
      banner(back, 'HAPPY BIRTHDAY', 0, 2.72, ZB + 0.02, 1.4, 0.24, '#ff4a8a', '#ffffff', 0, 'bold 150px "Arial Rounded MT Bold", Arial, sans-serif');
      const names = (opts.names || []).filter(Boolean).slice(0, 3);
      if (names.length) banner(back, names.join('・') + ' おめでとう！', 0, 1.62, ZB + 0.05, 1.3, 0.2, '#fff3c8', '#c8203a');
      balloons(front, -2.6, 2.3, 3.25, 6); balloons(front, 2.0, 2.3, 3.25, 6); balloons(front, -1.25, 2.5, 3.3, 3); balloons(front, 1.25, 2.5, 3.3, 3);
      flags(front, -W / 2 + 0.3, W / 2 - 0.3, 2.92, ZF - 0.02, Math.PI);
      banner(front, 'HAPPY BIRTHDAY', 0, 2.65, ZF - 0.02, 1.9, 0.32, '#ff4a8a', '#ffffff', Math.PI, 'bold 150px "Arial Rounded MT Bold", Arial, sans-serif');
      if (names.length) banner(front, names.join('・') + ' おめでとう！', -2.3, 2.0, ZF - 0.02, 1.4, 0.26, '#fff3c8', '#c8203a', Math.PI);
      shelves((x0, x1, y, z) => flags(back, x0, x1, y + 0.01, z + 0.02, 0, 0.04, 0.6));
      flakes('#ff9ad0', 90, 0.045, 0.12);
    }
    scene.add(back); scene.add(front); scene.add(mid);
    return {
      back, front, mid,
      tick(t, dt) {
        back.visible = !backHidden;
        blink.forEach((b) => { const on = Math.sin(t * 3 + b.userData.ph * 1.7) > -0.2; b.material.color.copy(b.userData.c).multiplyScalar(on ? 1 : 0.28); });
        bob.forEach((o) => { if (o.userData.spin) o.rotation.y = t * 1.2; else o.position.y = o.userData.y0 + Math.sin(t * 1.3 + o.userData.ph) * 0.04; });
        fall.forEach((p) => { const a = p.geometry.attributes.position; for (let k = 0; k < a.count; k++) { let y = a.getY(k) - p.userData.speed * dt; if (y < 0.9) y = 2.9; a.setY(k, y); a.setX(k, a.getX(k) + Math.sin(t + k) * 0.002); } a.needsUpdate = true; });
      },
      dispose() { [back, front, mid].forEach((g) => { scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }); }
    };
  }
  /* 紙吹雪(お祝いの合図・カウントダウンの0) */
  let confetti = null;
  function confettiBurst(colors) {
    if (confetti) { scene.remove(confetti.m); confetti.m.geometry.dispose(); }
    const n = 220, m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.035, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const P = []; const col = new THREE.Color();
    for (let k = 0; k < n; k++) { P.push({ x: (Math.random() - 0.5) * L, y: 2.9 + Math.random() * 1.2, z: -1.5 + Math.random() * 4.2, vy: 0.5 + Math.random() * 0.6, r: Math.random() * 6, vr: 2 + Math.random() * 6 }); m.setColorAt(k, col.set(colors[k % colors.length])); }
    m.instanceColor.needsUpdate = true; scene.add(m); confetti = { m, P, t: 0 };
  }
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(), _cs = new THREE.Vector3(1, 1, 1), _cp = new THREE.Vector3();
  function confettiStep(dt) {
    if (!confetti) return;
    confetti.t += dt;
    confetti.P.forEach((p, k) => { p.y -= p.vy * dt; p.x += Math.sin(confetti.t * 2 + k) * 0.004; p.r += p.vr * dt; _ce.set(p.r, p.r * 0.7, 0); _cq.setFromEuler(_ce); _cp.set(p.x, p.y, p.z); _cm.compose(_cp, _cq, _cs); confetti.m.setMatrixAt(k, _cm); });
    confetti.m.instanceMatrix.needsUpdate = true;
    if (confetti.t > 6.5) { scene.remove(confetti.m); confetti.m.geometry.dispose(); confetti = null; }
  }

  const api = {
    /* 重さの物差し(確認用): 1回の絵で描いた三角の数・描く回数・アバター1体ごとの三角の数 */
    weight() {
      const tri = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.geometry && m.visible) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); };
      return { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
               owner: owner ? tri(owner) : 0, seats: seatAvatars.map((a) => a ? tri(a) : 0) };
    },
    onTap: null, onFrame: null, onItemTap: null, onTagTap: null, onAvatarTap: null, onTableTap: null,
    /* お祝いモード: kind = 'xmas' | 'newyear' | 'birthday' | ''(なし)。opts.names = 誕生日の人の名前 */
    setCelebrate(kind, opts = {}) {
      const key = (kind || '') + '|' + JSON.stringify(opts.names || []);
      if (key === celebKey) return; celebKey = key;
      if (celeb) { celeb.dispose(); celeb = null; }
      if (kind) celeb = makeCeleb(kind, opts);
    },
    setZoom(z) { view.zoom = z; },   // 見本: 全体を少し遠めに(1より小さいと広く見える)
    confetti(kind) { confettiBurst(kind === 'xmas' ? ['#ff3b3b', '#3bff6a', '#ffffff', '#ffd23b'] : kind === 'newyear' ? ['#ffd23b', '#d01e28', '#ffffff', '#f2c14a'] : ['#ff4a6a', '#ffd23b', '#4ac8ff', '#8ae04a', '#c87aff', '#ff9a3a']); },
    /* 確認用: 料理の画面上の位置 */
    _tagScreens() { const r = canvas.getBoundingClientRect(); return tagList.map((t) => { const v = new THREE.Vector3(); t.getWorldPosition(v); v.project(camera); return { id: t.userData.menuId, x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z }; }); },   // 確認用
    itemPos(key) { const h = itemHitList.find((x) => x.userData.key === key); if (!h) return null; const v = new THREE.Vector3(); h.getWorldPosition(v); v.y += 0.02; v.project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
    /* 押した料理を はねさせる(作りなおしたあとでも はねるように 覚えておく) */
    bump(key) { bumpKey = key; bumpAt = performance.now(); tableGroups.forEach((tg) => tg.children.forEach((m) => { if (m.userData.key === key) m.userData.bump = bumpAt; })); },
    /* seats: [{ key, avatar } | null, ...]  key が変わったときだけ作りなおす */
    setSeats(list) {
      for (let i = 0; i < N; i++) {
        const s = list[i];
        const key = s ? s.key + JSON.stringify(s.avatar) : '';
        if (key === seatKeys[i]) continue;
        if (seatAvatars[i]) { scene.remove(seatAvatars[i]); disposeAvatar(seatAvatars[i]); seatAvatars[i] = null; }
        seatKeys[i] = key;
        if (s) {
          const av = buildAvatar(s.avatar);
          av.position.set(seatX(i, N), STOOL_Y, GUEST_Z);
          av.rotation.y = Math.PI;   // カウンターのほう(奥)を向く
          scene.add(av); seatAvatars[i] = av;
        }
      }
      api._hideMine();
    },
    setOwner(avatar) {
      const key = avatar ? JSON.stringify(avatar) : '';
      if (key === ownerKey) return;
      ownerKey = key;
      if (owner) { scene.remove(owner); disposeAvatar(owner); owner = null; ownerHeadPts = null; }
      if (avatar) {
        owner = buildAvatar(avatar, { standing: true });
        owner.position.set(ownerTargetX, 0.88, OWNER_Z);
        // 大将の下半身(カウンターの向こうなので前かけだけ)
        const apron = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 16), mat('#1f2a4a'), 0, -0.2, 0);
        owner.userData.body.add(apron);
        scene.add(owner);
        owner.updateMatrixWorld(true);
        if (!window.__noCull) cullBelow(owner, OWNER_HIDE_Y);   // カウンターで どの目線からも見えない所は 描かない
        const hd = owner.userData.head, inv = hd.matrixWorld.clone().invert(), all = [], v = new THREE.Vector3();
        hd.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position) { const pa = o.geometry.attributes.position; const step = Math.max(1, Math.floor(pa.count / 120)); for (let k = 0; k < pa.count; k += step) { v.fromBufferAttribute(pa, k).applyMatrix4(o.matrixWorld).applyMatrix4(inv); all.push(v.clone()); } } });
        ownerHeadPts = all.length > 600 ? all.filter((_, k) => k % Math.ceil(all.length / 600) === 0) : all;
        api._hideMine();
      }
    },
    ownerGoTo(seat) { ownerTargetX = seat >= 0 ? seatX(seat, N) : 0; },
    /* tables: [[{ id, at, empty }, ...], ...]  料理は左から3つの置き場所、飲み物は右手前 */
    setTables(tables) {
      for (let i = 0; i < N; i++) {
        const list = tables[i] || [];
        const key = list.map((x) => x.id + (x.empty ? '_' : x.half ? '~' : '')).join(',');
        if (key === tableKeys[i]) continue;
        tableKeys[i] = key;
        const g = tableGroups[i];
        while (g.children.length) g.remove(g.children[0]);
        itemHitList = itemHitList.filter((h) => h.userData.seat !== i);
        let f = 0, d = 0;
        list.forEach((x, k) => {
          const it = SHOP.MENU.find((m) => m.id === x.id) || { id: x.id, emoji: '🍽️', model: 'plate', kind: 'food' };
          const m = buildItem(it, x.empty, x.half);
          let pos;
          if (it.kind === 'drink') { pos = [DRINK_SLOT[0], DRINK_SLOT[1] - d * 0.12]; d++; }
          else { pos = FOOD_SLOTS[f % FOOD_SLOTS.length]; if (f >= FOOD_SLOTS.length) pos = [pos[0] + 0.03, pos[1] - 0.03]; f++; }
          m.position.set(pos[0], 0, pos[1]); m.rotation.y = it.kind === 'drink' ? 0 : ((k * 1.7) % 1 - 0.5) * 0.6;
          m.userData.key = x.key;
          if (x.key === bumpKey && performance.now() - bumpAt < 450) m.userData.bump = bumpAt;
          if (!x.empty) {   // 指で押しやすいように、見えない大きめの当たりを付ける
            const hit = mesh(new THREE.CylinderGeometry(it.kind === 'drink' ? 0.07 : 0.12, 0.12, 0.2, 10), HIT_MAT, 0, 0.08, 0);
            hit.userData = { seat: i, key: x.key }; m.add(hit); itemHitList.push(hit);
          }
          g.add(m);
        });
      }
    },
    setView(mode, seat) {
      if (mode !== view.mode) { view.yaw = 0; view.pitch = 0; view.zoom = 1; }
      view.mode = mode; view.seat = seat; api._hideMine();
    },
    _hideMine() { if (photo) return; seatAvatars.forEach((a, i) => { if (a) a.visible = !(view.mode === 'first' && i === view.seat); }); if (owner) owner.visible = view.mode !== 'owner'; },
    cheer(seat) { const a = seat === 'owner' ? owner : seatAvatars[seat]; if (a) a.userData.cheer = 2.2; },
    cheerAt(seat, e) { const a = seat === 'owner' ? owner : seatAvatars[seat]; if (a) a.userData.cheer = Math.max(0.001, CHEER_T - e); },   // 確認用: 乾杯の途中の形
    cheerAll() { seatAvatars.forEach((a) => a && (a.userData.cheer = 2.2)); if (owner) owner.userData.cheer = 2.2; },
    talk(seat) { const a = seat === 'owner' ? owner : seatAvatars[seat]; if (a) a.userData.talk = 1.6; },
    /* ---------- 記念撮影(大将の自撮り風) ----------
       list = [{ key: 席の番号 か 'owner', pose, face }](写らない人は入れない)。何回よんでもよい(選びなおし・人の出入り) */
    photoSet(list, layoutId) {
      if (!photo) photo = { cam: new THREE.Vector3(0, 1.66, 2.85), look: new THREE.Vector3(0, 1.56, 1.45), half: 0.6, top: 2.1, bot: 1.05 };
      const want = new Set(list.map((p) => String(p.key)));
      seatAvatars.forEach((a, i) => { if (!a) return; a.visible = want.has(String(i)); if (!a.visible) photoClear(a); });
      if (owner) { owner.visible = want.has('owner'); if (!owner.visible) photoClear(owner); }
      // 席の順(左から)に並べる。大将がいれば まん中の前。顔が上下に重なるように 前後2〜3列
      const LY = PHOTO_LAYOUTS[layoutId] || PHOTO_LAYOUTS.N1, SL = LY.slots; photo.ly = LY; photo.cam.y = LY.cam || 1.66; photo.cam.z = LY.camZ || 3.4;   // 少し離れて撮ると、前とうしろの顔の大きさが そろう
      const own = list.find((p) => p.key === 'owner'), guests = list.filter((p) => p.key !== 'owner').sort((x, y) => x.key - y.key);
      const duo = own && guests.length === 1 && LY.duo;
      const SLd = duo ? LY.duo.slots : SL;
      const slots = duo ? [SLd[1]] : (own ? SL.slice(1, 1 + guests.length) : SL.slice(0, guests.length)).slice().sort((x, y) => x[0] - y[0]);
      // 1人ずつ 頭の大きさを測る(髪のてっぺん・あご)。帽子や ツンツン頭でも、うしろの人の顔が かくれないように
      const measure = (a) => {
        const u = a.userData; if (u.hm) return u.hm;
        const r = a.rotation.y; a.rotation.y = 0; a.updateMatrixWorld(true);
        const hw = new THREE.Vector3(); u.head.getWorldPosition(hw);
        const box = new THREE.Box3().setFromObject(u.head); let chin = -0.19;
        u.head.traverse((m) => { if (m.isMesh && m.material && m.material.color && u.skin && ('#' + m.material.color.getHexString()) === String(u.skin).toLowerCase()) { const bb = new THREE.Box3().setFromObject(m); chin = Math.max(chin, bb.min.y - hw.y); } });
        u.headOff = hw.y - a.position.y; a.rotation.y = r;
        return (u.hm = { top: box.max.y - hw.y, chin, hw: Math.max(0.15, (box.max.x - box.min.x) / 2) });
      };
      const E = [];
      const add = (a, p, sl, isOwner) => { const hm = measure(a); E.push({ a, p, sl, isOwner, x: sl[0], z: sl[1], y: sl[2], hm }); };
      if (own && owner) add(owner, own, SLd[0], true);
      guests.forEach((p, k) => { const a = seatAvatars[p.key]; if (a && slots[k]) add(a, p, slots[k], false); });
      // 前の人から順に、全員(大将も)の顔が 見えるように並べる。
      // うしろの人が前の人に かくれるときは、まず横の あいている所へ少し ずれる。それでも かくれるときだけ 上げる
      const camY = photo.cam.y, camZ = photo.cam.z;
      const needY = (e, x) => {   // その横の位置で、顔が見えるのに必要な高さ。頭は丸いので、下の2人の頭の間の V字の すき間に あごが入ってよい
        let y = e.y0;
        E.forEach((f) => {
          if (f === e || !f.done || f.z <= e.z + 0.05) return;
          const o = Math.abs(f.x - x) - 0.11;   // 顔のはし(顔はば約0.26m)から 前の人の頭の まん中まで
          if (o >= f.hm.hw * 0.92) return;
          const topF = f.y + f.hm.top * Math.sqrt(1 - Math.pow(Math.max(0, o) / (f.hm.hw * 0.92), 2));   // その位置での 前の人の頭の高さ
          const k = (f.z - e.z) / (camZ - e.z), need = (topF - camY * k) / (1 - k);   // カメラから見て かさならない あごの高さ
          y = Math.max(y, need - (e.hm.chin + (o > 0 ? 0.06 : 0)) + 0.01);   // 顔のはしは あごより少し上
        });
        return y;
      };
      const crowd = (e, x) => E.some((f) => f !== e && f.done && Math.abs(f.z - e.z) < 0.08 && Math.abs(f.x - x) < 0.3);   // 同じ列の となりと 顔が重なる
      E.forEach((e) => { e.y0 = e.y; e.done = false; });
      E.slice().sort((p, q) => q.z - p.z || Math.abs(p.x) - Math.abs(q.x)).forEach((e) => {
        let best = { x: e.x, y: needY(e, e.x), cost: 0 };
        if (best.y - e.y0 > 0.06) [-0.1, -0.05, 0.05, 0.1].forEach((dx) => {
          const x = e.x + dx; if (crowd(e, x)) return;
          const y = needY(e, x), cost = (y - e.y0) + Math.abs(dx) * 0.6;
          if (cost < best.cost + (best.y - e.y0)) best = { x, y, cost: Math.abs(dx) * 0.6 };
        });
        e.x = best.x; e.y = best.y; e.done = true;
      });
      E.forEach((e) => {
        const a = e.a, u = a.userData;
        a.position.set(e.x, e.y - u.headOff, e.z);
        a.rotation.y = Math.atan2(photo.cam.x - e.x, photo.cam.z - e.z);
        u.lookT = 0; u.lw = 0;
        u.photo = { pose: e.p.pose || 'normal', face: e.p.face || 'smile', owner: e.isOwner, selfie: duo && LY.duo.selfie, tilt: Math.max(-0.35, Math.min(0.35, e.x * ((duo && LY.duo.tilt) || LY.tilt || 0.4))), lean: Math.max(-0.25, Math.min(0.25, e.x * ((duo && LY.duo.lean) || LY.lean) * 2)) };   // 頭と体を まん中へ かたむける
      });
      window.__photoDbg = E.map((e) => ({ k: e.isOwner ? 'owner' : e.p.key, x: +e.x.toFixed(2), z: e.z, y: +e.y.toFixed(2), y0: e.y0, top: +e.hm.top.toFixed(2), chin: +e.hm.chin.toFixed(2), hw: +e.hm.hw.toFixed(2) }));   // 確認用
      const gs = E.filter((e) => !e.isOwner);
      photo.half = Math.max(0.45, ...E.map((e) => Math.abs(e.x) + LY.edge));   // 横のはしの人は 少し切れてもよい(自撮りらしく)
      photo.top = Math.max(...E.map((e) => e.y + e.hm.top)) + 0.12;
      photo.bot = (gs.length ? Math.min(...gs.map((e) => e.y)) : 1.3) - (duo ? LY.duo.under : gs.length >= 8 && LY.underMany ? LY.underMany : (LY.under || 0.45));   // 前の列は胸から上(人数が多いときは顔と首くらい)
      photo.look.y = (photo.top + photo.bot) / 2;
    },
    photoEnd() {
      if (!photo) return; photo = null;
      seatAvatars.forEach((a, i) => { if (!a) return; photoClear(a); a.position.set(seatX(i, N), STOOL_Y, GUEST_Z); a.rotation.y = Math.PI; });
      if (owner) { photoClear(owner); owner.position.set(ownerTargetX, 0.88, OWNER_Z); owner.rotation.y = 0; }
      api._hideMine();
    },
    get photoOn() { return !!photo; },
    /* いまの集合の絵を、写真の大きさ(正方形。顔の集まりは横に広いので、足が写らず顔が大きい)で1枚 写しとる。画面と同じ色の仕上げにするため、一瞬だけ大きく描く */
    capturePhoto(w, h) {
      if (!photo) return null;
      w = w || (photo.ly && photo.ly.w) || 1080; h = h || (photo.ly && photo.ly.h) || 1350;
      if (photo.ly && photo.ly.auto) {   // 横に広い集まりは 正方形〜横長に(縦長のままだと顔が小さくなる)。長い辺は1350
        const r = Math.max(0.8, Math.min(1.3, (2 * photo.half) / (photo.top - photo.bot)));
        if (r < 1) { h = 1350; w = Math.round(1350 * r); } else { w = 1350; h = Math.round(1350 / r); }
      }
      const pr = renderer.getPixelRatio(), sz = renderer.getSize(new THREE.Vector2()), cam = camera.clone();
      cam.clearViewOffset(); photoCam(cam, w / h);
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      renderer.render(scene, cam);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
      renderer.setPixelRatio(pr); renderer.setSize(sz.x, sz.y, false);
      renderer.render(scene, camera);
      return c;
    },
    photoPoses: PHOTO_POSES, photoFaces: PHOTO_FACES, photoLayouts: PHOTO_LAYOUTS,
    /* seat の人が target の人のほうを secs 秒 向く(target は 席の番号か 'owner')。
       すでに だれかの方を向いているときは、いまの数秒が終わってから 次の人の方を向く(順番待ちは2つまで。古いものから消す)。
       コメントは いつでも送れるまま、アバターが2人の間で 首をふって迷わないようにする(ノブさん 2026-11-20) */
    lookAt(seat, target, secs) {
      const a = seat === 'owner' ? owner : seatAvatars[seat]; if (!a) return;
      const u = a.userData;
      if (u.lookT > 0.2 || (u.lookQ && u.lookQ.length)) {
        if (u.lookTo === target && u.lookT > 0) { u.lookT = Math.max(u.lookT, secs); return; }   // 同じ人に また話しかけられたら のばすだけ
        // 話しかけが集中したときだけ 2秒ずつ(待たせると会話が成り立たない。1秒は早すぎた。ノブさん 2026-11-20)
        u.lookT = Math.min(u.lookT, LOOK_BUSY);
        (u.lookQ = u.lookQ || []).push({ target, secs: LOOK_BUSY }); if (u.lookQ.length > 2) u.lookQ.shift();
        return;
      }
      lookStart(a, target, secs);
    },
    lookState(seat) { const a = seat === 'owner' ? owner : seatAvatars[seat]; return a ? { to: a.userData.lookTo, t: +(a.userData.lookT || 0).toFixed(2), wait: (a.userData.lookQ || []).map((q) => q.target) } : null; },   // 確認用
    /* 吹き出しを出す位置(画面の点) */
    anchors() { const r0 = canvas.getBoundingClientRect(), proj = (x, y, z) => { const v = tmp.set(x, y, z).clone().project(camera); return v.z > 1 || v.z < -1 ? null : { x: r0.left + (v.x + 1) / 2 * r0.width, y: r0.top + (1 - v.y) / 2 * r0.height }; };
      return { tables: seatAvatars.map((a, i) => (a ? proj(seatX(i, N), COUNTER_Y + 0.01, -0.3) : null)),   // その人のテーブルの手前のふち(大将の「出す」ボタンの高さ。料理にかからない。横は その人の頭に合わせる)
        seats: seatAvatars.map((a, i) => (a && a.visible ? headPos(a) : null)), owner: headPos(owner), empty: stools.map((s, i) => { tmp.set(seatX(i, N), STOOL_Y + 0.25, GUEST_Z); const v = tmp.clone().project(camera); if (v.z > 1) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }) }; },
    get name() { return SHOPNAME; },
    /* 店の名前を その場で変える(ちょうちん・のれん・モニター)。バトンタッチのとき */
    setScores(list, title) { boardList = (list || []).slice(0, 3); boardTitle = title || ''; drawBoard(); },   // 本日の最高得点(上位3人)と 今日のゲームの名前
    setName(nm) {
      nm = nm || SHOP.NAME; if (nm === SHOPNAME) return;
      SHOPNAME = nm;
      const lc = lanternTex.image, lg = lc.getContext('2d'); lg.clearRect(0, 0, lc.width, lc.height); drawLantern(lg); lanternTex.needsUpdate = true;
      const nc = norenT.image, ng = nc.getContext('2d'); ng.clearRect(0, 0, nc.width, nc.height); drawNoren(ng); norenTexs.forEach((t) => { t.needsUpdate = true; });
      drawTV();
    },
    // モニターの画面の四すみ(左上・右上・右下・左下)。見えていなければ null
    monitorQuad() {   // 見えているモニターのうち、いちばん大きく見える1台。main=奥の壁の1台
      if (view.mode === 'owner') return null;   // 大将の目線は いつも左上の小窓
      const r = canvas.getBoundingClientRect();
      let best = null, bestA = 0;
      tvScreens.forEach((scr, idx) => {
        scr.updateWorldMatrix(true, false);
        const c = new THREE.Vector3(0, 0, 0.03), nrm = new THREE.Vector3(0, 0, 1);
        scr.localToWorld(c); nrm.transformDirection(scr.matrixWorld);
        if (nrm.dot(camera.position.clone().sub(c)) <= 0) return;   // うしろ向き
        const pts = [];
        for (const p of tvCorner) {
          const w = scr.localToWorld(p.clone());
          const v = w.clone().applyMatrix4(camera.matrixWorldInverse);
          if (v.z > -0.1) return;   // カメラのうしろ
          w.project(camera);
          pts.push({ x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height });
        }
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const a = Math.max(0, Math.min(Math.max(...xs), r.right) - Math.max(Math.min(...xs), r.left)) * Math.max(0, Math.min(Math.max(...ys), r.bottom) - Math.max(Math.min(...ys), r.top));
        if (a > bestA) { bestA = a; best = pts; best.main = idx === 0; }
      });
      return best;
    },
    setPerf(o) {
      if (o.fps) perf.fps = o.fps;
      if (o.ratio && o.ratio !== perf.ratio) { perf.ratio = o.ratio; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.ratio)); resize(); }
      if ('rest' in o) perf.rest = !!o.rest;
    },
    setMonitorShape(tall) { tvWant = tall ? TV_TALL : TV_WIDE; },
    monitorTall() { return tvWant === TV_TALL; },
    setMonitor(info) { const t = info.title || '', u = info.sub || '', pl = !!info.playing; if (t === tvInfo.title && u === tvInfo.sub && pl === tvInfo.playing) return; tvInfo = { title: t, sub: u, playing: pl }; drawTV(); },
    // 大将の頭の形(画面の上の輪郭)。モニターの動画を頭の形に切りぬいて、頭が手前に見えるようにする
    ownerHeadHull() {
      if (!owner || !owner.visible || !ownerHeadPts) return null;
      const hd = owner.userData.head; hd.updateWorldMatrix(true, false);
      const r = canvas.getBoundingClientRect(), pts = [], v = new THREE.Vector3();
      for (const p of ownerHeadPts) {
        v.copy(p).applyMatrix4(hd.matrixWorld).project(camera);
        if (v.z > 1) return null;
        pts.push([r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]);
      }
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      up.pop(); lo.pop();
      return lo.concat(up).map((p) => ({ x: p[0], y: p[1] }));
    },
    stop() { running = false; api.onAvatarTap = api.onTableTap = api.onMonitorTap = api.onTap = api.onItemTap = api.onTagTap = api.onFrame = null; window.removeEventListener('resize', resize); renderer.dispose(); }
  };
  return api;
}

/* =====================================================================
   着せかえの見本(アバターを作る画面)
   ===================================================================== */
function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1dc', '#5a3a22', 1.6));
  const d = new THREE.DirectionalLight('#ffd6a0', 1.6); d.position.set(1, 2, 2); scene.add(d);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(0, 0.55, 2.3); camera.lookAt(0, 0.42, 0);
  const stool = new THREE.Group();
  stool.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 22), mat('#7a2a1e'), 0, -0.035, 0));
  stool.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), mat('#2a2a2a'), 0, -0.3, 0));
  scene.add(stool);
  let av = null, rotY = 0.35, drag = null;
  canvas.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });   // 指で押したあとの「おまけのクリック」が、開いたばかりの画面に当たって閉じてしまうのを防ぐ
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, r: rotY }; });
  window.addEventListener('pointermove', (e) => { if (drag) rotY = drag.r + (e.clientX - drag.x) * 0.01; });
  window.addEventListener('pointerup', () => { drag = null; });
  let zoom = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  let running = true; const clock = makeClock();
  function frame() {
    if (!running) return; requestAnimationFrame(frame);
    resize();
    const dt = Math.min(clock.getDelta(), 0.1);
    if (av) { animateAvatar(av, dt); av.rotation.y = rotY; }
    const cz = zoom ? 1.15 : 2.3, cy = zoom ? 0.72 : 0.55, ly = zoom ? 0.68 : 0.42;
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 6);
    camera.lookAt(0, ly + (camera.position.z - cz) * 0, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return {
    setAvatar(a) { if (av) { scene.remove(av); disposeAvatar(av); } av = null; if (!a) return; av = buildAvatar(a); scene.add(av); },
    setZoom(z) { zoom = z ? 1 : 0; },
    cheer() { if (av) av.userData.cheer = 2.2; },
    stop() { running = false; }
  };
}

/* =====================================================================
   顔写真(おしゃべり画面のカード用。2026-11-22 ノブさん)
   アバターを 1回だけ 立体で作って 写真にし、すぐ片づける。仮装(かぶりもの)も そのまま写る。
   小さな絵の板を1枚だけ使い回す(スマホの負担を ふやさない)
   ===================================================================== */
let ptR = null, ptS = null, ptC = null;
function portrait(raw, size) {
  size = size || 256;
  if (!ptR) {
    ptR = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
    ptR.outputColorSpace = THREE.SRGBColorSpace; ptR.setPixelRatio(1);
    ptS = new THREE.Scene();
    ptS.add(new THREE.HemisphereLight('#fff1dc', '#5a3a22', 1.6));
    const d = new THREE.DirectionalLight('#ffe0b0', 1.7); d.position.set(1, 2, 2.5); ptS.add(d);
    ptC = new THREE.PerspectiveCamera(14, 1, 0.05, 20);
  }
  ptR.setSize(size, size, false);
  try { if (ptR.getContext().isContextLost()) return ''; } catch (e) {}   // 3D の係が 落ちているときは 透明の絵を 返さない(11-22)
  const av = buildAvatar(raw, { standing: true }); av.rotation.y = -0.18; ptS.add(av);
  const hat = !!(raw && raw.costume && String(raw.costume).split('|')[0]);   // かぶりものが あるときは 少し引いて 上まで入れる
  const ly = hat ? 0.8 : 0.72, dist = hat ? 3.1 : 2.55;
  ptC.position.set(0, ly + 0.12, dist); ptC.lookAt(0, ly, 0);
  let url = '';
  try { ptR.render(ptS, ptC); url = ptR.domElement.toDataURL('image/png'); } catch (e) {}
  ptS.remove(av); disposeAvatar(av);
  return url;
}

window.IZ3D = { createShop, createPreview, buildItem, buildAvatar, portrait, THREE, HAT_STATS };   // buildItem と THREE は 確認用のページ(tools/menu-gallery.html)で使う
window.dispatchEvent(new Event('iz3d-ready'));
