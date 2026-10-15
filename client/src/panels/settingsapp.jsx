/*
 * 「设置」App：所有作用于整个 Uranus 的东西都在这里（主屏幕第二屏的齿轮图标）。
 *
 *  - 界面：小手机 / 经典、配色（以前在「查手机」里）
 *  - 壁纸：整个 Uranus 的壁纸和遮罩（以前在经典界面右上角，小手机里得先切回经典才改得了）
 *  - 屏幕位置微调：顶部下移 / 底部延伸（以前塞在 Companion 的设置里）
 *  - 诊断：读这台手机的尺寸、安全区、各种「一屏高」
 *
 * Companion 自己的设置（角色、模型、字体、底栏留白……）仍在 Companion 里。
 * 整屏打开，和 Companion / 音乐一样由 shell.jsx 的整屏外壳承载。样式自带（.st- 前缀）。
 */

import { useRef, useState } from "react";
import { ChevronLeft, Trash2, Upload } from "lucide-react";
import { SKINS, setTheme, useTheme } from "../phonehome.jsx";
import { ADJ_LIMITS, readAdj, saveAdj } from "../companion/screenadj.js";
import { MAX_BYTES, VEIL_MIN, fileUrl } from "./wallpaper.jsx";

export const URANUS_BUILD = "b20";

function Section({ title, hint, children }) {
  return (
    <section className="st-card">
      <h2>{title}</h2>
      {hint && <p className="st-hint">{hint}</p>}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- 界面 */

function ThemeSection() {
  const theme = useTheme();
  return (
    <Section title="界面" hint="只记在这台设备上。">
      <div className="st-label">主题</div>
      <div className="st-seg">
        <button type="button" className={theme.mode === "phone" ? "on" : ""} onClick={() => setTheme({ mode: "phone" })}>小手机</button>
        <button type="button" className={theme.mode !== "phone" ? "on" : ""} onClick={() => setTheme({ mode: "classic" })}>经典</button>
      </div>
      <div className="st-label">小手机配色</div>
      <div className="st-seg">
        {SKINS.map((s) => (
          <button key={s.id} type="button" className={theme.skin === s.id ? "on" : ""} onClick={() => setTheme({ skin: s.id })}>{s.name}</button>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 壁纸 */

function WallpaperSection({ wallpaper }) {
  const { files, current, veil, busy, error, choose, changeVeil, upload, remove } = wallpaper;
  const fileRef = useRef(null);
  const [pickErr, setPickErr] = useState("");
  const [confirming, setConfirming] = useState("");

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPickErr("");
    if (!file.type.startsWith("image/")) return setPickErr("这不是图片文件");
    if (file.size > MAX_BYTES) return setPickErr(`图片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 8MB 上限`);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result ?? "").split(",")[1];
      if (!base64) return setPickErr("读不出这张图的内容");
      upload({ name: file.name, base64, mimeType: file.type });
    };
    reader.onerror = () => setPickErr("读取文件失败");
    reader.readAsDataURL(file);
  }

  const msg = pickErr || error;
  const currentBuiltin = Boolean(files.find((w) => w.file === current)?.builtin);

  return (
    <Section title="壁纸" hint="整个 Uranus 的壁纸（小手机主屏幕和经典界面都用它）。改完立刻生效。">
      {msg && <p className="st-err">{msg}</p>}
      <div className="st-walls">
        <button type="button" className={`st-wall st-none${current ? "" : " on"}`} onClick={() => choose("")}>不用壁纸</button>
        {files.map((w) => (
          <button key={w.file} type="button" className={`st-wall${current === w.file ? " on" : ""}`} onClick={() => choose(w.file)} title={w.file}>
            <img src={fileUrl(w.file)} alt={w.file} loading="lazy" />
            {w.builtin && <span className="st-tag">内置</span>}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
      <div className="st-row">
        <button type="button" className="st-pill" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> {busy ? "上传中…" : "上传图片…"}
        </button>
        {current && !currentBuiltin && (confirming === current ? (
          <>
            <button type="button" className="st-pill st-danger" onClick={() => { remove(current); setConfirming(""); }}>确认删除</button>
            <button type="button" className="st-pill" onClick={() => setConfirming("")}>算了</button>
          </>
        ) : (
          <button type="button" className="st-pill" onClick={() => setConfirming(current)}>
            <Trash2 size={14} /> 删掉当前这张
          </button>
        ))}
      </div>
      <div className="st-label st-between">
        <span>遮罩浓度（经典界面）</span>
        <span className="st-num">{Math.round(veil * 100)}%</span>
      </div>
      <input type="range" className="st-range" min={VEIL_MIN} max={1} step={0.01} value={veil} onChange={(e) => changeVeil(Number(e.target.value))} aria-label="遮罩浓度" />
    </Section>
  );
}

/* ---------------------------------------------------------------- 屏幕位置微调 */

function AdjustSection() {
  const [v, setV] = useState(readAdj);
  const set = (k, n) => setV(saveAdj({ ...v, [k]: n }));
  const row = (k, label, hint) => {
    const [lo, hi] = ADJ_LIMITS[k];
    return (
      <div className="st-adj">
        <div className="st-label st-between">
          <span>{label}</span>
          <span className="st-step">
            <button type="button" onClick={() => set(k, v[k] - 1)} aria-label={`${label} 减 1`}>−</button>
            <span className="st-num">{v[k]} px</span>
            <button type="button" onClick={() => set(k, v[k] + 1)} aria-label={`${label} 加 1`}>+</button>
          </span>
        </div>
        <input type="range" className="st-range" min={lo} max={hi} step="1" value={v[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={label} />
        <p className="st-hint">{hint}</p>
      </div>
    );
  };
  return (
    <Section title="屏幕位置微调" hint="只存在这台设备上，拖的时候整个界面立刻跟着动。">
      {row("top", "顶部下移", "整个界面往下挪；挪出来那一截是实心色带，可以盖住 iOS 顶上那层模糊。")}
      {row("bottom", "底部延伸", "正数 = 底边往下伸（底下还空一截时往右拖）；负数 = 往上缩。")}
      <button type="button" className="st-pill" onClick={() => setV(saveAdj({ top: 0, bottom: 0 }))}>恢复默认（0 / 0）</button>
    </Section>
  );
}

/* ---------------------------------------------------------------- 诊断 */

function DiagSection() {
  const [t, setT] = useState("");
  const read = () => {
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const st = cs.paddingTop, sb = cs.paddingBottom;
      probe.remove();
      const hOf = (h) => {
        const d = document.createElement("div");
        d.style.cssText = `position:absolute;left:-9999px;top:0;width:1px;height:${h}`;
        document.body.appendChild(d);
        const x = Math.round(d.getBoundingClientRect().height);
        d.remove();
        return x;
      };
      const units = ["100vh", "100lvh", "100dvh", "100svh", "var(--app-h)"].map((u) => `${u.replace("var(--app-h)", "app-h")}=${hOf(u)}`).join(" ");
      const vv = window.visualViewport;
      const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "无";
      const a = readAdj();
      setT([
        `版本：${URANUS_BUILD}`,
        `独立 App 模式：${window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone ? "是" : "否（在浏览器里）"}`,
        `状态栏 meta：${meta("apple-mobile-web-app-status-bar-style")} · theme-color：${meta("theme-color")}`,
        `屏幕：${screen.width}×${screen.height} · 窗口：${innerWidth}×${innerHeight} · 可视：${Math.round(vv?.width || 0)}×${Math.round(vv?.height || 0)}`,
        `安全区 上 ${st} / 下 ${sb}`,
        `高度：${units}`,
        `微调：顶部 ${a.top} / 底部 ${a.bottom}`,
      ].join("\n"));
    } catch (e) {
      setT("读取失败：" + e.message);
    }
  };
  return (
    <Section title="诊断" hint="显示不对时，截这一块的图发过来最有用。">
      <button type="button" className="st-pill" onClick={read}>读取这台设备的尺寸</button>
      {t && <pre className="st-pre">{t}</pre>}
    </Section>
  );
}

/* ---------------------------------------------------------------- 整页 */

export function SettingsAppPanel({ onExit, wallpaper }) {
  return (
    <div className="st">
      <style>{CSS}</style>
      <div className="st-ambient" />
      <header className="st-top">
        <button type="button" className="st-back" onClick={onExit} aria-label="返回">
          <ChevronLeft size={24} strokeWidth={1.8} />
        </button>
        <div>
          <small>URANUS</small>
          <h1>设置</h1>
        </div>
      </header>
      <div className="st-body">
        <ThemeSection />
        <WallpaperSection wallpaper={wallpaper} />
        <AdjustSection />
        <DiagSection />
        <p className="st-foot">Uranus 前端 {URANUS_BUILD} · Companion 自己的设置在 Companion 里</p>
      </div>
    </div>
  );
}

const CSS = `
.st{position:relative;height:100%;display:flex;flex-direction:column;color:#f5f3f1;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.st *{box-sizing:border-box}
.st-ambient{position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 10% 0%,#4b4b59 0%,transparent 43%),radial-gradient(ellipse at 94% 67%,#333c4b 0%,transparent 50%),linear-gradient(150deg,#171821 15%,#101116 80%)}
.st-top{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:6px;padding:calc(10px + env(safe-area-inset-top)) 14px 8px;max-width:640px;width:100%;margin:0 auto}
.st-top small{display:block;font-size:10px;letter-spacing:.16em;color:#a9a3ab}
.st-top h1{margin:0;font:400 26px/1.15 Georgia,"Times New Roman","Songti SC",serif}
.st-back{display:grid;place-items:center;width:40px;height:40px;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:12px}
.st-body{position:relative;z-index:1;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 14px calc(28px + env(safe-area-inset-bottom));max-width:640px;width:100%;margin:0 auto}
.st-card{background:linear-gradient(135deg,#ffffff22,#ffffff0c 65%);border:1px solid #ffffff35;border-radius:22px;padding:18px 16px;margin:0 0 14px;box-shadow:0 16px 55px #0003,inset 0 1px 0 #ffffff20;backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px)}
.st-card h2{margin:0 0 4px;font:400 21px/1.2 Georgia,"Songti SC",serif}
.st-hint{margin:0 0 12px;font-size:12px;line-height:1.55;color:#b8afb2}
.st-label{font-size:13px;color:#d8d2d4;margin:12px 0 6px}
.st-between{display:flex;justify-content:space-between;align-items:center;gap:8px}
.st-num{font-variant-numeric:tabular-nums;color:#f0e9e2;min-width:54px;text-align:center}
.st-seg{display:flex;gap:6px;padding:5px;border:1px solid #ffffff24;background:#ffffff12;border-radius:16px}
.st-seg button{flex:1;min-width:0;padding:10px 6px;border:0;border-radius:12px;background:transparent;color:#b6b3bb;font:inherit;font-size:13px;cursor:pointer}
.st-seg button.on{background:#ffffff2b;color:#fff;box-shadow:inset 0 1px 0 #ffffff35,0 3px 15px #0002}
.st-walls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.st-wall{position:relative;aspect-ratio:3/4;border-radius:12px;overflow:hidden;border:2px solid #ffffff22;background:#ffffff0d;padding:0;cursor:pointer;color:#d8d2d4;font:inherit;font-size:12px}
.st-wall img{width:100%;height:100%;object-fit:cover;display:block}
.st-wall.on{border-color:#d6c2a8}
.st-tag{position:absolute;left:4px;top:4px;background:#000a;border-radius:6px;padding:1px 6px;font-size:10px;color:#fff}
.st-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.st-pill{display:inline-flex;align-items:center;gap:6px;background:#ffffff1c;border:1px solid #ffffff22;border-radius:999px;padding:9px 14px;font:inherit;font-size:13px;color:#f0e9e2;cursor:pointer}
.st-pill:disabled{opacity:.5}
.st-danger{color:#ffb3ad}
.st-err{margin:0 0 10px;padding-left:10px;border-left:2px solid #ff8a80;color:#ffb3ad;font-size:12px}
.st-range{width:100%;margin:4px 0 2px;accent-color:#d6c2a8;height:28px}
.st-adj{margin-bottom:6px}
.st-step{display:inline-flex;align-items:center;gap:6px}
.st-step button{width:32px;height:28px;border-radius:999px;border:1px solid #ffffff22;background:#ffffff1c;color:#f0e9e2;font:inherit;font-size:16px;cursor:pointer}
.st-pre{white-space:pre-wrap;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin:12px 0 0;opacity:.88}
.st-foot{text-align:center;font-size:12px;color:#9f9da7;margin:8px 0 0}
`;
