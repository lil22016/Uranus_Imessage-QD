import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, History, Headphones, Heart, ListMusic, Menu, MessageCircle, Minus, Pause, Play, Plus, Repeat1, Send, Settings2, Share2, Shuffle, SkipBack, SkipForward, ThumbsDown, X } from "lucide-react";
import { ShareLyrics } from "./musicshare.jsx";
import { useConfig } from "../store.jsx";
import { cx } from "../companion/api.js";
import { useTheme } from "../phonehome.jsx";
import {
  addToList,
  clearChat,
  clearHist,
  createList,
  loadLiked,
  getLocal,
  https,
  ne,
  next,
  norm,
  play,
  playAll,
  playFromHistory,
  prev,
  refreshState,
  say,
  saveMcfg,
  seek,
  sendChat,
  setLocal,
  setMcfgLocal,
  setMode,
  toggle,
  toggleLike,
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

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export function MusicPanel({ onExit }) {
  const { config } = useConfig();
  const theme = useTheme();
  const L = useLocal();
  const s = useMusic();
  const { api = "", cookie = "", mode = "seq" } = L;
  const { queue, idx, playing, pos, dur, lrc, att, mcfg, profiles, chat, bubble, names, toast, liked, hist } = s;
  const song = queue[idx] || null;

  const [tab, setTab] = useState("rec"); // rec | lists | hist | chat
  const [lists, setLists] = useState([]);
  const [openList, setOpenList] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [showLrc, setShowLrc] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  // 点了歌之后滚回最上面的播放界面
  const toTop = () => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const playAt = (i) => {
    play(tracks, i);
    toTop();
  };
  const playAllNow = () => {
    playAll(tracks);
    toTop();
  };

  useEffect(() => {
    refreshState();
  }, []);

  const hisAtt = song ? att.find((a) => a.song?.id === song.id && a.by === "character")?.attitude : "";
  const iLike = song ? liked.includes(song.id) : false;
  const myLists = lists.filter((pl) => String(pl.creator?.userId ?? pl.userId) === String(L.uid));
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
      loadLiked();
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
        {song && (
          <button type="button" className="mu-ico" onClick={() => setSharing(true)} aria-label="分享歌词到 iMessage">
            <Share2 size={18} strokeWidth={1.6} />
          </button>
        )}
        <button type="button" className="mu-ico" onClick={() => setSheet(true)} aria-label="音乐设置">
          <Settings2 size={18} strokeWidth={1.6} />
        </button>
      </header>

      <div className="mu-body" ref={bodyRef}>
        <Pair theme={theme} names={names} bubble={bubble} hisAtt={hisAtt} iLike={iLike} playing={playing} />

        {/* 封面 / 歌词 */}
        <div className="mu-stage">
          {song ? (
            <>
              <button type="button" className={`mu-cover ${showLrc ? "lrcon" : ""}`} onClick={() => setShowLrc((v) => !v)} aria-label="切换封面和歌词">
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
                <button type="button" className="mu-ico" onClick={() => setMenu(true)} aria-label="播放方式和加入歌单">
                  <Menu size={20} strokeWidth={1.7} />
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
                <button type="button" className={`mu-ico ${iLike ? "hot" : ""}`} onClick={toggleLike} aria-label={iLike ? "取消喜欢" : "喜欢（加入网易云我喜欢的音乐）"}>
                  <Heart size={20} strokeWidth={1.6} fill={iLike ? "currentColor" : "none"} />
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
          <button type="button" className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")}>
            <History size={14} /> 历史
          </button>
          <button type="button" className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
            <MessageCircle size={14} /> 聊聊
          </button>
        </div>

        {tab === "hist" && (
          <div className="mu-list">
            {!hist.length && <div className="mu-empty">放过的歌会出现在这里，错过了可以回来再点一遍。</div>}
            {hist.map((t, i) => (
              <button
                type="button"
                key={t.id}
                className={`mu-row ${song?.id === t.id ? "cur" : ""}`}
                onClick={() => {
                  playFromHistory(i);
                  toTop();
                }}
              >
                {t.cover ? <img src={t.cover + "?param=80y80"} alt="" /> : <span className="mu-ph" />}
                <span className="mu-rt">
                  <b>{t.name}</b>
                  <i>
                    {t.artist}
                    {t.at ? ` · ${ago(t.at)}` : ""}
                  </i>
                </span>
                {liked.includes(t.id) && <Heart size={13} fill="currentColor" className="mu-mark" />}
              </button>
            ))}
            {hist.length > 0 && (
              <button type="button" className="mu-link" style={{ marginTop: 10 }} onClick={clearHist}>
                清空播放历史
              </button>
            )}
          </div>
        )}

        {tab !== "chat" && tab !== "hist" && (
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
                {!loadingTracks && tracks.length > 0 && (
                  <button type="button" className="mu-all" onClick={playAllNow}>
                    <span className="mu-all-ico">
                      {mode === "shuffle" ? <Shuffle size={16} strokeWidth={1.8} /> : <Play size={16} fill="currentColor" />}
                    </span>
                    <span>{mode === "shuffle" ? "随机播放全部" : "播放全部"}</span>
                    <i>{tracks.length} 首</i>
                  </button>
                )}
                {tracks.map((t, i) => (
                  <button type="button" key={t.id + ":" + i} className={`mu-row ${song?.id === t.id ? "cur" : ""}`} onClick={() => playAt(i)}>
                    {t.cover ? <img src={t.cover + "?param=80y80"} alt="" /> : <span className="mu-ph" />}
                    <span className="mu-rt">
                      <b>{t.name}</b>
                      <i>{t.artist}</i>
                    </span>
                    {liked.includes(t.id) && <Heart size={13} fill="currentColor" className="mu-mark" />}
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
                <div key={m.id} className={`mu-mrow ${m.role === "user" ? "me" : ""}`}>
                  {/* 这句话是在放哪首歌时说的：粘在气泡顶上的小标签 */}
                  {m.song?.name && (
                    <span className="mu-stag" title={m.song.artist ? `${m.song.name} · ${m.song.artist}` : m.song.name}>
                      ♪ {m.song.name}
                    </span>
                  )}
                  <div className="mu-msg">{m.text}</div>
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
      {sharing && song && <ShareLyrics song={song} lrc={lrc} lyricNow={lyricNow} names={names} onClose={() => setSharing(false)} />}
      {menu && <TrackMenu onClose={() => setMenu(false)} mode={mode} lists={myLists} song={song} />}
      {sheet && <Settings onClose={() => setSheet(false)} L={L} mcfg={mcfg} profiles={profiles} providers={config?.providers ?? []} myLists={myLists} onNewList={(pl) => setLists((x) => [{ ...pl, creator: { userId: L.uid } }, ...x])} />}
    </div>
  );
}

/**
 * 两个头像 + 耳机线。
 *
 * 一打开先是「等待 Ta 加入中…」：两个头像分开，Ta 那边暗着、头像上三个点在跳；
 * 过两三秒 Ta「加入」—— 两个头像一起往中间走，碰到一起时轻轻弹一下，
 * 下面换成「Ta 加入和你一起听啦！」。
 *
 * 耳机线还是原来那个形状（两根从各自头像垂下来、在中间交缠成一股），
 * 只是起点跟着头像走。线的形状用 JS 逐帧算（requestAnimationFrame）而不是
 * CSS 过渡 SVG 的 d 属性 —— Safari 不支持过渡 d，iOS 上线会跟头像脱节。
 */
const PAIR_W = 260;
const AV = 64; // 头像直径
const MEET = (PAIR_W - 2 * AV) / 2 + 3; // 每边往中间走多少：走完正好贴住，再多压 3px 显得「碰上了」
function cablePath(dx, side) {
  // 左边那根；右边的按中线镜像
  const pts = [
    [4 + dx, 40], [4 + dx, 64], [30 + dx * 0.85, 80], [72 + dx * 0.5, 91],
    [102 + dx * 0.2, 99], [122, 104], [130, 112],
    [141, 124], [126, 134], [120, 146],
  ].map(([x, y]) => [side === "r" ? PAIR_W - x : x, y]);
  const f = ([x, y]) => `${x.toFixed(1)} ${y}`;
  return `M${f(pts[0])} C${f(pts[1])} ${f(pts[2])} ${f(pts[3])} C${f(pts[4])} ${f(pts[5])} ${f(pts[6])} C${f(pts[7])} ${f(pts[8])} ${f(pts[9])}`;
}
function Pair({ theme, names, bubble, hisAtt, iLike, playing }) {
  const [phase, setPhase] = useState("wait"); // wait → meet（动画中）→ joined
  const [k, setK] = useState(0); // 0 = 分开，1 = 贴住
  const [joinGone, setJoinGone] = useState(false); // 「加入和你一起听啦」显示几秒后收起
  useEffect(() => {
    if (phase !== "joined") return;
    const t = setTimeout(() => setJoinGone(true), 4000);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const wait = setTimeout(() => {
      if (reduce) {
        setK(1);
        setPhase("joined");
        return;
      }
      setPhase("meet");
      const t0 = performance.now(), D = 820;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / D);
        // 先慢后快地靠近（像被对方吸过去），最后一下碰上
        setK(t < 1 ? t * t * (3 - 2 * t) * (0.85 + 0.15 * t) : 1);
        if (t < 1) raf = requestAnimationFrame(step);
        else setPhase("joined");
      };
      raf = requestAnimationFrame(step);
    }, 2200 + Math.random() * 1800);
    return () => {
      clearTimeout(wait);
      cancelAnimationFrame(raf);
    };
  }, []);
  const dx = k * MEET;
  const who = names.c || "Ta";
  return (
    <>
      <div className={`mu-pair ${phase}`}>
        <div className="mu-who l" style={{ transform: `translateX(${dx}px)` }}>
          {bubble && phase === "joined" && <div className="mu-say">{bubble}</div>}
          <div className="mu-wait">
            <Avatar src={theme.avatarRole} label={who} />
            {phase === "wait" && (
              <span className="mu-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          {hisAtt && phase === "joined" && <span className="mu-att">{hisAtt === "like" ? <Heart size={12} fill="currentColor" /> : <ThumbsDown size={12} />}</span>}
        </div>
        <div className="mu-who r" style={{ transform: `translateX(${-dx}px)` }}>
          <Avatar src={theme.avatarUser} label={names.u || "我"} />
          {iLike && <span className="mu-att"><Heart size={12} fill="currentColor" /></span>}
        </div>
        <svg className={`mu-cable ${playing && phase === "joined" ? "on" : ""}`} viewBox={`0 0 ${PAIR_W} 150`} aria-hidden>
          <path className="c1" d={cablePath(dx, "l")} />
          <path className="c2" d={cablePath(dx, "r")} />
        </svg>
      </div>
      <div className={`mu-join ${phase} ${joinGone ? "gone" : ""}`} aria-live="polite">
        {phase === "joined" ? (
          <span key="in">{who} 加入和你一起听啦！</span>
        ) : (
          <span key="wait">
            等待 {who} 加入中
            <span className="mu-ell" aria-hidden>
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          </span>
        )}
      </div>
    </>
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

/* ------------------------------------------------------------ 三条杠：播放方式 / 加入歌单 */

function TrackMenu({ onClose, mode, lists, song }) {
  const modes = [
    ["seq", "顺序播放", ListMusic],
    ["shuffle", "随机播放", Shuffle],
    ["one", "单曲循环", Repeat1],
  ];
  return (
    <div className="mu-over" onClick={onClose}>
      <div className="mu-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mu-top" style={{ padding: 0 }}>
          <b>播放方式</b>
          <button type="button" className="mu-ico" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {modes.map(([id, label, I]) => (
          <button key={id} type="button" className={`mu-opt ${mode === id ? "on" : ""}`} onClick={() => setMode(id)}>
            <I size={18} strokeWidth={1.6} />
            <span>{label}</span>
            {mode === id && <Check size={16} />}
          </button>
        ))}
        <h4>把「{song?.name || "这首歌"}」加入歌单</h4>
        {!song && <p className="mu-hint">先放一首歌。</p>}
        {song && !lists.length && <p className="mu-hint">还没读到你自己创建的歌单（要先登录）。</p>}
        {song &&
          lists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              className="mu-opt"
              onClick={async () => {
                if (await addToList(pl.id, song)) onClose();
              }}
            >
              <img src={https(pl.coverImgUrl) + "?param=60y60"} alt="" className="mu-optimg" />
              <span>{pl.name}</span>
              <i>{pl.trackCount} 首</i>
            </button>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 设置 */

function Settings({ onClose, L, mcfg, profiles, providers, myLists, onNewList }) {
  const [newName, setNewName] = useState("");
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

        <h4>Ta 点的爱心放到哪个歌单</h4>
        <select
          value={L.likeListId || ""}
          onChange={(e) => {
            const pl = myLists.find((x) => String(x.id) === e.target.value);
            setLocal({ likeListId: pl ? String(pl.id) : "", likeListName: pl?.name || "" });
          }}
        >
          <option value="">不加到网易云（只在这里表达喜欢）</option>
          {myLists.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.name}
            </option>
          ))}
        </select>
        <div className="mu-row2">
          <input style={{ flex: 1 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="或者新建一个歌单，名字…" />
          <button
            type="button"
            className="mu-pill"
            onClick={async () => {
              if (!newName.trim()) return;
              try {
                const pl = await createList(newName.trim());
                onNewList(pl);
                setLocal({ likeListId: String(pl.id), likeListName: pl.name });
                setNewName("");
                say(`已新建「${pl.name}」并设为他的歌单`);
              } catch (e) {
                say(e.message);
              }
            }}
          >
            新建
          </button>
        </div>
        <p className="mu-hint">Ta 点爱心时，这首歌会被加进上面选的歌单。点踩只在这里显示，不影响网易云；但踩过的歌，Ta 之后更容易想跳过。</p>

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
.mu-share{max-height:92vh;overflow-y:auto}
.mu-sprev{display:block;width:100%;border-radius:12px;margin:8px 0 6px;box-shadow:0 8px 30px #0005}
.mu-slist{max-height:34vh;overflow-y:auto;border:1px solid var(--l);border-radius:12px;padding:4px;margin:4px 0 10px;-webkit-overflow-scrolling:touch}
.mu-sline{display:flex!important;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:8px 8px!important;border-radius:9px!important;font-size:14px;line-height:1.45;color:var(--dim)!important}
.mu-sline.on{color:var(--ink)!important}
.mu-sline.sel{background:#ffffff14!important;color:var(--ink)!important}
.mu-sbox{flex:none;width:18px;height:18px;margin-top:1px;border-radius:5px;border:1.5px solid var(--l);display:grid;place-items:center;color:#242128}
.mu-sline.sel .mu-sbox{background:var(--ac);border-color:var(--ac)}
.mu-sgo{display:flex!important;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px!important;border-radius:14px!important;background:var(--ac)!important;color:#242128!important;font-weight:650}
.mu-sgo:disabled{opacity:.45}
.mu-sgo.ghost{background:#ffffff14!important;color:var(--ink)!important}
.mu-sbtns{display:flex;gap:8px;margin-top:8px}
.mu-slink{font-size:12px;color:var(--dim);word-break:break-all;padding:8px 10px;border-radius:10px;background:#ffffff0d;-webkit-user-select:all;user-select:all}
.mu{--l:#ffffff2e;--ink:#f5f3f1;--dim:#bdb5b3;--ac:#d6c2a8;position:relative;height:100%;display:flex;flex-direction:column;color:var(--ink);
 background:radial-gradient(120% 70% at 20% 0%,#3a3550 0,transparent 60%),radial-gradient(100% 60% at 100% 30%,#2e3a3d 0,transparent 55%),#101117;overflow:hidden}
.mu *{box-sizing:border-box}
.mu button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mu-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:calc(6px + env(safe-area-inset-top)) 12px 2px;max-width:520px;width:100%;margin:0 auto}
.mu-title{flex:1;display:flex;align-items:center;gap:6px;font-family:Georgia,serif;letter-spacing:.08em;font-size:15px}
.mu-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 16px calc(28px + env(safe-area-inset-bottom));max-width:520px;width:100%;margin:0 auto;-webkit-overflow-scrolling:touch}
.mu-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--dim)}
.mu-ico:hover,.mu-ico.hot{color:var(--ac)}
.mu-pair{position:relative;width:260px;max-width:100%;height:150px;margin:18px auto 0}
.mu-who{position:absolute;top:0;width:64px;z-index:1;will-change:transform}
.mu-who.l{left:0}.mu-who.r{right:0;z-index:2}
.mu-wait{position:relative;transition:filter .7s ease}
.mu-pair.wait .mu-wait{filter:grayscale(.85) brightness(.5)}
.mu-dots{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6px}
.mu-dots i{width:7px;height:7px;border-radius:50%;background:#f5f3f1;animation:mudot 1.2s ease-in-out infinite}
.mu-dots i:nth-child(2){animation-delay:.18s}.mu-dots i:nth-child(3){animation-delay:.36s}
@keyframes mudot{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-3px)}}
.mu-pair.joined .mu-who.l .mu-av{animation:mubumpl .42s cubic-bezier(.3,1.6,.5,1)}
.mu-pair.joined .mu-who.r .mu-av{animation:mubumpr .42s cubic-bezier(.3,1.6,.5,1)}
@keyframes mubumpl{0%{transform:translateX(3px) scale(.96,1.03)}100%{transform:none}}
@keyframes mubumpr{0%{transform:translateX(-3px) scale(.96,1.03)}100%{transform:none}}
.mu-pair::after{content:"";position:absolute;left:50%;top:32px;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--ac);opacity:0;pointer-events:none}
.mu-pair.joined::after{animation:muspark .7s ease-out}
@keyframes muspark{0%{opacity:.75;transform:scale(.4)}100%{opacity:0;transform:scale(7)}}
.mu-join{text-align:center;font-size:14px;letter-spacing:.06em;color:var(--dim);min-height:22px;margin:2px 0 6px}
.mu-join span{display:inline-block;animation:mujoin .45s ease}
.mu-join.joined{color:var(--ink)}
.mu-join{max-height:30px;overflow:hidden;transition:opacity .6s ease,max-height .6s ease .3s,margin .6s ease .3s}
.mu-join.gone{opacity:0;max-height:0;min-height:0;margin:0}
@keyframes mujoin{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.mu-ell i{font-style:normal;animation:muell 1.4s infinite}
.mu-ell i:nth-child(2){animation-delay:.2s}.mu-ell i:nth-child(3){animation-delay:.4s}
@keyframes muell{0%,100%{opacity:.15}40%{opacity:1}}
@media (prefers-reduced-motion:reduce){.mu-dots i,.mu-ell i,.mu-pair.joined::after,.mu-pair.joined .mu-av{animation:none}}
.mu-av{width:64px;height:64px;border-radius:50%;overflow:hidden;border:1px solid var(--l);background:#ffffff14;display:grid;place-items:center;font-family:Georgia,serif;font-size:22px}
.mu-av img{width:100%;height:100%;object-fit:cover}
.mu-att{position:absolute;top:-5px;right:-5px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#101117;border:1px solid var(--ac);color:var(--ac)}
.mu-cable{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;color:var(--dim);pointer-events:none;transition:color .4s}
.mu-cable path{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.mu-cable.on{color:var(--ac)}
.mu-cable.on path.c1{animation:mucab 2.4s ease-in-out infinite}
.mu-cable.on path.c2{animation:mucab 2.4s ease-in-out -1.2s infinite}
@keyframes mucab{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
.mu-say{position:absolute;top:100%;left:6px;margin-top:6px;width:max-content;max-width:210px;padding:8px 11px;border-radius:3px 14px 14px 14px;background:#ffffff20;border:1px solid var(--l);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-size:13px;line-height:1.45;z-index:2;animation:musay .25s ease}
@keyframes musay{from{opacity:0}to{opacity:1}}
.mu-stage{display:flex;flex-direction:column;align-items:center;margin-top:8px}
.mu-cover{width:min(62vw,230px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:1px solid var(--l)!important;background:#ffffff12!important;display:grid;place-items:center;color:var(--dim);padding:0}
.mu-cover img{width:100%;height:100%;object-fit:cover}
.mu-lrc{width:100%;height:100%;overflow:auto;padding:40% 14px;text-align:center;scrollbar-width:none;background:#0000008c;position:relative}
.mu-lrc p{margin:0 0 10px;font-size:14px;line-height:1.5;color:var(--dim)}
.mu-cover.lrcon{width:calc(100% + 32px);margin:0 -16px;aspect-ratio:auto;height:min(62vw,260px);border:0!important;border-radius:0;background:none!important;overflow:visible}
.mu-cover.lrcon .mu-lrc{background:none;padding:calc(min(62vw,260px) / 2 - 12px) 16px;-webkit-mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent)}
.mu-cover.lrcon .mu-lrc p{font-size:15px}
.mu-cover.lrcon .mu-lrc p.on{font-size:17px}
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
.mu-all{display:flex;align-items:center;gap:10px;padding:8px 4px 10px;font-size:14px;color:var(--ink)}
.mu-all-ico{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--ac);color:#1c1a18}
.mu-all i{font-style:normal;font-size:12px;color:var(--dim)}
.mu-all:active .mu-all-ico{transform:scale(.94)}
.mu-back{display:flex;align-items:center;gap:2px;padding:4px 2px 8px;font-size:13px;color:var(--ac)!important}
.mu-chat{display:flex;flex-direction:column;gap:8px}
.mu-msgs{display:flex;flex-direction:column;gap:7px;max-height:320px;overflow:auto;padding:2px}
.mu-msg{align-self:flex-start;max-width:82%;padding:8px 12px;border-radius:14px 14px 14px 3px;background:#ffffff18;border:1px solid var(--l);font-size:13.5px;line-height:1.5;white-space:pre-wrap}
.mu-msg.me{align-self:flex-end;border-radius:14px 14px 3px 14px;background:#d6c2a82e}
.mu-msg.dim{color:var(--dim)}
.mu-mrow{align-self:flex-start;max-width:82%;display:flex;flex-direction:column;align-items:flex-start}
.mu-mrow.me{align-self:flex-end;align-items:flex-end}
.mu-mrow .mu-msg{max-width:100%;align-self:auto}
.mu-mrow.me .mu-msg{border-radius:14px 14px 3px 14px;background:#d6c2a82e}
.mu-stag{position:relative;z-index:1;margin:0 10px -6px;max-width:calc(100% - 20px);padding:1px 9px;border-radius:999px;background:#2a2b35;border:1px solid var(--l);color:var(--ac);font-size:11px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px #0004}
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
.mu-opt{display:flex;align-items:center;gap:12px;width:100%;padding:12px 6px;border-radius:12px;text-align:left;font-size:15px}
.mu-opt span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mu-opt i{font-style:normal;font-size:12px;color:var(--dim)}
.mu-opt.on{color:var(--ac)}
.mu-opt:active{background:#ffffff12!important}
.mu-optimg{width:36px;height:36px;border-radius:7px;object-fit:cover}
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
