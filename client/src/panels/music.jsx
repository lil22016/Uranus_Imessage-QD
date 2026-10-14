import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Headphones,
  Heart,
  ListMusic,
  MessageCircle,
  Pause,
  Play,
  Send,
  Settings2,
  SkipBack,
  SkipForward,
  ThumbsDown,
  X,
} from "lucide-react";
import { useConfig } from "../store.jsx";
import { cx } from "../companion/api.js";
import { useTheme } from "../phonehome.jsx";

/**
 * 一起听歌。
 *
 * 音乐来源：网易云「非官方」API（NeteaseCloudMusicApi 一类的服务，自己部署，例如 Vercel）。
 * 浏览器直接请求它：地址、登录 cookie 都只存在本机 localStorage（uranus.music.v1），
 * 不经过 Uranus / Companion 后端。
 * 角色那边（态度 / 小聊天框 / 随机插话 / 模型选择）走 /companion-api/music/*。
 */

const KEY = "uranus.music.v1";
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};
const persist = (o) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* 无痕窗口：只在本次有效 */
  }
};

/* ------------------------------------------------------------ 网易云 */

async function ne(api, cookie, path, params = {}) {
  if (!/^https?:\/\//i.test(api || "")) throw new Error("先在右上角设置里填音乐 API 地址");
  const u = new URL(api.replace(/\/+$/, "") + path);
  Object.entries(params).forEach(([k, v]) => v !== undefined && u.searchParams.set(k, v));
  if (cookie) u.searchParams.set("cookie", cookie);
  u.searchParams.set("timestamp", String(Date.now()));
  let res;
  try {
    res = await fetch(u.toString());
  } catch {
    throw new Error("连不上音乐 API（地址写错了，或者那边没开跨域）");
  }
  let d = null;
  try {
    d = await res.json();
  } catch {
    /* ignore */
  }
  if (!d) throw new Error(`音乐 API 返回了奇怪的东西 (${res.status})`);
  return d;
}

const https = (u) => (u ? String(u).replace(/^http:\/\//i, "https://") : "");
const norm = (t) => ({
  id: String(t.id),
  name: t.name || "",
  artist: (t.ar || t.artists || []).map((a) => a.name).join(" / "),
  cover: https(t.al?.picUrl || t.album?.picUrl || ""),
  dur: Math.round((t.dt || t.duration || 0) / 1000),
});

function parseLrc(text) {
  const out = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((ln) => {
      const tags = [...ln.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const body = ln.replace(/\[[^\]]*\]/g, "").trim();
      tags.forEach((m) => body && out.push({ t: Number(m[1]) * 60 + Number(m[2]), s: body }));
    });
  return out.sort((a, b) => a.t - b.t);
}
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* ------------------------------------------------------------ 面板 */

export function MusicPanel() {
  const { config } = useConfig();
  const theme = useTheme();
  const [st, setSt] = useState(load);
  const upSt = (patch) =>
    setSt((o) => {
      const n = { ...o, ...patch };
      persist(n);
      return n;
    });
  const { api = "", cookie = "", nick = "", mine = {} } = st;

  const [toast, setToast] = useState("");
  const say = useCallback((m) => {
    setToast(m);
    clearTimeout(say.t);
    say.t = setTimeout(() => setToast(""), 3200);
  }, []);

  const [tab, setTab] = useState("rec"); // rec | lists | chat
  const [lists, setLists] = useState([]);
  const [openList, setOpenList] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(-1);
  const song = queue[idx] || null;
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [lrc, setLrc] = useState([]);
  const [showLrc, setShowLrc] = useState(false);
  const audio = useRef(null);

  const [sheet, setSheet] = useState(false);
  const [chat, setChat] = useState([]);
  const [att, setAtt] = useState([]); // 角色的态度
  const [mcfg, setMcfg] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [bubble, setBubble] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /* ---- 角色那边的状态 ---- */
  const refreshState = useCallback(async () => {
    try {
      const d = await cx("/music/state");
      setMcfg(d.cfg);
      setChat(d.chat || []);
      setAtt(d.attitudes || []);
      d.names = { c: d.characterName, u: d.userName };
      setNames(d.names);
    } catch {
      /* Companion 没连上也不影响放歌 */
    }
    try {
      const b = await cx("/bootstrap");
      setProfiles(b.settings?.modelProfiles || []);
    } catch {
      /* ignore */
    }
  }, []);
  const [names, setNames] = useState({ c: "Loki", u: "" });
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const hisAtt = song ? att.find((a) => a.song?.id === song.id && a.by === "character")?.attitude : "";
  const myAtt = song ? mine[song.id] : "";

  /* ---- 登录 / 列表 ---- */
  const needLogin = !!api && !cookie;
  const loadLists = useCallback(async () => {
    try {
      let uid = st.uid;
      if (!uid) {
        const s = await ne(api, cookie, "/login/status");
        const p = s.data?.profile || s.profile;
        if (!p) throw new Error("登录状态失效了，重新扫码登录一下");
        uid = p.userId;
        upSt({ uid, nick: p.nickname });
      }
      const d = await ne(api, cookie, "/user/playlist", { uid, limit: 100 });
      setLists(d.playlist || []);
    } catch (e) {
      say(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cookie, st.uid]);

  const loadRec = useCallback(async () => {
    setLoadingTracks(true);
    try {
      const d = await ne(api, cookie, "/recommend/songs");
      const arr = d.data?.dailySongs || d.recommend || [];
      if (!arr.length) throw new Error(d.msg || d.message || "每日推荐是空的（没登录？）");
      setTracks(arr.map(norm));
      setOpenList({ id: "rec", name: "每日推荐" });
    } catch (e) {
      say(e.message);
    } finally {
      setLoadingTracks(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cookie]);

  const openPl = async (pl) => {
    setOpenList(pl);
    setLoadingTracks(true);
    setTracks([]);
    try {
      const d = await ne(api, cookie, "/playlist/track/all", { id: pl.id, limit: 200 });
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

  /* ---- 播放 ---- */
  const startAt = async (list, i) => {
    const s = list[i];
    if (!s) return;
    setQueue(list);
    setIdx(i);
    setLrc([]);
    setPos(0);
    setDur(s.dur || 0);
    try {
      const d = await ne(api, cookie, "/song/url/v1", { id: s.id, level: "standard" });
      const it = d.data?.[0];
      if (!it?.url) {
        say(`「${s.name}」放不了（版权 / 会员 / 地区限制），跳到下一首`);
        if (i + 1 < list.length) setTimeout(() => startAt(list, i + 1), 600);
        return;
      }
      if (it.freeTrialInfo) say("这首只有试听片段（会员歌曲）");
      const a = audio.current;
      a.src = https(it.url);
      await a.play().catch(() => say("浏览器拦住了自动播放，点一下播放键"));
    } catch (e) {
      say(e.message);
    }
    ne(api, cookie, "/lyric", { id: s.id })
      .then((d) => setLrc(parseLrc(d.lrc?.lyric)))
      .catch(() => {});
  };
  const next = useCallback(() => {
    if (!queue.length) return;
    startAt(queue, (idx + 1) % queue.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, idx, api, cookie]);
  const prev = () => queue.length && startAt(queue, (idx - 1 + queue.length) % queue.length);
  const toggle = () => {
    const a = audio.current;
    if (!a?.src) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  useEffect(() => {
    if (!("mediaSession" in navigator) || !song) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name,
        artist: song.artist,
        artwork: song.cover ? [{ src: song.cover }] : [],
      });
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("previoustrack", prev);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, next]);

  const lyricNow = useMemo(() => {
    let k = -1;
    for (let i = 0; i < lrc.length; i++) if (lrc[i].t <= pos + 0.2) k = i;
    return k;
  }, [lrc, pos]);
  const lineText = lyricNow >= 0 ? lrc[lyricNow].s : "";
  const lyrRef = useRef(null);
  useEffect(() => {
    const el = lyrRef.current?.querySelector(".on");
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [lyricNow, showLrc]);

  /* ---- 我的 ♥ / 👎（只存本机） ---- */
  const setMine = (v) => {
    if (!song) return;
    const m = { ...mine };
    if (m[song.id] === v) delete m[song.id];
    else m[song.id] = v;
    upSt({ mine: m });
  };

  /* ---- 角色随机插话 ---- */
  const songBrief = (s) => ({ id: s.id, name: s.name, artist: s.artist, cover: s.cover });
  const lineRef = useRef("");
  lineRef.current = lineText;
  const posRef = useRef(0);
  posRef.current = pos;
  const nextRef = useRef(next);
  nextRef.current = next;
  const rolled = useRef("");
  useEffect(() => {
    if (!playing || !song || !mcfg || rolled.current === song.id) return;
    rolled.current = song.id;
    const sid = song.id;
    const maxAt = Math.max(12, Math.min(70, (dur || 120) * 0.6));
    const delay = (8 + Math.random() * (maxAt - 8)) * 1000;
    const t = setTimeout(async () => {
      const wantText = Math.random() < mcfg.commentChance;
      const wantAtt = Math.random() < mcfg.attitudeChance;
      const wantSkip = Math.random() < mcfg.skipChance;
      if (!wantText && !wantAtt && !wantSkip) return;
      if (audio.current?.paused) return;
      try {
        const d = await cx("/music/react", {
          method: "POST",
          body: {
            song: songBrief(song),
            lyricLine: lineRef.current,
            position: posRef.current,
            allowSkip: wantSkip,
            wantText: wantText || wantSkip,
            wantAttitude: wantAtt,
          },
        });
        setAtt(d.attitudes || []);
        if (d.text) {
          setChat((c) => [...c, { id: "r" + Date.now(), role: "character", text: d.text, kind: "react" }]);
          setBubble(d.text);
          setTimeout(() => setBubble(""), 7000);
        }
        if (d.skip) setTimeout(() => nextRef.current(), 3000);
      } catch (e) {
        void sid;
        say(e.message);
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, song?.id, mcfg]);

  /* ---- 小聊天框 ---- */
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setChat((c) => [...c, { id: "u" + Date.now(), role: "user", text }]);
    try {
      const d = await cx("/music/chat", {
        method: "POST",
        body: { text, song: song ? songBrief(song) : {}, lyricLine: lineText },
      });
      const reply = d.reply || d.text;
      if (reply) {
        setChat((c) => [...c, { id: "c" + Date.now(), role: "character", text: reply, kind: "chat" }]);
        setBubble(reply);
        setTimeout(() => setBubble(""), 7000);
      }
    } catch (e) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  };
  const chatEnd = useRef(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView?.({ block: "end" });
  }, [chat.length, tab]);

  const showList = tab === "lists" && !openList ? lists : null;

  return (
    <div className="mu">
      <style>{CSS}</style>
      <audio
        ref={audio}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={next}
        onError={() => say("这首加载失败了")}
        preload="auto"
      />

      <div className="mu-top">
        <span className="mu-title">
          <Headphones size={16} strokeWidth={1.6} /> 一起听
        </span>
        <button type="button" className="mu-ico" onClick={() => setSheet(true)} aria-label="音乐设置">
          <Settings2 size={18} strokeWidth={1.6} />
        </button>
      </div>

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
            <input
              type="range"
              className="mu-bar"
              min={0}
              max={dur || 1}
              step={0.5}
              value={Math.min(pos, dur || 1)}
              onChange={(e) => {
                audio.current.currentTime = Number(e.target.value);
              }}
              style={{ "--p": `${dur ? (pos / dur) * 100 : 0}%` }}
            />
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
        <button type="button" className={tab === "rec" ? "on" : ""} onClick={() => { setTab("rec"); if (openList?.id !== "rec" && api && cookie) loadRec(); }}>
          每日推荐
        </button>
        <button type="button" className={tab === "lists" ? "on" : ""} onClick={() => { setTab("lists"); setOpenList(null); }}>
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
                <button type="button" key={t.id + ":" + i} className={`mu-row ${song?.id === t.id ? "cur" : ""}`} onClick={() => startAt(tracks, i)}>
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
            <button
              type="button"
              className="mu-link"
              onClick={async () => {
                try {
                  await cx("/music/chat", { method: "DELETE" });
                  setChat([]);
                } catch (e) {
                  say(e.message);
                }
              }}
            >
              清空聊天
            </button>
          )}
        </div>
      )}

      {toast && <div className="mu-toast">{toast}</div>}
      {sheet && (
        <Settings
          onClose={() => setSheet(false)}
          st={st}
          upSt={upSt}
          mcfg={mcfg}
          setMcfg={setMcfg}
          profiles={profiles}
          providers={config?.providers ?? []}
          say={say}
          onLoggedIn={() => {
            setSheet(false);
          }}
        />
      )}
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

/* ------------------------------------------------------------ 设置 */

function Settings({ onClose, st, upSt, mcfg, setMcfg, profiles, providers, say, onLoggedIn }) {
  const [url, setUrl] = useState(st.api || "");
  const [qr, setQr] = useState("");
  const [qrMsg, setQrMsg] = useState("");
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);

  const saveUrl = () => {
    const v = url.trim().replace(/\/+$/, "");
    upSt({ api: v });
    say("已保存");
  };

  const qrLogin = async () => {
    const api = url.trim().replace(/\/+$/, "");
    if (!api) return say("先填音乐 API 地址");
    upSt({ api });
    clearInterval(poll.current);
    try {
      const k = await ne(api, "", "/login/qr/key");
      const key = k.data?.unikey;
      if (!key) throw new Error("拿不到二维码 key");
      const c = await ne(api, "", "/login/qr/create", { key, qrimg: "true" });
      setQr(c.data?.qrimg || "");
      setQrMsg("用网易云 App 扫码，并在手机上确认");
      poll.current = setInterval(async () => {
        try {
          const r = await ne(api, "", "/login/qr/check", { key });
          if (r.code === 800) {
            clearInterval(poll.current);
            setQrMsg("二维码过期了，重新点一次");
            setQr("");
          } else if (r.code === 802) setQrMsg("已扫码，在手机上点确认");
          else if (r.code === 803) {
            clearInterval(poll.current);
            const raw = String(r.cookie || "");
            const m = raw.match(/MUSIC_U=[^;]+/);
            upSt({ cookie: m ? m[0] + ";" : raw, uid: "", nick: "" });
            setQr("");
            say("登录成功");
            onLoggedIn();
          }
        } catch {
          /* 轮询偶尔失败不用管 */
        }
      }, 2000);
    } catch (e) {
      say(e.message);
    }
  };

  const saveCfg = async (patch) => {
    const n = { ...mcfg, ...patch };
    setMcfg(n);
    try {
      const d = await cx("/music/cfg", { method: "PUT", body: n });
      setMcfg(d.cfg);
    } catch (e) {
      say(e.message);
    }
  };
  const prov = providers.find((p) => p.id === mcfg?.uranusProviderId);
  const usable = providers.filter((p) => ["custom", "openai"].includes(p.type));

  return (
    <div className="mu-over" onClick={onClose}>
      <div className="mu-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mu-top">
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
          {st.cookie && (
            <button type="button" className="mu-pill" onClick={() => upSt({ cookie: "", uid: "", nick: "" })}>
              退出登录
            </button>
          )}
        </div>
        <p className="mu-hint">
          {st.cookie ? `已登录${st.nick ? "：" + st.nick : ""}。` : "未登录。"}地址和登录凭证只保存在这台设备的浏览器里，不会发到 Uranus 或 Companion。
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
            <select value={mcfg.source} onChange={(e) => saveCfg({ source: e.target.value })}>
              <option value="profile">Companion 里已有的模型</option>
              <option value="uranus">Uranus「连接」里的模型</option>
            </select>
            {mcfg.source === "uranus" ? (
              <div className="mu-row2">
                <select value={mcfg.uranusProviderId || ""} onChange={(e) => saveCfg({ uranusProviderId: e.target.value, model: "" })}>
                  <option value="">选连接…</option>
                  {usable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name?.trim() || p.id}
                    </option>
                  ))}
                </select>
                <select value={mcfg.model || ""} onChange={(e) => saveCfg({ model: e.target.value })}>
                  <option value="">选模型…</option>
                  {(prov?.models || []).map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.alias?.trim() || m.model}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <select value={mcfg.profileId || ""} onChange={(e) => saveCfg({ profileId: e.target.value })}>
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
              <label key={k} className="mu-sl">
                <span>
                  {label} <b>{Math.round((mcfg[k] ?? 0) * 100)}%</b>
                </span>
                <input type="range" min={0} max={1} step={0.05} value={mcfg[k] ?? 0} onChange={(e) => setMcfg({ ...mcfg, [k]: Number(e.target.value) })} onPointerUp={() => saveCfg({})} onKeyUp={() => saveCfg({})} />
              </label>
            ))}
            <p className="mu-hint">只有这个页面开着并且在放歌时才会触发；内容由模型现写，概率由这里的数字决定。</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 样式 */

const CSS = `
.mu{--l:#ffffff2e;--ink:#f5f3f1;--dim:#bdb5b3;--ac:#d6c2a8;position:relative;max-width:480px;margin:0 auto;padding:14px 16px 28px;color:var(--ink);border-radius:26px;
 background:radial-gradient(120% 70% at 20% 0%,#3a3550 0,transparent 60%),radial-gradient(100% 60% at 100% 30%,#2e3a3d 0,transparent 55%),#101117;border:1px solid var(--l);min-height:560px}
.mu *{box-sizing:border-box}
.mu button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.mu-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.mu-title{display:flex;align-items:center;gap:6px;font-family:Georgia,serif;letter-spacing:.08em;font-size:14px}
.mu-ico{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;color:var(--dim)}
.mu-ico:hover,.mu-ico.hot{color:var(--ac)}
.mu-pair{display:flex;align-items:center;justify-content:center;gap:0;margin:46px 0 10px}
.mu-who{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px}
.mu-av{width:64px;height:64px;border-radius:50%;overflow:hidden;border:1px solid var(--l);background:#ffffff14;display:grid;place-items:center;font-family:Georgia,serif;font-size:22px}
.mu-av img{width:100%;height:100%;object-fit:cover}
.mu-att{height:16px;color:var(--ac);display:flex}
.mu-cable{flex:1;max-width:150px;height:46px;overflow:visible;color:var(--dim);margin-top:-14px;transition:color .3s}
.mu-cable.on{color:var(--ac)}
.mu-cable.on path{animation:mucab 2.4s ease-in-out infinite;transform-origin:center}
@keyframes mucab{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px)}}
.mu-say{position:absolute;bottom:100%;left:0;margin-bottom:8px;width:max-content;max-width:210px;padding:8px 11px;border-radius:14px 14px 14px 3px;background:#ffffff20;border:1px solid var(--l);backdrop-filter:blur(14px);font-size:13px;line-height:1.45;z-index:2;animation:musay .25s ease}
@keyframes musay{from{opacity:0}to{opacity:1}}
.mu-stage{display:flex;flex-direction:column;align-items:center;margin-top:8px}
.mu-cover{width:min(62vw,230px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:1px solid var(--l);background:#ffffff12;display:grid;place-items:center;color:var(--dim);padding:0}
.mu-cover img{width:100%;height:100%;object-fit:cover}
.mu-lrc{width:100%;height:100%;overflow:auto;padding:40% 14px;text-align:center;scrollbar-width:none;background:#0000008c}
.mu-lrc p{margin:0 0 10px;font-size:14px;line-height:1.5;color:var(--dim)}
.mu-lrc p.on{color:var(--ink);font-size:15.5px}
.mu-name{margin-top:12px;font-family:Georgia,serif;font-size:17px;text-align:center}
.mu-art{font-size:12.5px;color:var(--dim);margin-top:2px;text-align:center}
.mu-line{margin-top:8px;font-size:13px;color:var(--ac);text-align:center;min-height:19px}
.mu-bar{width:100%;margin-top:12px;-webkit-appearance:none;appearance:none;height:3px;border-radius:3px;outline:none;background:linear-gradient(90deg,var(--ac) var(--p),#ffffff2e var(--p))}
.mu-bar::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--ac)}
.mu-bar::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:var(--ac)}
.mu-time{width:100%;display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-top:4px}
.mu-ctl{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:4px}
.mu-play{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:var(--ac)!important;color:#1c1a18!important}
.mu-empty{padding:26px 12px;text-align:center;font-size:13px;color:var(--dim);line-height:1.6}
.mu-tabs{display:flex;gap:6px;margin:14px 0 8px;border-top:1px solid var(--l);padding-top:10px}
.mu-tabs button{display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:99px;font-size:13px;color:var(--dim);border:1px solid transparent}
.mu-tabs button.on{color:var(--ink);border-color:var(--l);background:#ffffff14}
.mu-list{display:flex;flex-direction:column;max-height:340px;overflow:auto}
.mu-row{display:flex;align-items:center;gap:10px;padding:7px 4px;text-align:left;border-radius:10px;width:100%}
.mu-row:hover,.mu-row.cur{background:#ffffff12}
.mu-row img,.mu-ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex:none;background:#ffffff14}
.mu-rt{display:flex;flex-direction:column;min-width:0;flex:1}
.mu-rt b{font-weight:400;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mu-rt i{font-style:normal;font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mu-row.cur .mu-rt b{color:var(--ac)}
.mu-mark{color:var(--ac);flex:none}
.mu-back{display:flex;align-items:center;gap:2px;padding:4px 2px 8px;font-size:13px;color:var(--ac)}
.mu-chat{display:flex;flex-direction:column;gap:8px}
.mu-msgs{display:flex;flex-direction:column;gap:7px;max-height:300px;overflow:auto;padding:2px}
.mu-msg{align-self:flex-start;max-width:82%;padding:8px 12px;border-radius:14px 14px 14px 3px;background:#ffffff18;border:1px solid var(--l);font-size:13.5px;line-height:1.5;white-space:pre-wrap}
.mu-msg.me{align-self:flex-end;border-radius:14px 14px 3px 14px;background:#d6c2a82e}
.mu-msg.dim{color:var(--dim)}
.mu-in{display:flex;align-items:center;gap:4px;border:1px solid var(--l);border-radius:99px;padding:2px 4px 2px 14px;background:#ffffff0e}
.mu-in input{flex:1;background:none;border:0;outline:none;color:var(--ink);font-size:14px;padding:8px 0;min-width:0}
.mu-link{align-self:center;font-size:12px;color:var(--dim);text-decoration:underline}
.mu-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);max-width:88vw;padding:9px 16px;border-radius:99px;background:#000000c8;border:1px solid var(--l);font-size:13px;z-index:60;text-align:center}
.mu-over{position:fixed;inset:0;background:#000000a0;z-index:50;display:flex;align-items:flex-end;justify-content:center}
.mu-sheet{width:100%;max-width:480px;max-height:86vh;overflow:auto;background:#1b1c25;border:1px solid var(--l);border-radius:22px 22px 0 0;padding:14px 16px 26px;color:var(--ink)}
.mu-sheet h4{margin:16px 0 6px;font-family:Georgia,serif;font-weight:400;font-size:13px;color:var(--ac);letter-spacing:.06em}
.mu-sheet input:not([type=range]),.mu-sheet select{width:100%;margin-bottom:6px;padding:9px 11px;border-radius:12px;border:1px solid var(--l);background:#ffffff10;color:var(--ink);font:inherit;font-size:14px;min-width:0}
.mu-sheet select option{color:#111}
.mu-sheet button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.mu-row2{display:flex;gap:6px;flex-wrap:wrap}
.mu-row2 select{flex:1}
.mu-pill{padding:7px 14px;border-radius:99px;border:1px solid var(--l)!important;font-size:13px}
.mu-pill.solid{background:var(--ac)!important;color:#1c1a18!important;border-color:transparent!important}
.mu-hint{font-size:12px;color:var(--dim);line-height:1.55;margin:6px 0}
.mu-qr{display:flex;flex-direction:column;align-items:center;gap:6px;margin:8px 0}
.mu-qr img{width:170px;height:170px;background:#fff;border-radius:10px;padding:6px}
.mu-qr span{font-size:12.5px;color:var(--dim)}
.mu-sl{display:block;margin:6px 0 10px;font-size:13px}
.mu-sl span{display:flex;justify-content:space-between}
.mu-sl input{width:100%;accent-color:var(--ac)}
`;
