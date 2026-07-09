import React from 'react';
import {
  firebaseEnabled, connectSky, newWishId, releaseWish, rewriteWish,
  restWish, prayForWish, reportWish,
} from './firebase';

/*
 * LUMEN — a shared night sky where every wish becomes a star.
 * Ported from the Claude Design prototype (LUMEN.dc.html).
 * With Firebase configured (.env.local), wishes live in a shared Firestore sky;
 * without it, they stay in this browser's localStorage as before.
 */
export default class App extends React.Component {
  static defaultProps = {
    starScale: 1.8, // 0.6 – 1.8
    motion: 'gentle', // 'gentle' | 'still'
    shootingStars: 'lively', // 'off' | 'calm' | 'lively'
  };

  constructor(props) {
    super(props);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('lumen-v1')) || {}; } catch (e) { /* fresh sky */ }
    this.state = {
      screen: 'choose',
      openWishId: null,
      flagView: false,
      justFlagged: false,
      flaggedIds: saved.flaggedIds || {},
      prayedExtra: saved.prayedExtra || {},
      userPrayed: saved.userPrayed || {},
      userWishes: saved.userWishes || [],
      sharedWishes: [],
      uid: null,
      showForm: false,
      formLife: 0,
      editingWid: null,
      confirmDeleteWid: null,
      formText: '',
      formName: '',
      submitted: false,
      cooldownUntil: saved.cooldownUntil || 0,
      now: Date.now(),
      isMobile: typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
    };
  }

  static W = 8000;
  static H = 5200;
  static ZOOM_FADE_START = 0.42; // fraction of zMin where the "leaving the sky" fade begins
  static ZOOM_EXIT = 0.22; // fraction of zMin — reaching this sends the visitor back to the landing page

  drawSky(canvas) {
    if (!canvas) return;

    // ── torus-wrapped fractal noise nebula: seamless across tile edges,
    //    organic and non-repeating within the tile ──
    const NW = 704, NH = 458; // noise resolution (upscaled — soft haze hides it)
    const hash = (x, y, o) => {
      let n = (x * 1619 + y * 31337 + o * 6971) | 0;
      n = (n << 13) ^ n;
      n = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) & 0x7fffffff;
      return n / 0x7fffffff;
    };
    const fade = (t) => t * t * (3 - 2 * t);
    const vnoise = (u, v, f, o) => { // value noise on a wrapping lattice
      const fx = f * 3, fy = f * 2;
      const gx = u * fx, gy = v * fy;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = fade(gx - x0), ty = fade(gy - y0);
      const xa = ((x0 % fx) + fx) % fx, ya = ((y0 % fy) + fy) % fy;
      const xb = (xa + 1) % fx, yb = (ya + 1) % fy;
      const a = hash(xa, ya, o), b = hash(xb, ya, o), c = hash(xa, yb, o), d = hash(xb, yb, o);
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    const fbm3 = (u, v, o) => (vnoise(u, v, 2, o) * 0.5 + vnoise(u, v, 4, o + 7) * 0.25 + vnoise(u, v, 8, o + 13) * 0.125) / 0.875;
    const fbm4 = (u, v, o) => (vnoise(u, v, 2, o) * 0.5 + vnoise(u, v, 4, o + 7) * 0.25 + vnoise(u, v, 8, o + 13) * 0.125 + vnoise(u, v, 16, o + 29) * 0.0625) / 0.9375;

    const nc = document.createElement('canvas');
    nc.width = NW; nc.height = NH;
    const nctx = nc.getContext('2d');
    const img = nctx.createImageData(NW, NH);
    const px = img.data;
    for (let j = 0; j < NH; j++) {
      const v = j / NH;
      for (let i = 0; i < NW; i++) {
        const u = i / NW;
        // domain warp → wispy filaments instead of round puffs
        const uu = u + (fbm3(u, v, 101) - 0.5) * 0.14;
        const vv = v + (fbm3(u, v, 211) - 0.5) * 0.14;
        // fine structure × patchy large-scale gathering
        const d = Math.max(0, fbm4(uu, vv, 301) - 0.34) * 2.1;
        const m = Math.max(0, vnoise(u, v, 2, 401) * 0.6 + vnoise(u, v, 4, 409) * 0.4 - 0.22) * 1.5;
        const dens = Math.pow(d, 1.5) * Math.pow(m, 1.3);
        // dark dust lanes carved through the brighter haze
        const ridge = 1 - Math.abs(fbm4(uu + 0.37, vv + 0.61, 501) * 2 - 1);
        const dust = Math.min(1, Math.pow(Math.max(0, ridge - 0.68) * 3.1, 2)) * Math.min(1, dens * 2.5);
        // hue drift: slate blue → pale lavender, faint warm glow in dense cores
        const t = fbm3(u, v, 601);
        const glow = Math.min(1, Math.max(0, dens - 0.5) * 1.6);
        let r = 112 + t * 74 + glow * 92;
        let g = 138 + t * 44 + glow * 62;
        let b = 212 + t * 26 + glow * 8;
        let a = Math.min(0.5, dens * 0.42);
        r = r * (1 - dust) + 7 * dust;
        g = g * (1 - dust) + 9 * dust;
        b = b * (1 - dust) + 17 * dust;
        a = a * (1 - dust * 0.5) + dust * 0.16;
        const k = (j * NW + i) * 4;
        px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = a * 255;
      }
    }
    nctx.putImageData(img, 0, 0);

    // blit the seamless tile 3×3; keep the backing store at noise resolution and
    // let CSS stretch it to the world — mobile GPUs reject huge canvases and the
    // haze would render cropped/glitchy
    canvas.width = NW * 3; canvas.height = NH * 3;
    const mctx = canvas.getContext('2d');
    for (let ox = 0; ox < 3; ox++) for (let oy = 0; oy < 3; oy++) {
      mctx.drawImage(nc, ox * NW, oy * NH);
    }
  }

  // ─── landing galaxy (procedural, slowly rotating, dive-in on enter) ───
  makeSprite(size, r, g, b) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    gr.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  makeCloudSprite(size, r, g, b, blobs) {
    // lumpy, turbulent puff — overlapping soft blobs inside one sprite
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    let seed = size * 977 + r * 31 + b;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < blobs; i++) {
      const bx = size * (0.25 + rnd() * 0.5), by = size * (0.25 + rnd() * 0.5);
      const br = size * (0.10 + rnd() * 0.22);
      const gr = x.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.16 + rnd() * 0.2) + ')');
      gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      x.fillStyle = gr;
      x.beginPath(); x.arc(bx, by, br, 0, 6.284); x.fill();
    }
    return c;
  }

  setupGalaxy() {
    let seed = 271828;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const stars = [], dust = [], clouds = [], bg = [];
    const WIND = 4.4, ARMS = 2;
    const armTh = (i, r, spread) => (i % ARMS) * Math.PI + r * WIND + (rnd() - 0.5) * spread;
    const height = (r) => {
      // 3D thickness: thin disc + swollen core bulge (torus-like body)
      const bulge = Math.pow(Math.max(0, 1 - r * 1.6), 2) * 0.30;
      const disc = 0.035 + 0.05 * Math.sin(Math.min(1, r) * Math.PI);
      return (rnd() * 2 - 1) * (disc + bulge);
    };
    for (let i = 0; i < 2600; i++) {
      const r = Math.pow(rnd(), 0.62);
      const th = armTh(i, r, 0.35 + (1 - r) * 0.9);
      const mix = Math.min(1, r * 1.25); // 0 core-warm → 1 outer-blue
      const cr = Math.round(255 - 115 * mix), cg = Math.round(242 - 82 * mix), cb = Math.round(214 + 41 * mix);
      stars.push({
        r, th, h: height(r), s: rnd() < 0.88 ? 0.5 + rnd() * 1.1 : 1.6 + rnd() * 1.8,
        a: 0.25 + rnd() * 0.75, c: 'rgb(' + cr + ',' + cg + ',' + cb + ')',
        w: 0.9 / (0.25 + r), tw: rnd() * 6.28, tws: 0.3 + rnd() * 1.2
      });
    }
    // luminous nebula clouds hugging the arms — denser mid-radius (torus ring)
    for (let i = 0; i < 420; i++) {
      const r = 0.16 + Math.pow(rnd(), 0.75) * 0.86;
      const ring = Math.exp(-Math.pow((r - 0.5) / 0.34, 2));
      const th = armTh(i, r, 0.4);
      const mix = Math.min(1, r * 1.15);
      clouds.push({
        r, th, h: height(r) * 0.7, s: 26 + rnd() * 95,
        a: (0.05 + rnd() * 0.10) * (0.35 + ring * 0.65),
        warm: mix < 0.42, w: 0.9 / (0.25 + r), rot: rnd() * 6.28
      });
    }
    // dark mottled dust lanes
    for (let i = 0; i < 620; i++) {
      const r = 0.14 + Math.pow(rnd(), 0.8) * 0.84;
      const th = armTh(i, r, 0.26) + 0.20;
      dust.push({ r, th, h: height(r) * 0.5, s: 20 + rnd() * 55, a: 0.10 + rnd() * 0.20, w: 0.9 / (0.25 + r), rot: rnd() * 6.28 });
    }
    for (let i = 0; i < 320; i++) {
      bg.push({ x: rnd(), y: rnd(), s: rnd() < 0.9 ? 0.5 + rnd() * 0.8 : 1.3 + rnd() * 1.1, a: 0.2 + rnd() * 0.7, tw: rnd() * 6.28, tws: 0.4 + rnd() * 1.4 });
    }
    this._gal = {
      stars, dust, clouds, bg,
      sprWarm: this.makeSprite(64, 255, 236, 190),
      sprBlue: this.makeSprite(64, 140, 178, 255),
      cloudBlue: this.makeCloudSprite(128, 96, 140, 235, 15),
      cloudPale: this.makeCloudSprite(128, 168, 194, 255, 13),
      cloudWarm: this.makeCloudSprite(128, 255, 226, 178, 14),
      cloudDark: this.makeCloudSprite(128, 5, 8, 16, 16)
    };
  }

  drawGalaxy(now) {
    const cv = this._galaxyCanvas;
    if (!cv || !cv.isConnected) { this._galaxyRaf = null; return; }
    const vw = cv.clientWidth, vh = cv.clientHeight;
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    if (!this._gal || !this._gal.clouds) this.setupGalaxy();
    const G = this._gal;
    const ctx = cv.getContext('2d');
    const t = now / 1000;

    // dive progress
    let Z = 1, bloom = 0;
    if (this._dive) {
      const dt = Math.min(1, (now - this._dive.t0) / this._dive.dur);
      const e = dt * dt * dt;
      Z = 1 + e * 30;
      bloom = dt < 0.55 ? 0 : (dt - 0.55) / 0.45;
      if (dt >= 1 && !this._dive.done) {
        this._dive.done = true;
        this.setState({ screen: 'sky' });
        this._dive = null; this._galaxyRaf = null;
        return;
      }
    }

    // deep space background
    const bgGrad = ctx.createLinearGradient(0, 0, vw, vh);
    bgGrad.addColorStop(0, '#02040a');
    bgGrad.addColorStop(0.5, '#050a18');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, vw, vh);
    const Pb = this._par || { x: 0, y: 0 };
    for (const s of G.bg) {
      const f = 0.55 + 0.45 * Math.sin(s.tw + t * s.tws);
      const depth = s.s * 6; // bigger stars feel closer, drift more
      ctx.fillStyle = 'rgba(225,232,255,' + (s.a * f) + ')';
      ctx.fillRect(s.x * vw - Pb.x * depth, s.y * vh - Pb.y * depth, s.s, s.s);
    }

    // parallax: ease toward mouse / gyroscope target
    const P = this._par || { x: 0, y: 0, tx: 0, ty: 0 };
    P.x += (P.tx - P.x) * 0.045;
    P.y += (P.ty - P.y) * 0.045;

    const cx = vw * 0.52 - P.x * vw * 0.035, cy = vh * 0.44 - P.y * vh * 0.045;
    const R = Math.min(vw, vh) * 0.72;
    const rot = t * 0.02; // whole-disc drift
    const q = 0.34 + P.y * 0.05; // disc squash (3D tilt)
    const HS = 0.92; // height scale for out-of-plane thickness
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Z, Z);
    ctx.rotate(-0.42 + P.x * 0.05);

    // outer halo haze (squashed ellipse)
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.scale(1, q + 0.16);
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.15);
    g.addColorStop(0, 'rgba(96, 132, 220, 0.22)');
    g.addColorStop(0.55, 'rgba(70, 104, 190, 0.09)');
    g.addColorStop(1, 'rgba(70, 104, 190, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, 6.284); ctx.fill();
    ctx.restore();

    // luminous nebula clouds (behind stars)
    for (const c of G.clouds) {
      const th = c.th + rot * c.w;
      const x = Math.cos(th) * c.r * R;
      const py = Math.sin(th) * c.r * R * q + c.h * R * HS;
      ctx.globalAlpha = c.a;
      const spr = c.warm ? G.cloudWarm : (c.r > 0.62 ? G.cloudBlue : G.cloudPale);
      ctx.save();
      ctx.translate(x, py);
      ctx.rotate(c.rot);
      ctx.scale(1, 0.62);
      ctx.drawImage(spr, -c.s / 2, -c.s / 2, c.s, c.s);
      ctx.restore();
    }

    // arm stars with 3D thickness (differential rotation)
    for (const s of G.stars) {
      const th = s.th + rot * s.w;
      const x = Math.cos(th) * s.r * R;
      const py = Math.sin(th) * s.r * R * q + s.h * R * HS;
      const f = 0.75 + 0.25 * Math.sin(s.tw + t * s.tws);
      if (s.s < 1.6) {
        ctx.globalAlpha = s.a * f;
        ctx.fillStyle = s.c;
        ctx.fillRect(x, py, s.s, s.s);
      } else {
        ctx.globalAlpha = s.a * f * 0.9;
        const spr = s.r < 0.3 ? G.sprWarm : G.sprBlue;
        ctx.drawImage(spr, x - s.s * 2, py - s.s * 2, s.s * 4, s.s * 4);
      }
    }
    ctx.globalAlpha = 1;

    // core glow: bright warm heart + swollen bulge
    ctx.save();
    ctx.scale(1, q + 0.3);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    g.addColorStop(0, 'rgba(255, 246, 220, 0.98)');
    g.addColorStop(0.15, 'rgba(255, 232, 186, 0.5)');
    g.addColorStop(0.5, 'rgba(180, 196, 255, 0.15)');
    g.addColorStop(1, 'rgba(180, 196, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, 6.284); ctx.fill();
    ctx.restore();

    // dark mottled dust lanes — stronger on the near (lower) side
    ctx.globalCompositeOperation = 'source-over';
    for (const d of G.dust) {
      const th = d.th + rot * d.w;
      const x = Math.cos(th) * d.r * R;
      const py = Math.sin(th) * d.r * R * q + d.h * R * HS;
      ctx.globalAlpha = d.a * (py > 0 ? 1 : 0.35);
      ctx.save();
      ctx.translate(x, py);
      ctx.rotate(d.rot);
      ctx.scale(1, 0.55);
      ctx.drawImage(G.cloudDark, -d.s / 2, -d.s / 2, d.s, d.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // dive bloom
    if (bloom > 0) {
      const bg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(vw, vh) * 0.8);
      bg2.addColorStop(0, 'rgba(240, 244, 255, ' + Math.min(1, bloom * 1.3) + ')');
      bg2.addColorStop(1, 'rgba(190, 205, 250, ' + (bloom * 0.85) + ')');
      ctx.fillStyle = bg2;
      ctx.fillRect(0, 0, vw, vh);
    }

    this._galaxyRaf = requestAnimationFrame((n) => this.drawGalaxy(n));
  }

  startGalaxy(el) {
    if (!el || el === this._galaxyCanvas) return;
    this._galaxyCanvas = el;
    if (!this._par) {
      this._par = { x: 0, y: 0, tx: 0, ty: 0 };
      this._onPointerPar = (e) => {
        this._par.tx = (e.clientX / window.innerWidth) * 2 - 1;
        this._par.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      this._onGyro = (e) => {
        if (e.gamma == null || e.beta == null) return;
        // gamma: left/right tilt (±45°), beta: front/back (rest ≈ 45° when held)
        this._par.tx = Math.max(-1, Math.min(1, e.gamma / 28));
        this._par.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
      };
      window.addEventListener('pointermove', this._onPointerPar);
      window.addEventListener('deviceorientation', this._onGyro);
      // iOS needs an explicit permission request tied to a user gesture
      this._onFirstTouch = () => {
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
          DeviceOrientationEvent.requestPermission().catch(() => {});
        }
        window.removeEventListener('touchend', this._onFirstTouch);
      };
      window.addEventListener('touchend', this._onFirstTouch);
    }
    if (!this._galaxyRaf) this._galaxyRaf = requestAnimationFrame((n) => this.drawGalaxy(n));
  }

  // ─── camera (pan + zoom, applied directly to the world element for smoothness) ───
  applyCam() {
    if (!this._world) return;
    const c = this._cam;
    this._world.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px) scale(' + c.z + ')';
    this.updateSurfaceFade();
  }

  clampCam() {
    const vp = this._viewport;
    if (!vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const c = this._cam;
    const zMin = Math.max(vw / App.W, vh / App.H);
    const floorZ = zMin * App.ZOOM_EXIT;
    c.z = Math.min(4, Math.max(floorZ, c.z));
    // infinite sky: content repeats every tile — wrap the camera instead of clamping it
    const pw = App.W * c.z, ph = App.H * c.z;
    c.x = (((c.x % pw) + pw) % pw) - pw;
    c.y = (((c.y % ph) + ph) % ph) - ph;
  }

  // as the visitor pulls out past ZOOM_FADE_START, the sky quietly dissolves to
  // black; crossing ZOOM_EXIT completes the gesture and returns them to the shore
  updateSurfaceFade() {
    const vp = this._viewport;
    if (!vp || this._leavingSky) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    if (!vw || !vh) return;
    const zMin = Math.max(vw / App.W, vh / App.H);
    const fadeStart = zMin * App.ZOOM_FADE_START;
    const exitZ = zMin * App.ZOOM_EXIT;
    const z = this._cam.z;
    let fade = 0;
    if (z <= fadeStart) fade = Math.min(1, (fadeStart - z) / (fadeStart - exitZ));
    if (this._fadeEl) this._fadeEl.style.opacity = String(fade);
    if (this._fadeCaption) this._fadeCaption.style.opacity = String(Math.max(0, (fade - 0.35) / 0.65));
    if (fade >= 1) this.leaveSky();
  }

  leaveSky() {
    if (this._leavingSky) return;
    this._leavingSky = true;
    setTimeout(() => {
      this.setState({ screen: 'choose', diving: false });
      this._leavingSky = false;
      this._camReady = false;
      if (this._fadeEl) this._fadeEl.style.opacity = '0';
      if (this._fadeCaption) this._fadeCaption.style.opacity = '0';
    }, 550);
  }

  zoomAt(factor, px, py) {
    if (this._leavingSky) return;
    const c = this._cam;
    const oldZ = c.z;
    c.z = c.z * factor;
    this.clampCam();
    const k = c.z / oldZ;
    c.x = px - (px - c.x) * k;
    c.y = py - (py - c.y) * k;
    this.clampCam();
    this.applyCam();
  }

  initCam() {
    const vp = this._viewport;
    if (!vp || this._camReady) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    if (!vw || !vh) return;
    const z = Math.max(vw / App.W, vh / App.H) * 1.25;
    this._cam = { z, x: -App.W * z / 2, y: -App.H * z / 2 };
    this._camReady = true;
    this.clampCam();
    this.applyCam();
  }

  // ─── wish launch sequence: camera glide → shooting star → ignite ───
  animateCamTo(starFrac, dur, done) {
    const vp = this._viewport;
    if (!vp) { done(); return; }
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const c0 = { ...this._cam };
    const zMin = Math.max(vw / App.W, vh / App.H);
    const z1 = Math.max(c0.z, zMin * 1.6);
    // world coords of the middle-tile copy of the star
    const wx = (starFrac.l / 100 + 1) * App.W;
    const wy = (starFrac.t / 100 + 1) * App.H;
    // its current on-screen position, wrapped to the copy nearest viewport center
    const p0 = App.W * c0.z, q0 = App.H * c0.z;
    let sx0 = wx * c0.z + c0.x; sx0 -= p0 * Math.round((sx0 - vw / 2) / p0);
    let sy0 = wy * c0.z + c0.y; sy0 -= q0 * Math.round((sy0 - vh / 2) / q0);
    const ax = (sx0 - c0.x) / c0.z, ay = (sy0 - c0.y) / c0.z; // chosen copy in world coords
    const t0 = performance.now();
    const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      const z = c0.z + (z1 - c0.z) * e;
      const sx = sx0 + (vw / 2 - sx0) * e;
      const sy = sy0 + (vh / 2 - sy0) * e;
      this._cam = { z, x: sx - ax * z, y: sy - ay * z };
      this.clampCam();
      this.applyCam();
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }

  shootStar(done) {
    const vp = this._viewport;
    if (!vp) { done(); return; }
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const head = document.createElement('div');
    head.style.cssText = 'position:absolute;left:0;top:0;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 10px 3px rgba(255,255,255,.9),0 0 26px 8px rgba(190,200,255,.5);pointer-events:none;z-index:30;';
    const tail = document.createElement('div');
    tail.style.cssText = 'position:absolute;left:0;top:0;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,.9),rgba(255,255,255,0));transform-origin:0 50%;pointer-events:none;z-index:29;';
    vp.appendChild(tail); vp.appendChild(head);
    // quadratic bezier from below the screen up into the landing point (screen center)
    const P0 = { x: vw * 0.62, y: vh + 60 };
    const P1 = { x: vw * 0.85, y: vh * 0.28 };
    const P2 = { x: vw / 2, y: vh / 2 };
    const t0 = performance.now(), dur = 950;
    const easeOut = (t) => 1 - Math.pow(1 - t, 2.4);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = easeOut(t);
      const u = 1 - e;
      const x = u * u * P0.x + 2 * u * e * P1.x + e * e * P2.x;
      const y = u * u * P0.y + 2 * u * e * P1.y + e * e * P2.y;
      const dx = 2 * u * (P1.x - P0.x) + 2 * e * (P2.x - P1.x);
      const dy = 2 * u * (P1.y - P0.y) + 2 * e * (P2.y - P1.y);
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const len = Math.max(18, (1 - e) * 130);
      head.style.transform = 'translate(' + (x - 2.5) + 'px,' + (y - 2.5) + 'px)';
      head.style.opacity = t > 0.92 ? String((1 - t) / 0.08) : '1';
      tail.style.width = len + 'px';
      tail.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (ang + 180) + 'deg)';
      tail.style.opacity = t > 0.85 ? String((1 - t) / 0.15) : '1';
      if (t < 1) requestAnimationFrame(step);
      else { head.remove(); tail.remove(); done(); }
    };
    requestAnimationFrame(step);
  }

  launchSequence(w) {
    this._animating = true;
    setTimeout(() => {
      this.animateCamTo({ l: w.l, t: w.t }, 1400, () => {
        this.shootStar(() => {
          this._animating = false;
          this.setState({ launchHideWid: null, launchMarkerWid: w.wid });
          clearTimeout(this._markerT);
          this._markerT = setTimeout(() => this.setState({ launchMarkerWid: null }), 5200);
        });
      });
    }, 380);
  }

  // ─── ambient shooting stars ───
  spawnAmbientStar() {
    const vp = this._viewport;
    if (!vp || this.state.screen !== 'sky' || this._animating) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    // random streak: starts in the upper region, falls diagonally
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x0 = vw * (0.1 + Math.random() * 0.8);
    const y0 = vh * (0.05 + Math.random() * 0.35);
    const len = vw * (0.12 + Math.random() * 0.16);
    const ang = (18 + Math.random() * 30) * (Math.PI / 180);
    const x1 = x0 + Math.cos(ang) * len * dir;
    const y1 = y0 + Math.sin(ang) * len;
    const dur = 600 + Math.random() * 500;
    const bright = 0.35 + Math.random() * 0.4;

    const head = document.createElement('div');
    head.style.cssText = 'position:absolute;left:0;top:0;width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,' + (bright + 0.2) + ');box-shadow:0 0 6px 2px rgba(255,255,255,' + bright * 0.7 + ');pointer-events:none;z-index:5;';
    const tail = document.createElement('div');
    tail.style.cssText = 'position:absolute;left:0;top:0;height:1.5px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,' + bright + '),rgba(255,255,255,0));transform-origin:0 50%;pointer-events:none;z-index:4;';
    vp.appendChild(tail); vp.appendChild(head);

    const angDeg = Math.atan2(y0 - y1, x0 - x1) * 180 / Math.PI;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 1.8);
      const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e;
      const fade = t < 0.15 ? t / 0.15 : t > 0.6 ? (1 - t) / 0.4 : 1;
      head.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      head.style.opacity = String(fade);
      tail.style.width = Math.max(10, (1 - t) * 70) + 'px';
      tail.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + angDeg + 'deg)';
      tail.style.opacity = String(fade);
      if (t < 1) requestAnimationFrame(step);
      else { head.remove(); tail.remove(); }
    };
    requestAnimationFrame(step);
  }

  scheduleAmbient() {
    clearTimeout(this._ambientT);
    const mode = this.props.shootingStars ?? 'calm';
    if (mode === 'off') return;
    const base = mode === 'lively' ? 2500 : 7000;
    const jitter = mode === 'lively' ? 4000 : 9000;
    this._ambientT = setTimeout(() => {
      this.spawnAmbientStar();
      this.scheduleAmbient();
    }, base + Math.random() * jitter);
  }

  // ─── background music: no-copyright space ambient streamed from YouTube, looped ───
  static TRACKS = [
    'ozb32hgHdo4', // Tunetank / Finval — "Stasis" (space cinematic ambient, no copyright)
    '1ac94_7ePlw', // Sci-Fi Ambient Music No Copyright — space ambient
    'g7h5eT3X_XU'  // Space Ambient Background Music / Universe (Pixabay license)
    // two more slots — add YouTube video IDs here
  ];

  startMusic() {
    if (this._ytFailed) { this.startSynth(); return; }
    if (this._yt) { try { this._yt.playVideo(); } catch (e) {} return; }
    if (this._ytLoading) return;
    this._ytLoading = true;
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;pointer-events:none;';
    const mount = document.createElement('div');
    holder.appendChild(mount);
    document.body.appendChild(holder);
    const ids = App.TRACKS;
    let errs = 0;
    const init = () => {
      this._yt = new window.YT.Player(mount, {
        width: 2, height: 2,
        videoId: ids[0],
        playerVars: { autoplay: 1, loop: 1, playlist: ids.join(','), controls: 0, disablekb: 1 },
        events: {
          onReady: (e) => {
            e.target.setVolume(30);
            if (this.state.musicOn) e.target.playVideo(); else e.target.pauseVideo();
          },
          onStateChange: (e) => {
            if (e.data === 1) {
              const d = e.target.getVideoData ? e.target.getVideoData() : null;
              if (d && d.title && d.title !== this.state.nowPlaying) this.setState({ nowPlaying: d.title });
            }
          },
          onError: () => {
            errs += 1;
            if (errs >= ids.length) {
              try { this._yt.destroy(); } catch (e2) {}
              this._yt = null; this._ytFailed = true;
              holder.remove();
              if (this.state.musicOn) this.startSynth();
            } else {
              try { this._yt.nextVideo(); } catch (e2) {}
            }
          }
        }
      });
    };
    if (window.YT && window.YT.Player) { init(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); init(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { this._ytFailed = true; holder.remove(); if (this.state.musicOn) this.startSynth(); };
      document.head.appendChild(s);
    }
  }

  stopMusic() {
    if (this._yt) { try { this._yt.pauseVideo(); } catch (e) {} }
    this.stopSynth();
  }

  // ─── fallback ambient (Web Audio, no files) — used if YouTube can't load ───
  startSynth() {
    this.setState({ nowPlaying: 'Night Hum — LUMEN ambient' });
    if (this._audio) { this._audio.master.gain.setTargetAtTime(0.16, this._audio.ctx.currentTime, 0.8); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2);

    // warm drone: detuned triangles through a dark lowpass, breathing slowly
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    lp.connect(master);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    droneGain.connect(lp);
    [55, 55.35, 82.4, 110.2].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.11;
      o.connect(g); g.connect(droneGain); o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.18;
    lfo.connect(lfoAmt); lfoAmt.connect(droneGain.gain); lfo.start();

    this._audio = { ctx, master, bellT: null };

    // sparse bell notes on a pentatonic scale, long soft decays
    const scale = [220, 261.6, 293.7, 349.2, 392, 440, 523.3];
    const bell = () => {
      if (!this._audio || !this.state.musicOn) return;
      const t = ctx.currentTime;
      const f = scale[Math.floor(Math.random() * scale.length)];
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const h = ctx.createOscillator();
      h.type = 'sine'; h.frequency.value = f * 2.01;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
      const hg = ctx.createGain(); hg.gain.value = 0.25;
      o.connect(g); h.connect(hg); hg.connect(g); g.connect(master);
      o.start(t); h.start(t); o.stop(t + 6); h.stop(t + 6);
      this._audio.bellT = setTimeout(bell, 2500 + Math.random() * 6500);
    };
    this._audio.bellT = setTimeout(bell, 1200);
  }

  stopSynth() {
    if (!this._audio) return;
    const a = this._audio;
    a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.5);
    clearTimeout(a.bellT);
    setTimeout(() => { if (!this.state.musicOn && this._audio === a) { a.ctx.close(); this._audio = null; } }, 2500);
  }

  attachViewport(el) {
    if (!el || el === this._viewport) return;
    this._viewport = el;
    this._camReady = false;
    requestAnimationFrame(() => this.initCam());

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this._animating) return;
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0016);
      this.zoomAt(f, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    this._pinchPointers = new Map();

    el.addEventListener('pointerdown', (e) => {
      if (this._animating) return;
      if (e.target.closest && e.target.closest('button')) return;
      if (e.pointerType === 'touch') {
        this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pinchPointers.size === 2) {
          // a second finger just landed — cancel any single-finger drag and start a pinch
          this._drag = null;
          const pts = [...this._pinchPointers.values()];
          const r = el.getBoundingClientRect();
          this._pinch = {
            dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
            midX: (pts[0].x + pts[1].x) / 2 - r.left,
            midY: (pts[0].y + pts[1].y) / 2 - r.top,
          };
          return;
        }
      }
      if (e.button !== undefined && e.button !== 0) return;
      if (this._pinchPointers.size > 1 && e.pointerType === 'touch') return;
      this._drag = { sx: e.clientX, sy: e.clientY, cx: this._cam.x, cy: this._cam.y, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && this._pinchPointers.has(e.pointerId)) {
        this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this._pinchPointers.size === 2) {
        const pts = [...this._pinchPointers.values()];
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2 - r.left;
        const midY = (pts[0].y + pts[1].y) / 2 - r.top;
        if (this._pinch && this._pinch.dist > 0) {
          const factor = dist / this._pinch.dist;
          this.zoomAt(factor, midX, midY);
        }
        this._pinch = { dist, midX, midY };
        return;
      }
      if (!this._drag) return;
      const dx = e.clientX - this._drag.sx, dy = e.clientY - this._drag.sy;
      if (!this._drag.moved && Math.abs(dx) + Math.abs(dy) > 6) {
        this._drag.moved = true;
        // capture only once a real drag starts, so plain clicks still reach the stars
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (!this._drag.moved) return;
      el.style.cursor = 'grabbing';
      this._cam.x = this._drag.cx + dx;
      this._cam.y = this._drag.cy + dy;
      this.clampCam();
      this.applyCam();
    });
    const end = (e) => {
      if (e && e.pointerType === 'touch') this._pinchPointers.delete(e.pointerId);
      if (this._pinchPointers.size < 2) this._pinch = null;
      if (this._drag && this._drag.moved) {
        this._suppressClick = true;
        setTimeout(() => { this._suppressClick = false; }, 0);
      }
      this._drag = null;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', (e) => {
      // double-tap to zoom on touch (plain taps that didn't drag or pinch)
      if (e.pointerType === 'touch' && !this._pinch && this._drag && !this._drag.moved) {
        const now = performance.now();
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (this._lastTap && now - this._lastTap.t < 320 && Math.hypot(x - this._lastTap.x, y - this._lastTap.y) < 40) {
          this._lastTap = null;
          this.zoomAt(1.9, x, y);
        } else {
          this._lastTap = { t: now, x, y };
        }
      }
      end(e);
    });
    el.addEventListener('pointercancel', end);
  }

  componentDidMount() {
    this._cam = { x: 0, y: 0, z: 1 };
    // start the music at the very first interaction, already on the title screen
    // (browsers refuse to play sound before the user touches the page at least once)
    this._firstGesture = () => {
      window.removeEventListener('pointerdown', this._firstGesture);
      window.removeEventListener('keydown', this._firstGesture);
      if (!this.state.musicOn) this.setState({ musicOn: true }, () => this.startMusic());
    };
    window.addEventListener('pointerdown', this._firstGesture);
    window.addEventListener('keydown', this._firstGesture);
    this._onResize = () => { if (this._viewport) { this.clampCam(); this.applyCam(); } };
    window.addEventListener('resize', this._onResize);
    this._mql = window.matchMedia('(max-width: 640px)');
    this._onMql = () => this.setState({ isMobile: this._mql.matches });
    this._mql.addEventListener('change', this._onMql);
    this.scheduleAmbient();
    if (firebaseEnabled) {
      this._unsubSky = connectSky({
        onUser: (uid) => this.setState({ uid }),
        onWishes: (list) => this.setState({ sharedWishes: list }),
      });
    }
    this._tick = setInterval(() => {
      if (this.state.showForm && this.state.cooldownUntil > Date.now() && !this.state.submitted) {
        this.setState({ now: Date.now() });
      }
    }, 1000);
  }

  componentWillUnmount() {
    clearInterval(this._tick); clearTimeout(this._confirmT); clearTimeout(this._ambientT); clearTimeout(this._markerT); clearTimeout(this.prayBurstTimer);
    if (this._unsubSky) this._unsubSky();
    if (this._galaxyRaf) cancelAnimationFrame(this._galaxyRaf);
    window.removeEventListener('pointermove', this._onPointerPar);
    window.removeEventListener('deviceorientation', this._onGyro);
    window.removeEventListener('touchend', this._onFirstTouch);
    window.removeEventListener('pointerdown', this._firstGesture);
    window.removeEventListener('keydown', this._firstGesture);
    window.removeEventListener('resize', this._onResize);
    if (this._mql) this._mql.removeEventListener('change', this._onMql);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.shootingStars !== this.props.shootingStars) this.scheduleAmbient();
    const S = this.state;
    if (prevState.userWishes !== S.userWishes || prevState.userPrayed !== S.userPrayed ||
        prevState.prayedExtra !== S.prayedExtra || prevState.flaggedIds !== S.flaggedIds ||
        prevState.cooldownUntil !== S.cooldownUntil) {
      try {
        localStorage.setItem('lumen-v1', JSON.stringify({
          userWishes: S.userWishes,
          userPrayed: S.userPrayed,
          prayedExtra: S.prayedExtra,
          flaggedIds: S.flaggedIds,
          cooldownUntil: S.cooldownUntil,
        }));
      } catch (e) { /* storage unavailable — the sky forgets, gently */ }
    }
  }

  static WISHES = [
    ['I hope she waits for me to come home next year.', 2, 24, 'Raka'],
    ['I hope she says yes in October.', 2, 27, 'Sam'],
    ["May my mother's little shop be busy again.", 4, 35, ''],
    ['Clear scans in March. Please.', 2, 52, ''],
    ['I still set two cups of coffee. I miss you, Dad.', 8, 58, 'Dinda'],
    ['May grief soften into gratitude, slowly.', 3, 28, ''],
    ['To finish my thesis with a quiet mind.', 2, 18, 'a final-year student'],
    ['I want to wake up and feel enough.', 6, 34, 'a tired heart'],
    ['May our home stay warm, however humble.', 9, 12, 'Sari'],
    ['For my little sister: may the world be gentle with you.', 2, 16, '']
  ];

  static COPY = {
    tagline: 'a sky where wishes gather',
    write: 'Write Your Wish',
    placeholder: 'Write your dream or wish here...',
    submit: 'Release to the Sky',
    sign: 'SIGN IT, IF YOU WISH',
    signPlaceholder: 'a name, initials, or leave it to the night',
    anon: 'someone, somewhere',
    lives: 'Your wish lives here now',
    confirm: 'Your wish is now a star in the LUMEN sky.',
    confirmSub: 'may it find gentle company',
    pray: 'Wish upon this star',
    prayed: 'You have wished upon this star',
    report: 'Report',
    reportTitle: 'Why are you reporting this wish?',
    reasons: ['Spam', 'Hate speech', 'Inappropriate content', 'Other'],
    flaggedNote: 'Thank you. This star now rests dimly, awaiting review.',
    close: 'Close', back: 'Back',
    cooldown: (m) => 'The sky is still listening to your last wish. You may write another in ' + m + (m === 1 ? ' minute.' : ' minutes.'),
    time: (d) => d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago',
    prayers: (n) => n === 0 ? 'no one has wished upon this yet' : n === 1 ? '1 soul has wished upon this' : n + ' souls have wished upon this'
  };

  static LIFETIMES = [
    { label: 'FOREVER', ms: null, hint: 'a fixed star — it stays in the sky for good' },
    { label: '1 DAY', ms: 864e5, hint: 'a passing star — it quietly fades after one day' },
    { label: '3 DAYS', ms: 3 * 864e5, hint: 'a passing star — it quietly fades after three days' },
    { label: '1 WEEK', ms: 7 * 864e5, hint: 'a passing star — it quietly fades after one week' },
    { label: '1 MONTH', ms: 30 * 864e5, hint: 'a passing star — it quietly fades after one month' }
  ];

  getWishes() {
    const { userWishes, sharedWishes } = this.state;
    const now = Date.now();
    // shared sky (Firestore) when configured, this browser's own sky otherwise
    const pool = firebaseEnabled ? sharedWishes.filter((w) => (w.flagCount || 0) < 3) : userWishes;
    const alive = pool.filter((w) => !w.expiresAt || w.expiresAt > now);
    let seed = 7919;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const TINTS = ['#e6ecff', '#ffffff', '#dbe6ff', '#c8d7ff', '#ffeccf', '#ffd9c2', '#f2f4ff'];
    const base = App.WISHES.map((w, i) => {
      const l = 4 + rnd() * 92;
      const t = 8 + rnd() * 84;
      return { wid: 'w' + i, text: w[0], days: w[1], base: w[2], by: w[3] || '', l, t, tint: TINTS[Math.floor(rnd() * TINTS.length)] };
    });
    return base.concat(alive);
  }

  renderVals() {
    const S = this.state;
    const P = this.props;
    const C = App.COPY;
    const scale = P.starScale ?? 1;
    const still = (P.motion ?? 'gentle') === 'still';
    const wishes = this.getWishes();

    const stars = [];
    wishes.forEach((w, i) => {
      const total = w.base + (S.prayedExtra[w.wid] || 0);
      const flagged = !!S.flaggedIds[w.wid];
      const hidden = S.launchHideWid === w.wid;
      const igniting = S.launchMarkerWid === w.wid;
      const px = Math.round((3.5 + Math.min(total, 60) * 0.075) * scale * 10) / 10;
      const col = w.tint || '#e6ecff';
      const onClick = (e) => {
        if (this._suppressClick) return;
        e.stopPropagation();
        this.setState({ openWishId: w.wid, flagView: false, justFlagged: false });
      };
      // one copy per tile of the 3×3 wrapped world, so stars are everywhere you travel
      for (let ox = 0; ox < 3; ox++) for (let oy = 0; oy < 3; oy++) {
        stars.push({
          l: (w.l + 100 * ox) / 3, t: (w.t + 100 * oy) / 3, px, color: col,
          glow: '0 0 ' + (px * 1.6) + 'px ' + (px * 0.45) + 'px ' + col + '66, 0 0 ' + (px * 4) + 'px ' + (px * 1.2) + 'px ' + col + '22',
          opacity: hidden ? 0 : flagged ? 0.18 : 0.95,
          filter: flagged ? 'blur(1.5px)' : 'none',
          anim: hidden ? 'none' : igniting ? 'lumenIgnite 1s ease-out' : (flagged || still) ? 'none' : 'lumenTwinkle ' + (3.2 + (i % 7) * 0.9) + 's ease-in-out ' + (i * 0.37 % 4).toFixed(2) + 's infinite',
          onClick
        });
      }
    });

    const marker = S.launchMarkerWid ? wishes.find((w) => w.wid === S.launchMarkerWid) : null;

    const open = wishes.find((w) => w.wid === S.openWishId);
    const openTotal = open ? open.base + (S.prayedExtra[open.wid] || 0) : 0;
    const openFlagged = open ? !!S.flaggedIds[open.wid] : false;
    const userHasPrayed = open ? !!S.userPrayed[open.wid] : false;

    const isSeed = (wid) => typeof wid === 'string' && wid[0] === 'w';
    const flagReasons = C.reasons.map((label) => ({
      label,
      onClick: () => {
        const wid = this.state.openWishId;
        if (firebaseEnabled && wid && !isSeed(wid)) reportWish(wid, label);
        this.setState((s) => ({
          flaggedIds: { ...s.flaggedIds, [s.openWishId]: true },
          flagView: false, justFlagged: true
        }));
      }
    }));

    const inCooldown = S.cooldownUntil > S.now && !S.submitted;
    const cooldownMin = Math.max(1, Math.ceil((S.cooldownUntil - S.now) / 60000));
    const canSubmit = S.formText.trim().length > 0;
    const lifeSel = S.formLife || 0;
    const lifeOptions = App.LIFETIMES.map((o, i) => {
      const on = i === lifeSel;
      return {
        label: o.label,
        pick: () => this.setState({ formLife: i }),
        bg: on ? 'rgba(169,165,216,0.14)' : 'rgba(255,255,255,0.02)',
        border: on ? '#a9a5d8' : '#2b3152',
        color: on ? '#e6e9f0' : '#8b90ab'
      };
    });
    const fmtLeft = (ms) => {
      if (ms < 864e5) { const h = Math.max(1, Math.ceil(ms / 36e5)); return h + (h === 1 ? ' hour' : ' hours'); }
      const d = Math.ceil(ms / 864e5);
      return d + (d === 1 ? ' day' : ' days');
    };

    const mob = !!S.isMobile;
    const myWishes = firebaseEnabled
      ? (S.sharedWishes || []).filter((w) => w.uid && w.uid === S.uid)
      : (S.userWishes || []);
    return {
      hudTop: mob ? 'calc(env(safe-area-inset-top, 0px) + 14px)' : '28px',
      hudSide: mob ? '16px' : '32px',
      hudLinksLeft: mob ? '0' : '32px',
      hudLinksRight: mob ? '0' : 'auto',
      linksJustify: mob ? 'center' : 'flex-start',
      linksBottom: mob ? 'calc(env(safe-area-inset-bottom, 0px) + 10px)' : '28px',
      writeBottom: mob ? 'calc(env(safe-area-inset-bottom, 0px) + 46px)' : '36px',
      zoomDisplay: mob ? 'none' : 'flex',
      npDisplay: mob ? 'none' : 'flex',
      formAlign: mob ? 'flex-start' : 'center',
      formPad: mob ? 'max(7vh, calc(env(safe-area-inset-top, 0px) + 16px)) 14px calc(env(safe-area-inset-bottom, 0px) + 20px)' : '24px',
      bgCanvasRef: (el) => { if (el && el !== this._bgCanvas) { this._bgCanvas = el; requestAnimationFrame(() => this.drawSky(el)); } },
      viewportRef: (el) => this.attachViewport(el),
      nowPlaying: S.nowPlaying || '',
      nowPlayingVisible: !!S.musicOn && !!S.nowPlaying,
      musicColor: S.musicOn ? '#e6e9f0' : '#565d78',
      musicBorder: S.musicOn ? '#4a4478' : '#262c45',
      musicTitle: S.musicOn ? 'Mute the night' : 'Let the night hum',
      toggleMusic: () => {
        const on = !S.musicOn;
        this.setState({ musicOn: on }, () => { on ? this.startMusic() : this.stopMusic(); });
      },
      worldRef: (el) => { if (el) { this._world = el; this.applyCam(); } },
      fadeRef: (el) => { if (el) this._fadeEl = el; },
      fadeCaptionRef: (el) => { if (el) this._fadeCaption = el; },
      zoomIn: () => {
        const vp = this._viewport;
        if (vp) this.zoomAt(1.35, vp.clientWidth / 2, vp.clientHeight / 2);
      },
      zoomOut: () => {
        const vp = this._viewport;
        if (vp) this.zoomAt(1 / 1.35, vp.clientWidth / 2, vp.clientHeight / 2);
      },
      isChoose: S.screen === 'choose',
      isSky: S.screen === 'sky',
      tagline: C.tagline, writeLabel: C.write,
      stars,
      markerVisible: !!marker,
      markerL: marker ? (marker.l + 100) / 3 : 0,
      markerT: marker ? (marker.t + 100) / 3 : 0,
      markerLabel: C.lives,

      enterSky: () => {
        if (this._dive) return;
        this._dive = { t0: performance.now(), dur: 2300, done: false };
        this.setState({ diving: true, musicOn: true }, () => this.startMusic());
      },
      randomStar: () => {
        if (this._animating) return;
        const pool = this.getWishes().filter((w) => !this.state.flaggedIds[w.wid]);
        const w = pool[Math.floor(Math.random() * pool.length)];
        if (!w) return;
        this._animating = true;
        this.setState({ openWishId: null, flagView: false, justFlagged: false });
        this.animateCamTo({ l: w.l, t: w.t }, 1600, () => {
          this._animating = false;
          this.setState({ openWishId: w.wid, flagView: false, justFlagged: false });
        });
      },
      landingUiOpacity: S.diving ? 0 : 1,
      infoOpen: !!S.infoView,
      isAbout: S.infoView === 'about',
      isPrivacy: S.infoView === 'privacy',
      infoTitle: S.infoView === 'privacy' ? 'Privacy Policy' : 'About',
      creatorOpen: !!S.creatorOpen,
      openCreator: () => this.setState({ creatorOpen: true }),
      closeCreator: () => this.setState({ creatorOpen: false }),
      moreOpen: !!S.moreOpen,
      moreCaret: S.moreOpen ? '▴' : '▾',
      toggleMore: () => this.setState({ moreOpen: !this.state.moreOpen }),
      openAbout: () => this.setState({ infoView: 'about' }),
      openPrivacy: () => this.setState({ infoView: 'privacy' }),
      closeInfo: () => this.setState({ infoView: null }),
      galaxyCanvasRef: (el) => this.startGalaxy(el),
      stopProp: (e) => e.stopPropagation(),

      hasOpenWish: !!open,
      modalNormal: !!open && !S.flagView && !S.justFlagged && !openFlagged,
      modalFlagging: !!open && S.flagView,
      modalFlagged: !!open && !S.flagView && (S.justFlagged || openFlagged),
      modalText: open ? open.text : '',
      modalBy: open ? (open.by || C.anon) : '',
      modalColor: open ? (open.tint || '#e6ecff') : '#fff',
      modalTime: open ? C.time(open.days) : '',
      modalPrayers: C.prayers(openTotal),
      prayLabel: userHasPrayed ? C.prayed : C.pray,
      prayDisabled: userHasPrayed,
      prayBurst: !!S.justPrayed,
      prayBg: userHasPrayed ? 'transparent' : 'rgba(169,165,216,0.08)',
      prayBorder: userHasPrayed ? '#2b3152' : '#4a4478',
      prayColor: userHasPrayed ? '#565d78' : '#e6e9f0',
      prayCursor: userHasPrayed ? 'default' : 'pointer',
      reportLabel: C.report, reportTitle: C.reportTitle,
      flagReasons, flaggedNote: C.flaggedNote,
      closeLabel: C.close, backLabel: C.back,
      closeModal: () => this.setState({ openWishId: null, flagView: false, justFlagged: false, justPrayed: false }),
      startFlag: () => this.setState({ flagView: true, justFlagged: false }),
      cancelFlag: () => this.setState({ flagView: false }),
      pray: () => {
        if (userHasPrayed || !open) return;
        const cloud = firebaseEnabled && !isSeed(open.wid);
        if (cloud) prayForWish(open.wid); // the snapshot bumps the count for everyone
        this.setState((s) => ({
          prayedExtra: cloud ? s.prayedExtra : { ...s.prayedExtra, [open.wid]: (s.prayedExtra[open.wid] || 0) + 1 },
          userPrayed: { ...s.userPrayed, [open.wid]: true },
          justPrayed: true
        }));
        clearTimeout(this.prayBurstTimer);
        this.prayBurstTimer = setTimeout(() => this.setState({ justPrayed: false }), 950);
      },

      showForm: S.showForm,
      formNormal: S.showForm && !S.submitted && (!inCooldown || !!S.editingWid),
      formCooldown: S.showForm && !S.submitted && inCooldown && !S.editingWid,
      formTitle: S.editingWid ? 'Rewrite Your Wish' : C.write,
      formConfirmed: S.showForm && S.submitted,
      formText: S.formText,
      formName: S.formName ?? '',
      charCount: S.formText.length,
      signLabel: C.sign, signPlaceholder: C.signPlaceholder,
      onName: (e) => this.setState({ formName: e.target.value.slice(0, 40) }),
      placeholder: C.placeholder,
      starCount: wishes.filter((w) => !S.flaggedIds[w.wid]).length,
      constellationOn: !!S.constellationOn,
      toggleConstellation: () => this.setState({ constellationOn: !this.state.constellationOn }),
      constellationTitle: S.constellationOn ? 'Hide the constellation' : 'Reveal tonight’s constellation',
      constellationBorder: S.constellationOn ? '#4a4478' : '#262c45',
      constellationColor: S.constellationOn ? '#e6e9f0' : '#c9cde0',
      constellationTiles: (() => {
        if (!S.constellationOn) return [];
        const pool = wishes
          .filter((w) => !S.flaggedIds[w.wid])
          .map((w) => ({ l: w.l, t: w.t, total: w.base + (S.prayedExtra[w.wid] || 0) }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 7);
        if (pool.length < 2) return [];
        const chain = [pool.shift()];
        while (pool.length) {
          const cur = chain[chain.length - 1];
          let bi = 0, bd = Infinity;
          pool.forEach((w, i) => {
            const d = Math.pow(w.l - cur.l, 2) + Math.pow((w.t - cur.t) * 0.65, 2);
            if (d < bd) { bd = d; bi = i; }
          });
          chain.push(pool.splice(bi, 1)[0]);
        }
        const tiles = [];
        for (let tx = 0; tx < 3; tx++) for (let ty = 0; ty < 3; ty++) {
          tiles.push({
            points: chain.map((w) => (((w.l / 100) + tx) * App.W).toFixed(1) + ',' + (((w.t / 100) + ty) * App.H).toFixed(1)).join(' ')
          });
        }
        return tiles;
      })(),
      myOpen: !!S.myOpen,
      openMy: () => this.setState({ myOpen: true }),
      closeMy: () => this.setState({ myOpen: false }),
      myWrite: () => this.setState({ myOpen: false, showForm: true, submitted: false, now: Date.now() }),
      myEmpty: myWishes.length === 0,
      myWishList: myWishes.map((w) => {
        const expired = !!w.expiresAt && w.expiresAt <= Date.now();
        const prayed = w.base + (S.prayedExtra[w.wid] || 0);
        return {
          text: w.text,
          meta: expired ? '☾ this star has rested' : (w.expiresAt ? '☄ fades in ' + fmtLeft(w.expiresAt - Date.now()) : '✶ shines forever') + ' · ' + prayed + ' prayed',
          alive: !expired,
          normal: S.confirmDeleteWid !== w.wid,
          confirming: S.confirmDeleteWid === w.wid,
          opacity: expired ? 0.45 : 1,
          edit: () => this.setState({ myOpen: false, showForm: true, submitted: false, editingWid: w.wid, formText: w.text, formName: w.by || '', formLife: w.lifeIdx || 0, now: Date.now() }),
          askDelete: () => this.setState({ confirmDeleteWid: w.wid }),
          cancelDelete: () => this.setState({ confirmDeleteWid: null }),
          doDelete: () => {
            if (firebaseEnabled) restWish(w.wid); // the snapshot removes it from state
            this.setState((s) => ({
              userWishes: s.userWishes.filter((x) => x.wid !== w.wid),
              confirmDeleteWid: null,
              openWishId: s.openWishId === w.wid ? null : s.openWishId
            }));
          },
          visit: expired ? null : () => {
            this.setState({ myOpen: false, openWishId: null, flagView: false, justFlagged: false });
            this._animating = true;
            this.animateCamTo({ l: w.l, t: w.t }, 1600, () => {
              this._animating = false;
              this.setState({ openWishId: w.wid, flagView: false, justFlagged: false });
            });
          }
        };
      }),
      lifeOptions,
      lifeHint: App.LIFETIMES[lifeSel].hint,
      modalFades: open && open.expiresAt ? '☄ fades in ' + fmtLeft(open.expiresAt - Date.now()) : '',
      submitLabel: S.editingWid ? 'Rewrite the Star' : C.submit, confirmText: C.confirm, confirmSub: C.confirmSub,
      cooldownText: C.cooldown(cooldownMin),
      submitDisabled: !canSubmit,
      submitBg: canSubmit ? 'rgba(169,165,216,0.14)' : 'rgba(255,255,255,0.02)',
      submitBorder: canSubmit ? '#a9a5d8' : '#2b3152',
      submitColor: canSubmit ? '#e6e9f0' : '#565d78',
      submitCursor: canSubmit ? 'pointer' : 'default',
      openForm: () => this.setState({ showForm: true, submitted: false, editingWid: null, now: Date.now() }),
      closeForm: () => this.setState((s) => ({
        showForm: false, submitted: false, editingWid: null,
        formText: s.editingWid ? '' : s.formText,
        formName: s.editingWid ? '' : s.formName,
        formLife: s.editingWid ? 0 : s.formLife
      })),
      onText: (e) => this.setState({ formText: e.target.value.slice(0, 200) }),
      submit: () => {
        if (!canSubmit) return;
        if (S.editingWid) {
          const lt = App.LIFETIMES[lifeSel];
          const patch = {
            text: S.formText.trim(),
            by: (S.formName || '').trim(),
            lifeIdx: lifeSel,
            expiresAt: lt.ms ? Date.now() + lt.ms : null
          };
          if (firebaseEnabled) rewriteWish(S.editingWid, patch); // snapshot refreshes state
          this.setState((s) => ({
            userWishes: s.userWishes.map((x) => x.wid === s.editingWid ? { ...x, ...patch } : x),
            showForm: false, submitted: false, formText: '', formName: '', formLife: 0,
            editingWid: null, myOpen: true
          }));
          return;
        }
        const TINTS = ['#e6ecff', '#ffffff', '#dbe6ff', '#ffeccf'];
        // place the new star away from existing ones (torus-aware distance)
        const W = App.W, H = App.H;
        const dist = (a, b) => {
          let dx = Math.abs(a.l - b.l) / 100 * W; dx = Math.min(dx, W - dx);
          let dy = Math.abs(a.t - b.t) / 100 * H; dy = Math.min(dy, H - dy);
          return Math.sqrt(dx * dx + dy * dy);
        };
        let bestPos = null, bestScore = -1;
        for (let tries = 0; tries < 80; tries++) {
          const cand = { l: 2 + Math.random() * 96, t: 3 + Math.random() * 94 };
          let nearest = Infinity;
          for (const o of wishes) nearest = Math.min(nearest, dist(cand, o));
          if (nearest > bestScore) { bestScore = nearest; bestPos = cand; }
          if (nearest >= 170) break; // comfortably clear of every neighbour
        }
        const cloud = firebaseEnabled && !!S.uid;
        const w = {
          wid: cloud ? newWishId() : 'u' + Date.now(),
          text: S.formText.trim(), days: 0, base: 0,
          expiresAt: App.LIFETIMES[lifeSel].ms ? Date.now() + App.LIFETIMES[lifeSel].ms : null,
          lifeIdx: lifeSel,
          by: (S.formName || '').trim(),
          l: bestPos.l, t: bestPos.t,
          tint: TINTS[Math.floor(Math.random() * TINTS.length)]
        };
        // cloud: Firestore's latency compensation echoes the write into the
        // snapshot immediately, so the launch animation finds its star
        if (cloud) releaseWish(w.wid, S.uid, w);
        this.setState((s) => ({
          userWishes: cloud ? s.userWishes : s.userWishes.concat(w),
          showForm: false, submitted: false, formText: '', formName: '', formLife: 0,
          launchHideWid: w.wid, launchMarkerWid: null,
          cooldownUntil: Date.now() + 4 * 60 * 1000
        }));
        this.launchSequence(w);
      }
    };
  }

  render() {
    const V = this.renderVals();
    const mono = "'Space Mono', monospace";
    const serif = "'Cormorant Garamond', serif";

    return (
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'radial-gradient(140% 100% at 50% 115%, #182338 0%, #0d1524 38%, #070c18 70%, #04070f 100%)', fontFamily: mono, color: '#e6e9f0' }}>

        {/* ══════════ Landing ══════════ */}
        {V.isChoose && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#030509', animation: 'lumenFadeIn 1.2s ease' }}>
            <canvas ref={V.galaxyCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', pointerEvents: 'none', opacity: V.landingUiOpacity, transition: 'opacity .7s ease' }}>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 17, letterSpacing: '0.6em', textIndent: '0.6em', color: '#e6e9f0', textShadow: '0 1px 14px rgba(3, 5, 9, 0.9), 0 0 24px rgba(170, 178, 207, 0.5)' }}>
                L <span onClick={V.openCreator} style={{ display: 'inline-block', pointerEvents: 'auto', cursor: 'pointer', animation: 'lumenUGlow 4.5s ease-in-out infinite' }}>U</span> M E N
              </div>
              <div style={{ marginTop: 20, fontFamily: serif, fontStyle: 'italic', fontSize: 'clamp(38px, 5.4vw, 62px)', fontWeight: 400, lineHeight: 1.2, color: '#f2f4fa', textWrap: 'balance', maxWidth: '16em', textShadow: '0 2px 30px rgba(3, 5, 9, 0.95)' }}>Every wish<br />becomes a star.</div>
              <div style={{ marginTop: 16, fontSize: 12, color: '#8b93b3', letterSpacing: '0.1em', textShadow: '0 1px 12px rgba(3, 5, 9, 0.9)' }}>one sky, shared by all who hope</div>
              <button onClick={V.enterSky} className="enter-btn">
                <span style={{ fontSize: 15, textShadow: '0 0 14px rgba(230, 233, 240, 0.7)', animation: 'lumenTwinkle 3.6s ease-in-out infinite' }}>✶</span>
                <span style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.34em', textIndent: '0.34em', textShadow: '0 1px 12px rgba(3, 5, 9, 0.9)' }}>ENTER THE SKY</span>
                <span style={{ display: 'block', width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(201, 205, 224, 0.55), transparent)', transition: 'opacity .4s ease' }}></span>
              </button>
            </div>

            {/* footer links */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: V.landingUiOpacity, transition: 'opacity .7s ease' }}>
              {V.moreOpen && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 22, animation: 'lumenFadeUp .35s ease' }}>
                  <a href="https://www.tiktok.com/@vloob.inc" target="_blank" rel="noopener noreferrer" className="social-a">TIKTOK</a>
                  <a href="https://www.instagram.com/vloob.inc" target="_blank" rel="noopener noreferrer" className="social-a">INSTAGRAM</a>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 26 }}>
                <button onClick={V.openAbout} className="t-btn" style={{ padding: 4, fontSize: 10.5, letterSpacing: '0.14em' }}>ABOUT</button>
                <button onClick={V.openPrivacy} className="t-btn" style={{ padding: 4, fontSize: 10.5, letterSpacing: '0.14em' }}>PRIVACY</button>
                <button onClick={V.toggleMore} className="t-btn" style={{ padding: 4, fontSize: 10.5, letterSpacing: '0.14em' }}>MORE {V.moreCaret}</button>
              </div>
            </div>

            {/* music toggle on the title screen */}
            <button onClick={V.toggleMusic} title={V.musicTitle} className="icon-btn" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + clamp(16px, 3vw, 28px))', right: 'clamp(16px, 4vw, 32px)', fontSize: 14, opacity: V.landingUiOpacity, '--c': V.musicColor, '--bc': V.musicBorder }}>♪</button>

            {/* easter egg: the creator's own wish, hidden behind the U */}
            {V.creatorOpen && (
              <div onClick={V.closeCreator} style={{ position: 'absolute', inset: 0, background: 'rgba(6, 9, 18, 0.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'lumenFadeIn .35s ease', zIndex: 50 }}>
                <div onClick={V.stopProp} style={{ position: 'relative', width: 'min(520px, 100%)', maxHeight: 'min(84dvh, 720px)', boxSizing: 'border-box', background: 'linear-gradient(180deg, #0d1222 0%, #10132a 100%)', border: '1px solid #2b3152', borderRadius: 6, padding: 'clamp(28px, 6vw, 42px) clamp(20px, 6vw, 40px) clamp(22px, 5vw, 32px)', animation: 'lumenFadeUp .45s ease', boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)', display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center', alignItems: 'center', overflow: 'hidden' }}>
                  <span style={{ fontSize: 22, color: '#e6e9f0', textShadow: '0 0 18px rgba(230, 233, 240, 0.8)', animation: 'lumenTwinkle 2.8s ease-in-out infinite' }}>✶</span>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.3em', color: '#8b90ab' }}>THE FIRST WISH</div>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 24, color: '#edeff7' }}>“When I Can Hold a Star”</div>
                  <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 12px', fontFamily: serif, fontStyle: 'italic', fontSize: 17.5, lineHeight: 1.6, color: '#d5d9e8', textWrap: 'pretty' }}>
                    <div>You were never the star I wished to own—<br />for stars were never meant for hands.<br />They belong to the endless sea of night,<br />where only patient dreamers understand.</div>
                    <div>I stand beneath your distant light,<br />with empty pockets and unfinished skies.<br />My hands hold nothing worth your future,<br />only constellations drawn inside my eyes.</div>
                    <div>The universe has taught me this:<br />every sun begins as scattered dust.<br />No galaxy is born in brilliance;<br />it is gravity that earns its trust.</div>
                    <div>So I will not ask you to descend<br />from the heavens you deserve.<br />Not while my orbit still trembles,<br />not while my soul has yet to learn.</div>
                    <div>Instead, I’ll gather fragments of tomorrow—<br />build them into something bright.<br />A name that echoes with purpose,<br />a heart that does not fear the night.</div>
                    <div>Perhaps one day, when my horizon<br />can answer yours with equal flame,<br />I will no longer reach for a distant star—<br />I will simply whisper your name.</div>
                    <div>And if the cosmos is kind,<br />our constellations may finally align.<br />Not because I chased the brightest light,<br />but because I became one of my own.</div>
                    <div>Until then, I remain beneath this sky,<br />grateful that you exist at all.<br />For hope is its own little universe,<br />and every universe begins…<br />with a single star that refuses to fall.</div>
                  </div>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 16, color: '#8b90ab' }}>— the keeper of this sky</div>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.14em', color: '#565d78' }}>you found the star hiding in the U</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ About / Privacy panel ══════════ */}
        {V.infoOpen && (
          <div onClick={V.closeInfo} style={{ position: 'absolute', inset: 0, background: 'rgba(4, 6, 12, 0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'lumenFadeIn .35s ease', zIndex: 40 }}>
            <div onClick={V.stopProp} style={{ position: 'relative', width: 'min(560px, 100%)', maxHeight: 'min(80dvh, 640px)', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0d1222 0%, #10132a 100%)', border: '1px solid #2b3152', borderRadius: 6, animation: 'lumenFadeUp .45s ease', boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(18px, 5vw, 32px) 16px', borderBottom: '1px solid #1d2340' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.4em', color: '#8b90ab' }}>LUMEN</span>
                  <span style={{ fontFamily: serif, fontSize: 24, color: '#e6e9f0' }}>{V.infoTitle}</span>
                </div>
                <button onClick={V.closeInfo} className="close-round">×</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '20px clamp(18px, 5vw, 32px) calc(env(safe-area-inset-bottom, 0px) + 24px)', display: 'flex', flexDirection: 'column', gap: 22 }}>

                {V.isAbout && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 21, lineHeight: 1.55, color: '#dfe3f0', textWrap: 'pretty' }}>LUMEN is a shared night sky. Every star in it is a wish someone released — a hope, a prayer, a small promise to themselves.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>HOW IT WORKS</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Write a wish and release it — it becomes a star, placed gently in the sky. Sign it, or let the night keep your name. Travel the sky, open the stars of strangers, and wish upon the ones that move you: every wish received makes a star burn a little brighter.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>WHAT WE BELIEVE</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Hope is quieter than noise. There are no likes, no followers, no feeds — only a sky that fills, one small light at a time. Be gentle: behind every star is a person.</div>
                    </div>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: '#6a708c' }}>— made for everyone who still looks up</div>
                  </div>
                )}

                {V.isPrivacy && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ fontFamily: mono, fontSize: 11, color: '#565d78', letterSpacing: '0.08em' }}>Last updated — July 2026</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>WHAT WE COLLECT</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Only what you choose to release: the text of your wish and, if you add one, a signature. There are no accounts, no email addresses, no profiles. We do not collect your location, contacts, or identity. So that only you can edit your own stars, your browser holds an anonymous session ID — a random number that says nothing about who you are.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>WHAT IS PUBLIC</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Wishes are public and anonymous by design. Anyone visiting the sky can read them. Please do not include full names, addresses, phone numbers, or anything that could identify you or someone else.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>COOKIES &amp; TRACKING</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>No advertising trackers, no analytics profiles, no third-party cookies. Your browser's local storage remembers small functional things only — such as which stars you have already wished upon.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>MODERATION</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Anyone can report a wish. Reported stars dim while a human reviews them; wishes that contain hate, spam, or personal data are removed. We may keep minimal moderation records to prevent abuse.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>REMOVAL</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>Want a wish you released taken down? Message us on <a href="https://www.tiktok.com/@vloob.inc" target="_blank" rel="noopener noreferrer" style={{ color: '#a9a5d8' }}>TikTok</a> or <a href="https://www.instagram.com/vloob.inc" target="_blank" rel="noopener noreferrer" style={{ color: '#a9a5d8' }}>Instagram</a> (@vloob.inc) with the wish text and we will let that star rest. Requests are honored within 7 days.</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: '#8b90ab' }}>CHANGES</div>
                      <div style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.8, color: '#a9adc4' }}>If this policy changes, the date above changes with it. We will never quietly widen what we collect.</div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* ══════════ Sky view ══════════ */}
        {V.isSky && (
          <div ref={V.viewportRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab', touchAction: 'none', animation: 'lumenFadeIn 1.4s ease' }}>

            <div ref={V.worldRef} style={{ position: 'absolute', left: 0, top: 0, width: 24000, height: 15600, transformOrigin: '0 0', willChange: 'transform' }}>
              <canvas ref={V.bgCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

              {/* constellation of the most wished-upon stars */}
              {V.constellationOn && (
                <svg viewBox="0 0 24000 15600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {V.constellationTiles.map((ct, i) => (
                    <polyline key={i} points={ct.points} fill="none" stroke="rgba(169, 165, 216, 0.4)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{ animation: 'lumenDraw 2.6s ease forwards' }} />
                  ))}
                </svg>
              )}

              {V.stars.map((s, i) => (
                <div key={i} onClick={s.onClick} className="star-hit" style={{ left: s.l + '%', top: s.t + '%' }}>
                  <span style={{ width: s.px, height: s.px, borderRadius: '50%', background: s.color, boxShadow: s.glow, opacity: s.opacity, filter: s.filter, transition: 'opacity .7s ease, filter .7s ease', animation: s.anim }}></span>
                </div>
              ))}

              {/* landing marker for a freshly released wish */}
              {V.markerVisible && (
                <div style={{ position: 'absolute', left: V.markerL + '%', top: V.markerT + '%', pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, width: 90, height: 90, borderRadius: '50%', border: '1px solid rgba(230, 233, 240, 0.65)', transform: 'translate(-50%, -50%)', animation: 'lumenRipple 1.4s ease-out' }}></span>
                  <span style={{ position: 'absolute', left: 0, top: 0, width: 150, height: 150, borderRadius: '50%', border: '1px solid rgba(230, 233, 240, 0.35)', transform: 'translate(-50%, -50%)', animation: 'lumenRipple 1.4s ease-out .25s backwards' }}></span>
                  <span style={{ position: 'absolute', left: 0, top: 0, width: 44, height: 44, borderRadius: '50%', border: '1px dashed rgba(169, 165, 216, 0.55)', transform: 'translate(-50%, -50%)' }}></span>
                  <span style={{ position: 'absolute', left: 0, top: 34, transform: 'translate(-50%, 0)', whiteSpace: 'nowrap', background: 'rgba(10, 14, 26, 0.72)', border: '1px solid #2b3152', borderRadius: 999, padding: '8px 16px', fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: '#e6e9f0', backdropFilter: 'blur(6px)', animation: 'lumenMarkerIn .5s ease .3s backwards' }}>✶ {V.markerLabel}</span>
                </div>
              )}
            </div>

            {/* fades to black as the visitor zooms out past the edge of the sky */}
            <div ref={V.fadeRef} style={{ position: 'absolute', inset: 0, background: '#02040a', opacity: 0, pointerEvents: 'none', zIndex: 5 }}></div>
            <div ref={V.fadeCaptionRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, pointerEvents: 'none', zIndex: 6, fontFamily: serif, fontStyle: 'italic', fontSize: 20, color: '#8b90ab', letterSpacing: '0.02em' }}>drifting back to shore…</div>

            {/* About / Privacy links */}
            <div style={{ position: 'absolute', left: V.hudLinksLeft, right: V.hudLinksRight, bottom: V.linksBottom, display: 'flex', gap: 18, justifyContent: V.linksJustify }}>
              <button onClick={V.openAbout} className="t-btn" style={{ padding: '4px 0', fontSize: 10, letterSpacing: '0.14em', '--c': '#4a5068' }}>ABOUT</button>
              <button onClick={V.openPrivacy} className="t-btn" style={{ padding: '4px 0', fontSize: 10, letterSpacing: '0.14em', '--c': '#4a5068' }}>PRIVACY</button>
              <button onClick={V.openMy} className="t-btn" style={{ padding: '4px 0', fontSize: 10, letterSpacing: '0.14em', '--c': '#4a5068' }}>MY WISHES</button>
            </div>

            {/* Zoom controls */}
            <div style={{ position: 'absolute', right: 32, bottom: 28, display: V.zoomDisplay, flexDirection: 'column', gap: 8 }}>
              <button onClick={V.zoomIn} className="icon-btn" style={{ width: 40, height: 40, fontSize: 17 }}>+</button>
              <button onClick={V.zoomOut} className="icon-btn" style={{ width: 40, height: 40, fontSize: 17 }}>−</button>
            </div>

            {/* Wordmark */}
            <div style={{ position: 'absolute', top: V.hudTop, left: V.hudSide, maxWidth: 'calc(100vw - 110px)', display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
              <div style={{ fontSize: 'clamp(12px, 3.4vw, 14px)', letterSpacing: '0.5em', color: '#c9cde0' }}>L U M E N</div>
              <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 16, color: '#6a708c' }}>{V.tagline}</div>
              <div style={{ marginTop: 4, fontFamily: mono, fontSize: 10, letterSpacing: '0.14em', color: '#565d78' }}>✶ {V.starCount} WISHES IN THE SKY</div>
              {V.constellationOn && (
                <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: '#8b90ab', animation: 'lumenFadeIn .6s ease' }}>tonight’s constellation — the most wished-upon stars</div>
              )}
            </div>

            {/* Now playing */}
            {V.nowPlayingVisible && (
              <div style={{ position: 'absolute', top: V.hudTop, right: 80, height: 38, boxSizing: 'border-box', display: V.npDisplay, alignItems: 'center', gap: 10, padding: '0 16px', maxWidth: 'min(360px, 40vw)', background: 'rgba(10, 14, 26, 0.6)', border: '1px solid #262c45', borderRadius: 999, backdropFilter: 'blur(6px)', pointerEvents: 'none', animation: 'lumenFadeIn .6s ease' }}>
                <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.18em', color: '#565d78', flexShrink: 0 }}>♪ NOW PLAYING</span>
                <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: '#c9cde0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{V.nowPlaying}</span>
              </div>
            )}

            {/* Top-right controls: music + constellation + random star */}
            <div style={{ position: 'absolute', top: V.hudTop, right: V.hudSide, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <button onClick={V.toggleMusic} title={V.musicTitle} className="icon-btn" style={{ fontSize: 14, '--c': V.musicColor, '--bc': V.musicBorder }}>♪</button>
              <button onClick={V.toggleConstellation} title={V.constellationTitle} className="icon-btn" style={{ fontSize: 13, '--c': V.constellationColor, '--bc': V.constellationBorder }}>△</button>
              <button onClick={V.randomStar} title="Visit a random star" className="icon-btn" style={{ fontSize: 14 }}>✦</button>
            </div>

            {/* Write a wish */}
            <button onClick={V.openForm} className="write-btn" style={{ position: 'absolute', left: '50%', bottom: V.writeBottom, transform: 'translateX(-50%)', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box' }}>✶ {' '}{V.writeLabel}</button>
          </div>
        )}

        {/* ══════════ My wishes panel ══════════ */}
        {V.myOpen && (
          <div onClick={V.closeMy} style={{ position: 'absolute', inset: 0, background: 'rgba(4, 6, 12, 0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'lumenFadeIn .35s ease', zIndex: 40 }}>
            <div onClick={V.stopProp} style={{ position: 'relative', width: 'min(560px, 100%)', maxHeight: 'min(80dvh, 640px)', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0d1222 0%, #10132a 100%)', border: '1px solid #2b3152', borderRadius: 6, animation: 'lumenFadeUp .45s ease', boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(18px, 5vw, 32px) 16px', borderBottom: '1px solid #1d2340' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.4em', color: '#8b90ab' }}>LUMEN</span>
                  <span style={{ fontFamily: serif, fontSize: 24, color: '#e6e9f0' }}>My Wishes</span>
                </div>
                <button onClick={V.closeMy} className="t-btn" style={{ fontSize: 16, padding: 4, '--c': '#565d78' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '20px clamp(18px, 5vw, 32px) calc(env(safe-area-inset-bottom, 0px) + 24px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {V.myEmpty && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '26px 0' }}>
                    <span style={{ fontSize: 22, opacity: .5 }}>✶</span>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 21, lineHeight: 1.5, color: '#a9adc4', textWrap: 'pretty' }}>You have not released a wish yet. The sky is waiting.</div>
                    <button onClick={V.myWrite} className="glow-btn" style={{ fontSize: 12, letterSpacing: '0.12em', padding: '12px 24px', cursor: 'pointer' }}>✶ {' '}{V.writeLabel}</button>
                  </div>
                )}
                {V.myWishList.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid #2b3152', borderRadius: 4, padding: '16px 18px', opacity: m.opacity }}>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 19, lineHeight: 1.45, color: '#edeff7', textWrap: 'pretty' }}>“{m.text}”</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
                      <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.08em', color: '#8b90ab' }}>{m.meta}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {m.confirming && (
                          <>
                            <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: '#a9adc4', marginRight: 6 }}>let this star rest?</span>
                            <button onClick={m.doDelete} className="yes-btn">YES</button>
                            <button onClick={m.cancelDelete} className="t-btn" style={{ fontSize: 10, letterSpacing: '0.1em', padding: '10px 10px', '--c': '#565d78' }}>NO</button>
                          </>
                        )}
                        {m.normal && (
                          <>
                            {m.alive && (
                              <>
                                <button onClick={m.visit} className="t-btn" style={{ fontSize: 10, letterSpacing: '0.1em', padding: '10px 10px', '--c': '#565d78' }}>VISIT</button>
                                <button onClick={m.edit} className="t-btn" style={{ fontSize: 10, letterSpacing: '0.1em', padding: '10px 10px', '--c': '#565d78' }}>EDIT</button>
                              </>
                            )}
                            <button onClick={m.askDelete} className="t-btn" style={{ fontSize: 10, letterSpacing: '0.1em', padding: '10px 10px', '--c': '#565d78', '--ch': '#d8a5a5' }}>✕ REST</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ Wish modal ══════════ */}
        {V.hasOpenWish && (
          <div onClick={V.closeModal} style={{ position: 'absolute', inset: 0, background: 'rgba(6, 9, 18, 0.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'lumenFadeIn .35s ease', zIndex: 20 }}>
            <div onClick={V.stopProp} style={{ position: 'relative', width: 'min(480px, 100%)', background: 'linear-gradient(180deg, #0d1222 0%, #10132a 100%)', border: '1px solid #2b3152', borderRadius: 6, padding: 'clamp(26px, 6vw, 40px) clamp(20px, 5vw, 36px) clamp(20px, 5vw, 30px)', animation: 'lumenFadeUp .45s ease', boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)' }}>
              <button onClick={V.startFlag} title={V.reportLabel} className="t-btn" style={{ position: 'absolute', top: 14, right: 16, fontSize: 12, letterSpacing: '0.05em', '--c': '#4a5068', '--ch': '#8b90ab' }}>⚑ {V.reportLabel}</button>

              {V.modalNormal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: V.modalColor, boxShadow: '0 0 8px 2px ' + V.modalColor }}></span>
                    <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: '#8b90ab' }}>{V.modalFades}</span>
                    <span style={{ fontSize: 11, color: '#565d78', marginLeft: 'auto' }}>{V.modalTime}</span>
                  </div>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 'clamp(22px, 5.5vw, 27px)', lineHeight: 1.45, color: '#edeff7', textWrap: 'pretty' }}>“{V.modalText}”</div>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 16, color: '#8b90ab', alignSelf: 'flex-end' }}>— {V.modalBy}</div>
                  <div style={{ fontSize: 11.5, color: '#6a708c', fontStyle: 'normal' }}>{V.modalPrayers}</div>
                  <button onClick={V.pray} disabled={V.prayDisabled} className={'glow-btn' + (V.prayBurst ? ' pray-burst' : '')} style={{ alignSelf: 'flex-start', fontSize: 12, letterSpacing: '0.1em', padding: '11px 22px', cursor: V.prayCursor, '--bg': V.prayBg, '--bc': V.prayBorder, '--c': V.prayColor }}>🌟 {V.prayLabel}</button>
                </div>
              )}

              {V.modalFlagging && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontFamily: serif, fontSize: 22, color: '#e6e9f0' }}>{V.reportTitle}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {V.flagReasons.map((r, i) => (
                      <button key={i} onClick={r.onClick} className="reason-btn">{r.label}</button>
                    ))}
                  </div>
                  <button onClick={V.cancelFlag} className="t-btn" style={{ alignSelf: 'flex-start', fontSize: 11, padding: 0, letterSpacing: '0.08em', '--c': '#565d78', '--ch': '#8b90ab' }}>← {V.backLabel}</button>
                </div>
              )}

              {V.modalFlagged && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                  <span style={{ fontSize: 20, opacity: .5 }}>✶</span>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 21, lineHeight: 1.5, color: '#a9adc4', textWrap: 'pretty' }}>{V.flaggedNote}</div>
                  <button onClick={V.closeModal} className="ghost-pill">{V.closeLabel}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ Submission form ══════════ */}
        {V.showForm && (
          <div onClick={V.closeForm} style={{ position: 'absolute', inset: 0, background: 'rgba(6, 9, 18, 0.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: V.formAlign, justifyContent: 'center', padding: V.formPad, overflowY: 'auto', animation: 'lumenFadeIn .35s ease', zIndex: 20 }}>
            <div onClick={V.stopProp} style={{ width: 'min(520px, 100%)', background: 'linear-gradient(180deg, #0d1222 0%, #10132a 100%)', border: '1px solid #2b3152', borderRadius: 6, padding: 'clamp(22px, 5.5vw, 36px)', animation: 'lumenFadeUp .45s ease', boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)' }}>

              {V.formNormal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div style={{ fontFamily: serif, fontSize: 26, color: '#e6e9f0' }}>{V.formTitle}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea value={V.formText} onChange={V.onText} placeholder={V.placeholder} rows={4} className="field" style={{ resize: 'none', fontFamily: serif, fontSize: 20, lineHeight: 1.5, padding: '14px 16px' }} />
                    <div style={{ alignSelf: 'flex-end', fontSize: 10.5, color: '#565d78' }}>{V.charCount} / 200</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#8b90ab' }}>{V.signLabel}</div>
                    <input type="text" value={V.formName} onChange={V.onName} placeholder={V.signPlaceholder} maxLength={40} className="field" style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 18, padding: '11px 16px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#8b90ab' }}>HOW LONG SHOULD IT SHINE?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {V.lifeOptions.map((o, i) => (
                        <button key={i} onClick={o.pick} className="pill-btn" style={{ '--bg': o.bg, '--bc': o.border, '--c': o.color }}>{o.label}</button>
                      ))}
                    </div>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14.5, color: '#6a708c' }}>{V.lifeHint}</div>
                  </div>
                  <button onClick={V.submit} disabled={V.submitDisabled} className="glow-btn" style={{ fontSize: 13, letterSpacing: '0.14em', padding: '14px 28px', cursor: V.submitCursor, '--bg': V.submitBg, '--bc': V.submitBorder, '--c': V.submitColor }}>✶ {' '}{V.submitLabel}</button>
                </div>
              )}

              {V.formCooldown && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '14px 0' }}>
                  <span style={{ fontSize: 22, opacity: .6 }}>☾</span>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 22, lineHeight: 1.5, color: '#c9cde0', textWrap: 'pretty' }}>{V.cooldownText}</div>
                  <button onClick={V.closeForm} className="ghost-pill">{V.closeLabel}</button>
                </div>
              )}

              {V.formConfirmed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center', padding: '18px 0' }}>
                  <span style={{ fontSize: 26, color: '#e6e9f0', textShadow: '0 0 18px rgba(230, 233, 240, 0.8)', animation: 'lumenTwinkle 2.4s ease-in-out infinite' }}>✶</span>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 25, lineHeight: 1.5, color: '#edeff7', textWrap: 'pretty' }}>{V.confirmText}</div>
                  <div style={{ fontSize: 11, color: '#6a708c' }}>{V.confirmSub}</div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    );
  }
}
