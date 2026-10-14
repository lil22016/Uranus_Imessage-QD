import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Headphones, Heart, ListMusic, MessageCircle, Minus, Pause, Play, Plus, Send, Settings2, SkipBack, SkipForward, ThumbsDown, X } from "lucide-react";
import { useConfig } from "../store.jsx";
import { cx } from "../companion/api.js";
import { useTheme } from "../phonehome.jsx";
import {
  clearChat,
  getLocal,
  https,
  ne,
  next,
  norm,
  play,
  prev,
  refreshState,
  say,
  saveMcfg,
  seek,
  sendChat,
  setLocal,
  setMcfgLocal,
  setMine,
  toggle,
  useLocal,
  useMusic,
} from "../musicstore.js";

/**
 * 一起听歌（整屏）。
 *
 * 和 Companion 一样：打开就是这个界面本身，不套 Uranus 的顶栏和标题；左上角返回。
 * 播放器本体在 ../musicstore.js（界面之外），所以退出这个页面、切到别的分区，歌都继续放。
 * 音乐来源：网易云「非官方」API（自己部署），地址和登录凭证只存在本机浏览器里。
 */

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MusicPanel({ onExit }) {
  const { config } = useConfig();
  const theme = useTheme();
  const L = useLocal();
  const s = useMusic();
  const { api = "", cookie = "", mine = {} } = L;
  const { queue, idx, playing, pos, dur, lrc, att, mcfg, profiles, chat, bubble, names, toast } = s;
  const song = queue[idx] || null;

  const [tab, setTab] = useState("rec"); // rec | lists | chat
  const [lists, setLists] = useState([]);
  const [openList, setOpenList] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [showLrc, setShowLrc] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshState();
  }, []);

  const hisAtt = song ? att.find((a) => a.song?.id === song.id && a.by === "character")?.attitude : "";
  const myAtt = song ? mine[song.id] : "";
  const needLogin = !!api && !cookie;

  /* ---- 列表 ---- */
  const loadLists = async () => {
    try {
      let uid = getLocal().uid;
      if (!uid) {
        const r = await ne("/login/status");
        const p = r.data?.profile || r.profile;
        if (!p) throw new Error("登录状态失效了，重新扫码登录一下");
        uid = p.userId;
        setLocal({ uid, nick: p.nickname });
      }
      const d = await ne("/user/playlist", { uid, limit: 100 });
      setLists(d.playlist || []);
    } catch (e) {
      say(e.message);
    }
  };
  const loadRec = async () => {
    setLoadingTracks(true);
    try {
      const d = await ne("/recommend/songs");
      const arr = d.data?.dailySongs || d.recommend || [];
      if (!arr.length) throw new Error(d.msg || d.message || "每日推荐是空的（没登录？）");
      setTracks(arr.map(norm));
      setOpenList({ id: "rec", name: "每日推荐" });
    } catch (e) {
      say(e.message);
    } finally {
      setLoadingTracks(false);
    }
  };
  const openPl = async (pl) => {
    setOpenList(pl);
    setLoadingTracks(true);
    setTracks([]);
    try {
      const d = await ne("/playlist/track/all", { id: pl.id, limit: 200 });
      setTracks((d.songs || []).map(norm));
    } catch (e) {
      say(e.message);
    } finally {
      setLoadingTracks(false);
    }
  };
  useEffect(() => {
    if (api && cookie) {
      loadLists();
      loadRec();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cookie]);

  /* ---- 歌词 ---- */
  const lyricNow = useMemo(() => {
    let k = -1;
    for (let i = 0; i < lrc.length; i++) if (lrc[i].t <= pos + 0.2) k = i;
    return k;
  }, [lrc, pos]);
  const lineText = lyricNow >= 0 ? lrc[lyricNow].s : "";
  const lyrRef = useRef(null);
  useEffect(() => {
    const box = lyrRef.current;
    const el = box?.querySelector(".on");
    if (box && el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [lyricNow, showLrc]);

  /* ---- 聊天 ---- */
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    await sendChat(text);
    setBusy(false);
  };
  const chatEnd = useRef(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView?.({ block: "end" });
  }, [chat.length, tab]);

  const showList = tab === "lists" && !openList ? lists : null;

  return (
    <div className="mu">
      <style>{CSS}</style>

      <header className="mu-top">
        {onExit && (
          <button type="button" className="mu-ico" onClick={onExit} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </button>
        )}
        <span className="mu-title">
          <Headphones size={16} strokeWidth={1.6} /> Listen Together
        </span>
        <button type="button" className="mu-ico" onClick={() => setSheet(true)} aria-label="音乐设置">
          <Settings2 size={18} strokeWidth={1.6} />
        </button>
      </header>

      <div className="mu-body">
        {/* 两个头像 + 耳机线 */}
        <div className="mu-pair">
          <div className="mu-who">
            {bubble && <div className="mu-say">{bubble}</div>}
            <Avatar src={theme.avatarRole} label={names.c} />
            <div className="mu-att">{hisAtt === "like" ? <Heart size={13} fill="currentColor" /> : hisAtt === "dislike" ? <ThumbsDown size={13} /> : null}</div>
          </div>
          <svg className={`mu-cable ${playing ? "on" : ""}`} viewBox="0 0 160 50" preserveAspectRatio="none" aria-hidden>
            <path d="M2 18 C 30 58, 60 58, 80 40 C 100 58, 130 58, 158 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="3" cy="17" r="3.2" fill="currentColor" />
            <circle cx="157" cy="17" r="3.2" fill="currentColor" />
          </svg>
          <div className="mu-who">
            <Avatar src={theme.avatarUser} label={names.u || "我"} />
            <div className="mu-att">{myAtt === "like" ? <Heart size={13} fill="currentColor" /> : myAtt === "dislike" ? <ThumbsDown size={13} /> : null}</div>
          </div>
        </div>

        {/* 封面 / 歌词 */}
        <div className="mu-stage">
          {song ? (
            <>
              <button type="button" className="mu-cover" onClick={() => setShowLrc((v) => !v)} aria-label="切换封面和歌词">
                {showLrc ? (
                  <div className="mu-lrc" ref={lyrRef}>
                    {lrc.length ? (
                      lrc.map((l, i) => (
                        <p key={i} className={i === lyricNow ? "on" : ""}>
                          {l.s}
                        </p>
                      ))
                    ) : (
                      <p className="dim">没有歌词</p>
                    )}
                  </div>
                ) : song.cover ? (
                  <img src={song.cover + "?param=500y500"} alt="" />
                ) : (
                  <Headphones size={48} strokeWidth={1.2} />
                )}
              </button>
              <div className="mu-name">{song.name}</div>
              <div className="mu-art">{song.artist}</div>
              {!showLrc && lineText && <div className="mu-line">{lineText}</div>}
              <Slider value={dur ? pos / dur : 0} onChange={(v) => seek(v * (dur || 0))} label="播放进度" />
              <div className="mu-time">
                <span>{fmt(pos)}</span>
                <span>{fmt(dur)}</span>
              </div>
              <div className="mu-ctl">
                <button type="button" className={`mu-ico ${myAtt === "dislike" ? "hot" : ""}`} onClick={() => setMine("dislike")} aria-label="不喜欢">
                  <ThumbsDown size={19} strokeWidth={1.6} />
                </button>
                <button type="button" className="mu-ico" onClick={prev} aria-label="上一首">
                  <SkipBack size={22} strokeWidth={1.6} />
                </button>
                <button type="button" className="mu-play" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>
                  {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                <button type="button" className="mu-ico" onClick={next} aria-label="下一首">
                  <SkipForward size={22} strokeWidth={1.6} />
                </button>
                <button type="button" className={`mu-ico ${myAtt === "like" ? "hot" : ""}`} onClick={() => setMine("like")} aria-label="喜欢">
                  <Heart size={19} strokeWidth={1.6} fill={myAtt === "like" ? "currentColor" : "none"} />
                </button>
              </div>
            </>
          ) : (
            <div className="mu-empty">
              {!api ? "先去右上角设置填好音乐 API 地址，再扫码登录。" : needLogin ? "还没登录。去设置里扫码登录网易云。" : "从下面挑一首，和 Ta 戴上同一副耳机。"}
            </div>
          )}
        </div>

        {/* 下半：列表 / 聊天 */}
        <div className="mu-tabs">
          <button
            type="button"
            className={tab === "rec" ? "on" : ""}
            onClick={() => {
              setTab("rec");
              if (openList?.id !== "rec" && api && cookie) loadRec();
            }}
          >
            每日推荐
          </button>
          <button
            type="button"
            className={tab === "lists" ? "on" : ""}
            onClick={() => {
              setTab("lists");
              setOpenList(null);
            }}
          >
            <ListMusic size={14} /> 歌单
          </button>
          <button type="button" className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
            <MessageCircle size={14} /> 聊聊
          </button>
        </div>

        {tab !== "chat" && (
          <div className="mu-list">
            {tab === "lists" && openList && openList.id !== "rec" && (
              <button type="button" className="mu-back" onClick={() => setOpenList(null)}>
                <ChevronLeft size={15} /> {openList.name}
              </button>
            )}
            {showList &&
              showList.map((pl) => (
                <button type="button" key={pl.id} className="mu-row" onClick={() => openPl(pl)}>
                  <img src={https(pl.coverImgUrl) + "?param=80y80"} alt="" />
                  <span className="mu-rt">
                    <b>{pl.name}</b>
                    <i>{pl.trackCount} 首</i>
                  </span>
                </button>
              ))}
            {!showList && (
              <>
                {loadingTracks && <div className="mu-empty">加载中…</div>}
                {tracks.map((t, i) => (
                  <button type="button" key={t.id + ":" + i} className={`mu-row ${song?.id === t.id ? "cur" : ""}`} onClick={() => play(tracks, i)}>
                    {t.cover ? <img src={t.cover + "?param=80y80"} alt="" /> : <span className="mu-ph" />}
                    <span className="mu-rt">
                      <b>{t.name}</b>
                      <i>{t.artist}</i>
                    </span>
                    {mine[t.id] === "like" && <Heart size={13} fill="currentColor" className="mu-mark" />}
                    {mine[t.id] === "dislike" && <ThumbsDown size={13} className="mu-mark" />}
                  </button>
                ))}
                {!loadingTracks && !tracks.length && <div className="mu-empty">{api && cookie ? "这里还没有歌" : "登录后这里会出现每日推荐和你的歌单"}</div>}
              </>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div className="mu-chat">
            <div className="mu-msgs">
              {!chat.length && <div className="mu-empty">只聊音乐。想到什么说什么，Ta 也会偶尔自己开口。</div>}
              {chat.map((m) => (
                <div key={m.id} className={`mu-msg ${m.role === "user" ? "me" : ""}`}>
                  {m.text}
                </div>
              ))}
              {busy && <div className="mu-msg dim">…</div>}
              <div ref={chatEnd} />
            </div>
            <div className="mu-in">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()} placeholder="说点什么…" />
              <button type="button" className="mu-ico" onClick={send} disabled={busy || !draft.trim()} aria-label="发送">
                <Send size={18} strokeWidth={1.6} />
              </button>
            </div>
            {chat.length > 0 && (
              <button type="button" className="mu-link" onClick={clearChat}>
                清空聊天
              </button>
            )}
          </div>
        )}
      </div>

      {toast && <div className="mu-toast">{toast}</div>}
      {sheet && <Settings onClose={() => setSheet(false)} L={L} mcfg={mcfg} profiles={profiles} providers={config?.providers ?? []} />}
    </div>
  );
}

function Avatar({ src, label }) {
  return (
    <div className="mu-av" title={label}>
      {src ? <img src={src} alt={label} /> : <span>{(label || "?").slice(0, 1)}</span>}
    </div>
  );
}

/**
 * 自己画的滑块：轨道 + 已走的部分 + 一个看得见的圆形滑块（28px，触摸区更大）。
 * 用指针事件接管拖动（setPointerCapture），不依赖各浏览器对 <input type=range> 的样式，
 * 所以在 iOS 上也能看到滑块、拖得动、不会和页面滚动抢手势。
 */
function Slider({ value, onChange, onCommit, label }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const v = Math.min(1, Math.max(0, drag ?? value ?? 0));
  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left - 13) / Math.max(r.width - 26, 1)));
  };
  return (
    <div
      ref={ref}
      className="mu-sl2"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag === null) return;
        const x = at(e);
        setDrag(null);
        onChange(x);
        onCommit?.(x);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.05 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0;
        if (!d) return;
        e.preventDefault();
        const x = Math.min(1, Math.max(0, v + d));
        onChange(x);
        onCommit?.(x);
      }}
    >
      <span className="mu-sl2-track">
        <i style={{ width: `calc(13px + (100% - 26px) * ${v})` }} />
      </span>
      <span className="mu-sl2-thumb" style={{ left: `calc(13px + (100% - 26px) * ${v})` }} />
    </div>
  );
}

/** 概率行：滑块 + 左右两个 ± 5% 的按钮（滑不准的时候点按钮一格一格调）。 */
function Chance({ label, value, onLive, onSave }) {
  const pct = Math.round((value ?? 0) * 100);
  const step = (d) => {
    const x = Math.min(1, Math.max(0, Math.round((value ?? 0) * 20 + d) / 20));
    onLive(x);
    onSave(x);
  };
  return (
    <div className="mu-ch">
      <div className="mu-ch-h">
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div className="mu-ch-r">
        <button type="button" className="mu-step" onClick={() => step(-1)} aria-label={`${label}减少`}>
          <Minus size={16} />
        </button>
        <Slider value={value ?? 0} onChange={onLive} onCommit={onSave} label={label} />
        <button type="button" className="mu-step" onClick={() => step(1)} aria-label={`${label}增加`}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 设置 */

function Settings({ onClose, L, mcfg, profiles, providers }) {
  const [url, setUrl] = useState(L.api || "");
  const [qr, setQr] = useState("");
  const [qrMsg, setQrMsg] = useState("");
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);

  const saveUrl = () => {
    setLocal({ api: url.trim().replace(/\/+$/, "") });
    say("已保存");
  };

  const qrLogin = async () => {
    const api = url.trim().replace(/\/+$/, "");
    if (!api) return say("先填音乐 API 地址");
    setLocal({ api });
    clearInterval(poll.current);
    try {
      const k = await ne("/login/qr/key", {}, { anon: true, api });
      const key = k.data?.unikey;
      if (!key) throw new Error("拿不到二维码 key");
      const c = await ne("/login/qr/create", { key, qrimg: "true" }, { anon: true, api });
      setQr(c.data?.qrimg || "");
      setQrMsg("用网易云 App 扫码，并在手机上确认");
      poll.current = setInterval(async () => {
        try {
          const r = await ne("/login/qr/check", { key }, { anon: true, api });
          if (r.code === 800) {
            clearInterval(poll.current);
            setQrMsg("二维码过期了，重新点一次");
            setQr("");
          } else if (r.code === 802) setQrMsg("已扫码，在手机上点确认");
          else if (r.code === 803) {
            clearInterval(poll.current);
            const raw = String(r.cookie || "");
            const m = raw.match(/MUSIC_U=[^;]+/);
            setLocal({ cookie: m ? m[0] + ";" : raw, uid: "", nick: "" });
            setQr("");
            say("登录成功");
            onClose();
          }
        } catch {
          /* 轮询偶尔失败不用管 */
        }
      }, 2000);
    } catch (e) {
      say(e.message);
    }
  };

  const prov = providers.find((p) => p.id === mcfg?.uranusProviderId);
  const usable = providers.filter((p) => ["custom", "openai"].includes(p.type));

  return (
    <div className="mu-over" onClick={onClose}>
      <div className="mu-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mu-top" style={{ padding: 0 }}>
          <b>音乐设置</b>
          <button type="button" className="mu-ico" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <h4>音乐 API（网易云，自己部署）</h4>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://你的音乐api.vercel.app" />
        <div className="mu-row2">
          <button type="button" className="mu-pill" onClick={saveUrl}>
            保存地址
          </button>
          <button type="button" className="mu-pill solid" onClick={qrLogin}>
            扫码登录
          </button>
          {L.cookie && (
            <button type="button" className="mu-pill" onClick={() => setLocal({ cookie: "", uid: "", nick: "" })}>
              退出登录
            </button>
          )}
        </div>
        <p className="mu-hint">
          {L.cookie ? `已登录${L.nick ? "：" + L.nick : ""}。` : "未登录。"}地址和登录凭证只保存在这台设备的浏览器里，不会发到 Uranus 或 Companion。
        </p>
        {qr && (
          <div className="mu-qr">
            <img src={qr} alt="登录二维码" />
            <span>{qrMsg}</span>
          </div>
        )}
        {!qr && qrMsg && <p className="mu-hint">{qrMsg}</p>}

        <h4>Ta 用哪个模型说话</h4>
        {!mcfg ? (
          <p className="mu-hint">还没连上 Companion，这一块先不能设。</p>
        ) : (
          <>
            <select value={mcfg.source} onChange={(e) => saveMcfg({ source: e.target.value })}>
              <option value="profile">Companion 里已有的模型</option>
              <option value="uranus">Uranus「连接」里的模型</option>
            </select>
            {mcfg.source === "uranus" ? (
              <div className="mu-row2">
                <select value={mcfg.uranusProviderId || ""} onChange={(e) => saveMcfg({ uranusProviderId: e.target.value, model: "" })}>
                  <option value="">选连接…</option>
                  {usable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name?.trim() || p.id}
                    </option>
                  ))}
                </select>
                <select value={mcfg.model || ""} onChange={(e) => saveMcfg({ model: e.target.value })}>
                  <option value="">选模型…</option>
                  {(prov?.models || []).map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.alias?.trim() || m.model}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <select value={mcfg.profileId || ""} onChange={(e) => saveMcfg({ profileId: e.target.value })}>
                <option value="">跟 Companion 的角色模型一样</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.model}
                  </option>
                ))}
              </select>
            )}

            <h4>Ta 多久开口一次（每首歌各掷一次）</h4>
            {[
              ["commentChance", "随口说一句"],
              ["attitudeChance", "表态（喜欢 / 不喜欢）"],
              ["skipChance", "嫌弃到想切歌"],
            ].map(([k, label]) => (
              <Chance key={k} label={label} value={mcfg[k]} onLive={(x) => setMcfgLocal({ [k]: x })} onSave={(x) => saveMcfg({ [k]: x })} />
            ))}
            <p className="mu-hint">只有在放歌时才会触发（退出这个页面、切到后台也算，只要歌还在放）；内容由模型现写，概率由这里的数字决定。</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 样式 */

const CSS = `
.mu{--l:#ffffff2e;--ink:#f5f3f1;--dim:#bdb5b3;--ac:#d6c2a8;position:relative;height:100%;display:flex;flex-direction:column;color:var(--ink);
 background:radial-gradient(120% 70% at 20% 0%,#3a3550 0,transparent 60%),radial-gradient(100% 60% at 100% 30%,#2e3a3d 0,transparent 55%),#101117;overflow:hidden}
.mu *{box-sizing:border-box}
.mu button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mu-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:calc(8px + env(safe-area-inset-top)) 12px 6px;max-width:520px;width:100%;margin:0 auto}
.mu-title{flex:1;display:flex;align-items:center;gap:6px;font-family:Georgia,serif;letter-spacing:.08em;font-size:15px}
.mu-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 16px calc(28px + env(safe-area-inset-bottom));max-width:520px;width:100%;margin:0 auto;-webkit-overflow-scrolling:touch}
.mu-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--dim)}
.mu-ico:hover,.mu-ico.hot{color:var(--ac)}
.mu-pair{display:flex;align-items:center;justify-content:center;gap:0;margin:46px 0 10px}
.mu-who{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px}
.mu-av{width:64px;height:64px;border-radius:50%;overflow:hidden;border:1px solid var(--l);background:#ffffff14;display:grid;place-items:center;font-family:Georgia,serif;font-size:22px}
.mu-av img{width:100%;height:100%;object-fit:cover}
.mu-att{height:16px;color:var(--ac);display:flex}
.mu-cable{flex:1;max-width:150px;height:46px;overflow:visible;color:var(--dim);margin-top:-14px;transition:color .3s}
.mu-cable.on{color:var(--ac)}
.mu-cable.on path{animation:mucab 2.4s ease-in-out infinite}
@keyframes mucab{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px)}}
.mu-say{position:absolute;bottom:100%;left:0;margin-bottom:8px;width:max-content;max-width:210px;padding:8px 11px;border-radius:14px 14px 14px 3px;background:#ffffff20;border:1px solid var(--l);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-size:13px;line-height:1.45;z-index:2;animation:musay .25s ease}
@keyframes musay{from{opacity:0}to{opacity:1}}
.mu-stage{display:flex;flex-direction:column;align-items:center;margin-top:8px}
.mu-cover{width:min(62vw,230px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:1px solid var(--l)!important;background:#ffffff12!important;display:grid;place-items:center;color:var(--dim);padding:0}
.mu-cover img{width:100%;height:100%;object-fit:cover}
.mu-lrc{width:100%;height:100%;overflow:auto;padding:40% 14px;text-align:center;scrollbar-width:none;background:#0000008c;position:relative}
.mu-lrc p{margin:0 0 10px;font-size:14px;line-height:1.5;color:var(--dim)}
.mu-lrc p.on{color:var(--ink);font-size:15.5px}
.mu-name{margin-top:12px;font-family:Georgia,serif;font-size:17px;text-align:center}
.mu-art{font-size:12.5px;color:var(--dim);margin-top:2px;text-align:center}
.mu-line{margin-top:8px;font-size:13px;color:var(--ac);text-align:center;min-height:19px}
.mu-time{width:100%;display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-top:0}
.mu-ctl{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:4px}
.mu-play{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:var(--ac)!important;color:#1c1a18!important}
.mu-empty{padding:26px 12px;text-align:center;font-size:13px;color:var(--dim);line-height:1.6}
.mu-tabs{display:flex;gap:6px;margin:14px 0 8px;border-top:1px solid var(--l);padding-top:10px}
.mu-tabs button{display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:99px;font-size:13px;color:var(--dim);border:1px solid transparent!important}
.mu-tabs button.on{color:var(--ink);border-color:var(--l)!important;background:#ffffff14!important}
.mu-list{display:flex;flex-direction:column}
.mu-row{display:flex;align-items:center;gap:10px;padding:7px 4px;text-align:left;border-radius:10px;width:100%}
.mu-row:hover,.mu-row.cur{background:#ffffff12!important}
.mu-row img,.mu-ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex:none;background:#ffffff14}
.mu-rt{display:flex;flex-direction:column;min-width:0;flex:1}
.mu-rt b{font-weight:400;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mu-rt i{font-style:normal;font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mu-row.cur .mu-rt b{color:var(--ac)}
.mu-mark{color:var(--ac);flex:none}
.mu-back{display:flex;align-items:center;gap:2px;padding:4px 2px 8px;font-size:13px;color:var(--ac)!important}
.mu-chat{display:flex;flex-direction:column;gap:8px}
.mu-msgs{display:flex;flex-direction:column;gap:7px;max-height:320px;overflow:auto;padding:2px}
.mu-msg{align-self:flex-start;max-width:82%;padding:8px 12px;border-radius:14px 14px 14px 3px;background:#ffffff18;border:1px solid var(--l);font-size:13.5px;line-height:1.5;white-space:pre-wrap}
.mu-msg.me{align-self:flex-end;border-radius:14px 14px 3px 14px;background:#d6c2a82e}
.mu-msg.dim{color:var(--dim)}
.mu-in{display:flex;align-items:center;gap:4px;border:1px solid var(--l);border-radius:99px;padding:2px 4px 2px 14px;background:#ffffff0e}
.mu-in input{flex:1;background:none;border:0;outline:none;color:var(--ink);font-size:16px;padding:8px 0;min-width:0}
.mu-link{align-self:center;font-size:12px;color:var(--dim)!important;text-decoration:underline}
.mu-toast{position:fixed;left:50%;bottom:calc(30px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:88vw;padding:9px 16px;border-radius:99px;background:#000000d0;border:1px solid var(--l);font-size:13px;z-index:60;text-align:center}
.mu-over{position:fixed;inset:0;background:#000000a0;z-index:50;display:flex;align-items:flex-end;justify-content:center}
.mu-sheet{width:100%;max-width:520px;max-height:88vh;overflow:auto;background:#1b1c25;border:1px solid var(--l);border-radius:22px 22px 0 0;padding:14px 16px calc(26px + env(safe-area-inset-bottom));color:var(--ink)}
.mu-sheet h4{margin:18px 0 8px;font-family:Georgia,serif;font-weight:400;font-size:13px;color:var(--ac);letter-spacing:.06em}
.mu-sheet input,.mu-sheet select{width:100%;margin-bottom:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--l);background:#ffffff10;color:var(--ink);font:inherit;font-size:16px;min-width:0}
.mu-sheet select option{color:#111}
.mu-row2{display:flex;gap:6px;flex-wrap:wrap}
.mu-row2 select{flex:1}
.mu-pill{padding:8px 16px;border-radius:99px;border:1px solid var(--l)!important;font-size:13px}
.mu-pill.solid{background:var(--ac)!important;color:#1c1a18!important;border-color:transparent!important}
.mu-hint{font-size:12px;color:var(--dim);line-height:1.55;margin:6px 0}
.mu-qr{display:flex;flex-direction:column;align-items:center;gap:6px;margin:8px 0}
.mu-qr img{width:170px;height:170px;background:#fff;border-radius:10px;padding:6px}
.mu-qr span{font-size:12.5px;color:var(--dim)}

/* 自己画的滑块：轨道和滑块都看得见；触摸区高 40px */
.mu-sl2{position:relative;flex:1;height:40px;touch-action:none;cursor:pointer;outline:none;user-select:none;-webkit-user-select:none}
.mu-stage .mu-sl2{width:100%;flex:none}
.mu-sl2-track{position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;border-radius:6px;background:#ffffff33;overflow:hidden}
.mu-sl2-track i{display:block;height:100%;background:var(--ac);border-radius:6px}
.mu-sl2-thumb{position:absolute;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:var(--ac);border:3px solid #1b1c25;box-shadow:0 0 0 1px #ffffff55,0 3px 10px #0008}
.mu-sl2:focus-visible .mu-sl2-thumb{box-shadow:0 0 0 3px #d6c2a888}
.mu-ch{margin:6px 0 12px}
.mu-ch-h{display:flex;justify-content:space-between;font-size:13px}
.mu-ch-h b{color:var(--ac);font-weight:400}
.mu-ch-r{display:flex;align-items:center;gap:6px}
.mu-ch-r .mu-sl2{margin:0 6px}
.mu-step{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--l)!important;color:var(--dim)}
.mu-step:active{background:#ffffff18!important}
`;
