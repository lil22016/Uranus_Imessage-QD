/*
 * Companion 的样式，整份只活在它自己的 Shadow DOM 里 —— 既不会被界面别处的样式改到，
 * 也不会（包括用户写的自定义 CSS）改到别处。
 * 颜色直接读界面的 CSS 变量（Shadow DOM 里变量照样继承），所以主题一致；后面的数字是单独测试时的兜底。
 */
export const CSS = `
:host{display:block}
*{box-sizing:border-box}
.cmp{font:14px/1.55 Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:rgb(var(--ink,24 24 27));max-width:760px;margin:0 auto;padding:4px 0 96px;position:relative}
.cmp button{font:inherit;color:inherit;cursor:pointer}
.cmp input,.cmp textarea,.cmp select{font:inherit;color:inherit;width:100%;padding:9px 11px;border:1px solid rgb(var(--line,228 228 231));border-radius:8px;background:rgb(var(--paper,255 255 255))}
.cmp textarea{min-height:90px;resize:vertical}
.cmp input:focus,.cmp textarea:focus,.cmp select:focus{outline:2px solid rgb(var(--ink,24 24 27));outline-offset:1px}
.faint{color:rgb(var(--ink-faint,120 120 120))}
.meta{font-size:12px;color:rgb(var(--ink-meta,168 168 168))}
.err{color:#b42318}
.row{display:flex;align-items:center;gap:8px}
.grow{flex:1;min-width:0}
.gap{display:grid;gap:12px}

/* 顶部：日期导航 */
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.datebtn{border:0;background:none;font:400 20px/1.3 "Source Serif 4","Songti SC",serif;padding:4px 2px}
.nav{display:flex;gap:6px}
.pill{border:1px solid rgb(var(--line,228 228 231));background:rgb(var(--paper,255 255 255));border-radius:999px;padding:5px 13px;font-size:13px;white-space:nowrap}
.pill:hover{border-color:rgb(var(--ink,24 24 27))}
.pill.solid{background:rgb(var(--ink,24 24 27));color:rgb(var(--paper-invert,250 250 250));border-color:transparent}
.pill:disabled{opacity:.45;cursor:default}
.pill.danger{color:#b42318}
.month{border:1px solid rgb(var(--line,228 228 231));border-radius:12px;padding:10px;margin:6px 0 10px}
.mhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.grid7{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.dow{font-size:11px;color:rgb(var(--ink-meta,168 168 168));padding:2px 0}
.day{border:0;background:none;border-radius:8px;padding:6px 0 4px;font-size:13px;position:relative}
.day.out{color:rgb(var(--ink-meta,168 168 168))}
.day.sel{background:rgb(var(--ink,24 24 27));color:rgb(var(--paper-invert,250 250 250))}
.day.today:not(.sel){outline:1px solid rgb(var(--ink,24 24 27))}
.dots{display:flex;gap:2px;justify-content:center;height:5px;margin-top:2px}
.dot{width:4px;height:4px;border-radius:50%;background:rgb(var(--ink-faint,120 120 120))}
.dot.me{background:rgb(var(--ink,24 24 27))}

/* 分区 */
.sec{margin-top:22px}
.sechead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid rgb(var(--ink,24 24 27))}
.sechead h2{white-space:nowrap;margin:0;font:400 18px/1.3 "Source Serif 4","Songti SC",serif}
.acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.empty{padding:16px 2px;color:rgb(var(--ink-meta,168 168 168));font-size:13px}

/* 活动（统一的待办样式） */
.act{display:flex;gap:12px;padding:12px 2px;border-bottom:1px solid rgb(var(--line,228 228 231))}
.act.nested{border-bottom:0;padding-top:4px}
.circle{width:22px;height:22px;flex:none;margin-top:3px;border-radius:50%;border:1.5px solid rgb(var(--ink,24 24 27));background:none;display:grid;place-items:center;padding:0;font-size:13px;line-height:1}
.circle:disabled{cursor:default}
.circle.done{background:rgb(var(--ink,24 24 27));color:rgb(var(--paper-invert,250 250 250))}
.circle.failed,.circle.cancelled,.circle.changed{border-color:rgb(var(--ink-faint,120 120 120));color:rgb(var(--ink-faint,120 120 120))}
.abody{flex:1;min-width:0;cursor:default}
.atime{font-size:11px;color:rgb(var(--ink-faint,120 120 120));letter-spacing:.02em}
.atitle{font-size:var(--t-s,17px);line-height:1.35;color:var(--t-c,rgb(var(--ink,24 24 27)));font-family:var(--t-f,inherit);overflow-wrap:anywhere}
.adesc{font-size:var(--d-s,13px);line-height:1.5;color:var(--d-c,rgb(var(--ink-faint,120 120 120)));font-family:var(--d-f,inherit);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px}
.mine{--t-s:var(--my-ts,17px);--t-c:var(--my-tc,rgb(var(--ink,24 24 27)));--t-f:var(--my-tf,inherit);--d-s:var(--my-ds,13px);--d-c:var(--my-dc,rgb(var(--ink-faint,120 120 120)));--d-f:var(--my-df,inherit)}
.loki{--t-s:var(--lk-ts,17px);--t-c:var(--lk-tc,rgb(var(--ink,24 24 27)));--t-f:var(--lk-tf,inherit);--d-s:var(--lk-ds,13px);--d-c:var(--lk-dc,rgb(var(--ink-faint,120 120 120)));--d-f:var(--lk-df,inherit)}
.struck .atitle,.struck .adesc{text-decoration:line-through;color:rgb(var(--ink-faint,120 120 120))}
.tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.arrow{margin:0 0 0 34px;color:rgb(var(--ink-faint,120 120 120));font-size:15px;line-height:1.2}
.done-note{margin-top:6px;font-size:13px;color:rgb(var(--ink-soft,97 97 97));white-space:pre-wrap}
.tag{display:inline-block;font-size:11px;border:1px solid rgb(var(--line,228 228 231));border-radius:999px;padding:0 7px;margin-left:6px;color:rgb(var(--ink-faint,120 120 120))}

/* Loki 的建议气泡：用 Loki 自己的字体和颜色 */
.bubble{position:relative;margin:6px 0 4px 34px;padding:11px 74px 11px 13px;border:1px solid rgb(var(--line,228 228 231));border-radius:14px;background:rgb(var(--sunken,250 250 250));font-family:var(--lk-tf,inherit);color:var(--lk-tc,rgb(var(--ink,24 24 27)))}
.bubble .who{font-size:11px;opacity:.65;margin-bottom:2px}
.bubble .bt{font-size:var(--lk-ts,16px);line-height:1.35;overflow-wrap:anywhere}
.bubble .bd{font-family:var(--lk-df,inherit);font-size:var(--lk-ds,13px);color:var(--lk-dc,rgb(var(--ink-faint,120 120 120)));white-space:pre-wrap;margin-top:2px}
.badge{position:absolute;top:8px;right:10px;font:12px/1 system-ui,sans-serif}
.badge.ok{color:#15803d}
.badge.no{color:#b42318}
.bubble .tools{margin-top:10px}

/* 互动 */
.thread{margin-top:8px;display:grid;gap:6px}
.chip{display:inline-flex;align-items:center;gap:4px;border:1px solid rgb(var(--line,228 228 231));border-radius:999px;padding:1px 9px;font-size:13px;margin-right:6px}
.cm{border-left:2px solid rgb(var(--line,228 228 231));padding:2px 0 2px 10px;font-size:13px}
.cm .quote{color:rgb(var(--ink-faint,120 120 120));font-size:12px;border-left:2px solid rgb(var(--ink-meta,168 168 168));padding-left:8px;margin:2px 0}
.cm .cm{margin-top:6px}
.cmtools{display:flex;gap:6px;margin-top:3px}
.link{border:0;background:none;padding:0;font-size:12px;color:rgb(var(--ink-faint,120 120 120));text-decoration:underline;text-underline-offset:3px}

/* 日记 */
.seg{display:inline-flex;border:1px solid rgb(var(--line,228 228 231));border-radius:999px;overflow:hidden}
.seg button{border:0;background:none;padding:5px 16px;font-size:13px}
.seg button.on{background:rgb(var(--ink,24 24 27));color:rgb(var(--paper-invert,250 250 250))}
.entry{margin-top:16px;border:1px solid rgb(var(--line,228 228 231));border-radius:14px;padding:14px 16px}
.entry h3{margin:0 0 2px;font:400 17px/1.35 "Source Serif 4","Songti SC",serif}
.etext{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px;line-height:1.7;font-size:15px;-webkit-user-select:text;user-select:text}
.etext.selmode{background:rgb(var(--sunken,250 250 250));border-radius:8px;padding:6px 8px;outline:1px dashed rgb(var(--ink-faint,120 120 120))}
mark{background:rgb(250 230 130 / .55);color:inherit;border-radius:3px;padding:0 1px}
.selbar{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:12px;color:rgb(var(--ink-faint,120 120 120))}
.imgs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.imgs figure{margin:0;max-width:200px}
.imgs img{max-width:100%;max-height:200px;border-radius:8px;display:block}
.imgs figcaption{font-size:11px;color:rgb(var(--ink-faint,120 120 120));margin-top:2px}

/* 动态 */
.note{padding:10px 2px;border-bottom:1px solid rgb(var(--line,228 228 231))}

/* 弹层 */
.overlay{position:fixed;inset:0;background:rgb(0 0 0 / .38);display:flex;align-items:flex-end;justify-content:center;z-index:200}
@media(min-width:640px){.overlay{align-items:center}}
.sheet{background:rgb(var(--paper,255 255 255));width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:640px){.sheet{border-radius:18px}}
.sheet h3{margin:0 0 12px;font:400 20px/1.3 "Source Serif 4","Songti SC",serif}
.field{display:grid;gap:5px;margin-bottom:12px;font-size:13px;color:rgb(var(--ink-soft,97 97 97))}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.opts{display:grid;gap:8px}
.opts button{text-align:left;padding:12px 14px;border:1px solid rgb(var(--line,228 228 231));border-radius:10px;background:none;font-size:15px}
.opts button:hover{border-color:rgb(var(--ink,24 24 27))}
.emojis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.emojis button{font-size:24px;border:1px solid rgb(var(--line,228 228 231));background:none;border-radius:10px;padding:4px 8px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgb(var(--ink,24 24 27));color:rgb(var(--paper-invert,250 250 250));padding:8px 16px;border-radius:999px;font-size:13px;z-index:300;max-width:90vw}
.confetti{position:fixed;top:-10px;width:8px;height:12px;z-index:400;pointer-events:none;animation:cmpfall 1.6s ease-in forwards}
@keyframes cmpfall{to{transform:translate3d(var(--dx,0),105vh,0) rotate(720deg);opacity:.9}}

/* 设置 */
.card{border:1px solid rgb(var(--line,228 228 231));border-radius:14px;padding:14px 16px;margin-top:16px}
.card h3{margin:0 0 10px;font:400 17px/1.3 "Source Serif 4","Songti SC",serif}
.profile{border:1px solid rgb(var(--line,228 228 231));border-radius:10px;padding:10px 12px;margin-bottom:8px}
.profile summary{cursor:pointer}
.check{display:flex;align-items:center;gap:8px}
.check input{width:auto}
`;
