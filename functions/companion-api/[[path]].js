/**
 * /companion-api/* 转发到 Companion 的 Worker（/api/*），并在服务端带上它的密码。
 *
 * 需要在 Cloudflare Pages 的环境变量里设：
 *   COMPANION_URL  Companion 的地址，形如 https://rl7-uranus-companion.xxx.workers.dev（末尾不要斜杠）
 *   COMPANION_KEY  Companion 在 Cloudflare 里设的密码 COMPANION_PASSWORD（设成 Secret）
 *
 * 能走到这里的请求都已经通过了整站的设备登录（functions/_middleware.js），
 * 所以不用单独再登录一次 Companion。
 */
export async function onRequest({ request, env, params }) {
  const base = String(env.COMPANION_URL ?? "").replace(/\/+$/, "");
  if (!base) {
    return Response.json({ ok: false, error: "Pages 里还没设置 COMPANION_URL。" }, { status: 503 });
  }
  const url = new URL(request.url);
  const rest = Array.isArray(params.path) ? params.path.join("/") : String(params.path ?? "");
  const upstream = new Request(`${base}/api/${rest}${url.search}`, request);
  upstream.headers.delete("cookie");
  upstream.headers.delete("authorization");
  if (env.COMPANION_KEY) upstream.headers.set("x-companion-key", String(env.COMPANION_KEY));

  let res;
  try {
    res = await fetch(upstream);
  } catch (e) {
    return Response.json({ ok: false, error: `连不上 Companion：${String(e?.message ?? e)}` }, { status: 502 });
  }
  return new Response(res.body, res);
}
