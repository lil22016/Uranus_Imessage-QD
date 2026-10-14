/*
 * 弹层和编辑器：活动、日记、状态菜单、互动（表情 / 评论）、图片挑选。
 * 都画在 Companion 自己的 Shadow DOM 里（样式见 style.js）。
 */

import { useState } from "react";
import { cx, imgUrl, touch } from "./api.js";

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ───────────── 图片 ───────────── */

async function compress(file) {
  const bmp = await createImageBitmap(file);
  const q = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * q);
  cv.height = Math.round(bmp.height * q);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.78);
}

async function describe(image) {
  try {
    const z = await cx("/image/summarize", { method: "POST", body: { imageId: image.id } });
    image.summary = z.summary || "";
  } catch {
    /* 没配识图模型就没有描述，不影响图片本身 */
  }
  return image;
}

export function Images({ list = [] }) {
  if (!list.length) return null;
  return (
    <div className="imgs">
      {list.map((im) => (
        <figure key={im.id}>
          <img src={imgUrl(im.id)} alt={im.summary || "image"} />
          {im.summary && <figcaption>{im.summary}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export function ImagePicker({ value, onChange, toast }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      onChange([...value, await fn()]);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <span>图片</span>
      <Images list={value} />
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="pill" style={{ cursor: "pointer" }}>
          {busy ? "处理中…" : "+ 上传"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f)
                run(async () => describe((await cx("/image", { method: "POST", body: { data: await compress(f), source: "upload" } })).image));
            }}
          />
        </label>
        <button
          type="button"
          className="pill"
          disabled={busy}
          onClick={() => {
            const p = window.prompt("图片里要有什么？");
            if (p) run(async () => describe((await cx("/image/generate", { method: "POST", body: { prompt: p } })).image));
          }}
        >
          生成
        </button>
        {value.length > 0 && (
          <button type="button" className="pill" onClick={() => onChange([])}>
            全部移除
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── 活动（统一待办）编辑器 ───────────── */

/**
 * mode:
 *  - "create"  新建（可以不选日期 = 未排期）
 *  - "edit"    改标题 / 描述 / 日期 / 时间
 *  - "change"  改主意：原条目划掉，新建一条关联的替代活动
 */
export function ActivityEditor({ mode, item, date, ctx, onClose }) {
  const { load, toast } = ctx;
  const [text, setText] = useState(mode === "change" ? "" : item?.text || "");
  const [desc, setDesc] = useState(mode === "change" ? "" : item?.desc || "");
  const [d, setD] = useState(mode === "create" ? date || "" : item?.date || "");
  const initKind = !item?.time || mode === "change" ? (mode === "change" && item?.time ? "point" : "none") : item.end ? "range" : item.deadline ? "deadline" : "point";
  const [kind, setKind] = useState(mode === "create" ? "none" : initKind);
  const [time, setTime] = useState(mode === "create" ? "" : item?.time || "");
  const [end, setEnd] = useState(mode === "create" ? "" : item?.end || "");
  const [images, setImages] = useState(mode === "change" ? [] : item?.images || []);
  const [happened, setHappened] = useState(true);
  const [doneNote, setDoneNote] = useState(item?.doneText || "");
  const [busy, setBusy] = useState(false);

  const timeFields = () => ({
    time: kind === "none" ? "" : time,
    end: kind === "range" ? end : "",
    deadline: kind === "deadline",
  });

  async function save() {
    if (!text.trim()) return toast("先写个标题");
    if (kind !== "none" && !time) return toast("选一下时间");
    if (kind === "range" && !end) return toast("选一下结束时间");
    setBusy(true);
    try {
      if (mode === "create") {
        await cx("/schedule", { method: "POST", body: { text, desc, date: d, ...timeFields(), images } });
        touch({ type: "write_schedule", summary: `${text}${d ? ` (${d})` : ""}` });
      } else if (mode === "edit") {
        const body = { text, desc, date: d, ...timeFields(), images };
        if (item.status === "done") body.doneText = doneNote;
        await cx(`/schedule/${item.id}`, { method: "PATCH", body });
      } else {
        await cx(`/schedule/${item.id}/change`, {
          method: "POST",
          body: { text, desc, date: d, ...timeFields(), images, status: happened ? "done" : "planned" },
        });
        touch({ type: "update_schedule", summary: `${item.text} → ${text}${happened ? "（已经做了）" : ""}` });
      }
      await load();
      onClose();
    } catch (e) {
      toast(e.message);
      setBusy(false);
    }
  }

  const title = mode === "create" ? "新活动" : mode === "edit" ? "编辑活动" : `改主意：${item.text}`;
  return (
    <Modal title={title} onClose={onClose}>
      {mode === "change" && <p className="faint" style={{ marginTop: -4 }}>原来的计划会被划掉，下面这条是替代它的新活动。</p>}
      <Field label="标题">
        <input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="要做什么" />
      </Field>
      <Field label="描述（可选）">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 64 }} />
      </Field>
      <Field label="日期（不选 = 未排期）">
        <div className="row">
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          {d && (
            <button type="button" className="pill" onClick={() => setD("")}>
              清除
            </button>
          )}
        </div>
      </Field>
      <Field label="时间">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="none">没有具体时间</option>
          <option value="point">某个时间点</option>
          <option value="range">一段时间</option>
          <option value="deadline">截止时间</option>
        </select>
      </Field>
      {kind !== "none" && (
        <div className="two">
          <Field label={kind === "deadline" ? "截止于" : "开始"}>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          {kind === "range" && (
            <Field label="结束">
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {mode === "change" && (
        <Field label="这条新活动">
          <select value={happened ? "done" : "planned"} onChange={(e) => setHappened(e.target.value === "done")}>
            <option value="done">已经做了（直接记为完成）</option>
            <option value="planned">还没做（先记为计划中）</option>
          </select>
        </Field>
      )}
      {mode === "edit" && item.status === "done" && (
        <Field label="完成时想说的（可选）">
          <textarea value={doneNote} onChange={(e) => setDoneNote(e.target.value)} style={{ minHeight: 56 }} />
        </Field>
      )}
      <ImagePicker value={images} onChange={setImages} toast={toast} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="pill" onClick={onClose}>
          取消
        </button>
        <button type="button" className="pill solid" disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────── 日记编辑器 ───────────── */

export function DiaryEditor({ entry, date, ctx, onClose }) {
  const { load, toast } = ctx;
  const [title, setTitle] = useState(entry?.title || "");
  const [text, setText] = useState(entry?.text || "");
  const [d, setD] = useState(entry?.date || date);
  const [images, setImages] = useState(entry?.images || []);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!text.trim()) return toast("写点内容吧");
    setBusy(true);
    try {
      await cx("/diary", { method: "POST", body: entry ? { id: entry.id, date: d, title, text, images } : { append: true, date: d, title, text, images } });
      touch({ type: "write_diary", summary: `Diary ${d}${title ? ` · ${title}` : ""}: ${text.slice(0, 700)}` });
      await load();
      onClose();
    } catch (e) {
      toast(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={entry ? "编辑日记" : "写一篇"} onClose={onClose}>
      <Field label="标题（可选）">
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="日期">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
      </Field>
      <Field label="正文">
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 220 }} autoFocus />
      </Field>
      <ImagePicker value={images} onChange={setImages} toast={toast} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="pill" onClick={onClose}>
          取消
        </button>
        <button type="button" className="pill solid" disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────── 状态菜单 ───────────── */

export function StatusSheet({ item, onPick, onClose }) {
  const planned = item.status === "planned";
  return (
    <Modal title={item.text} onClose={onClose}>
      <div className="opts">
        {item.status !== "done" && <button onClick={() => onPick("done")}>✓　完成了</button>}
        {item.status !== "failed" && item.status !== "cancelled" && <button onClick={() => onPick("failed")}>×　没做成</button>}
        {item.status !== "changed" && <button onClick={() => onPick("change")}>−　改主意了，做了别的</button>}
        {!planned && item.status !== "changed" && <button onClick={() => onPick("planned")}>○　恢复为计划中</button>}
      </div>
    </Modal>
  );
}

/* ───────────── 互动：表情 / 评论 ───────────── */

export function ReactDialog({ target, library, ctx, onClose }) {
  const { load, toast } = ctx;
  const [custom, setCustom] = useState("");
  async function send(emoji) {
    if (!emoji.trim()) return toast("选一个表情");
    try {
      await cx("/reaction", { method: "POST", body: { actor: "user", targetType: target.type, targetId: target.id, emoji } });
      touch({ type: "reaction", emoji, targetText: target.text });
      await load();
      onClose();
    } catch (e) {
      toast(e.message);
    }
  }
  return (
    <Modal title="表情回应" onClose={onClose}>
      <div className="emojis">
        {library.map((e) => (
          <button key={e} type="button" onClick={() => send(e)}>
            {e}
          </button>
        ))}
      </div>
      <Field label="或者自己写一个">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} onKeyDown={(e) => e.key === "Enter" && send(custom)} />
      </Field>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="pill solid" onClick={() => send(custom)}>
          发送
        </button>
      </div>
    </Modal>
  );
}

export function CommentDialog({ target, diary, ctx, onClose }) {
  const { load, toast } = ctx;
  const [text, setText] = useState(target.initial || "");
  async function send() {
    if (!text.trim()) return toast("写点什么");
    try {
      if (target.id2) {
        await cx(`/comment/${target.id2}`, { method: "PATCH", body: { text } });
      } else {
        if (target.quote && target.type === "diary") {
          const src = diary.find((x) => x.id === target.id);
          const start = Math.max(0, (src?.text || "").indexOf(target.quote));
          await cx("/highlight", { method: "POST", body: { diaryId: target.id, text: target.quote, start, end: start + target.quote.length } }).catch(() => {});
          touch({ type: "highlight", text: target.quote });
        }
        await cx("/comment", {
          method: "POST",
          body: { actor: "user", targetType: target.type, targetId: target.id, text, ...(target.quote ? { quote: target.quote } : {}) },
        });
        touch({ type: "comment", text, targetText: target.text });
      }
      await load();
      onClose();
    } catch (e) {
      toast(e.message);
    }
  }
  return (
    <Modal title={target.id2 ? "编辑评论" : target.type === "comment" ? "回复" : "评论"} onClose={onClose}>
      {target.quote && <div className="cm"><div className="quote">“{target.quote}”</div></div>}
      <Field label="内容">
        <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus maxLength={500} />
      </Field>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="pill" onClick={onClose}>
          取消
        </button>
        <button type="button" className="pill solid" onClick={send}>
          发送
        </button>
      </div>
    </Modal>
  );
}
