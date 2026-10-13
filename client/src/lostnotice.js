/**
 * 连不上后端 / 密钥不对时给一句话，而不是一片空白。
 *
 * 登录门（panels/auth.jsx）在 worker 模式下，认不上就只往 window 上发一个
 * `uranus:auth-lost` 事件，等外层去画提示。原版控制台有外层，这个私人前端没有，
 * 所以这里补一个最简单的。手机上看不到控制台日志，有这句话排查会容易很多。
 */
window.addEventListener("uranus:auth-lost", (e) => {
  const old = document.getElementById("uranus-lost");
  if (old) old.remove();
  const box = document.createElement("div");
  box.id = "uranus-lost";
  box.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:14px;padding:24px;text-align:center;background:#fff;color:#222;font:15px/1.6 system-ui,sans-serif;z-index:99999";
  const msg = document.createElement("p");
  msg.textContent = (e.detail && String(e.detail)) || "没能登录后端。检查 Pages 里的 BACKEND_URL 和 BACKEND_KEY 是否正确。";
  const btn = document.createElement("button");
  btn.textContent = "重新试一次";
  btn.style.cssText = "padding:8px 18px;border:1px solid #222;border-radius:8px;background:#fff;font-size:15px";
  btn.onclick = () => location.reload();
  box.append(msg, btn);
  document.body.appendChild(box);
});
