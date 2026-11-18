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
    g.strokeStyle = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor) === '#e8e0d0' ? '#9a9088' : ink;
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
    const eyeC = AVATAR.color(AVATAR.EYE_COLOR, a.eyeColor);
    g.fillStyle = eyeC; g.strokeStyle = ink;
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
      if (a.eyes === 0 || a.eyes === 3 || a.eyes === 4) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, EY - 4, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = eyeC; }
    });
    // ほっぺ
    if (a.acc === 6) { g.fillStyle = 'rgba(240,110,110,0.45)'; [[64, 164], [192, 164]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 17, 10, 0, 0, Math.PI * 2); g.fill(); }); }
    // ひげ(口より先にかく)
    const hc = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
    if (a.beard === 1) { g.fillStyle = hc; g.beginPath(); g.moveTo(92, 190); g.quadraticCurveTo(128, 260, 164, 190); g.quadraticCurveTo(128, 214, 92, 190); g.fill(); }
    if (a.beard === 2) { g.fillStyle = hc; g.beginPath(); g.moveTo(100, 180); g.quadraticCurveTo(128, 162, 156, 180); g.quadraticCurveTo(128, 174, 100, 180); g.fill(); }
    if (a.beard === 3) { g.fillStyle = 'rgba(40,30,30,0.35)'; for (let k = 0; k < 140; k++) { const t = Math.random() * Math.PI, r = 44 + Math.random() * 22; g.fillRect(128 + Math.cos(t) * r * 0.9, 160 + Math.sin(t) * r * 0.7, 2, 2); } }
    // 鼻
    g.fillStyle = 'rgba(120,60,40,0.45)'; g.strokeStyle = 'rgba(120,60,40,0.55)'; g.lineWidth = 3.5;
    if (a.nose === 1) { g.beginPath(); g.arc(128, 160, 3.5, 0, Math.PI * 2); g.fill(); }
    if (a.nose === 2) { g.beginPath(); g.arc(128, 156, 8, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); }
    if (a.nose === 3) { g.beginPath(); g.moveTo(130, 136); g.lineTo(124, 162); g.lineTo(134, 163); g.stroke(); }
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
  const skin = mat(AVATAR.color(AVATAR.SKIN, a.skin));
  const hairM = mat(AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor));
  const clothC = AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor);
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
  const skull = mesh(new THREE.SphereGeometry(R, 28, 20), skin); head.add(skull);
  const FACE = [[1, 1, 1], [0.95, 1.1, 0.97], [1.1, 0.93, 1.02], [0.9, 1.12, 0.95]][a.face] || [1, 1, 1];
  head.scale.set(FACE[0], FACE[1], FACE[2]);
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
    case 1: { const m = cap(R * 1.015, 1.55, -0.15); m.material = mat(AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor), { transparent: true, opacity: 0.55 }); head.add(m); break; }
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
      const n = big ? 46 : 16;
      for (let k = 0; k < n; k++) {
        let x, y, z, rx, rz;
        if (!big) { x = (rnd(k) - 0.5) * 0.08; y = 0.024 + (k % 3) * 0.006; z = (rnd(k + 30) - 0.5) * 0.08; rx = Math.PI / 2; rz = rnd(k + 60) * 3; }
        else {   // 上にこんもり。量は同じくらいでも、たてに積んで山にする
          const lvl = k / n, ang = k * 2.39, rad = 0.045 * (1 - lvl * 0.9);
          x = Math.cos(ang) * rad; z = Math.sin(ang) * rad; y = 0.03 + lvl * 0.11; rx = 0.4 * Math.cos(ang); rz = 0.4 * Math.sin(ang);
        }
        const f = box(0.008, 0.06, 0.008, k % 4 ? '#f2c24a' : '#e8a83a', x, y, z); f.rotation.set(rx, 0, rz); food.add(f);
      }
      if (big) food.add(box(0.003, 0.05, 0.002, '#8a6a4a', 0, 0.17, 0));
      if (big) food.add(box(0.025, 0.016, 0.001, '#c8261c', 0.013, 0.188, 0));   // 小さな旗
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
  // 壁に入る数だけ(名物が先、つぎに料理、飲み物はあと)
  const tagFit = Math.floor((L - 0.4) / 0.2);
  const items = SHOP.MENU.filter((m) => m.pun).concat(SHOP.MENU.filter((m) => !m.pun && m.kind !== 'drink'), SHOP.MENU.filter((m) => m.kind === 'drink')).slice(0, tagFit);
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
  let itemHitList = [], bumpKey = '', bumpAt = 0;
  const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

  // カメラ
  const view = { mode: 'overview', seat: -1, yaw: 0, pitch: 0 };
  const camPos = new THREE.Vector3(0, 2.4, 4.4), camLook = new THREE.Vector3(0, 1.1, -0.5);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  /* カメラの置き場所。縦向き(スマホを立てて持つ)は横に7人が入らないので、カウンターの端から斜めに見る。
     横向きは正面から、7人全員が入る広さに自動で合わせる */
  let wantFov = 60;
  function fitFov(dist) {   // カウンターの端から端までが横に入る広さ
    const half = L / 2 - 0.15;
    const h = 2 * Math.atan(half / dist);
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / camera.aspect)), 42, 78);
  }
  function target() {
    const x = view.seat >= 0 ? seatX(view.seat, N) : 0;
    const portrait = camera.aspect < 1;
    wantFov = portrait ? 70 : 55;
    switch (view.mode) {
      case 'first': wantPos.set(x, 1.5, GUEST_Z + 0.22); wantLook.set(x + THREE.MathUtils.clamp((ownerTargetX - x) * 0.6, -1.0, 1.0), 1.08, -0.95); break;   // 向きすぎると となりの頭でふさがる
      case 'back': wantPos.set(x * 0.85, 2.3, GUEST_Z + 1.35); wantLook.set(x * 0.75, 1.0, -0.45); break;   // 頭ごしに 自分の料理が見える高さ
      case 'owner':
        if (portrait) { wantPos.set(-L / 2 - 0.1, 2.1, -1.25); wantLook.set(L * 0.12, 0.95, 1.45); wantFov = 64; }
        else { wantPos.set(0, 2.3, -1.85); wantLook.set(0, 1.2, 1.0); wantFov = fitFov(GUEST_Z + 1.85); }
        break;
      default:
        if (portrait) { wantPos.set(L / 2 + 0.75, 2.55, 2.75); wantLook.set(-L * 0.12, 1.0, -0.35); wantFov = 64; }
        else { wantPos.set(0, 2.6, 3.25); wantLook.set(0, 1.0, -0.8); wantFov = fitFov(3.25); }
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
      // 先に料理・飲み物(押すと食べる・飲む)、なければ いす
      const itemHits = ray.intersectObjects(itemHitList, false);
      if (itemHits.length && api.onItemTap) { const u = itemHits[0].object.userData; api.onItemTap(u.seat, u.key); drag = null; return; }
      const hits = ray.intersectObjects(stools.map((s) => s.hit));
      api.onTap(hits.length ? hits[0].object.userData.seat : -1);
    }
    drag = null;
  });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
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
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * k; camera.updateProjectionMatrix(); }
    seatAvatars.forEach((a) => a && animateAvatar(a, dt));
    // 押した料理が「ぽよん」とはねる
    const tnow = performance.now();
    tableGroups.forEach((tg) => tg.children.forEach((m) => {
      const b = m.userData.bump; if (!b) return;
      const e = (tnow - b) / 450;
      if (e >= 1) { m.scale.setScalar(1); m.position.y = 0; m.userData.bump = 0; return; }
      const k2 = Math.sin(e * Math.PI);
      m.scale.set(1 + k2 * 0.18, 1 - k2 * 0.12 + Math.sin(e * Math.PI * 2) * 0.05, 1 + k2 * 0.18); m.position.y = k2 * 0.03;
    }));
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
    onTap: null, onFrame: null, onItemTap: null,
    /* 確認用: 料理の画面上の位置 */
    itemPos(key) { const h = itemHitList.find((x) => x.userData.key === key); if (!h) return null; const v = new THREE.Vector3(); h.getWorldPosition(v); v.y += 0.02; v.project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
    /* 押した料理を はねさせる(作りなおしたあとでも はねるように 覚えておく) */
    bump(key) { bumpKey = key; bumpAt = performance.now(); tableGroups.forEach((tg) => tg.children.forEach((m) => { if (m.userData.key === key) m.userData.bump = bumpAt; })); },
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

window.IZ3D = { createShop, createPreview, buildItem, THREE };   // buildItem と THREE は 確認用のページ(tools/menu-gallery.html)で使う
window.dispatchEvent(new Event('iz3d-ready'));
