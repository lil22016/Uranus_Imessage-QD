/*
 * Companion：Loki 和你的共同生活 —— 日程（统一待办）、日记、互动、动态、设置。
 *
 * 数据在 Companion 的 Worker 里（原来的数据原样沿用，不迁移），这里只是新的界面。
 * 整个界面画在一个 Shadow DOM 里：样式、字体、用户写的自定义 CSS 都出不了 Companion，
 * 界面别处的样式也进不来。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, appearanceVars, byTime, cleanCss, cx, dateLabel, ensureFonts, imgUrl, timeLabel, todayIn, touch } from "./api.js";
import { ActivityEditor, CommentDialog, DiaryEditor, Images, ReactDialog, StatusSheet } from "./editors.jsx";
import { SettingsPage } from "./settings.jsx";
import { CSS } from "./style.js";

/* ───────────── Shadow DOM 外壳 ───────────── */

function ShadowHost({ css, vars, children }) {
  const hostRef = useRef(null);
  const [root, setRoot] = useState(null);
  useEffect(() => {
    const el = hostRef.current;
    setRoot(el.shadowRoot || el.attachShadow({ mode: "open" }));
  }, []);
  return (
    <div ref={hostRef}>
      {root &&
        createPortal(
          <>
            <style>{css}</style>
            <div className="cmp" style={vars}>
              {children}
            </div>
          </>,
          root
        )}
    </div>
  );
}

/* ───────────── 数据 ───────────── */

function useCompanion() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await cx("/bootstrap"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 30000);
    return () => clearInterval(t);
  }, [load]);
  return { data, error, load };
}

function confetti(root) {
  const colors = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];
  const nodes = [];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.style.left = `${Math.random() * 100}vw`;
    s.style.background = colors[i % colors.length];
    s.style.setProperty("--dx", `${(Math.random() - 0.5) * 160}px`);
    s.style.animationDelay = `${Math.random() * 0.3}s`;
    root.appendChild(s);
    nodes.push(s);
  }
  setTimeout(() => nodes.forEach((n) => n.remove()), 2200);
}

/* ───────────── 入口 ───────────── */

const PAGES = ["day", "diary", "feed", "settings"];

export function CompanionApp({ page }) {
  const { data, error, load } = useCompanion();
  const [date, setDate] = useState(null);
  const [toastText, setToastText] = useState("");
  const toastTimer = useRef(null);
  const [dlg, setDlg] = useState(null); // { kind, ... }
  const rootRef = useRef(null);

  const toast = useCallback((t) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(""), 2200);
  }, []);

  const s = data?.settings;
  useEffect(() => {
    if (s && !date) setDate(todayIn(s.timezone));
  }, [s, date]);
  useEffect(() => {
    if (data?.fonts) ensureFonts(data.fonts);
  }, [data?.fonts]);

  const vars = useMemo(() => appearanceVars(s?.appearance), [s?.appearance]);
  const css = useMemo(() => CSS + "\n" + cleanCss(s?.appearance?.css), [s?.appearance?.css]);
  const pageId = PAGES.includes(page) ? page : "day";

  const ctx = {
    data,
    load,
    toast,
    date,
    setDate,
    names: { loki: s?.characterName || "Loki", me: s?.userName || "Me" },
    open: setDlg,
    celebrate: () => rootRef.current && confetti(rootRef.current),
  };

  return (
    <ShadowHost css={css} vars={vars}>
      <div ref={rootRef}>
        {!data && !error && <p className="faint">加载中…</p>}
        {error && !data && <ConnectError message={error} retry={load} />}
        {error && data && <p className="err meta">刷新失败：{error}</p>}
        {data && date && (
          <>
            {pageId === "day" && <DayPage ctx={ctx} />}
            {pageId === "diary" && <DiaryPage ctx={ctx} />}
            {pageId === "feed" && <FeedPage ctx={ctx} />}
            {pageId === "settings" && <SettingsPage ctx={ctx} />}
          </>
        )}
        {dlg?.kind === "activity" && <ActivityEditor {...dlg} ctx={ctx} onClose={() => setDlg(null)} />}
        {dlg?.kind === "diaryedit" && <DiaryEditor {...dlg} ctx={ctx} onClose={() => setDlg(null)} />}
        {dlg?.kind === "status" && (
          <StatusSheet
            item={dlg.item}
            onClose={() => setDlg(null)}
            onPick={async (v) => {
              const it = dlg.item;
              setDlg(null);
              if (v === "change") return setDlg({ kind: "activity", mode: "change", item: it });
              try {
                await cx(`/schedule/${it.id}`, { method: "PATCH", body: { status: v } });
                touch({ type: "update_schedule", summary: `${it.text}: ${v}` });
                await load();
                if (v === "done") ctx.celebrate();
              } catch (e) {
                toast(e.message);
              }
            }}
          />
        )}
        {dlg?.kind === "react" && <ReactDialog target={dlg.target} library={s.reactionLibrary} ctx={ctx} onClose={() => setDlg(null)} />}
        {dlg?.kind === "comment" && <CommentDialog target={dlg.target} diary={data.diary} ctx={ctx} onClose={() => setDlg(null)} />}
        {toastText && <div className="toast">{toastText}</div>}
      </div>
    </ShadowHost>
  );
}

function ConnectError({ message, retry }) {
  return (
    <div className="card">
      <h3>连不上 Companion</h3>
      <p className="err">{message}</p>
      <p className="faint">
        检查 Cloudflare Pages 的环境变量：COMPANION_URL（Companion 的 workers.dev 地址）和 COMPANION_KEY（它的密码）。
      </p>
      <button className="pill" onClick={retry}>
        重试
      </button>
    </div>
  );
}

/* ───────────── 日期条 + 月历 ───────────── */

function DateBar({ ctx }) {
  const { date, setDate, data } = ctx;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(date.slice(0, 7));
  useEffect(() => setMonth(date.slice(0, 7)), [date]);
  const tz = data.settings.timezone;
  const today = todayIn(tz);

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = addDays(first, -dow);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);
  const has = (iso, owner) => data.schedule.some((x) => x.owner === owner && x.date === iso);
  const shiftMonth = (n) => {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };

  return (
    <>
      <div className="bar">
        <button className="datebtn" onClick={() => setOpen((v) => !v)} aria-label="展开月历">
          {dateLabel(date, true)} {open ? "▴" : "▾"}
        </button>
        <div className="nav">
          <button className="pill" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">
            ‹
          </button>
          <button className="pill" onClick={() => setDate(today)}>
            今天
          </button>
          <button className="pill" onClick={() => setDate(addDays(date, 1))} aria-label="后一天">
            ›
          </button>
        </div>
      </div>
      {open && (
        <div className="month">
          <div className="mhead">
            <button className="pill" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <b>{month}</b>
            <button className="pill" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <div className="grid7">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="dow">
                {w}
              </div>
            ))}
            {cells.map((iso) => (
              <button
                key={iso}
                className={`day${iso.slice(0, 7) !== month ? " out" : ""}${iso === date ? " sel" : ""}${iso === today ? " today" : ""}`}
                onClick={() => setDate(iso)}
              >
                {Number(iso.slice(8))}
                <span className="dots">
                  {has(iso, "character") && <i className="dot" />}
                  {has(iso, "user") && <i className="dot me" />}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────── 互动（表情 + 评论树） ───────────── */

function Thread({ type, id, text, ctx, canInteract }) {
  const { data, names, open, load, toast } = ctx;
  const rs = data.reactions.filter((x) => x.targetType === type && x.targetId === id);
  const all = data.comments.filter((x) => (x.rootType || x.targetType) === type && (x.rootId || x.targetId) === id);
  const kids = (p) => all.filter((x) => (x.parentId || null) === (p || null));
  const who = (a) => (a === "character" ? names.loki : names.me);

  async function del(c) {
    if (!window.confirm("删除这条评论和它下面的回复？")) return;
    try {
      await cx(`/comment/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
  }
  const draw = (c, depth = 0) => (
    <div className="cm" key={c.id}>
      {c.quote && <div className="quote">“{c.quote}”</div>}
      <div>
        <b>{who(c.actor)}</b> {c.text}
      </div>
      <div className="cmtools">
        {c.actor === "character" ? (
          <button className="link" onClick={() => open({ kind: "comment", target: { type: "comment", id: c.id, text: c.text } })}>
            回复
          </button>
        ) : (
          <>
            <button className="link" onClick={() => open({ kind: "comment", target: { type: "comment", id: c.id, id2: c.id, initial: c.text, text: c.text } })}>
              编辑
            </button>
            <button className="link" onClick={() => del(c)}>
              删除
            </button>
          </>
        )}
      </div>
      {depth < 3 && kids(c.id).map((k) => draw(k, depth + 1))}
    </div>
  );

  if (!rs.length && !all.length && !canInteract) return null;
  return (
    <div className="thread">
      {(rs.length > 0 || canInteract) && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {rs.map((r) => (
            <span className="chip" key={r.id}>
              {r.emoji} <span className="meta">{who(r.actor)}</span>
            </span>
          ))}
          {canInteract && (
            <>
              <button className="pill" onClick={() => open({ kind: "react", target: { type, id, text } })}>
                表情
              </button>
              <button className="pill" onClick={() => open({ kind: "comment", target: { type, id, text } })}>
                评论
              </button>
            </>
          )}
        </div>
      )}
      {kids(null).map((c) => draw(c))}
    </div>
  );
}

/* ───────────── 活动（待办）行 ───────────── */

const SYMBOL = { planned: "", done: "✓", failed: "×", cancelled: "×", changed: "−" };

function SuggestionBubble({ g, ctx, item }) {
  const { names, load, toast, open } = ctx;
  const [busy, setBusy] = useState(false);
  async function act(kind) {
    setBusy(true);
    try {
      await cx(`/suggestion/${g.id}/${kind}`, { method: "POST" });
      await load();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bubble">
      {g.status === "accepted" && <span className="badge ok">✓ 已接受</span>}
      {g.status === "rejected" && <span className="badge no">× 已拒绝</span>}
      <div className="who">{names.loki} 的建议</div>
      <div className="bt">
        {g.text}
        {g.time ? <span className="meta"> · {g.time}{g.end ? `–${g.end}` : ""}</span> : null}
      </div>
      {g.desc && <div className="bd">{g.desc}</div>}
      {g.status === "pending" && item.owner === "user" && (
        <div className="tools">
          <button className="pill solid" disabled={busy} onClick={() => act("accept")}>
            接受
          </button>
          <button className="pill" disabled={busy} onClick={() => act("reject")}>
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item, ctx, nested }) {
  const { data, open, load, toast, names, setDate } = ctx;
  const mine = item.owner === "user";
  const [tools, setTools] = useState(false);
  const sugs = data.suggestions.filter((g) => g.targetId === item.id);
  const pending = sugs.some((g) => g.status === "pending");
  const struck = item.status === "changed" || item.status === "failed" || item.status === "cancelled" || pending;
  const rep = item.changedTo ? data.schedule.find((x) => x.id === item.changedTo) : null;
  const legacyActual = item.status === "changed" && !item.changedTo && item.actualText;

  async function remove() {
    if (!window.confirm("删除这条活动？删掉后不能恢复。")) return;
    try {
      await cx(`/schedule/${item.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <>
      <div className={`act ${mine ? "mine" : "loki"}${struck ? " struck" : ""}${nested ? " nested" : ""}`} data-id={item.id}>
        <button
          className={`circle ${item.status}`}
          disabled={!mine || (item.status === "changed" && !!item.changedTo)}
          onClick={() => open({ kind: "status", item })}
          aria-label={`状态：${item.status}`}
        >
          {SYMBOL[item.status] ?? ""}
        </button>
        <div className="abody" onClick={() => mine && setTools((v) => !v)}>
          {timeLabel(item) && <div className="atime">{timeLabel(item)}</div>}
          <div className="atitle">
            {item.text}
            {item.suggestedBy === "character" && <span className="tag">{names.loki} 的建议</span>}
            {item.status === "cancelled" && <span className="tag">已取消</span>}
          </div>
          {item.desc && <div className="adesc">{item.desc}</div>}
          {!mine && item.statusNote && item.status !== "planned" && <div className="adesc">{item.statusNote}</div>}
          <Images list={item.images} />
          {item.status === "done" && (item.doneText || item.statusImages?.length > 0) && (
            <div className="done-note">
              {item.doneText && item.doneText !== item.text ? item.doneText : ""}
              <Images list={item.statusImages} />
            </div>
          )}
          {mine && tools && (
            <div className="tools" onClick={(e) => e.stopPropagation()}>
              <button className="pill" onClick={() => open({ kind: "activity", mode: "edit", item })}>
                编辑
              </button>
              {item.status !== "changed" && (
                <button className="pill" onClick={() => open({ kind: "activity", mode: "change", item })}>
                  改主意
                </button>
              )}
              <button className="pill danger" onClick={remove}>
                删除
              </button>
            </div>
          )}
          <Thread type="schedule" id={item.id} text={item.text} ctx={ctx} canInteract={!mine} />
        </div>
      </div>
      {sugs.map((g) => (
        <SuggestionBubble key={g.id} g={g} ctx={ctx} item={item} />
      ))}
      {rep && (
        <>
          <div className="arrow">↓</div>
          {rep.date === item.date ? (
            <ActivityRow item={rep} ctx={ctx} nested />
          ) : (
            <div className="arrow">
              <button className="link" onClick={() => rep.date && setDate(rep.date)}>
                改到 {rep.date ? dateLabel(rep.date) : "未排期"}：{rep.text}
              </button>
            </div>
          )}
        </>
      )}
      {legacyActual && (
        <>
          <div className="arrow">↓</div>
          <div className={`act nested ${mine ? "mine" : "loki"}`}>
            <span className="circle done">✓</span>
            <div className="abody">
              <div className="atitle">{item.actualText}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ───────────── 日程页 ───────────── */

function DayPage({ ctx }) {
  const { data, date, names, open, toast, load } = ctx;
  const [busy, setBusy] = useState("");
  const byId = useMemo(() => new Map(data.schedule.map((x) => [x.id, x])), [data.schedule]);

  const top = (owner, d) =>
    data.schedule
      .filter((x) => {
        if (x.owner !== owner || x.date !== d) return false;
        const from = x.changedFrom && byId.get(x.changedFrom);
        return !from || from.date !== x.date;
      })
      .sort(byTime);

  async function run(key, fn, ok) {
    setBusy(key);
    try {
      await fn();
      await load();
      if (ok) toast(ok);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  const agent = (mode) => run(mode, () => cx("/agent/run", { method: "POST", body: { mode, date } }), "完成");
  const meddle = () => run("suggest", () => cx("/suggest/run", { method: "POST", body: { date } }), `${names.loki} 提了建议`);

  const loki = top("character", date);
  const mine = top("user", date);
  const undated = data.schedule.filter((x) => !x.date && !x.changedFrom).sort(byTime);

  return (
    <>
      <DateBar ctx={ctx} />

      <section className="sec">
        <div className="sechead">
          <h2>{names.loki} 的一天</h2>
          <div className="acts">
            <button className="pill" disabled={!!busy} onClick={() => agent("write_schedule")}>
              {busy === "write_schedule" ? "写着…" : "让 TA 写"}
            </button>
            <button className="pill" disabled={!!busy} onClick={() => agent("review_status")}>
              {busy === "review_status" ? "复盘中…" : "让 TA 复盘进度"}
            </button>
          </div>
        </div>
        {loki.length ? loki.map((x) => <ActivityRow key={x.id} item={x} ctx={ctx} />) : <div className="empty">这天还没有。</div>}
      </section>

      <section className="sec">
        <div className="sechead">
          <h2>{names.me} 的一天</h2>
          <div className="acts">
            <button className="pill solid" onClick={() => open({ kind: "activity", mode: "create", date })}>
              + 添加
            </button>
            <button className="pill" disabled={!!busy} onClick={() => agent("look_schedule")}>
              {busy === "look_schedule" ? "看着…" : "让 TA 看看"}
            </button>
            <button className="pill" disabled={!!busy} onClick={meddle}>
              {busy === "suggest" ? "想着…" : "让 TA 捣乱"}
            </button>
          </div>
        </div>
        {mine.length ? mine.map((x) => <ActivityRow key={x.id} item={x} ctx={ctx} />) : <div className="empty">这天还没有安排。</div>}
      </section>

      {undated.length > 0 && (
        <section className="sec">
          <div className="sechead">
            <h2>未排期</h2>
            <span className="meta">还没定日子的想法</span>
          </div>
          {undated.map((x) => (
            <ActivityRow key={x.id} item={x} ctx={ctx} />
          ))}
        </section>
      )}
    </>
  );
}

/* ───────────── 日记页 ───────────── */

function Marked({ text, marks }) {
  const ok = marks
    .filter((h) => h.start >= 0 && text.slice(h.start, h.end) === h.text)
    .sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const h of ok) {
    if (h.start < pos) continue;
    if (h.start > pos) out.push(text.slice(pos, h.start));
    out.push(<mark key={h.id}>{text.slice(h.start, h.end)}</mark>);
    pos = h.end;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}

function DiaryEntry({ entry, ctx }) {
  const { data, open, load, toast } = ctx;
  const mine = entry.owner === "user";
  const [pick, setPick] = useState(false);
  const [quote, setQuote] = useState("");
  const marks = data.highlights.filter((h) => h.diaryId === entry.id);

  useEffect(() => {
    if (!pick) return undefined;
    const on = () => {
      const t = (document.getSelection()?.toString() || "").trim();
      setQuote(t && entry.text.includes(t) ? t : "");
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, [pick, entry.text]);

  async function remove() {
    if (!window.confirm("删除这篇日记？删掉后不能恢复。")) return;
    try {
      await cx(`/diary/${entry.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <article className="entry" data-id={entry.id}>
      <div className="row">
        <div className="grow">
          <h3>{entry.title || "日记"}</h3>
          <div className="meta">
            {new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            {entry.kind && entry.kind !== "diary" ? ` · ${entry.kind}` : ""}
          </div>
        </div>
        {mine && (
          <div className="acts">
            <button className="pill" onClick={() => open({ kind: "diaryedit", entry, date: entry.date })}>
              编辑
            </button>
            <button className="pill danger" onClick={remove}>
              删除
            </button>
          </div>
        )}
      </div>
      <div className={`etext${pick ? " selmode" : ""}`}>
        <Marked text={entry.text} marks={marks} />
      </div>
      <Images list={entry.images} />
      {!mine && (
        <div className="selbar">
          <button
            className="link"
            onClick={() => {
              setPick((v) => !v);
              setQuote("");
            }}
          >
            {pick ? "退出选段" : "选一段来评论"}
          </button>
          {pick && !quote && <span>在上面选中一段文字</span>}
          {pick && quote && (
            <button
              className="pill solid"
              onClick={() => {
                open({ kind: "comment", target: { type: "diary", id: entry.id, text: `Diary ${entry.date}`, quote } });
                setPick(false);
                setQuote("");
              }}
            >
              评论“{quote.length > 12 ? `${quote.slice(0, 12)}…` : quote}”
            </button>
          )}
        </div>
      )}
      <Thread type="diary" id={entry.id} text={`Diary ${entry.date}`} ctx={ctx} canInteract={!mine} />
    </article>
  );
}

function DiaryPage({ ctx }) {
  const { data, date, names, open, load, toast } = ctx;
  const [owner, setOwner] = useState("character");
  const [busy, setBusy] = useState(false);
  const entries = data.diary.filter((x) => x.owner === owner && x.date === date).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  async function ask(mode) {
    setBusy(true);
    try {
      await cx("/agent/run", { method: "POST", body: { mode, date } });
      await load();
      toast("完成");
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DateBar ctx={ctx} />
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <div className="seg">
          <button className={owner === "character" ? "on" : ""} onClick={() => setOwner("character")}>
            {names.loki}
          </button>
          <button className={owner === "user" ? "on" : ""} onClick={() => setOwner("user")}>
            {names.me}
          </button>
        </div>
        <div className="acts">
          {owner === "user" ? (
            <>
              <button className="pill solid" onClick={() => open({ kind: "diaryedit", date })}>
                + 写一篇
              </button>
              <button className="pill" disabled={busy} onClick={() => ask("look_diary")}>
                {busy ? "看着…" : "让 TA 看看"}
              </button>
            </>
          ) : (
            <button className="pill" disabled={busy} onClick={() => ask("write_diary")}>
              {busy ? "写着…" : "让 TA 写"}
            </button>
          )}
        </div>
      </div>
      {entries.length ? entries.map((e) => <DiaryEntry key={e.id} entry={e} ctx={ctx} />) : <div className="empty">这天没有日记。</div>}
    </>
  );
}

/* ───────────── 动态页 ───────────── */

function FeedPage({ ctx }) {
  const { data, date } = ctx;
  const tz = data.settings.timezone;
  const day = (n) => n.activityDate || todayIn(tz);
  const list = data.notifications.filter((n) => day(n) === date);
  return (
    <>
      <DateBar ctx={ctx} />
      {list.length ? (
        list.map((n) => (
          <div className="note" key={n.id}>
            {n.text}
            <div className="meta">{new Date(n.createdAt).toLocaleString("zh-CN")}</div>
          </div>
        ))
      ) : (
        <div className="empty">这天没有动态。</div>
      )}
    </>
  );
}
