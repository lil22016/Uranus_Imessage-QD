/*
 * 经期记录（从拾心界搬过来，数据改存 Companion，换设备也在）。
 *
 * 和拾心界的区别：
 *  - 预测按「你自己记录的平均周期」算（拾心界固定是「上次结束 + 23 天」，周期不是 28 天的人会一直偏）；
 *  - 可以从拾心界「全量备份」的 JSON 一键导入旧记录；
 *  - 开始一次经期时会告诉他一声（背景信息，他不会因此被逼着回消息），他也能通过 MCP 查。
 */

import { useMemo, useRef, useState } from "react";
import { cx } from "../api.js";
import { AppFrame, Field, Icon, Loading, Sheet, Toast, Toggle, WEEK, dayDiff, md, plusDays, useRemote, useToast, weekday } from "./kit.jsx";

const FLOW = ["无", "少量", "中量", "较多", "很多"];
const PAIN = ["不痛", "轻微", "明显", "剧烈"];
const SYMPTOMS = ["腹痛", "腰酸", "头痛", "胸胀", "疲惫", "嗜睡", "失眠", "情绪低落", "烦躁", "长痘", "胃口大", "腹胀", "怕冷"];

export function PeriodApp({ onExit }) {
  const { data, setData, error, load } = useRemote("/period");
  const [toastText, toast] = useToast();
  const [day, setDay] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [month, setMonth] = useState("");

  const records = data?.records || [];
  const sum = data?.summary || {};
  const today = data?.today || new Date().toLocaleDateString("en-CA");
  const curMonth = month || today.slice(0, 7);

  async function save(nextRecords, nextSettings) {
    const prev = data;
    setData({ ...data, records: nextRecords, settings: nextSettings || data.settings });
    try {
      setData(await cx("/period", { method: "PUT", body: { records: nextRecords, settings: nextSettings || data.settings } }));
      return true;
    } catch (e) {
      setData(prev);
      toast(e.message);
      return false;
    }
  }

  /* 预测：只画今天以后的（含今天），记录过的日子不画 */
  const marks = useMemo(() => {
    const m = new Map();
    if (!sum.nextStart || !records.length) return m;
    for (let k = 0; k < 4; k++) {
      const start = plusDays(sum.nextStart, k * sum.avgCycle);
      const ov = plusDays(start, -14);
      for (let i = -5; i <= 1; i++) {
        const d = plusDays(ov, i);
        if (d >= today) m.set(d, i === 0 ? "ov" : "fert");
      }
      if (k === 0 && sum.lateBy) continue; // 已经推迟了：这一期不画「预测经期」，只提示推迟
      for (let i = 0; i < sum.avgLen; i++) {
        const d = plusDays(start, i);
        if (d >= today) m.set(d, "pred");
      }
    }
    return m;
  }, [sum.nextStart, sum.avgCycle, sum.avgLen, sum.lateBy, records.length, today]);

  const recOn = (d) => records.find((r) => d >= r.startDate && d <= r.endDate);

  if (!data) {
    return (
      <AppFrame kicker="cycle" title="经期" onExit={onExit} className="la-period">
        <style>{CSS}</style>
        <Loading error={error} retry={load} />
      </AppFrame>
    );
  }

  /* ───── 今天的状态 ───── */
  const ring = sum.cycleDay && sum.avgCycle ? Math.min(1, (sum.cycleDay - 1) / sum.avgCycle) : 0;
  let big = "", small = "", phase = "";
  if (!records.length) {
    big = "—";
    small = "还没有记录";
    phase = "记下第一次就能开始预测";
  } else if (sum.inPeriod) {
    big = `第 ${sum.inPeriod.day} 天`;
    small = "经期中";
    phase = `预计 ${md(records[records.length - 1].endDate)} 结束`;
  } else if (sum.lateBy) {
    big = `推迟 ${sum.lateBy} 天`;
    small = `原本预计 ${md(sum.nextStart)}`;
    phase = "来了就点下面的按钮";
  } else {
    big = sum.daysUntilNext === 0 ? "今天" : `${sum.daysUntilNext} 天`;
    small = sum.daysUntilNext === 0 ? "预计今天来" : `后 · 预计 ${md(sum.nextStart)}`;
    phase = today === sum.ovulation ? "排卵日" : today >= sum.fertile?.start && today <= sum.fertile?.end ? "易孕期" : today < sum.ovulation ? "卵泡期" : "黄体期";
    phase = `周期第 ${sum.cycleDay} 天 · ${phase}`;
  }
  const last = records[records.length - 1];

  async function quick() {
    if (sum.inPeriod) {
      const r = recOn(today);
      if (!r) return;
      if (await save(records.map((x) => (x.id === r.id ? { ...x, endDate: today } : x)))) toast("记下了：今天结束");
    } else {
      const r = startOn(today);
      if (r && (await save(r))) {
        toast("记下了：今天开始");
        setDay(today);
      }
    }
  }

  /** 在 d 这天开始一次经期；和紧挨着的记录合并（比如漏记了第一天） */
  function startOn(d) {
    if (d > today) {
      toast("还没到这天，不能提前记");
      return null;
    }
    const len = sum.avgLen || data.settings.periodLength || 6;
    const after = records.find((r) => r.startDate > d && dayDiff(d, r.startDate) <= len);
    if (after) return records.map((x) => (x.id === after.id ? { ...x, startDate: d } : x));
    return [...records, { id: `pr_${Date.now()}`, startDate: d, endDate: plusDays(d, len - 1), flow: 2, pain: 0, symptoms: "", daily: {} }];
  }

  /* ───── 月历 ───── */
  const first = `${curMonth}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay(); // 周日开头，和手机日历一致
  const cells = Array.from({ length: 42 }, (_, i) => plusDays(first, i - lead));
  const shift = (n) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };

  const hist = [...records].reverse();

  return (
    <AppFrame
      kicker="cycle"
      title="经期"
      onExit={onExit}
      className="la-period"
      right={
        <button type="button" className="la-ico" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <Icon n="gear" />
        </button>
      }
    >
      <style>{CSS}</style>
      <div className="la-body">
        <section className="pd-hero">
          <svg className="pd-ring" viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="52" className="trk" />
            <circle cx="60" cy="60" r="52" className="val" strokeDasharray={`${ring * 326.7} 400`} transform="rotate(-90 60 60)" />
            {records.length > 0 && <circle cx={60 + 52 * Math.sin(ring * 2 * Math.PI)} cy={60 - 52 * Math.cos(ring * 2 * Math.PI)} r="5" className="dot" />}
          </svg>
          <div className="pd-hero-in">
            <b>{big}</b>
            <span>{small}</span>
            <small>{phase}</small>
          </div>
        </section>
        <button type="button" className="la-btn solid block pd-quick" onClick={quick}>
          <Icon n="drop" size={18} /> {sum.inPeriod ? "今天结束了" : "今天来了"}
        </button>

        <section className="la-card pd-cal">
          <div className="pd-mhead">
            <button type="button" className="la-ico sm" onClick={() => shift(-1)} aria-label="上个月">
              <Icon n="chevL" size={18} />
            </button>
            <b>
              {first.slice(0, 4)} 年 {Number(first.slice(5, 7))} 月
            </b>
            <button type="button" className="la-ico sm" onClick={() => shift(1)} aria-label="下个月">
              <Icon n="chevR" size={18} />
            </button>
          </div>
          <div className="pd-grid">
            {WEEK.map((w) => (
              <span key={w} className="pd-dow">
                {w}
              </span>
            ))}
            {cells.map((d) => {
              const r = recOn(d);
              const mk = r ? "" : marks.get(d) || "";
              const daily = r?.daily?.[d];
              const cls = ["pd-day", d.slice(0, 7) !== curMonth && "out", r && "rec", r && d === r.startDate && "s", r && d === r.endDate && "e", mk, d === today && "today", d === day && "sel"].filter(Boolean).join(" ");
              return (
                <button key={d} type="button" className={cls} onClick={() => setDay(d)}>
                  <span>{Number(d.slice(8))}</span>
                  {daily && (daily.flow > 0 || daily.pain > 0 || daily.symptoms) && <i className="pd-note" />}
                </button>
              );
            })}
          </div>
          <div className="pd-legend">
            <span><i className="lg rec" />经期</span>
            <span><i className="lg pred" />预测</span>
            <span><i className="lg fert" />易孕期</span>
            <span><i className="lg ov" />排卵日</span>
          </div>
        </section>

        <section className="la-card">
          <h3>你的规律</h3>
          <div className="pd-stats">
            <div>
              <b>{sum.avgCycle || "—"}</b>
              <span>平均周期（天）</span>
            </div>
            <div>
              <b>{sum.avgLen || "—"}</b>
              <span>平均经期（天）</span>
            </div>
            <div>
              <b>{records.length}</b>
              <span>记录次数</span>
            </div>
          </div>
          <p className="la-meta" style={{ margin: "10px 0 0" }}>
            {sum.cyclesMeasured >= 2 ? `按最近 ${Math.min(sum.cyclesMeasured, 6)} 个周期算的平均值。` : `记满两个周期之后按你自己的平均值预测；现在先用设置里的默认值（周期 ${data.settings.cycleLength} 天）。`}
            间隔太短（&lt;15 天）或太长（&gt;60 天，多半是中间漏记了）的不算进平均。
          </p>
        </section>

        {hist.length > 0 && (
          <section className="la-card">
            <h3>历史</h3>
            {hist.slice(0, 24).map((r, i) => {
              const next = hist[i - 1];
              const len = dayDiff(r.startDate, r.endDate) + 1;
              return (
                <button key={r.id} type="button" className="pd-hist" onClick={() => (setMonth(r.startDate.slice(0, 7)), setDay(r.startDate))}>
                  <span className="when">
                    {md(r.startDate)} – {md(r.endDate)}
                    <small>{r.startDate.slice(0, 4)}</small>
                  </span>
                  <span className="len">{len} 天</span>
                  <span className="cyc">{next ? `周期 ${dayDiff(r.startDate, next.startDate)} 天` : r.endDate >= today ? "进行中" : ""}</span>
                </button>
              );
            })}
          </section>
        )}
        {last && <p className="la-meta" style={{ textAlign: "center" }}>点日历上任何一天可以补记 / 改记那天的量、疼痛和感受。</p>}
      </div>

      {day && (
        <DaySheet
          key={day}
          d={day}
          today={today}
          rec={recOn(day)}
          records={records}
          sum={sum}
          mark={marks.get(day)}
          onClose={() => setDay("")}
          save={save}
          startOn={startOn}
          toast={toast}
        />
      )}
      {settingsOpen && <PeriodSettings data={data} records={records} save={save} toast={toast} onClose={() => setSettingsOpen(false)} />}
      <Toast text={toastText} />
    </AppFrame>
  );
}

function DaySheet({ d, today, rec, records, sum, mark, onClose, save, startOn, toast }) {
  const daily = rec?.daily?.[d] || {};
  const [flow, setFlow] = useState(daily.flow ?? (rec ? (d === rec.startDate ? rec.flow : 2) : 2));
  const [pain, setPain] = useState(daily.pain ?? (d === rec?.startDate ? rec.pain : 0));
  const [sym, setSym] = useState(() => String(daily.symptoms || "").split(new RegExp("[、,，\\s]+")).filter(Boolean));
  const [note, setNote] = useState(daily.note || "");
  const [busy, setBusy] = useState(false);
  const extra = sym.filter((s) => !SYMPTOMS.includes(s));
  const [custom, setCustom] = useState(extra.join("、"));

  const title = `${md(d)} 周${weekday(d)}`;

  if (!rec) {
    const prev = [...records].reverse().find((r) => r.endDate < d);
    const gap = prev ? dayDiff(prev.endDate, d) : 99;
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="pd-dayinfo">
          {d > today
            ? mark === "pred"
              ? "预计这几天来。"
              : mark === "ov"
                ? "预计的排卵日。"
                : mark === "fert"
                  ? "预计的易孕期。"
                  : "这天还没到。"
            : "这天没有记录经期。"}
        </p>
        {d <= today && (
          <div className="pd-actions">
            <button
              type="button"
              className="la-btn solid block"
              disabled={busy}
              onClick={async () => {
                const r = startOn(d);
                if (!r) return;
                setBusy(true);
                if (await save(r)) toast(`记下了：${md(d)} 开始`);
                setBusy(false);
              }}
            >
              这天开始经期
            </button>
            {prev && gap >= 1 && gap <= 7 && (
              <button
                type="button"
                className="la-btn block"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  if (await save(records.map((x) => (x.id === prev.id ? { ...x, endDate: d } : x)))) toast("延长了上一次经期");
                  setBusy(false);
                }}
              >
                把上一次（{md(prev.startDate)} 开始）延长到这天
              </button>
            )}
          </div>
        )}
        {sum.nextStart && <p className="la-meta">下一次预计 {md(sum.nextStart)}；排卵日约 {md(sum.ovulation)}。预测只是估算，别拿来避孕。</p>}
      </Sheet>
    );
  }

  const n = dayDiff(rec.startDate, d) + 1, total = dayDiff(rec.startDate, rec.endDate) + 1;
  const toggleSym = (s) => setSym((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function saveDay() {
    setBusy(true);
    const symptoms = [...sym.filter((s) => SYMPTOMS.includes(s)), ...custom.split(new RegExp("[、,，]+")).map((s) => s.trim()).filter(Boolean)].join("、");
    const next = records.map((x) => {
      if (x.id !== rec.id) return x;
      const o = { ...x, daily: { ...(x.daily || {}), [d]: { flow, pain, symptoms, note } } };
      if (d === x.startDate) Object.assign(o, { flow, pain, symptoms });
      return o;
    });
    if (await save(next)) {
      toast("已保存");
      onClose();
    }
    setBusy(false);
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="la-btn solid" disabled={busy} onClick={saveDay}>
          保存这天
        </button>
      }
    >
      <p className="pd-dayinfo">
        经期第 <b>{n}</b> 天 · 这次 {md(rec.startDate)} – {md(rec.endDate)}（{total} 天{rec.endDate >= today ? "，结束日是预估的" : ""}）
      </p>
      <Field label={`量：${FLOW[flow]}`}>
        <div className="pd-pick">
          {FLOW.map((_, i) => (
            <button key={i} type="button" className={i === flow ? "on" : ""} onClick={() => setFlow(i)} aria-label={FLOW[i]}>
              {i === 0 ? <span className="z">无</span> : Array.from({ length: i }, (_, k) => <Icon key={k} n="drop" size={13} fill="currentColor" stroke={0} />)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`疼痛：${PAIN[pain]}`}>
        <div className="pd-pick">
          {PAIN.map((_, i) => (
            <button key={i} type="button" className={i === pain ? "on" : ""} onClick={() => setPain(i)} aria-label={PAIN[i]}>
              {i === 0 ? <span className="z">无</span> : Array.from({ length: i }, (_, k) => <Icon key={k} n="bolt" size={13} fill="currentColor" stroke={0} />)}
            </button>
          ))}
        </div>
      </Field>
      <Field label="感受">
        <div className="la-chips">
          {SYMPTOMS.map((s) => (
            <button key={s} type="button" className={`la-chip${sym.includes(s) ? " on" : ""}`} onClick={() => toggleSym(s)}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="别的感受（用顿号隔开）">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="比如：想吃甜的" maxLength={60} />
      </Field>
      <Field label="备注">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} style={{ minHeight: 64 }} />
      </Field>
      <div className="pd-actions">
        {d !== rec.endDate && (
          <button
            type="button"
            className="la-btn block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await save(records.map((x) => (x.id === rec.id ? { ...x, endDate: d } : x)))) {
                toast(`这次经期结束在 ${md(d)}`);
                onClose();
              }
              setBusy(false);
            }}
          >
            这次在这天结束
          </button>
        )}
        <button
          type="button"
          className="la-btn ghost danger block"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`删除 ${md(rec.startDate)} 开始的这次经期？每天的记录也会一起删掉。`)) return;
            setBusy(true);
            if (await save(records.filter((x) => x.id !== rec.id))) {
              toast("已删除");
              onClose();
            }
            setBusy(false);
          }}
        >
          删除这次经期
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────── 设置 + 从拾心界导入 ───────────── */

/** 从拾心界的备份里把经期记录挖出来。支持：全量备份（settings.periodRecords）、旧版直存键、直接一个数组。 */
export function extractShixinjie(obj) {
  if (!obj || typeof obj !== "object") return { records: [], settings: null };
  const pools = [obj, obj.settings, obj.data, obj.data?.settings].filter((x) => x && typeof x === "object");
  let records = null, settings = null;
  for (const p of pools) {
    records ||= p.periodRecords || p.mirror_periodRecords || null;
    settings ||= p.periodSettings || p.mirror_periodSettings || null;
  }
  if (!records && Array.isArray(obj)) records = obj;
  if (typeof records === "string") {
    try {
      records = JSON.parse(records);
    } catch {
      records = null;
    }
  }
  if (typeof settings === "string") {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = null;
    }
  }
  const ok = (Array.isArray(records) ? records : []).filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.startDate || "")));
  return { records: ok, settings };
}

function PeriodSettings({ data, records, save, toast, onClose }) {
  const [s, setS] = useState(data.settings);
  const [imp, setImp] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function pick(f) {
    if (!f) return;
    try {
      const text = await f.text();
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        throw new Error("读不出这个文件。请在拾心界「设置 → 数据管理」里重新导出一份「全量备份」（.json）。");
      }
      const got = extractShixinjie(obj);
      if (!got.records.length) throw new Error("这个备份里没有找到经期记录（periodRecords）。");
      const have = new Set(records.map((r) => r.startDate));
      const fresh = got.records.filter((r) => !have.has(r.startDate));
      setImp({ all: got.records, fresh, settings: got.settings, file: f.name });
    } catch (e) {
      toast(e.message);
    }
  }

  async function doImport() {
    setBusy(true);
    const merged = [...records, ...imp.fresh.map((r, i) => ({ ...r, id: `sx_${r.id || i}_${r.startDate}`, symptoms: r.symptoms === "无" ? "" : r.symptoms }))];
    // 拾心界的默认经期长度一起带过来（只在你这边还没改过默认值时）
    const nextSettings = { ...s };
    if (imp.settings?.periodLength && s.periodLength === 6) nextSettings.periodLength = imp.settings.periodLength;
    if (imp.settings?.cycleLength && s.cycleLength === 28) nextSettings.cycleLength = imp.settings.cycleLength;
    if (await save(merged, nextSettings)) {
      toast(`导入了 ${imp.fresh.length} 次经期`);
      setImp(null);
      onClose();
    }
    setBusy(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: "Uranus period", exportedAt: new Date().toISOString(), periodRecords: records, periodSettings: data.settings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `period-${data.today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <Sheet
      title="设置"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="la-btn solid"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await save(records, s)) toast("已保存");
            setBusy(false);
          }}
        >
          保存设置
        </button>
      }
    >
      <div className="la-two">
        <Field label="默认周期（天）" hint="记满两个周期后自动改用你的平均值">
          <input type="number" min="18" max="60" value={s.cycleLength} onChange={(e) => setS({ ...s, cycleLength: Number(e.target.value) })} />
        </Field>
        <Field label="默认经期（天）" hint="新开始一次时先按这个长度预估结束日">
          <input type="number" min="1" max="15" value={s.periodLength} onChange={(e) => setS({ ...s, periodLength: Number(e.target.value) })} />
        </Field>
      </div>
      <Toggle checked={s.tellCharacter} onChange={(v) => setS({ ...s, tellCharacter: v })} label={`来的时候告诉${data.characterName || "他"}`} hint="记下「今天 / 昨天开始」时，作为背景信息同步给 Uranus，不会逼他立刻回消息。不管开不开，他都能在需要时通过 MCP 查。" />

      <div className="pd-imp">
        <h4>从拾心界导入</h4>
        <p className="la-meta">在拾心界里打开「设置 → 数据管理 → 导出全量备份」，得到一个 .json 文件，在这里选它。已经有的（同一天开始的）会跳过，不会重复。</p>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
        {!imp ? (
          <div className="la-row">
            <button type="button" className="la-btn" onClick={() => fileRef.current?.click()}>
              <Icon n="upload" size={16} /> 选择备份文件
            </button>
            <button type="button" className="la-btn ghost" onClick={exportJson}>
              <Icon n="download" size={16} /> 导出这里的记录
            </button>
          </div>
        ) : (
          <div className="pd-impbox">
            <div>
              <b>{imp.file}</b>
            </div>
            <div className="la-meta">
              找到 {imp.all.length} 次经期（{md(imp.all[0]?.startDate)} {imp.all[0]?.startDate.slice(0, 4)} 起），其中 <b style={{ color: "var(--ink)" }}>{imp.fresh.length}</b> 次是新的。
            </div>
            <div className="la-row" style={{ marginTop: 10 }}>
              <button type="button" className="la-btn solid" disabled={busy || !imp.fresh.length} onClick={doImport}>
                导入 {imp.fresh.length} 次
              </button>
              <button type="button" className="la-btn ghost" onClick={() => setImp(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const CSS = `
.la-period{--ac:#eaa3ab;--ac-ink:#2a1619;--pred:#eaa3ab;--fert:#b9a7e6;
 background:radial-gradient(110% 55% at 85% -5%,#4a2730 0,transparent 60%),radial-gradient(90% 50% at 0% 30%,#2b2540 0,transparent 60%),#121016}
.pd-hero{position:relative;width:212px;height:212px;margin:6px auto 12px}
.pd-ring{position:absolute;inset:0;width:100%;height:100%}
.pd-ring .trk{fill:none;stroke:#ffffff12;stroke-width:7}
.pd-ring .val{fill:none;stroke:var(--ac);stroke-width:7;stroke-linecap:round;transition:stroke-dasharray .6s}
.pd-ring .dot{fill:#fff;stroke:var(--ac);stroke-width:3}
.pd-hero-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 28px}
.pd-hero-in b{font:400 34px/1.15 Georgia,"Songti SC",serif;letter-spacing:.01em}
.pd-hero-in span{font-size:13px;color:var(--dim);margin-top:4px}
.pd-hero-in small{font-size:11.5px;color:var(--faint);margin-top:6px}
.pd-quick{max-width:240px;margin:0 auto 18px;display:flex!important}
.pd-cal{padding:12px 10px 12px}
.pd-mhead{display:flex;align-items:center;justify-content:space-between;padding:0 2px 6px}
.pd-mhead b{font:400 16px Georgia,"Songti SC",serif}
.pd-grid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:4px}
.pd-dow{text-align:center;font-size:11px;color:var(--faint);padding:2px 0 4px}
.pd-day{position:relative;height:42px;display:grid;place-items:center;font-size:14px;font-variant-numeric:tabular-nums}
.pd-day>span{position:relative;z-index:1;width:34px;height:34px;display:grid;place-items:center;border-radius:50%}
.pd-day.out{opacity:.32}
.pd-day.rec:before{content:"";position:absolute;top:4px;bottom:4px;left:0;right:0;background:#eaa3ab38}
.pd-day.rec.s:before{left:50%;margin-left:-17px;border-radius:17px 0 0 17px}
.pd-day.rec.e:before{right:50%;margin-right:-17px;border-radius:0 17px 17px 0}
.pd-day.rec.s.e:before{border-radius:17px}
.pd-day.rec>span{background:var(--ac);color:var(--ac-ink);font-weight:650}
.pd-day.pred>span{border:1.5px dashed var(--pred);color:#f7d5d9}
.pd-day.fert>span{background:#b9a7e622;color:#ddd3f7}
.pd-day.ov>span{border:1.5px solid var(--fert);background:#b9a7e633;color:#efe9ff}
.pd-day.today>span{box-shadow:0 0 0 2px #fff inset}
.pd-day.rec.today>span{box-shadow:0 0 0 2px #fff}
.pd-day.sel>span{outline:2px solid #ffffff70;outline-offset:2px}
.pd-note{position:absolute;bottom:1px;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:#fff;z-index:2}
.pd-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;margin-top:10px;font-size:11px;color:var(--dim)}
.pd-legend span{display:inline-flex;align-items:center;gap:5px}
.pd-legend .lg{width:10px;height:10px;border-radius:50%;display:inline-block}
.lg.rec{background:var(--ac)}.lg.pred{border:1.5px dashed var(--pred)}.lg.fert{background:#b9a7e655}.lg.ov{border:1.5px solid var(--fert);background:#b9a7e633}
.pd-stats{display:grid;grid-template-columns:repeat(3,1fr);text-align:center}
.pd-stats b{display:block;font:400 26px Georgia,serif}
.pd-stats span{font-size:11px;color:var(--faint)}
.pd-hist{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;width:100%;text-align:left;padding:10px 2px!important;border-bottom:1px solid #ffffff0e!important}
.pd-hist:last-child{border-bottom:0!important}
.pd-hist .when small{margin-left:6px;font-size:11px;color:var(--faint)}
.pd-hist .len{font-size:13px;color:var(--ac)}
.pd-hist .cyc{font-size:12px;color:var(--faint);min-width:76px;text-align:right}
.pd-dayinfo{margin:0 0 14px;color:var(--dim);font-size:14px}
.pd-dayinfo b{color:var(--ac);font-size:16px}
.pd-pick{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:6px}
.pd-pick button{height:42px;border-radius:12px!important;border:1px solid var(--l)!important;background:#ffffff08!important;display:flex;align-items:center;justify-content:center;gap:1px;color:#ffffff60}
.pd-pick button.on{background:var(--ac)!important;color:var(--ac-ink);border-color:transparent!important}
.pd-pick .z{font-size:12px}
.pd-actions{display:flex;flex-direction:column;gap:8px;margin:6px 0 10px}
.pd-imp{margin-top:18px;padding-top:14px;border-top:1px solid var(--l)}
.pd-imp h4{margin:0 0 4px;font:400 16px Georgia,"Songti SC",serif}
.pd-imp p{margin:0 0 10px}
.pd-impbox{padding:12px;border-radius:14px;background:#ffffff0a;border:1px solid var(--l);word-break:break-all}
`;
