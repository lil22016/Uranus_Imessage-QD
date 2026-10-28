/*
 * 小镇地图生成器：给一个种子，画出同一张虚构小镇（河、街道、街区、房子、公园、池塘）。
 *
 * 地图是 1000×1000 的世界坐标；地点的 x / y 存在 Companion 里，地图本身不存，
 * 每次按种子重新算（同一个种子永远得到同一张图），所以换设备也是同一个镇子。
 */

export const WORLD = 1000;

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom → 三次贝塞尔，给一串点画一条顺滑的线 */
function smoothPath(pts) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function sampleCurve(pts, per = 24) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const BUILD = ["#eadcc5", "#e4d3b9", "#ecdfcb", "#dfccb1", "#e7d7c1", "#e2cfb6"];
const ROOF = ["#d9c5a7", "#d3bc9c", "#dccbb2", "#cdb595", "#d6c2a6", "#d0b998"];

export function generateMap(seed) {
  const r = rng(seed || 1);
  const R = (a, b) => a + r() * (b - a);

  /* 河：从上到下蜿蜒穿过 */
  const x0 = R(220, 780), drift = R(-260, 260);
  const riverPts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    riverPts.push([x0 + drift * t + Math.sin(t * Math.PI * R(1.4, 2.2) + R(0, 6)) * R(40, 90), -80 + t * 1160]);
  }
  const riverW = R(44, 58);
  const riverS = sampleCurve(riverPts, 30);
  const distRiver = (x, y) => {
    let m = 1e9;
    for (const [a, b] of riverS) {
      const d = (a - x) * (a - x) + (b - y) * (b - y);
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  };

  /* 街道：略带起伏的网格，每隔几条一条大路 */
  const lines = (from) => {
    const a = [];
    let v = from;
    while (v < WORLD - 30) {
      a.push(v);
      v += R(108, 156);
    }
    return a;
  };
  const xs = lines(R(30, 70)), ys = lines(R(30, 70));
  const majorX = new Set([Math.floor(xs.length / 2), r() < 0.5 ? 1 : xs.length - 2]);
  const majorY = new Set([Math.floor(ys.length / 2), r() < 0.5 ? 1 : ys.length - 2]);
  const sw = (major) => (major ? 17 : 10);
  const streets = [
    ...xs.map((x, i) => ({ x1: x, y1: -20, x2: x, y2: WORLD + 20, w: sw(majorX.has(i)), major: majorX.has(i) })),
    ...ys.map((y, i) => ({ x1: -20, y1: y, x2: WORLD + 20, y2: y, w: sw(majorY.has(i)), major: majorY.has(i) })),
  ];
  const bx = [-30, ...xs, WORLD + 30], by = [-30, ...ys, WORLD + 30];
  const halfX = (i) => (i <= 0 || i >= bx.length - 1 ? 0 : sw(majorX.has(i - 1)) / 2);
  const halfY = (i) => (i <= 0 || i >= by.length - 1 ? 0 : sw(majorY.has(i - 1)) / 2);

  /* 街区 */
  const blocks = [];
  for (let i = 0; i < bx.length - 1; i++) {
    for (let j = 0; j < by.length - 1; j++) {
      const x = bx[i] + halfX(i) + 3, y = by[j] + halfY(j) + 3;
      const w = bx[i + 1] - halfX(i + 1) - 3 - x, h = by[j + 1] - halfY(j + 1) - 3 - y;
      if (w < 20 || h < 20) continue;
      const cx = x + w / 2, cy = y + h / 2;
      const nearRiver = distRiver(cx, cy) < riverW / 2 + Math.hypot(w, h) * 0.45;
      const roll = r();
      const type = nearRiver ? "green" : roll < 0.13 ? "park" : roll < 0.18 ? "plaza" : "build";
      const b = { x, y, w, h, cx, cy, type, buildings: [], trees: [], pond: null };
      if (type === "build") {
        const cols = Math.max(1, Math.round(w / R(40, 62))), rows = Math.max(1, Math.round(h / R(36, 56)));
        const lw = w / cols, lh = h / rows;
        for (let c = 0; c < cols; c++) {
          for (let k = 0; k < rows; k++) {
            // 只沿街那一圈有房子，中间留成院子
            const edge = c === 0 || k === 0 || c === cols - 1 || k === rows - 1;
            if (!edge && r() < 0.7) continue;
            if (r() < 0.07) continue;
            const ix = R(2.5, 6), iy = R(2.5, 6);
            const bw = lw - ix * 2, bh = lh - iy * 2;
            if (bw < 9 || bh < 9) continue;
            const bxx = x + c * lw + ix, byy = y + k * lh + iy;
            if (distRiver(bxx + bw / 2, byy + bh / 2) < riverW / 2 + 10) continue;
            const ci = Math.floor(r() * BUILD.length);
            b.buildings.push({ x: bxx, y: byy, w: bw, h: bh, fill: BUILD[ci], roof: ROOF[ci], ridge: r() < 0.5 ? "h" : "v" });
          }
        }
        // 院子里两三棵树
        if (cols >= 3 && rows >= 3) for (let t = 0; t < 3; t++) b.trees.push({ x: R(x + lw, x + w - lw), y: R(y + lh, y + h - lh), r: R(4, 7) });
      } else if (type === "park" || type === "green") {
        const n = Math.round((w * h) / R(700, 1100));
        if (type === "park" && r() < 0.55 && w > 70 && h > 70) b.pond = { cx: R(x + w * 0.35, x + w * 0.65), cy: R(y + h * 0.35, y + h * 0.65), rx: R(w * 0.16, w * 0.3), ry: R(h * 0.14, h * 0.26) };
        for (let t = 0; t < n; t++) {
          const tx = R(x + 6, x + w - 6), ty = R(y + 6, y + h - 6);
          if (distRiver(tx, ty) < riverW / 2 + 6) continue;
          if (b.pond && ((tx - b.pond.cx) / (b.pond.rx + 8)) ** 2 + ((ty - b.pond.cy) / (b.pond.ry + 8)) ** 2 < 1) continue;
          b.trees.push({ x: tx, y: ty, r: R(5, 10) });
        }
        if (type === "park") b.paths = [`M${x},${y + h * R(0.3, 0.7)} Q${cx},${cy + R(-30, 30)} ${x + w},${y + h * R(0.3, 0.7)}`];
      } else {
        // 广场：一圈树 + 中间一个喷泉
        for (let t = 0; t < 8; t++) {
          const a = (t / 8) * Math.PI * 2;
          b.trees.push({ x: cx + Math.cos(a) * w * 0.36, y: cy + Math.sin(a) * h * 0.36, r: 5 });
        }
      }
      blocks.push(b);
    }
  }

  /* 河上的桥：大路过河的地方 */
  const bridges = [];
  for (const s of streets) {
    if (!s.major) continue;
    const horizontal = s.y1 === s.y2;
    for (let i = 1; i < riverS.length; i++) {
      const [ax, ay] = riverS[i - 1], [bx2, by2] = riverS[i];
      if (horizontal ? (ay - s.y1) * (by2 - s.y1) <= 0 && ay !== by2 : (ax - s.x1) * (bx2 - s.x1) <= 0 && ax !== bx2) {
        const t = horizontal ? (s.y1 - ay) / (by2 - ay) : (s.x1 - ax) / (bx2 - ax);
        bridges.push({ x: ax + (bx2 - ax) * t, y: ay + (by2 - ay) * t, horizontal, w: s.w });
        break;
      }
    }
  }

  return { seed, river: { d: smoothPath(riverPts), w: riverW }, streets, blocks, bridges, distRiver };
}

/** 给一个没有坐标的地点找个位置：公园类放进公园，其他放进有房子的街区，不和已有地点挤在一起 */
export function pickSpot(map, kind, taken, seed = Math.random() * 1e9) {
  const r = rng(Math.floor(seed));
  const greenKinds = ["park"];
  const want = greenKinds.includes(kind) ? ["park", "green"] : ["build", "plaza"];
  const ok = (x, y) => x > 40 && y > 40 && x < WORLD - 40 && y < WORLD - 40 && map.distRiver(x, y) > map.river.w / 2 + 18 && taken.every((p) => Math.hypot(p.x - x, p.y - y) > 62);
  const pool = map.blocks.filter((b) => want.includes(b.type));
  for (let tries = 0; tries < 200; tries++) {
    const b = pool[Math.floor(r() * pool.length)] || map.blocks[Math.floor(r() * map.blocks.length)];
    if (!b) break;
    const x = b.cx + (r() - 0.5) * b.w * 0.5, y = b.cy + (r() - 0.5) * b.h * 0.5;
    if (ok(x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  for (let tries = 0; tries < 400; tries++) {
    const x = 60 + r() * 880, y = 60 + r() * 880;
    if (ok(x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(100 + r() * 800), y: Math.round(100 + r() * 800) };
}
