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
   アバターを組み立てる(2代目・アニメ風)
   ・塗りは「トゥーン」(影を3段で塗る)+ ふちに細い線
   ・顔はキャンバスに描いて、頭の前に貼る。髪は毛の束を1本ずつ形にして並べる
   ===================================================================== */
const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const TOONS = {};
function toon(color, o) { const k = color + JSON.stringify(o || {}); return TOONS[k] || (TOONS[k] = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: GRAD }, o))); }
const LINE_M = new THREE.MeshBasicMaterial({ color: '#2a1810', side: THREE.BackSide });
function tm(geo, color, x = 0, y = 0, z = 0, line = 0) {   // トゥーンの部品。line に太さ(0.03 なら 3% 大きい黒で ふちどり)
  const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z);
  if (line) { const o = new THREE.Mesh(geo, LINE_M); o.scale.setScalar(1 + line); m.add(o); }
  return m;
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
function lighten(hex, f) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), f); return '#' + c.getHexString(); }

/* ---------- 顔(キャンバス 512×512 に描く) ---------- */
const FACE_CACHE = {};
function faceTexture(a) {
  const key = JSON.stringify([a.sex, a.eyes, a.eyeColor, a.brows, a.mouth, a.beard, a.lip, a.cheek, a.hairColor, a.skin]);
  if (FACE_CACHE[key]) return FACE_CACHE[key];
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
    // ひげ(男性)
    const bc = shade(hairC, 0.9);
    if (a.beard === 'stubble' || a.beard === 'full') {
      g.fillStyle = 'rgba(60,45,40,0.22)'; g.beginPath(); g.moveTo(150, 340); g.quadraticCurveTo(256, 470, 362, 340); g.quadraticCurveTo(256, 400, 150, 340); g.fill();
      g.fillStyle = 'rgba(40,30,28,0.35)'; for (let k = 0; k < 260; k++) { const tt = Math.random() * Math.PI, r = 70 + Math.random() * 40; g.fillRect(256 + Math.cos(tt) * r * 1.2, 330 + Math.sin(tt) * r * 0.75, 2, 2); }
    }
    if (a.beard === 'chin' || a.beard === 'full') { g.fillStyle = bc; g.beginPath(); g.moveTo(206, 392); g.quadraticCurveTo(256, 470, 306, 392); g.quadraticCurveTo(256, 418, 206, 392); g.fill(); }
    if (a.beard === 'mustache' || a.beard === 'full') { g.fillStyle = bc; g.beginPath(); g.moveTo(206, 356); g.quadraticCurveTo(232, 336, 256, 348); g.quadraticCurveTo(280, 336, 306, 356); g.quadraticCurveTo(256, 352, 206, 356); g.fill(); }
    // まゆ
    const browC = shade(hairC === '#e8e2d8' ? '#9a8a7a' : hairC, 0.85);
    g.strokeStyle = browC; g.fillStyle = browC;
    const bw = { thick: 11, natural: 7, straight: 8, up: 8, worry: 7, soft: 6, thin: 4 }[a.brows] || 7;
    g.lineWidth = bw;
    [[LX, -1], [RX, 1]].forEach(([x, s]) => {
      const by = EY - (F ? 92 : 80);
      g.beginPath();
      switch (a.brows) {
        case 'up': g.moveTo(x - 30 * s, by + 8); g.quadraticCurveTo(x, by - 8, x + 32 * s, by - 10); break;
        case 'worry': g.moveTo(x - 30 * s, by - 4); g.quadraticCurveTo(x, by - 4, x + 30 * s, by + 10); break;
        case 'straight': g.moveTo(x - 30 * s, by); g.lineTo(x + 30 * s, by - 2); break;
        case 'soft': g.moveTo(x - 28 * s, by + 4); g.quadraticCurveTo(x, by - 10, x + 28 * s, by + 2); break;
        default: g.moveTo(x - 32 * s, by + 4); g.quadraticCurveTo(x, by - 10, x + 32 * s, by);
      }
      g.stroke();
    });
    // 目
    [[LX, -1], [RX, 1]].forEach(([cx, s]) => drawEye(g, cx, EY, s, a, eyeC, ink));
    // 鼻
    g.strokeStyle = 'rgba(150,80,60,0.55)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(258, 308); g.lineTo(252, 322); g.stroke();
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
      case 'flat': g.beginPath(); g.moveTo(236, MY + 2); g.lineTo(276, MY + 2); g.stroke(); break;
      case 'cat': g.beginPath(); g.moveTo(226, MY - 6); g.quadraticCurveTo(241, MY + 12, 256, MY - 2); g.quadraticCurveTo(271, MY + 12, 286, MY - 6); g.stroke(); break;
      case 'soft': g.beginPath(); g.moveTo(232, MY); g.quadraticCurveTo(256, MY + 12, 280, MY); g.stroke(); break;
      default: g.beginPath(); g.moveTo(222, MY - 6); g.quadraticCurveTo(256, MY + 26, 290, MY - 6); g.stroke();
    }
    if (F && a.mouth !== 'grin' && a.mouth !== 'open') { g.strokeStyle = lip; g.globalAlpha = 0.75; g.lineWidth = 7; g.beginPath(); g.moveTo(240, MY + 6); g.quadraticCurveTo(256, MY + 14, 272, MY + 6); g.stroke(); g.globalAlpha = 1; }
  });
  FACE_CACHE[key] = t; return t;
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
  }
  g.save(); g.translate(cx, cy); g.rotate(tilt * s);
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
  // 上まぶたの影
  g.fillStyle = 'rgba(80,40,30,0.18)'; g.fillRect(-w, -h, w * 2, h * 0.45);
  g.restore();
  // ひかり
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-ir * 0.3 * s * -1 - ir * 0.15, iy - ir * 0.42, ir * 0.26, ir * 0.3, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(ir * 0.3, iy + ir * 0.4, ir * 0.12, 0, Math.PI * 2); g.fill();
  // 上まぶたの線(太く)と まつげ
  g.strokeStyle = ink; g.lineWidth = F ? 9 : 7;
  g.beginPath(); g.ellipse(0, 0, w * 1.02, h * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  if (F) {
    g.lineWidth = 5;
    for (let k = 0; k < 3; k++) { const ang = (s > 0 ? Math.PI * 1.88 : Math.PI * 1.12) + (s > 0 ? -1 : 1) * k * 0.12; const x0 = Math.cos(ang) * w, y0 = Math.sin(ang) * h; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 14 * s * (1 - k * 0.2), y0 - 10 + k * 3); g.stroke(); }
  }
  // 下まぶた(うすく)
  g.strokeStyle = 'rgba(60,30,24,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, w * 0.9, h * 1.0, 0, Math.PI * 0.25, Math.PI * 0.75); g.stroke();
  g.restore();
}

/* ---------- 髪の毛の束 ---------- */
const LOCK_CACHE = {};
/* 根元が上(y=0)、毛先が下(y=-len)。bz: 毛先が前(+z)へ曲がる量 / bx: 横へ / wave: 波打ち / flat: 平たさ */
function lockGeo(len, r0, r1, bz = 0, bx = 0, wave = 0, flat = 0.55) {
  const k = [len, r0, r1, bz, bx, wave, flat].map((v) => v.toFixed(3)).join(',');
  if (LOCK_CACHE[k]) return LOCK_CACHE[k];
  const geo = new THREE.CylinderGeometry(r0, r1, len, 8, 8);
  geo.translate(0, -len / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = -y / len;
    let x = p.getX(i), z = p.getZ(i) * flat;
    x += bx * t * t + wave * Math.sin(t * Math.PI * 3) * t;
    z += bz * t * t;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return (LOCK_CACHE[k] = geo);
}
/* 頭のまわりに 束を置く。ang: 正面0・右(+x)が+、tilt: 外へ開く角度、y: 根元の高さ */
function addLock(parent, color, R, ang, y, geoArgs, tilt = 0.25, out = 1.0, roll = 0) {
  const pivot = new THREE.Group(); pivot.rotation.y = ang;
  const m = tm(lockGeo(...geoArgs), color, 0, y, R * out, 0.05);
  m.rotation.x = -tilt; m.rotation.z = roll;
  pivot.add(m); parent.add(pivot); return m;
}

function buildHair(head, a, R) {
  const hc = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
  const dark = shade(hc, 0.82);
  let capMesh = null, capS = 1.07;
  const cap = (thetaLen = 1.45, tilt = -0.22, s = 1.07, sy = 1) => { const m = tm(new THREE.SphereGeometry(R * s, 32, 18, 0, Math.PI * 2, 0, thetaLen), hc, 0, 0, 0, 0.035); m.rotation.x = tilt; m.scale.y = sy; head.add(m); capMesh = m; capS = s; return m; };
  const back = (thetaLen = 2.1, s = 1.07) => { const m = tm(new THREE.SphereGeometry(R * s, 32, 18, Math.PI / 2 + 1.25, Math.PI * 2 - 2.5, 0, thetaLen), hc, 0, 0, 0, 0.03); head.add(m); return m; };
  const fringe = (n, from, to, len, curve = 0.02, side = 0, y = R * 0.62, thick = 0.032) => {
    for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); const ang = from + (to - from) * t; addLock(head, hc, R * 1.0, ang, y, [len * (0.88 + 0.24 * Math.sin(k * 2.1 + 1)), thick * 1.45, 0.006, curve, side * (0.6 + t * 0.6), 0, 0.45], 0.42, 0.97); }
  };
  const sideLocks = (len, curve = 0.015, n = 2, ang = 1.25, thick = 0.035) => { [-1, 1].forEach((s) => { for (let k = 0; k < n; k++) addLock(head, hc, R * 1.02, s * (ang + k * 0.22), R * 0.3, [len * (1 - k * 0.12), thick, 0.006, curve, 0], 0.12, 1.0); }); };
  const backLocks = (len, n = 9, curl = -0.03, wave = 0, y = R * 0.4, spread = 2.4) => {
    for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); const ang = Math.PI + (t - 0.5) * spread; addLock(head, hc, R * 1.02, ang, y, [len * (0.93 + 0.12 * Math.sin(k * 1.7)), 0.05, 0.008, curl, 0, wave], 0.06, 1.0); }
  };
  const ring = () => {   // つやの光の輪: 髪(かぶせた丸)の表面に そって 前半分だけ
    return;   // 2026-11-19 帯のように見えたので やめた
    if (!capMesh) return;
    const hh = R * capS * 0.62, rr = Math.sqrt((R * capS) ** 2 - hh * hh) * 1.01;
    const r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.006, 6, 30, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: lighten(hc, 0.6), transparent: true, opacity: 0.6 }));
    r.rotation.set(Math.PI / 2, 0, Math.PI * 0.1); r.position.y = hh; capMesh.add(r);
  };

  if (a.sex === 'f') switch (a.hair) {
    case 'bob': cap(1.5, -0.2, 1.1); back(2.45, 1.13); fringe(7, -0.8, 0.8, R * 0.62); sideLocks(R * 1.25, 0.03, 3, 1.15); backLocks(R * 1.25, 9, 0.05); ring(); break;
    case 'shortbob': cap(1.5); back(2.15, 1.08); fringe(6, -0.75, 0.85, R * 0.5, 0.02, 0.01); sideLocks(R * 0.95, 0.03, 2, 1.2); backLocks(R * 0.95, 8, 0.04); ring(); break;
    case 'short': cap(1.5, -0.25); back(2.0); fringe(6, -0.9, 0.7, R * 0.5, 0.015, 0.03); sideLocks(R * 0.7, 0.02, 2, 1.3, 0.03); backLocks(R * 0.75, 7, 0.02); ring(); break;
    case 'long': cap(1.5); back(2.3, 1.08); fringe(7, -0.8, 0.8, R * 0.6); sideLocks(R * 2.2, 0.03, 3, 1.15); backLocks(R * 2.6, 11, -0.04); ring(); break;
    case 'wave': cap(1.5); back(2.3, 1.09); fringe(6, -0.85, 0.75, R * 0.6, 0.02, 0.02); sideLocks(R * 2.1, 0.05, 3, 1.15, 0.04); backLocks(R * 2.4, 11, -0.02, 0.025); [-1, 1].forEach((s) => addLock(head, hc, R * 1.02, s * 1.0, R * 0.2, [R * 2.0, 0.04, 0.008, 0.06, 0, 0.03], 0.1)); ring(); break;
    case 'ponytail': {
      cap(1.55, -0.3); back(1.9); fringe(6, -0.8, 0.8, R * 0.55, 0.02, 0.01); sideLocks(R * 0.9, 0.02, 1, 1.25, 0.025);
      for (let k = 0; k < 4; k++) { const m = tm(lockGeo(R * 2.1, 0.05, 0.008, -0.12, (k - 1.5) * 0.02, 0.012), hc, (k - 1.5) * 0.012, R * 0.55, -R * 0.92, 0.05); m.rotation.x = 0.35; head.add(m); }
      head.add(tm(new THREE.TorusGeometry(0.03, 0.01, 8, 16), '#c8263a', 0, R * 0.55, -R * 0.94)); ring(); break; }
    case 'bun':
      cap(1.55, -0.32); back(1.95); fringe(5, -0.7, 0.7, R * 0.5, 0.02); sideLocks(R * 0.85, 0.02, 1, 1.3, 0.022);
      head.add(tm(new THREE.SphereGeometry(R * 0.42, 20, 14), hc, 0, R * 0.98, -R * 0.42, 0.05));
      head.add(tm(new THREE.TorusGeometry(R * 0.3, 0.012, 8, 20), dark, 0, R * 0.86, -R * 0.36)); ring(); break;
    case 'halfup':
      cap(1.5); back(2.25, 1.08); fringe(6, -0.8, 0.8, R * 0.6, 0.02); sideLocks(R * 1.9, 0.03, 2, 1.15); backLocks(R * 2.2, 10, -0.03, 0.01);
      head.add(tm(new THREE.SphereGeometry(R * 0.22, 14, 10), hc, 0, R * 0.55, -R * 0.98, 0.05)); ring(); break;
    case 'hime':
      cap(1.5); back(2.3, 1.08); fringe(11, -0.85, 0.85, R * 0.52, 0.0, 0, R * 0.62, 0.024);
      [-1, 1].forEach((s) => { for (let k = 0; k < 3; k++) addLock(head, hc, R * 1.02, s * (1.15 + k * 0.12), R * 0.3, [R * 1.05, 0.03, 0.025, 0.0, 0], 0.03); });
      backLocks(R * 2.7, 12, -0.02); ring(); break;
    case 'side':
      cap(1.5); back(2.0); fringe(6, -0.95, 0.6, R * 0.6, 0.02, 0.04); sideLocks(R * 0.9, 0.02, 1, 1.25, 0.03);
      for (let k = 0; k < 4; k++) addLock(head, hc, R * 1.0, 1.6 + k * 0.1, R * 0.1, [R * 2.0, 0.045, 0.01, 0.12, 0.02, 0.015], 0.05);
      head.add(tm(new THREE.SphereGeometry(0.022, 10, 8), '#e8b84a', R * 0.92, R * 0.02, -R * 0.15)); ring(); break;
  }
  else switch (a.hair) {
    case 'short': cap(1.4, -0.22, 1.06, 1.06); back(1.95); fringe(5, -0.6, 0.6, R * 0.38, 0.03, 0.03, R * 0.66); backLocks(R * 0.55, 7, 0.0); ring(); break;
    case 'twoblock': cap(1.25, -0.2, 1.08, 1.12); { const sd = tm(new THREE.SphereGeometry(R * 1.015, 28, 16, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0.95, 0.75), shade(hc, 0.75)); head.add(sd); } fringe(6, -0.55, 0.55, R * 0.42, 0.06, 0.02, R * 0.72); ring(); break;
    case 'center':
      cap(1.45, -0.2, 1.07, 1.05); back(2.0);
      for (let k = 0; k < 4; k++) { addLock(head, hc, R, -0.15 - k * 0.2, R * 0.66, [R * (0.62 - k * 0.04), 0.034, 0.004, 0.02, -0.05], 0.38); addLock(head, hc, R, 0.15 + k * 0.2, R * 0.66, [R * (0.62 - k * 0.04), 0.034, 0.004, 0.02, 0.05], 0.38); }
      sideLocks(R * 0.8, 0.02, 1, 1.3, 0.03); backLocks(R * 0.75, 7, 0.0); ring(); break;
    case 'mash': cap(1.6, -0.12, 1.1, 1.0); back(2.05, 1.1); fringe(9, -0.95, 0.95, R * 0.56, 0.0, 0, R * 0.62, 0.03); sideLocks(R * 0.75, 0.02, 2, 1.2, 0.035); ring(); break;
    case 'side': cap(1.42, -0.2, 1.07, 1.08); back(1.95); for (let k = 0; k < 6; k++) addLock(head, hc, R, -0.7 + k * 0.25, R * 0.72, [R * 0.5, 0.035, 0.005, 0.04, 0.09], 0.5 - k * 0.03); backLocks(R * 0.6, 7, 0.0); ring(); break;
    case 'perm': cap(1.5, -0.15, 1.12, 1.06); back(2.05, 1.1); for (let k = 0; k < 16; k++) { const ang = (k / 16) * Math.PI * 2; addLock(head, hc, R * 1.03, ang, R * (0.45 + (k % 3) * 0.1), [R * 0.55, 0.04, 0.01, 0.04, 0.02, 0.02], 0.25 + (k % 2) * 0.2); } ring(); break;
    case 'spiky': {
      cap(1.4, -0.2, 1.06, 1.05); back(1.9);
      const spike = (ang, el, len, rad) => {   // el: 真上から何度たおすか
        const pv = new THREE.Group(); pv.rotation.y = ang;
        const c = tm(new THREE.ConeGeometry(rad, len, 6), hc, 0, 0, 0, 0.05);
        const r = R * 1.02; c.position.set(0, Math.cos(el) * r + Math.cos(el) * len * 0.35, Math.sin(el) * r + Math.sin(el) * len * 0.35); c.rotation.x = el;
        pv.add(c); head.add(pv);
      };
      for (let k = 0; k < 10; k++) spike((k / 10) * Math.PI * 2, 0.75, 0.15, 0.045);
      for (let k = 0; k < 5; k++) spike((k / 5) * Math.PI * 2 + 0.3, 0.25, 0.14, 0.045);
      for (let k = 0; k < 5; k++) spike(-0.6 + k * 0.3, 1.15, 0.11, 0.035);   // 前髪
      break; }
    case 'back': { cap(1.38, -0.42, 1.06, 1.04); back(2.0); for (let k = 0; k < 7; k++) { const m = addLock(head, hc, R * 1.0, -0.6 + k * 0.2, R * 0.85, [R * 1.05, 0.03, 0.01, -0.12, 0], -1.2); } ring(); break; }
    case 'long': cap(1.45, -0.2, 1.07, 1.04); back(2.15); fringe(4, -0.85, -0.2, R * 0.65, 0.02, -0.03); fringe(3, 0.3, 0.8, R * 0.6, 0.02, 0.03); sideLocks(R * 1.0, 0.02, 1, 1.25); backLocks(R * 1.1, 8, -0.02); { const m = tm(lockGeo(R * 1.2, 0.04, 0.012, -0.05), hc, 0, R * 0.05, -R * 1.0, 0.05); m.rotation.x = 0.2; head.add(m); head.add(tm(new THREE.TorusGeometry(0.022, 0.008, 6, 12), '#2a2a2a', 0, R * 0.02, -R * 1.02)); } ring(); break;
    case 'buzz': { const m = tm(new THREE.SphereGeometry(R * 1.012, 28, 16, 0, Math.PI * 2, 0, 1.55), shade(hc, 1.0)); m.material = toon(hc, { transparent: true, opacity: 0.6 }); m.rotation.x = -0.15; head.add(m); break; }
  }
}

/* ---------- 体と服 ---------- */
function torsoGeo(f) {
  const pts = (f ? [[0.13, 0], [0.135, 0.06], [0.112, 0.17], [0.13, 0.28], [0.135, 0.34], [0.095, 0.4], [0.045, 0.43]]
                 : [[0.14, 0], [0.145, 0.06], [0.14, 0.17], [0.155, 0.29], [0.16, 0.345], [0.11, 0.405], [0.05, 0.435]]).map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 24); g.scale(1, 1, 0.72); return g;
}
const TOP_DEF = {   // 袖: long / short、ズボンの色、上に重ねる物は buildTop で
  suit: { sleeve: 'long' }, suitopen: { sleeve: 'long' }, shirt: { sleeve: 'long' }, polo: { sleeve: 'short' }, knit: { sleeve: 'long' }, hoodie: { sleeve: 'long' },
  jacket: { sleeve: 'long' }, denim: { sleeve: 'long', color: '#4a6a9a' }, work: { sleeve: 'long' }, tee: { sleeve: 'short' },
  blouse: { sleeve: 'puff' }, onepiece: { sleeve: 'short', skirt: true }, cardigan: { sleeve: 'long' }, office: { sleeve: 'long', skirt: true }, pantsuit: { sleeve: 'long', pants: 'same' },
  happi: { sleeve: 'wide' }, samue: { sleeve: 'long' }, hakui: { sleeve: 'long', color: '#f4f2ec' }, jinbei: { sleeve: 'wide' }
};
function buildTop(body, a, f, cc) {
  const W = '#f6f4ee', front = 0.112;   // 胸の前の面(z)
  const flatPiece = (w, h, color, x, y, z, rz = 0, rx = -0.12) => { const m = tm(new THREE.BoxGeometry(w, h, 0.008), color, x, y, z); m.rotation.set(rx, 0, rz); body.add(m); return m; };
  const collarV = (color, depth = 0.16) => { [-1, 1].forEach((s) => flatPiece(0.03, depth, color, s * 0.032, 0.36, front + 0.006, s * 0.42)); };
  const shirtV = (color = W, h = 0.14) => { const m = tm(new THREE.ConeGeometry(0.055, h, 3), color, 0, 0.37, front - 0.01); m.rotation.set(Math.PI, 0, 0); m.scale.z = 0.25; body.add(m); };
  const lapels = (color) => { [-1, 1].forEach((s) => flatPiece(0.045, 0.2, shade(color, 0.86), s * 0.05, 0.31, front + 0.012, s * 0.32)); };
  const buttons = (n, x = 0, color = '#2a2a2a', y0 = 0.27) => { for (let k = 0; k < n; k++) body.add(tm(new THREE.SphereGeometry(0.007, 6, 5), color, x, y0 - k * 0.06, front + 0.014)); };
  const tie = (color) => { body.add(tm(new THREE.BoxGeometry(0.03, 0.16, 0.01), color, 0, 0.33, front + 0.01)); body.add(tm(new THREE.BoxGeometry(0.03, 0.025, 0.014), shade(color, 0.85), 0, 0.41, front + 0.008)); };
  const neckRing = (color) => { const r = tm(new THREE.TorusGeometry(0.05, 0.012, 6, 18), color, 0, 0.425, 0); r.rotation.x = Math.PI / 2; r.scale.y = 0.75; body.add(r); };
  const crossCollar = (color) => { [-1, 1].forEach((s) => flatPiece(0.035, 0.26, color, s * 0.03, 0.31, front + 0.008, s * 0.55)); };
  const hem = (color) => { const r = tm(new THREE.CylinderGeometry(f ? 0.133 : 0.143, f ? 0.133 : 0.143, 0.03, 24, 1, true), color, 0, 0.02, 0); r.scale.z = 0.73; body.add(r); };
  const pocket = (x, y, color) => flatPiece(0.045, 0.04, color, x, y, front + 0.008, 0, -0.05);
  switch (a.top) {
    case 'suit': shirtV(); tie(['#8a1f2a', '#2a3a6a', '#3a5a3a'][typeof a.topColor === 'number' ? a.topColor % 3 : 0]); lapels(cc); buttons(2, 0.02, '#1a1a1a', 0.17); break;
    case 'suitopen': shirtV(); lapels(cc); buttons(2, 0.02, '#1a1a1a', 0.17); break;
    case 'office': shirtV(W, 0.12); lapels(cc); buttons(1, 0, '#1a1a1a', 0.2); break;
    case 'pantsuit': shirtV('#e8e2d8', 0.13); lapels(cc); buttons(2, 0, '#1a1a1a', 0.2); break;
    case 'shirt': collarV(lighten(cc, 0.15), 0.07); buttons(4, 0, lighten(cc, 0.5), 0.36); pocket(-0.06, 0.3, shade(cc, 0.92)); break;
    case 'polo': collarV(lighten(cc, 0.1), 0.06); buttons(2, 0, '#f2f2f2', 0.39); break;
    case 'knit': neckRing(shade(cc, 0.85)); hem(shade(cc, 0.85)); for (let k = 0; k < 5; k++) flatPiece(0.004, 0.3, shade(cc, 0.9), -0.06 + k * 0.03, 0.2, front - 0.002, 0, -0.08); break;
    case 'hoodie': { const hood = tm(new THREE.TorusGeometry(0.09, 0.045, 8, 18), cc, 0, 0.43, -0.05, 0.04); hood.rotation.x = Math.PI / 2.3; body.add(hood);
      [-1, 1].forEach((s) => body.add(tm(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 5), W, s * 0.03, 0.34, front + 0.012))); flatPiece(0.16, 0.07, shade(cc, 0.9), 0, 0.12, front + 0.004, 0, -0.02); hem(shade(cc, 0.88)); break; }
    case 'jacket': flatPiece(0.1, 0.36, W, 0, 0.2, front + 0.002, 0, -0.06); lapels(cc); neckRing(W); break;
    case 'denim': flatPiece(0.1, 0.36, W, 0, 0.2, front + 0.002, 0, -0.06); collarV(shade(cc, 0.85), 0.08); pocket(-0.06, 0.29, shade(cc, 0.85)); pocket(0.06, 0.29, shade(cc, 0.85)); buttons(3, 0.055, '#c8a04a', 0.25); break;
    case 'work': collarV(shade(cc, 0.85), 0.07); flatPiece(0.006, 0.36, '#8a8a8a', 0, 0.21, front + 0.006, 0, -0.06); pocket(-0.065, 0.29, shade(cc, 0.88)); pocket(0.065, 0.29, shade(cc, 0.88)); hem(shade(cc, 0.82)); break;
    case 'tee': neckRing(shade(cc, 0.88)); break;
    case 'blouse': { const r = tm(new THREE.TorusGeometry(0.055, 0.016, 6, 20), lighten(cc, 0.3), 0, 0.415, 0.01); r.rotation.x = Math.PI / 2.2; body.add(r); buttons(3, 0, lighten(cc, 0.6), 0.36); break; }
    case 'onepiece': neckRing(shade(cc, 0.85)); body.add(tm(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 24), shade(cc, 0.7), 0, 0.17, 0)); break;
    case 'cardigan': flatPiece(0.1, 0.36, '#f4ece0', 0, 0.2, front + 0.002, 0, -0.06); neckRing('#f4ece0'); buttons(4, 0.05, '#c8b89a', 0.33); hem(shade(cc, 0.88)); break;
    // 大将の服
    case 'happi': crossCollar('#f6f4ee'); body.add(tm(new THREE.CylinderGeometry(0.143, 0.146, 0.05, 24), '#2a2018', 0, 0.06, 0)); flatPiece(0.06, 0.06, '#f6f4ee', 0.07, 0.22, front + 0.01, 0, -0.04); break;
    case 'samue': crossCollar(shade(cc, 0.75)); body.add(tm(new THREE.CylinderGeometry(0.145, 0.146, 0.02, 24), shade(cc, 0.7), 0, 0.12, 0)); break;
    case 'hakui': { [-1, 1].forEach((s) => flatPiece(0.03, 0.3, '#e6e2d8', s * 0.025, 0.29, front + 0.008, s * 0.5)); const st = tm(new THREE.CylinderGeometry(0.055, 0.058, 0.04, 16, 1, true), '#f4f2ec', 0, 0.43, 0); body.add(st); buttons(3, 0.06, '#d8d4c8', 0.3); break; }
    case 'jinbei': crossCollar(shade(cc, 0.8)); [-1, 1].forEach((s) => flatPiece(0.04, 0.008, shade(cc, 0.7), s * 0.05, 0.2, front + 0.01, 0, 0)); break;
  }
  if (TOP_DEF[a.top] && TOP_DEF[a.top].skirt) return 'skirt';
  return '';
}

function buildAvatar(raw, opt = {}) {
  const a = AVATAR.fix(raw) || AVATAR.fallback(1);
  const f = a.sex === 'f';
  const skinC = AVATAR.color(AVATAR.SKIN, a.skin);
  const def = TOP_DEF[a.top] || { sleeve: 'long' };
  const cc = def.color || AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const R = f ? 0.185 : 0.19;

  // 胴
  const torso = tm(torsoGeo(f), cc, 0, 0, 0, 0.035); body.add(torso);
  const lower = buildTop(body, a, f, cc);
  body.add(tm(new THREE.CylinderGeometry(0.038, 0.044, 0.08, 12), skinC, 0, 0.46, 0));   // 首
  // 腕(袖の形は服で変わる)
  const arms = [];
  [-1, 1].forEach((s) => {
    const sh = new THREE.Group(); sh.position.set((f ? 0.135 : 0.155) * s, 0.37, 0);
    const sleeveC = cc;
    const upperC = def.sleeve === 'short' ? sleeveC : sleeveC, lowerC = def.sleeve === 'short' ? skinC : sleeveC;
    const wide = def.sleeve === 'wide', puff = def.sleeve === 'puff';
    sh.add(tm(new THREE.CapsuleGeometry(puff ? 0.05 : wide ? 0.05 : 0.04, 0.09, 4, 10), upperC, 0, -0.06, 0, 0.05));
    sh.add(tm(new THREE.CapsuleGeometry(wide ? 0.045 : 0.034, 0.1, 4, 10), lowerC, 0, -0.17, 0, 0.05));
    if (def.sleeve === 'long' && !wide) sh.add(tm(new THREE.CylinderGeometry(0.037, 0.037, 0.02, 10), shade(sleeveC, 0.85), 0, -0.235, 0));
    sh.add(tm(new THREE.SphereGeometry(0.036, 12, 10), skinC, 0, -0.26, 0.005, 0.06));
    sh.rotation.x = -0.75; sh.rotation.z = 0.1 * s;
    body.add(sh); arms.push(sh);
  });
  const cheerMug = new THREE.Group();
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 12), mat('#f2b51c', { transparent: true, opacity: 0.92 }), 0, 0, 0));
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), mat('#fbf7ec'), 0, 0.065, 0));
  cheerMug.position.set(0, -0.3, 0.03); cheerMug.visible = false; arms[1].add(cheerMug);

  // 足(座っている形)
  if (!opt.standing) {
    const pantsC = def.pants === 'same' ? cc : (a.top === 'work' ? cc : (f ? '#3a3a48' : '#2c2c36'));
    const legC = lower === 'skirt' ? (f ? skinC : pantsC) : pantsC;
    [-1, 1].forEach((s) => {
      if (lower !== 'skirt') { const th = tm(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10), legC, 0.07 * s, 0.03, 0.14, 0.04); th.rotation.x = Math.PI / 2; body.add(th); }
      const sn = tm(new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), legC, 0.07 * s, -0.19, 0.3, 0.04); body.add(sn);
      body.add(tm(new THREE.BoxGeometry(0.075, 0.05, 0.13), f ? '#5a2a2a' : '#1d1a18', 0.07 * s, -0.39, 0.34, 0.04));
    });
    if (lower === 'skirt') {   // ひざの上にかかる布 + 前に垂れる すそ
      const skc = a.top === 'office' ? '#2c2c36' : cc;
      const top = tm(new THREE.SphereGeometry(0.17, 22, 14), skc, 0, 0.05, 0.13, 0.04); top.scale.set(1.0, 0.36, 1.12); body.add(top);
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.19, 0.12, 22, 1, true, -Math.PI / 2, Math.PI), toon(skc, { side: THREE.DoubleSide }));
      drape.position.set(0, -0.01, 0.13); drape.scale.z = 1.12; body.add(drape);
      body.add(tm(new THREE.CylinderGeometry(0.148, 0.15, 0.08, 22), skc, 0, 0.03, 0));
    }
  }

  // 頭
  const head = new THREE.Group(); head.position.set(0, 0.69, 0); body.add(head);
  const FACE = { round: [1, 1, 1], egg: [0.96, 1.05, 0.98], sharp: [0.93, 1.08, 0.96], square: [1.05, 0.97, 1.0] }[a.face] || [1, 1, 1];
  const skull = new THREE.Group(); skull.scale.set(FACE[0], FACE[1], FACE[2]); head.add(skull);
  skull.add(tm(new THREE.SphereGeometry(R, 36, 26), skinC, 0, 0, 0, 0.035));
  [-1, 1].forEach((s) => skull.add(tm(new THREE.SphereGeometry(R * 0.2, 12, 10), skinC, R * 0.96 * s, -R * 0.05, 0, 0.06)));
  const face = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 32, 24, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6),
    new THREE.MeshBasicMaterial({ map: faceTexture(a), transparent: true, depthWrite: false }));
  skull.add(face);
  buildHair(skull, a, R);
  buildAcc(skull, body, a, R, f);
  root.scale.setScalar(a.size);
  root.userData = { body, head, arms, cheerMug, torso, t: Math.random() * 10, cheer: 0, talk: 0 };
  return root;
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
  if (!a.owner) switch (a.acc) {
    case 'glasses': glasses('#1a1414'); break;
    case 'thin': glasses('#b8963a', true); break;
    case 'sun': glasses('#1a1414', false, true); break;
    case 'cap': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.25), AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor), 0, 0, 0, 0.03); c.rotation.x = -0.12; head.add(c);
      const v = tm(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), shade(AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor), 0.85), 0, R * 0.42, R * 0.78); v.rotation.x = 0.15; head.add(v); break; }
    case 'beanie': { const c = tm(new THREE.SphereGeometry(R * 1.12, 26, 14, 0, Math.PI * 2, 0, 1.3), '#c87a3a', 0, R * 0.06, 0, 0.03); c.rotation.x = -0.1; head.add(c);
      const b = tm(new THREE.CylinderGeometry(R * 1.1, R * 1.12, R * 0.3, 26, 1, true), '#a8622a', 0, R * 0.42, -R * 0.06); b.rotation.x = -0.1; head.add(b); head.add(tm(new THREE.SphereGeometry(R * 0.18, 10, 8), '#f2ece0', 0, R * 1.18, -R * 0.12)); break; }
    case 'necklace': case 'earring': break;
    case 'beret': { const b = tm(new THREE.SphereGeometry(R * 0.95, 24, 12), '#8a2a3a', R * 0.12, R * 0.78, -R * 0.05, 0.04); b.scale.set(1.1, 0.32, 1.05); b.rotation.z = -0.25; head.add(b); break; }
    case 'band': { const holder = new THREE.Group(); holder.rotation.x = -0.3; holder.position.y = R * 0.05;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R * 1.07, 0.012, 6, 30, Math.PI), toon('#c8263a')); arc.rotation.y = Math.PI / 2; holder.add(arc); head.add(holder); break; }
    case 'ribbon': { const g = new THREE.Group(); g.position.set(0, R * 0.45, -R * 0.98); [-1, 1].forEach((s) => { const w = tm(new THREE.ConeGeometry(0.04, 0.07, 4), '#e86a8a', s * 0.035, 0, 0, 0.05); w.rotation.z = s * Math.PI / 2; g.add(w); }); g.add(tm(new THREE.SphereGeometry(0.015, 8, 6), '#c84a6a')); head.add(g); break; }
  }
  if (!a.owner && (a.acc === 'earring')) [-1, 1].forEach((s) => { head.add(tm(new THREE.SphereGeometry(0.012, 8, 6), '#e8c84a', R * 0.98 * s, -R * 0.28, 0)); head.add(tm(new THREE.TorusGeometry(0.014, 0.003, 6, 12), '#e8c84a', R * 0.98 * s, -R * 0.36, 0)); });
  if (!a.owner && a.acc === 'necklace') { const n = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: '#d8b84a' })); n.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI); n.position.set(0, 0.42, 0.04); body.add(n); body.add(tm(new THREE.SphereGeometry(0.012, 8, 6), '#e8e8f0', 0, 0.355, 0.11)); }
  if (a.owner) {
    switch (a.head) {
      case 'hachimaki': case 'nejiri': {
        const band = tm(new THREE.TorusGeometry(R * 1.03, a.head === 'nejiri' ? 0.02 : 0.016, 8, 36), '#f6f4ee', 0, R * 0.3, 0, 0.06); band.rotation.x = Math.PI / 2 + 0.15; head.add(band);
        if (a.head === 'nejiri') for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2; head.add(tm(new THREE.BoxGeometry(0.006, 0.03, 0.01), '#2a3a6a', Math.sin(ang) * R * 1.04, R * 0.3 + Math.cos(ang) * R * 0.15 * 0.98, Math.cos(ang) * R * 1.04)); }
        const knot = tm(new THREE.SphereGeometry(0.025, 8, 6), '#f6f4ee', 0, R * 0.25, -R * 1.02, 0.06); head.add(knot);
        [-1, 1].forEach((s) => { const tl = tm(new THREE.BoxGeometry(0.03, 0.09, 0.006), '#f6f4ee', s * 0.03, R * 0.12, -R * 1.04); tl.rotation.z = s * 0.4; head.add(tl); });
        break; }
      case 'tenugui': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.2), '#2a3a6a', 0, 0, 0, 0.03); c.rotation.x = -0.25; head.add(c);
        for (let k = 0; k < 10; k++) head.add(tm(new THREE.SphereGeometry(0.01, 6, 5), '#f6f4ee', Math.sin(k * 1.9) * R * 0.6, R * 0.8 + Math.cos(k * 2.3) * R * 0.1, Math.cos(k * 1.9) * R * 0.5));
        head.add(tm(new THREE.SphereGeometry(0.025, 8, 6), '#2a3a6a', 0, R * 0.35, -R * 1.02, 0.06)); break; }
      case 'itamae': { const c = tm(new THREE.CylinderGeometry(R * 0.95, R * 1.0, R * 0.9, 24), '#f6f4ee', 0, R * 0.8, -R * 0.05, 0.04); head.add(c); break; }
      case 'bandana': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.3), '#8a1f2a', 0, 0, 0, 0.03); c.rotation.x = -0.2; head.add(c);
        for (let k = 0; k < 14; k++) head.add(tm(new THREE.SphereGeometry(0.008, 6, 5), '#f6f4ee', Math.sin(k * 2.1) * R * 0.7, R * 0.7 + Math.cos(k * 1.3) * R * 0.15, Math.cos(k * 2.1) * R * 0.6));
        head.add(tm(new THREE.ConeGeometry(0.03, 0.08, 4), '#8a1f2a', 0, R * 0.2, -R * 1.08, 0.05)); break; }
    }
    if (a.apron && a.apron !== 'none') {
      const ac = { navy: '#1f2a4a', black: '#1a1a1e', white: '#f2efe6', brown: '#6a4428' }[a.apron];
      const ap = tm(new THREE.BoxGeometry(0.27, 0.34, 0.012), ac, 0, -0.05, 0.13, 0.03); ap.rotation.x = -0.05; body.add(ap);
      body.add(tm(new THREE.CylinderGeometry(0.15, 0.152, 0.025, 24), ac, 0, 0.11, 0));
      body.add(tm(new THREE.BoxGeometry(0.08, 0.05, 0.004), lighten(ac, 0.6), 0.06, 0.0, 0.138));
    }
  }
}

function animateAvatar(av, dt) {
  const u = av.userData; u.t += dt;
  u.cheer = Math.max(0, u.cheer - dt); u.talk = Math.max(0, u.talk - dt);
  const breath = Math.sin(u.t * 2.1) * 0.006;
  u.body.position.y = breath;
  let hx = Math.sin(u.t * 0.7) * 0.035, hy = Math.sin(u.t * 0.43) * 0.12;
  if (u.talk > 0) hx += Math.sin(u.t * 14) * 0.06;
  u.head.rotation.set(hx, hy, Math.sin(u.t * 0.5) * 0.03);
  const k = u.cheer > 0 ? Math.min(1, u.cheer * 3, (2.2 - u.cheer) * 4) : 0;
  u.arms[1].rotation.x = -0.75 - k * 2.0;
  u.arms[1].rotation.z = 0.1 - k * 0.25;
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
  const tagList = [];
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
    tag.userData.menuId = it.id; tagList.push(tag);   // 押すと注文できる
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
      const tagHits = ray.intersectObjects(tagList, false);
      if (tagHits.length && api.onTagTap) { const tg = tagHits[0].object; tg.userData.flash = performance.now(); api.onTagTap(tg.userData.menuId); drag = null; return; }
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
    onTap: null, onFrame: null, onItemTap: null, onTagTap: null,
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
    setAvatar(a) { if (av) scene.remove(av); av = null; if (!a) return; av = buildAvatar(a); scene.add(av); },
    setZoom(z) { zoom = z ? 1 : 0; },
    cheer() { if (av) av.userData.cheer = 2.2; },
    stop() { running = false; }
  };
}

window.IZ3D = { createShop, createPreview, buildItem, buildAvatar, THREE };   // buildItem と THREE は 確認用のページ(tools/menu-gallery.html)で使う
window.dispatchEvent(new Event('iz3d-ready'));
