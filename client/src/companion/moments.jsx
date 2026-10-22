/*
 * 朋友圈：你和角色各自发帖（文字 / 图片），互相点赞、评论、回复。
 *
 * 数据在 Companion Worker 里（/moments*）：
 *  - 你发的帖子，图片会先用识图模型描述一遍，角色是「看描述」来理解图片的；
 *  - 角色不会立刻回：服务端排一个几分钟后的任务，像真人刷到了才点赞评论；
 *  - 角色自己发的帖子来自三处：整理时从 Uranus 记忆里挑的、自己来访时发的、你点「让 TA 发一条」。
 */

import { useEffect, useRef, useState } from "react";
import { cx, imgUrl } from "./api.js";
import { compress } from "./editors.jsx";

const SEEN_KEY = "companion.moments.seen.v1";

/** 角色最近一次在朋友圈里动作的时间（发帖 / 点赞 / 评论）。比「上次看过」新 = 底栏亮小红点。 */
export function momentsUnread(data) {
  if (!data?.moments) return false;
  let last = "";
  for (const m of data.moments) if (m.owner === "character" && m.createdAt > last) last = m.createdAt;
  for (const l of data.momentLikes || []) if (l.actor === "character" && l.createdAt > last) last = l.createdAt;
  for (const c of data.momentComments || []) if (c.actor === "character" && c.createdAt > last) last = c.createdAt;
  if (!last) return false;
  try {
    return last > (localStorage.getItem(SEEN_KEY) || "");
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function when(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const diff = (Date.now() - t) / 60000;
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${Math.floor(diff)} 分钟前`;
  const d = new Date(t);
  const today = new Date();
  const hm = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return `今天 ${hm}`;
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return `昨天 ${hm}`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) }) + ` ${hm}`;
}

function Avatar({ owner, names }) {
  const name = owner === "character" ? names.loki : names.me;
  return <div className={`mav ${owner === "character" ? "lk" : "me"}`}>{Array.from(name || "?")[0]}</div>;
}

function Heart({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}
function Bubble() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

/* ───────────── 发帖框 ───────────── */

function Composer({ ctx, onDone }) {
  const { toast, names } = ctx;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pics, setPics] = useState([]); // { key, id?, summary?, state: "up"|"desc"|"ok"|"blind"|"err", preview }
  const [busy, setBusy] = useState(false);
  const warned = useRef(false);

  const patch = (key, p) => setPics((cur) => cur.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function add(files) {
    const list = Array.from(files || []).slice(0, 9 - pics.length);
    for (const f of list) {
      const key = `${Date.now()}-${Math.random()}`;
      let data;
      try {
        data = await compress(f);
      } catch {
        toast("这张图读不出来");
        continue;
      }
      setPics((cur) => [...cur, { key, preview: data, state: "up" }]);
      try {
        const up = await cx("/image", { method: "POST", body: { data, source: "upload" } });
        patch(key, { id: up.image.id, state: "desc" });
        try {
          const z = await cx("/image/summarize", { method: "POST", body: { imageId: up.image.id, purpose: "moment" } });
          patch(key, { summary: z.summary || "", state: "ok" });
        } catch (e) {
          patch(key, { state: "blind" });
          if (!warned.current) {
            warned.current = true;
            toast(/识图/.test(e.message) ? `${names.loki} 看不到这张图，去设置「识图」看看` : `识图失败：${e.message.slice(0, 40)}`);
          }
        }
      } catch (e) {
        patch(key, { state: "err" });
        toast(e.message);
      }
    }
  }

  async function post() {
    if (pics.some((p) => p.state === "up")) return toast("图片还在上传");
    const images = pics.filter((p) => p.id).map((p) => ({ id: p.id, summary: p.summary || "" }));
    if (!text.trim() && !images.length) return toast("写点什么或者放张图");
    setBusy(true);
    try {
      await cx("/moments", { method: "POST", body: { text, images } });
      setText("");
      setPics([]);
      setOpen(false);
      warned.current = false;
      await onDone();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className="mcompose-open" onClick={() => setOpen(true)}>
        <span>分享点什么…</span>
        <span className="meta">文字 / 图片</span>
      </button>
    );

  const label = { up: "上传中", desc: "识别中", ok: "", blind: "TA 看不到", err: "失败" };
  return (
    <div className="mcompose">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="这一刻的想法…" maxLength={2000} autoFocus />
      <div className="mgrid edit">
        {pics.map((p) => (
          <div className="mcell" key={p.key}>
            <img src={p.preview} alt="" />
            {label[p.state] && <span className={`mstate ${p.state}`}>{label[p.state]}</span>}
            <button type="button" className="mx" aria-label="移除" onClick={() => setPics((cur) => cur.filter((x) => x.key !== p.key))}>
              ×
            </button>
          </div>
        ))}
        {pics.length < 9 && (
          <label className="mcell madd" aria-label="添加图片">
            +
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const f = e.target.files;
                add(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" className="pill" onClick={() => setOpen(false)}>
          收起
        </button>
        <button type="button" className="pill solid" disabled={busy} onClick={post}>
          {busy ? "发表中…" : "发表"}
        </button>
      </div>
    </div>
  );
}

/* ───────────── 一条帖子 ───────────── */

function Post({ m, ctx, view, replying, setReplying }) {
  const { data, names, load, toast } = ctx;
  const likes = (data.momentLikes || []).filter((l) => l.momentId === m.id);
  const comments = (data.momentComments || []).filter((c) => c.momentId === m.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const byId = new Map(comments.map((c) => [c.id, c]));
  const iLiked = likes.some((l) => l.actor === "user");
  const who = (a) => (a === "character" ? names.loki : names.me);
  const waiting = (data.momentJobs || []).some((j) => j.momentId === m.id);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const open = replying?.momentId === m.id;

  async function act(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  const like = () => act(() => cx(`/moments/${m.id}/like`, { method: "POST" }));
  const remove = () => window.confirm("删除这条朋友圈？图片和评论会一起删掉。") && act(() => cx(`/moments/${m.id}`, { method: "DELETE" }));
  const look = () => act(async () => {
    const r = await cx(`/moments/${m.id}/look`, { method: "POST" });
    if (!r.liked && !r.commented) toast(`${names.loki} 看过了，没说什么`);
  });
  const send = () =>
    act(async () => {
      if (!text.trim()) throw new Error("写点什么");
      await cx(`/moments/${m.id}/comment`, { method: "POST", body: { text, replyTo: replying?.replyTo || null } });
      setText("");
      setReplying(null);
    });
  const tapComment = (c) => {
    if (c.actor === "user") {
      if (window.confirm("删除这条评论？")) act(() => cx(`/moments/comment/${c.id}`, { method: "DELETE" }));
      return;
    }
    setReplying({ momentId: m.id, replyTo: c.id, to: who(c.actor) });
  };

  const imgs = m.images || [];
  return (
    <article className={`mpost ${m.owner === "character" ? "loki" : "mine"}`}>
      <Avatar owner={m.owner} names={names} />
      <div className="mbody">
        <div className="mname">{who(m.owner)}</div>
        {m.text && <div className="mtext">{m.text}</div>}
        {imgs.length > 0 && (
          <div className={`mgrid n${imgs.length === 1 ? 1 : imgs.length === 2 || imgs.length === 4 ? 2 : 3}`}>
            {imgs.map((im) => (
              <button type="button" className="mcell" key={im.id} onClick={() => view(im)}>
                <img src={imgUrl(im.id)} alt={im.summary || ""} loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className="mfoot">
          <span className="meta">
            {when(m.createdAt)}
            {m.source === "memory" ? " · 来自记忆" : ""}
          </span>
          <button type="button" className="link" onClick={remove}>
            删除
          </button>
          <span className="grow" />
          <button type="button" className={`mbtn${iLiked ? " on" : ""}`} disabled={busy} onClick={like} aria-label="赞">
            <Heart on={iLiked} />
          </button>
          <button type="button" className="mbtn" onClick={() => setReplying(open && !replying.replyTo ? null : { momentId: m.id, replyTo: null })} aria-label="评论">
            <Bubble />
          </button>
        </div>
        {m.owner === "user" && waiting && <div className="meta mwait">{names.loki} 过一会儿会来看看</div>}
        {m.owner === "user" && !waiting && !likes.some((l) => l.actor === "character") && !comments.some((c) => c.actor === "character") && (
          <button type="button" className="link mwait" disabled={busy} onClick={look}>
            {busy ? "看着…" : `让 ${names.loki} 现在看看`}
          </button>
        )}
        {(likes.length > 0 || comments.length > 0 || open) && (
          <div className="mbox">
            {likes.length > 0 && (
              <div className="mlikes">
                <Heart on /> {likes.map((l) => who(l.actor)).join("，")}
              </div>
            )}
            {comments.map((c) => {
              const to = c.replyTo && byId.get(c.replyTo);
              return (
                <button type="button" className="mcm" key={c.id} onClick={() => tapComment(c)}>
                  <b>{who(c.actor)}</b>
                  {to && to.actor !== c.actor ? (
                    <>
                      {" "}
                      回复 <b>{who(to.actor)}</b>
                    </>
                  ) : null}
                  ：{c.text}
                </button>
              );
            })}
            {open && (
              <div className="mreply">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={replying.replyTo ? `回复 ${replying.to}` : "评论"}
                  maxLength={500}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
                />
                <button type="button" className="pill solid" disabled={busy} onClick={send}>
                  发送
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/* ───────────── 页面 ───────────── */

export function MomentsPage({ ctx }) {
  const { data, names, load, toast } = ctx;
  const [busy, setBusy] = useState("");
  const [limit, setLimit] = useState(20);
  const [viewing, setViewing] = useState(null);
  const [replying, setReplying] = useState(null);

  // 打开这一页 = 看过了；停在这页时新来的也算看过
  useEffect(() => {
    markSeen();
  }, [data]);

  const all = (data.moments || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const ms = data.settings.moments || {};

  async function run(key, path, ok) {
    setBusy(key);
    try {
      const r = await cx(path, { method: "POST" });
      await load();
      toast(typeof ok === "function" ? ok(r) : ok);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="mtop">
        <div>
          <h2 className="mh">朋友圈</h2>
          <div className="meta">你和 {names.loki} 的小圈子</div>
        </div>
        <div className="acts">
          <button type="button" className="pill" disabled={!!busy} onClick={() => run("compose", "/moments/compose", `${names.loki} 发了一条`)}>
            {busy === "compose" ? "想着…" : "让 TA 发一条"}
          </button>
          <button type="button" className="pill" disabled={!!busy} onClick={() => run("memory", "/moments/from-memory", `${names.loki} 从记忆里挑了一条`)}>
            {busy === "memory" ? "翻着记忆…" : "从记忆挑一条"}
          </button>
        </div>
      </div>
      {ms.enabled === false && <p className="meta">朋友圈的自动功能在设置里关着：TA 不会自己发，也不会主动来点赞评论。按钮照样能用。</p>}
      <Composer ctx={ctx} onDone={load} />
      {all.length ? (
        all.slice(0, limit).map((m) => <Post key={m.id} m={m} ctx={ctx} view={setViewing} replying={replying} setReplying={setReplying} />)
      ) : (
        <div className="empty">还没有朋友圈。发第一条吧，{names.loki} 会来看的。</div>
      )}
      {all.length > limit && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button type="button" className="pill" onClick={() => setLimit((n) => n + 20)}>
            更早的
          </button>
        </div>
      )}
      {viewing && (
        <div className="mview" onClick={() => setViewing(null)}>
          <img src={imgUrl(viewing.id)} alt={viewing.summary || ""} />
          {viewing.summary && <div className="mviewcap">{viewing.summary}</div>}
        </div>
      )}
    </>
  );
}
