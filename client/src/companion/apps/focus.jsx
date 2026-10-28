/*
 * 专注陪伴（拾心界的 Study with Loki / Stay with Loki 搬过来）。
 *
 *  - Study：番茄钟。计时按「结束时刻」算，切到别的 App 再回来不会乱；回来时如果已经到点，会补记这一个番茄。
 *  - Stay：不计时，就是让他在这儿陪着，点他会说话。
 *  - 立绘、台词、时长都存在 Companion（换设备也在）；正在跑的计时只存在这台设备上。
 *  - 每完成一个专注番茄记一笔；开着「告诉他」的话会作为背景同步给 Uranus（20 分钟内最多一次），他也能通过 MCP 查。
 *
 * iPhone 的限制：网页在后台时没法准点响铃 / 推通知，回到页面才会提示「完成了」。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cx, imgUrl } from "../api.js";
import { AppFrame, Field, Icon, Loading, Sheet, Toast, Toggle, lsGet, lsSet, md, plusDays, uploadImage, useRemote, useToast } from "./kit.jsx";

const TIMER_KEY = "uranus.focus.timer.v1";

export const DEFAULT_LINES = {
  study: [
    "One task at a time. I am staying right here.",
    "Finish this small part first. The rest can wait.",
    "Your attention wandered. Bring it back gently.",
    "You do not have to conquer the entire universe tonight.",
    "Keep going. I am watching, and yes, I am impressed.",
    "Complete the paragraph. Then you may rest for a moment.",
  ],
  soft: ["I am here. You can return to the task when you are ready.", "A little longer, darling. Then we can breathe.", "Breathe. Drink some water. I'm not going anywhere.", "I know you are tired. Try one more small thing."],
  tease: [
    "Poking me is not, regrettably, a recognized study method.",
    "Were you working, or merely arranging the appearance of work?",
    "Back to it. I refuse to be blamed for your deadline.",
    "Five more minutes of focus. Surely even you can manage that.",
  ],
  stay: ["There you are.", "Missed me already?", "Yes, darling?", "You have my attention. Temporarily.", "How terribly needy. I approve.", "I am still here.", "Come closer, then."],
  done: ["Done. Good. You may breathe now.", "There. See? You survived it.", "Well done. Take the break.", "That's one. I'm keeping count, you know."],
};
const LINE_LABELS = { study: "专注时（开始 / 平时）", soft: "休息时", tease: "专注时点他", stay: "陪着模式点他", done: "完成一个番茄" };

const pick = (a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : "");
const pad = (n) => String(n).padStart(2, "0");

function chime(ctxRef) {
  try {
    const ac = ctxRef.current;
    if (!ac) return;
    const t0 = ac.currentTime;
    [660, 880, 990].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + i * 0.18);
      g.gain.linearRampToValueAtTime(0.18, t0 + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.18 + 0.9);
      o.connect(g).connect(ac.destination);
      o.start(t0 + i * 0.18);
      o.stop(t0 + i * 0.18 + 1);
    });
  } catch {
    /* 没声音就算了 */
  }
}

export function FocusApp({ onExit }) {
  const { data, setData, error, load } = useRemote("/focus");
  const [toastText, toast] = useToast();
  const cfg = data?.cfg;
  const name = data?.characterName || "Loki";
  const lines = useMemo(() => {
    const o = {};
    for (const k of Object.keys(DEFAULT_LINES)) o[k] = cfg?.lines?.[k]?.length ? cfg.lines[k] : DEFAULT_LINES[k];
    return o;
  }, [cfg]);

  const [mode, setMode] = useState(() => lsGet("uranus.focus.mode", "study"));
  const [timer, setTimer] = useState(() => lsGet(TIMER_KEY, null) || { phase: "focus", running: false, endAt: 0, remaining: 25 * 60, task: "", cycle: 0, loggedEnd: 0 });
  const [now, setNow] = useState(Date.now());
  const [bubble, setBubble] = useState("");
  const [bump, setBump] = useState(0);
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState(false);
  const [stayFrom] = useState(Date.now());
  const audio = useRef(null);
  const wake = useRef(null);
  const bubbleT = useRef(0);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  const minutesOf = (phase, c = cfg) => (phase === "focus" ? c?.focusMinutes || 25 : phase === "long" ? c?.longBreakMinutes || 15 : c?.breakMinutes || 5);

  const say = (t) => {
    if (!t) return;
    setBubble(t);
    clearTimeout(bubbleT.current);
    bubbleT.current = setTimeout(() => setBubble(""), 4200);
  };

  const put = (t) => {
    setTimer(t);
    lsSet(TIMER_KEY, t);
  };

  /* 第一次拿到设置：没在跑的计时器按设置里的时长重置 */
  useEffect(() => {
    if (!cfg) return;
    const t = timerRef.current;
    if (!t.running && !t.touched) put({ ...t, remaining: minutesOf(t.phase) * 60 });
    say(mode === "study" ? pick(lines.study) : pick(lines.stay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cfg]);

  useEffect(() => lsSet("uranus.focus.mode", mode), [mode]);

  /* 计时：每半秒看一眼；到点就结算（回到页面时也会补结算） */
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(Date.now());
      const t = timerRef.current;
      if (t.running && Date.now() >= t.endAt && cfg) complete(t);
    }, 500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  /* 屏幕常亮 */
  useEffect(() => {
    const want = cfg?.keepAwake && timer.running;
    async function on() {
      try {
        if ("wakeLock" in navigator && !wake.current) wake.current = await navigator.wakeLock.request("screen");
      } catch {
        /* 不支持 */
      }
    }
    if (want) on();
    else if (wake.current) {
      wake.current.release().catch(() => {});
      wake.current = null;
    }
    const vis = () => want && !document.hidden && ((wake.current = null), on());
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [cfg?.keepAwake, timer.running]);
  useEffect(() => () => wake.current?.release?.().catch(() => {}), []);

  async function complete(t) {
    if (t.loggedEnd === t.endAt) return; // 同一个番茄只结算一次（别的标签页也开着时）
    const wasFocus = t.phase === "focus";
    const cycle = wasFocus ? t.cycle + 1 : t.cycle;
    const next = wasFocus ? (cfg.longEvery && cycle % cfg.longEvery === 0 ? "long" : "break") : "focus";
    const rem = minutesOf(next) * 60;
    const auto = !!cfg.autoNext;
    put({ ...t, phase: next, running: auto, endAt: auto ? Date.now() + rem * 1000 : 0, remaining: rem, cycle: next === "focus" && t.phase === "long" ? 0 : cycle, loggedEnd: t.endAt, touched: true });
    chime(audio);
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      /* iOS 不支持 */
    }
    say(wasFocus ? pick(lines.done) : pick(lines.study));
    if (wasFocus) {
      const endD = new Date(t.endAt);
      try {
        const r = await cx("/focus/log", { method: "POST", body: { minutes: minutesOf("focus"), task: t.task, end: `${pad(endD.getHours())}:${pad(endD.getMinutes())}` } });
        setData((d) => (d ? { ...d, log: [...d.log, r.item] } : d));
      } catch (e) {
        toast(`没记上：${e.message}`);
      }
    }
  }

  function toggle() {
    try {
      // iOS 要在点按里先把声音解锁，结束时才能响
      if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)();
      audio.current.resume?.();
    } catch {
      /* ignore */
    }
    const t = timerRef.current;
    if (t.running) {
      put({ ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)), touched: true });
    } else {
      put({ ...t, running: true, endAt: Date.now() + t.remaining * 1000, touched: true });
      say(t.phase === "focus" ? pick(lines.study) : pick(lines.soft));
    }
  }
  function reset() {
    const t = timerRef.current;
    put({ ...t, running: false, remaining: minutesOf(t.phase) * 60, touched: true });
    say("Reset. Try again, darling.");
  }
  function skip() {
    const t = timerRef.current;
    const next = t.phase === "focus" ? "break" : "focus";
    put({ ...t, phase: next, running: false, remaining: minutesOf(next) * 60, touched: true });
    say(next === "focus" ? pick(lines.study) : pick(lines.soft));
  }
  function poke() {
    setBump((b) => b + 1);
    if (mode === "stay") say(pick(lines.stay));
    else say(timer.phase === "focus" && timer.running ? pick(lines.tease) : pick(Math.random() < 0.5 ? lines.tease : lines.study));
  }

  if (!data) {
    return (
      <AppFrame kicker="study with" title={name} onExit={onExit} className="la-focus">
        <style>{CSS}</style>
        <Loading error={error} retry={load} />
      </AppFrame>
    );
  }

  const rem = timer.running ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : timer.remaining;
  const total = minutesOf(timer.phase) * 60;
  const prog = total ? 1 - rem / total : 0;
  const today = data.today;
  const todays = data.log.filter((x) => x.date === today);
  const todayMin = todays.reduce((s, x) => s + x.minutes, 0);
  const art = cfg.art || {};
  const stayMin = Math.floor((now - stayFrom) / 60000);

  return (
    <AppFrame
      kicker={mode === "study" ? "study with" : "stay with"}
      title={name}
      onExit={onExit}
      className="la-focus"
      right={
        <>
          <button type="button" className="la-ico" onClick={() => setHistory(true)} aria-label="记录">
            <Icon n="timer" />
          </button>
          <button type="button" className="la-ico" onClick={() => setSettings(true)} aria-label="设置">
            <Icon n="gear" />
          </button>
        </>
      }
    >
      <style>{CSS}</style>
      <div className="fc-tabs">
        <div className="la-seg">
          <button type="button" className={mode === "study" ? "on" : ""} onClick={() => (setMode("study"), say(pick(lines.study)))}>
            Study
          </button>
          <button type="button" className={mode === "stay" ? "on" : ""} onClick={() => (setMode("stay"), say(pick(lines.stay)))}>
            Stay
          </button>
        </div>
      </div>

      <div className={`fc-stage ${mode}`} onClick={poke}>
        <div className="fc-glow" />
        <div className={`fc-bubble${bubble ? " on" : ""}`}>{bubble}</div>
        <div className="fc-art" style={{ "--x": `${art.x || 0}px`, "--y": `${art.y || 0}px` }}>
          {art.imageId ? (
            <img key={bump} className="fc-img bounce" src={imgUrl(art.imageId)} alt={name} style={{ "--s": (art.scale || 100) / 100, "--f": art.flip ? -1 : 1 }} draggable={false} />
          ) : (
            <div className="fc-ph">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
                <path d="M4 17l1.5-9 4 4L12 6l2.5 6 4-4L20 17z" />
                <path d="M4 20h16" />
              </svg>
              <b>{mode === "study" ? `Study with ${name}` : `Stay with ${name}`}</b>
              <small>在设置里上传一张透明底的立绘</small>
            </div>
          )}
        </div>
        {mode === "stay" && <div className="fc-staycount">{stayMin < 1 ? "他在这儿" : `已经陪了你 ${stayMin} 分钟`}</div>}
      </div>

      {mode === "study" && (
        <div className="fc-panel">
          <input className="fc-task" value={timer.task} placeholder="我们在做什么？" maxLength={80} onChange={(e) => put({ ...timer, task: e.target.value })} />
          <div className="fc-phase">{timer.phase === "focus" ? "FOCUS" : timer.phase === "long" ? "LONG BREAK" : "BREAK"}</div>
          <div className="fc-clock">
            {pad(Math.floor(rem / 60))}:{pad(rem % 60)}
          </div>
          <div className="fc-bar">
            <i style={{ width: `${Math.round(prog * 1000) / 10}%` }} />
          </div>
          <div className="fc-ctl">
            <button type="button" className="fc-sm" onClick={reset} aria-label="重来">
              <Icon n="reset" size={20} />
            </button>
            <button type="button" className="fc-go" onClick={toggle} aria-label={timer.running ? "暂停" : "开始"}>
              <Icon n={timer.running ? "pause" : "play"} size={26} stroke={2.2} fill={timer.running ? "none" : "currentColor"} />
            </button>
            <button type="button" className="fc-sm" onClick={skip} aria-label={timer.phase === "focus" ? "跳到休息" : "跳到专注"}>
              <Icon n="skip" size={20} />
            </button>
          </div>
          <div className="fc-foot">
            {cfg.longEvery > 0 && (
              <span className="fc-dots" aria-label="距离长休息">
                {Array.from({ length: cfg.longEvery }, (_, i) => (
                  <i key={i} className={i < timer.cycle % cfg.longEvery || (timer.phase === "long" && i < cfg.longEvery) ? "on" : ""} />
                ))}
              </span>
            )}
            <span>
              今天 {todays.length} 个番茄 · {todayMin} 分钟
            </span>
          </div>
        </div>
      )}

      {settings && <FocusSettings cfg={cfg} name={name} onClose={() => setSettings(false)} onSaved={(c) => (setData({ ...data, cfg: c }), toast("已保存"))} toast={toast} timer={timer} put={put} minutesOf={minutesOf} />}
      {history && <FocusHistory log={data.log} today={today} onClose={() => setHistory(false)} onDelete={async (id) => {
        try {
          await cx(`/focus/log/${id}`, { method: "DELETE" });
          setData({ ...data, log: data.log.filter((x) => x.id !== id) });
        } catch (e) {
          toast(e.message);
        }
      }} />}
      <Toast text={toastText} />
    </AppFrame>
  );
}

function FocusSettings({ cfg, name, onClose, onSaved, toast, timer, put, minutesOf }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(cfg)));
  const [txt, setTxt] = useState(() => Object.fromEntries(Object.keys(DEFAULT_LINES).map((k) => [k, (cfg.lines?.[k]?.length ? cfg.lines[k] : DEFAULT_LINES[k]).join("\n")])));
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const art = c.art || {};
  const setArt = (k, v) => setC({ ...c, art: { ...art, [k]: v } });

  async function save() {
    setBusy("save");
    try {
      const lines = {};
      for (const k of Object.keys(DEFAULT_LINES)) {
        const arr = txt[k].split("\n").map((s) => s.trim()).filter(Boolean);
        // 和默认一模一样就不存，以后默认台词更新了也能跟上
        lines[k] = arr.join("\n") === DEFAULT_LINES[k].join("\n") ? [] : arr;
      }
      const r = await cx("/focus/cfg", { method: "PUT", body: { ...c, lines } });
      // 改了时长：没在跑的计时器跟着变
      if (!timer.running) put({ ...timer, remaining: minutesOf(timer.phase, r.cfg) * 60 });
      onSaved(r.cfg);
      onClose();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }

  async function upload(f) {
    if (!f) return;
    setBusy("img");
    try {
      const id = await uploadImage(f, 1100);
      setArt("imageId", id);
      // 立刻存一下图片 id，免得关掉面板图就丢了
      const r = await cx("/focus/cfg", { method: "PUT", body: { art: { ...art, imageId: id } } });
      onSaved(r.cfg);
      setC((cur) => ({ ...cur, art: { ...cur.art, imageId: id } }));
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Sheet
      title="设置"
      onClose={onClose}
      tall
      footer={
        <button type="button" className="la-btn solid" disabled={!!busy} onClick={save}>
          {busy === "save" ? "保存中…" : "保存"}
        </button>
      }
    >
      <h4 className="fc-h">立绘</h4>
      <div className="fc-artset">
        <div className="fc-thumb">{art.imageId ? <img src={imgUrl(art.imageId)} alt="" style={{ transform: `scaleX(${art.flip ? -1 : 1})` }} /> : <span>无</span>}</div>
        <div className="la-row" style={{ flex: 1 }}>
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/*" hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
          <button type="button" className="la-btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <Icon n="image" size={16} /> {busy === "img" ? "上传中…" : art.imageId ? "换一张" : "上传透明底立绘"}
          </button>
          {art.imageId && (
            <button type="button" className="la-btn ghost danger" onClick={() => setArt("imageId", "")}>
              移除
            </button>
          )}
        </div>
      </div>
      {[
        ["scale", "大小", 40, 180, "%"],
        ["x", "左右", -200, 200, ""],
        ["y", "上下", -220, 220, ""],
      ].map(([k, label, a, b, u]) => (
        <label key={k} className="fc-slider">
          <span>{label}</span>
          <input type="range" min={a} max={b} value={art[k] ?? (k === "scale" ? 100 : 0)} onChange={(e) => setArt(k, Number(e.target.value))} />
          <b>
            {art[k] ?? (k === "scale" ? 100 : 0)}
            {u}
          </b>
        </label>
      ))}
      <Toggle checked={art.flip} onChange={(v) => setArt("flip", v)} label="镜像翻转" />
      <p className="la-meta">位置和大小保存后生效；上传 PNG / WebP 透明底效果最好。</p>

      <h4 className="fc-h">计时</h4>
      <div className="la-two">
        <Field label="专注（分钟）">
          <input type="number" min="1" max="180" value={c.focusMinutes} onChange={(e) => setC({ ...c, focusMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="休息（分钟）">
          <input type="number" min="1" max="60" value={c.breakMinutes} onChange={(e) => setC({ ...c, breakMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="长休息（分钟）">
          <input type="number" min="1" max="90" value={c.longBreakMinutes} onChange={(e) => setC({ ...c, longBreakMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="每几个番茄长休息" hint="0 = 不要长休息">
          <input type="number" min="0" max="12" value={c.longEvery} onChange={(e) => setC({ ...c, longEvery: Number(e.target.value) })} />
        </Field>
      </div>
      <Toggle checked={c.autoNext} onChange={(v) => setC({ ...c, autoNext: v })} label="自动开始下一段" hint="专注完自动开始休息，休息完自动开始专注" />
      <Toggle checked={c.keepAwake} onChange={(v) => setC({ ...c, keepAwake: v })} label="计时时屏幕常亮" hint="浏览器支持才有效（iOS 16.4 以上的 Safari 可以）" />
      <Toggle checked={c.tellCharacter} onChange={(v) => setC({ ...c, tellCharacter: v })} label={`完成番茄时告诉${name}`} hint="作为背景信息同步给 Uranus（20 分钟内最多一次，带当天总数），不会逼他回消息" />

      <h4 className="fc-h">台词（一行一句，随机挑）</h4>
      {Object.keys(DEFAULT_LINES).map((k) => (
        <Field key={k} label={LINE_LABELS[k]}>
          <textarea value={txt[k]} onChange={(e) => setTxt({ ...txt, [k]: e.target.value })} />
        </Field>
      ))}
      <button type="button" className="la-btn ghost" onClick={() => setTxt(Object.fromEntries(Object.entries(DEFAULT_LINES).map(([k, v]) => [k, v.join("\n")])))}>
        全部恢复默认台词
      </button>
    </Sheet>
  );
}

function FocusHistory({ log, today, onClose, onDelete }) {
  const days = Array.from({ length: 7 }, (_, i) => plusDays(today, i - 6));
  const per = days.map((d) => log.filter((x) => x.date === d).reduce((s, x) => s + x.minutes, 0));
  const max = Math.max(60, ...per);
  const week = per.reduce((a, b) => a + b, 0);
  const recent = [...log].reverse().slice(0, 40);
  return (
    <Sheet title="专注记录" onClose={onClose} tall>
      <div className="fc-week">
        {days.map((d, i) => (
          <div key={d} className={d === today ? "today" : ""}>
            <span className="v">{per[i] || ""}</span>
            <i style={{ height: `${Math.max(per[i] ? 6 : 2, (per[i] / max) * 100)}%` }} />
            <span className="d">{d === today ? "今天" : md(d).replace(/^\d+月/, "")}</span>
          </div>
        ))}
      </div>
      <p className="la-meta" style={{ textAlign: "center", margin: "6px 0 14px" }}>
        最近 7 天共 {week} 分钟（约 {Math.round((week / 60) * 10) / 10} 小时）
      </p>
      {!recent.length && <p className="la-empty">还没有完成过番茄。</p>}
      {recent.map((x) => (
        <div key={x.id} className="fc-log">
          <span>
            {x.date === today ? "今天" : md(x.date)} {x.end}
          </span>
          <b>{x.task || "（没写任务）"}</b>
          <span>{x.minutes} 分</span>
          <button type="button" className="la-ico sm" onClick={() => window.confirm("删掉这条记录？") && onDelete(x.id)} aria-label="删除">
            <Icon n="trash" size={15} />
          </button>
        </div>
      ))}
    </Sheet>
  );
}

const CSS = `
.la-focus{--ac:#e7c58f;--ac-ink:#2a2116;background:radial-gradient(90% 60% at 50% 38%,#3a3048 0,transparent 70%),linear-gradient(180deg,#14131b 0,#0e0d13 100%)}
.fc-tabs{flex:none;padding:2px 16px 0;max-width:280px;width:100%;margin:0 auto}
.fc-stage{position:relative;flex:1;min-height:0;overflow:hidden;cursor:pointer;-webkit-user-select:none;user-select:none}
.fc-glow{position:absolute;left:50%;bottom:-10%;width:130%;max-width:620px;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,#e7c58f2e 0,#e7c58f0d 40%,transparent 66%);pointer-events:none}
.fc-art{position:absolute;left:50%;bottom:0;transform:translate(calc(-50% + var(--x)),var(--y));height:100%;width:100%;max-width:520px;display:flex;align-items:flex-end;justify-content:center;pointer-events:none}
.fc-img{max-height:100%;max-width:100%;object-fit:contain;transform-origin:50% 100%;transform:scale(var(--s)) scaleX(var(--f));filter:drop-shadow(0 18px 30px #0009)}
.fc-img.bounce{animation:fcBounce .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes fcBounce{0%{transform:scale(var(--s)) scaleX(var(--f))}35%{transform:scale(calc(var(--s)*1.03),calc(var(--s)*.97)) scaleX(var(--f))}100%{transform:scale(var(--s)) scaleX(var(--f))}}
.fc-ph{margin:auto auto 22%;display:flex;flex-direction:column;align-items:center;gap:6px;color:#ffffff55;text-align:center}
.fc-ph b{font:400 20px Georgia,serif;color:#ffffffaa}
.fc-ph small{font-size:12px}
.fc-bubble{position:absolute;z-index:3;left:50%;top:14px;width:max-content;max-width:min(86%,420px);transform:translate(-50%,-6px);opacity:0;padding:11px 16px;border-radius:18px;background:#fffffff0;color:#2a2430;font:italic 15px/1.45 Georgia,"Songti SC",serif;box-shadow:0 10px 30px #0006;transition:opacity .3s,transform .3s;pointer-events:none;text-align:center}
.fc-bubble:after{content:"";position:absolute;left:50%;bottom:-6px;width:12px;height:12px;margin-left:-6px;background:inherit;transform:rotate(45deg);border-radius:2px}
.fc-bubble.on{opacity:1;transform:translate(-50%,0)}
.fc-staycount{position:absolute;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom));text-align:center;font-size:12px;letter-spacing:.08em;color:#ffffffb0;text-shadow:0 1px 8px #000}
.fc-panel{flex:none;position:relative;z-index:4;margin:0 auto;width:calc(100% - 24px);max-width:420px;margin-bottom:calc(12px + env(safe-area-inset-bottom));padding:14px 18px 12px;border-radius:26px;background:#17161ecc;border:1px solid #ffffff1c;-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 20px 50px #0008;text-align:center}
.fc-task{width:100%;border:0;border-bottom:1px solid #ffffff20;background:none;padding:6px 4px 8px;text-align:center;font-size:15px;outline:none}
.fc-task::placeholder{color:#ffffff50}
.fc-phase{margin-top:8px;font-size:11px;letter-spacing:.34em;color:var(--ac)}
.fc-clock{font:300 58px/1.05 -apple-system,"SF Pro Display","Helvetica Neue",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.fc-bar{height:3px;border-radius:3px;background:#ffffff16;margin:8px 10px 12px;overflow:hidden}
.fc-bar i{display:block;height:100%;background:var(--ac);border-radius:3px;transition:width .5s linear}
.fc-ctl{display:flex;align-items:center;justify-content:center;gap:28px}
.fc-sm{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#ffffff10!important;color:var(--dim)}
.fc-go{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--ac)!important;color:var(--ac-ink);box-shadow:0 8px 26px #e7c58f44}
.fc-go:active,.fc-sm:active{transform:scale(.94)}
.fc-foot{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;font-size:12px;color:var(--faint)}
.fc-dots{display:inline-flex;gap:5px}
.fc-dots i{width:7px;height:7px;border-radius:50%;background:#ffffff22}
.fc-dots i.on{background:var(--ac)}
.fc-h{margin:18px 0 10px;font:400 16px Georgia,"Songti SC",serif}
.fc-h:first-child{margin-top:4px}
.fc-artset{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.fc-thumb{flex:none;width:64px;height:84px;border-radius:12px;background:#ffffff0c;border:1px solid var(--l);display:grid;place-items:center;overflow:hidden;font-size:12px;color:var(--faint)}
.fc-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.fc-slider{display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:10px;padding:6px 0;font-size:13px;color:var(--dim)}
.fc-slider b{font-weight:500;text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
.fc-slider input{width:100%;accent-color:var(--ac)}
.fc-week{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:150px;align-items:end;padding:10px 4px 0}
.fc-week>div{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}
.fc-week i{width:70%;max-width:26px;border-radius:7px 7px 3px 3px;background:#ffffff22}
.fc-week .today i{background:var(--ac)}
.fc-week .v{font-size:10px;color:var(--faint);min-height:14px}
.fc-week .d{font-size:11px;color:var(--dim)}
.fc-log{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #ffffff0e;font-size:13px}
.fc-log span{color:var(--faint);font-size:12px;white-space:nowrap}
.fc-log b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
