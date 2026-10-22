/*
 * 一起听 → 分享歌词到 iMessage。
 *
 * 勾几句歌词 → 在本机画一张浅色歌词卡（封面 + 歌名 + 歌手 + 选中的歌词）→ 存到 Companion，
 * 拿回一个短链接（Companion Worker 的 /s/<id>）。这个链接发进 iMessage：
 *  - 手机上显示成一张卡片（图就是这张歌词卡，靠分享页的 og 标签）；
 *  - Uranus 读链接时认出这是分享的歌，把歌名和完整歌词交给角色（见 uranus-xiaoshouji 的 linkmeta.js:parseSongShare）。
 *
 * 发送用系统分享面板（navigator.share）：iOS 上要求「用户刚点过」，所以先生成、再单独点一次「分享」，
 * 两步分开 —— 生成要等网络，等完再弹分享面板会被 Safari 拒掉。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import { apiUrl, cx } from "../companion/api.js";

const W = 1200;
const H = 900;
const SERIF = '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC",Georgia,serif';
const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif';
const MAX_LINES = 8;

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/** 按宽度折行：中文逐字可断，英文尽量在空格处断。 */
function wrap(ctx, text, width) {
  const out = [];
  let line = "";
  const tokens = String(text).match(/[A-Za-z0-9'’.,!?-]+\s*|\s+|./gu) || [];
  for (const tk of tokens) {
    const next = line + tk;
    if (ctx.measureText(next.trimEnd()).width <= width || !line) {
      line = next;
    } else {
      out.push(line.trimEnd());
      line = tk.trimStart();
    }
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 画卡片。返回 canvas。 */
async function drawCard({ song, lines, cover, from }) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");

  // 底色：暖白，带一点点渐变
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#faf6f0");
  bg.addColorStop(1, "#efe5d8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 封面
  const P = 80;
  const C = 250;
  ctx.save();
  ctx.shadowColor = "rgba(90,70,45,.22)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 12;
  rounded(ctx, P, P, C, C, 22);
  ctx.fillStyle = "#e3d6c4";
  ctx.fill();
  ctx.restore();
  ctx.save();
  rounded(ctx, P, P, C, C, 22);
  ctx.clip();
  if (cover) {
    ctx.drawImage(cover, P, P, C, C);
  } else {
    ctx.fillStyle = "#d9c7ad";
    ctx.fillRect(P, P, C, C);
    ctx.fillStyle = "#fff8";
    ctx.font = `120px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪", P + C / 2, P + C / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // 歌名 / 歌手 / 专辑
  const tx = P + C + 46;
  const tw = W - tx - P;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#b39c80";
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText("♪  分享一首歌", tx, P + 34);
  ctx.fillStyle = "#2d2a26";
  ctx.font = `700 54px ${SERIF}`;
  let ty = P + 104;
  for (const l of wrap(ctx, song.name || "", tw).slice(0, 2)) {
    ctx.fillText(l, tx, ty);
    ty += 64;
  }
  ctx.fillStyle = "#7d7064";
  ctx.font = `30px ${SANS}`;
  if (song.artist) {
    ctx.fillText(wrap(ctx, song.artist, tw)[0] || "", tx, ty + 4);
    ty += 44;
  }
  if (song.album) {
    ctx.fillStyle = "#a39686";
    ctx.font = `24px ${SANS}`;
    ctx.fillText(wrap(ctx, `专辑 · ${song.album}`, tw)[0] || "", tx, ty + 6);
  }

  // 歌词：从大字号往小试，直到放得下；放下之后在封面下方那块区域里上下居中
  const top = P + C + 56;
  const bottom = H - 104;
  const lw = W - P * 2 - 30;
  let size = 56;
  let rows = [];
  let blockH = 0;
  for (; size >= 26; size -= 2) {
    ctx.font = `${size}px ${SERIF}`;
    rows = [];
    lines.forEach((l, i) => {
      wrap(ctx, l, lw).forEach((t, k) => rows.push({ t, gap: k === 0 && i > 0 }));
    });
    blockH = rows.length * size * 1.5 + rows.filter((r) => r.gap).length * size * 0.35 - size * 0.5;
    if (blockH <= bottom - top) break;
  }
  const start = top + Math.max(0, (bottom - top - blockH) / 2);
  ctx.fillStyle = "#d9c7ad";
  ctx.fillRect(P, start, 6, Math.min(blockH, bottom - top));
  ctx.fillStyle = "#2d2a26";
  ctx.font = `${size}px ${SERIF}`;
  let y = start + size * 0.88;
  for (const r of rows) {
    if (r.gap) y += size * 0.35;
    if (y > bottom + size) break;
    ctx.fillText(r.t, P + 30, y);
    y += size * 1.5;
  }

  // 底部
  ctx.fillStyle = "#a39686";
  ctx.font = `22px ${SANS}`;
  ctx.fillText(`Listen Together${from ? ` · ${from}` : ""}`, P, H - 52);
  return cv;
}

export function ShareLyrics({ song, lrc, lyricNow, names, onClose }) {
  // 同一句歌词连着重复的只列一次（副歌常这样）
  const rows = useMemo(() => {
    const out = [];
    lrc.forEach((l, i) => {
      const s = String(l.s || "").trim();
      if (!s) return;
      if (out.length && out[out.length - 1].s === s) return;
      out.push({ i, s });
    });
    return out;
  }, [lrc]);
  // 默认勾上正在唱的那一句
  const [picked, setPicked] = useState(() => {
    const cur = lyricNow >= 0 ? rows.filter((r) => r.i <= lyricNow).pop() : null;
    return new Set(cur ? [cur.i] : []);
  });
  const [preview, setPreview] = useState("");
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const listRef = useRef(null);

  const lines = rows.filter((r) => picked.has(r.i)).map((r) => r.s);

  // 封面经 Companion 同源转一手，不然 canvas 导不出图
  useEffect(() => {
    let dead = false;
    if (song.cover) loadImg(apiUrl(`/share/cover?u=${encodeURIComponent(song.cover + "?param=500y500")}`)).then((im) => !dead && setCover(im));
    return () => {
      dead = true;
    };
  }, [song.cover]);

  // 预览跟着勾选实时重画
  useEffect(() => {
    let dead = false;
    const t = setTimeout(async () => {
      const cv = await drawCard({ song, lines: lines.length ? lines : ["（勾选下面的歌词）"], cover, from: names?.u || "" });
      if (!dead) setPreview(cv.toDataURL("image/jpeg", 0.7));
    }, 120);
    return () => {
      dead = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, cover, song.id]);

  // 打开时滚到当前那句附近
  useEffect(() => {
    const el = listRef.current?.querySelector(".on");
    if (el) el.scrollIntoView({ block: "center" });
  }, []);

  const toggle = (i) => {
    setLink("");
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(i)) n.delete(i);
      else if (n.size < MAX_LINES) n.add(i);
      else setMsg(`最多选 ${MAX_LINES} 句`);
      return n;
    });
  };

  async function make() {
    if (!lines.length) return setMsg("先勾选要分享的歌词");
    setBusy(true);
    setMsg("");
    try {
      const cv = await drawCard({ song, lines, cover, from: names?.u || "" });
      let q = 0.88;
      let image = cv.toDataURL("image/jpeg", q);
      while (image.length > 850000 && q > 0.5) image = cv.toDataURL("image/jpeg", (q -= 0.1));
      const r = await cx("/share", {
        method: "POST",
        body: { song: { id: song.id, name: song.name, artist: song.artist, cover: song.cover, album: song.album || "" }, lines, image },
      });
      setLink(r.url);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ url: link });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMsg("链接已复制，去 iMessage 里粘贴发给 Ta");
    } catch {
      setMsg("复制不了，长按下面的链接手动复制");
    }
  }

  return (
    <div className="mu-over" onClick={onClose}>
      <div className="mu-sheet mu-share" onClick={(e) => e.stopPropagation()}>
        <div className="mu-top" style={{ padding: 0 }}>
          <b>分享歌词到 iMessage</b>
          <button type="button" className="mu-ico" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {preview && <img className="mu-sprev" src={preview} alt="歌词卡预览" />}
        {!rows.length ? (
          <p className="mu-hint">这首歌没有歌词，没法做歌词卡。</p>
        ) : (
          <>
            <p className="mu-hint">勾选要分享的歌词（最多 {MAX_LINES} 句），已选 {lines.length} 句。</p>
            <div className="mu-slist" ref={listRef}>
              {rows.map((r) => (
                <button type="button" key={r.i} className={`mu-sline ${picked.has(r.i) ? "sel" : ""} ${lyricNow >= r.i && !rows.some((x) => x.i > r.i && x.i <= lyricNow) ? "on" : ""}`} onClick={() => toggle(r.i)}>
                  <span className="mu-sbox">{picked.has(r.i) && <Check size={13} strokeWidth={3} />}</span>
                  <span>{r.s}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {msg && <p className="mu-hint" style={{ color: "var(--ac)" }}>{msg}</p>}
        {!link ? (
          <button type="button" className="mu-sgo" disabled={busy || !lines.length} onClick={make}>
            {busy ? "生成中…" : "生成歌词卡"}
          </button>
        ) : (
          <>
            <div className="mu-slink">{link}</div>
            <div className="mu-sbtns">
              <button type="button" className="mu-sgo" onClick={share}>
                <Share2 size={16} /> 分享到信息
              </button>
              <button type="button" className="mu-sgo ghost" onClick={copy}>
                <Copy size={16} /> 复制链接
              </button>
            </div>
            <p className="mu-hint">在分享面板里选「信息」→ 和 Ta 的对话。iMessage 里会显示成这张歌词卡，Ta 也会读到你选的这几句。</p>
          </>
        )}
      </div>
    </div>
  );
}
