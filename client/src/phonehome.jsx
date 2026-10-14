/*
 * 「小手机」主题：把整个控制台伪装成一部手机的主屏幕。
 *
 *  - 主题状态（经典 / 小手机、配色、签名……）存在浏览器 localStorage 里，
 *    用一个很小的外部 store，AppShell 和「查手机」里的设置卡共用同一份。
 *  - 主屏幕本身只负责「长得像手机」：壁纸、毛玻璃小组件、一个功能一个图标、Dock、翻页。
 *    点图标 = 调 onOpen(分区 id)，真正的页面还是原来的分区面板，一个字没动。
 *  - 样式全部自带（.ph- 前缀，下面那段 CSS 字符串），不依赖 Tailwind，
 *    所以不会和控制台原有的「纯白极简」样式互相打架。
 *  - 壁纸直接用控制台右上角「壁纸」选的那张（--wallpaper-image），没选就用配色自带的渐变。
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Home, Play } from "lucide-react";

/* ---------------------------------------------------------------- 主题状态 */

const KEY = "uranus.theme.v1";
export const SKINS = [
  { id: "glass", name: "玻璃蓝" },
  { id: "cream", name: "奶油白" },
  { id: "dark", name: "夜间" },
];
const DEFAULTS = {
  mode: "classic", // "classic" | "phone"
  skin: "glass",
  tagline: "Collect small moments, they become the big ones.",
  quote: "keep happy",
  note: "Take your time. Everything you need is already here.",
  since: "", // 纪念日，YYYY-MM-DD
};

let cache = null;
const subs = new Set();

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
function snapshot() {
  if (!cache) cache = read();
  return cache;
}
export function setTheme(patch) {
  cache = { ...snapshot(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* 存不进（无痕窗口之类）就只在这一次有效 */
  }
  subs.forEach((f) => f());
}
export function useTheme() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    snapshot,
    snapshot,
  );
}

/* ---------------------------------------------------------------- 小零件 */

/** 点一下就地改字的文本。失焦或回车保存。 */
function Editable({ value, onSave, className = "", placeholder = "点这里写点什么" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return (
      <input
        autoFocus
        className={`ph-edit ${className}`}
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span className={`ph-editable ${className}`} onClick={() => setEditing(true)} title="点一下可以改">
      {value || <i className="ph-ghost">{placeholder}</i>}
    </span>
  );
}

function useNow(ms = 20000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const pad = (n) => String(n).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function daysSince(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const a = new Date(`${iso}T00:00:00`);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  const d = Math.round((b - a) / 86400000);
  return Number.isFinite(d) ? Math.max(d, 0) : null;
}

function AppIcon({ item, onOpen, small }) {
  const Icon = item.icon;
  return (
    <button type="button" className="ph-app" onClick={() => onOpen(item.id)} aria-label={item.label} title={item.label}>
      <span className={`ph-ico${small ? " ph-ico-dock" : ""}`}>
        <Icon size={small ? 27 : 28} strokeWidth={1.6} />
      </span>
      {!small && <span className="ph-label">{item.label}</span>}
    </button>
  );
}

function ClockTile() {
  const now = useNow(15000);
  const h = (now.getHours() % 12) + now.getMinutes() / 60;
  const m = now.getMinutes();
  return (
    <div className="ph-app" aria-hidden="true">
      <span className="ph-ico ph-clock">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className="ph-tick" style={{ transform: `rotate(${i * 30}deg) translateY(-23px)` }} />
        ))}
        <b className="ph-hand ph-hand-h" style={{ transform: `rotate(${h * 30}deg)` }} />
        <b className="ph-hand ph-hand-m" style={{ transform: `rotate(${m * 6}deg)` }} />
        <u className="ph-pin" />
      </span>
      <span className="ph-label">时钟</span>
    </div>
  );
}

function CalendarTile({ onOpen }) {
  const now = useNow(60000);
  return (
    <button type="button" className="ph-app" onClick={() => onOpen("companion")} aria-label="日历" title="日历">
      <span className="ph-ico ph-cal">
        <small>周{WEEK[now.getDay()]}</small>
        <strong>{now.getDate()}</strong>
      </span>
      <span className="ph-label">日历</span>
    </button>
  );
}

/* ---------------------------------------------------------------- 主屏幕 */

const DOCK = ["imessage", "companion", "phone", "console"];
const P1_MINI = ["role", "user"];
const P1_ROW = ["preset", "world", "gallery", "memories", "api", "context", "offline", "theater"];

export function PhoneHome({ nav, config, onOpen, onExit }) {
  const theme = useTheme();
  const now = useNow(15000);
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);

  const byId = Object.fromEntries(nav.map((n) => [n.id, n]));
  const pick = (ids) => ids.map((id) => byId[id]).filter(Boolean);
  const used = new Set([...DOCK, ...P1_MINI, ...P1_ROW, "music"]);
  const rest = nav.filter((n) => !used.has(n.id));

  const role = (config?.roles ?? [])[0];
  const user = (config?.users ?? [])[0];
  const roleName = role?.name?.trim() || "TA";
  const userName = user?.name?.trim() || "你";
  const days = daysSince(theme.since);

  const onScroll = useCallback(() => {
    const el = pagerRef.current;
    if (el) setPage(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
  }, []);
  const goPage = (i) => pagerRef.current?.scrollTo({ left: i * pagerRef.current.clientWidth, behavior: "smooth" });

  const dateText = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className={`ph-root ph-skin-${theme.skin}`} role="dialog" aria-label="小手机主屏幕">
      <style>{CSS}</style>
      <div className="ph-bgfill" />
      <div className="ph-device">
        <div className="ph-island" />
        <div className="ph-status">
          <span className="ph-time">{pad(now.getHours())}:{pad(now.getMinutes())}</span>
          <span className="ph-sys">
            <button type="button" className="ph-exit" onClick={onExit} title="切回经典界面">经典</button>
            <span className="ph-net">5G</span>
            <span className="ph-bat"><i /></span>
          </span>
        </div>

        <div className="ph-pager" ref={pagerRef} onScroll={onScroll}>
          {/* ---- 第 1 屏 ---- */}
          <div className="ph-page">
            <div className="ph-grid">
              <div className="ph-w ph-prof ph-s4">
                <div className="ph-cover" />
                <div className="ph-avatar">{[...roleName][0]?.toUpperCase()}</div>
                <div className="ph-name">{roleName}</div>
                <div className="ph-handle">@{roleName.toLowerCase().replace(/\s+/g, "_")} <span>|</span> @{userName.toLowerCase().replace(/\s+/g, "_")}</div>
                <Editable className="ph-tagline" value={theme.tagline} onSave={(v) => setTheme({ tagline: v })} />
                <div className="ph-where">◉ {Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop().replace(/_/g, " ")} · {dateText}</div>
              </div>

              <button type="button" className="ph-w ph-music ph-s2 ph-r2" onClick={() => onOpen("music")} aria-label="一起听歌">
                <span className="ph-art">{(() => { const I = byId.music?.icon; return I ? <I size={44} strokeWidth={1.4} /> : null; })()}</span>
                <span className="ph-mt">一起听歌</span>
                <span className="ph-ms">Listen together</span>
                <span className="ph-play"><Play size={16} fill="currentColor" strokeWidth={0} /></span>
                <span className="ph-bar"><i /></span>
              </button>
              <ClockTile />
              <CalendarTile onOpen={onOpen} />
              {pick(P1_MINI).map((n) => <AppIcon key={n.id} item={n} onOpen={onOpen} />)}

              {pick(P1_ROW).map((n) => <AppIcon key={n.id} item={n} onOpen={onOpen} />)}
            </div>
          </div>

          {/* ---- 第 2 屏 ---- */}
          <div className="ph-page">
            <div className="ph-grid">
              <div className="ph-w ph-count ph-s2">
                <div className="ph-pair"><span>{[...roleName][0]?.toUpperCase()}</span><span>{[...userName][0]?.toUpperCase()}</span></div>
                <div className="ph-cap">We fall in love</div>
                {days === null ? (
                  <label className="ph-since">
                    <span>设置纪念日</span>
                    <input type="date" onChange={(e) => setTheme({ since: e.target.value })} />
                  </label>
                ) : (
                  <label className="ph-days">
                    <b>{days}</b><small>天</small>
                    <input type="date" value={theme.since} onChange={(e) => setTheme({ since: e.target.value })} aria-label="纪念日" />
                  </label>
                )}
              </div>
              <div className="ph-w ph-quote ph-s2">
                <Editable className="ph-qtext" value={theme.quote} onSave={(v) => setTheme({ quote: v })} />
                <span className="ph-heart">♡</span>
              </div>
              <div className="ph-w ph-note ph-s4">
                <span className="ph-nk">NOTE TO SELF</span>
                <Editable className="ph-nt" value={theme.note} onSave={(v) => setTheme({ note: v })} />
              </div>
              {rest.map((n) => <AppIcon key={n.id} item={n} onOpen={onOpen} />)}
            </div>
          </div>
        </div>

        <div className="ph-dots">
          {[0, 1].map((i) => (
            <button key={i} type="button" className={page === i ? "on" : ""} onClick={() => goPage(i)} aria-label={`第 ${i + 1} 屏`} />
          ))}
        </div>
        <div className="ph-dock">
          {pick(DOCK).map((n) => <AppIcon key={n.id} item={n} onOpen={onOpen} small />)}
        </div>
      </div>
    </div>
  );
}

/** 进了某个功能之后，导航轨 / 手机顶栏上那个「回主屏幕」的小按钮。 */
export function HomeButton({ onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} aria-label="回到主屏幕" title="回到主屏幕" className={className}>
      <Home size={20} strokeWidth={1.75} />
    </button>
  );
}

/* ---------------------------------------------------------------- 查手机里的设置卡 */

export function ThemeCard({ Card, Button }) {
  const theme = useTheme();
  const phone = theme.mode === "phone";
  return (
    <Card title="界面主题" desc="把整个控制台换成一部手机的样子：主屏幕上每个功能是一个小图标，点开进去还是原来的页面。只记在这个浏览器里。">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={phone ? "outline" : "primary"} onClick={() => setTheme({ mode: "phone" })}>
          {phone ? "已启用：小手机" : "启用小手机主题"}
        </Button>
        {phone && (
          <Button variant="outline" onClick={() => setTheme({ mode: "classic" })}>
            改回经典
          </Button>
        )}
      </div>
      <div className="mt-6">
        <p className="mb-2 text-eyebrow uppercase text-ink-faint">配色</p>
        <div className="flex flex-wrap gap-2">
          {SKINS.map((s) => (
            <Button key={s.id} variant={theme.skin === s.id ? "primary" : "outline"} onClick={() => setTheme({ skin: s.id })}>
              {s.name}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-6 max-w-[62ch] text-meta leading-relaxed text-ink-meta">
        壁纸直接用右上角「壁纸」选的那张；没选就用配色自带的渐变。主屏幕上的签名、小句子、纪念日都点一下就能改。
        进了某个功能之后，左边导航轨（手机上是顶栏）最上面有个小房子，点它回主屏幕。
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------- 样式 */

const CSS = `
.ph-root{position:fixed;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;animation:phIn .28s ease both}
@keyframes phIn{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}
.ph-root *{box-sizing:border-box}
.ph-skin-glass{--ph-bg:linear-gradient(165deg,#a9c9ee 0%,#7ea8dc 38%,#bcd3ee 68%,#f1e4dc 100%);--ph-card:rgba(255,255,255,.27);--ph-line:rgba(255,255,255,.6);--ph-tile:rgba(255,255,255,.27);--ph-ico:#fff;--ph-label:#fff;--ph-ts:0 1px 3px rgba(20,45,95,.5);--ph-fg:#fff;--ph-accent:rgba(255,255,255,.95);--ph-soft:rgba(255,255,255,.75)}
.ph-skin-cream{--ph-bg:linear-gradient(170deg,#eceee8 0%,#d9dfd4 55%,#ecebe5 100%);--ph-card:rgba(255,255,255,.58);--ph-line:rgba(255,255,255,.85);--ph-tile:#fbfaf7;--ph-ico:#6c695f;--ph-label:#57554d;--ph-ts:none;--ph-fg:#4b4a45;--ph-accent:#4b4a45;--ph-soft:#8a877c}
.ph-skin-dark{--ph-bg:linear-gradient(160deg,#1e2433 0%,#0d1017 60%,#221f31 100%);--ph-card:rgba(255,255,255,.09);--ph-line:rgba(255,255,255,.17);--ph-tile:rgba(255,255,255,.1);--ph-ico:#f1f1f5;--ph-label:#e8e8ee;--ph-ts:0 1px 2px rgba(0,0,0,.7);--ph-fg:#f1f1f5;--ph-accent:#fff;--ph-soft:rgba(255,255,255,.6)}
.ph-bgfill{position:absolute;inset:-40px;background-image:var(--wallpaper-image,none),var(--ph-bg);background-size:cover;background-position:center;filter:blur(26px) saturate(1.15);transform:scale(1.06)}
.ph-device{position:relative;width:min(100vw,414px);height:min(100dvh,880px);border-radius:48px;overflow:hidden;display:flex;flex-direction:column;color:var(--ph-fg);
  background-image:var(--wallpaper-image,none),var(--ph-bg);background-size:cover;background-position:center;
  box-shadow:0 0 0 9px #0b0b0d,0 0 0 11px #404046,0 34px 90px rgba(0,0,0,.5)}
@media (max-width:520px){.ph-device{width:100vw;height:100dvh;border-radius:0;box-shadow:none}.ph-island{display:none}}
.ph-island{position:absolute;z-index:4;top:11px;left:50%;transform:translateX(-50%);width:112px;height:32px;border-radius:20px;background:#09090b}
.ph-status{position:relative;z-index:3;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:max(16px,env(safe-area-inset-top)) 30px 6px;font-size:15px;font-weight:650;text-shadow:var(--ph-ts)}
.ph-sys{display:flex;align-items:center;gap:8px;font-size:13px}
.ph-exit{border:1px solid var(--ph-line);background:var(--ph-card);color:inherit;border-radius:999px;padding:1px 9px;font-size:11px;cursor:pointer;backdrop-filter:blur(10px)}
.ph-net{font-weight:700}
.ph-bat{width:25px;height:12px;border:1.5px solid currentColor;border-radius:4px;padding:1px;opacity:.9}
.ph-bat i{display:block;height:100%;width:85%;background:currentColor;border-radius:2px}
.ph-pager{flex:1 1 auto;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ph-pager::-webkit-scrollbar{display:none}
.ph-page{flex:0 0 100%;scroll-snap-align:start;padding:8px 20px 8px;overflow-y:auto;scrollbar-width:none}
.ph-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px 10px;align-items:start}
.ph-s2{grid-column:span 2}.ph-s4{grid-column:span 4}.ph-r2{grid-row:span 2}
.ph-w{position:relative;border-radius:28px;background:var(--ph-card);border:1px solid var(--ph-line);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 32px rgba(20,40,90,.14);color:var(--ph-fg);text-shadow:var(--ph-ts);overflow:hidden}
.ph-app{display:flex;flex-direction:column;align-items:center;gap:6px;border:0;background:none;padding:0;color:inherit;cursor:pointer;min-width:0;-webkit-tap-highlight-color:transparent}
.ph-ico{position:relative;width:62px;height:62px;border-radius:20px;display:grid;place-items:center;background:var(--ph-tile);border:1px solid var(--ph-line);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 -10px 16px rgba(255,255,255,.07),0 9px 20px rgba(20,40,95,.17);color:var(--ph-ico);transition:transform .14s ease}
.ph-ico svg{filter:drop-shadow(0 1px 2px rgba(10,30,80,.25))}
.ph-skin-cream .ph-ico svg{filter:none}
.ph-app:active .ph-ico,.ph-music:active{transform:scale(.93)}
.ph-label{font-size:11.5px;line-height:1.2;color:var(--ph-label);text-shadow:var(--ph-ts);max-width:76px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph-ico-dock{width:58px;height:58px;border-radius:19px}
/* 资料卡 */
.ph-prof{padding:0 18px 16px;text-align:center}
.ph-cover{height:78px;margin:0 -18px;background:linear-gradient(120deg,rgba(255,255,255,.35),rgba(255,255,255,.08)),var(--ph-bg);opacity:.9}
.ph-avatar{width:68px;height:68px;margin:-34px auto 6px;border-radius:50%;display:grid;place-items:center;font-size:28px;font-weight:700;background:linear-gradient(145deg,#fff 0%,#cfe0f6 100%);color:#4a6fa5;border:3px solid rgba(255,255,255,.85);box-shadow:0 6px 18px rgba(20,40,90,.25);text-shadow:none;position:relative}
.ph-name{font-size:21px;font-weight:700;letter-spacing:.01em}
.ph-handle{font-size:12px;color:var(--ph-soft);margin-top:2px}.ph-handle span{opacity:.6;margin:0 3px}
.ph-tagline{display:block;margin:6px 8px 0;font-family:"Cormorant Garamond",Georgia,"Songti SC",serif;font-style:italic;font-size:14px;line-height:1.35}
.ph-where{margin-top:8px;font-size:11.5px;color:var(--ph-soft)}
.ph-editable{cursor:text}.ph-ghost{opacity:.6}
.ph-edit{width:100%;background:rgba(255,255,255,.25);border:1px solid var(--ph-line);border-radius:10px;padding:4px 8px;color:inherit;font:inherit;text-align:center;outline:none}
/* 音乐 */
.ph-music{align-self:stretch;border:1px solid var(--ph-line);padding:12px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:3px;text-align:left;cursor:pointer;min-height:150px}
.ph-art{width:100%;flex:1 1 auto;min-height:64px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(255,255,255,.55),rgba(255,255,255,.12));border:1px solid var(--ph-line);color:var(--ph-ico);margin-bottom:6px}
.ph-mt{font-size:15px;font-weight:700}.ph-ms{font-size:11px;color:var(--ph-soft);margin-bottom:14px}
.ph-play{position:absolute;right:12px;bottom:22px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--ph-tile);border:1px solid var(--ph-line)}
.ph-bar{position:absolute;left:12px;right:12px;bottom:11px;height:3px;border-radius:3px;background:rgba(255,255,255,.3)}.ph-bar i{display:block;width:0%;height:100%;border-radius:3px;background:var(--ph-accent)}
/* 时钟 / 日历 */
.ph-clock{overflow:hidden}
.ph-tick{position:absolute;left:50%;top:50%;width:2px;height:5px;margin:-2.5px 0 0 -1px;border-radius:1px;background:var(--ph-ico);opacity:.55}
.ph-hand{position:absolute;left:50%;bottom:50%;transform-origin:50% 100%;border-radius:2px;background:var(--ph-ico)}
.ph-hand-h{width:3px;height:15px;margin-left:-1.5px}.ph-hand-m{width:2px;height:21px;margin-left:-1px}
.ph-pin{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--ph-ico)}
.ph-cal{align-content:center;gap:0}.ph-cal small{font-size:10px;font-weight:700;opacity:.75;line-height:1}.ph-cal strong{font-size:27px;font-weight:600;line-height:1.05}
/* 纪念日 / 小句子 */
.ph-count{padding:14px 12px;text-align:center;min-height:150px}
.ph-pair{display:flex;justify-content:center}.ph-pair span{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:linear-gradient(145deg,#fff,#cfe0f6);color:#4a6fa5;border:2.5px solid rgba(255,255,255,.85);text-shadow:none}.ph-pair span+span{margin-left:-10px}
.ph-cap{margin-top:8px;font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-size:15px}
.ph-days{position:relative;display:block;margin-top:4px;cursor:pointer}.ph-days b{font-size:34px;font-weight:650}.ph-days small{font-size:13px;margin-left:3px;opacity:.8}
.ph-days input,.ph-since input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
.ph-since{position:relative;display:inline-block;margin-top:10px;padding:5px 12px;border-radius:999px;background:var(--ph-tile);border:1px solid var(--ph-line);font-size:12px;cursor:pointer}
.ph-quote{padding:18px 14px;text-align:center;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.ph-qtext{font-family:"Cormorant Garamond",Georgia,"Songti SC",serif;font-style:italic;font-size:21px;line-height:1.3}
.ph-heart{opacity:.75;font-size:15px}
.ph-note{padding:16px 18px;text-align:left}.ph-nk{display:block;font-size:10px;letter-spacing:.14em;color:var(--ph-soft);margin-bottom:6px}.ph-nt{font-size:17px;line-height:1.35;font-weight:600}
/* 页点 + Dock */
.ph-dots{flex:0 0 auto;display:flex;justify-content:center;gap:8px;padding:6px 0 10px}
.ph-dots button{width:7px;height:7px;border-radius:50%;border:0;padding:0;background:var(--ph-fg);opacity:.35;cursor:pointer}
.ph-dots button.on{opacity:.95}
.ph-dock{flex:0 0 auto;margin:0 14px max(14px,env(safe-area-inset-bottom));padding:11px 12px;border-radius:34px;display:flex;justify-content:space-around;background:var(--ph-card);border:1px solid var(--ph-line);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 14px 34px rgba(20,40,90,.18)}
`;
