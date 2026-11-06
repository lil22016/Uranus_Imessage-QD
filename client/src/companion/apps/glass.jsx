/*
 * 雾玻璃：一面两边都起了雾的玻璃，他在另一边。
 *
 *  - 手指划 = 擦开你这边的雾（擦开后还是朦胧的，因为他那边的雾还在），过一阵会重新起雾。
 *  - 点一下 = 指尖碰一下玻璃；连着点两下以上 = 敲玻璃。
 *  - 敲玻璃、或者擦了一阵之后，他偶尔会从那边回应：写一句话 / 按一个手印 / 留一个唇印 / 敲回来。
 *    写的话来自句子库（glasslines.js），按你这边的时间挑，不调模型。
 *  - 背景默认是自带的那张；设置里可以换，也可以让它跟着他在地图上的位置走（每个地点一张）。
 *  - 一整段（离开、切走、或者 3 分钟没动）汇总成一条背景信息发给 Uranus，不是敲一下发一下。
 *
 * 数据在 Companion：GET /glass、PUT /glass/cfg、POST /glass/session（src/life.js）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx, imgUrl } from "../api.js";
import { AppFrame, Field, Icon, Loading, Sheet, Toast, Toggle, uploadImage, useRemote, useToast } from "./kit.jsx";
import { createGlass, ensureHandFont, knockSound, loadImage } from "./glassengine.js";
import { BUCKETS, DEFAULT_LINES, EXTRA, bucketAt, linesOf, pickLine } from "./glasslines.js";

const DEFAULT_SCENE = "/glass/scene.jpg";
const IDLE_FLUSH = 3 * 60000;
const OFTEN = { rare: 0.4, normal: 0.75, always: 1 };
const KIND_W = { text: 55, hand: 22, lips: 13, knock: 10 };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function chooseKind(kinds, trigger) {
  const pool = Object.entries(KIND_W)
    .filter(([k]) => kinds?.[k] !== false)
    .map(([k, w]) => [k, trigger === "knock" && k === "knock" ? w * 2.2 : w]);
  if (!pool.length) return "";
  let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of pool) if ((r -= w) <= 0) return k;
  return pool[0][0];
}

const newSession = () => ({ startedAt: "", lastAt: 0, knocks: 0, taps: 0, wipes: 0, replies: [] });

export function GlassApp({ onExit }) {
  const { data, setData, error, load } = useRemote("/glass", 5 * 60000);
  const [toastText, toast] = useToast();
  const [settings, setSettings] = useState(false);
  const [hint, setHint] = useState(true);
  const canvasRef = useRef(null);
  const engine = useRef(null);
  const art = useRef({});
  const cfg = data?.cfg;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const scene = useMemo(() => {
    if (!cfg) return "";
    const placeImg = cfg.followPlace && data?.here?.id ? cfg.bg?.[data.here.id] : "";
    const id = placeImg || cfg.bgDefault;
    return id ? imgUrl(id) : DEFAULT_SCENE;
  }, [cfg, data?.here?.id]);

  /* ── 这一段的记录 ── */
  const sess = useRef(newSession());
  const flush = useCallback(() => {
    const s = sess.current;
    sess.current = newSession();
    if (!s.startedAt || (!s.knocks && !s.wipes && !s.taps)) return;
    if (cfgRef.current && cfgRef.current.tellCharacter === false) return;
    cx("/glass/session", { method: "POST", body: { ...s, endedAt: new Date(s.lastAt || Date.now()).toISOString() } }).catch(() => {});
  }, []);
  const note = (patch) => {
    const s = sess.current;
    if (!s.startedAt) s.startedAt = new Date().toISOString();
    s.lastAt = Date.now();
    patch(s);
  };

  /* ── 他的回应 ── */
  const st = useRef({ taps: [], knockT: 0, wipeDist: 0, wipeT: 0, blockUntil: 0, recent: [], last: { x: 0, y: 0 } });

  const respond = useCallback(
    (trigger) => {
      const c = cfgRef.current, e = engine.current;
      if (!c || !e) return;
      const s = st.current, now = Date.now();
      if (now < s.blockUntil) return;
      if (Math.random() > (OFTEN[c.often] ?? 0.75)) return;
      const kind = chooseKind(c.kinds, trigger);
      if (!kind) return;
      const delay = rand(700, 2100);
      s.blockUntil = now + delay + 3000;
      setTimeout(async () => {
        const g = engine.current;
        if (!g) return;
        const { w: W, h: H } = g.size();
        const sound = cfgRef.current?.sound !== false;
        let busyFor = 4;
        if (kind === "text") {
          await ensureHandFont();
          const line = pickLine(cfgRef.current?.lines, { knocked: trigger === "knock", recent: s.recent });
          if (!line) return;
          s.recent = [line, ...s.recent].slice(0, 12);
          const size = clamp(W * 0.105, 30, 56);
          const t = g.write(line, { cx: W / 2 + rand(-W * 0.04, W * 0.04), cy: H * rand(0.3, 0.6), maxW: W * 0.78, size, rot: rand(-0.06, 0.06) });
          busyFor = t + 4;
          note((x) => x.replies.push({ kind: "text", text: line }));
        } else if (kind === "hand" || kind === "lips") {
          const img = art.current[kind];
          if (!img) return;
          if (kind === "hand") {
            const w = Math.min(W * 0.74, 440);
            g.stamp(img, { cx: clamp(s.last.x + rand(-30, 30), W * 0.32, W * 0.68), cy: clamp(s.last.y + rand(-50, 30), H * 0.32, H * 0.66), w, rot: rand(-0.26, 0.22), flip: Math.random() < 0.5 });
          } else {
            const w = Math.min(W * 0.46, 290);
            g.stamp(img, { cx: W * rand(0.36, 0.64), cy: H * rand(0.34, 0.6), w, rot: rand(-0.22, 0.22), press: true, hold: 8 });
          }
          busyFor = 5;
          note((x) => x.replies.push({ kind }));
        } else if (kind === "knock") {
          g.knockBack({ sound });
          busyFor = 2.5;
          note((x) => x.replies.push({ kind: "knock" }));
        }
        s.blockUntil = Date.now() + busyFor * 1000;
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* ── 引擎 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = st.current;
    const g = createGlass(canvas, {
      onTouch: (p) => {
        s.last = p;
        setHint(false);
      },
      onTap: (p) => {
        if (cfgRef.current?.sound !== false) knockSound();
        const now = Date.now();
        s.taps = [...s.taps.filter((t) => now - t < 1800), now];
        note((x) => x.taps++);
        clearTimeout(s.knockT);
        s.knockT = setTimeout(() => {
          if (s.taps.length >= 2) {
            s.taps = [];
            note((x) => x.knocks++);
            respond("knock");
          }
        }, 850);
      },
      onStrokeEnd: (p) => {
        s.last = p;
        if (p.dist > 40) note((x) => x.wipes++);
        s.wipeDist += p.dist;
        clearTimeout(s.wipeT);
        s.wipeT = setTimeout(() => {
          if (s.wipeDist > 380) {
            s.wipeDist = 0;
            respond("wipe");
          }
        }, 1300);
      },
    });
    engine.current = g;
    loadImage("/glass/hand.png").then((i) => (art.current.hand = i)).catch(() => {});
    loadImage("/glass/lips.png").then((i) => (art.current.lips = i)).catch(() => {});
    ensureHandFont();
    return () => {
      clearTimeout(s.knockT);
      clearTimeout(s.wipeT);
      g.destroy();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scene) engine.current?.setScene(scene);
  }, [scene]);

  /* ── 什么时候把这一段发出去：离开、切到后台、3 分钟没动 ── */
  useEffect(() => {
    const vis = () => document.hidden && flush();
    const iv = setInterval(() => {
      const s = sess.current;
      if (s.startedAt && Date.now() - s.lastAt > IDLE_FLUSH) flush();
    }, 20000);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const save = async (patch) => {
    try {
      const r = await cx("/glass/cfg", { method: "PUT", body: patch });
      setData((d) => ({ ...d, cfg: r.cfg }));
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  };

  return (
    <AppFrame
      kicker="Through the glass"
      title="雾玻璃"
      onExit={onExit}
      className="gl"
      right={
        <button type="button" className="la-ico" onClick={() => setSettings(true)} aria-label="设置">
          <Icon n="gear" size={21} />
        </button>
      }
    >
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="gl-canvas" />
      {hint && <div className="gl-hint">划开雾气，或者敲两下玻璃</div>}
      {!data && error && (
        <div className="gl-err">
          <Loading error={error} retry={load} />
        </div>
      )}
      {settings && cfg && <GlassSettings data={data} cfg={cfg} save={save} toast={toast} onClose={() => setSettings(false)} />}
      <Toast text={toastText} />
    </AppFrame>
  );
}

/* ───────────── 设置 ───────────── */

function Slot({ label, sub, imageId, onPick, onClear, fallback }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="gl-slot">
      <button type="button" className="gl-thumb" onClick={() => ref.current?.click()} style={{ backgroundImage: imageId ? `url(${imgUrl(imageId)})` : fallback === "" ? "none" : `url(${fallback || DEFAULT_SCENE})` }} aria-label={`给「${label}」换背景`}>
        {!imageId && fallback === "" && <Icon n="plus" size={18} />}
        {busy && <span className="gl-busy">…</span>}
      </button>
      <div className="gl-slot-t">
        <b>{label}</b>
        <small>{sub}</small>
      </div>
      {imageId ? (
        <button type="button" className="la-btn ghost" onClick={onClear}>
          不用了
        </button>
      ) : (
        <button type="button" className="la-btn ghost" onClick={() => ref.current?.click()}>
          上传
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            await onPick(f);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function GlassSettings({ data, cfg, save, toast, onClose }) {
  const [editing, setEditing] = useState(null);
  const places = data?.places ?? [];
  const here = data?.here;
  const name = data?.characterName || "他";
  const upload = async (f, apply) => {
    try {
      const id = await uploadImage(f, 1400);
      if (await save(apply(id))) toast("换好了");
    } catch (e) {
      toast(e.message);
    }
  };
  const nowKey = bucketAt();

  return (
    <Sheet title="雾玻璃设置" onClose={onClose} tall>
      <div className="la-card">
        <h3>{name}怎么回应你</h3>
        <div className="la-chips" style={{ marginBottom: 12 }}>
          {[
            ["text", "写字"],
            ["hand", "手印"],
            ["lips", "唇印"],
            ["knock", "敲回来"],
          ].map(([k, l]) => (
            <button key={k} type="button" className={`la-chip${cfg.kinds?.[k] !== false ? " on" : ""}`} onClick={() => save({ kinds: { [k]: cfg.kinds?.[k] === false } })}>
              {l}
            </button>
          ))}
        </div>
        <Field label="多久回应一次" hint="敲两下玻璃，或者擦了一阵之后，他按这个概率回应；回应完会停几秒再接下一次。">
          <div className="la-seg">
            {[
              ["rare", "偶尔"],
              ["normal", "经常"],
              ["always", "每次"],
            ].map(([k, l]) => (
              <button key={k} type="button" className={cfg.often === k ? "on" : ""} onClick={() => save({ often: k })}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Toggle label="声音" hint="敲玻璃的声音，和他敲回来的声音" checked={cfg.sound} onChange={(v) => save({ sound: v })} />
        <Toggle label={`告诉${name}`} hint="每次离开、切到别的 App、或者 3 分钟没动，把这一段（敲了几次、擦了几下、他回了什么）汇总成一条背景信息发给他。不会让他回消息。" checked={cfg.tellCharacter} onChange={(v) => save({ tellCharacter: v })} />
      </div>

      <div className="la-card">
        <h3>玻璃后面</h3>
        <Slot
          label="默认背景"
          sub={cfg.bgDefault ? "用的是你上传的图" : "用的是自带的那张"}
          imageId={cfg.bgDefault}
          onPick={(f) => upload(f, (id) => ({ bgDefault: id }))}
          onClear={() => save({ bgDefault: "" })}
        />
        <Toggle
          label={`跟着${name}的位置换`}
          hint={`按「他的位置」里他现在在哪个地点，用那个地点的图。哪个地点没传图，就用默认背景。地图上新加的地点会自动出现在下面。`}
          checked={cfg.followPlace}
          onChange={(v) => save({ followPlace: v })}
        />
        {cfg.followPlace &&
          (places.length ? (
            places.map((p) => (
              <Slot
                key={p.id}
                label={p.name}
                sub={here?.id === p.id ? `${name}现在在这里` : cfg.bg?.[p.id] ? "已上传" : "没传图，用默认背景"}
                imageId={cfg.bg?.[p.id] || ""}
                fallback=""
                onPick={(f) => upload(f, (id) => ({ bg: { [p.id]: id } }))}
                onClear={() => save({ bg: { [p.id]: "" } })}
              />
            ))
          ) : (
            <p className="la-meta">地图上还没有地点。先去「他的位置」加几个。</p>
          ))}
      </div>

      <div className="la-card">
        <h3>他写给你的话</h3>
        <p className="la-meta" style={{ margin: "0 0 10px" }}>
          按你这边的时间抽句子。熬夜那一段算到早上 6 点。点一类可以改。
        </p>
        {[...BUCKETS, ...EXTRA].map((b) => {
          const custom = Array.isArray(cfg.lines?.[b.key]) && cfg.lines[b.key].length;
          return (
            <button key={b.key} type="button" className="gl-bucket" onClick={() => setEditing(b)}>
              <span>
                <b>
                  {b.label}
                  {b.key === nowKey && <i className="gl-now">现在</i>}
                </b>
                <small>{b.range}</small>
              </span>
              <span className="la-meta">
                {linesOf(cfg.lines, b.key).length} 句{custom ? " · 改过" : ""}
              </span>
              <Icon n="chevR" size={16} />
            </button>
          );
        })}
      </div>
      {editing && <LinesEditor bucket={editing} cfg={cfg} save={save} toast={toast} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

function LinesEditor({ bucket, cfg, save, toast, onClose }) {
  const [text, setText] = useState(() => linesOf(cfg.lines, bucket.key).join("\n"));
  const rows = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const commit = async (arr) => {
    const lines = { ...(cfg.lines || {}), [bucket.key]: arr };
    if (!arr.length) delete lines[bucket.key];
    if (await save({ lines })) {
      toast(arr.length ? "存好了" : "恢复成默认了");
      onClose();
    }
  };
  return (
    <Sheet
      title={`${bucket.label} · ${bucket.range}`}
      onClose={onClose}
      tall
      footer={
        <>
          <button type="button" className="la-btn" onClick={() => commit([])}>
            恢复默认
          </button>
          <button type="button" className="la-btn solid" onClick={() => commit(rows)}>
            保存（{rows.length} 句）
          </button>
        </>
      }
    >
      <Field label="一行一句" hint="写在玻璃上的字要短，一句最好不超过 40 个字母左右。删空再保存 = 用回默认的。">
        <textarea className="gl-ta" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </Field>
      {DEFAULT_LINES[bucket.key] && (
        <p className="la-meta">默认的这一类有 {DEFAULT_LINES[bucket.key].length} 句。</p>
      )}
    </Sheet>
  );
}

const CSS = `
.gl{background:#1a2430}
.gl .la-top{background:linear-gradient(rgba(10,16,24,.5),rgba(10,16,24,0));max-width:none}
.gl .la-top .la-ico{color:#fff}
.gl .la-brand small{color:#ffffffaa}
.gl .la-brand h1{color:#fff;text-shadow:0 1px 8px #0006}
.gl-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;z-index:0}
.gl-hint{position:absolute;left:0;right:0;bottom:calc(44px + env(safe-area-inset-bottom));text-align:center;color:#ffffffd8;font-size:13px;letter-spacing:.12em;text-shadow:0 1px 6px #0007;pointer-events:none;animation:glHint 3.2s ease-in-out infinite}
@keyframes glHint{0%,100%{opacity:.35}50%{opacity:.95}}
.gl-err{position:absolute;inset:30% 0 auto;z-index:3}
.gl-slot{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #ffffff10}
.gl-thumb{flex:none;width:46px!important;height:64px;border-radius:10px;background-color:#ffffff10!important;background-position:center;background-size:cover;background-repeat:no-repeat;border:1px solid var(--l)!important;display:grid;place-items:center;color:var(--dim);position:relative}
.gl-busy{position:absolute;inset:0;display:grid;place-items:center;background:#0008;border-radius:10px}
.gl-slot-t{flex:1;min-width:0}
.gl-slot-t b{display:block;font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gl-slot-t small{display:block;font-size:11.5px;color:var(--faint)}
.gl-bucket{display:flex!important;width:100%;align-items:center;gap:10px;padding:11px 0!important;border-bottom:1px solid #ffffff10!important;text-align:left}
.gl-bucket:last-child{border-bottom:0!important}
.gl-bucket>span:first-child{flex:1;min-width:0}
.gl-bucket b{font-weight:500;font-size:14px}
.gl-bucket small{display:block;font-size:11.5px;color:var(--faint)}
.gl-now{font-style:normal;font-size:10.5px;margin-left:8px;padding:1px 7px;border-radius:99px;background:var(--ac);color:var(--ac-ink)}
.gl-ta{min-height:46vh!important;font-size:15px!important;line-height:1.6!important}
`;
