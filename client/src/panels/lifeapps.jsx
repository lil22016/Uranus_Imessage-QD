/*
 * 三个生活小 App 在 Uranus 里的入口（整屏打开，和 Companion / 一起听歌一样）。
 * 界面本体在 ../companion/apps/ —— Companion 里也能打开同一份。
 * 地图上的两个小头像默认用主屏幕上设置的那两个头像（useTheme），地图设置里也可以单独换。
 */

import { PeriodApp } from "../companion/apps/period.jsx";
import { FocusApp } from "../companion/apps/focus.jsx";
import { MapApp } from "../companion/apps/map.jsx";
import { useTheme } from "../phonehome.jsx";
import { useConfig } from "../store.jsx";

export function PeriodPanel({ onExit }) {
  return <PeriodApp onExit={onExit} />;
}

export function FocusPanel({ onExit }) {
  return <FocusApp onExit={onExit} />;
}

export function WhereaboutsPanel({ onExit }) {
  const theme = useTheme();
  const { config } = useConfig();
  return <MapApp onExit={onExit} avatars={{ role: theme.avatarRole, user: theme.avatarUser }} providers={config?.providers ?? []} />;
}
