/**
 * /api/* 转发到你自己的 Worker，并自动带上后端密钥。
 *
 * 前端代码里所有请求都是相对地址 `/api/...`，所以前端一行都不用改：
 * 页面、图片、日志流（SSE）、下载，全都走这里。
 *
 * 需要在 Cloudflare Pages 的环境变量里设：
 *   BACKEND_URL  你的 Worker 地址，形如 https://uranus-xiaoshouji.xxx.workers.dev（末尾不要斜杠）
 *   BACKEND_KEY  部署 Worker 时设的 URANUS_PASSWORD（设成 Secret）
 *
 * 注意：BACKEND_URL 必须就是 Worker 自己的 workers.dev 地址。Worker 会记下
 * 「请求是从哪个地址来的」，并拿它去给 Photon 登记 webhook，填成别的地址会让收消息失效。
 */
export async function onRequest({ request, env }) {
  const base = String(env.BACKEND_URL ?? "").replace(/\/+$/, "");
  const key = String(env.BACKEND_KEY ?? "");
  if (!base || !key) {
    return Response.json(
      { ok: false, error: "Pages 里还没设置 BACKEND_URL / BACKEND_KEY。" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const upstream = new Request(`${base}${url.pathname}${url.search}`, request);
  upstream.headers.delete("cookie");
  upstream.headers.delete("authorization"); // 这是前面那道门的 Basic，不是给后端的
  upstream.headers.set("x-uranus-key", key);

  let res;
  try {
    res = await fetch(upstream);
  } catch (e) {
    return Response.json({ ok: false, error: `连不上后端：${String(e?.message ?? e)}` }, { status: 502 });
  }
  return new Response(res.body, res);
}
