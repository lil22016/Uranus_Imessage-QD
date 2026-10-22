/*
 * Companion 的样式，整份只活在它自己的 Shadow DOM 里 —— 既不会被界面别处的样式改到，
 * 也不会（包括用户写的自定义 CSS）改到别处。
 * 颜色直接读界面的 CSS 变量（Shadow DOM 里变量照样继承），所以主题一致；后面的数字是单独测试时的兜底。
 */
export const CSS = `
:host{display:block}
*{box-sizing:border-box}
.cmp{--k-ink:#f5f3f1;--k-ink-soft:#d8d1d3;--k-ink-faint:#bdb5b3;--k-ink-meta:#9f97a3;--k-line:#ffffff2e;--k-paper:#2a2c36;--k-paper-invert:#242128;--k-sunken:#ffffff14;--k-accent:#d6c2a8;font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:var(--k-ink);max-width:880px;margin:0 auto;padding:20px 18px 96px;position:relative;border-radius:26px;min-height:70vh;background:radial-gradient(ellipse at 10% 0%,#4b4b59 0%,transparent 43%),radial-gradient(ellipse at 94% 67%,#333c4b 0%,transparent 50%),linear-gradient(150deg,#171821 15%,#101116 80%);color-scheme:dark}
.cmp button{font:inherit;color:inherit;cursor:pointer}
.cmp input,.cmp textarea,.cmp select{font:inherit;color:inherit;width:100%;padding:9px 11px;border:1px solid var(--k-line);border-radius:8px;background:var(--k-paper)}
.cmp textarea{min-height:90px;resize:vertical}
.cmp input:focus,.cmp textarea:focus,.cmp select:focus{outline:2px solid var(--k-ink);outline-offset:1px}
.faint{color:var(--k-ink-faint)}
.meta{font-size:12px;color:var(--k-ink-meta)}
.err{color:#b42318}
.row{display:flex;align-items:center;gap:8px}
.grow{flex:1;min-width:0}
.gap{display:grid;gap:12px}

/* 顶部：日期导航 */
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.datebtn{border:0;background:none;font:400 20px/1.3 Georgia,"Times New Roman","Songti SC",serif;padding:4px 2px}
.nav{display:flex;gap:6px}
.pill{border:1px solid var(--k-line);background:var(--k-paper);border-radius:999px;padding:5px 13px;font-size:13px;white-space:nowrap}
.pill:hover{border-color:var(--k-ink)}
.pill.solid{background:var(--k-ink);color:var(--k-paper-invert);border-color:transparent}
.pill:disabled{opacity:.45;cursor:default}
.pill.danger{color:#b42318}
.month{border:1px solid var(--k-line);border-radius:12px;padding:10px;margin:6px 0 10px}
.mhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.grid7{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.dow{font-size:11px;color:var(--k-ink-meta);padding:2px 0}
.day{border:0;background:none;border-radius:8px;padding:6px 0 4px;font-size:13px;position:relative}
.day.out{color:var(--k-ink-meta)}
.day.sel{background:var(--k-ink);color:var(--k-paper-invert)}
.day.today:not(.sel){outline:1px solid var(--k-ink)}
.dots{display:flex;gap:2px;justify-content:center;height:5px;margin-top:2px}
.dot{width:4px;height:4px;border-radius:50%;background:var(--k-ink-faint)}
.dot.me{background:var(--k-ink)}

/* 分区 */
.sec{margin-top:22px}
.sechead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--k-ink)}
.sechead h2{white-space:nowrap;margin:0;font:400 18px/1.3 Georgia,"Times New Roman","Songti SC",serif}
.acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.empty{padding:16px 2px;color:var(--k-ink-meta);font-size:13px}

/* 活动（统一的待办样式） */
.act{display:flex;gap:12px;padding:12px 2px;border-bottom:1px solid var(--k-line)}
.act.nested{border-bottom:0;padding-top:4px}
.circle{width:22px;height:22px;flex:none;margin-top:3px;border-radius:50%;border:1.5px solid var(--k-ink);background:none;display:grid;place-items:center;padding:0;font-size:13px;line-height:1}
.circle:disabled{cursor:default}
.circle.done{background:var(--k-ink);color:var(--k-paper-invert)}
.circle.failed,.circle.cancelled,.circle.changed{border-color:var(--k-ink-faint);color:var(--k-ink-faint)}
.abody{flex:1;min-width:0;cursor:default}
.atime{font-size:11px;color:var(--k-ink-faint);letter-spacing:.02em}
.atitle{font-size:var(--t-s,17px);line-height:1.35;color:var(--t-c,var(--k-ink));font-family:var(--t-f,inherit);overflow-wrap:anywhere}
.adesc{font-size:var(--d-s,13px);line-height:1.5;color:var(--d-c,var(--k-ink-faint));font-family:var(--d-f,inherit);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px}
.mine{--t-s:var(--my-ts,17px);--t-c:var(--my-tc,var(--k-ink));--t-f:var(--my-tf,inherit);--d-s:var(--my-ds,13px);--d-c:var(--my-dc,var(--k-ink-faint));--d-f:var(--my-df,inherit)}
.loki{--t-s:var(--lk-ts,17px);--t-c:var(--lk-tc,var(--k-ink));--t-f:var(--lk-tf,inherit);--d-s:var(--lk-ds,13px);--d-c:var(--lk-dc,var(--k-ink-faint));--d-f:var(--lk-df,inherit)}
.struck .atitle,.struck .adesc{text-decoration:line-through;color:var(--k-ink-faint)}
.tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.arrow{margin:0 0 0 34px;color:var(--k-ink-faint);font-size:15px;line-height:1.2}
.done-note{margin-top:6px;font-size:13px;color:var(--k-ink-soft);white-space:pre-wrap}
.tag{display:inline-block;font-size:11px;border:1px solid var(--k-line);border-radius:999px;padding:0 7px;margin-left:6px;color:var(--k-ink-faint)}

/* Loki 的建议气泡：用 Loki 自己的字体和颜色 */
.bubble{position:relative;margin:6px 0 4px 34px;padding:11px 74px 11px 13px;border:1px solid var(--k-line);border-radius:14px;background:var(--k-sunken);font-family:var(--lk-tf,inherit);color:var(--lk-tc,var(--k-ink))}
.bubble .who{font-size:11px;opacity:.65;margin-bottom:2px}
.bubble .bt{font-size:var(--lk-ts,16px);line-height:1.35;overflow-wrap:anywhere}
.bubble .bd{font-family:var(--lk-df,inherit);font-size:var(--lk-ds,13px);color:var(--lk-dc,var(--k-ink-faint));white-space:pre-wrap;margin-top:2px}
.badge{position:absolute;top:8px;right:10px;font:12px/1 system-ui,sans-serif}
.badge.ok{color:#15803d}
.badge.no{color:#b42318}
.bubble .tools{margin-top:10px}

/* 互动 */
.thread{margin-top:8px;display:grid;gap:6px}
.chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--k-line);border-radius:999px;padding:1px 9px;font-size:13px;margin-right:6px}
.cm{border-left:2px solid var(--k-line);padding:2px 0 2px 10px;font-size:13px}
.cm .quote{color:var(--k-ink-faint);font-size:12px;border-left:2px solid var(--k-ink-meta);padding-left:8px;margin:2px 0}
.cm .cm{margin-top:6px}
.cmtools{display:flex;gap:6px;margin-top:3px}
.link{border:0;background:none;padding:0;font-size:12px;color:var(--k-ink-faint);text-decoration:underline;text-underline-offset:3px}

/* 日记 */
.seg{display:inline-flex;border:1px solid var(--k-line);border-radius:999px;overflow:hidden}
.seg button{border:0;background:none;padding:5px 16px;font-size:13px}
.seg button.on{background:var(--k-ink);color:var(--k-paper-invert)}
.entry{margin-top:16px;border:1px solid var(--k-line);border-radius:14px;padding:14px 16px}
.entry h3{margin:0 0 2px;font:400 17px/1.35 Georgia,"Times New Roman","Songti SC",serif}
.etext{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px;line-height:1.7;font-size:15px;-webkit-user-select:text;user-select:text}
.etext.selmode{background:var(--k-sunken);border-radius:8px;padding:6px 8px;outline:1px dashed var(--k-ink-faint)}
mark{background:rgb(250 230 130 / .55);color:inherit;border-radius:3px;padding:0 1px}
.selbar{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:12px;color:var(--k-ink-faint)}
.imgs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.imgs figure{margin:0;max-width:200px}
.imgs img{max-width:100%;max-height:200px;border-radius:8px;display:block}
.imgs figcaption{font-size:11px;color:var(--k-ink-faint);margin-top:2px}

/* 动态 */
.note{padding:10px 2px;border-bottom:1px solid var(--k-line)}
.note.sys{font-size:13px;opacity:.78}

/* 弹层 */
.overlay{position:fixed;inset:0;background:rgba(8,10,16,.66);display:flex;align-items:flex-end;justify-content:center;z-index:200}
@media(min-width:640px){.overlay{align-items:center}}
.sheet{background:var(--k-paper);width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:640px){.sheet{border-radius:18px}}
.sheet h3{margin:0 0 12px;font:400 20px/1.3 Georgia,"Times New Roman","Songti SC",serif}
.field{display:grid;gap:5px;margin-bottom:12px;font-size:13px;color:var(--k-ink-soft)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.opts{display:grid;gap:8px}
.opts button{text-align:left;padding:12px 14px;border:1px solid var(--k-line);border-radius:10px;background:none;font-size:15px}
.opts button:hover{border-color:var(--k-ink)}
.emojis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.emojis button{font-size:24px;border:1px solid var(--k-line);background:none;border-radius:10px;padding:4px 8px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--k-ink);color:var(--k-paper-invert);padding:8px 16px;border-radius:999px;font-size:13px;z-index:300;max-width:90vw}
.confetti{position:fixed;top:-10px;width:8px;height:12px;z-index:400;pointer-events:none;animation:cmpfall 1.6s ease-in forwards}
@keyframes cmpfall{to{transform:translate3d(var(--dx,0),105vh,0) rotate(720deg);opacity:.9}}

/* 设置 */
.card{border:1px solid var(--k-line);border-radius:14px;padding:14px 16px;margin-top:16px}
.card h3{margin:0 0 10px;font:400 17px/1.3 Georgia,"Times New Roman","Songti SC",serif}
.profile{border:1px solid var(--k-line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.profile summary{cursor:pointer}
.check{display:flex;align-items:center;gap:8px}
.check input{width:auto}

/* —— 暗色玻璃主题（和 Companion 网站一致）—— */
.cmp ::selection{background:#d6c2a855}
.cmp input,.cmp textarea,.cmp select{background:#ffffff10;border:1px solid #ffffff36;border-radius:12px;box-shadow:inset 0 1px 1px #0002;color:#fff}
.cmp input:focus,.cmp textarea:focus,.cmp select:focus{outline:0;border-color:var(--k-accent);background:#ffffff19}
.cmp select option{background:#292b34;color:#fff}
.cmp input[type=date],.cmp input[type=time]{color-scheme:dark}
.pill{background:#ffffff1c;border-color:#ffffff24;color:#f0e9e2}
.pill:hover{background:#ffffff30;border-color:#ffffff40}
.pill.solid{background:var(--k-accent);color:#242128;border-color:transparent;font-weight:650}
.pill.danger,.err{color:#f1a9a9}
.month,.entry,.card,.profile,.bubble{background:linear-gradient(135deg,#ffffff22,#ffffff0c 65%);border:1px solid #ffffff35;box-shadow:0 16px 55px #0003,inset 0 1px 0 #ffffff20;backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px)}
.month{border-radius:20px}
.entry,.card{border-radius:24px;padding:18px 20px}
.profile,.bubble{border-radius:16px;box-shadow:none}
.seg{border-color:#ffffff24;background:#ffffff12;backdrop-filter:blur(25px);-webkit-backdrop-filter:blur(25px)}
.seg button.on{background:#ffffff2b;color:#fff;box-shadow:inset 0 1px 0 #ffffff35,0 3px 15px #0002}
.day.sel{background:var(--k-accent);color:#242128}
.day.today:not(.sel){outline-color:var(--k-accent)}
.dot.me{background:var(--k-accent)}
.circle{border-color:var(--k-accent)}
.circle.done{background:var(--k-accent);color:#242128}
.sechead{border-bottom-color:#ffffff40}
.sheet{background:linear-gradient(145deg,#383944f5,#22242ef8);border:1px solid #ffffff3a;box-shadow:0 30px 95px #0009;backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);color:var(--k-ink)}
.overlay{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.opts button{background:#ffffff10;border-color:#ffffff30;color:var(--k-ink);border-radius:14px}
.opts button:hover{border-color:var(--k-accent);background:#ffffff1a}
.emojis button{border-color:#ffffff30;background:#ffffff10}
.toast{background:#e5d4be;color:#24222a;box-shadow:0 10px 40px #0006}
.badge.ok{color:#7ee2a8}.badge.no{color:#f1a9a9}
.datebtn{color:var(--k-ink);font-family:Georgia,"Times New Roman",serif}
.tag{border-color:#ffffff30}
.act{border-bottom-color:#ffffff22}
.note{border-bottom-color:#ffffff22}
.mine,.loki{--t-c-default:var(--k-ink)}
mark{background:#e7d6a2;color:#272128}

/* ───── 整屏模式（Uranus 里打开 Companion / Companion 网站） ───── */
:host{display:block}
.cmp.full{position:fixed;left:0;right:0;top:var(--adj-top,0px);bottom:auto;height:calc(var(--app-h,100%) - var(--adj-top,0px) + var(--adj-bottom,0px));max-height:none;max-width:none;margin:0;padding:0;border-radius:0;border:0;min-height:0;overflow:hidden}
.cmp.full .fwrap{height:100%;display:flex;flex-direction:column}
.fhead{flex:none;display:flex;align-items:center;gap:6px;padding:calc(10px + env(safe-area-inset-top)) 14px 8px;max-width:640px;width:100%;margin:0 auto}
.fbrand small{display:block;font-size:10px;letter-spacing:.16em;color:var(--k-ink-meta)}
.fbrand h1{margin:0;font:400 26px/1.15 Georgia,"Times New Roman","Songti SC",serif;letter-spacing:.01em}
.ficon{display:grid;place-items:center;width:38px;height:38px;margin-left:-8px;border:0;background:none;border-radius:50%;color:var(--k-ink-soft)}
.ficon:hover{background:var(--k-sunken)}
.fmain{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 16px 28px;max-width:640px;width:100%;margin:0 auto;-webkit-overflow-scrolling:touch}
.ftabs{flex:none;display:flex;justify-content:center;gap:4px;padding:6px 10px var(--tab-pb,calc(4px + env(safe-area-inset-bottom) * .4));border-top:1px solid var(--k-line);background:linear-gradient(#14151ccc,#101116ee);backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%)}
.ftabs button{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;background:none;color:var(--k-ink-meta);font-size:11px;border-radius:12px;-webkit-tap-highlight-color:transparent}
.ftabs button.on{color:var(--k-accent);background:#ffffff10}

/* ───── 朋友圈 ───── */
.mtop{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:4px 0 12px}
.mh{margin:0;font:400 22px/1.2 Georgia,"Times New Roman","Songti SC",serif}
.mcompose-open{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:14px 16px;border-radius:20px;border:1px dashed #ffffff40;background:#ffffff0c;color:var(--k-ink-soft)}
.mcompose{padding:14px;border-radius:22px;background:linear-gradient(135deg,#ffffff22,#ffffff0c 65%);border:1px solid #ffffff35}
.mcompose textarea{min-height:84px}
.mpost{display:flex;gap:11px;padding:16px 2px;border-bottom:1px solid #ffffff1f}
.mav{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font:600 17px/1 Georgia,"Songti SC",serif;color:#242128}
.mav.me{background:var(--k-accent)}
.mav.lk{background:#a9b8d6}
.mbody{flex:1;min-width:0}
.mname{font-weight:650;font-size:15px;color:#c9d4ec}
.mpost.mine .mname{color:var(--k-accent)}
.mpost.loki .mtext{font-family:var(--lk-df,inherit)}
.mpost.mine .mtext{font-family:var(--my-df,inherit)}
.mtext{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.6;margin-top:2px}
.mgrid{display:grid;gap:4px;margin-top:8px;max-width:300px}
.mgrid.n1{grid-template-columns:1fr;max-width:230px}
.mgrid.n2{grid-template-columns:repeat(2,1fr);max-width:210px}
.mgrid.n3,.mgrid.edit{grid-template-columns:repeat(3,1fr)}
.mgrid.edit{max-width:none;margin-top:10px}
.mcell{position:relative;display:block;padding:0;border:0;background:#ffffff10;border-radius:6px;overflow:hidden;aspect-ratio:1/1}
.mgrid.n1 .mcell{aspect-ratio:auto}
.mcell img{width:100%;height:100%;object-fit:cover;display:block}
.mgrid.n1 .mcell img{height:auto;max-height:300px;object-fit:contain}
.madd{display:grid;place-items:center;font-size:30px;color:var(--k-ink-meta);border:1px dashed #ffffff40;cursor:pointer}
.mx{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:0;background:#000a;color:#fff;font-size:15px;line-height:1;padding:0}
.mstate{position:absolute;left:0;right:0;bottom:0;font-size:10px;text-align:center;padding:2px 0;background:#000a;color:#fff}
.mstate.blind,.mstate.err{background:#7a2a2acc}
.mfoot{display:flex;align-items:center;gap:10px;margin-top:8px}
.mbtn{display:grid;place-items:center;width:32px;height:28px;border-radius:9px;border:1px solid #ffffff24;background:#ffffff12;color:var(--k-ink-soft);padding:0}
.mbtn.on{color:#f08aa0}
.mwait{display:block;margin-top:6px;font-size:12px}
.mbox{margin-top:8px;padding:8px 10px;border-radius:12px;background:#ffffff10;display:grid;gap:4px}
.mlikes{display:flex;align-items:center;gap:6px;font-size:13px;color:#f3b6c2;padding-bottom:4px;border-bottom:1px solid #ffffff14}
.mlikes svg{width:14px;height:14px}
.mcm{display:block;width:100%;text-align:left;border:0;background:none;padding:2px 0;font-size:13.5px;line-height:1.5;color:var(--k-ink);overflow-wrap:anywhere}
.mcm b{font-weight:600;color:#c9d4ec}
.mreply{display:flex;gap:6px;margin-top:4px}
.mreply input{padding:7px 10px}
.mview{position:fixed;inset:0;z-index:500;background:#000e;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.mview img{max-width:100%;max-height:82vh;object-fit:contain}
.mviewcap{margin-top:10px;font-size:12px;color:#ccc;max-width:520px;text-align:center}
.ftabs button{position:relative}
.tabdot{position:absolute;top:5px;left:calc(50% + 8px);width:7px;height:7px;border-radius:50%;background:#f0607a}
.vstat{padding:10px 12px;border-radius:12px;background:#ffffff10;font-size:13px;margin-bottom:10px}
.vstat.ok{border-left:3px solid #7ee2a8}
.vstat.no{border-left:3px solid #f1a9a9}
`;
