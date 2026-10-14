/**
 * 连不上后端 / 登录过期时给一句话，而不是一片空白。
 *
 * 登录门（panels/auth.jsx）在 worker 模式下认不上，只会往 window 发
 * `uranus:auth-lost` 事件，等外层去画提示。这个私人前端没有外层，这里补一个。
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
  msg.style.maxWidth = "320px";
  msg.textContent =
    (e.detail && String(e.detail)) ||
    "连接断开了，点「重新试一次」。如果反复出现，点「重新登录」；还不行就检查 Pages 里的 BACKEND_URL / BACKEND_KEY。";
  const mk = (text, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "padding:8px 18px;border:1px solid #222;border-radius:8px;background:#fff;font-size:15px";
    b.onclick = fn;
    return b;
  };
  box.append(
    msg,
    mk("重新试一次", () => location.reload()),
    mk("重新登录", () => {
      fetch("/__auth/logout", { method: "POST" }).finally(() => location.reload());
    })
  );
  document.body.appendChild(box);
});
