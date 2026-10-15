/*
 * Companion 网站的入口（打包成 RL7-uranus-Companion 仓库的 public/app.js）。
 *
 * 和 Uranus 里的 Companion 是同一份界面（../panel.jsx），区别只在这里：
 *  - 直接请求 /api，密码自己带（存在这个浏览器的 localStorage.companionKey）；
 *  - 密码不对时弹一个小框问（COMPANION_PASSWORD）；
 *  - 设置页里画「屏幕位置微调 / 诊断」（网站没有别的设置入口）。
 *
 * 打包（React 19，IIFE）：
 *   esbuild client/src/companion/site/entry.jsx --bundle --minify --format=iife \
 *     --jsx=automatic --define:process.env.NODE_ENV='"production"' --outfile=public/app.js
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CompanionApp } from "../panel.jsx";
import { configure, cx } from "../api.js";
import "../screenadj.js"; // 屏幕位置微调：渲染前就把 --adj-top / --adj-bottom 写好

let pending = null;
function askPassword(wrong) {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:#080a10cc;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)";
    box.innerHTML =
      '<form style="width:min(380px,100%);padding:24px;border-radius:24px;border:1px solid #ffffff40;background:linear-gradient(145deg,#383944f5,#22242ef8);color:#f7f3f1;box-shadow:0 30px 95px #0009;font:15px/1.5 -apple-system,BlinkMacSystemFont,sans-serif"><div style="font:400 24px Georgia,serif;margin-bottom:6px">Companion</div><div id="pwMsg" style="font-size:13px;color:#c9bec3;margin-bottom:14px"></div><input id="pwIn" type="password" autocomplete="current-password" placeholder="Password" style="width:100%;padding:13px;border-radius:12px;border:1px solid #ffffff36;background:#ffffff10;color:#fff;font-size:16px;outline:none"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" id="pwNo" style="background:#ffffff20;border:1px solid #ffffff30;border-radius:12px;padding:10px 14px;color:#f3e9dd">Cancel</button><button type="submit" style="background:#d6c2a8;color:#242128;border:0;border-radius:12px;padding:10px 18px;font-weight:650">Unlock</button></div><div style="font-size:11px;color:#9f97a3;margin-top:14px;line-height:1.5">The password is the COMPANION_PASSWORD secret of this Worker (the same value as COMPANION_KEY in the Pages project).</div></form>';
    box.querySelector("#pwMsg").textContent = wrong ? "Wrong password. Try again." : "This Companion is password protected.";
    document.body.appendChild(box);
    const input = box.querySelector("#pwIn");
    setTimeout(() => input.focus(), 50);
    const done = (v) => {
      box.remove();
      pending = null;
      resolve(v);
    };
    box.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      done(input.value);
    };
    box.querySelector("#pwNo").onclick = () => done(null);
  });
  return pending;
}

let mem = "";
async function ask(wrong) {
  if (wrong) {
    try {
      localStorage.removeItem("companionKey");
    } catch {}
  }
  const v = await askPassword(wrong);
  if (v === null || v === "") return false;
  try {
    localStorage.companionKey = v;
  } catch {}
  mem = v;
  return true;
}
const key = () => {
  try {
    return localStorage.companionKey || mem;
  } catch {
    return mem;
  }
};
configure({ base: "/api", key, ask });

function Site() {
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    cx("/uranus/providers").then((d) => setProviders(d.providers || [])).catch(() => {});
  }, []);
  return <CompanionApp standalone deviceSettings providers={providers} />;
}

createRoot(document.getElementById("root")).render(<Site />);
