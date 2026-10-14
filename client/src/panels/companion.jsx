/*
 * Companion 面板（侧栏「查手机」上方）。
 * 实际界面在 ../companion/，这里只负责从外壳读到当前选中的是哪一页，
 * 以及把 Uranus「连接」里的服务商列表递给它（图片生成可以直接选，不用再填一遍）。
 */

import { CompanionApp } from "../companion/panel.jsx";
import { useSection } from "../section.jsx";
import { useConfig } from "../store.jsx";

export function CompanionPanel() {
  const { itemId } = useSection();
  const { config } = useConfig();
  return <CompanionApp page={itemId} providers={config?.providers ?? []} />;
}
