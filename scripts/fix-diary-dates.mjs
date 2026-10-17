/*
 * 一次性修正：把「按生成时刻命名」的成品日记改成「按日记写的那一天」命名。
 *
 * 背景：以前定时日记过了零点才生成（00:41），文件名取的是生成那一刻，
 * 于是 14 号的日记叫 2026-10-15.md。新代码已经按日记流水最后一条消息的日期
 * 命名了（memory.js:diaryDayOf），这个脚本只是把已经错位的老文件挪回去。
 *
 * 和 import-memories.mjs 一样，**这个脚本故意指向真实的 data/**，所以自保规则：
 *
 *  1. 默认只看不改：列出每一篇「现在叫什么 → 应该叫什么 → 为什么」。
 *     加 --apply 才真的改名。
 *  2. 日期只从日记**自己顶部的时间栏**读（就是日记正文第一行那个日期），
 *     不猜。下面任何一条对不上就**跳过那一篇**，原样不动：
 *       - 顶部读不出日期；
 *       - 顶部写了星期几，但和那个日期对不上；
 *       - 算出来的日期比文件名还晚，或者早了 3 天以上（不像是「零点后才生成」造成的）。
 *     凌晨 05:00 前的时间栏算前一天（熬夜聊过零点，还是前一天的日记），
 *     和 memory.js:diaryDayOf、Companion 的规则一致。
 *  3. 改之前把整个角色的日记文件夹复制一份到 data/backups/ 下，并写一份
 *     「旧名 → 新名」对照表。改错了把备份拷回去就行。
 *  4. 绝不覆盖：先全部挪到临时名，再按日期从早到晚一篇篇落到新名字上；
 *     新名字被占了就用 -2、-3（和 Uranus 同一天第二篇的规则一样）。
 *
 * 建议先关掉 Uranus 再跑（免得刚好碰上定时日记在写）。
 *
 * 用法：
 *   node scripts/fix-diary-dates.mjs            只列出计划，什么都不改
 *   node scripts/fix-diary-dates.mjs --apply    按计划改名（会先备份）
 *   node scripts/fix-diary-dates.mjs --role 名字  只处理这一个角色的文件夹
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.URANUS_DATA_DIR ? path.resolve(process.env.URANUS_DATA_DIR) : path.join(ROOT, "data");
const DIARY_DIR = path.join(DATA_DIR, "memories", "日记");
const DIARY_FILE = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/;
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const onlyRole = args.includes("--role") ? args[args.indexOf("--role") + 1] : null;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayMs = 86400000;
const toDate = (s) => new Date(s + "T00:00:00Z");

/**
 * 从日记顶部读日期。只看前 3 个非空行，认两种写法：
 *   2026-10-14 星期三 22:30:09
 *   2026年10月16日 星期五（可以没有时间）
 * 返回 {date, why} 或 {skip}
 */
export function headerDay(text) {
  const head = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
  for (const line of head) {
    const m =
      /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*(?:(?:星期|周|礼拜)([日天一二三四五六]))?[^\d\n]{0,6}(?:(\d{1,2}):(\d{2}))?/.exec(line);
    if (!m) continue;
    const s = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const d = toDate(s);
    if (isNaN(d) || iso(d) !== s) return { skip: `顶部日期不是有效日期：「${line.slice(0, 40)}」` };
    if (m[4]) {
      const want = m[4] === "天" ? "日" : m[4];
      if (WEEK[d.getUTCDay()] !== want) return { skip: `顶部写的星期${want}和 ${s}（星期${WEEK[d.getUTCDay()]}）对不上` };
    }
    let day = d;
    let why = `顶部时间栏 ${s}${m[5] !== undefined ? ` ${pad(m[5])}:${m[6]}` : ""}`;
    if (m[5] !== undefined && Number(m[5]) < 5) {
      day = new Date(d.getTime() - dayMs);
      why += "（凌晨 5 点前，算前一天）";
    }
    return { date: iso(day), why };
  }
  return { skip: "顶部读不出日期" };
}

/** 一个角色文件夹的改名计划。 */
export function planFor(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((n) => DIARY_FILE.test(n))
    .sort();
  const rows = files.map((name) => {
    const [, fileDate, seq] = DIARY_FILE.exec(name);
    const h = headerDay(fs.readFileSync(path.join(dir, name), "utf-8"));
    if (h.skip) return { name, fileDate, seq: Number(seq || 1), keep: true, note: `跳过：${h.skip}` };
    if (h.date === fileDate) return { name, fileDate, seq: Number(seq || 1), keep: true, note: "日期本来就对" };
    const diff = (toDate(fileDate) - toDate(h.date)) / dayMs;
    if (diff < 0 || diff > 3)
      return { name, fileDate, seq: Number(seq || 1), keep: true, note: `跳过：${h.why} 推出 ${h.date}，和文件名差 ${diff} 天，不像是零点后生成造成的` };
    return { name, fileDate, seq: Number(seq || 1), keep: false, target: h.date, note: h.why };
  });
  // 落新名字：不动的文件先占位；要动的按（新日期、原文件日期、原序号）从早到晚排，
  // 同一天被占了就 -2、-3。这样同一天两篇时，原来先写的那篇仍然在前
  const taken = new Set(rows.filter((r) => r.keep).map((r) => r.name));
  for (const r of rows.filter((r) => !r.keep).sort((a, b) => a.target.localeCompare(b.target) || a.fileDate.localeCompare(b.fileDate) || a.seq - b.seq)) {
    let n = 1;
    let nm = `${r.target}.md`;
    while (taken.has(nm)) nm = `${r.target}-${++n}.md`;
    taken.add(nm);
    r.newName = nm;
    if (nm === r.name) r.keep = true;
  }
  return rows;
}

function apply(dir, key, rows, stamp) {
  const moves = rows.filter((r) => !r.keep);
  if (!moves.length) return;
  const bak = path.join(DATA_DIR, "backups", `日记改日期-${stamp}`, key);
  fs.mkdirSync(bak, { recursive: true });
  fs.cpSync(dir, bak, { recursive: true });
  fs.writeFileSync(
    path.join(bak, "_改名对照.txt"),
    moves.map((r) => `${r.name} -> ${r.newName}    (${r.note})`).join("\r\n") + "\r\n",
    "utf-8"
  );
  // 第一步：全部挪到临时名（不符合日记文件名格式，Uranus 列表里看不到）
  for (const r of moves) fs.renameSync(path.join(dir, r.name), path.join(dir, `.fixing-${r.name}`));
  // 第二步：落到新名字。上面已经确认新名字不和任何留下的文件、别的新名字撞
  for (const r of moves) {
    const to = path.join(dir, r.newName);
    if (fs.existsSync(to)) throw new Error(`意外：${r.newName} 已存在，停下。备份在 ${bak}`);
    fs.renameSync(path.join(dir, `.fixing-${r.name}`), to);
  }
  console.log(`  已备份到 ${bak}`);
}

if (!fs.existsSync(DIARY_DIR)) {
  console.log(`找不到日记文件夹：${DIARY_DIR}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
let total = 0;
for (const key of fs.readdirSync(DIARY_DIR)) {
  const dir = path.join(DIARY_DIR, key);
  if (!fs.statSync(dir).isDirectory() || (onlyRole && key !== onlyRole)) continue;
  const rows = planFor(dir);
  if (!rows.length) continue;
  console.log(`\n【${key}】`);
  for (const r of rows) {
    if (r.keep) console.log(`  ${r.name.padEnd(17)}  不动    ${r.note}`);
    else console.log(`  ${r.name.padEnd(17)}→ ${r.newName.padEnd(17)}${r.note}`);
  }
  const n = rows.filter((r) => !r.keep).length;
  total += n;
  if (APPLY && n) apply(dir, key, rows, stamp);
}
console.log(
  total
    ? APPLY
      ? `\n改好了 ${total} 篇。Companion 下次整理时会把它们认回原来那条（评论不丢、不重复）。`
      : `\n计划改名 ${total} 篇。确认上面没问题后，加 --apply 再跑一次（会先备份）。`
    : "\n没有需要改名的日记。"
);
