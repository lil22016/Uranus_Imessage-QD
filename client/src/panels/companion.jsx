/*
 * Companion：整屏打开，自己带「日程 / 日记 / 动态 / 设置」底栏（和 Companion 网站是同一份界面）。
 * 不再套 Uranus 的顶栏、标题和侧栏；外壳（shell.jsx）把它铺满整个窗口，onExit 负责回到进来之前的地方。
 * 同时把 Uranus「连接」里的服务商列表递给它（图片生成、音乐可以直接选，不用再填一遍）。
 */

import { CompanionApp } from "../companion/panel.jsx";
import { useConfig } from "../store.jsx";

export function CompanionPanel({ onExit }) {
  const { config } = useConfig();
  return <CompanionApp standalone onExit={onExit} providers={config?.providers ?? []} />;
}
