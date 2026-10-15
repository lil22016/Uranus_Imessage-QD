/**
 * 「屏幕位置微调」：整页往下挪多少（顶部）、底边往下 / 往上伸多少（底部）。
 *
 * 只存在这台设备的浏览器里（localStorage，按网站分开：Uranus 和 Companion 网站各存各的），
 * 因为每台手机、每个 iOS 版本差的那一截都不一样，不该跟着服务器同步到别的设备。
 *
 * 写成 <html> 上的两个 CSS 变量，所有整屏外壳都读它们：
 *   --adj-top    顶部：整屏外壳的上边往下挪这么多，挪出来那一截由状态栏色带（#sb-band）填成实心色
 *   --adj-bottom 底部：整屏外壳的下边往下伸（正数）或往上缩（负数）这么多
 * Shadow DOM 里的 Companion 也能读到（CSS 变量会继承进 shadow root）。
 */
const KEY = "uranus.screenAdj.v1";
export const ADJ_LIMITS = { top: [0, 160], bottom: [-160, 160] };

const clampN = (n, [a, b]) => Math.max(a, Math.min(b, Math.round(Number(n) || 0)));

export function readAdj() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { top: clampN(v.top, ADJ_LIMITS.top), bottom: clampN(v.bottom, ADJ_LIMITS.bottom) };
  } catch {
    return { top: 0, bottom: 0 };
  }
}

/** 只改 CSS 变量，不碰任何 meta（iOS 26 一动 meta 就退出沉浸式状态栏）。 */
export function applyAdj(a) {
  if (typeof document === "undefined") return;
  const s = document.documentElement.style;
  s.setProperty("--adj-top", `${clampN(a.top, ADJ_LIMITS.top)}px`);
  s.setProperty("--adj-bottom", `${clampN(a.bottom, ADJ_LIMITS.bottom)}px`);
}

export function saveAdj(a) {
  const v = { top: clampN(a.top, ADJ_LIMITS.top), bottom: clampN(a.bottom, ADJ_LIMITS.bottom) };
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 隐私模式存不了也照样生效到这次关掉为止 */
  }
  applyAdj(v);
  return v;
}

// 一被加载就生效：页面第一次画出来时位置就是对的
applyAdj(readAdj());
