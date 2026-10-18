/**
 * 一起听歌的「播放器本体」。
 *
 * 放在界面之外（模块级单例）：音频元素、队列、随机插话的计时器都活在这里，
 * 所以退出「一起听歌」页面、回到主屏幕、切到别的分区，歌都不会停；
 * 手机锁屏 / 切到后台时由系统的 Media Session 接管（锁屏界面能看到歌名封面、能切歌）。
 * 页面（panels/music.jsx）和主屏幕上的小组件都只是来读它的状态。
 */
import { useSyncExternalStore } from "react";
import { cx } from "./companion/api.js";

const KEY = "uranus.music.v1";
const loadCfg = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};
let local = loadCfg(); // { api, cookie, uid, nick, mine }
export const getLocal = () => local;
export function setLocal(patch) {
  local = { ...local, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* 无痕窗口：只在本次有效 */
  }
  emit();
}

/* ------------------------------------------------------------ 网易云 */

export async function ne(path, params = {}, { anon = false, api: apiOverride } = {}) {
  const api = apiOverride ?? local.api;
  if (!/^https?:\/\//i.test(api || "")) throw new Error("先在右上角设置里填音乐 API 地址");
  const u = new URL(String(api).replace(/\/+$/, "") + path);
  Object.entries(params).forEach(([k, v]) => v !== undefined && u.searchParams.set(k, v));
  if (local.cookie && !anon) u.searchParams.set("cookie", local.cookie);
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
export const https = (u) => (u ? String(u).replace(/^http:\/\//i, "https://") : "");
export const norm = (t) => ({
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

/* ------------------------------------------------------------ 状态 */

let st = {
  queue: [],
  idx: -1,
  playing: false,
  pos: 0,
  dur: 0,
  lrc: [],
  att: [], // 角色的态度
  mcfg: null, // 角色这边的设置（模型、概率）
  profiles: [],
  chat: [],
  bubble: "",
  names: { c: "Loki", u: "" },
  toast: "",
  liked: [], // 我在网易云「喜欢的音乐」里的歌曲 id
};
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function set(patch) {
  st = { ...st, ...patch };
  emit();
}
export function useMusic(sel = (s) => s) {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => sel(st, local),
    () => sel(st, local),
  );
}
/** 主屏幕小组件用：只在歌换了、播放 / 暂停时才重画，不跟着进度条每秒刷新。 */
export const useNow = () => useMusic((s) => s.queue[s.idx] || null);
export const usePlaying = () => useMusic((s) => s.playing);
export const useLocal = () => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => local, () => local);

let toastT;
export function say(m) {
  set({ toast: m });
  clearTimeout(toastT);
  toastT = setTimeout(() => set({ toast: "" }), 3200);
}

/* ------------------------------------------------------------ 音频 */

const audio = typeof Audio !== "undefined" ? new Audio() : null;
if (audio) {
  audio.preload = "auto";
  audio.addEventListener("play", () => {
    set({ playing: true });
    syncSession();
    scheduleRoll();
  });
  audio.addEventListener("pause", () => {
    set({ playing: false });
    syncSession();
  });
  audio.addEventListener("timeupdate", () => {
    set({ pos: audio.currentTime });
    updatePosition();
    // 快放完时提前拿好下一首的地址（见 prefetchNext）
    if (isFinite(audio.duration) && audio.duration - audio.currentTime < PREFETCH_LEAD) prefetchNext();
  });
  audio.addEventListener("loadedmetadata", () => set({ dur: audio.duration || 0 }));
  audio.addEventListener("ended", () => {
    if (local.mode === "one" && cur()) {
      audio.currentTime = 0;
      audio.play().catch(() => (resumeOnVisible = true));
    } else if (!advancePrefetched()) next();
  });
  audio.addEventListener("error", () => say("这首加载失败了"));
}

const cur = () => st.queue[st.idx] || null;
const lineNow = () => {
  let k = -1;
  const t = audio?.currentTime || 0;
  for (let i = 0; i < st.lrc.length; i++) if (st.lrc[i].t <= t + 0.2) k = i;
  return k >= 0 ? st.lrc[k].s : "";
};

/*
 * 熄屏 / 后台自动切歌。
 *
 * iOS（Safari / 主屏幕 PWA）上，一首歌 ended 之后音频会话就停了；这时候先去
 * 网络请求下一首的地址、过一会儿才 play()，会被系统当成「没有用户操作的自动播放」
 * 拦掉 —— 界面上已经切到下一首，但没声音，非得点亮屏幕再按一下。
 *
 * 所以：当前这首剩不到 PREFETCH_LEAD 秒时，就把下一首（以及它的地址）先拿好；
 * ended 里同步换 src、立刻 play()，中间没有任何 await，系统就会放行。
 * 网易云的地址有时效，太旧的预取不用，退回老路径。
 */
const PREFETCH_LEAD = 40; // 秒
const PREFETCH_TTL = 15 * 60 * 1000;
let pre = null; // { queue, from, idx, url, trial, at, skipped }
let preBusy = false;
let resumeOnVisible = false;

function pickNext(from) {
  const n = st.queue.length;
  let i = (from + 1) % n;
  if (local.mode === "shuffle" && n > 1) {
    do i = Math.floor(Math.random() * n);
    while (i === from);
  }
  return i;
}
async function prefetchNext() {
  if (preBusy || !st.queue.length || local.mode === "one") return;
  if (pre && pre.queue === st.queue && pre.from === st.idx) return;
  preBusy = true;
  const queue = st.queue, from = st.idx;
  try {
    const skipped = [];
    let i = pickNext(from);
    // 下一首放不了（版权 / 会员）就往后多看两首，免得 ended 时又落回要联网的老路径
    for (let tries = 0; tries < 3 && i !== from; tries++) {
      const s = queue[i];
      const d = await ne("/song/url/v1", { id: s.id, level: "standard" });
      const it = d.data?.[0];
      if (st.queue !== queue || st.idx !== from) return; // 期间用户自己切歌了
      if (it?.url) {
        pre = { queue, from, idx: i, url: https(it.url), trial: !!it.freeTrialInfo, at: Date.now(), skipped };
        return;
      }
      skipped.push(s.name);
      i = local.mode === "shuffle" ? pickNext(i) : (i + 1) % queue.length;
    }
  } catch {
    /* 预取失败无所谓，ended 时走老路径 */
  } finally {
    preBusy = false;
  }
}
/** ended 里调用：有新鲜的预取就同步切过去并 play()，返回 true；否则返回 false 走 next()。 */
function advancePrefetched() {
  const p = pre;
  pre = null;
  if (!p || !audio || p.queue !== st.queue || p.from !== st.idx || Date.now() - p.at > PREFETCH_TTL) return false;
  const s = p.queue[p.idx];
  if (!s) return false;
  if (st.idx >= 0) history.push(st.idx);
  history = history.slice(-50);
  clearTimeout(rollTimer);
  audio.src = p.url;
  const pr = audio.play();
  set({ idx: p.idx, lrc: [], pos: 0, dur: s.dur || 0 });
  syncSession();
  if (p.skipped.length) say(`「${p.skipped.join("」「")}」放不了，已跳过`);
  else if (p.trial) say("这首只有试听片段（会员歌曲）");
  pr?.catch?.(() => (resumeOnVisible = true));
  loadLyric(s);
  return true;
}
function loadLyric(s) {
  ne("/lyric", { id: s.id })
    .then((d) => cur()?.id === s.id && set({ lrc: parseLrc(d.lrc?.lyric) }))
    .catch(() => {});
}
// 兜底：万一后台还是被拦了，点亮屏幕回到页面时自动接着放，不用再按播放键
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && resumeOnVisible && audio?.src && audio.paused) {
      resumeOnVisible = false;
      audio.play().catch(() => {});
    }
  });
}

export async function play(list, i) {
  const s = list[i];
  if (!s || !audio) return;
  clearTimeout(rollTimer);
  pre = null;
  set({ queue: list, idx: i, lrc: [], pos: 0, dur: s.dur || 0 });
  syncSession();
  try {
    const d = await ne("/song/url/v1", { id: s.id, level: "standard" });
    const it = d.data?.[0];
    if (!it?.url) {
      say(`「${s.name}」放不了（版权 / 会员 / 地区限制），跳到下一首`);
      if (i + 1 < list.length) setTimeout(() => play(list, i + 1), 600);
      else set({ playing: false });
      return;
    }
    if (it.freeTrialInfo) say("这首只有试听片段（会员歌曲）");
    audio.src = https(it.url);
    await audio.play().catch(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") resumeOnVisible = true;
      else say("浏览器拦住了自动播放，点一下播放键");
    });
  } catch (e) {
    say(e.message);
  }
  loadLyric(s);
}
/* 播放顺序：seq 顺序 / shuffle 随机 / one 单曲循环（循环只管自然播完；手动点下一首照常切歌） */
let history = [];
export function setMode(m) {
  setLocal({ mode: m });
}
export function next() {
  if (!st.queue.length) return;
  if (advancePrefetched()) return; // 锁屏 / 耳机「下一首」也走预取，少一次等待
  const i = pickNext(st.idx);
  if (st.idx >= 0) history.push(st.idx);
  history = history.slice(-50);
  play(st.queue, i);
}
export function prev() {
  if (!st.queue.length) return;
  if (audio && audio.currentTime > 4) return seek(0);
  const i = local.mode === "shuffle" && history.length ? history.pop() : (st.idx - 1 + st.queue.length) % st.queue.length;
  play(st.queue, i);
}
export function toggle() {
  if (!audio?.src) return;
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}
export function seek(t) {
  if (audio) audio.currentTime = t;
}

/* ---- 系统媒体控制（锁屏 / 后台 / 耳机线控） ---- */
function syncSession() {
  if (!("mediaSession" in navigator)) return;
  const s = cur();
  try {
    if (s) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.name,
        artist: s.artist,
        album: "Listen Together",
        artwork: s.cover ? [{ src: s.cover + "?param=512y512", sizes: "512x512" }] : [],
      });
    }
    navigator.mediaSession.playbackState = st.playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("seekto", (d) => seek(d.seekTime));
  } catch {
    /* 老浏览器不支持 */
  }
}
let lastPosAt = 0;
function updatePosition() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const now = Date.now();
  if (now - lastPosAt < 3000 || !isFinite(audio.duration)) return;
  lastPosAt = now;
  try {
    navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------ 我的 ♥：真的加到网易云「喜欢的音乐」 */

export async function loadLiked() {
  if (!local.api || !local.cookie) return;
  try {
    let uid = local.uid;
    if (!uid) {
      const r = await ne("/login/status");
      const p = r.data?.profile || r.profile;
      if (!p) return;
      uid = p.userId;
      setLocal({ uid, nick: p.nickname });
    }
    const d = await ne("/likelist", { uid });
    if (Array.isArray(d.ids)) set({ liked: d.ids.map(String) });
  } catch {
    /* 拿不到就当还没喜欢过，点爱心时再试 */
  }
}
export async function toggleLike() {
  const s = cur();
  if (!s) return;
  const on = !st.liked.includes(s.id);
  set({ liked: on ? [...st.liked, s.id] : st.liked.filter((x) => x !== s.id) }); // 先画出来，失败再改回
  try {
    const d = await ne("/like", { id: s.id, like: on ? "true" : "false" });
    if (d.code !== 200) throw new Error(d.message || d.msg || "网易云没有接受（可能没登录或接口不支持）");
    say(on ? "已加入「我喜欢的音乐」" : "已取消喜欢");
  } catch (e) {
    set({ liked: on ? st.liked.filter((x) => x !== s.id) : [...st.liked, s.id] });
    say(e.message);
  }
}
/** 把歌加进某个歌单（我的 / Loki 的）。返回 true 表示成功或已经在里面。 */
export async function addToList(pid, song = cur(), quiet = false) {
  if (!song || !pid) return false;
  try {
    const d = await ne("/playlist/tracks", { op: "add", pid, tracks: song.id });
    const code = d.body?.code ?? d.code;
    if (code === 200) {
      if (!quiet) say("已加入歌单");
      return true;
    }
    if (code === 502) {
      if (!quiet) say("这首已经在那个歌单里了");
      return true;
    }
    throw new Error(d.body?.message || d.body?.msg || d.message || d.msg || "加入歌单没成功");
  } catch (e) {
    if (!quiet) say(e.message);
    return false;
  }
}
export async function createList(name) {
  const d = await ne("/playlist/create", { name, privacy: "10" });
  if (d.code !== 200 || !d.id) throw new Error(d.message || d.msg || "新建歌单没成功");
  return { id: d.id, name };
}

/* ------------------------------------------------------------ 角色那边（Companion） */

export async function refreshState() {
  try {
    const d = await cx("/music/state");
    set({ mcfg: d.cfg, chat: d.chat || [], att: d.attitudes || [], names: { c: d.characterName, u: d.userName } });
  } catch {
    /* Companion 没连上也不影响放歌 */
  }
  try {
    const b = await cx("/bootstrap");
    set({ profiles: b.settings?.modelProfiles || [] });
  } catch {
    /* ignore */
  }
}
export function setMcfgLocal(patch) {
  set({ mcfg: { ...st.mcfg, ...patch } });
}
export async function saveMcfg(patch) {
  const n = { ...st.mcfg, ...patch };
  set({ mcfg: n });
  try {
    const d = await cx("/music/cfg", { method: "PUT", body: n });
    set({ mcfg: d.cfg });
  } catch (e) {
    say(e.message);
  }
}
export async function clearChat() {
  try {
    await cx("/music/chat", { method: "DELETE" });
    set({ chat: [] });
  } catch (e) {
    say(e.message);
  }
}
const brief = (s) => ({ id: s.id, name: s.name, artist: s.artist, cover: s.cover });
function showBubble(text) {
  set({ bubble: text });
  clearTimeout(showBubble.t);
  showBubble.t = setTimeout(() => set({ bubble: "" }), 7000);
}
export async function sendChat(text) {
  const s = cur();
  const sb = s ? brief(s) : null;
  set({ chat: [...st.chat, { id: "u" + Date.now(), role: "user", text, song: sb }] });
  try {
    const d = await cx("/music/chat", { method: "POST", body: { text, song: sb || {}, lyricLine: lineNow() } });
    if (d.reply) {
      set({ chat: [...st.chat, { id: "c" + Date.now(), role: "character", text: d.reply, kind: "chat", song: sb }] });
      showBubble(d.reply);
    }
  } catch (e) {
    say(e.message);
  }
}

/* ---- 随机插话：每首歌一次，掷骰子决定说话 / 表态 / 想切歌；内容由模型写 ---- */
let rolled = "";
let refreshing = false;
let rollTimer;
function scheduleRoll() {
  const s = cur();
  if (!s || rolled === s.id) return;
  if (!st.mcfg) {
    if (!refreshing) {
      refreshing = true;
      refreshState().finally(() => {
        refreshing = false;
        if (st.mcfg) scheduleRoll();
      });
    }
    return;
  }
  rolled = s.id;
  // 他以前表过态的歌：踩过 → 很可能想跳过（70%，而且更早开口）；喜欢过 → 不会想跳
  const prior = st.att.find((a) => a.song?.id === s.id && a.by === "character")?.attitude || "";
  const maxAt = Math.max(12, Math.min(70, (st.dur || 120) * 0.6));
  const delay = (prior === "dislike" ? 3 + Math.random() * 5 : 8 + Math.random() * (maxAt - 8)) * 1000;
  clearTimeout(rollTimer);
  rollTimer = setTimeout(async () => {
    const c = st.mcfg;
    if (!c || cur()?.id !== s.id || audio.paused) return;
    const wantText = Math.random() < c.commentChance;
    const wantAtt = Math.random() < c.attitudeChance;
    const wantSkip = prior === "dislike" ? Math.random() < 0.7 : prior === "like" ? false : Math.random() < c.skipChance;
    if (!wantText && !wantAtt && !wantSkip) return;
    try {
      const d = await cx("/music/react", {
        method: "POST",
        body: { song: brief(s), lyricLine: lineNow(), position: audio.currentTime, allowSkip: wantSkip, priorAttitude: prior, wantText: wantText || wantSkip, wantAttitude: wantAtt },
      });
      set({ att: d.attitudes || st.att });
      if (d.text) {
        set({ chat: [...st.chat, { id: "r" + Date.now(), role: "character", text: d.text, kind: "react", song: brief(s) }] });
        showBubble(d.text);
      }
      // 他点了爱心：如果在设置里选了歌单，就把这首加进去（网易云上能看到）；没选就只是在这里表达
      if (d.attitude === "like" && prior !== "like" && local.likeListId) {
        addToList(local.likeListId, s, true).then((ok) => ok && say(`${st.names.c} 把《${s.name}》加进了「${local.likeListName || "他的歌单"}」`));
      }
      if (d.skip && cur()?.id === s.id) setTimeout(() => cur()?.id === s.id && next(), 3000);
    } catch (e) {
      say(e.message);
    }
  }, delay);
}
