/*
 * Companion 面板（侧栏「查手机」上方）。
 * 实际界面在 ../companion/，这里只负责从外壳读到当前选中的是哪一页。
 */

import { CompanionApp } from "../companion/panel.jsx";
import { useSection } from "../section.jsx";

export function CompanionPanel() {
  const { itemId } = useSection();
  return <CompanionApp page={itemId} />;
}
