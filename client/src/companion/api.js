/*
 * Companion 的网络层。
 *
 * 所有请求走 /companion-api/*：Pages 上的转发层（functions/companion-api）把它转给
 * Companion 的 Worker，并在服务端带上 Companion 的密码。浏览器里没有任何密钥，
 * 也不用单独登录 Companion —— 能进这个前端就能用。
 */

const BASE = "/companion-api";

export async function cx(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON：按状态码说话 */
  }
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error || `请求失败 (${res.status})`);
  }
  return data;
}

export const imgUrl = (id) => `${BASE}/image/${encodeURIComponent(id)}`;
export const fontUrl = (id) => `${BASE}/font/${encodeURIComponent(id)}`;

/** 把一次互动记进「待推给 Uranus 的背景事件」队列（服务端 5 分钟去抖后批量推）。失败不打扰用户。 */
export function touch(action) {
  return cx("/session/touch", { method: "POST", body: { actions: [action] } }).catch(() => {});
}

/* ───────────── 日期小工具（都按 YYYY-MM-DD 字符串算，不碰本地时区） ───────────── */

export function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toLocaleDateString("en-CA");
  }
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateLabel(iso, withYear = false) {
  if (!iso) return "未排期";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("zh-CN", {
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function timeLabel(x) {
  if (!x?.time) return "";
  if (x.end) return `${x.time}–${x.end}`;
  if (x.deadline) return `截止 ${x.time}`;
  return x.time;
}

/** 当天的待办排序：有时间的按时间，没时间的排在后面、保持创建顺序。 */
export function byTime(a, b) {
  const ta = a.time || "99:99";
  const tb = b.time || "99:99";
  return ta === tb ? String(a.createdAt).localeCompare(String(b.createdAt)) : ta.localeCompare(tb);
}

/* ───────────── 字体 / 外观 ───────────── */

const loaded = new Set();

/** 把上传过的字体注册给浏览器。字族名带 cmpf- 前缀，不会和界面别处的字体撞名。 */
export async function ensureFonts(fonts) {
  for (const f of fonts || []) {
    if (loaded.has(f.id)) continue;
    loaded.add(f.id);
    try {
      if (f.url && f.kind === "css") {
        // Google Fonts 这类样式表链接：挂一个 <link>，字体名由用户填（family）
        if (!document.getElementById(`cmpf-link-${f.id}`)) {
          const l = document.createElement("link");
          l.id = `cmpf-link-${f.id}`;
          l.rel = "stylesheet";
          l.href = f.url;
          document.head.appendChild(l);
        }
      } else if (f.url) {
        // 字体文件直链：浏览器自己去拉，不占 Companion 的存储（对方要允许跨域，大多数字体 CDN 都允许）
        const face = new FontFace(`cmpf-${f.id}`, `url(${JSON.stringify(f.url)})`);
        await face.load();
        document.fonts.add(face);
      } else {
        const buf = await (await fetch(fontUrl(f.id))).arrayBuffer();
        const face = new FontFace(`cmpf-${f.id}`, buf);
        await face.load();
        document.fonts.add(face);
      }
    } catch {
      loaded.delete(f.id);
    }
  }
}

function family(v, fonts) {
  if (!v) return "inherit";
  if (v.startsWith("font:")) {
    const f = (fonts || []).find((x) => x.id === v.slice(5));
    if (f?.kind === "css" && f.family) return `${JSON.stringify(f.family)}, sans-serif`;
    return `"cmpf-${v.slice(5)}", sans-serif`;
  }
  if (v.startsWith("css:")) return `${JSON.stringify(v.slice(4))}, sans-serif`;
  return "inherit";
}

/** 外观设置 → 挂在 Companion 根节点上的 CSS 变量（只在 Companion 的 Shadow DOM 里生效）。 */
export function appearanceVars(a, fonts) {
  const out = {};
  const put = (p, s = {}) => {
    // 标题和描述现在共用一种字体（老设置里的 titleFont / descFont 照样认）
    const f = family(s.font || s.titleFont || s.descFont, fonts);
    out[`--${p}-tf`] = f;
    out[`--${p}-df`] = f;
    if (s.titleColor) out[`--${p}-tc`] = s.titleColor;
    if (s.descColor) out[`--${p}-dc`] = s.descColor;
    if (s.titleSize) out[`--${p}-ts`] = `${Number(s.titleSize)}px`;
    if (s.descSize) out[`--${p}-ds`] = `${Number(s.descSize)}px`;
  };
  put("my", a?.my);
  put("lk", a?.loki);
  return out;
}

/** 自定义 CSS 的安全过滤：不让它拉外部资源、不让它塞脚本。它本来也只在 Shadow DOM 里，出不了 Companion。 */
export function cleanCss(css) {
  return String(css || "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:|\/companion-api\/)[^)]*\)/gi, "none");
}
