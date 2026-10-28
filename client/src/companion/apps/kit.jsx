/*
 * 三个生活小 App（经期 / 专注陪伴 / 他的位置）共用的外壳和小零件。
 *
 * 这几个 App 既从 Uranus 主屏幕整屏打开（panels/lifeapps.jsx），也能在 Companion 里打开
 * （panel.jsx 顶栏右边那个九宫格），所以只依赖 ../api.js，不碰 Uranus 的 store / lucide，
 * 保证 Companion 网站那份单独打包也能用。样式都带 la- 前缀，自己一份 <style>。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../api.js";

/* ───────────── 图标（细线条，跟 Companion 一致） ───────────── */

const P = {
  back: "M15 5l-7 7 7 7",
  gear: "M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7 7 0 01-1.9 1.1l-.4 2H11l-.4-2a7 7 0 01-1.9-1.1l-1.9.6L5 14.7l1.6-1.2a7 7 0 010-2.2L5 10.1l1.8-3.1 1.9.6A7 7 0 0110.6 6.5l.4-2h4l.4 2a7 7 0 011.9 1.1l1.9-.6 1.8 3.1-1.6 1.2a7 7 0 010 2.2z",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  refresh: "M19 8a7.5 7.5 0 10.6 6M19 3.5V8h-4.5",
  locate: "M12 3v3M12 18v3M3 12h3M18 12h3M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8.5 5.5v13M15.5 5.5v13",
  skip: "M6 6l9 6-9 6zM17.5 6v12",
  reset: "M5 12a7 7 0 107-7H8M8 2.5L5 5l3 2.5",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  chevR: "M9 5l7 7-7 7",
  chevL: "M15 5l-7 7 7 7",
  route: "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a3 3 0 013-3h1M18 9v6a3 3 0 01-3 3h-1",
  apps: "M5 5h4v4H5zM15 5h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z",
  drop: "M12 3.5s-6 6.6-6 11a6 6 0 0012 0c0-4.4-6-11-6-11z",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  timer: "M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 2.5M9.5 2.5h5",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6C19.5 15.4 12 20 12 20z",
  moon: "M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z",
};

export function Icon({ n, size = 20, stroke = 1.7, fill = "none", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d={P[n] || ""} />
    </svg>
  );
}

/* ───────────── 数据 ───────────── */

/** GET 一次 + 手动刷新；visible 时每 interval 毫秒自动刷新一次（0 = 不自动） */
export function useRemote(path, interval = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const d = await cx(path);
      setData(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [path]);
  useEffect(() => {
    load();
    if (!interval) return;
    const t = setInterval(() => !document.hidden && load(), interval);
    const vis = () => !document.hidden && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load, interval]);
  return { data, setData, error, load };
}

export function useToast() {
  const [text, setText] = useState("");
  const timer = useRef(0);
  const toast = useCallback((t) => {
    setText(String(t || ""));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(""), 2600);
  }, []);
  return [text, toast];
}

/** 本机偏好（只放「记住上次停在哪个 tab」这类小东西）。读写都包 try：隐私模式下会抛。 */
export function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
}
export function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/**
 * 图片 → 压缩后的 data URL（保留透明），上传到 Companion，返回图片 id。
 * Companion 一张图上限约 900KB（base64），超了就继续缩。
 */
export async function uploadImage(file, maxSide = 1100) {
  if (!file) return "";
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("这张图读不出来"));
      i.src = url;
    });
    let side = maxSide, data = "";
    for (let tries = 0; tries < 6; tries++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      data = c.toDataURL("image/webp", 0.88);
      // 老 Safari 不会编 webp，会退回 png
      if (!/^data:image\/webp/.test(data)) data = c.toDataURL("image/png");
      if (data.length < 880000) break;
      side = Math.round(side * 0.75);
    }
    if (data.length >= 880000) throw new Error("图片太大了，换一张小一点的");
    const r = await cx("/image", { method: "POST", body: { data, source: "upload" } });
    return r.image.id;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ───────────── 日期 ───────────── */

export const plusDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日` : "");
export const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
export const weekday = (iso) => WEEK[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r && h < 6 ? `${h} 小时 ${r} 分` : `${h} 小时`;
  return `${Math.floor(h / 24)} 天`;
}

/* ───────────── 外壳 ───────────── */

export function AppFrame({ kicker, title, onExit, right, children, className = "", style }) {
  return (
    <div className={`la ${className}`} style={style}>
      <style>{BASE_CSS}</style>
      <header className="la-top">
        {onExit ? (
          <button type="button" className="la-ico" onClick={onExit} aria-label="返回">
            <Icon n="back" size={22} />
          </button>
        ) : (
          <span className="la-ico" />
        )}
        <div className="la-brand">
          {kicker && <small>{kicker}</small>}
          <h1>{title}</h1>
        </div>
        <div className="la-right">{right}</div>
      </header>
      {children}
    </div>
  );
}

/** 底部弹出的面板。点遮罩或右上角关闭。 */
export function Sheet({ title, onClose, children, tall = false, footer }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="la-veil" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`la-sheet${tall ? " tall" : ""}`} role="dialog" aria-label={title}>
        <div className="la-sh-head">
          <b>{title}</b>
          <button type="button" className="la-ico sm" onClick={onClose} aria-label="关闭">
            <Icon n="close" size={18} />
          </button>
        </div>
        <div className="la-sh-body">{children}</div>
        {footer && <div className="la-sh-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="la-tog">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="la-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** 在别的界面里（比如 Companion 设置页）借用这套表单样式 */
export function KitInline({ children }) {
  return (
    <div className="la inline">
      <style>{BASE_CSS}</style>
      {children}
    </div>
  );
}

export function Toast({ text }) {
  return text ? <div className="la-toast">{text}</div> : null;
}

export function Loading({ error, retry }) {
  return (
    <div className="la-empty">
      {error ? (
        <>
          <p>连不上 Companion：{error}</p>
          <button type="button" className="la-btn" onClick={retry}>
            重试
          </button>
        </>
      ) : (
        <p>加载中…</p>
      )}
    </div>
  );
}

const BASE_CSS = `
.la{--ink:#f5f1ee;--dim:#b9b0b2;--faint:#857d82;--l:#ffffff22;--card:#ffffff0c;--card2:#ffffff14;--ac:#d6c2a8;--ac-ink:#231f24;--bad:#ef9a9a;
 position:relative;height:100%;display:flex;flex-direction:column;color:var(--ink);background:#101117;overflow:hidden;
 font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}
.la.inline{height:auto;background:none;overflow:visible;font-size:14px}
.la *{box-sizing:border-box}
.la button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:0}
.la input,.la select,.la textarea{font:inherit;color:var(--ink)}
.la-top{flex:none;position:relative;z-index:5;display:flex;align-items:center;gap:6px;padding:calc(6px + env(safe-area-inset-top)) 10px 6px;max-width:560px;width:100%;margin:0 auto}
.la-brand{flex:1;min-width:0;text-align:center}
.la-brand small{display:block;font-size:10px;letter-spacing:.22em;color:var(--faint);text-transform:uppercase}
.la-brand h1{margin:0;font:400 19px/1.25 Georgia,"Songti SC",serif;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.la-right{display:flex;gap:2px;min-width:40px;justify-content:flex-end}
.la-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--dim);flex:none}
.la-ico:active{background:var(--card2)}
.la-ico.sm{width:32px;height:32px}
.la-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 16px calc(28px + env(safe-area-inset-bottom));max-width:560px;width:100%;margin:0 auto}
.la-card{background:var(--card);border:1px solid var(--l);border-radius:20px;padding:16px;margin:0 0 12px}
.la-card h3{margin:0 0 10px;font:600 13px/1.4 inherit;letter-spacing:.06em;color:var(--dim)}
.la-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 16px!important;border-radius:999px;background:var(--card2)!important;border:1px solid var(--l)!important;font-size:14px;white-space:nowrap}
.la-btn.solid{background:var(--ac)!important;color:var(--ac-ink)!important;border-color:transparent!important;font-weight:650}
.la-btn.ghost{background:transparent!important}
.la-btn.danger{color:var(--bad)!important}
.la-btn:disabled{opacity:.45}
.la-btn.block{width:100%}
.la-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.la-meta{font-size:12px;color:var(--faint)}
.la-err{color:var(--bad);font-size:13px}
.la-empty{padding:48px 20px;text-align:center;color:var(--dim)}
.la-veil{position:absolute;inset:0;z-index:60;background:#05060acc;display:flex;align-items:flex-end;justify-content:center;animation:laFade .18s ease}
.la-sheet{width:100%;max-width:560px;max-height:84%;display:flex;flex-direction:column;background:linear-gradient(170deg,#2a2a33,#1b1c23);border:1px solid var(--l);border-bottom:0;border-radius:24px 24px 0 0;box-shadow:0 -20px 60px #0008;animation:laUp .24s cubic-bezier(.2,.8,.2,1)}
.la-sheet.tall{height:84%}
.la-sh-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:14px 12px 6px 20px}
.la-sh-head b{font:400 18px Georgia,"Songti SC",serif}
.la-sh-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 20px 16px;-webkit-overflow-scrolling:touch}
.la-sh-foot{flex:none;display:flex;gap:8px;padding:10px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--l)}
.la-sh-foot>*{flex:1}
.la-field{display:block;margin:0 0 14px}
.la-field>span{display:block;font-size:12px;color:var(--dim);margin-bottom:6px}
.la-field>small{display:block;font-size:11px;color:var(--faint);margin-top:5px;line-height:1.45}
.la-field input:not([type=checkbox]):not([type=range]):not([type=file]),.la-field select,.la-field textarea{width:100%;padding:11px 13px;border-radius:13px;border:1px solid var(--l);background:#ffffff0a;font-size:16px;outline:none;-webkit-appearance:none;appearance:none}
.la-field select{background-image:linear-gradient(45deg,transparent 50%,var(--dim) 50%),linear-gradient(135deg,var(--dim) 50%,transparent 50%);background-position:calc(100% - 18px) 52%,calc(100% - 13px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:34px}
.la-field select option{background:#22232b;color:var(--ink)}
.la-field textarea{min-height:92px;resize:vertical;line-height:1.5}
.la-field input:focus,.la-field select:focus,.la-field textarea:focus{border-color:var(--ac)}
.la-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.la-tog{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #ffffff10;cursor:pointer}
.la-tog:last-child{border-bottom:0}
.la-tog>span{flex:1;font-size:14px}
.la-tog small{display:block;font-size:11.5px;color:var(--faint);margin-top:2px;line-height:1.4}
.la-tog input{position:absolute;opacity:0;pointer-events:none}
.la-tog i{flex:none;position:relative;width:44px;height:26px;border-radius:99px;background:#ffffff26;transition:background .2s}
.la-tog i:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #0006;transition:transform .2s}
.la-tog input:checked+i{background:var(--ac)}
.la-tog input:checked+i:after{transform:translateX(18px)}
.la-seg{display:flex;padding:3px;border-radius:999px;background:#ffffff10;border:1px solid var(--l)}
.la-seg button{flex:1;padding:8px 6px;border-radius:999px;font-size:13px;color:var(--dim);white-space:nowrap}
.la-seg button.on{background:var(--ac);color:var(--ac-ink);font-weight:650}
.la-chips{display:flex;flex-wrap:wrap;gap:7px}
.la-chip{padding:6px 12px!important;border-radius:999px;border:1px solid var(--l)!important;background:#ffffff08!important;font-size:13px;color:var(--dim)}
.la-chip.on{background:var(--ac)!important;color:var(--ac-ink)!important;border-color:transparent!important}
.la-toast{position:absolute;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;max-width:86%;padding:10px 16px;border-radius:14px;background:#000d;border:1px solid var(--l);font-size:13px;text-align:center;animation:laFade .2s}
@keyframes laFade{from{opacity:0}to{opacity:1}}
@keyframes laUp{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
`;
