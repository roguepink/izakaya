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
   アバターを組み立てる(3代目・アニメ風。頭の形・髪の土台+毛の束・体を作りこみ)
   ・塗りは「トゥーン」(影を3段で塗る)+ ふちに細い線
   ・顔はキャンバスに描いて、頭の前に貼る。髪は毛の束を1本ずつ形にして並べる
   ===================================================================== */
const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const TOONS = {};
function toon(color, o) { const k = color + JSON.stringify(o || {}); return TOONS[k] || (TOONS[k] = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: GRAD }, o))); }
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

/* ---------- 頭の形(ただの丸ではなく、上が広く あごに向かって細いアニメの頭) ---------- */
function headDeform(face) {
  const a = { round: 0.12, egg: 0.21, sharp: 0.29, square: 0.08 }[face] ?? 0.18;
  const sq = face === 'square';
  return (x, y, z, R) => {
    const ny = y / R;
    if (ny < 0) {
      const t = Math.min(1, -ny);
      x *= (1 - a * Math.pow(t, 1.5)) * (sq ? 1 + 0.05 * t : 1);
      z *= z > 0 ? 1 - 0.06 * t : 1 - 0.22 * t;
      y *= 1 + (sq ? 0.02 : 0.1) * t;
    } else { x *= 1 + 0.035 * ny; y *= 1.02; z *= 1 + 0.02 * ny; }
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
  const S = 14, A = 6, pos = [], idx = [];
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
  const hc = AVATAR.color(AVATAR.HAIR_COLOR, a.hairColor);
  const dark = shade(hc, 0.78);
  const F = a.sex === 'f';
  const add = (geo, color = hc, line = 0.0035) => { hairTint(geo, R); const m = tm(geo, color, 0, 0, 0, line); m.material = toon(color, { vertexColors: true }); head.add(m); return m; };
  let VOL = 0.07;
  const shell = (o) => { VOL = o.vol ?? 0.07; const m = add(hairShell(D, R, Object.assign({ f: 0.95, s: 1.65, b: 2.0, vol: 0.07, crown: 0.03 }, o)), o.color || hc, 0); m.material = toon(o.color || hc, { side: THREE.DoubleSide, vertexColors: true }); return m; };
  const st = (s, w = 0.03, flat = 0.4, blunt = 0, color) => { if (s.vol == null) s.vol = VOL; return add(strandGeo(strandPath(D, R, s), w, flat, blunt, s.wave || 0), color); };
  const spike = (th, ph, len, w = 0.05, back = 0.35) => {   // ツンツン: 根もとから 外へ、少し上・後ろへ
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
  const topTex = (n = 7, back = true) => row(n, -0.9, 0.9, (ph, t, k) => st({ th: 0.12, ph: ph + (back ? Math.PI : 0), len: R * 0.9, leave: 3, lift: 0.025, sweep: 0 }, 0.05, 0.3));

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
      default: row(9, -0.85, 0.85, (ph, t, k) => st({ th: 0.4, ph, len: endLen(0.4, 1.3 + jit(k, 0.08)), leave: 3, sweep: 0.05 * Math.sin(k) }, 0.036, 0.4)); // down: 下ろす(ぎざぎざ)
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
  const crown = (n = 14, len = 1.0) => { for (let k = 0; k < n; k++) { const ph = Math.PI + (k / n - 0.5) * Math.PI * 1.9; st({ th: 0.24, ph, endY: null, len: R * len, leave: 3, lift: -0.012, sweep: 0 }, 0.06, 0.28); } };
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
  else switch (a.hair) {
    case 'short':    shell({ f: 0.95, s: 1.55, b: 1.9, vol: 0.06, part: -0.5 }); topTex(7); sides(L(0.45), 2, 0.0, 0.03); nape(L(0.45)); break;
    case 'twoblock': shell({ f: 0.95, s: 1.2, b: 1.35, vol: 0.1 }); { const sd = add(hairShell(D, R, { f: 1.35, s: 1.8, b: 2.0, vol: 0, crown: 0 }), shade(hc, 0.7), 0); sd.scale.setScalar(0.985); } topTex(8); break;
    case 'mash':     shell({ f: 0.85, s: 1.75, b: 2.0, vol: 0.1 }); sides(L(0.7), 3, -0.15, 0.04); nape(L(0.7)); break;
    case 'perm':     shell({ f: 0.9, s: 1.7, b: 2.0, vol: 0.12 }); for (let k = 0; k < 18; k++) { const ph = (k / 18) * Math.PI * 2; st({ th: 0.35 + (k % 3) * 0.25, ph, len: L(0.7), lift: 0.04, puff: 0.15, curl: 0.3, wave: 0.01, leave: 1.4 }, 0.05); } break;
    case 'spiky':    shell({ f: 0.95, s: 1.55, b: 1.9, vol: 0.06 }); spike(0.05, 0, L(0.45), 0.06, 0.6); row(7, -Math.PI, Math.PI * 0.72, (ph, t, k) => spike(0.45, ph, L(0.42) + jit(k, 0.02), 0.06)); row(9, -Math.PI, Math.PI * 0.78, (ph, t, k) => spike(0.95, ph + 0.3, L(0.36) + jit(k + 3, 0.02), 0.055, 0.1)); nape(L(0.4)); break;
    case 'back':     shell({ f: 0.85, s: 1.6, b: 1.95, vol: 0.07 }); row(9, -0.85, 0.85, (ph, t, k) => st({ th: 0.88, ph, len: L(1.6), up: true, rise: 0.06, lift: 0.015, leave: 0 }, 0.048, 0.35)); [-1, 1].forEach((sg) => row(3, 1.1, 1.5, (ph) => st({ th: 1.2, ph: sg * ph, len: L(1.0), up: true, rise: 0.03, lift: 0.01, sweep: -sg * 0.6, leave: 0 }, 0.04, 0.35))); nape(L(0.55)); break;
    case 'wolf':     shell({ f: 0.9, s: 1.7, b: 2.0, vol: 0.09, crown: 0.05 }); topTex(7); sides(L(0.8), 2, 0.15, 0.04); backs(L(1.25), 7, 0.25, 0.05, false); break;
    case 'long':     shell({ f: 0.9, s: 1.7, b: 2.0, vol: 0.06, part: 0 }); sides(L(1.0), 2, -0.1, 0.035); tail(0, R * 0.0, -R * 1.0, L(1.2), 5, 0.045, 0.1); break;
    case 'medium':   shell({ f: 0.88, s: 1.75, b: 2.05, vol: 0.08, part: -0.45 }); sides(L(0.95), 3, -0.1, 0.04); backs(L(0.95), 8, 0.05, 0.05, false); break;
    case 'buzz':     { const m = add(hairShell(D, R, { f: 1.05, s: 1.55, b: 1.95, vol: 0.0, crown: 0 }), hc, 0); m.material = toon(hc, { transparent: true, opacity: 0.55 }); m.scale.setScalar(0.975); } return;
    default: shell({}); topTex(6);
  }
  if (a.hair !== 'buzz') { const cp = new THREE.Mesh(hairTint(new THREE.SphereGeometry(R * (1.045 + VOL + 0.032), 28, 6, 0, Math.PI * 2, 0, 0.4), R), toon(hc, { vertexColors: true })); cp.rotation.x = -0.12; head.add(cp); }   // つむじ
  if (!(a.sex === 'm' && a.hair === 'back')) bangs();
  if (a.ahoge === 'on') ahoge();
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
  g.translate(0, 0, -depth / 2); return tessellate(g.index ? g.toNonIndexed() : g, 0.014);
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
  happi: { sleeve: 'wide' }, samue: { sleeve: 'long' }, hakui: { sleeve: 'long', color: '#f4f2ec' }, jinbei: { sleeve: 'wide' }
};
const TEX_CACHE = {};
function fabricTex(kind) {
  if (TEX_CACHE[kind]) return TEX_CACHE[kind];
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    if (kind === 'rib') { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64); }
    if (kind === 'denim') { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; for (let k = -64; k < 64; k += 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); } }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'rib' ? 10 : 6, kind === 'rib' ? 1 : 3);
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
  switch (a.top) {
    case 'suit': vShirt(W, 0.22); collarWings(W, 0.8); tie(['#8a1f2a', '#2a3a6a', '#3a5a3a', '#6a2a6a'][typeof a.topColor === 'number' ? a.topColor % 4 : 0]); lapels(cc); buttons(2, 0.028, '#151515', 0.17); pocket(-0.07, 0.14, shade(cc, 0.9), true); break;
    case 'suitopen': vShirt(W, 0.22); collarWings(W, 1.1); lapels(cc); buttons(2, 0.028, '#151515', 0.17); break;
    case 'office': vShirt(W, 0.19); roundCollar(W); lapels(cc, 0.18); buttons(1, 0.02, '#151515', 0.2); break;
    case 'pantsuit': vShirt('#e8e2d8', 0.22); lapels(cc); buttons(2, 0.02, '#151515', 0.2); break;
    case 'shirt': collarWings(lighten(cc, 0.12)); placket(shade(cc, 0.95), 0.41, 0.0); buttons(5, 0, lighten(cc, 0.55), 0.39, 0.07); pocket(-0.06, 0.3, shade(cc, 0.94)); break;
    case 'polo': collarWings(lighten(cc, 0.1), 1.1); placket(shade(cc, 0.92), 0.42, 0.33); buttons(2, 0, '#f2f2f2', 0.405, 0.04); break;
    case 'knit': neckRib(shade(cc, 0.85)); hem(shade(cc, 0.82)); break;
    case 'hoodie': { const hood = tm(new THREE.TorusGeometry(0.075, 0.042, 10, 22, Math.PI * 1.25), cc, 0, 0.43, -0.035, 0.003); hood.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.375 + Math.PI); body.add(hood);
      [-1, 1].forEach((s) => { const y = 0.33; body.add(tm(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5), W, s * 0.028, 0.37, chestZ(f, 0.37, s * 0.028) + 0.006, 0)); body.add(tm(new THREE.CylinderGeometry(0.005, 0.005, 0.014, 6), '#c8c8c8', s * 0.028, 0.32, chestZ(f, 0.32, s * 0.028) + 0.006, 0)); });
      put(onChest(shapeGeo([[-0.075, 0.06], [0.075, 0.06], [0.085, -0.01], [-0.085, -0.01]], 0.003, 0.0015), f, 0, 0.1, 0.004), shade(cc, 0.92)); hem(shade(cc, 0.86)); break; }
    case 'jacket': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.02], [-0.045, 0.02]], 0.002, 0), f, 0, 0, 0.002), W, 0); neckRib(W, 0.042); lapels(cc, 0.3); break;
    case 'denim': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.02], [-0.045, 0.02]], 0.002, 0), f, 0, 0, 0.002), W, 0); collarWings(shade(cc, 0.85), 1.2); pocket(-0.062, 0.29, shade(cc, 0.88), true); pocket(0.062, 0.29, shade(cc, 0.88), true); buttons(3, 0.052, '#c8a04a', 0.24, 0.07); break;
    case 'work': collarWings(shade(cc, 0.85)); put(onChest(shapeGeo([[-0.003, 0.42], [0.003, 0.42], [0.003, 0.02], [-0.003, 0.02]], 0.002, 0), f, 0, 0, 0.004), '#9a9a9a', 0); pocket(-0.065, 0.29, shade(cc, 0.9), true); pocket(0.065, 0.29, shade(cc, 0.9), true); hem(shade(cc, 0.82)); break;
    case 'tee': neckRib(shade(cc, 0.86), 0.044); break;
    case 'blouse': roundCollar(lighten(cc, 0.45)); ribbon(shade(cc, 0.7)); buttons(3, 0, lighten(cc, 0.6), 0.36, 0.06); break;
    case 'onepiece': roundCollar(W); body.add(tm(new THREE.CylinderGeometry(0.113, 0.115, 0.03, 28), shade(cc, 0.72), 0, 0.17, 0, 0.002)); ribbon(shade(cc, 0.6)); break;
    case 'cardigan': put(onChest(shapeGeo([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.03], [-0.045, 0.03]], 0.002, 0), f, 0, 0, 0.002), '#f6efe4', 0); neckRib('#f6efe4', 0.042); buttons(4, 0.05, '#c8b89a', 0.34, 0.075); hem(shade(cc, 0.86)); break;
    case 'happi': crossCollar(W); body.add(tm(new THREE.CylinderGeometry(0.143, 0.146, 0.05, 28), '#2a2018', 0, 0.06, 0, 0.002));
      put(onChest(new THREE.CircleGeometry(0.03, 20), f, 0.07, 0.24, 0.006), W, 0.002); break;
    case 'samue': crossCollar(shade(cc, 0.72), 0.026); body.add(tm(new THREE.CylinderGeometry(0.145, 0.146, 0.02, 28), shade(cc, 0.7), 0, 0.12, 0, 0.002)); break;
    case 'hakui': crossCollar('#e8e4da', 0.03); { const st = tm(new THREE.CylinderGeometry(0.05, 0.054, 0.035, 18, 1, true), '#f4f2ec', 0, 0.44, 0, 0.002); body.add(st); } buttons(3, 0.06, '#d8d4c8', 0.3, 0.07); break;
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
  const f = a.sex === 'f';
  const skinC = AVATAR.color(AVATAR.SKIN, a.skin);
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
  // 首・肩
  body.add(tm(new THREE.CylinderGeometry(0.032, 0.038, 0.09, 14), skinC, 0, 0.465, 0, LN));
  [-1, 1].forEach((s) => { const sh = tm(new THREE.SphereGeometry(f ? 0.042 : 0.05, 16, 12), cc, (f ? 0.112 : 0.13) * s, 0.37, -0.008, LN); sh.scale.set(1, 0.85, 0.9); body.add(sh); });
  // 腕(袖の形は服で変わる)。 肩から 前へ出して カウンターに置く形
  const arms = [];
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
    body.add(sh); arms.push(sh);
  });
  const cheerMug = new THREE.Group();
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 12), mat('#f2b51c', { transparent: true, opacity: 0.92 }), 0, 0, 0));
  cheerMug.add(mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), mat('#fbf7ec'), 0, 0.065, 0));
  cheerMug.position.set(0, -0.31, 0.06); cheerMug.visible = false; arms[1].add(cheerMug);

  // 足(座っている形)
  if (!opt.standing) {
    const pantsC = def.pants === 'same' ? cc : (a.top === 'work' ? cc : (f ? '#3a3a4a' : '#2a2c38'));
    const skirt = lower === 'skirt';
    const legC = skirt ? skinC : pantsC;
    [-1, 1].forEach((s) => {
      const x = (f ? 0.062 : 0.072) * s;
      if (!skirt) { const th = tm(new THREE.CapsuleGeometry(f ? 0.055 : 0.06, 0.2, 6, 12), legC, x, 0.04, 0.13, LN); th.rotation.x = Math.PI / 2; body.add(th); }
      body.add(tm(new THREE.SphereGeometry(f ? 0.048 : 0.054, 12, 10), legC, x, 0.035, 0.27, LN));   // ひざ
      body.add(tm(new THREE.CapsuleGeometry(f ? 0.04 : 0.046, 0.24, 6, 12), legC, x, -0.13, 0.285, LN));
      if (skirt) body.add(tm(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), f ? '#f2ece4' : legC, x, -0.24, 0.285, 0));   // くつした
      // くつ(丸い つま先+底)
      const shoeC = f ? (skirt ? '#6a2a2a' : '#3a2a22') : '#1d1a18';
      const toe = tm(new THREE.SphereGeometry(0.045, 14, 10), shoeC, x, -0.345, 0.32, LN); toe.scale.set(0.85, 0.6, 1.35); body.add(toe);
      body.add(tm(new THREE.BoxGeometry(0.072, 0.012, 0.13), '#f2ece4', x, -0.372, 0.325, 0));
    });
    if (skirt) {   // ひざの上にかかる布 + 前に垂れる すそ
      const skc = a.top === 'office' ? '#2c2c36' : cc;
      const top = tm(new THREE.SphereGeometry(0.16, 24, 14), skc, 0, 0.055, 0.12, LN); top.scale.set(1.0, 0.35, 1.2); body.add(top);
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.175, 0.13, 24, 1, true, -Math.PI / 2, Math.PI), toon(skc, { side: THREE.DoubleSide }));
      drape.position.set(0, -0.015, 0.14); drape.scale.z = 1.15; body.add(drape);
      body.add(tm(new THREE.CylinderGeometry(0.135, 0.14, 0.08, 24), skc, 0, 0.035, 0, LN));
    }
  }

  // 頭(アニメの頭の形)
  const head = new THREE.Group(); head.position.set(0, 0.69, 0); body.add(head);
  const D = headDeform(a.face);
  const skull = new THREE.Group(); head.add(skull);
  const skullGeo = deformGeo(new THREE.SphereGeometry(R, 40, 30), D, R);
  const sk = new THREE.Mesh(skullGeo, toon(skinC)); sk.add(outlineOf(skullGeo, LN)); skull.add(sk);
  [-1, 1].forEach((s) => { const ep = sp(D, R, Math.PI / 2 + 0.1, s * Math.PI / 2 * 0.97, R * 0.97); const ear = tm(new THREE.SphereGeometry(R * 0.17, 12, 10), skinC, ep.x, ep.y, ep.z - R * 0.04, LN); ear.scale.set(0.55, 1, 0.8); skull.add(ear); });
  const faceGeo = deformGeo(new THREE.SphereGeometry(R * 1.004, 36, 28, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6), D, R);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTexture(a), transparent: true, depthWrite: false }));
  skull.add(face);
  buildHair(skull, a, R, D);
  buildAcc(skull, body, a, R, f);
  root.scale.setScalar(a.size);
  root.userData = { body, head, arms, cheerMug, torso, t: Math.random() * 10, cheer: 0, talk: 0 };
  if (!window.__nobake) bakeAvatar(root, [body, head, arms[0], arms[1]], new Set([cheerMug]));
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
    case 'cap': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.25), AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor), 0, 0, 0, 0.003); c.rotation.x = -0.12; head.add(c);
      const v = tm(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), shade(AVATAR.color(AVATAR.CLOTH_COLOR, a.topColor), 0.85), 0, R * 0.42, R * 0.78); v.rotation.x = 0.15; head.add(v); break; }
    case 'beanie': { const c = tm(new THREE.SphereGeometry(R * 1.12, 26, 14, 0, Math.PI * 2, 0, 1.3), '#c87a3a', 0, R * 0.06, 0, 0.003); c.rotation.x = -0.1; head.add(c);
      const b = tm(new THREE.CylinderGeometry(R * 1.1, R * 1.12, R * 0.3, 26, 1, true), '#a8622a', 0, R * 0.42, -R * 0.06); b.rotation.x = -0.1; head.add(b); head.add(tm(new THREE.SphereGeometry(R * 0.18, 10, 8), '#f2ece0', 0, R * 1.18, -R * 0.12)); break; }
    case 'necklace': case 'earring': break;
    case 'beret': { const b = tm(new THREE.SphereGeometry(R * 0.95, 24, 12), '#8a2a3a', R * 0.12, R * 0.78, -R * 0.05, 0.003); b.scale.set(1.1, 0.32, 1.05); b.rotation.z = -0.25; head.add(b); break; }
    case 'band': { const holder = new THREE.Group(); holder.rotation.x = 0.3; holder.position.y = R * 0.02;   // 前髪の うしろ(頭のてっぺん寄り)を通す
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R * 1.15, 0.013, 6, 30, Math.PI), toon('#c8263a')); holder.add(arc); head.add(holder); break; }
    case 'ribbon': { const g = new THREE.Group(); g.position.set(0, R * 0.45, -R * 0.98); [-1, 1].forEach((s) => { const w = tm(new THREE.ConeGeometry(0.04, 0.07, 4), '#e86a8a', s * 0.035, 0, 0, 0.003); w.rotation.z = s * Math.PI / 2; g.add(w); }); g.add(tm(new THREE.SphereGeometry(0.015, 8, 6), '#c84a6a')); head.add(g); break; }
  }
  if (!a.owner && (a.acc === 'earring')) [-1, 1].forEach((s) => { head.add(tm(new THREE.SphereGeometry(0.012, 8, 6), '#e8c84a', R * 0.98 * s, -R * 0.28, 0)); head.add(tm(new THREE.TorusGeometry(0.014, 0.003, 6, 12), '#e8c84a', R * 0.98 * s, -R * 0.36, 0)); });
  if (!a.owner && a.acc === 'necklace') { const n = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: '#d8b84a' })); n.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI); n.position.set(0, 0.42, 0.003); body.add(n); body.add(tm(new THREE.SphereGeometry(0.012, 8, 6), '#e8e8f0', 0, 0.355, 0.11)); }
  if (a.owner) {
    switch (a.head) {
      case 'hachimaki': case 'nejiri': {
        const band = tm(new THREE.TorusGeometry(R * 1.03, a.head === 'nejiri' ? 0.02 : 0.016, 8, 36), '#f6f4ee', 0, R * 0.3, 0, 0.003); band.rotation.x = Math.PI / 2 + 0.15; head.add(band);
        if (a.head === 'nejiri') for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2; head.add(tm(new THREE.BoxGeometry(0.006, 0.03, 0.01), '#2a3a6a', Math.sin(ang) * R * 1.04, R * 0.3 + Math.cos(ang) * R * 0.15 * 0.98, Math.cos(ang) * R * 1.04)); }
        const knot = tm(new THREE.SphereGeometry(0.025, 8, 6), '#f6f4ee', 0, R * 0.25, -R * 1.02, 0.003); head.add(knot);
        [-1, 1].forEach((s) => { const tl = tm(new THREE.BoxGeometry(0.03, 0.09, 0.006), '#f6f4ee', s * 0.03, R * 0.12, -R * 1.04); tl.rotation.z = s * 0.4; head.add(tl); });
        break; }
      case 'tenugui': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.2), '#2a3a6a', 0, 0, 0, 0.003); c.rotation.x = -0.25; head.add(c);
        for (let k = 0; k < 10; k++) head.add(tm(new THREE.SphereGeometry(0.01, 6, 5), '#f6f4ee', Math.sin(k * 1.9) * R * 0.6, R * 0.8 + Math.cos(k * 2.3) * R * 0.1, Math.cos(k * 1.9) * R * 0.5));
        head.add(tm(new THREE.SphereGeometry(0.025, 8, 6), '#2a3a6a', 0, R * 0.35, -R * 1.02, 0.003)); break; }
      case 'itamae': { const c = tm(new THREE.CylinderGeometry(R * 0.95, R * 1.0, R * 0.9, 24), '#f6f4ee', 0, R * 0.8, -R * 0.05, 0.003); head.add(c); break; }
      case 'bandana': { const c = tm(new THREE.SphereGeometry(R * 1.1, 26, 14, 0, Math.PI * 2, 0, 1.3), '#8a1f2a', 0, 0, 0, 0.003); c.rotation.x = -0.2; head.add(c);
        for (let k = 0; k < 14; k++) head.add(tm(new THREE.SphereGeometry(0.008, 6, 5), '#f6f4ee', Math.sin(k * 2.1) * R * 0.7, R * 0.7 + Math.cos(k * 1.3) * R * 0.15, Math.cos(k * 2.1) * R * 0.6));
        head.add(tm(new THREE.ConeGeometry(0.03, 0.08, 4), '#8a1f2a', 0, R * 0.2, -R * 1.08, 0.003)); break; }
    }
    if (a.apron && a.apron !== 'none') {   // 前掛け: 下の角が丸く、体に そって 曲がった布 + 腰ひも + ポケット
      const ac = { navy: '#1f2a4a', black: '#1a1a1e', white: '#f2efe6', brown: '#6a4428' }[a.apron];
      const W2 = 0.15, top = 0.13, bot = -0.3, rc = 0.03, pts = [];
      pts.push([-W2, top], [W2, top]);
      for (let k = 0; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([W2 - rc + Math.sin(an) * rc * 0, bot + rc - Math.sin(an) * rc]); }
      pts.length = 2; pts.push([W2, bot + rc]); for (let k = 1; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([W2 - rc + Math.cos(an) * rc, bot + rc - Math.sin(an) * rc]); }
      pts.push([-W2 + rc, bot]); for (let k = 1; k <= 6; k++) { const an = (k / 6) * Math.PI / 2; pts.push([-W2 + rc - Math.sin(an) * rc, bot + rc - Math.cos(an) * rc]); }
      const g = shapeGeo(pts, 0.006, 0.002), p = g.attributes.position, Rr = 0.16;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), an = x / Rr; const sway = y < 0 ? -y * 0.15 : 0; p.setXYZ(i, Math.sin(an) * (Rr + z), y, Math.cos(an) * (Rr + z) * 0.78 + sway + 0.012); }
      g.computeVertexNormals();
      const ap = tm(g, ac, 0, 0, 0, 0.003); body.add(ap);
      body.add(tm(new THREE.CylinderGeometry(0.152, 0.154, 0.028, 28), shade(ac, 0.85), 0, top, 0, 0.002));   // 腰ひも
      const knot = tm(new THREE.SphereGeometry(0.018, 10, 8), shade(ac, 0.85), 0, top, -0.115, 0.002); body.add(knot);
      [-1, 1].forEach((s2) => { const tl = tm(new THREE.BoxGeometry(0.02, 0.09, 0.006), shade(ac, 0.85), s2 * 0.02, top - 0.05, -0.118, 0.002); tl.rotation.z = s2 * 0.25; body.add(tl); });
      const pk = shapeGeo([[-0.05, 0.03], [0.05, 0.03], [0.05, -0.03], [-0.05, -0.03]], 0.003, 0.001), pp = pk.attributes.position;
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i) - 0.08, z = pp.getZ(i), an = x / Rr; pp.setXYZ(i, Math.sin(an) * (Rr + 0.006 + z), y, Math.cos(an) * (Rr + 0.006 + z) * 0.78 + 0.08 * 0.15 + 0.014); }
      pk.computeVertexNormals(); body.add(tm(pk, lighten(ac, 0.12), 0, 0, 0, 0.002));
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
  const SHOPNAME = opts.name || SHOP.NAME;   // 回ごとの店の名前(ちょうちん・のれんの文字)
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
    const chars = Array.from(SHOPNAME.replace(/^居酒屋\s*/, '') || '酒').slice(0, 3);
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
    const nm = SHOPNAME.replace(/^居酒屋\s*/, '') || SHOPNAME;
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
        if (portrait) { const ex = Math.max(0, N - 7) * 0.22; wantPos.set(-L / 2 - 0.1 - ex * 0.5, 2.1 + ex * 0.4, -1.25 - ex * 0.3); wantLook.set(L * 0.12, 0.95, 1.45); wantFov = 64 + Math.max(0, N - 7) * 1.5; }
        else { wantPos.set(0, 2.3, -1.85); wantLook.set(0, 1.2, 1.0); wantFov = fitFov(GUEST_Z + 1.85); }
        break;
      default:
        if (portrait) { const ex = Math.max(0, N - 7) * 0.32; wantPos.set(L / 2 + 0.75 + ex * 0.4, 2.55 + ex * 0.35, 2.75 + ex); wantLook.set(-L * 0.12, 1.0, -0.35); wantFov = 64 + Math.max(0, N - 7) * 1.5; }
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
    if (Math.abs(dx) + Math.abs(dy) > 14) drag.moved = true;   // 指が少しずれても「押した」にする
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
      if (!running) { drag = null; return; }
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
    name: SHOPNAME,
    stop() { running = false; api.onTap = api.onItemTap = api.onTagTap = api.onFrame = null; window.removeEventListener('resize', resize); renderer.dispose(); }
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
