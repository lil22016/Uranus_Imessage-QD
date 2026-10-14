/*
 * 4 位密码锁 + 登录门 + 两层 Provider 套壳，界面全在 shell.jsx。
 *
 * PinGate 在最外面：先过锁屏（pingate.jsx），过了才挂载下面这一整套。
 *
 * AuthGate 在 Provider **外面**：没登录的时候连 /api/config 都不该去拉
 * （那一条会被 401 挡掉，ConfigProvider 会把它当成「配置读不出来」，
 * 在登录页背后留一屏「无法加载配置」的错误态）。
 */

import { AuthGate } from "./panels/auth.jsx";
import { PinGate } from "./pingate.jsx";
import { AppShell } from "./shell.jsx";
import { ConfigProvider, LogProvider } from "./store.jsx";

export default function App() {
  return (
    <PinGate>
      <AuthGate>
        <ConfigProvider>
          <LogProvider>
            <AppShell />
          </LogProvider>
        </ConfigProvider>
      </AuthGate>
    </PinGate>
  );
}
