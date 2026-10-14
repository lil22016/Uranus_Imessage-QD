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
  });
  audio.addEventListener("loadedmetadata", () => set({ dur: audio.duration || 0 }));
  audio.addEventListener("ended", () => next());
  audio.addEventListener("error", () => say("这首加载失败了"));
}

const cur = () => st.queue[st.idx] || null;
const lineNow = () => {
  let k = -1;
  const t = audio?.currentTime || 0;
  for (let i = 0; i < st.lrc.length; i++) if (st.lrc[i].t <= t + 0.2) k = i;
  return k >= 0 ? st.lrc[k].s : "";
};

export async function play(list, i) {
  const s = list[i];
  if (!s || !audio) return;
  clearTimeout(rollTimer);
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
    await audio.play().catch(() => say("浏览器拦住了自动播放，点一下播放键"));
  } catch (e) {
    say(e.message);
  }
  ne("/lyric", { id: s.id })
    .then((d) => cur()?.id === s.id && set({ lrc: parseLrc(d.lrc?.lyric) }))
    .catch(() => {});
}
export function next() {
  if (!st.queue.length) return;
  play(st.queue, (st.idx + 1) % st.queue.length);
}
export function prev() {
  if (!st.queue.length) return;
  play(st.queue, (st.idx - 1 + st.queue.length) % st.queue.length);
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

/* ------------------------------------------------------------ 我的 ♥ / 👎（只存本机） */

export function setMine(v) {
  const s = cur();
  if (!s) return;
  const m = { ...(local.mine || {}) };
  if (m[s.id] === v) delete m[s.id];
  else m[s.id] = v;
  setLocal({ mine: m });
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
  set({ chat: [...st.chat, { id: "u" + Date.now(), role: "user", text }] });
  try {
    const d = await cx("/music/chat", { method: "POST", body: { text, song: s ? brief(s) : {}, lyricLine: lineNow() } });
    if (d.reply) {
      set({ chat: [...st.chat, { id: "c" + Date.now(), role: "character", text: d.reply, kind: "chat" }] });
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
  const maxAt = Math.max(12, Math.min(70, (st.dur || 120) * 0.6));
  const delay = (8 + Math.random() * (maxAt - 8)) * 1000;
  clearTimeout(rollTimer);
  rollTimer = setTimeout(async () => {
    const c = st.mcfg;
    if (!c || cur()?.id !== s.id || audio.paused) return;
    const wantText = Math.random() < c.commentChance;
    const wantAtt = Math.random() < c.attitudeChance;
    const wantSkip = Math.random() < c.skipChance;
    if (!wantText && !wantAtt && !wantSkip) return;
    try {
      const d = await cx("/music/react", {
        method: "POST",
        body: { song: brief(s), lyricLine: lineNow(), position: audio.currentTime, allowSkip: wantSkip, wantText: wantText || wantSkip, wantAttitude: wantAtt },
      });
      set({ att: d.attitudes || st.att });
      if (d.text) {
        set({ chat: [...st.chat, { id: "r" + Date.now(), role: "character", text: d.text, kind: "react" }] });
        showBubble(d.text);
      }
      if (d.skip && cur()?.id === s.id) setTimeout(() => cur()?.id === s.id && next(), 3000);
    } catch (e) {
      say(e.message);
    }
  }, delay);
}
