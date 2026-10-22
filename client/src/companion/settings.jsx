/*
 * Companion 设置页。
 *
 * 先移了最常用的：名字 / 时区 / 表情库、模型、Loki 自主、人设、Uranus 桥接、图片生成、外观。
 * 「手动推送 / 简化会话」「清空重来」也在最下面（SessionTools / FreshStart）。
 */

import { useEffect, useRef, useState } from "react";
import { cx } from "./api.js";
import { Field } from "./editors.jsx";
import { ADJ_LIMITS, readAdj, saveAdj } from "./screenadj.js";

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

function FontSelect({ value, onChange, fonts }) {
  const isCss = value?.startsWith("css:");
  return (
    <div className="gap" style={{ gap: 6 }}>
      <select value={isCss ? "css:" : value || ""} onChange={(e) => onChange(e.target.value === "css:" ? "css:" : e.target.value)}>
        <option value="">默认字体</option>
        {fonts.map((f) => (
          <option key={f.id} value={`font:${f.id}`}>
            {f.name}（{f.url ? "链接" : "已上传"}）
          </option>
        ))}
        <option value="css:">按字体名称…</option>
      </select>
      {isCss && <input placeholder="系统里已有的字体名，如 Georgia" value={value.slice(4)} onChange={(e) => onChange(`css:${e.target.value}`)} />}
    </div>
  );
}

function StyleBlock({ title, value = {}, onChange, fonts }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="profile">
      <b>{title}</b>
      <div className="two" style={{ marginTop: 8 }}>
        <Field label="字体（标题和描述共用）">
          <FontSelect value={value.font || value.titleFont || value.descFont} onChange={(v) => onChange({ ...value, font: v, titleFont: "", descFont: "" })} fonts={fonts} />
        </Field>
        <div />
        <Field label="标题颜色">
          <div className="row">
            <input type="color" value={value.titleColor || "#f5f3f1"} onChange={(e) => set("titleColor", e.target.value)} style={{ width: 52, padding: 2 }} />
            <button type="button" className="link" onClick={() => set("titleColor", "")}>
              还原
            </button>
          </div>
        </Field>
        <Field label="描述颜色">
          <div className="row">
            <input type="color" value={value.descColor || "#bdb5b3"} onChange={(e) => set("descColor", e.target.value)} style={{ width: 52, padding: 2 }} />
            <button type="button" className="link" onClick={() => set("descColor", "")}>
              还原
            </button>
          </div>
        </Field>
        <Field label="标题字号（px）">
          <input type="number" min="12" max="32" value={value.titleSize || ""} placeholder="17" onChange={(e) => set("titleSize", e.target.value)} />
        </Field>
        <Field label="描述字号（px）">
          <input type="number" min="10" max="24" value={value.descSize || ""} placeholder="13" onChange={(e) => set("descSize", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}


function GardenCard({ ctx }) {
  const { toast } = ctx;
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setInfo(await cx("/garden/info"));
    } catch (e) {
      toast(e.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const link = info?.token ? `${info.url}/garden/feed?t=${info.token}` : "";
  async function make() {
    if (info?.token && !window.confirm("重新生成后，旧的连接链接立刻失效，Garden 里要重新粘贴。继续？")) return;
    setBusy(true);
    try {
      setInfo(await cx("/garden/token", { method: "POST" }));
      toast("已生成");
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }
  async function revoke() {
    if (!window.confirm("关闭后 Garden 不再能读取 Loki 的活动。继续？")) return;
    setBusy(true);
    try {
      await cx("/garden/token", { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("已复制");
    } catch {
      toast("复制失败，请手动选中复制");
    }
  }
  return (
    <div className="card">
      <h3>DDL Garden 连接（只读）</h3>
      <p className="faint" style={{ marginTop: 0 }}>
        Garden 通过这条链接读取 Loki 有具体日期的活动（只读，不能改任何东西；你自己的任务不会被读取）。
        在 Garden 的 ☰ 侧栏 → Loki Appearance → Companion 链接里粘贴一次即可。链接等于一把钥匙，别发给别人。
      </p>
      {link ? (
        <>
          <Field label="连接链接">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="row">
            <button type="button" className="pill solid" onClick={copy}>
              复制链接
            </button>
            <button type="button" className="pill" disabled={busy} onClick={make}>
              重新生成
            </button>
            <button type="button" className="pill danger" disabled={busy} onClick={revoke}>
              关闭
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="pill solid" disabled={busy} onClick={make}>
          {busy ? "生成中…" : "生成连接链接"}
        </button>
      )}
    </div>
  );
}

function McpCard({ ctx }) {
  const { toast } = ctx;
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setInfo(await cx("/mcp/info"));
    } catch (e) {
      toast(e.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const link = info?.token ? `${info.url}/mcp?t=${info.token}` : "";
  async function make() {
    if (info?.token && !window.confirm("重新生成后，Uranus 里填的旧地址立刻失效，需要换成新的。继续？")) return;
    setBusy(true);
    try {
      setInfo(await cx("/mcp/token", { method: "POST" }));
      toast("已生成");
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }
  async function revoke() {
    if (!window.confirm("关闭后 Uranus 里的角色不能再读写 Companion。继续？")) return;
    setBusy(true);
    try {
      await cx("/mcp/token", { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("已复制");
    } catch {
      toast("复制失败，请手动选中复制");
    }
  }
  return (
    <div className="card">
      <h3>让 Uranus 里的 Loki 读写 Companion（MCP）</h3>
      <p className="faint" style={{ marginTop: 0 }}>
        聊天时 Loki 可以：查看你的日程和 DDL Garden（只读）、查看/新增自己的活动、把自己的活动标成完成/失败/改计划/取消。
        改你的任何东西都做不到；他改的内容不会再推回 Uranus，不会形成循环。
        在 Uranus 里：角色 → MCP 工具 → 添加服务器，传输选 http，地址粘贴下面这条，然后给 Loki 勾选。链接等于钥匙，别发给别人。
      </p>
      {link ? (
        <>
          <Field label="MCP 地址">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="row">
            <button type="button" className="pill solid" onClick={copy}>
              复制地址
            </button>
            <button type="button" className="pill" disabled={busy} onClick={make}>
              重新生成
            </button>
            <button type="button" className="pill danger" disabled={busy} onClick={revoke}>
              关闭
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="pill solid" disabled={busy} onClick={make}>
          {busy ? "生成中…" : "生成 MCP 地址"}
        </button>
      )}
    </div>
  );
}

function OrganizerCard({ s, up, data, save, ctx }) {
  const { load, toast } = ctx;
  const org = s.organizer || {};
  const st = data.organizer;
  const [roles, setRoles] = useState(null);
  const [rolesErr, setRolesErr] = useState("");
  const [busy, setBusy] = useState("");
  const [days, setDays] = useState(7);

  async function fetchRoles() {
    setRolesErr("");
    try {
      setRoles((await cx("/organizer/roles")).roles);
    } catch (e) {
      setRolesErr(e.message);
    }
  }
  useEffect(() => {
    if (data.settings.bridge?.url && data.settings.bridge?.key) fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(sinceDays) {
    setBusy(sinceDays ? "back" : "now");
    try {
      await save(true); // 先把当前设置存上，再整理
      const r = await cx("/organizer/run", { method: "POST", body: { sinceDays } });
      await load();
      toast(`整理完成：新日记 ${r.diaryEntries}，新活动 ${r.activities}，同步日记 ${r.diariesSynced}，重复跳过 ${r.duplicates}`);
    } catch (e) {
      await load();
      toast(e.message);
    } finally {
      setBusy("");
    }
  }

  const c = st?.counts;
  return (
    <div className="card">
      <h3>整理（从 Uranus 读记忆 / 备忘录 / 日记）</h3>
      <p className="faint" style={{ marginTop: 0 }}>
        只读取「今天新增或改过」的记忆和备忘录，以及最近的日记；Uranus 里的日记原文原样同步（评论不会丢）；
        明确的未来计划会被写成角色的活动，日期不明的留在「未排期」。整理用的是下面选的模型，和角色聊天用的模型无关。
      </p>
      <label className="check">
        <input type="checkbox" checked={!!org.enabled} onChange={(e) => up(["organizer", "enabled"], e.target.checked)} /> 自动整理（到下面的时间点各整理一次；Uranus 写好新日记后也会在 10 分钟内自动拉过来）
      </label>
      <Field label="整理出的日记/活动用什么语言（留空 = 保持原文语言）">
        <input value={org.language || ""} placeholder="English" onChange={(e) => up(["organizer", "language"], e.target.value)} />
      </Field>
      <Field label="读取哪个 Uranus 角色">
        <select value={org.roleKey || ""} onChange={(e) => up(["organizer", "roleKey"], e.target.value)}>
          <option value="">未选择</option>
          {(roles || []).map((r) => (
            <option key={r.key} value={r.key}>
              {r.name || r.key}
            </option>
          ))}
          {org.roleKey && !(roles || []).some((r) => r.key === org.roleKey) && <option value={org.roleKey}>{org.roleKey}</option>}
        </select>
      </Field>
      {rolesErr && <p className="err meta">{rolesErr}</p>}
      <button type="button" className="link" onClick={fetchRoles}>
        重新读取角色列表
      </button>
      <Field label="整理用的模型（不选就用 Companion 的模型）">
        <select value={org.profileId || ""} onChange={(e) => up(["organizer", "profileId"], e.target.value)}>
          <option value="">跟随 Companion 的模型</option>
          {(s.modelProfiles || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.model || "未命名"}
            </option>
          ))}
        </select>
      </Field>
      <OrgTimes org={org} up={up} />
      <div className="row" style={{ flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" className="pill solid" disabled={!!busy || !org.roleKey} onClick={() => run(0)}>
          {busy === "now" ? "整理中…" : "立即整理"}
        </button>
        <span className="meta">补最近</span>
        <input type="number" min="1" max="60" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 70 }} />
        <span className="meta">天</span>
        <button type="button" className="pill" disabled={!!busy || !org.roleKey} onClick={() => run(Math.max(1, Math.min(60, days || 7)))}>
          {busy === "back" ? "补录中…" : "补录"}
        </button>
      </div>
      <p className="meta" style={{ marginBottom: 0 }}>
        第一次整理只会记下已有的备忘录，不会把整份旧清单当成新计划；想把旧内容也整理，用「补录」。
      </p>
      {st && (
        <div className="profile" style={{ marginTop: 10 }}>
          <div>
            上次：{new Date(st.lastRunAt).toLocaleString("zh-CN")} · {st.ok ? "成功" : <span className="err">失败</span>}
            {st.backlog ? " · 还有积压，10 分钟后继续" : ""}
            {" · 每次结果也会记在「动态」里"}
          </div>
          {st.error && <div className="err meta">{st.error}</div>}
          {c && (
            <div className="meta">
              记忆 {c.memories} · 备忘录新增行 {c.memoLines} · 同步日记 {c.diariesSynced} · 新短日记 {c.diaryEntries} · 新活动 {c.activities} · 跳过 {c.skipped} · 重复 {c.duplicates}
            </div>
          )}
          {!st.ok && st.nextDue > Date.now() && <div className="meta">下次自动重试：{new Date(st.nextDue).toLocaleTimeString("zh-CN")}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * 自动整理的时间点：1～3 个，随时加减。
 * 全删光就退回旧的「每隔 N 分钟」模式（那个输入框只在这时出现）。
 * 检查有没有新日记不调模型、不花 token，所以日记不用等时间点。
 */
function OrgTimes({ org, up }) {
  const times = Array.isArray(org.times) ? org.times : ["09:00", "13:00", "22:30"];
  const set = (arr) => up(["organizer", "times"], [...new Set(arr.filter(Boolean))].sort());
  return (
    <Field label="自动整理时间点（最多 3 个，按 Companion 设置里的时区）">
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {times.map((t, i) => (
          <span key={i} className="row" style={{ gap: 4 }}>
            <input type="time" value={t} style={{ width: 110 }} onChange={(e) => set(times.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" className="link" aria-label="删除这个时间点" onClick={() => set(times.filter((_, k) => k !== i))}>
              ✕
            </button>
          </span>
        ))}
        {times.length < 3 && (
          <button type="button" className="pill" onClick={() => set([...times, times.length ? "18:00" : "09:00"])}>
            + 时间点
          </button>
        )}
      </div>
      {!times.length && (
        <div style={{ marginTop: 8 }}>
          <span className="meta">没有时间点时，改成每隔几分钟整理一次（至少 10）：</span>
          <input type="number" min="10" value={org.intervalMinutes ?? 60} style={{ width: 80 }} onChange={(e) => up(["organizer", "intervalMinutes"], Number(e.target.value))} />
        </div>
      )}
    </Field>
  );
}

function FontLinkForm({ cx, load, toast }) {
  const [url, setUrl] = useState("");
  const [fam, setFam] = useState("");
  const [busy, setBusy] = useState(false);
  const isFile = /\.(woff2?|ttf|otf)(\?|#|$)/i.test(url.trim());
  async function add() {
    setBusy(true);
    try {
      await cx("/font/link", { method: "POST", body: { url: url.trim(), family: fam.trim(), name: fam.trim() } });
      setUrl("");
      setFam("");
      await load();
      toast("字体链接已添加");
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field label="或者填字体链接（字体文件直链 .woff2/.ttf/.otf，或 Google Fonts 的 css 链接；不占 Companion 空间）">
      <div className="gap" style={{ gap: 6 }}>
        <input placeholder="https://…/MyFont.woff2  或  https://fonts.googleapis.com/css2?family=Lora" value={url} onChange={(e) => setUrl(e.target.value)} />
        {url.trim() && !isFile && <input placeholder="字体名（Google Fonts 里写的名字，如 Lora）" value={fam} onChange={(e) => setFam(e.target.value)} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="pill" disabled={busy || !url.trim()} onClick={add}>
            {busy ? "添加中…" : "添加链接"}
          </button>
        </div>
      </div>
    </Field>
  );
}

/* ───── 手动推给 Uranus 的会话（原 Companion 网站设置里的 Push Original / Simplify） ───── */
function SessionTools({ ctx }) {
  const { toast, load, data } = ctx;
  const [pv, setPv] = useState(null);
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState(data?.settings?.simplifyPrompt || "");
  async function refresh(keepText) {
    try {
      const r = await cx("/session/preview");
      setPv(r);
      if (!keepText) setText(r.simplified || "");
      const n = Number(r.pending) || 0;
      setState(!r.simplified ? (n ? "还没生成" : "可手动编辑测试（现在没有待推内容）") : r.simplifiedCurrent ? "可编辑，已就绪" : n ? "已过期：之后又有新操作" : "可手动编辑测试（现在没有待推内容）");
    } catch (e) {
      setPv({ error: e.message });
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const n = Number(pv?.pending) || 0;
  async function push(rep) {
    setBusy(rep);
    try {
      if (rep === "simplified" && text.trim()) await cx("/session/simplified", { method: "PUT", body: { text } });
      const r = await cx("/session/commit", { method: "POST", body: { actions: [], representation: rep } });
      if (rep === "simplified" && !r?.empty) setText("");
      await refresh();
      toast(r?.empty ? "没有可推的内容" : `${rep === "simplified" ? "简化版" : "原始版"}已推送 · HTTP ${r?.bridge?.status || "OK"}`);
    } catch (e) {
      await refresh(true);
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  async function simplify() {
    setBusy("simplify");
    setState("简化中…");
    try {
      const r = await cx("/session/simplify", { method: "POST", body: {} });
      setText(r.text || "");
      await refresh(true);
      toast("已简化，推送前可以随便改");
    } catch (e) {
      toast(e.message);
      await refresh(true);
    } finally {
      setBusy("");
    }
  }
  async function savePrompt() {
    if (!prompt.trim()) return toast("提示词不能为空");
    try {
      await cx("/settings", { method: "PUT", body: { simplifyPrompt: prompt.trim() } });
      await load();
      toast("简化提示词已保存");
    } catch (e) {
      toast(e.message);
    }
  }
  return (
    <div className="card gap">
      <h3>手动推送给 Uranus</h3>
      <p className="hint faint">把你在 Companion 里刚做的操作（待办、评论、反应…）推给 Uranus 里的 Loki。原始记录会保留到 Uranus 确认收到为止。</p>
      <div className="profile">
        <div className="row">
          <b className="grow">原始会话</b>
          <span className="meta">{n} 条</span>
        </div>
        <pre className="meta" style={{ whiteSpace: "pre-wrap", margin: "6px 0", maxHeight: 160, overflow: "auto" }}>
          {pv?.error ? pv.error : n ? pv?.summary || "有待推内容，但还没有摘要。" : "没有待推的操作。"}
        </pre>
        {n > 0 && pv?.retrying && <p className="meta">之前有一包没收到确认，会先重发（{pv.retryActions || 0} 条）。</p>}
        <button type="button" className="pill" disabled={!!busy} onClick={() => push("original")}>
          {busy === "original" ? "推送中…" : n ? `推送原始版（${n} 条）` : "推送原始版"}
        </button>
      </div>
      <div className="profile">
        <div className="row">
          <b className="grow">简化会话</b>
          <span className="meta">{state}</span>
        </div>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setState("已编辑，推送时才保存"); }} placeholder="点「用 Companion AI 简化」生成一份压缩版，可以自己改。" />
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className="pill" disabled={!!busy} onClick={simplify}>
            {busy === "simplify" ? "简化中…" : pv?.simplified ? "重新简化" : "用 Companion AI 简化"}
          </button>
          <button type="button" className="pill solid" disabled={!!busy || !text.trim() || (n > 0 && !pv?.simplifiedCurrent && !text.trim())} onClick={() => push("simplified")}>
            {busy === "simplified" ? "推送中…" : "推送简化版"}
          </button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="meta">调整简化提示词</summary>
          <textarea style={{ minHeight: 160, marginTop: 6 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button type="button" className="pill" style={{ marginTop: 6 }} onClick={savePrompt}>
            保存提示词
          </button>
        </details>
      </div>
    </div>
  );
}

function FreshStart({ ctx }) {
  const { toast, load } = ctx;
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!window.confirm("清空重来会永久清除：日程、日记、动态/回执、反应和评论、高亮、待推的测试内容。所有设置（模型、人设、桥接…）都保留。继续吗？")) return;
    setBusy(true);
    try {
      await cx("/admin/fresh-start", { method: "POST", body: {} });
      await load();
      toast("已清空，设置保留");
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card gap">
      <h3>清空重来</h3>
      <p className="hint faint">清除日程、日记、动态 / 回执、反应和评论、高亮，以及待推的测试内容。所有设置、模型、人设、表情库和 Uranus 桥接都会保留。</p>
      <div>
        <button type="button" className="pill danger" disabled={busy} onClick={go}>
          {busy ? "清除中…" : "清空重来"}
        </button>
      </div>
    </div>
  );
}

/** 显示/排错：把这台手机上页面实际拿到的尺寸、安全区、底栏位置列出来，截图发给我就能定位问题 */
/**
 * 屏幕位置微调：两条滑杆，拖的时候整页实时跟着动。只存在这台设备上。
 * 顶部：整页往下挪，挪出来的那一截是实心色带（盖住 iOS 26 顶上那层模糊）。
 * 底部：底边往下伸（正）/ 往上缩（负），底栏离屏幕底还有一截时往正数拖。
 */
function ScreenAdjust() {
  const [v, setV] = useState(readAdj);
  const set = (k, n) => setV(saveAdj({ ...v, [k]: n }));
  const row = (k, label, hint) => {
    const [lo, hi] = ADJ_LIMITS[k];
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span>{label}</span>
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="pill" style={{ padding: "2px 10px" }} onClick={() => set(k, v[k] - 1)} aria-label={`${label} 减 1`}>−</button>
            <span style={{ minWidth: 52, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{v[k]} px</span>
            <button type="button" className="pill" style={{ padding: "2px 10px" }} onClick={() => set(k, v[k] + 1)} aria-label={`${label} 加 1`}>+</button>
          </span>
        </div>
        <input
          type="range"
          min={lo}
          max={hi}
          step="1"
          value={v[k]}
          onChange={(e) => set(k, Number(e.target.value))}
          style={{ width: "100%", padding: 0, border: 0, background: "transparent", accentColor: "#d6c2a8", height: 28 }}
          aria-label={label}
        />
        <div className="meta" style={{ fontSize: 12 }}>{hint}</div>
      </div>
    );
  };
  return (
    <div className="field" style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>屏幕位置微调（只存在这台设备上，拖动立刻生效）</div>
      {row("top", "顶部下移", "整页往下挪；挪出来的那一截是实心色带，可以盖住顶上那层模糊")}
      {row("bottom", "底部延伸", "正数 = 底边往下伸（底栏下面还空一截时往右拖）；负数 = 往上缩")}
      <button type="button" className="pill" onClick={() => setV(saveAdj({ top: 0, bottom: 0 }))}>恢复默认（0 / 0）</button>
    </div>
  );
}

function Diag() {
  const ref = useRef(null);
  const [t, setT] = useState("");
  const read = () => {
    try {
      const root = ref.current?.getRootNode?.();
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0";
      (root && root.appendChild ? root : document.body).appendChild(probe);
      const cs = getComputedStyle(probe);
      const st = cs.paddingTop, sb = cs.paddingBottom;
      probe.remove();
      const tabs = root?.querySelector?.(".ftabs");
      const full = root?.querySelector?.(".cmp.full");
      const tr = tabs?.getBoundingClientRect(), fr = full?.getBoundingClientRect();
      const vv = window.visualViewport;
      // 各种「一屏高」实际是多少 px（判断哪个能铺到物理屏幕底）
      const hOf = (h) => { const d = document.createElement("div"); d.style.cssText = `position:absolute;left:-9999px;top:0;width:1px;height:${h}`; document.body.appendChild(d); const v = Math.round(d.getBoundingClientRect().height); d.remove(); return v; };
      const units = ["100vh", "100lvh", "100dvh", "100svh", "var(--app-h)"].map((u) => `${u.replace("var(--app-h)", "app-h")}=${hOf(u)}`).join(" ");
      const tc = document.querySelector('meta[name="theme-color"]')?.content || "无";
      const sbMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content || "无";
      const mf = document.querySelector('link[rel="manifest"]') ? "有" : "无";
      setT([
        `独立 App 模式：${(window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone) ? "是" : "否（在浏览器里）"}`,
        `状态栏 meta：${sbMeta} · manifest：${mf} · theme-color：${tc}`,
        `高度：${units}`,
        `屏幕：${screen.width}×${screen.height}`,
        `窗口：${innerWidth}×${innerHeight} · 可视：${Math.round(vv?.width || 0)}×${Math.round(vv?.height || 0)}`,
        `安全区 上 ${st} / 下 ${sb}`,
        `Companion 容器：${fr ? Math.round(fr.top) + " → " + Math.round(fr.bottom) : "-"}`,
        `底栏：${tr ? Math.round(tr.top) + " → " + Math.round(tr.bottom) + "（高 " + Math.round(tr.height) + "）" : "-"}`,
        `窗口底 − 底栏底 = ${tr ? Math.round(innerHeight - tr.bottom) : "-"} · 屏幕高 − 窗口高 = ${screen.height - innerHeight}`,
      ].join("\n"));
    } catch (e) { setT("读取失败：" + e.message); }
  };
  return (
    <div ref={ref} className="field" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="pill" onClick={read}>诊断（读取这台手机的尺寸）</button>
      </div>
      {t && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8, opacity: .85 }}>{t}</pre>}
    </div>
  );
}

/*
 * 识图：你发朋友圈的图片要先「看懂」，角色才能评论。
 * 默认用 Companion 主模型 —— 先发一张小红图问它是什么颜色，答得出来就算能识图；
 * 答不出来就在这里另选（或新加）一个专门识图的模型。
 */
function VisionCard({ s, up, save, ctx, profiles, providers }) {
  const { data, toast, load } = ctx;
  const [busy, setBusy] = useState("");
  const v = s.vision || {};
  const src = v.source === "profile" || v.source === "uranus" ? v.source : "auto";
  const main = profiles.find((p) => p.id === s.agent?.profileId);
  const chk = data.visionCheck;
  const stale = chk && main && chk.model !== main.model;
  const pickedProvider = providers.find((p) => p.id === v.uranusProviderId);
  const selChk = data.visionCheckSelected;

  async function check(target) {
    setBusy(target);
    try {
      await save(true); // 检测的是保存后的设置
      const r = await cx("/vision/check", { method: "POST", body: { target } });
      await load();
      toast(r.check.ok ? `「${r.check.label}」能识图` : `「${r.check.label}」看不了图`);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  function addDedicated() {
    const id = newId();
    up(["modelProfiles"], [...profiles, { id, name: "识图模型", model: "", baseUrl: "", apiKey: "", path: "/chat/completions", temperature: null, _open: true }]);
    up(["vision"], { ...v, source: "profile", profileId: id });
    toast("在上面「模型」里填好这个识图模型，再保存");
  }

  return (
    <div className="card">
      <h3>识图（朋友圈里的图片）</h3>
      {!main ? (
        <div className="vstat no">还没选 Companion 用的模型。</div>
      ) : !chk || stale ? (
        <div className="vstat">主模型「{main.name || main.model}」还没检测过能不能识图（第一次用到图片时也会自动检测）。</div>
      ) : chk.ok ? (
        <div className="vstat ok">主模型「{chk.label}」能识图 ✓</div>
      ) : (
        <div className="vstat no">
          主模型「{chk.label}」看不了图片{chk.error ? `（${chk.error}）` : ""}。{src === "auto" ? "请在下面另选一个能识图的模型，不然角色看不到你发的图。" : ""}
        </div>
      )}
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="pill" disabled={!!busy || !main} onClick={() => check("main")}>
          {busy === "main" ? "检测中…" : "检测主模型"}
        </button>
        {src === "auto" && chk && !chk.ok && !stale && (
          <button type="button" className="pill solid" onClick={addDedicated}>
            + 添加一个识图模型
          </button>
        )}
      </div>
      <Field label="识图用哪个模型">
        <select value={src} onChange={(e) => up(["vision", "source"], e.target.value)}>
          <option value="auto">跟 Companion 主模型一样（它得能识图）</option>
          <option value="profile">从上面「模型」里另选一个</option>
          <option value="uranus">用 Uranus「连接」里的模型</option>
        </select>
      </Field>
      {src === "profile" && (
        <Field label="识图模型">
          <select value={v.profileId || ""} onChange={(e) => up(["vision", "profileId"], e.target.value)}>
            <option value="">选一个…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.model || "未命名"}
              </option>
            ))}
          </select>
        </Field>
      )}
      {src === "uranus" && (
        <div className="two">
          <Field label="连接">
            <select value={v.uranusProviderId || ""} onChange={(e) => up(["vision"], { ...v, uranusProviderId: e.target.value, model: "" })}>
              <option value="">选一个…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name?.trim() || p.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="模型">
            <select value={v.model || ""} onChange={(e) => up(["vision", "model"], e.target.value)}>
              <option value="">选一个…</option>
              {(pickedProvider?.models || [])
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
      {src !== "auto" && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="pill" disabled={!!busy} onClick={() => check("selected")}>
            {busy === "selected" ? "检测中…" : "检测这个识图模型"}
          </button>
          {selChk && (
            <span className="meta">
              上次检测「{selChk.label}」：{selChk.ok ? "能识图 ✓" : `不行（${selChk.error || "没看到图"}）`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MomentsCard({ s, up }) {
  const m = s.moments || {};
  const set = (k, v) => up(["moments", k], v);
  const box = (k, label, dflt = true) => (
    <label className="check" style={{ marginBottom: 6 }}>
      <input type="checkbox" checked={m[k] ?? dflt} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );
  return (
    <div className="card">
      <h3>朋友圈</h3>
      {box("enabled", "开启朋友圈的自动功能")}
      {m.enabled !== false && (
        <>
          {box("fromMemory", "整理读到新记忆 / 日记时，让 TA 挑适合的发出去（需要上面的「整理」开着）")}
          {box("autoPost", "TA 自己来访时也可能发一条（需要「角色自己来看看」开着）")}
          {box("withImage", `发帖时配图（用「图片生成」${s.image?.enabled ? "" : "，现在没开，只会发文字"}）`)}
          {box("reactToUser", "你发朋友圈后，TA 过一会儿来点赞 / 评论")}
          <div className="two" style={{ marginTop: 10 }}>
            <Field label="TA 每天最多自己发几条">
              <input type="number" min="0" max="10" value={m.maxPerDay ?? 2} onChange={(e) => set("maxPerDay", Number(e.target.value))} />
            </Field>
            <span />
            <Field label="回应最快（分钟后）">
              <input type="number" min="0" max="120" value={m.minDelay ?? 1} onChange={(e) => set("minDelay", Number(e.target.value))} />
            </Field>
            <Field label="回应最慢（分钟后）">
              <input type="number" min="0" max="240" value={m.maxDelay ?? 6} onChange={(e) => set("maxDelay", Number(e.target.value))} />
            </Field>
          </div>
          <p className="hint faint" style={{ marginTop: 0 }}>
            「让 TA 发一条」「从记忆挑一条」两个按钮不受次数限制。你的帖子、点赞、评论会和别的互动一起推给 Uranus，聊天时 TA 也知道。
          </p>
        </>
      )}
    </div>
  );
}

export function SettingsPage({ ctx }) {
  const { data, load, toast } = ctx;
  const orig = data.settings;
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(orig)));
  const [busy, setBusy] = useState(false);
  const up = (path, v) =>
    setS((cur) => {
      const n = JSON.parse(JSON.stringify(cur));
      let o = n;
      path.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
      o[path[path.length - 1]] = v;
      return n;
    });

  async function save(quiet = false) {
    setBusy(true);
    try {
      const body = {
        ...s,
        reactionLibrary: String(Array.isArray(s.reactionLibrary) ? s.reactionLibrary.join(" ") : s.reactionLibrary).trim().split(/\s+/).filter(Boolean),
        modelProfiles: s.modelProfiles.map(({ _open, ...p }) => p),
      };
      await cx("/settings", { method: "PUT", body });
      await load();
      if (quiet !== true) toast("已保存");
    } catch (e) {
      toast(e.message);
      if (quiet === true) throw e;
    } finally {
      setBusy(false);
    }
  }

  async function uploadFont(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await cx("/font", { method: "POST", body: { name: file.name.replace(/\.[^.]+$/, ""), ext, b64: btoa(bin) } });
      await load();
      toast("字体已上传");
    } catch (e) {
      toast(e.message);
    }
  }
  async function removeFont(f) {
    if (!window.confirm(`删除字体「${f.name}」？用到它的地方会回到默认字体。`)) return;
    try {
      await cx(`/font/${f.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(e.message);
    }
  }

  const providers = (ctx.providers || []).filter((p) => !p.type || p.type === "custom" || p.type === "openai");
  const pickedProvider = providers.find((p) => p.id === s.image?.uranusProviderId);
  const imageModels = (pickedProvider?.models || []).filter((m) => m?.model).sort((a, b) => (b.category === "image") - (a.category === "image"));
  const profiles = s.modelProfiles || [];
  const setProfile = (i, k, v) => up(["modelProfiles"], profiles.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const fonts = data.fonts || [];
  const ap = s.appearance || {};

  return (
    <>
      <div className="card">
        <h3>基本</h3>
        <div className="two">
          <Field label="角色名字">
            <input value={s.characterName || ""} onChange={(e) => up(["characterName"], e.target.value)} />
          </Field>
          <Field label="你的名字">
            <input value={s.userName || ""} onChange={(e) => up(["userName"], e.target.value)} />
          </Field>
        </div>
        <Field label="时区（如 America/New_York）">
          <input value={s.timezone || ""} onChange={(e) => up(["timezone"], e.target.value)} />
        </Field>
        <Field label="表情库（用空格隔开）">
          <input value={Array.isArray(s.reactionLibrary) ? s.reactionLibrary.join(" ") : s.reactionLibrary} onChange={(e) => up(["reactionLibrary"], e.target.value)} />
        </Field>
      </div>

      <OrganizerCard s={s} up={up} data={data} save={save} ctx={ctx} />

      <GardenCard ctx={ctx} />

      <McpCard ctx={ctx} />

      <div className="card">
        <h3>模型</h3>
        <Field label="Companion 用的模型">
          <select value={s.agent?.profileId || ""} onChange={(e) => up(["agent", "profileId"], e.target.value)}>
            <option value="">未选择</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.model || "未命名"}
              </option>
            ))}
          </select>
        </Field>
        {profiles.map((p, i) => (
          <details className="profile" key={p.id} open={p._open}>
            <summary>
              {p.name || p.model || "新模型"} <span className="meta">{p.model}</span>
            </summary>
            <div className="two" style={{ marginTop: 8 }}>
              <Field label="名称">
                <input value={p.name || ""} onChange={(e) => setProfile(i, "name", e.target.value)} />
              </Field>
              <Field label="模型">
                <input value={p.model || ""} onChange={(e) => setProfile(i, "model", e.target.value)} />
              </Field>
            </div>
            <Field label="Base URL">
              <input value={p.baseUrl || ""} onChange={(e) => setProfile(i, "baseUrl", e.target.value)} />
            </Field>
            <Field label="API Key">
              <input type="password" autoComplete="off" value={p.apiKey || ""} onChange={(e) => setProfile(i, "apiKey", e.target.value)} />
            </Field>
            <div className="two">
              <Field label="路径">
                <input value={p.path || "/chat/completions"} onChange={(e) => setProfile(i, "path", e.target.value)} />
              </Field>
              <Field label="Temperature">
                <input type="number" step=".1" value={p.temperature ?? ""} onChange={(e) => setProfile(i, "temperature", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
            </div>
            <button type="button" className="pill danger" onClick={() => up(["modelProfiles"], profiles.filter((_, j) => j !== i))}>
              移除
            </button>
          </details>
        ))}
        <button type="button" className="pill" onClick={() => up(["modelProfiles"], [...profiles, { id: newId(), name: "", model: "", baseUrl: "", apiKey: "", path: "/chat/completions", temperature: null, _open: true }])}>
          + 添加模型
        </button>
      </div>

      <VisionCard s={s} up={up} save={save} ctx={ctx} profiles={profiles} providers={providers} />

      <div className="card">
        <h3>人设（给 Companion 里的角色用）</h3>
        <Field label="角色人设">
          <textarea value={s.agent?.persona || ""} onChange={(e) => up(["agent", "persona"], e.target.value)} />
        </Field>
        <Field label="你的人设">
          <textarea value={s.agent?.userPersona || ""} onChange={(e) => up(["agent", "userPersona"], e.target.value)} />
        </Field>
        <Field label="世界书">
          <textarea value={s.agent?.worldbook || ""} onChange={(e) => up(["agent", "worldbook"], e.target.value)} />
        </Field>
        <Field label="额外指令">
          <textarea value={s.agent?.instructions || ""} onChange={(e) => up(["agent", "instructions"], e.target.value)} />
        </Field>
        <Field label="输出语言（留空 = 不强制；想要英文日记就填 English）">
          <input value={s.agent?.language || ""} placeholder="English" onChange={(e) => up(["agent", "language"], e.target.value)} />
        </Field>
      </div>

      <div className="card">
        <h3>角色自己来看看</h3>
        <label className="check">
          <input type="checkbox" checked={!!s.autonomy?.enabled} onChange={(e) => up(["autonomy", "enabled"], e.target.checked)} /> 允许角色自己来访
        </label>
        <div className="two" style={{ marginTop: 10 }}>
          <Field label="每天最少次数">
            <input type="number" value={s.autonomy?.minVisits ?? 0} onChange={(e) => up(["autonomy", "minVisits"], Number(e.target.value))} />
          </Field>
          <Field label="每天最多次数">
            <input type="number" value={s.autonomy?.maxVisits ?? 0} onChange={(e) => up(["autonomy", "maxVisits"], Number(e.target.value))} />
          </Field>
          <Field label="最短间隔（分钟）">
            <input type="number" value={s.autonomy?.minIntervalMinutes ?? 30} onChange={(e) => up(["autonomy", "minIntervalMinutes"], Number(e.target.value))} />
          </Field>
          <span />
          <Field label="活跃开始">
            <input type="time" value={s.autonomy?.activeStart || "08:00"} onChange={(e) => up(["autonomy", "activeStart"], e.target.value)} />
          </Field>
          <Field label="活跃结束">
            <input type="time" value={s.autonomy?.activeEnd || "23:30"} onChange={(e) => up(["autonomy", "activeEnd"], e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Uranus 桥接</h3>
        <label className="check">
          <input type="checkbox" checked={!!s.bridge?.enabled} onChange={(e) => up(["bridge", "enabled"], e.target.checked)} /> 把生活动态推给 Uranus
        </label>
        <Field label="Uranus 地址（你的 Uranus Worker 的 workers.dev 地址）">
          <input value={s.bridge?.url || ""} onChange={(e) => up(["bridge", "url"], e.target.value)} />
        </Field>
        <Field label="后端密钥">
          <input type="password" autoComplete="off" value={s.bridge?.key || ""} onChange={(e) => up(["bridge", "key"], e.target.value)} />
        </Field>
      </div>

      <div className="card">
        <h3>图片生成（可选）</h3>
        <label className="check">
          <input type="checkbox" checked={!!s.image?.enabled} onChange={(e) => up(["image", "enabled"], e.target.checked)} /> 启用
        </label>
        <Field label="来源">
          <select value={s.image?.source === "uranus" ? "uranus" : "manual"} onChange={(e) => up(["image", "source"], e.target.value)}>
            <option value="uranus">使用 Uranus「连接」里的 API（不用再填一遍）</option>
            <option value="manual">手动填写</option>
          </select>
        </Field>
        {s.image?.source === "uranus" ? (
          <>
            <div className="two">
              <Field label="连接">
                <select value={s.image?.uranusProviderId || ""} onChange={(e) => up(["image"], { ...s.image, uranusProviderId: e.target.value, model: "" })}>
                  <option value="">选一个…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name?.trim() || p.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="模型">
                <select value={s.image?.model || ""} onChange={(e) => up(["image", "model"], e.target.value)}>
                  <option value="">选一个…</option>
                  {imageModels.map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.alias?.trim() || m.model}
                      {m.category === "image" ? "（生图）" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="hint faint">
              密钥不会复制到 Companion：每次出图时现从 Uranus 读取，所以在 Uranus 里换密钥会自动生效。需要先在上面「Uranus 桥接」填好地址和后端密钥。只支持自定义 / OpenAI 这两种连接类型。
            </p>
          </>
        ) : (
          <>
            <Field label="Base URL">
              <input value={s.image?.baseUrl || ""} onChange={(e) => up(["image", "baseUrl"], e.target.value)} />
            </Field>
            <div className="two">
              <Field label="API Key">
                <input type="password" autoComplete="off" value={s.image?.apiKey || ""} onChange={(e) => up(["image", "apiKey"], e.target.value)} />
              </Field>
              <Field label="模型">
                <input value={s.image?.model || ""} onChange={(e) => up(["image", "model"], e.target.value)} />
              </Field>
            </div>
          </>
        )}
        <Field label="固定提示词前缀">
          <textarea style={{ minHeight: 56 }} value={s.image?.positivePrompt || ""} onChange={(e) => up(["image", "positivePrompt"], e.target.value)} />
        </Field>
      </div>

      <MomentsCard s={s} up={up} />

      <div className="card">
        <h3>外观（只影响 Companion）</h3>
        <p className="faint" style={{ marginTop: 0 }}>
          “我的一天”和“{s.characterName || "Loki"} 的一天”可以各用各的字体和颜色，像两个人各自手写的日程。{s.characterName || "Loki"} 给你的建议用他自己的样式。
        </p>
        <StyleBlock title={`${s.userName || "我"} 的一天`} value={ap.my} onChange={(v) => up(["appearance", "my"], v)} fonts={fonts} />
        <StyleBlock title={`${s.characterName || "Loki"} 的一天 / 建议`} value={ap.loki} onChange={(v) => up(["appearance", "loki"], v)} fonts={fonts} />
        <Field label="上传字体文件（.woff2 / .woff / .ttf / .otf，6MB 以内；文件太大就用下面的链接）">
          <input
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadFont(f);
            }}
          />
        </Field>
        <FontLinkForm cx={cx} load={load} toast={toast} />
        {fonts.map((f) => (
          <div className="row" key={f.id} style={{ marginBottom: 6 }}>
            <span className="grow">{f.name}</span>
            <span className="meta">{f.url ? (f.kind === "css" ? "样式表链接" : "字体链接") : f.ext}</span>
            <button type="button" className="link" onClick={() => removeFont(f)}>
              删除
            </button>
          </div>
        ))}
        <Field label="底栏下方留白（px）：留空 = 自动；填 0 = 贴着屏幕最底，数字越大离底部越远">
          <input type="number" min="0" max="80" placeholder="自动" value={ap.tabPad ?? ""} onChange={(e) => up(["appearance", "tabPad"], e.target.value === "" ? "" : Number(e.target.value))} />
        </Field>
        {ctx.deviceSettings && (
          <>
            <ScreenAdjust />
            <Diag />
          </>
        )}
        <Field label="自定义 CSS（只在 Companion 里生效；会过滤 @import 和外部图片）">
          <textarea style={{ minHeight: 120, fontFamily: "ui-monospace,monospace", fontSize: 12 }} value={ap.css || ""} onChange={(e) => up(["appearance", "css"], e.target.value)} placeholder={".act .atitle { letter-spacing: .02em; }"} />
        </Field>
      </div>

      <SessionTools ctx={ctx} />
      <FreshStart ctx={ctx} />
      <div className="meta" style={{ marginTop: 14, textAlign: "center" }}>Companion 前端版本 b21 · 整理卡片在「基本」下面</div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="pill solid" disabled={busy} onClick={() => save()}>
          {busy ? "保存中…" : "保存设置"}
        </button>
      </div>
    </>
  );
}
