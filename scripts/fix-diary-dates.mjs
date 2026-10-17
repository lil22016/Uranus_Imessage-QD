/*
 * 一次性修正：把「按生成时刻命名」的成品日记改成「按日记写的那一天」命名。
 * 规则和实现都在 server/src/diaryfix.js（网页上的「修正日记日期」用的同一份）。
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
import { applyDiaryDates, planDiaryDates } from "../server/src/diaryfix.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.URANUS_DATA_DIR ? path.resolve(process.env.URANUS_DATA_DIR) : path.join(ROOT, "data");
const DIARY_DIR = path.join(DATA_DIR, "memories", "日记");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const onlyRole = args.includes("--role") ? args[args.indexOf("--role") + 1] : null;

if (!fs.existsSync(DIARY_DIR)) {
  console.log(`找不到日记文件夹：${DIARY_DIR}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
let total = 0;
for (const key of fs.readdirSync(DIARY_DIR)) {
  const dir = path.join(DIARY_DIR, key);
  if (!fs.statSync(dir).isDirectory() || (onlyRole && key !== onlyRole)) continue;
  const rows = planDiaryDates(dir);
  if (!rows.length) continue;
  console.log(`\n【${key}】`);
  for (const r of rows) {
    if (r.keep) console.log(`  ${r.name.padEnd(17)}  不动    ${r.note}`);
    else console.log(`  ${r.name.padEnd(17)}→ ${r.newName.padEnd(17)}${r.note}`);
  }
  const n = rows.filter((r) => !r.keep).length;
  total += n;
  if (APPLY && n) {
    const r = applyDiaryDates(dir, rows, path.join(DATA_DIR, "backups", `日记改日期-${stamp}`, key));
    console.log(`  已备份到 ${r.backup}`);
  }
}
console.log(
  total
    ? APPLY
      ? `\n改好了 ${total} 篇。Companion 下次整理时会把它们认回原来那条（评论不丢、不重复）。`
      : `\n计划改名 ${total} 篇。确认上面没问题后，加 --apply 再跑一次（会先备份）。`
    : "\n没有需要改名的日记。"
);
