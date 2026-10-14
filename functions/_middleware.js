/**
 * 私人前端的门：整个站点（页面、图片、接口）都要先过一次账号密码。
 *
 * 为什么需要：后端密钥放在 Cloudflare 里，由下面的 api 转发层自动带上，
 * 浏览器里没有密钥。这样谁知道你的 pages.dev 地址谁就能用你的后端 ——
 * 所以必须先在这里拦一道。
 *
 * 需要在 Cloudflare Pages 的环境变量里设：FRONT_USER、FRONT_PASS（建议设成 Secret）。
 * 没设的话一律拒绝，不会放行。
 */

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

async function same(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function deny() {
  return new Response("需要登录", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Uranus", charset="UTF-8"' },
  });
}

export async function onRequest({ request, env, next }) {
  const user = String(env.FRONT_USER ?? "");
  const pass = String(env.FRONT_PASS ?? "");
  if (!user || !pass) {
    return new Response("还没设置 FRONT_USER / FRONT_PASS（Cloudflare Pages → Settings → Variables）。", {
      status: 503,
    });
  }

  const m = /^Basic\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return deny();
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return deny();
  }
  const i = decoded.indexOf(":");
  if (i < 0) return deny();

  const okUser = await same(decoded.slice(0, i), user);
  const okPass = await same(decoded.slice(i + 1), pass);
  if (!(okUser && okPass)) return deny();

  return next();
}
