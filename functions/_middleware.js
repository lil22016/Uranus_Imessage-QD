/**
 * 私人前端的门（整站，包括页面、图片、/api 接口）。
 *
 * 用「设备登录」代替浏览器弹的账号密码框：
 *   - 这台设备第一次来：显示登录页，输 FRONT_USER / FRONT_PASS。
 *   - 登录成功后服务器给一个 180 天的登录 cookie（HttpOnly，页面里的脚本读不到），
 *     之后这台设备直接打开，不再要账号密码。
 *   - 4 位数字密码是前端里那层「锁屏」（见 client/src/pingate.jsx），不在这里。
 *
 * 登录 cookie 是用 FRONT_USER + FRONT_PASS 签名的：改了 FRONT_PASS，
 * 所有设备的登录会一起失效，要重新登录。
 *
 * 没设 FRONT_USER / FRONT_PASS 一律拒绝，不会放行。
 */

const COOKIE = "uranus_front";
const MAX_AGE = 60 * 60 * 24 * 180;
// 加到主屏幕时系统取图标、取 manifest 都不带 cookie（manifest 按规范是 credentials: omit），
// 这几个公开放行（只是图标和 manifest，没有任何数据）。
// 以前 manifest.webmanifest 不在这里：iOS 拿到的是 401 JSON，manifest 等于没加。
const PUBLIC = /^\/(apple-touch-icon\.png|favicon[\w.-]*|uranus-mark\.png|manifest\.webmanifest)$/;

const enc = new TextEncoder();

const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`uranus-front|${env.FRONT_USER}|${env.FRONT_PASS}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function makeToken(env) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload));
  return `${payload}.${b64u(sig)}`;
}

async function tokenOk(env, token) {
  const m = /^(v1\.(\d+))\.([\w-]+)$/.exec(token ?? "");
  if (!m || Number(m[2]) < Date.now() / 1000) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(m[3]), enc.encode(m[1]));
  } catch {
    return false;
  }
}

function readCookie(request) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(request.headers.get("cookie") ?? "");
  return m ? m[1] : null;
}

async function sha(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
async function same(a, b) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

async function login(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* 空的当没填 */
  }
  const okUser = await same(String(body?.username ?? ""), env.FRONT_USER);
  const okPass = await same(String(body?.password ?? ""), env.FRONT_PASS);
  if (!(okUser && okPass)) {
    await new Promise((r) => setTimeout(r, 700)); // 拖慢乱试
    return Response.json({ ok: false, error: "账号或密码不对。" }, { status: 401 });
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": cookieHeader(await makeToken(env), MAX_AGE), "cache-control": "no-store" } }
  );
}

function loginPage() {
  return new Response(LOGIN_HTML, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest({ request, env, next }) {
  if (!env.FRONT_USER || !env.FRONT_PASS) {
    return new Response("还没设置 FRONT_USER / FRONT_PASS（Cloudflare Pages → Settings → Variables）。", {
      status: 503,
    });
  }
  const url = new URL(request.url);

  if (url.pathname === "/__auth/login" && request.method === "POST") return login(request, env);
  if (url.pathname === "/__auth/logout" && request.method === "POST") {
    return Response.json({ ok: true }, { headers: { "set-cookie": cookieHeader("", 0) } });
  }
  if (PUBLIC.test(url.pathname)) return next();
  if (await tokenOk(env, readCookie(request))) return next();

  if (request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html")) return loginPage();
  return Response.json({ ok: false, error: "登录过期了，刷新页面重新登录。", needLogin: true }, { status: 401 });
}

/*
 * 登录页的 <head> 必须和 client/index.html 的「主屏幕 App」那几行一致。
 *
 * 主屏幕 App 和 Safari 的 cookie 是分开的：新装的图标第一次打开，没有登录 cookie，
 * 这里返回的就是这张登录页 —— iOS 读到的 status-bar-style / theme-color 来自它，
 * 而不是 index.html。以前它是白底 + theme-color #fff + 没写 status-bar-style，
 * 于是不管 index.html 怎么改，顶上都是系统画的白条。
 */
const LOGIN_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#101117">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Uranus">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Uranus</title>
<style>
  html,body{margin:0;height:100%;background:#101117;color:#ececf1;font:16px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
  form{width:100%;max-width:340px;display:grid;gap:16px}
  img{width:44px;height:44px;border-radius:10px}
  h1{margin:8px 0 0;font:400 24px/1.25 Georgia,"Songti SC",serif;color:#fff}
  p{margin:0;color:#9a9cab;font-size:13px}
  label{display:grid;gap:6px;font-size:13px;color:#b4b6c4}
  input{font:inherit;font-size:16px;padding:11px 12px;border:1px solid #2c2f3d;border-radius:8px;background:#181a23;color:#fff}
  input:focus{outline:2px solid #8ea2ff;outline-offset:1px}
  button{font:inherit;font-weight:500;padding:12px;border:0;border-radius:999px;background:#fafafa;color:#101117}
  button:disabled{opacity:.5}
  #err{color:#ff8a80;min-height:20px;font-size:13px}
</style></head><body><main>
<form id="f">
  <img src="/uranus-mark.png" alt="">
  <div><h1>Uranus</h1><p>这台设备第一次使用，先登录一次。之后会记住它。</p></div>
  <label>账号<input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" required></label>
  <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
  <div id="err"></div>
  <button id="b" type="submit">登录</button>
</form></main>
<script>
document.getElementById("f").addEventListener("submit",async function(e){
  e.preventDefault();
  var b=document.getElementById("b"),err=document.getElementById("err"),f=e.target;
  b.disabled=true;err.textContent="";
  try{
    var r=await fetch("/__auth/login",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({username:f.username.value,password:f.password.value})});
    var d=await r.json().catch(function(){return {}});
    if(r.ok&&d.ok){location.reload();return;}
    err.textContent=d.error||"登录失败。";
  }catch(x){err.textContent="网络不通，再试一次。";}
  b.disabled=false;
});
</script></body></html>`;
