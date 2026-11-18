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
   アバターを組み立てる
   ===================================================================== */
function faceTexture(a) {
  return canvasTex(256, 256, (g) => {
    const ink = '#241712';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const EY = 128, LX = 90, RX = 166;
    // 眉
    g.strokeStyle = AVATAR.HAIR_COLOR[a.hairColor] === '#e8e0d0' ? '#9a9088' : ink;
    const bw = [5, 9, 5, 6, 0][a.brows];
    if (bw) {
      g.lineWidth = bw;
      [[LX, -1], [RX, 1]].forEach(([x, s]) => {
        g.beginPath();
        if (a.brows === 2) { g.moveTo(x - 16 * s, EY - 30); g.lineTo(x + 14 * s, EY - 38); }        // こまり
        else if (a.brows === 3) { g.moveTo(x - 16 * s, EY - 40); g.lineTo(x + 14 * s, EY - 30); }   // きりっ
        else { g.moveTo(x - 16, EY - 34); g.quadraticCurveTo(x, EY - 42, x + 16, EY - 34); }
        g.stroke();
      });
    }
    // 目
    g.fillStyle = ink; g.strokeStyle = ink;
    [LX, RX].forEach((x, idx) => {
      const s = idx ? 1 : -1;
      switch (a.eyes) {
        case 1: g.lineWidth = 6; g.beginPath(); g.arc(x, EY + 6, 12, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); break;
        case 2: g.beginPath(); g.ellipse(x, EY, 10, 7, 0, 0, Math.PI * 2); g.fill();
          g.lineWidth = 4; g.beginPath(); g.moveTo(x - 14 * s, EY - 10); g.lineTo(x + 13 * s, EY - 5); g.stroke(); break;
        case 3: g.beginPath(); g.arc(x, EY, 10, 0, Math.PI * 2); g.fill();
          g.lineWidth = 4; g.beginPath(); g.moveTo(x - 14 * s, EY - 8); g.lineTo(x + 14 * s, EY - 14); g.stroke(); break;
        case 4: g.beginPath(); g.ellipse(x, EY, 12, 15, 0, 0, Math.PI * 2); g.fill();
          g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + (k - 1) * 7, EY - 14); g.lineTo(x + (k - 1) * 10 + 4 * s, EY - 22); g.stroke(); } break;
        case 5: g.lineWidth = 5; g.beginPath(); g.moveTo(x - 11, EY); g.lineTo(x + 11, EY); g.stroke(); break;
        default: g.beginPath(); g.arc(x, EY, 11, 0, Math.PI * 2); g.fill();
      }
      if (a.eyes === 0 || a.eyes === 3 || a.eyes === 4) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, EY - 4, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; }
    });
    // ほっぺ
    if (a.acc === 6) { g.fillStyle = 'rgba(240,110,110,0.45)'; [[64, 164], [192, 164]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 17, 10, 0, 0, Math.PI * 2); g.fill(); }); }
    // ひげ(口より先にかく)
    const hc = AVATAR.HAIR_COLOR[a.hairColor];
    if (a.beard === 1) { g.fillStyle = hc; g.beginPath(); g.moveTo(92, 190); g.quadraticCurveTo(128, 260, 164, 190); g.quadraticCurveTo(128, 214, 92, 190); g.fill(); }
    if (a.beard === 2) { g.fillStyle = hc; g.beginPath(); g.moveTo(100, 180); g.quadraticCurveTo(128, 162, 156, 180); g.quadraticCurveTo(128, 174, 100, 180); g.fill(); }
    if (a.beard === 3) { g.fillStyle = 'rgba(40,30,30,0.35)'; for (let k = 0; k < 140; k++) { const t = Math.random() * Math.PI, r = 44 + Math.random() * 22; g.fillRect(128 + Math.cos(t) * r * 0.9, 160 + Math.sin(t) * r * 0.7, 2, 2); } }
    // 口
    g.strokeStyle = '#5a2a20'; g.fillStyle = '#7a2a24'; g.lineWidth = 5;
    const MY = 188;
    switch (a.mouth) {
      case 1: g.beginPath(); g.moveTo(116, MY); g.lineTo(140, MY); g.stroke(); break;
      case 2: g.beginPath(); g.moveTo(106, MY - 6); g.quadraticCurveTo(128, MY + 30, 150, MY - 6); g.closePath(); g.fill();
        g.fillStyle = '#e66'; g.beginPath(); g.ellipse(128, MY + 9, 9, 5, 0, 0, Math.PI * 2); g.fill(); break;
      case 3: g.beginPath(); g.moveTo(112, MY + 6); g.quadraticCurveTo(128, MY - 8, 144, MY + 6); g.stroke(); break;
      case 4: g.beginPath(); g.ellipse(128, MY + 2, 8, 10, 0, 0, Math.PI * 2); g.fill(); break;
      default: g.beginPath(); g.moveTo(110, MY - 4); g.quadraticCurveTo(128, MY + 14, 146, MY - 4); g.stroke();
    }
  });
}

function buildAvatar(raw, opt = {}) {
  const a = AVATAR.fix(raw);
  const skin = mat(AVATAR.SKIN[a.skin]);
  const hairM = mat(AVATAR.HAIR_COLOR[a.hairColor]);
  const clothC = AVATAR.CLOTH_COLOR[a.topColor];
  const cloth = mat(clothC);
  const white = mat('#f3efe6');
  const dark = mat('#1d1a18');
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const R = 0.165;

  // 胴
  const torsoY = 0.27;
  const torso = mesh(new THREE.CylinderGeometry(0.13, 0.165, 0.42, 18), cloth, 0, torsoY, 0);
  body.add(torso);
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin, 0, 0.5, 0); body.add(neck);
  // 服のちがい
  switch (a.top) {
    case 1: { // 法被: えりの帯
      const band = mat(clothC === '#e8e3d8' ? '#8a1f24' : '#f3efe6');
      [-1, 1].forEach((s) => { const b = mesh(new THREE.BoxGeometry(0.035, 0.44, 0.02), band, 0.05 * s, torsoY, 0.148); b.rotation.z = 0.32 * s; body.add(b); });
      const obi = mesh(new THREE.CylinderGeometry(0.162, 0.165, 0.05, 18), mat('#3a2a1a'), 0, 0.1, 0); body.add(obi);
      break; }
    case 2: { // 作務衣: 打ち合わせ
      const b = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.02), mat('#000000', { transparent: true, opacity: 0.25 }), 0.02, torsoY + 0.06, 0.15); b.rotation.z = -0.5; body.add(b);
      break; }
    case 3: { // ジャケット: シャツとネクタイ
      const sh = mesh(new THREE.ConeGeometry(0.06, 0.22, 3), white, 0, 0.38, 0.13); sh.rotation.x = Math.PI; sh.scale.z = 0.3; body.add(sh);
      const tie = mesh(new THREE.BoxGeometry(0.025, 0.18, 0.012), mat('#8a1f24'), 0, 0.36, 0.15); body.add(tie);
      break; }
    case 4: { // パーカー: フード
      const hood = mesh(new THREE.TorusGeometry(0.09, 0.04, 8, 16), cloth, 0, 0.47, -0.06); hood.rotation.x = Math.PI / 2.4; body.add(hood);
      break; }
    case 5: { // 着物: 白い半えり
      [-1, 1].forEach((s) => { const b = mesh(new THREE.BoxGeometry(0.03, 0.26, 0.015), white, 0.035 * s, 0.38, 0.135); b.rotation.z = 0.5 * s; body.add(b); });
      const obi = mesh(new THREE.CylinderGeometry(0.163, 0.166, 0.08, 18), mat('#c9a24a'), 0, 0.12, 0); body.add(obi);
      break; }
    case 6: { // エプロン
      const ap = mesh(new THREE.BoxGeometry(0.2, 0.32, 0.015), mat('#f1ead8'), 0, 0.2, 0.158); body.add(ap);
      break; }
    default: break;
  }
  // 腕(右手は乾杯で上がる)
  const arms = [];
  [-1, 1].forEach((s) => {
    const sh = new THREE.Group(); sh.position.set(0.17 * s, 0.43, 0);
    const up = mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), cloth, 0, -0.12, 0); sh.add(up);
    const hand = mesh(new THREE.SphereGeometry(0.045, 12, 10), skin, 0, -0.26, 0); sh.add(hand);
    sh.rotation.x = -0.75; sh.rotation.z = 0.12 * s;
    body.add(sh); arms.push(sh);
  });
  // 乾杯のジョッキ(右手)
  const cheerMug = new THREE.Group();
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 12), mat('#f2b51c', { transparent: true, opacity: 0.92 }), 0, 0, 0));
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), white, 0, 0.065, 0));
  cheerMug.position.set(0, -0.31, 0.03); cheerMug.visible = false; arms[1].add(cheerMug);

  // 足(座っている形。立っているときは作らない)
  if (!opt.standing) {
    const pants = mat(a.top === 5 ? clothC : '#2a2a34');
    [-1, 1].forEach((s) => {
      const th = mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 10), pants, 0.075 * s, 0.03, 0.15); th.rotation.x = Math.PI / 2; body.add(th);
      const sn = mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 10), pants, 0.075 * s, -0.2, 0.32); body.add(sn);
      const ft = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.14), dark, 0.075 * s, -0.4, 0.36); body.add(ft);
    });
  }

  // 頭
  const head = new THREE.Group(); head.position.set(0, 0.69, 0); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(R, 28, 20), skin));
  [-1, 1].forEach((s) => head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), skin, R * 0.98 * s, -0.01, 0)));
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.006, 24, 18, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6),
    new THREE.MeshLambertMaterial({ map: faceTexture(a), transparent: true, depthWrite: false })
  );
  head.add(face);
  // 髪
  const cap = (r, thetaLen, tilt = -0.25) => { const m = mesh(new THREE.SphereGeometry(r, 26, 16, 0, Math.PI * 2, 0, thetaLen), hairM); m.rotation.x = tilt; return m; };
  const backHalf = (r, thetaLen) => mesh(new THREE.SphereGeometry(r, 26, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, thetaLen), hairM);
  switch (a.hair) {
    case 0: head.add(cap(R * 1.06, 1.25)); break;
    case 1: { const m = cap(R * 1.015, 1.55, -0.15); m.material = mat(AVATAR.HAIR_COLOR[a.hairColor], { transparent: true, opacity: 0.55 }); head.add(m); break; }
    case 2: head.add(cap(R * 1.08, 1.45, -0.18)); head.add(backHalf(R * 1.07, 1.9)); break;
    case 3: head.add(cap(R * 1.05, 1.3)); for (let k = 0; k < 9; k++) { const c = mesh(new THREE.ConeGeometry(0.035, 0.11, 6), hairM); const t = (k / 9) * Math.PI * 2; c.position.set(Math.cos(t) * 0.09, 0.14, Math.sin(t) * 0.09 - 0.02); c.lookAt(Math.cos(t) * 0.4, 0.5, Math.sin(t) * 0.4); c.rotateX(Math.PI / 2); head.add(c); } break;
    case 4: head.add(cap(R * 1.1, 1.3, -0.1)); head.add(backHalf(R * 1.12, 2.15)); break;
    case 5: { head.add(cap(R * 1.1, 1.3, -0.1)); head.add(backHalf(R * 1.12, 2.2)); const l = mesh(new THREE.BoxGeometry(0.3, 0.34, 0.08), hairM, 0, -0.2, -0.12); head.add(l); break; }
    case 6: head.add(cap(R * 1.07, 1.4, -0.2)); head.add(backHalf(R * 1.06, 1.8)); head.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), hairM, 0, 0.17, -0.06)); break;
    case 7: { head.add(cap(R * 1.07, 1.4, -0.2)); head.add(backHalf(R * 1.06, 1.8)); const p = mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), hairM, 0, -0.04, -0.2); p.rotation.x = 0.4; head.add(p); break; }
    case 8: head.add(cap(R * 1.05, 1.35, -0.45)); head.add(backHalf(R * 1.05, 1.9)); break;
    default: break;
  }
  // 小物
  switch (a.acc) {
    case 1: { const t = mesh(new THREE.TorusGeometry(R * 1.04, 0.018, 8, 32), white, 0, 0.06, 0); t.rotation.x = Math.PI / 2 + 0.12; head.add(t);
      const knot = mesh(new THREE.SphereGeometry(0.03, 8, 6), white, 0, 0.05, -R * 1.02); head.add(knot); break; }
    case 2: case 3: {
      const fm = a.acc === 3 ? dark : mat('#2a2220');
      [-1, 1].forEach((s) => {
        if (a.acc === 2) { const r = mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 18), fm, 0.06 * s, 0.0, R * 0.98); head.add(r); }
        else { const r = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16), mat('#111', { transparent: true, opacity: 0.85 }), 0.06 * s, 0.0, R * 0.99); r.rotation.x = Math.PI / 2; head.add(r); }
      });
      head.add(mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), fm, 0, 0.01, R * 1.0));
      break; }
    case 4: { const crown = mesh(new THREE.SphereGeometry(R * 1.1, 22, 12, 0, Math.PI * 2, 0, 1.3), cloth); crown.rotation.x = -0.1; head.add(crown);
      const visor = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), cloth, 0, 0.08, R * 0.75); visor.rotation.x = 0.08; head.add(visor); break; }
    case 5: { const tn = mesh(new THREE.SphereGeometry(R * 1.11, 22, 12, 0, Math.PI * 2, 0, 1.05), mat('#3c5bb8')); tn.rotation.x = -0.25; head.add(tn); break; }
    default: break;
  }
  root.scale.setScalar(a.size);
  root.userData = { body, head, arms, cheerMug, torso, t: Math.random() * 10, cheer: 0, talk: 0 };
  return root;
}

function animateAvatar(av, dt) {
  const u = av.userData; u.t += dt;
  u.cheer = Math.max(0, u.cheer - dt); u.talk = Math.max(0, u.talk - dt);
  const breath = Math.sin(u.t * 2.1) * 0.008;
  u.body.position.y = breath;
  let hx = Math.sin(u.t * 0.7) * 0.04, hy = Math.sin(u.t * 0.43) * 0.12;
  if (u.talk > 0) hx += Math.sin(u.t * 14) * 0.06;
  u.head.rotation.set(hx, hy, Math.sin(u.t * 0.5) * 0.03);
  const k = u.cheer > 0 ? Math.min(1, u.cheer * 3, (2.2 - u.cheer) * 4) : 0;
  u.arms[1].rotation.x = -0.75 - k * 2.0;
  u.arms[1].rotation.z = -0.12 - k * 0.15;
  u.cheerMug.visible = k > 0.2;
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
function plate(r = 0.11, color = '#f5f1e8') { return mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.018, 24), mat(color), 0, 0.009, 0); }
function buildItem(item) {
  const g = new THREE.Group();
  const glassM = mat('#ddeeff', { transparent: true, opacity: 0.28 });
  const liquid = (c) => mat(c || '#f2b51c', { transparent: true, opacity: 0.9 });
  switch (item.model) {
    case 'mug': {
      g.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 16), glassM, 0, 0.07, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.11, 16), liquid(item.color), 0, 0.058, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.03, 16), mat('#fbf7ec'), 0, 0.125, 0));
      const h = mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 14, Math.PI), glassM, 0.05, 0.07, 0); h.rotation.z = -Math.PI / 2; g.add(h);
      break; }
    case 'glass':
      g.add(mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.15, 16), glassM, 0, 0.075, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.034, 0.031, 0.11, 16), liquid(item.color), 0, 0.058, 0));
      for (let k = 0; k < 3; k++) g.add(mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), mat('#ffffff', { transparent: true, opacity: 0.6 }), (k - 1) * 0.012, 0.1 + k * 0.01, (k % 2) * 0.01));
      break;
    case 'tokkuri': {
      const pts = [[0, 0], [0.035, 0], [0.045, 0.04], [0.04, 0.09], [0.018, 0.13], [0.016, 0.16], [0.022, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
      g.add(mesh(new THREE.LatheGeometry(pts, 18), mat(item.color || '#f4f0e6')));
      const cup = mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.03, 14), mat('#f4f0e6'), 0.08, 0.015, 0.03); g.add(cup);
      break; }
    case 'cup':
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 16), mat(item.color || '#6f8f6a'), 0, 0.04, 0));
      break;
    case 'yakitori':
      g.add(plate(0.1));
      for (let s = 0; s < 2; s++) {
        const sk = new THREE.Group();
        sk.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 5), mat('#d8c39a'), 0, 0, 0));
        for (let k = 0; k < 4; k++) sk.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), mat(k % 2 ? '#8a4a22' : '#6e3818'), 0, -0.05 + k * 0.032, 0));
        sk.rotation.z = Math.PI / 2; sk.rotation.y = 0.25 - s * 0.5; sk.position.set(0, 0.03, -0.025 + s * 0.05); g.add(sk);
      }
      break;
    case 'sashimi': {
      const p = mesh(new THREE.BoxGeometry(0.22, 0.016, 0.13), mat('#2a2a2a'), 0, 0.008, 0); g.add(p);
      g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('#f2f2ee'), -0.07, 0.03, 0));
      for (let k = 0; k < 4; k++) { const s = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.07), mat(k < 2 ? '#e8746a' : '#f0a37a'), -0.02 + k * 0.03, 0.026, 0); s.rotation.z = 0.35; g.add(s); }
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.004, 0.05), mat('#4f9a3a'), 0.085, 0.02, 0.02));
      break; }
    case 'oden':
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.04, 20), mat('#3a2a20'), 0, 0.02, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.005, 20), mat('#c9933f', { transparent: true, opacity: 0.85 }), 0, 0.035, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 14), mat('#e9d9a8'), -0.035, 0.045, 0));
      { const egg = mesh(new THREE.SphereGeometry(0.022, 12, 10), mat('#c58e48'), 0.03, 0.05, 0.02); egg.scale.y = 1.3; g.add(egg); }
      { const kon = mesh(new THREE.ConeGeometry(0.03, 0.012, 3), mat('#5b5550'), 0.02, 0.045, -0.035); g.add(kon); }
      break;
    case 'edamame':
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.035, 18), mat('#e9e2d2'), 0, 0.017, 0));
      for (let k = 0; k < 9; k++) { const e = mesh(new THREE.CapsuleGeometry(0.009, 0.03, 3, 6), mat('#6ea83c'), (Math.random() - 0.5) * 0.08, 0.04, (Math.random() - 0.5) * 0.08); e.rotation.set(Math.PI / 2, 0, Math.random() * 3); g.add(e); }
      break;
    case 'karaage':
      g.add(plate(0.1));
      for (let k = 0; k < 5; k++) { const c = mesh(new THREE.DodecahedronGeometry(0.024, 0), mat('#b5682a'), Math.cos(k * 1.3) * 0.04, 0.035, Math.sin(k * 1.3) * 0.04); c.rotation.set(k, k * 2, 0); g.add(c); }
      { const l = mesh(new THREE.SphereGeometry(0.02, 8, 6, 0, Math.PI), mat('#f3e04a'), 0.06, 0.03, 0.04); g.add(l); }
      break;
    default: {
      g.add(plate(0.09));
      const s = emojiSprite(item.emoji || '🍽️', 0.13); s.position.set(0, 0.07, 0); g.add(s);
    }
  }
  return g;
}
const SLOTS = [[0.2, 0.12], [-0.05, 0.08], [0.06, -0.12], [-0.2, -0.05], [0.22, -0.14], [-0.22, 0.14], [0.0, -0.02], [-0.12, -0.16]];

/* =====================================================================
   お店
   ===================================================================== */
function createShop(canvas, opts) {
  const N = opts.seats;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  for (let r = 0; r < 2; r++) {
    scene.add(mesh(new THREE.BoxGeometry(L - 0.4, 0.04, 0.3), mat('#6b4728'), 0, 1.45 + r * 0.45, -1.95));
    for (let k = 0; k < Math.floor(L * 4); k++) {
      const x = -L / 2 + 0.4 + k * 0.26 + (r ? 0.12 : 0);
      if (x > L / 2 - 0.4) break;
      const tall = 0.22 + ((k * 7 + r * 3) % 5) * 0.03;
      const color = ['#2d5a2d', '#6a2a1a', '#e8e0c8', '#1a2a4a', '#8a6a2a', '#3a3a3a'][(k + r * 2) % 6];
      const b = mesh(new THREE.CylinderGeometry(0.045, 0.05, tall, 10), mat(color), x, 1.47 + r * 0.45 + tall / 2, -1.92); scene.add(b);
      scene.add(mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.07, 8), mat(color), x, 1.47 + r * 0.45 + tall + 0.035, -1.92));
    }
  }
  // 品書き(壁の木札) — MENU から自動で作る
  const items = SHOP.MENU;
  const tagW = 0.17, tagH = 0.5;
  const tagsX0 = -((items.length - 1) * (tagW + 0.03)) / 2;
  items.forEach((it, i) => {
    const t = canvasTex(64, 200, (g) => {
      g.fillStyle = '#e8d3a6'; g.fillRect(0, 0, 64, 200);
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 196);
      g.fillStyle = '#2a1a10'; g.font = '30px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'top';
      const chars = Array.from(it.name).slice(0, 6);
      const sz = chars.length > 5 ? 26 : 30; g.font = sz + 'px ' + FONT_JP;
      chars.forEach((ch, k) => { if (ch === 'ー') { g.save(); g.translate(32, 14 + k * (sz + 2) + sz / 2); g.rotate(Math.PI / 2); g.fillText(ch, 0, -sz / 2); g.restore(); } else g.fillText(ch, 32, 12 + k * (sz + 2)); });
    });
    const tag = mesh(new THREE.PlaneGeometry(tagW, tagH), new THREE.MeshLambertMaterial({ map: t }), tagsX0 + i * (tagW + 0.03), 2.45, -2.08);
    scene.add(tag);
  });

  // ちょうちん
  const lanternTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c8261c'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    for (let y = 16; y < 256; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.fillStyle = '#1a0a06'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = Array.from(SHOP.NAME.replace(/^居酒屋\s*/, '') || '酒').slice(0, 3);
    const sz = chars.length === 1 ? 120 : chars.length === 2 ? 78 : 58;
    g.font = 'bold ' + sz + 'px ' + FONT_JP;
    [64, 192].forEach((cx) => chars.forEach((ch, k) => g.fillText(ch, cx, 128 + (k - (chars.length - 1) / 2) * sz * 1.02)));
  });
  const lanterns = [];
  const nl = Math.max(2, Math.round(L / 1.6));
  for (let k = 0; k < nl; k++) {
    const x = -L / 2 + (k + 0.5) * (L / nl);
    const lg = new THREE.Group(); lg.position.set(x, 2.58, -0.05);
    const body = mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshLambertMaterial({ map: lanternTex, emissive: '#ff5a2a', emissiveIntensity: 0.55, emissiveMap: lanternTex }));
    body.scale.y = 1.35; lg.add(body);
    lg.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), mat('#1a1a1a'), 0, 0.23, 0));
    lg.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), mat('#1a1a1a'), 0, -0.23, 0));
    lg.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), mat('#111'), 0, 0.5, 0));
    scene.add(lg); lanterns.push(lg);
  }
  // 入口ののれん(お客さんの後ろ)
  const norenT = canvasTex(512, 256, (g) => {
    g.fillStyle = '#1f2a4a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#f3efe6'; g.font = 'bold 120px ' + FONT_JP; g.textAlign = 'center'; g.textBaseline = 'middle';
    const nm = SHOP.NAME.replace(/^居酒屋\s*/, '') || SHOP.NAME;
    g.fillText(nm.slice(0, 4), 256, 140);
  });
  for (let k = 0; k < 3; k++) {
    const piece = mesh(new THREE.PlaneGeometry(0.42, 0.75), new THREE.MeshLambertMaterial({ map: norenT, side: THREE.DoubleSide }), -0.44 + k * 0.44, 2.15, 3.55);
    piece.material = piece.material.clone(); piece.material.map = norenT.clone(); piece.material.map.needsUpdate = true;
    piece.material.map.repeat.set(1 / 3, 1); piece.material.map.offset.set(k / 3, 0);
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
  let owner = null, ownerKey = '', ownerTargetX = 0;

  // カメラ
  const view = { mode: 'overview', seat: -1, yaw: 0, pitch: 0 };
  const camPos = new THREE.Vector3(0, 2.4, 4.4), camLook = new THREE.Vector3(0, 1.1, -0.5);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  function target() {
    const x = view.seat >= 0 ? seatX(view.seat, N) : 0;
    switch (view.mode) {
      case 'first': wantPos.set(x, 1.5, GUEST_Z + 0.22); wantLook.set(x + (ownerTargetX - x) * 0.6, 1.08, -0.95); break;
      case 'back': wantPos.set(x * 0.85, 1.95, GUEST_Z + 1.55); wantLook.set(x * 0.7, 1.15, -0.4); break;
      case 'owner': wantPos.set(0, 2.25, -1.6); wantLook.set(0, 0.95, 1.3); break;
      default: wantPos.set(0, 2.75, 3.15); wantLook.set(0, 1.0, -0.9);
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
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    const lim = view.mode === 'first' ? 1.1 : 0.6;
    view.yaw = THREE.MathUtils.clamp(drag.yaw - dx * 0.004, -lim, lim);
    view.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.003, -0.45, 0.35);
  });
  window.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved && api.onTap) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(stools.map((s) => s.hit));
      api.onTap(hits.length ? hits[0].object.userData.seat : -1);
    }
    drag = null;
  });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : 55;   // 縦長のスマホは少し広く見せる
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const clock = makeClock();
  const tmp = new THREE.Vector3();
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    target();
    const k = 1 - Math.pow(0.002, dt);
    camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    seatAvatars.forEach((a) => a && animateAvatar(a, dt));
    if (owner) { animateAvatar(owner, dt); owner.position.x += (ownerTargetX - owner.position.x) * Math.min(1, dt * 3); }
    lanterns.forEach((l, i) => { l.rotation.z = Math.sin(clock.elapsedTime * 0.8 + i) * 0.03; });
    renderer.render(scene, camera);
    if (api.onFrame) api.onFrame();
  }
  requestAnimationFrame(frame);

  function headPos(obj) {
    if (!obj) return null;
    obj.userData.head.getWorldPosition(tmp);
    tmp.y += 0.3 * obj.scale.y;
    const v = tmp.clone().project(camera);
    if (v.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, d: camera.position.distanceTo(tmp) };
  }

  const api = {
    onTap: null, onFrame: null,
    /* seats: [{ key, avatar } | null, ...]  key が変わったときだけ作りなおす */
    setSeats(list) {
      for (let i = 0; i < N; i++) {
        const s = list[i];
        const key = s ? s.key + JSON.stringify(s.avatar) : '';
        if (key === seatKeys[i]) continue;
        if (seatAvatars[i]) { scene.remove(seatAvatars[i]); seatAvatars[i] = null; }
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
      if (owner) { scene.remove(owner); owner = null; }
      if (avatar) {
        owner = buildAvatar(avatar, { standing: true });
        owner.position.set(ownerTargetX, 0.88, OWNER_Z);
        // 大将の下半身(カウンターの向こうなので前かけだけ)
        const apron = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 16), mat('#1f2a4a'), 0, -0.2, 0);
        owner.userData.body.add(apron);
        scene.add(owner);
        api._hideMine();
      }
    },
    ownerGoTo(seat) { ownerTargetX = seat >= 0 ? seatX(seat, N) : 0; },
    /* tables: [[menuId, ...], ...] */
    setTables(tables) {
      for (let i = 0; i < N; i++) {
        const list = (tables[i] || []).slice(-SLOTS.length);
        const key = list.join(',');
        if (key === tableKeys[i]) continue;
        tableKeys[i] = key;
        const g = tableGroups[i];
        while (g.children.length) g.remove(g.children[0]);
        list.forEach((id, k) => {
          const it = SHOP.MENU.find((m) => m.id === id) || { id, emoji: '🍽️', model: 'plate' };
          const m = buildItem(it); m.position.set(SLOTS[k][0] * 0.9, 0, SLOTS[k][1]); m.rotation.y = (k * 1.7) % 1 - 0.5; g.add(m);
        });
      }
    },
    setView(mode, seat) {
      if (mode !== view.mode) { view.yaw = 0; view.pitch = 0; }
      view.mode = mode; view.seat = seat; api._hideMine();
    },
    _hideMine() { seatAvatars.forEach((a, i) => { if (a) a.visible = !(view.mode === 'first' && i === view.seat); }); if (owner) owner.visible = view.mode !== 'owner'; },
    cheer(seat) { const a = seat === 'owner' ? owner : seatAvatars[seat]; if (a) a.userData.cheer = 2.2; },
    cheerAll() { seatAvatars.forEach((a) => a && (a.userData.cheer = 2.2)); if (owner) owner.userData.cheer = 2.2; },
    talk(seat) { const a = seat === 'owner' ? owner : seatAvatars[seat]; if (a) a.userData.talk = 1.6; },
    /* 吹き出しを出す位置(画面の点) */
    anchors() { return { seats: seatAvatars.map((a, i) => (a && a.visible ? headPos(a) : null)), owner: headPos(owner), empty: stools.map((s, i) => { tmp.set(seatX(i, N), STOOL_Y + 0.25, GUEST_Z); const v = tmp.clone().project(camera); if (v.z > 1) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }) }; },
    stop() { running = false; }
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
    setAvatar(a) { if (av) scene.remove(av); av = buildAvatar(a); scene.add(av); },
    setZoom(z) { zoom = z ? 1 : 0; },
    cheer() { if (av) av.userData.cheer = 2.2; },
    stop() { running = false; }
  };
}

window.IZ3D = { createShop, createPreview };
window.dispatchEvent(new Event('iz3d-ready'));
