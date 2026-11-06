/*
 * 雾玻璃的画面（纯 canvas，不依赖 React）。
 *
 * 一面玻璃两边都起了雾：
 *  - base    玻璃后面的景色 + 他那边的雾（轻微模糊、发白）。这一层永远抹不掉。
 *  - fogLook 你这边的雾长什么样（景色重度模糊 + 白雾 + 细小的水汽颗粒）。
 *  - fogMask 你这边的雾还剩多少（低分辨率的透明度图）。手指划过 = 擦掉一部分；
 *            没人碰的时候会慢慢重新起雾。
 * 每一帧：先画 base，再把 fogLook 按 fogMask 盖上去，最后画他留下的印记和往下流的水珠。
 *
 * 他的印记（手印 / 唇印 / 字）在他那边：样子是「那一块他那边的雾被压开了」——
 * 透出清楚一点的景色、颜色稍微深一点，就像参考图那样。你这边的雾盖不住它，你也擦不掉它，
 * 过一会儿自己淡掉。
 *
 * 注意：这个文件里不要在正则字面量里写中文（见 claude/life-apps.md）。
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 把图按 cover 方式画满 (w,h) */
function drawCover(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("image"));
    i.src = src;
  });
}

/* ───────────── 声音：手指敲玻璃（WebAudio 现做，不用音频文件） ───────────── */

let AC = null;
function audio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    return AC;
  } catch {
    return null;
  }
}
/** far = 从玻璃那边敲过来的（更闷、更轻） */
export function knockSound({ far = false, volume = 1 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  const out = ac.createGain();
  out.gain.value = (far ? 0.35 : 0.6) * volume;
  let node = out;
  if (far) {
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    out.connect(lp);
    node = lp;
  }
  node.connect(ac.destination);
  // 低频的「咚」
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(far ? 150 : 210, t);
  o.frequency.exponentialRampToValueAtTime(far ? 90 : 120, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
  // 玻璃的「嗒」：一小段带通噪声
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = far ? 1200 : 2600;
  bp.Q.value = 1.4;
  const g2 = ac.createGain();
  g2.gain.value = far ? 0.25 : 0.5;
  src.connect(bp).connect(g2).connect(out);
  src.start(t);
}

/* ───────────── 字体 ───────────── */

let fontReady = null;
export function ensureHandFont() {
  if (fontReady) return fontReady;
  fontReady = new Promise((resolve) => {
    try {
      if (!document.querySelector("link[data-glass-font]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap";
        l.setAttribute("data-glass-font", "1");
        document.head.appendChild(l);
      }
      const done = () => resolve(true);
      const to = setTimeout(done, 2500);
      const tryLoad = () =>
        document.fonts
          ?.load('500 48px "Caveat"')
          .then(() => {
            clearTimeout(to);
            done();
          })
          .catch(done);
      setTimeout(tryLoad, 50);
    } catch {
      resolve(false);
    }
  });
  return fontReady;
}

/* ───────────── 引擎 ───────────── */

export function createGlass(canvas, { onTap, onStrokeEnd, onTouch } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, MS = 0.5; // MS = fogMask 相对 CSS 像素的比例
  let base = null, fogLook = null, fogMask = null, maskCtx = null, tmp = null, tmpCtx = null, grain = null;
  let scene = null;
  let marks = [];
  let drips = [];
  let raf = 0, last = 0, dirty = true, alive = true, lastRegrow = 0;
  // 痕迹停留多久（秒）：擦开的雾、他写的字、手印都按这个时间慢慢消失，节奏一致
  let linger = 20, upAt = 0;
  let pointer = null; // {id,x,y,t0,dist,lx,ly}
  let shakeUntil = 0;

  /* 雾的「颗粒」：一张小纹理，用来让雾不是一整片平的，重新起雾时也不均匀 */
  function makeGrain() {
    const g = makeCanvas(256, 256), c = g.getContext("2d");
    c.fillStyle = "rgba(255,255,255,0.78)";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const r = Math.random() < 0.85 ? rand(0.4, 1.3) : rand(1.4, 2.6);
      c.fillStyle = `rgba(255,255,255,${rand(0.4, 1)})`;
      c.beginPath();
      c.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
      c.fill();
    }
    return g;
  }

  function buildLayers() {
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    base = makeCanvas(bw, bh);
    fogLook = makeCanvas(bw, bh);
    tmp = makeCanvas(bw, bh);
    tmpCtx = tmp.getContext("2d");
    const b = base.getContext("2d"), f = fogLook.getContext("2d");
    // 他那边：景色轻微模糊、蒙一层很淡的白
    if (scene) {
      b.filter = `blur(${Math.max(1, Math.round(dpr))}px)`;
      drawCover(b, scene, bw, bh);
      b.filter = "none";
    } else {
      const gr = b.createLinearGradient(0, 0, 0, bh);
      gr.addColorStop(0, "#c9d6e2");
      gr.addColorStop(1, "#5d7790");
      b.fillStyle = gr;
      b.fillRect(0, 0, bw, bh);
    }
    b.fillStyle = "rgba(226,234,241,0.16)";
    b.fillRect(0, 0, bw, bh);

    // 你这边的雾：景色重度模糊 + 白雾 + 左上角一点亮光 + 颗粒
    if (scene) {
      f.filter = `blur(${Math.round(18 * dpr)}px)`;
      drawCover(f, scene, bw, bh);
      f.filter = "none";
    } else f.drawImage(base, 0, 0);
    f.fillStyle = "rgba(226,232,238,0.66)";
    f.fillRect(0, 0, bw, bh);
    const glow = f.createRadialGradient(bw * 0.1, bh * 0.05, 0, bw * 0.1, bh * 0.05, Math.max(bw, bh) * 0.8);
    glow.addColorStop(0, "rgba(255,255,255,0.35)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    f.fillStyle = glow;
    f.fillRect(0, 0, bw, bh);
    const shade = f.createLinearGradient(0, 0, 0, bh);
    shade.addColorStop(0, "rgba(40,60,85,0)");
    shade.addColorStop(1, "rgba(40,60,85,0.16)");
    f.fillStyle = shade;
    f.fillRect(0, 0, bw, bh);
    // 细小的水汽点
    f.globalAlpha = 0.5;
    for (let i = 0; i < (bw * bh) / 900; i++) {
      const x = Math.random() * bw, y = Math.random() * bh, r = rand(0.5, 1.6) * dpr;
      f.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.55)" : "rgba(70,95,120,0.18)";
      f.beginPath();
      f.arc(x, y, r, 0, Math.PI * 2);
      f.fill();
    }
    f.globalAlpha = 1;
    // 印记是在建图时从 base 里取的，换了图要重做
    marks.forEach((m) => (m.sprite = null));
    dirty = true;
  }

  function buildMask(keep) {
    const old = fogMask;
    fogMask = makeCanvas(W * MS, H * MS);
    maskCtx = fogMask.getContext("2d");
    if (old && keep) maskCtx.drawImage(old, 0, 0, fogMask.width, fogMask.height);
    else {
      maskCtx.fillStyle = "#fff";
      maskCtx.fillRect(0, 0, fogMask.width, fogMask.height);
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === W && nh === H) return;
    const first = !W;
    W = nw;
    H = nh;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    buildMask(!first);
    buildLayers();
  }

  /* ── 擦雾 ── */
  function wipe(x0, y0, x1, y1, r = 22) {
    const s = MS, R = r * s;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (r * 0.35)));
    maskCtx.save();
    maskCtx.globalCompositeOperation = "destination-out";
    for (let i = 0; i <= steps; i++) {
      const x = (x0 + (dx * i) / steps) * s, y = (y0 + (dy * i) / steps) * s;
      const g = maskCtx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(0.6, "rgba(0,0,0,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      maskCtx.fillStyle = g;
      maskCtx.beginPath();
      maskCtx.arc(x, y, R, 0, Math.PI * 2);
      maskCtx.fill();
    }
    maskCtx.restore();
    dirty = true;
  }

  function spawnDrip(x, y, big = false) {
    drips.push({ x, y, r: big ? rand(2, 3) : rand(1.3, 2.1), vy: rand(12, 30), stop: y + rand(30, big ? 220 : 120), drift: rand(-2.5, 2.5), life: 0 });
  }

  /*
   * 重新起雾：叠一层很淡的颗粒纹理。手指离开后先停 linger×0.45 秒，
   * 再用 linger×0.5 秒左右回到满雾 —— 和他写的字淡掉的时间差不多。
   */
  function regrow(dt) {
    const k = -Math.log(0.05) / Math.max(2, linger * 0.5);
    maskCtx.save();
    maskCtx.globalAlpha = clamp(1 - Math.exp(-k * dt), 0, 0.5);
    const p = maskCtx.createPattern(grain, "repeat");
    maskCtx.fillStyle = p;
    maskCtx.translate(Math.random() * 64, Math.random() * 64);
    maskCtx.fillRect(-64, -64, fogMask.width + 128, fogMask.height + 128);
    maskCtx.restore();
  }

  /* ── 他的印记 ── */
  // sprite：在印记所在的那块区域里，「透出来的景色」+「深一点的颜色」，都按印记的形状裁好
  function buildSprite(m) {
    const k = dpr;
    const mw = Math.ceil(m.bw * k), mh = Math.ceil(m.bh * k);
    const shape = makeCanvas(mw, mh), sc = shape.getContext("2d");
    sc.translate(mw / 2, mh / 2);
    sc.rotate(m.rot);
    if (m.flip) sc.scale(-1, 1);
    sc.drawImage(m.src, (-m.w * k) / 2, (-m.h * k) / 2, m.w * k, m.h * k);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    const reveal = makeCanvas(mw, mh), rc = reveal.getContext("2d");
    rc.drawImage(shape, 0, 0);
    rc.globalCompositeOperation = "source-in";
    rc.drawImage(base, (m.cx - m.bw / 2) * k, (m.cy - m.bh / 2) * k, mw, mh, 0, 0, mw, mh);
    const tint = makeCanvas(mw, mh), tc = tint.getContext("2d");
    tc.drawImage(shape, 0, 0);
    tc.globalCompositeOperation = "source-in";
    tc.fillStyle = m.color || "rgb(52,78,104)";
    tc.fillRect(0, 0, mw, mh);
    m.sprite = { reveal, tint, mw, mh };
  }

  function addMark(m) {
    const c = Math.cos(m.rot), s = Math.sin(m.rot);
    m.bw = Math.abs(m.w * c) + Math.abs(m.h * s) + 4;
    m.bh = Math.abs(m.w * s) + Math.abs(m.h * c) + 4;
    m.t0 = performance.now();
    marks.push(m);
    dirty = true;
    return m;
  }

  function markAlpha(m, now) {
    const t = (now - m.t0) / 1000;
    const inT = m.fadeIn, hold = m.hold, out = m.fadeOut;
    if (t < 0) return 0;
    if (t < inT) return ease(t / inT);
    if (t < inT + hold) return 1;
    return 1 - ease((t - inT - hold) / out);
  }

  function drawMarks(now) {
    const k = dpr;
    marks = marks.filter((m) => (now - m.t0) / 1000 < m.fadeIn + m.hold + m.fadeOut);
    for (const m of marks) {
      const a = markAlpha(m, now);
      if (a <= 0.001) continue;
      if (!m.sprite) buildSprite(m);
      const { reveal, tint, mw, mh } = m.sprite;
      const x = (m.cx - m.bw / 2) * k, y = (m.cy - m.bh / 2) * k;
      // 手印「压上来」：一开始稍微大一点点
      const press = m.press ? 1 + 0.035 * (1 - ease((now - m.t0) / 450)) : 1;
      ctx.save();
      if (press !== 1) {
        ctx.translate(m.cx * k, m.cy * k);
        ctx.scale(press, press);
        ctx.translate(-m.cx * k, -m.cy * k);
      }
      if (m.lines) {
        // 写字：按「写到第几个字」露出每一行
        const p = clamp((now - m.t0) / 1000 / m.writeTime, 0, 1);
        let chars = p * m.total;
        ctx.beginPath();
        for (const ln of m.lines) {
          const vis = clamp(chars / ln.n, 0, 1);
          chars -= ln.n;
          if (vis <= 0) break;
          // 每一行的矩形先在未旋转的坐标里算，再转到画面
          const lx = ln.x0, ly = ln.y0, lw = (ln.x1 - ln.x0) * vis, lh = ln.y1 - ln.y0;
          const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
          const pts = [
            [lx, ly],
            [lx + lw, ly],
            [lx + lw, ly + lh],
            [lx, ly + lh],
          ].map(([px, py]) => [(m.cx + px * cos - py * sin) * k, (m.cy + px * sin + py * cos) * k]);
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
        }
        ctx.clip();
        // 刚写到的那一笔会留下水珠往下流
        if (m.dripLeft > 0 && p > 0.6 && Math.random() < 0.012) {
          m.dripLeft--;
          const ln = m.lines[Math.floor(Math.random() * m.lines.length)];
          spawnDrip(m.cx + rand(ln.x0, ln.x1) * 0.9, m.cy + ln.y1 - 6);
        }
      }
      ctx.globalAlpha = a * (m.revealA ?? 0.75);
      ctx.drawImage(reveal, x, y, mw, mh);
      ctx.globalAlpha = a * (m.tintA ?? 0.24);
      ctx.drawImage(tint, x, y, mw, mh);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawDrips(dt) {
    if (!drips.length) return;
    const k = dpr;
    maskCtx.save();
    maskCtx.globalCompositeOperation = "destination-out";
    for (const d of drips) {
      d.life += dt;
      if (d.y < d.stop) {
        const ny = d.y + d.vy * dt * (0.7 + Math.random() * 0.6);
        if (Math.random() < 0.04) d.drift = clamp(d.drift + rand(-3, 3), -4, 4);
        const nx = d.x + d.drift * dt + rand(-0.15, 0.15);
        maskCtx.lineWidth = d.r * 1.05 * MS;
        maskCtx.lineCap = "round";
        maskCtx.strokeStyle = "rgba(0,0,0,0.42)";
        maskCtx.beginPath();
        maskCtx.moveTo(d.x * MS, d.y * MS);
        maskCtx.lineTo(nx * MS, ny * MS);
        maskCtx.stroke();
        d.x = nx;
        d.y = ny;
      }
    }
    maskCtx.restore();
    // 水珠本身：一点高光 + 下沿一点暗边
    for (const d of drips) {
      const fade = d.y >= d.stop ? clamp(1 - (d.life - (d.stopT ?? (d.stopT = d.life))) / 6, 0, 1) : 1;
      if (fade <= 0) continue;
      const x = d.x * k, y = d.y * k, r = d.r * k;
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = "rgba(40,60,85,0.55)";
      ctx.beginPath();
      ctx.arc(x, y + r * 0.25, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drips = drips.filter((d) => !(d.y >= d.stop && d.life - (d.stopT ?? d.life) > 6));
    dirty = true;
  }

  function render(now) {
    if (!base) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (now < shakeUntil) {
      const f = (shakeUntil - now) / 420;
      sx = Math.sin(now / 18) * 2.2 * f * dpr;
      sy = Math.cos(now / 23) * 1.2 * f * dpr;
    }
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.drawImage(base, 0, 0);
    tmpCtx.globalCompositeOperation = "copy";
    tmpCtx.imageSmoothingEnabled = true;
    tmpCtx.drawImage(fogMask, 0, 0, tmp.width, tmp.height);
    tmpCtx.globalCompositeOperation = "source-in";
    tmpCtx.drawImage(fogLook, 0, 0);
    tmpCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, 0, 0);
    drawMarks(now);
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (!base) return;
    // 没在碰的时候慢慢起雾（约每 120ms 一次就够了）
    if (!pointer && now - lastRegrow > 120) {
      if (now - upAt > linger * 450) {
        regrow(Math.min(0.5, (now - lastRegrow) / 1000));
        dirty = true;
      }
      lastRegrow = now;
    }
    const busy = marks.length || drips.length || now < shakeUntil;
    if (!dirty && !busy) return;
    dirty = false;
    render(now);
    drawDrips(dt);
  }

  /* ── 手指 ── */
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e) {
    if (pointer) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = pos(e);
    pointer = { id: e.pointerId, x: p.x, y: p.y, lx: p.x, ly: p.y, t0: performance.now(), dist: 0, wiping: false };
    onTouch?.(p);
  }
  function move(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = pos(e);
    const d = Math.hypot(p.x - pointer.lx, p.y - pointer.ly);
    if (d < 1.5) return;
    if (!pointer.wiping && Math.hypot(p.x - pointer.x, p.y - pointer.y) > 8) {
      pointer.wiping = true;
      wipe(pointer.x, pointer.y, pointer.x, pointer.y);
    }
    if (pointer.wiping) {
      wipe(pointer.lx, pointer.ly, p.x, p.y);
      pointer.dist += d;
      // 擦过的地方偶尔留下一颗往下流的水珠
      if (Math.random() < d / 900) spawnDrip(p.x + rand(-14, 14), p.y + 16, Math.random() < 0.3);
    }
    pointer.lx = p.x;
    pointer.ly = p.y;
  }
  function up(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = pointer;
    pointer = null;
    upAt = performance.now();
    if (!p.wiping && performance.now() - p.t0 < 350) {
      // 点一下：指尖压开一个小点
      wipe(p.x, p.y, p.x, p.y, 9);
      if (Math.random() < 0.25) spawnDrip(p.x, p.y + 6);
      onTap?.({ x: p.x, y: p.y });
    } else if (p.wiping) {
      if (Math.random() < 0.6) spawnDrip(p.lx, p.ly + 14, true);
      onStrokeEnd?.({ x: p.lx, y: p.ly, dist: p.dist });
    }
  }
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  grain = makeGrain();
  resize();
  raf = requestAnimationFrame(frame);

  /* ── 对外 ── */
  return {
    size: () => ({ w: W, h: H }),
    async setScene(src) {
      try {
        scene = await loadImage(src);
      } catch {
        scene = null;
      }
      if (alive && W) buildLayers();
    },
    /** 手印 / 唇印：img 是透明 PNG（白色 + alpha 就是形状） */
    setLinger(sec) {
      linger = clamp(Number(sec) || 20, 6, 120);
    },
    stamp(img, { cx, cy, w, rot = 0, flip = false, press = true, revealA, tintA } = {}) {
      const h = (w * img.height) / img.width;
      return addMark({ src: img, cx, cy, w, h, rot, flip, press, fadeIn: press ? 0.35 : 1.1, hold: linger * 0.5, fadeOut: linger * 0.3, revealA, tintA });
    },
    /** 他用手指在那边写字。返回大概要多久写完（秒） */
    write(text, { cx, cy, maxW, size, rot = 0 } = {}) {
      const k = 2; // 字的形状图按 2 倍画，放大缩小都不糊
      const font = `500 ${size}px "Caveat", "Bradley Hand", "Segoe Print", cursive`;
      const mc = makeCanvas(4, 4).getContext("2d");
      mc.font = font;
      // 折行
      const words = String(text).split(/\s+/).filter(Boolean);
      const rows = [];
      let cur = "";
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (mc.measureText(t).width > maxW && cur) {
          rows.push(cur);
          cur = w;
        } else cur = t;
      }
      if (cur) rows.push(cur);
      const lh = size * 1.05;
      const widths = rows.map((r) => mc.measureText(r).width);
      const bw = Math.max(...widths, 10) + size * 0.6, bh = rows.length * lh + size * 0.5;
      const c = makeCanvas(bw * k, bh * k), g = c.getContext("2d");
      g.scale(k, k);
      g.font = font;
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineCap = "round";
      g.fillStyle = "#fff";
      g.strokeStyle = "#fff";
      g.lineWidth = size * 0.03;
      g.filter = "blur(0.4px)";
      const lines = [];
      rows.forEach((r, i) => {
        const x = (bw - widths[i]) / 2 + rand(-size * 0.12, size * 0.12);
        const y = size * 0.25 + lh * (i + 0.5);
        // 手写有点歪
        g.save();
        g.translate(x, y);
        g.rotate(rand(-0.025, 0.025));
        g.strokeText(r, 0, 0);
        g.fillText(r, 0, 0);
        g.restore();
        lines.push({ x0: x - bw / 2 - size * 0.15, x1: x + widths[i] - bw / 2 + size * 0.2, y0: y - lh / 2 - bh / 2, y1: y + lh / 2 - bh / 2, n: Math.max(1, r.length) });
      });
      const total = lines.reduce((s, l) => s + l.n, 0);
      const writeTime = clamp(total * 0.075, 1.2, 4.2);
      const img = { width: bw * k, height: bh * k, naturalWidth: bw * k, naturalHeight: bh * k };
      addMark({
        src: c,
        cx,
        cy,
        w: bw,
        h: bh,
        rot,
        flip: false,
        press: false,
        lines,
        total,
        writeTime,
        dripLeft: Math.random() < 0.7 ? 1 + (rows.length > 1 ? 1 : 0) : 0,
        fadeIn: 0.001,
        hold: writeTime + linger * 0.5 + total * 0.03,
        fadeOut: linger * 0.3,
        revealA: 0.9,
        tintA: 0.36,
        img,
      });
      return writeTime;
    },
    /** 他从那边敲回来：两下闷闷的声音 + 玻璃轻轻一震 */
    knockBack({ sound = true } = {}) {
      const at = [0, 230];
      at.forEach((ms) =>
        setTimeout(() => {
          if (!alive) return;
          if (sound) knockSound({ far: true });
          shakeUntil = performance.now() + 420;
        }, ms)
      );
    },
    busy: () => marks.length > 0,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    },
  };
}
