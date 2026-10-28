/*
 * 他的位置：一张虚构的小镇地图，像两个人互相共享位置那样，把你们俩的小头像放在上面。
 *
 *  - 他在哪：Companion 每隔 2–3 小时（可调）让一个模型按他的日程、时间、人设判断一次；
 *    静默时间里不动、不调模型。他在聊天里也能通过 MCP 自己挪（move_to）、自己加地点。
 *  - 地点：你和他都能加、能改；地图上的位置可以拖（点「挪位置」再点地图）。
 *  - Session：按天看他去过哪些地方，地图上同时画出那天的路线。
 *  - 你的位置：不追踪，手动放在某个地点 / 地图上某一点，或者不显示。
 *
 * 地图本身不存：按种子在本地生成（mapgen.js），同一个种子永远是同一个镇子。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx, imgUrl } from "../api.js";
import { AppFrame, Field, Icon, Loading, Sheet, Toast, Toggle, ago, lsGet, lsSet, md, plusDays, uploadImage, useRemote, useToast, weekday } from "./kit.jsx";
import { WORLD, generateMap, pickSpot } from "./mapgen.js";

export const KINDS = {
  home: ["🏠", "#e7a57c", "家"],
  work: ["💼", "#8ea8d6", "工作"],
  study: ["📚", "#a597d8", "学习"],
  cafe: ["☕", "#c49572", "咖啡"],
  food: ["🍜", "#e2978c", "吃饭"],
  shop: ["🛍️", "#d597be", "购物"],
  park: ["🌳", "#86bb7b", "公园"],
  gym: ["🏋️", "#74b3aa", "运动"],
  bar: ["🍸", "#b086d0", "酒吧"],
  friend: ["👥", "#dcae58", "朋友家"],
  transit: ["🚇", "#98a2ad", "交通"],
  culture: ["🎭", "#c68ca0", "文化"],
  other: ["📍", "#b2a68c", "其他"],
};
const kindOf = (k) => KINDS[k] || KINDS.other;
const BY = { model: "按日程判断", mcp: "他自己说的", user: "你设置的", schedule: "按日程" };
const METERS_PER_UNIT = 4; // 整张图 4 公里见方

/* ═════════════ App ═════════════ */

export function MapApp({ onExit, avatars = {}, providers }) {
  const { data, setData, error, load } = useRemote("/map", 60000);
  const [toastText, toast] = useToast();
  const [tab, setTab] = useState(() => lsGet("uranus.map.tab", "status"));
  const [tall, setTall] = useState(false);
  const [sheet, setSheet] = useState(null); // {kind:'place'|'move'|'me'|'settings'|'visit', ...}
  const [placing, setPlacing] = useState(null); // {what:'place', id} | {what:'me'}
  const [selPlace, setSelPlace] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState("");
  const mapApi = useRef(null);

  useEffect(() => lsSet("uranus.map.tab", tab), [tab]);

  const seed = data?.meta?.seed || 0;
  const town = useMemo(() => (data ? generateMap(seed || 20261028) : null), [seed, !!data]);

  /* 首次用：没有种子就定一个，存到 Companion，所有设备是同一个镇子 */
  useEffect(() => {
    if (data && !data.meta.seed) {
      const s = Math.floor(Math.random() * 2 ** 31);
      cx("/map/meta", { method: "PUT", body: { seed: s } })
        .then((r) => setData((d) => ({ ...d, meta: r.meta })))
        .catch(() => {});
    }
  }, [data, setData]);

  /* 没坐标的地点（他自己加的）/ 换地图后掉进河里的地点：自动找个地方放 */
  const fixing = useRef(false);
  useEffect(() => {
    if (!data || !town || !data.meta.seed || fixing.current) return;
    const bad = data.places.filter((p) => p.x == null || p.y == null || town.distRiver(p.x, p.y) < town.river.w / 2 + 8);
    if (!bad.length) return;
    fixing.current = true;
    (async () => {
      const taken = data.places.filter((p) => p.x != null && !bad.includes(p)).map((p) => ({ x: p.x, y: p.y }));
      const updated = {};
      for (const p of bad) {
        const spot = pickSpot(town, p.kind, taken, hashStr(p.id) + seed);
        taken.push(spot);
        try {
          const r = await cx(`/map/place/${p.id}`, { method: "PATCH", body: spot });
          updated[p.id] = r.place;
        } catch {
          /* 下次再试 */
        }
      }
      setData((d) => ({ ...d, places: d.places.map((p) => updated[p.id] || p) }));
      fixing.current = false;
    })();
  }, [data, town, seed, setData]);

  const name = data?.characterName || "他";
  const me = data?.userName || "我";
  const places = data?.places || [];
  const byId = useMemo(() => Object.fromEntries(places.map((p) => [p.id, p])), [places]);
  const st = data?.state || {};
  const here = byId[st.placeId];
  const meta = data?.meta || {};
  const mePos = meta.me?.visible === false ? null : meta.me?.placeId && byId[meta.me.placeId] ? { x: byId[meta.me.placeId].x, y: byId[meta.me.placeId].y, place: byId[meta.me.placeId] } : meta.me?.x != null ? { x: meta.me.x, y: meta.me.y } : null;
  const himImg = meta.avatarRole ? imgUrl(meta.avatarRole) : avatars.role || "";
  const meImg = meta.avatarUser ? imgUrl(meta.avatarUser) : avatars.user || "";

  /* Session：哪几天有记录 */
  const today = data?.today || "";
  const visits = data?.visits || [];
  const dayList = useMemo(() => {
    const s = new Set(visits.map((v) => v.date));
    if (today) s.add(today);
    return [...s].sort().reverse();
  }, [visits, today]);
  const curDay = day || today;
  const dayVisits = useMemo(() => visitsOn(visits, curDay, today), [visits, curDay, today]);

  const hourNow = Number(String(data?.now || "12:00").slice(0, 2));
  const tint = hourNow >= 20 || hourNow < 6 ? "night" : hourNow >= 18 ? "dusk" : hourNow < 7 ? "dawn" : "";

  async function act(key, fn, ok) {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast(typeof ok === "function" ? ok(r) : ok);
      await load();
      return r;
    } catch (e) {
      toast(e.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function onMapTap(w, target) {
    if (placing) {
      const pos = { x: Math.round(w.x), y: Math.round(w.y) };
      if (town.distRiver(pos.x, pos.y) < town.river.w / 2 + 4) return toast("那是河里，换个地方");
      if (placing.what === "me") await act("me", () => cx("/map/meta", { method: "PUT", body: { me: { placeId: "", ...pos, visible: true } } }), "放好了");
      else await act("place", () => cx(`/map/place/${placing.id}`, { method: "PATCH", body: pos }), "挪好了");
      setPlacing(null);
      return;
    }
    const pid = target?.closest?.("[data-pid]")?.getAttribute("data-pid");
    const who = target?.closest?.("[data-who]")?.getAttribute("data-who");
    if (who === "him" && here) {
      setTab("status");
      return;
    }
    if (pid && byId[pid]) {
      setSelPlace(pid);
      setSheet({ kind: "place", place: byId[pid] });
      return;
    }
    setSelPlace("");
  }

  if (!data || !town) {
    return (
      <AppFrame kicker="find my" title="位置" onExit={onExit} className="la-map">
        <style>{CSS}</style>
        <Loading error={error} retry={load} />
      </AppFrame>
    );
  }

  const route = tab === "session" ? dayVisits.map((v) => byId[v.placeId]).filter((p) => p && p.x != null) : [];
  const fmtT = (ms) => (ms ? new Intl.DateTimeFormat("en-GB", { timeZone: data.tz, hour: "2-digit", minute: "2-digit" }).format(new Date(ms)) : "");
  const dist = here && mePos && here.x != null && mePos.x != null ? Math.hypot(here.x - mePos.x, here.y - mePos.y) * METERS_PER_UNIT : null;

  return (
    <AppFrame
      kicker="find my"
      title={`${name} 在哪`}
      onExit={onExit}
      className="la-map"
      right={
        <button type="button" className="la-ico" onClick={() => setSheet({ kind: "settings" })} aria-label="设置">
          <Icon n="gear" />
        </button>
      }
    >
      <style>{CSS}</style>
      <div className="mp-wrap">
        <TownMap
          town={town}
          places={places}
          here={here}
          mePos={mePos}
          himImg={himImg}
          meImg={meImg}
          name={name}
          me={me}
          selPlace={selPlace}
          route={route}
          tint={tint}
          placing={!!placing}
          onTap={onMapTap}
          apiRef={mapApi}
        />
        {placing && (
          <div className="mp-banner">
            <span>{placing.what === "me" ? "点地图，放你的位置" : `点地图，把「${byId[placing.id]?.name || ""}」挪过去`}</span>
            <button type="button" className="la-btn" onClick={() => setPlacing(null)}>
              取消
            </button>
          </div>
        )}
        <div className="mp-fab">
          {here && (
            <button type="button" onClick={() => mapApi.current?.focus(here.x, here.y, 420)} aria-label={`看${name}`}>
              <Avatar img={himImg} letter={name} size={30} ring="#f1b57a" />
            </button>
          )}
          <button type="button" onClick={() => mapApi.current?.fit()} aria-label="看全图">
            <Icon n="locate" size={20} />
          </button>
        </div>
      </div>

      <div className={`mp-panel${tall ? " tall" : ""}`}>
        <button type="button" className="mp-handle" onClick={() => setTall((v) => !v)} aria-label={tall ? "收起" : "展开"}>
          <i />
        </button>
        <div className="mp-tabs">
          {[
            ["status", "位置"],
            ["places", `地点 ${places.length || ""}`],
            ["session", "Session"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="mp-scroll">
          {tab === "status" && (
            <>
              <div className="mp-person">
                <Avatar img={himImg} letter={name} size={52} ring="#f1b57a" />
                <div className="mp-pinfo">
                  <b>{name}</b>
                  {here ? (
                    <>
                      <div className="mp-where">
                        <span>{kindOf(here.kind)[0]}</span> {here.name}
                      </div>
                      {st.activity && <div className="mp-doing">{st.activity}</div>}
                      <div className="la-meta">
                        {fmtT(Date.parse(st.since))} 到的 · {ago(st.since) === "刚刚" ? "刚到" : `已经 ${ago(st.since)}`} · {BY[st.by] || ""}
                      </div>
                    </>
                  ) : (
                    <div className="la-meta">还不知道他在哪。{places.length ? "点下面「现在更新一次」，或者手动设一个。" : "先去「地点」里加几个他常去的地方。"}</div>
                  )}
                </div>
              </div>
              <div className="mp-next">
                {!data.settings.enabled ? (
                  <span>自动更新没开 · 在右上角设置里打开</span>
                ) : data.quietNow ? (
                  <span>
                    <Icon n="moon" size={14} /> 静默时间，不会动
                  </span>
                ) : (
                  <span>下次自动更新约 {fmtT(st.nextCheckAt) || "马上"}</span>
                )}
                {st.lastReason && <small>上次判断：{st.lastReason}</small>}
                {st.lastError && <small className="la-err">上次出错：{st.lastError.replace(/^\S+\s/, "")}</small>}
              </div>
              <div className="la-row" style={{ marginBottom: 16 }}>
                <button type="button" className="la-btn solid" disabled={!!busy} onClick={() => act("check", () => cx("/map/check", { method: "POST" }), (r) => (r.moved ? `${name} 去了 ${r.place.name}` : `${name} 还在 ${r.place?.name || ""}`)).then((r) => r?.place && mapApi.current?.focus(r.place.x, r.place.y, 420))}>
                  <Icon n="refresh" size={16} /> {busy === "check" ? "判断中…" : "现在更新一次"}
                </button>
                <button type="button" className="la-btn" disabled={!places.length} onClick={() => setSheet({ kind: "move" })}>
                  手动设置
                </button>
              </div>
              <p className="la-meta" style={{ marginTop: -8 }}>「现在更新一次」会调一次模型（大约一两千 token）。</p>

              <div className="mp-person me">
                <Avatar img={meImg} letter={me} size={44} ring="#9cc3e6" />
                <div className="mp-pinfo">
                  <b>{me}（你）</b>
                  <div className="la-meta">{mePos ? (mePos.place ? `在 ${mePos.place.name}` : "在地图上标的位置") : "没有显示在地图上"}</div>
                  {dist != null && <div className="mp-dist">相距 {dist >= 1000 ? `${(dist / 1000).toFixed(1)} 公里` : `${Math.round(dist / 10) * 10} 米`}</div>}
                </div>
                <button type="button" className="la-btn" onClick={() => setSheet({ kind: "me" })}>
                  设置
                </button>
              </div>
            </>
          )}

          {tab === "places" && (
            <>
              <button type="button" className="la-btn block" style={{ marginBottom: 10 }} onClick={() => setSheet({ kind: "place", place: null })}>
                <Icon n="plus" size={16} /> 添加地点
              </button>
              {!places.length && <p className="la-empty">还没有地点。加几个他常去的地方：家、公司、常去的咖啡店……他自己也能在聊天里加。</p>}
              {[...places]
                .sort((a, b) => (a.id === st.placeId ? -1 : b.id === st.placeId ? 1 : Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind) || a.name.localeCompare(b.name)))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`mp-place${selPlace === p.id ? " sel" : ""}`}
                    onClick={() => {
                      setSelPlace(p.id);
                      if (p.x != null) mapApi.current?.focus(p.x, p.y, 380);
                      setSheet({ kind: "place", place: p });
                    }}
                  >
                    <span className="mp-pico" style={{ background: kindOf(p.kind)[1] }}>
                      {kindOf(p.kind)[0]}
                    </span>
                    <span className="mp-pmain">
                      <b>
                        {p.name}
                        {p.id === st.placeId && <em className="mp-here">{name} 在这</em>}
                        {meta.me?.placeId === p.id && <em className="mp-here me">你在这</em>}
                      </b>
                      <small>
                        {kindOf(p.kind)[2]}
                        {p.note ? ` · ${p.note}` : ""}
                      </small>
                    </span>
                    <span className={`mp-by ${p.by}`}>{p.by === "character" ? `${name} 加的` : "你加的"}</span>
                  </button>
                ))}
            </>
          )}

          {tab === "session" && (
            <>
              <div className="mp-days">
                {dayList.map((d) => (
                  <button key={d} type="button" className={d === curDay ? "on" : ""} onClick={() => setDay(d)}>
                    {d === today ? "今天" : d === plusDays(today, -1) ? "昨天" : md(d)}
                    <small>周{weekday(d)}</small>
                  </button>
                ))}
              </div>
              <SessionList
                visits={dayVisits}
                day={curDay}
                today={today}
                byId={byId}
                tz={data.tz}
                currentId={st.visitId}
                name={name}
                onFocus={(p) => p && p.x != null && mapApi.current?.focus(p.x, p.y, 420)}
                onEdit={(v) => setSheet({ kind: "visit", visit: v })}
              />
            </>
          )}
        </div>
      </div>

      {sheet?.kind === "place" && (
        <PlaceSheet
          place={sheet.place}
          name={name}
          isHere={sheet.place?.id === st.placeId}
          onClose={() => (setSheet(null), setSelPlace(""))}
          onSave={async (body) => {
            const r = await act("place", () => (sheet.place ? cx(`/map/place/${sheet.place.id}`, { method: "PATCH", body }) : cx("/map/place", { method: "POST", body })), sheet.place ? "已保存" : "加好了，已经自动放在地图上");
            if (r) setSheet(null);
            if (r?.place && !sheet.place) setSelPlace(r.place.id);
          }}
          onDelete={async () => {
            if (!window.confirm(`删除「${sheet.place.name}」？Session 里的历史记录会保留。`)) return;
            const r = await act("place", () => cx(`/map/place/${sheet.place.id}`, { method: "DELETE" }), "已删除");
            if (r) setSheet(null);
          }}
          onMovePin={() => {
            setPlacing({ what: "place", id: sheet.place.id });
            setSheet(null);
          }}
          onSendHim={() => setSheet({ kind: "move", placeId: sheet.place.id })}
        />
      )}
      {sheet?.kind === "move" && (
        <MoveSheet
          places={places}
          name={name}
          initial={sheet.placeId || st.placeId}
          activity={sheet.placeId && sheet.placeId !== st.placeId ? "" : st.activity}
          busy={busy === "move"}
          onClose={() => setSheet(null)}
          onMove={async (placeId, activity) => {
            const r = await act("move", () => cx("/map/move", { method: "POST", body: { placeId, activity } }), `${name} 现在在 ${byId[placeId]?.name}`);
            if (r) {
              setSheet(null);
              setTab("status");
              const p = byId[placeId];
              if (p?.x != null) mapApi.current?.focus(p.x, p.y, 420);
            }
          }}
        />
      )}
      {sheet?.kind === "me" && (
        <MeSheet
          places={places}
          meta={meta}
          onClose={() => setSheet(null)}
          onPick={async (body) => {
            const r = await act("me", () => cx("/map/meta", { method: "PUT", body: { me: body } }), "已更新");
            if (r) setSheet(null);
          }}
          onDropPin={() => {
            setPlacing({ what: "me" });
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "visit" && (
        <VisitSheet
          visit={sheet.visit}
          current={sheet.visit.id === st.visitId}
          onClose={() => setSheet(null)}
          onSave={async (body) => {
            const r = await act("visit", () => cx(`/map/visit/${sheet.visit.id}`, { method: "PATCH", body }), "已保存");
            if (r) setSheet(null);
          }}
          onDelete={async () => {
            if (!window.confirm("删掉这一段记录？")) return;
            const r = await act("visit", () => cx(`/map/visit/${sheet.visit.id}`, { method: "DELETE" }), "已删除");
            if (r) setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "settings" && (
        <MapSettingsSheet
          data={data}
          providers={providers}
          name={name}
          me={me}
          avatars={{ him: himImg, me: meImg }}
          onClose={() => setSheet(null)}
          toast={toast}
          reload={load}
        />
      )}
      <Toast text={toastText} />
    </AppFrame>
  );
}

function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** 和这一天有交集的所有停留段（跨天的那段两天都算） */
function visitsOn(visits, d, today) {
  return visits
    .filter((v) => {
      const endD = v.end ? v.endDate || v.date : today;
      return v.date <= d && endD >= d;
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/* ═════════════ 地图画布 ═════════════ */

function TownMap({ town, places, here, mePos, himImg, meImg, name, me, selPlace, route, tint, placing, onTap, apiRef }) {
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ W: 390, H: 400 });
  const [vb, setVb] = useState(null);
  const vbRef = useRef(null);
  vbRef.current = vb;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const anim = useRef(0);

  const clamp = useCallback((v) => {
    const { W, H } = sizeRef.current;
    const w = Math.max(150, Math.min(1500, v.w));
    const h = (w * H) / W;
    const x = Math.max(-w * 0.45, Math.min(WORLD - w * 0.55, v.x));
    const y = Math.max(-h * 0.45, Math.min(WORLD - h * 0.55, v.y));
    return { x, y, w };
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ W: r.width, H: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tween = useCallback(
    (to) => {
      cancelAnimationFrame(anim.current);
      const from = vbRef.current || to;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3);
        setVb(clamp({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e }));
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [clamp]
  );

  const focus = useCallback(
    (x, y, w) => {
      const { W, H } = sizeRef.current;
      const ww = w || vbRef.current?.w || 500;
      const hh = (ww * H) / W;
      tween({ x: x - ww / 2, y: y - hh * 0.46, w: ww });
    },
    [tween]
  );
  const fit = useCallback(() => {
    const { W, H } = sizeRef.current;
    const w = W / H > 1 ? (WORLD * W) / H : WORLD * 1.02;
    tween({ x: WORLD / 2 - w / 2, y: WORLD / 2 - (w * H) / W / 2, w });
  }, [tween]);
  apiRef.current = { focus, fit };

  /* 第一次：对准他（没有就看全图） */
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || !size.W) return;
    inited.current = true;
    const { W, H } = size;
    if (here?.x != null) {
      const w = 460;
      setVb(clamp({ x: here.x - w / 2, y: here.y - ((w * H) / W) * 0.46, w }));
    } else {
      const w = W / H > 1 ? (WORLD * W) / H : WORLD * 1.02;
      setVb(clamp({ x: WORLD / 2 - w / 2, y: WORLD / 2 - (w * H) / W / 2, w }));
    }
  }, [size, here, clamp]);

  /* 手势：单指拖、双指缩放、点一下 */
  const ptrs = useRef(new Map());
  const g = useRef(null);
  const toWorld = (px, py, v = vbRef.current) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: v.x + ((px - r.left) / r.width) * v.w, y: v.y + ((py - r.top) / r.width) * v.w };
  };
  function down(e) {
    cancelAnimationFrame(anim.current);
    try {
      svgRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) g.current = { type: "pan", sx: e.clientX, sy: e.clientY, vb0: vbRef.current, moved: 0, target: e.target, t: Date.now() };
    else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      g.current = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), world: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), vb0: vbRef.current, moved: 99 };
    }
  }
  function move(e) {
    if (!ptrs.current.has(e.pointerId) || !g.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svgRef.current.getBoundingClientRect();
    const G = g.current;
    if (G.type === "pan" && ptrs.current.size === 1) {
      const dx = e.clientX - G.sx, dy = e.clientY - G.sy;
      G.moved = Math.max(G.moved, Math.hypot(dx, dy));
      const k = G.vb0.w / r.width;
      setVb(clamp({ x: G.vb0.x - dx * k, y: G.vb0.y - dy * k, w: G.vb0.w }));
    } else if (G.type === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const w = Math.max(150, Math.min(1500, (G.vb0.w * G.d0) / d));
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      setVb(clamp({ x: G.world.x - (mx / r.width) * w, y: G.world.y - (my / r.width) * w, w }));
    }
  }
  function up(e) {
    const G = g.current;
    ptrs.current.delete(e.pointerId);
    if (G?.type === "pan" && G.moved < 7 && Date.now() - G.t < 600) onTap(toWorld(e.clientX, e.clientY, G.vb0), G.target);
    if (ptrs.current.size === 1) {
      const [p] = [...ptrs.current.values()];
      g.current = { type: "pan", sx: p.x, sy: p.y, vb0: vbRef.current, moved: 99, t: 0 };
    } else if (!ptrs.current.size) g.current = null;
  }
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const wheel = (e) => {
      e.preventDefault();
      const v = vbRef.current;
      if (!v) return;
      const wpt = toWorld(e.clientX, e.clientY, v);
      const w = Math.max(150, Math.min(1500, v.w * Math.exp(e.deltaY * 0.0015)));
      const r = el.getBoundingClientRect();
      setVb(clamp({ x: wpt.x - ((e.clientX - r.left) / r.width) * w, y: wpt.y - ((e.clientY - r.top) / r.width) * w, w }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamp]);

  const base = useMemo(() => <TownBase town={town} />, [town]);

  const v = vb || { x: 0, y: 0, w: WORLD };
  const h = (v.w * size.H) / size.W;
  const k = v.w / size.W; // 一个屏幕像素 = k 个世界单位：图钉按这个反向缩放，大小不随缩放变
  const showLabels = v.w < 640;

  // 他和你在同一个地方时错开一点
  const same = here && mePos && here.x != null && Math.hypot(here.x - mePos.x, here.y - mePos.y) < 26 * k;

  return (
    <div className={`mp-map ${tint}${placing ? " placing" : ""}`} ref={boxRef}>
      <svg ref={svgRef} viewBox={`${v.x} ${v.y} ${v.w} ${h}`} preserveAspectRatio="xMidYMid slice" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="小镇地图">
        <defs>
          <clipPath id="la-clip" clipPathUnits="objectBoundingBox">
            <circle cx=".5" cy=".5" r=".5" />
          </clipPath>
          <filter id="la-sh" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#3b2a14" floodOpacity=".35" />
          </filter>
        </defs>
        {base}
        {tint && <rect x="-500" y="-500" width="2000" height="2000" className={`mp-tint ${tint}`} pointerEvents="none" />}

        {route.length > 1 && (
          <g pointerEvents="none">
            <polyline points={route.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeWidth={7 * k} strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
            <polyline points={route.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#e1785d" strokeWidth={3.2 * k} strokeDasharray={`${7 * k} ${5 * k}`} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )}

        {places.map((p) =>
          p.x == null || p.id === here?.id ? null : (
            <g key={p.id} data-pid={p.id} transform={`translate(${p.x} ${p.y}) scale(${k})`} className={`mp-pin${selPlace === p.id ? " sel" : ""}`}>
              <circle r="22" fill="transparent" />
              <circle r={selPlace === p.id ? 16 : 13} fill={kindOf(p.kind)[1]} stroke="#fffdf8" strokeWidth="2.5" filter="url(#la-sh)" />
              <text y="4.6" textAnchor="middle" fontSize={selPlace === p.id ? 15 : 12.5}>
                {kindOf(p.kind)[0]}
              </text>
              {(showLabels || selPlace === p.id) && (
                <text y="29" textAnchor="middle" className="mp-label">
                  {p.name}
                </text>
              )}
            </g>
          )
        )}
        {route.map((p, i) => (
          <g key={`r${i}`} transform={`translate(${p.x + 11 * k} ${p.y - 11 * k}) scale(${k})`} pointerEvents="none">
            <circle r="8" fill="#e1785d" stroke="#fff" strokeWidth="1.5" />
            <text y="3.6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              {i + 1}
            </text>
          </g>
        ))}

        {mePos && mePos.x != null && (
          <g transform={`translate(${mePos.x} ${mePos.y}) scale(${k}) translate(${same ? -22 : 0} ${same ? 6 : 0})`} data-who="me" pointerEvents="none">
            <AvatarPin img={meImg} letter={me} r={15} ring="#7fb3e3" />
          </g>
        )}
        {here?.x != null && (
          <g transform={`translate(${here.x} ${here.y}) scale(${k}) translate(${same ? 14 : 0} ${same ? -8 : 0})`} data-who="him" className="mp-him">
            <circle r="20" className="mp-pulse" />
            <circle r="20" className="mp-pulse two" />
            <AvatarPin img={himImg} letter={name} r={19} ring="#f0a86d" />
            <g transform="translate(0 33)">
              <rect x={-Math.max(22, name.length * 4.2 + 10)} y="-10" width={Math.max(44, name.length * 8.4 + 20)} height="19" rx="9.5" fill="#2a2321" opacity=".88" />
              <text y="3.6" textAnchor="middle" className="mp-name">
                {name}
              </text>
            </g>
          </g>
        )}
      </svg>
      <div className="mp-scale" aria-hidden>
        <i style={{ width: `${Math.round(250 / METERS_PER_UNIT / k)}px` }} />
        <span>250 m</span>
      </div>
      <svg className="mp-compass" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="18" fill="#fffdf6e6" stroke="#cdbfa6" />
        <path d="M20 6l4.5 14h-9z" fill="#d46d55" />
        <path d="M20 34l-4.5-14h9z" fill="#9b8f7b" />
        <text x="20" y="5.2" textAnchor="middle" fontSize="5.5" fill="#6d604c" fontWeight="700">
          N
        </text>
      </svg>
    </div>
  );
}

function TownBase({ town }) {
  const minor = town.streets.filter((s) => !s.major), major = town.streets.filter((s) => s.major);
  return (
    <g>
      <rect x="-600" y="-600" width="2200" height="2200" fill="#ede4d3" />
      <rect x="-600" y="-600" width="2200" height="2200" fill="url(#la-paper)" opacity=".5" />
      <defs>
        <pattern id="la-paper" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r=".7" fill="#d8ccb6" />
          <circle cx="7" cy="7.5" r=".5" fill="#ddd2be" />
        </pattern>
        <pattern id="la-grass" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M2 9l1.4-3M7 5l1.2-2.6M9.5 11l1-2.2" stroke="#b6cf9f" strokeWidth=".9" />
        </pattern>
      </defs>
      {town.blocks.map((b, i) =>
        b.type === "park" || b.type === "green" ? (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="7" fill={b.type === "park" ? "#cfe1bb" : "#d6e5c3"} />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="7" fill="url(#la-grass)" />
            {b.paths?.map((d, j) => (
              <path key={j} d={d} fill="none" stroke="#f3ecdc" strokeWidth="4" strokeLinecap="round" />
            ))}
            {b.pond && (
              <>
                <ellipse cx={b.pond.cx} cy={b.pond.cy} rx={b.pond.rx + 3} ry={b.pond.ry + 3} fill="#bfd6cf" />
                <ellipse cx={b.pond.cx} cy={b.pond.cy} rx={b.pond.rx} ry={b.pond.ry} fill="#a7cad6" />
                <path d={`M${b.pond.cx - b.pond.rx * 0.5},${b.pond.cy - b.pond.ry * 0.2} q${b.pond.rx * 0.25},-4 ${b.pond.rx * 0.5},0`} stroke="#d7eaf0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </>
            )}
          </g>
        ) : b.type === "plaza" ? (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="5" fill="#e9e0cd" />
            <rect x={b.x + 6} y={b.y + 6} width={b.w - 12} height={b.h - 12} rx="4" fill="none" stroke="#dacfb9" strokeDasharray="3 4" />
            <circle cx={b.cx} cy={b.cy} r={Math.min(b.w, b.h) * 0.13} fill="#bcd5dc" stroke="#d8ccb4" strokeWidth="3" />
          </g>
        ) : (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="5" fill="#e5dac6" />
            {b.buildings.map((s, j) => (
              <g key={j}>
                <rect x={s.x + 1.6} y={s.y + 2} width={s.w} height={s.h} rx="2" fill="#bba98a" opacity=".35" />
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="2" fill={s.fill} stroke="#cdb99a" strokeWidth=".7" />
                {s.ridge === "h" ? <line x1={s.x + 3} y1={s.y + s.h / 2} x2={s.x + s.w - 3} y2={s.y + s.h / 2} stroke={s.roof} strokeWidth="1.3" /> : <line x1={s.x + s.w / 2} y1={s.y + 3} x2={s.x + s.w / 2} y2={s.y + s.h - 3} stroke={s.roof} strokeWidth="1.3" />}
              </g>
            ))}
          </g>
        )
      )}
      {town.blocks.flatMap((b, i) =>
        b.trees.map((t, j) => (
          <g key={`t${i}-${j}`}>
            <circle cx={t.x + 1} cy={t.y + 1.6} r={t.r} fill="#8aa874" opacity=".35" />
            <circle cx={t.x} cy={t.y} r={t.r} fill={(i + j) % 3 ? "#a8c98f" : "#97bd7f"} stroke="#87aa70" strokeWidth=".8" />
            <circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.3} r={t.r * 0.35} fill="#c2dbad" opacity=".7" />
          </g>
        ))
      )}
      {minor.map((s, i) => (
        <line key={`mc${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#d6c9b2" strokeWidth={s.w + 3} />
      ))}
      {minor.map((s, i) => (
        <line key={`mf${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fbf7ee" strokeWidth={s.w} />
      ))}
      <path d={town.river.d} fill="none" stroke="#c9dccf" strokeWidth={town.river.w + 16} strokeLinecap="round" />
      <path d={town.river.d} fill="none" stroke="#a6c8d5" strokeWidth={town.river.w} strokeLinecap="round" />
      <path d={town.river.d} fill="none" stroke="#bad5df" strokeWidth={town.river.w * 0.45} strokeLinecap="round" opacity=".7" />
      <path d={town.river.d} fill="none" stroke="#e1eef2" strokeWidth="1.4" strokeDasharray="14 22" opacity=".9" />
      {major.map((s, i) => (
        <line key={`Mc${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#cdbb9b" strokeWidth={s.w + 4} />
      ))}
      {major.map((s, i) => (
        <g key={`Mf${i}`}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fdf3dc" strokeWidth={s.w} />
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ecd9b2" strokeWidth="1" strokeDasharray="10 9" />
        </g>
      ))}
      {town.bridges.map((b, i) => (
        <g key={`b${i}`}>
          {b.horizontal ? (
            <>
              <line x1={b.x - town.river.w * 0.75} y1={b.y - b.w / 2 - 2.5} x2={b.x + town.river.w * 0.75} y2={b.y - b.w / 2 - 2.5} stroke="#9f8a6a" strokeWidth="2.2" strokeLinecap="round" />
              <line x1={b.x - town.river.w * 0.75} y1={b.y + b.w / 2 + 2.5} x2={b.x + town.river.w * 0.75} y2={b.y + b.w / 2 + 2.5} stroke="#9f8a6a" strokeWidth="2.2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1={b.x - b.w / 2 - 2.5} y1={b.y - town.river.w * 0.75} x2={b.x - b.w / 2 - 2.5} y2={b.y + town.river.w * 0.75} stroke="#9f8a6a" strokeWidth="2.2" strokeLinecap="round" />
              <line x1={b.x + b.w / 2 + 2.5} y1={b.y - town.river.w * 0.75} x2={b.x + b.w / 2 + 2.5} y2={b.y + town.river.w * 0.75} stroke="#9f8a6a" strokeWidth="2.2" strokeLinecap="round" />
            </>
          )}
        </g>
      ))}
    </g>
  );
}

function AvatarPin({ img, letter, r, ring }) {
  return (
    <g filter="url(#la-sh)">
      <circle r={r + 3} fill="#fffdf8" />
      <circle r={r + 1.2} fill={ring} />
      {img ? (
        <image href={img} x={-r} y={-r} width={r * 2} height={r * 2} clipPath="url(#la-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle r={r} fill="#3a302d" />
          <text y={r * 0.36} textAnchor="middle" fontSize={r * 0.95} fill="#fff" fontFamily="Georgia,serif">
            {[...String(letter || "?")][0].toUpperCase()}
          </text>
        </>
      )}
    </g>
  );
}

function Avatar({ img, letter, size = 40, ring }) {
  return (
    <span className="mp-av" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }}>
      {img ? <img src={img} alt="" /> : <b style={{ fontSize: size * 0.42 }}>{[...String(letter || "?")][0].toUpperCase()}</b>}
    </span>
  );
}

/* ═════════════ Session ═════════════ */

function SessionList({ visits, day, today, byId, tz, currentId, name, onFocus, onEdit }) {
  if (!visits.length) return <p className="la-empty">这天没有记录。</p>;
  const nowMs = Date.now();
  // 只算落在这一天里的那部分（跨天的那段别把前一晚也算进来）
  const d0 = Date.parse(`${day}T00:00:00`), d1 = d0 + 86400000;
  const longest = visits.reduce((a, v) => {
    const d = Math.min(v.end ? Date.parse(v.end) : nowMs, d1) - Math.max(Date.parse(v.start), d0);
    return d > a.d ? { d, v } : a;
  }, { d: 0, v: null });
  const uniq = new Set(visits.map((v) => v.placeId)).size;
  return (
    <>
      <p className="mp-sum">
        {day === today ? "今天" : md(day)} 去了 <b>{uniq}</b> 个地方{longest.v ? <> · 在 {longest.v.placeName} 待得最久</> : null}
      </p>
      <ol className="mp-tl">
        {visits.map((v, i) => {
          const p = byId[v.placeId];
          const from = v.date < day ? "前一天" : v.startTime;
          const to = !v.end ? "现在" : (v.endDate || v.date) > day ? "次日" : v.endTime;
          const mins = Math.round(((v.end ? Date.parse(v.end) : nowMs) - Date.parse(v.start)) / 60000);
          const live = v.id === currentId;
          return (
            <li key={v.id} className={live ? "live" : ""}>
              <span className="mp-tdot" style={{ background: kindOf(v.kind || p?.kind)[1] }}>
                {i + 1}
              </span>
              <button type="button" className="mp-tbody" onClick={() => onFocus(p)}>
                <span className="mp-ttime">
                  {from} – {to} <em>{mins >= 60 ? `${Math.floor(mins / 60)} 小时${mins % 60 ? ` ${mins % 60} 分` : ""}` : `${Math.max(mins, 1)} 分钟`}</em>
                </span>
                <b>
                  {kindOf(v.kind || p?.kind)[0]} {p?.name || v.placeName}
                  {live && <i className="mp-livebadge">{name} 在这</i>}
                </b>
                {v.activity && <span className="mp-tact">{v.activity}</span>}
                {(v.log || []).length > 1 && (
                  <span className="mp-tlog">
                    {v.log.map((l, j) => (
                      <span key={j}>
                        {l.time} {l.activity}
                      </span>
                    ))}
                  </span>
                )}
                {v.note && <span className="mp-tnote">{v.note}</span>}
                <span className="mp-tby">{BY[v.by] || ""}</span>
              </button>
              <button type="button" className="la-ico sm" onClick={() => onEdit(v)} aria-label="编辑">
                <Icon n="edit" size={15} />
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ═════════════ 弹出面板 ═════════════ */

function KindPicker({ value, onChange }) {
  return (
    <div className="mp-kinds">
      {Object.entries(KINDS).map(([k, [emo, color, label]]) => (
        <button key={k} type="button" className={value === k ? "on" : ""} style={{ "--c": color }} onClick={() => onChange(k)}>
          <span>{emo}</span>
          <small>{label}</small>
        </button>
      ))}
    </div>
  );
}

function PlaceSheet({ place, name, isHere, onClose, onSave, onDelete, onMovePin, onSendHim }) {
  const [f, setF] = useState({ name: place?.name || "", kind: place?.kind || "other", note: place?.note || "" });
  return (
    <Sheet
      title={place ? place.name : "添加地点"}
      onClose={onClose}
      footer={
        <button type="button" className="la-btn solid" disabled={!f.name.trim()} onClick={() => onSave({ name: f.name.trim(), kind: f.kind, note: f.note.trim() })}>
          {place ? "保存" : "添加"}
        </button>
      }
    >
      {place && (
        <p className="la-meta" style={{ marginTop: 0 }}>
          {place.by === "character" ? `${name} 加的` : "你加的"}
          {place.editedBy && place.editedBy !== place.by ? ` · 最近一次是${place.editedBy === "character" ? ` ${name} ` : "你"}改的` : ""}
          {isHere ? ` · ${name} 现在在这` : ""}
        </p>
      )}
      <Field label="名字">
        <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="比如：公司 / Blue Bottle / 他家" />
      </Field>
      <Field label="类型">
        <KindPicker value={f.kind} onChange={(kind) => setF({ ...f, kind })} />
      </Field>
      <Field label="备注" hint={`写给模型看的，比如「工作日 9 点到 6 点在这」「周末早上常来」。${name} 也能看到。`}>
        <textarea value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ minHeight: 70 }} />
      </Field>
      {place && (
        <div className="mp-sheetacts">
          <button type="button" className="la-btn" onClick={onMovePin}>
            <Icon n="pin" size={16} /> 在地图上挪位置
          </button>
          {!isHere && (
            <button type="button" className="la-btn" onClick={onSendHim}>
              让 {name} 现在在这
            </button>
          )}
          <button type="button" className="la-btn ghost danger" onClick={onDelete} disabled={isHere} title={isHere ? "他现在在这，不能删" : ""}>
            <Icon n="trash" size={16} /> 删除
          </button>
        </div>
      )}
      {!place && <p className="la-meta">添加后会自动放在地图上一个合适的位置（公园类放进公园），之后可以点「在地图上挪位置」调整。</p>}
    </Sheet>
  );
}

function MoveSheet({ places, name, initial, activity, busy, onClose, onMove }) {
  const [pid, setPid] = useState(initial || places[0]?.id || "");
  const [act, setAct] = useState(activity || "");
  return (
    <Sheet
      title={`${name} 现在在哪`}
      onClose={onClose}
      footer={
        <button type="button" className="la-btn solid" disabled={!pid || busy} onClick={() => onMove(pid, act.trim())}>
          {busy ? "设置中…" : "就这样"}
        </button>
      }
    >
      <div className="mp-pickl">
        {places.map((p) => (
          <button key={p.id} type="button" className={pid === p.id ? "on" : ""} onClick={() => setPid(p.id)}>
            <span>{kindOf(p.kind)[0]}</span> {p.name}
          </button>
        ))}
      </div>
      <Field label="在做什么（可以不填）">
        <input value={act} maxLength={120} onChange={(e) => setAct(e.target.value)} placeholder="比如：开会 / 看书 / 发呆" />
      </Field>
      <p className="la-meta">手动设置以后，自动判断照常进行（到点会重新判断一次）。</p>
    </Sheet>
  );
}

function MeSheet({ places, meta, onClose, onPick, onDropPin }) {
  const cur = meta.me || {};
  return (
    <Sheet title="你的位置" onClose={onClose}>
      <p className="la-meta" style={{ marginTop: 0 }}>
        不会读取你手机的真实定位。选一个地点，或者在地图上点一下，或者干脆不显示。
      </p>
      <div className="mp-pickl">
        {places.map((p) => (
          <button key={p.id} type="button" className={cur.visible !== false && cur.placeId === p.id ? "on" : ""} onClick={() => onPick({ placeId: p.id, x: null, y: null, visible: true })}>
            <span>{kindOf(p.kind)[0]}</span> {p.name}
          </button>
        ))}
      </div>
      <div className="mp-sheetacts">
        <button type="button" className="la-btn" onClick={onDropPin}>
          <Icon n="pin" size={16} /> 在地图上点一下
        </button>
        <button type="button" className={`la-btn${cur.visible === false ? " solid" : ""}`} onClick={() => onPick({ visible: false })}>
          不显示我
        </button>
      </div>
    </Sheet>
  );
}

function VisitSheet({ visit, current, onClose, onSave, onDelete }) {
  const [a, setA] = useState(visit.activity || "");
  const [n, setN] = useState(visit.note || "");
  return (
    <Sheet
      title={visit.placeName}
      onClose={onClose}
      footer={
        <button type="button" className="la-btn solid" onClick={() => onSave({ activity: a.trim(), note: n.trim() })}>
          保存
        </button>
      }
    >
      <p className="la-meta" style={{ marginTop: 0 }}>
        {md(visit.date)} {visit.startTime} – {visit.end ? `${visit.endDate && visit.endDate !== visit.date ? md(visit.endDate) + " " : ""}${visit.endTime}` : "现在"} · {BY[visit.by] || ""}
      </p>
      <Field label="在做什么">
        <input value={a} maxLength={160} onChange={(e) => setA(e.target.value)} />
      </Field>
      <Field label="备注（只是给你自己看的）">
        <textarea value={n} maxLength={400} onChange={(e) => setN(e.target.value)} style={{ minHeight: 64 }} />
      </Field>
      {!current && (
        <button type="button" className="la-btn ghost danger" onClick={onDelete}>
          <Icon n="trash" size={16} /> 删掉这一段
        </button>
      )}
    </Sheet>
  );
}

/* ═════════════ 设置 ═════════════ */

function MapSettingsSheet({ data, providers, name, me, avatars, onClose, toast, reload }) {
  const [busy, setBusy] = useState("");
  const himRef = useRef(null), meRef = useRef(null);
  async function avatar(which, f) {
    if (!f) return;
    setBusy(which);
    try {
      const id = await uploadImage(f, 360);
      await cx("/map/meta", { method: "PUT", body: { [which]: id } });
      await reload();
      toast("头像换好了");
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Sheet title="位置设置" onClose={onClose} tall>
      <MapModelForm initial={data.settings} profiles={data.profiles || []} mainProfileId={data.mainProfileId} providers={providers} name={name} toast={toast} onSaved={reload} />

      <h4 className="mp-h">地图</h4>
      <div className="mp-avs">
        {[
          ["avatarRole", name, avatars.him, himRef, "#f0a86d"],
          ["avatarUser", me, avatars.me, meRef, "#7fb3e3"],
        ].map(([key, label, img, ref, ring]) => (
          <div key={key}>
            <Avatar img={img} letter={label} size={52} ring={ring} />
            <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => (avatar(key, e.target.files?.[0]), (e.target.value = ""))} />
            <button type="button" className="la-btn" disabled={!!busy} onClick={() => ref.current?.click()}>
              {busy === key ? "上传中…" : `换${label}的头像`}
            </button>
            {data.meta[key] && (
              <button
                type="button"
                className="la-btn ghost"
                onClick={async () => {
                  await cx("/map/meta", { method: "PUT", body: { [key]: "" } });
                  reload();
                }}
              >
                用回默认
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="la-meta">默认用 Uranus 主屏幕上那两个头像；在这里换的只用在地图上，换设备也在。</p>
      <button
        type="button"
        className="la-btn"
        style={{ marginTop: 6 }}
        onClick={async () => {
          if (!window.confirm("换一张新的小镇地图？地点会保留原来的坐标，落进河里的会自动挪到岸上。")) return;
          await cx("/map/meta", { method: "PUT", body: { seed: Math.floor(Math.random() * 2 ** 31) } });
          await reload();
          toast("换了一个镇子");
        }}
      >
        换一张地图
      </button>
    </Sheet>
  );
}

/**
 * 「位置更新」的设置：开关、模型、频率、静默时间。
 * 地图 App 的设置和 Companion 设置页里的「地图」卡片用的是同一个组件，存的也是同一份（/map/settings）。
 */
export function MapModelForm({ initial, profiles, mainProfileId, providers: givenProviders, name = "他", toast, onSaved }) {
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState(givenProviders || null);
  const [provErr, setProvErr] = useState("");
  const set = (k, v) => setS((cur) => ({ ...cur, [k]: v }));

  useEffect(() => {
    if (s.source !== "uranus" || providers) return;
    cx("/uranus/providers")
      .then((r) => setProviders(r.providers || []))
      .catch((e) => (setProvErr(e.message), setProviders([])));
  }, [s.source, providers]);

  const okProviders = (providers || []).filter((p) => !p.type || p.type === "custom" || p.type === "openai");
  const picked = okProviders.find((p) => p.id === s.uranusProviderId);
  const main = profiles.find((p) => p.id === mainProfileId);

  async function save() {
    if (Number(s.maxHours) < Number(s.minHours)) return toast("「最长」不能比「最短」短");
    setBusy(true);
    try {
      const r = await cx("/map/settings", { method: "PUT", body: s });
      setS(r.settings);
      toast("已保存");
      onSaved?.(r.settings);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-form">
      <Toggle checked={s.enabled} onChange={(v) => set("enabled", v)} label={`自动更新${name}的位置`} hint="到点让模型按他的日程、时间、人设判断他在哪。关掉以后只有你手动设置、或者他在聊天里自己挪（MCP）才会动。" />
      <Field label="用哪个模型">
        <select value={s.source === "uranus" ? "uranus" : "profile"} onChange={(e) => set("source", e.target.value)}>
          <option value="profile">Companion 里的模型</option>
          <option value="uranus">Uranus「连接」里的模型</option>
        </select>
      </Field>
      {s.source !== "uranus" ? (
        <Field label="Companion 模型" hint="位置判断用不着很聪明的模型，选一个便宜快的就够了。">
          <select value={s.profileId || ""} onChange={(e) => set("profileId", e.target.value)}>
            <option value="">跟随 Companion 主模型{main ? `（${main.name}）` : ""}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.model && p.model !== p.name ? ` · ${p.model}` : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="la-two">
          <Field label="连接">
            <select value={s.uranusProviderId || ""} onChange={(e) => setS({ ...s, uranusProviderId: e.target.value, model: "" })}>
              <option value="">{providers ? "选一个…" : "读取中…"}</option>
              {okProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name?.trim() || p.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="模型">
            <select value={s.model || ""} onChange={(e) => set("model", e.target.value)}>
              <option value="">选一个…</option>
              {(picked?.models || [])
                .filter((m) => m?.model)
                .map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.alias?.trim() || m.model}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      )}
      {provErr && <p className="la-err">读不到 Uranus 的连接：{provErr}</p>}
      <div className="la-two">
        <Field label="最短隔多久（小时）">
          <input type="number" min="0.5" max="12" step="0.5" value={s.minHours} onChange={(e) => set("minHours", e.target.value)} />
        </Field>
        <Field label="最长隔多久（小时）">
          <input type="number" min="0.5" max="24" step="0.5" value={s.maxHours} onChange={(e) => set("maxHours", e.target.value)} />
        </Field>
      </div>
      <p className="la-meta" style={{ marginTop: -6 }}>每次在这个范围里随机挑；模型觉得他会待很久（比如开会到 5 点）时会往长了取。一次大约一两千 token。</p>

      <div className="la-field">
        <span>静默时间（这段时间里不动、不调模型）</span>
        {(s.quiet || []).map((q, i) => (
          <div key={i} className="mp-quiet">
            <input type="time" value={q.start} onChange={(e) => set("quiet", s.quiet.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <span>到</span>
            <input type="time" value={q.end} onChange={(e) => set("quiet", s.quiet.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <button type="button" className="la-ico sm" onClick={() => set("quiet", s.quiet.filter((_, j) => j !== i))} aria-label="删掉这段">
              <Icon n="close" size={16} />
            </button>
          </div>
        ))}
        {(s.quiet || []).length < 4 && (
          <button type="button" className="la-btn ghost" onClick={() => set("quiet", [...(s.quiet || []), { start: "13:00", end: "14:00" }])}>
            <Icon n="plus" size={15} /> 加一段
          </button>
        )}
        <small>跨午夜的写法：23:30 到 08:00。按 Companion 设置里的时区算。</small>
      </div>

      <Toggle checked={s.allowNewPlaces} onChange={(v) => set("allowNewPlaces", v)} label={`允许${name}自己加新地点`} hint="模型判断时、或者他在聊天里用 MCP 去一个没登记过的地方时，自动加进地点表。" />
      <Toggle checked={s.syncToUranus} onChange={(v) => set("syncToUranus", v)} label="位置变了告诉 Uranus" hint="作为背景信息同步（一句话，不花 token、不会逼他回消息），这样他在聊天里说的和地图对得上。他自己挪的不重复同步。" />
      <Toggle checked={s.usePersona} onChange={(v) => set("usePersona", v)} label="判断时带上人设" hint="用 Companion 设置里的角色人设（截前 1200 字）。关掉更省 token，但判断会更「泛」。" />
      <Field label="「在做什么」用什么语言（留空 = 跟地点名一样）">
        <input value={s.language || ""} placeholder="中文 / English" onChange={(e) => set("language", e.target.value)} />
      </Field>
      <button type="button" className="la-btn solid block" disabled={busy} onClick={save}>
        {busy ? "保存中…" : "保存位置设置"}
      </button>
    </div>
  );
}

const CSS = `
.la-map{--ac:#f0b47e;--ac-ink:#2b1d12;background:#14141a}
.mp-wrap{position:relative;flex:1;min-height:0}
.mp-map{position:absolute;inset:0;overflow:hidden;background:#ede4d3;touch-action:none}
.mp-map svg:first-child{width:100%;height:100%;display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none}
.mp-map.placing svg:first-child{cursor:crosshair}
.mp-tint{mix-blend-mode:multiply;transition:opacity 1s}
.mp-tint.night{fill:#33427e;opacity:.34}
.mp-tint.dusk{fill:#e7a37a;opacity:.18}
.mp-tint.dawn{fill:#9aa7d6;opacity:.2}
.mp-label{font:600 11px -apple-system,"PingFang SC",sans-serif;fill:#3b3127;paint-order:stroke;stroke:#fffaf0;stroke-width:3.4px;stroke-linejoin:round}
.mp-name{font:600 11px -apple-system,"PingFang SC",sans-serif;fill:#fff}
.mp-pin{cursor:pointer}
.mp-pulse{fill:#f0a86d;opacity:0;animation:mpPulse 2.6s ease-out infinite;transform-box:fill-box;transform-origin:center}
.mp-pulse.two{animation-delay:1.3s}
@keyframes mpPulse{0%{opacity:.5;transform:scale(1)}100%{opacity:0;transform:scale(2.4)}}
.mp-scale{position:absolute;left:12px;bottom:30px;display:flex;flex-direction:column;gap:2px;font-size:10px;color:#5d5243;pointer-events:none}
.mp-scale i{display:block;height:5px;border:1.5px solid #6d604c;border-top:0}
.mp-compass{position:absolute;right:12px;bottom:28px;width:36px;height:36px;pointer-events:none}
.mp-banner{position:absolute;left:12px;right:12px;top:10px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 8px 8px 14px;border-radius:16px;background:#1d1b20e6;color:#fff;font-size:13px;box-shadow:0 8px 24px #0005}
.mp-fab{position:absolute;right:12px;top:10px;z-index:2;display:flex;flex-direction:column;gap:8px}
.mp-fab button{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#fffdf7f0!important;color:#4c4134;box-shadow:0 6px 18px #0003}
.mp-panel{flex:none;position:relative;z-index:4;height:46%;display:flex;flex-direction:column;margin-top:-18px;border-radius:22px 22px 0 0;background:linear-gradient(180deg,#22212a,#18181f);border-top:1px solid #ffffff1c;box-shadow:0 -14px 40px #0006;transition:height .28s cubic-bezier(.2,.8,.2,1)}
.mp-panel.tall{height:78%}
.mp-handle{flex:none;display:grid;place-items:center;height:20px}
.mp-handle i{width:38px;height:5px;border-radius:5px;background:#ffffff30}
.mp-tabs{flex:none;display:flex;gap:4px;padding:0 14px 8px;max-width:560px;width:100%;margin:0 auto}
.mp-tabs button{flex:1;padding:8px 0;border-radius:12px;font-size:13.5px;color:var(--dim)}
.mp-tabs button.on{background:#ffffff12;color:var(--ink);font-weight:600}
.mp-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 16px calc(20px + env(safe-area-inset-bottom));max-width:560px;width:100%;margin:0 auto}
.mp-av{flex:none;display:inline-grid;place-items:center;border-radius:50%;overflow:hidden;background:#3a302d;color:#fff;font-family:Georgia,serif}
.mp-av img{width:100%;height:100%;object-fit:cover}
.mp-person{display:flex;gap:14px;align-items:flex-start;padding:6px 0 12px}
.mp-person.me{align-items:center;padding-top:14px;border-top:1px solid #ffffff10}
.mp-pinfo{flex:1;min-width:0}
.mp-pinfo>b{font:400 18px Georgia,"Songti SC",serif}
.mp-where{font-size:16px;font-weight:600;margin-top:2px}
.mp-doing{font-size:14px;color:#f3d8bf;margin:2px 0}
.mp-dist{font-size:12px;color:#9cc3e6;margin-top:2px}
.mp-next{display:flex;flex-direction:column;gap:3px;padding:10px 12px;margin:0 0 12px;border-radius:14px;background:#ffffff0a;font-size:13px;color:var(--dim)}
.mp-next span{display:inline-flex;align-items:center;gap:6px}
.mp-next small{font-size:11.5px;color:var(--faint);line-height:1.45}
.mp-place{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:10px 6px!important;border-radius:14px!important}
.mp-place.sel,.mp-place:active{background:#ffffff0c!important}
.mp-pico{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;font-size:17px;box-shadow:0 0 0 2px #fffdf8 inset}
.mp-pmain{flex:1;min-width:0;display:flex;flex-direction:column}
.mp-pmain b{font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mp-pmain small{font-size:12px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-here{font-style:normal;font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:99px;background:#f0a86d;color:#2b1d12}
.mp-here.me{background:#7fb3e3;color:#10202e}
.mp-by{flex:none;font-size:10.5px;color:var(--faint);padding:2px 7px;border-radius:99px;border:1px solid #ffffff18}
.mp-by.character{color:#f3c9a3;border-color:#f0a86d55}
.mp-days{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}
.mp-days::-webkit-scrollbar{display:none}
.mp-days button{flex:none;display:flex;flex-direction:column;align-items:center;min-width:58px;padding:7px 10px!important;border-radius:14px!important;background:#ffffff0a!important;font-size:13px}
.mp-days button small{font-size:10.5px;color:var(--faint)}
.mp-days button.on{background:var(--ac)!important;color:var(--ac-ink)}
.mp-days button.on small{color:#2b1d1299}
.mp-sum{margin:2px 0 10px;font-size:13px;color:var(--dim)}
.mp-sum b{color:var(--ink)}
.mp-tl{list-style:none;margin:0;padding:0 0 0 4px;position:relative}
.mp-tl:before{content:"";position:absolute;left:15px;top:14px;bottom:14px;width:2px;background:#ffffff14}
.mp-tl li{position:relative;display:flex;gap:10px;align-items:flex-start;padding:6px 0}
.mp-tdot{flex:none;position:relative;z-index:1;display:grid;place-items:center;width:24px;height:24px;margin-top:6px;border-radius:50%;font-size:11px;font-weight:700;color:#fff;box-shadow:0 0 0 3px #1c1b22}
.mp-tl li.live .mp-tdot{box-shadow:0 0 0 3px #1c1b22,0 0 0 5px #f0a86d88}
.mp-tbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;text-align:left;padding:6px 10px!important;border-radius:14px!important}
.mp-tbody:active{background:#ffffff0a!important}
.mp-ttime{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.mp-ttime em{font-style:normal;margin-left:6px;color:#f3c9a3}
.mp-tbody b{font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mp-livebadge{font-style:normal;font-size:10.5px;padding:1px 7px;border-radius:99px;background:#f0a86d;color:#2b1d12}
.mp-tact{font-size:13.5px;color:#e9dccf}
.mp-tlog{display:flex;flex-direction:column;font-size:12px;color:var(--faint);margin-top:2px}
.mp-tnote{font-size:12px;color:#c9c1c4;font-style:italic}
.mp-tby{font-size:10.5px;color:#7d757a}
.mp-kinds{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.mp-kinds button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px!important;border-radius:14px!important;background:#ffffff08!important;border:1px solid transparent!important}
.mp-kinds button span{font-size:20px}
.mp-kinds button small{font-size:11px;color:var(--dim)}
.mp-kinds button.on{border-color:var(--c)!important;background:color-mix(in srgb,var(--c) 22%,transparent)!important}
.mp-sheetacts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.mp-pickl{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.mp-pickl button{display:inline-flex;align-items:center;gap:5px;padding:8px 12px!important;border-radius:999px!important;background:#ffffff0a!important;border:1px solid var(--l)!important;font-size:14px}
.mp-pickl button.on{background:var(--ac)!important;color:var(--ac-ink);border-color:transparent!important;font-weight:600}
.mp-h{margin:22px 0 10px;padding-top:14px;border-top:1px solid var(--l);font:400 16px Georgia,"Songti SC",serif}
.mp-avs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mp-avs>div{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px;border-radius:16px;background:#ffffff08}
.mp-avs .la-btn{font-size:12.5px;min-height:34px;padding:0 10px!important}
.mp-quiet{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.mp-quiet input{flex:1;min-width:0;padding:9px 10px;border-radius:12px;border:1px solid var(--l);background:#ffffff0a;font-size:16px;color-scheme:dark}
.mp-quiet span{font-size:13px;color:var(--faint)}
.mp-form .la-tog{border-bottom-color:#ffffff10}
`;
